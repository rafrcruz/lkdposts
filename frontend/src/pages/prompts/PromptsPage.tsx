import type { CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  DraggableAttributes,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DropAnimation,
} from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  SortableContext,
  arrayMove,
  defaultAnimateLayoutChanges,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingSkeleton } from '@/components/feedback/LoadingSkeleton';
import { PROMPTS_QUERY_KEY } from '@/features/prompts/api/prompts';
import {
  useCreatePrompt,
  useDeletePrompt,
  usePromptList,
  useReorderPrompts,
  useUpdatePrompt,
} from '@/features/prompts/hooks/usePrompts';
import { derivePromptMove, normalizePromptOrder } from '@/features/prompts/utils/reorder';
import type { Prompt } from '@/features/prompts/types/prompt';
import { HttpError } from '@/lib/api/http';
import { clsx } from 'clsx';
import { PromptCard, type PromptCardRenderOptions } from './components/PromptCard';

const TITLE_LIMIT = 120;
const CONTENT_PREVIEW_LIMIT = 240;
const VIRTUALIZATION_THRESHOLD = 50;
const ESTIMATED_ITEM_HEIGHT = 196;
const DROP_ZONE_ID = 'prompts-reorder-dropzone';
const REORDER_DEBOUNCE_MS = 500;
const REORDER_ANIMATION_DURATION_MS = 180;
const REORDER_ANIMATION_EASING = 'cubic-bezier(0.22, 0.8, 0.36, 1)';
const DUPLICATE_SUFFIX = ' (c\u00F3pia)';

const arraysShallowEqual = (first: readonly string[], second: readonly string[]) => {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }

  return true;
};

type FormMode = 'create' | 'edit';

type FormErrors = {
  title?: string;
  content?: string;
};

type FeedbackAction = {
  label: string;
  onClick: () => void;
};

type Feedback = {
  type: 'success' | 'error';
  message: string;
  action?: FeedbackAction;
};

type ReorderMethod = 'pointer' | 'keyboard' | 'quick';

type ReorderSession = {
  promptId: string;
  startedAt: number;
  originIndex: number;
  method: ReorderMethod;
  listSize: number;
};

type ReorderCommitTelemetry = {
  promptId: string;
  fromIndex: number;
  toIndex: number;
  listSize: number;
  startedAt: number;
  method: ReorderMethod;
};

type ReorderOutcome = ReorderCommitTelemetry & {
  status: 'success' | 'error';
  errorMessage?: string;
};

type StatusFilter = 'all' | 'enabled' | 'disabled';

const resolveErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof HttpError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const shouldReportError = (error: unknown) => {
  return !(error instanceof HttpError && error.status === 401);
};

const logReorderEvent = (message: string, data: Record<string, unknown>) => {
  Sentry.addBreadcrumb({
    category: 'prompts.reorder',
    level: 'info',
    message,
    data,
  });
};

const PromptsPage = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  useEffect(() => {
    document.title = t('prompts.meta.title', 'lkdposts - Prompts');
    Sentry.addBreadcrumb({
      category: 'prompts',
      message: 'prompts:view_opened',
      level: 'info',
    });
  }, [t]);

  const promptList = usePromptList();
  const refetchPromptList = useCallback(() => {
    try {
      const result = promptList.refetch();
      if (result && typeof (result as PromiseLike<unknown>).catch === 'function') {
        return (result as PromiseLike<unknown>).catch((error) => {
          console.error('[PromptsPage] Failed to refetch prompts', error);
        });
      }

      return Promise.resolve(result);
    } catch (error) {
      console.error('[PromptsPage] Failed to refetch prompts', error);
      return Promise.resolve(undefined);
    }
  }, [promptList]);
  const createPrompt = useCreatePrompt();
  const updatePrompt = useUpdatePrompt();
  const deletePrompt = useDeletePrompt();
  const reorderPrompts = useReorderPrompts();

  const prompts = useMemo(() => promptList.data ?? [], [promptList.data]);
  const isLoading = promptList.isLoading && !promptList.isFetched;
  const isError = promptList.isError;

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [reorderUndoState, setReorderUndoState] = useState<ReorderUndoState | null>(null);
  const reorderUndoStateRef = useRef<ReorderUndoState | null>(reorderUndoState);
  const updateReorderUndoState = (value: ReorderUndoState | null) => {
    reorderUndoStateRef.current = value;
    setReorderUndoState(value);
  };
  useEffect(() => {
    reorderUndoStateRef.current = reorderUndoState;
  }, [reorderUndoState]);
  const [hasReorderSaveQueued, setHasReorderSaveQueued] = useState(false);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(new Set());
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const listContainerBoundsRef = useRef<{ top: number; bottom: number } | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const exportTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastFetchErrorRef = useRef<unknown>(null);
  const reorderPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReorderRef = useRef<{ nextIds: string[]; previousIds: string[] } | null>(null);
  const activeReorderRequestIdRef = useRef(0);
  const dragStartOrderRef = useRef<string[] | null>(null);
  const activeOverlayDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const keyboardStartOrderRef = useRef<string[] | null>(null);
  const announce = useCallback((message: string) => {
    setLiveAnnouncement((previous) => (previous === message ? `${message} ` : message));
  }, []);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredPrompts = prompts.filter((prompt) => {
    const matchesStatus =
      statusFilter === 'all' || (statusFilter === 'enabled' ? prompt.enabled : !prompt.enabled);
    if (!matchesStatus) {
      return false;
    }

    if (normalizedSearch.length === 0) {
      return true;
    }

    const titleMatch = prompt.title.toLowerCase().includes(normalizedSearch);
    const contentMatch = prompt.content.toLowerCase().includes(normalizedSearch);

    return titleMatch || contentMatch;
  });

  const promptIdList = useMemo(() => filteredPrompts.map((prompt) => prompt.id), [filteredPrompts]);
  const allPromptIds = useMemo(() => prompts.map((prompt) => prompt.id), [prompts]);
  const [visibleOrder, setVisibleOrder] = useState<string[]>(promptIdList);
  const [baselineOrder, setBaselineOrder] = useState<string[]>(promptIdList);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [keyboardActiveId, setKeyboardActiveId] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const isSorting = activeId !== null;
  const visibleOrderRef = useRef(visibleOrder);
  const baselineOrderRef = useRef(baselineOrder);
  const sortedIdsRef = visibleOrderRef;
  const setSortedIds = setVisibleOrder;
  const reorderSessionRef = useRef<ReorderSession | null>(null);
  const pendingCommitTelemetryRef = useRef<ReorderCommitTelemetry | null>(null);
  const lastReorderOutcomeRef = useRef<ReorderOutcome | null>(null);

  useEffect(() => {
    visibleOrderRef.current = visibleOrder;
  }, [visibleOrder]);

  useEffect(() => {
    baselineOrderRef.current = baselineOrder;
  }, [baselineOrder]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    if (!isSorting) {
      return;
    }

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';

    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isSorting]);

  const resolveCommitTelemetry = (): ReorderCommitTelemetry | null => {
    if (pendingCommitTelemetryRef.current) {
      return pendingCommitTelemetryRef.current;
    }

    const session = reorderSessionRef.current;
    if (!session) {
      return null;
    }

    return {
      promptId: session.promptId,
      fromIndex: session.originIndex,
      toIndex: session.originIndex,
      listSize: session.listSize,
      startedAt: session.startedAt,
      method: session.method,
    } satisfies ReorderCommitTelemetry;
  };

  const startReorderSession = (promptId: string, originIndex: number, method: ReorderMethod) => {
    if (originIndex < 0) {
      reorderSessionRef.current = null;
      pendingCommitTelemetryRef.current = null;
      return;
    }

    const listSize = sortedIdsRef.current.length;
    reorderSessionRef.current = {
      promptId,
      startedAt: Date.now(),
      originIndex,
      method,
      listSize,
    };
    pendingCommitTelemetryRef.current = null;

    logReorderEvent('prompt_reorder_start', {
      promptId,
      originPosition: originIndex + 1,
      listSize,
      itemsCount: 1,
      method,
    });
  };

  const prepareCommitTelemetry = (nextIds: string[], previousIds: string[]) => {
    const session = reorderSessionRef.current;
    const movement = derivePromptMove(previousIds, nextIds, session?.promptId ?? null);

    if (!movement) {
      pendingCommitTelemetryRef.current = null;
      return;
    }

    pendingCommitTelemetryRef.current = {
      promptId: movement.promptId,
      fromIndex: movement.fromIndex,
      toIndex: movement.toIndex,
      listSize: sortedIdsRef.current.length,
      startedAt: session?.startedAt ?? Date.now(),
      method: session?.method ?? 'quick',
    };
  };

  const emitReorderCommit = () => {
    const telemetry = resolveCommitTelemetry();
    if (!telemetry) {
      reorderSessionRef.current = null;
      pendingCommitTelemetryRef.current = null;
      return;
    }

    const durationMs = Math.max(0, Date.now() - telemetry.startedAt);
    logReorderEvent('prompt_reorder_commit', {
      promptId: telemetry.promptId,
      originPosition: telemetry.fromIndex + 1,
      destinationPosition: telemetry.toIndex + 1,
      durationMs,
      listSize: telemetry.listSize,
      itemsCount: 1,
      method: telemetry.method,
    });

    lastReorderOutcomeRef.current = { ...telemetry, status: 'success' };
    reorderSessionRef.current = null;
    pendingCommitTelemetryRef.current = null;
  };

  const emitReorderError = (errorMessage: string | null) => {
    const telemetry = resolveCommitTelemetry();
    if (!telemetry) {
      reorderSessionRef.current = null;
      pendingCommitTelemetryRef.current = null;
      return;
    }

    const durationMs = Math.max(0, Date.now() - telemetry.startedAt);
    logReorderEvent('prompt_reorder_error', {
      promptId: telemetry.promptId,
      originPosition: telemetry.fromIndex + 1,
      destinationPosition: telemetry.toIndex + 1,
      durationMs,
      listSize: telemetry.listSize,
      itemsCount: 1,
      method: telemetry.method,
      errorMessage: errorMessage ?? undefined,
    });

    lastReorderOutcomeRef.current = {
      ...telemetry,
      status: 'error',
      errorMessage: errorMessage ?? undefined,
    };
    reorderSessionRef.current = null;
    pendingCommitTelemetryRef.current = null;
  };

  const cancelReorderTelemetry = () => {
    reorderSessionRef.current = null;
    pendingCommitTelemetryRef.current = null;
  };
  const promptMap = useMemo(() => {
    const map = new Map<string, Prompt>();
    filteredPrompts.forEach((prompt) => {
      map.set(prompt.id, prompt);
    });
    return map;
  }, [filteredPrompts]);
  const orderedPrompts = useMemo(() => {
    return visibleOrder
      .map((id) => promptMap.get(id))
      .filter((prompt): prompt is Prompt => Boolean(prompt));
  }, [promptMap, visibleOrder]);
  const shouldVirtualize = false; // Temporarily disable virtualization to ensure DnD collisions work reliably
  const isReorderEnabled = normalizedSearch.length === 0 && statusFilter === 'all';
  const isReorderPending = reorderPrompts.isPending || hasReorderSaveQueued;
  const canReorder = isReorderEnabled;

  useEffect(() => {
    console.log('[REORDER] canReorder computed', {
      canReorder,
      statusFilter,
      searchLength: normalizedSearch.length,
    });
  }, [canReorder, statusFilter, normalizedSearch]);

  const showForceSaveButton =
    canReorder && dirty && !arraysShallowEqual(visibleOrder, baselineOrder);

  const activePrompt = useMemo(() => {
    if (!activeId) {
      return null;
    }

    return prompts.find((item) => item.id === activeId) ?? null;
  }, [activeId, prompts]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const { setNodeRef: setDropZoneRef, isOver: isDropZoneOver } = useDroppable({
    id: DROP_ZONE_ID,
    disabled: !canReorder,
  });
  const dropAnimation = useMemo<DropAnimation>(
    () => ({
      duration: REORDER_ANIMATION_DURATION_MS,
      easing: REORDER_ANIMATION_EASING,
      dragSourceOpacity: 0.35,
    }),
    [],
  );
  const getVirtualItemKey = useCallback(
    (index: number) => orderedPrompts[index]?.id ?? index,
    [orderedPrompts],
  );

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? orderedPrompts.length : 0,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 8,
    getItemKey: getVirtualItemKey,
  });

  useEffect(() => {
    if (!isSorting) {
      return;
    }

    const container = listContainerRef.current;
    if (!container) {
      return;
    }

    const SCROLL_MARGIN = 72;
    const SCROLL_STEP = 18;

    const updateBounds = () => {
      const rect = container.getBoundingClientRect();
      listContainerBoundsRef.current = { top: rect.top, bottom: rect.bottom };
    };

    updateBounds();

    const handleContainerScroll = () => {
      updateBounds();
    };

    const handleWindowResize = () => {
      updateBounds();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = listContainerBoundsRef.current;

      if (!bounds) {
        updateBounds();
        return;
      }

      if (event.clientY < bounds.top + SCROLL_MARGIN) {
        container.scrollBy({ top: -SCROLL_STEP, behavior: 'auto' });
        return;
      }

      if (event.clientY > bounds.bottom - SCROLL_MARGIN) {
        container.scrollBy({ top: SCROLL_STEP, behavior: 'auto' });
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('resize', handleWindowResize);
    container.addEventListener('scroll', handleContainerScroll, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleWindowResize);
      container.removeEventListener('scroll', handleContainerScroll);
      listContainerBoundsRef.current = null;
    };
  }, [isSorting]);

  useEffect(() => {
    if (isSorting || reorderPrompts.isPending || dirty) {
      return;
    }

    const nextIds = promptIdList;
    if (arraysShallowEqual(baselineOrderRef.current, nextIds) && arraysShallowEqual(visibleOrderRef.current, nextIds)) {
      return;
    }

    const nextVisible = [...nextIds];
    const nextBaseline = [...nextIds];
    setVisibleOrder(nextVisible);
    setBaselineOrder(nextBaseline);
    visibleOrderRef.current = [...nextVisible];
    baselineOrderRef.current = [...nextBaseline];
    setDirty(false);
    setActiveId(null);
  }, [dirty, isSorting, reorderPrompts.isPending, promptIdList]);

  useEffect(() => {
    if (!promptList.error || !shouldReportError(promptList.error)) {
      lastFetchErrorRef.current = promptList.error ?? null;
      return;
    }

    if (lastFetchErrorRef.current === promptList.error) {
      return;
    }

    lastFetchErrorRef.current = promptList.error;
    Sentry.captureException(promptList.error, {
      tags: { feature: 'prompts', action: 'fetch' },
    });
  }, [promptList.error]);

  useEffect(() => {
    if (pendingScrollId === null) {
      return;
    }

    const element = itemRefs.current.get(pendingScrollId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.focus({ preventScroll: true });
      setPendingScrollId(null);
      return;
    }

    const isVisible = orderedPrompts.some((item) => item.id === pendingScrollId);
    if (!isVisible) {
      setPendingScrollId(null);
      return;
    }

    if (!shouldVirtualize) {
      return;
    }

    const index = orderedPrompts.findIndex((item) => item.id === pendingScrollId);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center' });
      return;
    }

    setPendingScrollId(null);
  }, [
    pendingScrollId,
    normalizedSearch,
    orderedPrompts,
    orderedPrompts.length,
    shouldVirtualize,
    statusFilter,
    virtualizer,
  ]);

  useEffect(() => {
    if (!contentInputRef.current) {
      return;
    }

    const textarea = contentInputRef.current;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [contentInput, formMode, isContentExpanded]);

  useEffect(() => {
    if (!shouldVirtualize) {
      return;
    }

    virtualizer.measure();
  }, [
    shouldVirtualize,
    virtualizer,
    expandedPromptIds,
    orderedPrompts.length,
    normalizedSearch,
    statusFilter,
    isSorting,
  ]);

  useEffect(() => {
    return () => {
      if (reorderPersistTimeoutRef.current !== null) {
        clearTimeout(reorderPersistTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedPromptIds((current) => {
      const next = new Set<string>();
      prompts.forEach((prompt) => {
        if (current.has(prompt.id)) {
          next.add(prompt.id);
        }
      });

      if (next.size === current.size && Array.from(current).every((id) => next.has(id))) {
        return current;
      }

      return next;
    });
  }, [prompts]);

  useEffect(() => {
    if (!isExportModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsExportModalOpen(false);
        setCopyStatus('idle');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExportModalOpen]);

  useEffect(() => {
    if (!isExportModalOpen || !exportTextareaRef.current) {
      return;
    }

    const textarea = exportTextareaRef.current;
    textarea.focus();
    textarea.select();
  }, [isExportModalOpen, exportTextareaRef]);

  const resetForm = () => {
    setFormMode(null);
    setEditingPrompt(null);
    setTitleInput('');
    setContentInput('');
    setFormErrors({});
    setIsContentExpanded(false);
  };

  const handleOpenCreateForm = () => {
    setFeedback(null);
    setFormMode('create');
    setEditingPrompt(null);
    setTitleInput('');
    setContentInput('');
    setFormErrors({});
    setIsContentExpanded(false);
  };

  const handleOpenEditForm = (prompt: Prompt) => {
    setFeedback(null);
    setFormMode('edit');
    setEditingPrompt(prompt);
    setTitleInput(prompt.title);
    setContentInput(prompt.content);
    setFormErrors({});
    setIsContentExpanded(false);
  };

  const handleCancelForm = () => {
    resetForm();
  };

  const registerItemRef = (id: string) => (element: HTMLDivElement | null) => {
    if (!element) {
      itemRefs.current.delete(id);
      return;
    }

    itemRefs.current.set(id, element);
  };

  const measurePromptDimensions = (promptId: string) => {
    const element = itemRefs.current.get(promptId);

    if (!element) {
      activeOverlayDimensionsRef.current = null;
      return;
    }

    const rect = element.getBoundingClientRect();
    activeOverlayDimensionsRef.current = { width: rect.width, height: rect.height };
  };

  const clearActiveOverlayDimensions = () => {
    activeOverlayDimensionsRef.current = null;
  };

  const togglePromptExpansion = (promptId: string) => {
    setExpandedPromptIds((current) => {
      const next = new Set(current);
      if (next.has(promptId)) {
        next.delete(promptId);
      } else {
        next.add(promptId);
      }

      return next;
    });
  };

  const handleToggleContentFieldSize = () => {
    setIsContentExpanded((previous) => !previous);
  };

  const handleTogglePromptSelection = (promptId: string, checked: boolean) => {
    setSelectedPromptIds((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(promptId);
      } else {
        next.delete(promptId);
      }

      return next;
    });
  };

  const handleToggleEnabled = (prompt: Prompt, nextEnabled: boolean) => {
    setFeedback(null);

    updatePrompt.mutate(
      { id: prompt.id, enabled: nextEnabled },
      {
        onSuccess: (updated) => {
          setFeedback({
            type: 'success',
            message: nextEnabled
              ? t('prompts.feedback.enabled', 'Prompt enabled.')
              : t('prompts.feedback.disabled', 'Prompt disabled.'),
          });
          setPendingScrollId(updated.id);
        },
        onError: (error) => {
          setFeedback({
            type: 'error',
            message: resolveErrorMessage(
              error,
              t('prompts.feedback.error', 'The operation failed. Try again.'),
            ),
          });
          reportError('toggle', error, { promptId: prompt.id, enabled: nextEnabled });
        },
      },
    );
  };

  const handleOpenExportModal = () => {
    setCopyStatus('idle');
    setIsExportModalOpen(true);
  };

  const handleCloseExportModal = () => {
    setIsExportModalOpen(false);
    setCopyStatus('idle');
  };

  const handleCopyExportContent = async (content: string) => {
    if (!content) {
      setCopyStatus('error');
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopyStatus('success');
    } catch {
      setCopyStatus('error');
    }
  };

  const validateForm = (): { errors: FormErrors; title: string; content: string } => {
    const errors: FormErrors = {};
    const trimmedTitle = titleInput.trim();
    const trimmedContent = contentInput.trim();

    if (!trimmedTitle) {
      errors.title = t('prompts.form.errors.titleRequired', 'Enter a title.');
    } else if (trimmedTitle.length > TITLE_LIMIT) {
      errors.title = t('prompts.form.errors.titleMax', 'Title must be 120 characters or fewer.');
    }

    if (!trimmedContent) {
      errors.content = t('prompts.form.errors.contentRequired', 'Enter the prompt content.');
    }

    setFormErrors(errors);

    return { errors, title: trimmedTitle, content: trimmedContent };
  };

  const reportError = (
    action: 'create' | 'update' | 'delete' | 'reorder' | 'duplicate' | 'toggle',
    error: unknown,
    extra: Record<string, unknown>,
  ) => {
    if (!shouldReportError(error)) {
      return;
    }

    const capturedError = error instanceof Error ? error : new Error('Prompts operation failed');

    Sentry.captureException(capturedError, {
      tags: { feature: 'prompts', action },
      extra,
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formMode) {
      return;
    }

    const { errors, title, content } = validateForm();
    if (Object.keys(errors).length > 0) {
      return;
    }

    setFeedback(null);

    if (formMode === 'create') {
      createPrompt.mutate(
        { title, content },
        {
          onSuccess: (created) => {
            setFeedback({
              type: 'success',
              message: t('prompts.feedback.created', 'Prompt created successfully.'),
            });
            setPendingScrollId(created.id);
            resetForm();
          },
          onError: (error) => {
            setFeedback({
              type: 'error',
              message: resolveErrorMessage(
                error,
                t('prompts.feedback.error', 'The operation failed. Try again.'),
              ),
            });
            reportError('create', error, {
              titleLength: title.length,
              contentLength: content.length,
            });
          },
        },
      );
      return;
    }

    if (!editingPrompt) {
      return;
    }

    updatePrompt.mutate(
      { id: editingPrompt.id, title, content },
      {
        onSuccess: (updated) => {
          setFeedback({
            type: 'success',
            message: t('prompts.feedback.updated', 'Prompt updated successfully.'),
          });
          setPendingScrollId(updated.id);
          resetForm();
        },
        onError: (error) => {
          setFeedback({
            type: 'error',
            message: resolveErrorMessage(
              error,
              t('prompts.feedback.error', 'The operation failed. Try again.'),
            ),
          });
          reportError('update', error, {
            promptId: editingPrompt.id,
            titleLength: title.length,
            contentLength: content.length,
          });
        },
      },
    );
  };

  const handleDeletePrompt = (prompt: Prompt) => {
    const confirmed = window.confirm(
      t('prompts.delete.confirm', 'Are you sure you want to delete this prompt?'),
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);

    deletePrompt.mutate(prompt.id, {
      onSuccess: () => {
        setFeedback({
          type: 'success',
          message: t('prompts.feedback.deleted', 'Prompt deleted successfully.'),
        });
        setExpandedPromptIds((current) => {
          if (!current.has(prompt.id)) {
            return current;
          }

          const next = new Set(current);
          next.delete(prompt.id);
          return next;
        });
        if (editingPrompt?.id === prompt.id) {
          resetForm();
        }
      },
      onError: (error) => {
        setFeedback({
          type: 'error',
          message: resolveErrorMessage(
            error,
            t('prompts.feedback.error', 'The operation failed. Try again.'),
          ),
        });
        reportError('delete', error, { promptId: prompt.id });
      },
    });
  };

  const handleDuplicatePrompt = (prompt: Prompt) => {
    const duplicatedTitle = `${prompt.title}${DUPLICATE_SUFFIX}`;
    const nextPosition = prompts.reduce((max, item) => Math.max(max, item.position), -1) + 1;

    setFeedback(null);

    createPrompt.mutate(
      { title: duplicatedTitle, content: prompt.content, position: nextPosition },
      {
        onSuccess: (created) => {
          setFeedback({
            type: 'success',
            message: t('prompts.feedback.duplicated', 'Prompt duplicated successfully.'),
          });
          setPendingScrollId(created.id);
        },
        onError: (error) => {
          setFeedback({
            type: 'error',
            message: resolveErrorMessage(
              error,
              t('prompts.feedback.error', 'The operation failed. Try again.'),
            ),
          });
          reportError('duplicate', error, {
            promptId: prompt.id,
            titleLength: duplicatedTitle.length,
            contentLength: prompt.content.length,
          });
        },
      },
    );
  };

  const cancelScheduledReorderPersist = () => {
    if (reorderPersistTimeoutRef.current !== null) {
      clearTimeout(reorderPersistTimeoutRef.current);
      reorderPersistTimeoutRef.current = null;
    }

    pendingReorderRef.current = null;
    setHasReorderSaveQueued(false);
  };

  const handleUndoReorder = () => {
    const undoState = reorderUndoStateRef.current;
    if (!undoState) {
      return;
    }

    cancelScheduledReorderPersist();

    const { previousIds, previousPrompts } = undoState;
    const normalizedPrevious = normalizePromptOrder(previousPrompts);

    const restoredVisible = [...previousIds];
    const restoredBaseline = [...previousIds];
    setVisibleOrder(restoredVisible);
    setBaselineOrder(restoredBaseline);
    visibleOrderRef.current = [...restoredVisible];
    baselineOrderRef.current = [...restoredBaseline];
    setDirty(false);
    updateReorderUndoState(null);

    queryClient.setQueryData(PROMPTS_QUERY_KEY, normalizedPrevious);

    setFeedback({
      type: 'success',
      message: t('prompts.reorder.undoSuccess', 'Prompt order restored.'),
    });

    const outcome = lastReorderOutcomeRef.current;
    if (outcome) {
      const undoDurationMs = Math.max(0, Date.now() - outcome.startedAt);
      logReorderEvent('prompt_reorder_undo', {
        promptId: outcome.promptId,
        originPosition: outcome.fromIndex + 1,
        destinationPosition: outcome.toIndex + 1,
        listSize: outcome.listSize,
        itemsCount: 1,
        method: outcome.method,
        durationMs: undoDurationMs,
        revertedError: outcome.status === 'error',
      });
    } else {
      logReorderEvent('prompt_reorder_undo', {
        listSize: previousIds.length,
        itemsCount: previousIds.length > 0 ? 1 : 0,
      });
    }
    lastReorderOutcomeRef.current = null;

    refetchPromptList();
  };

  const persistReorder = async (previousIds: string[], nextIds: string[]) => {
    const completeNextIds = completeOrder(nextIds);
    const completePreviousIds = completeOrder(previousIds);

    console.log('[REORDER] persistReorder sizes', {
      allPromptIdsLength: allPromptIds.length,
      completeNextIdsLength: completeNextIds.length,
      completePreviousIdsLength: completePreviousIds.length,
    });

    if (completeNextIds.length !== allPromptIds.length) {
      setHasReorderSaveQueued(false);
      console.log('[REORDER] persistReorder skipped: length mismatch', {
        expectedLength: allPromptIds.length,
        completeNextIdsLength: completeNextIds.length,
      });
      return;
    }

    const itemsById = new Map(prompts.map((item) => [item.id, item] as const));
    const nextPrompts = completeNextIds
      .map((id) => itemsById.get(id))
      .filter((item): item is Prompt => Boolean(item));

    if (nextPrompts.length !== prompts.length) {
      setHasReorderSaveQueued(false);
      console.log('[REORDER] persistReorder skipped: prompt mismatch', {
        nextPromptsLength: nextPrompts.length,
        expectedPromptsLength: prompts.length,
      });
      return;
    }

    const normalizedNext = normalizePromptOrder(nextPrompts);
    const previousPrompts = completePreviousIds
      .map((id) => itemsById.get(id))
      .filter((item): item is Prompt => Boolean(item));
    const normalizedPrevious = normalizePromptOrder(previousPrompts);

    const payloadItems = normalizedNext.map((item) => ({ id: item.id, position: item.position }));

    console.log('[REORDER] persist payload', {
      items: payloadItems,
      previousIds: completePreviousIds,
      nextIds: completeNextIds,
    });

    const requestId = activeReorderRequestIdRef.current + 1;
    activeReorderRequestIdRef.current = requestId;

    setFeedback(null);
    updateReorderUndoState(null);
    setHasReorderSaveQueued(false);

    try {
      const serverPrompts = await reorderPrompts.mutateAsync(normalizedNext);
      const serverIds = serverPrompts.map((item) => item.id);

      console.log('[REORDER] persistReorder response', {
        serverIds,
        requestId,
      });

      if (activeReorderRequestIdRef.current !== requestId) {
        return;
      }

      const requestedSet = new Set(completeNextIds);
      const serverSet = new Set(serverIds);
      const missingInServer = completeNextIds.filter((id) => !serverSet.has(id));

      if (missingInServer.length > 0) {
        const normalizedServer = normalizePromptOrder(serverPrompts);
        queryClient.setQueryData(PROMPTS_QUERY_KEY, normalizedServer);
        const conflictIds = normalizedServer.map((item) => item.id);
        const conflictVisible = [...conflictIds];
        const conflictBaseline = [...conflictIds];
        setVisibleOrder(conflictVisible);
        setBaselineOrder(conflictBaseline);
        visibleOrderRef.current = [...conflictVisible];
        baselineOrderRef.current = [...conflictBaseline];
        setDirty(false);
        setFeedback({
          type: 'error',
          message: t(
            'prompts.reorder.conflict',
            'Prompt order changed in another session. Reload?',
          ),
          action: {
            label: t('prompts.reorder.reload', 'Reload'),
            onClick: () => {
              refetchPromptList();
            },
          },
        });
        emitReorderError('conflict');
        return;
      }

      const requestedIntersection = completeNextIds.filter((id) => serverSet.has(id));
      const serverOnlyIds = serverIds.filter((id) => !requestedSet.has(id));
      const finalIds = [...requestedIntersection, ...serverOnlyIds];
      const serverMap = new Map(serverPrompts.map((item) => [item.id, item] as const));
      const finalPrompts = finalIds
        .map((id, index) => {
          const prompt = serverMap.get(id);
          if (!prompt) {
            return null;
          }

          return { ...prompt, position: index + 1 };
        })
        .filter((item): item is Prompt => Boolean(item));

      queryClient.setQueryData(PROMPTS_QUERY_KEY, finalPrompts);
      const finalVisible = [...finalIds];
      const finalBaseline = [...finalIds];
      setVisibleOrder(finalVisible);
      setBaselineOrder(finalBaseline);
      visibleOrderRef.current = [...finalVisible];
      baselineOrderRef.current = [...finalBaseline];
      setDirty(false);
      emitReorderCommit();
      setFeedback({
        type: 'success',
        message: t('prompts.feedback.reordered', 'Ordem salva.'),
      });
    } catch (error) {
      console.error('[REORDER][error] persistReorder failed', error);

      if (activeReorderRequestIdRef.current !== requestId) {
        return;
      }

      updateReorderUndoState({ previousIds: completePreviousIds, previousPrompts: normalizedPrevious });

      const errorMessage = resolveErrorMessage(
        error,
        t('prompts.reorder.error', 'We could not reorder the prompts. Try again.'),
      );

      setFeedback({
        type: 'error',
        message: errorMessage,
        action: {
          label: t('prompts.reorder.undo', 'Undo'),
          onClick: handleUndoReorder,
        },
      });

      reportError('reorder', error, { promptIds: normalizedNext.map((item) => item.id) });
      emitReorderError(errorMessage);
      throw error;
    }
  };

  const completeOrder = useCallback(
    (partial: readonly string[]) => {
      if (allPromptIds.length === 0) {
        return [] as string[];
      }

      const allowedIds = new Set(allPromptIds);
      const seen = new Set<string>();
      const result: string[] = [];

      for (const id of partial) {
        if (!allowedIds.has(id) || seen.has(id)) {
          continue;
        }

        seen.add(id);
        result.push(id);
      }

      for (const id of allPromptIds) {
        if (seen.has(id)) {
          continue;
        }

        seen.add(id);
        result.push(id);
      }

      return result;
    },
    [allPromptIds],
  );

  const scheduleReorderPersist = (nextIds: string[], previousIds: string[]) => {
    const completeNextIds = completeOrder(nextIds);
    const completePreviousIds = completeOrder(previousIds);

    if (completeNextIds.length !== allPromptIds.length) {
      return;
    }

    if (arraysShallowEqual(completeNextIds, completePreviousIds)) {
      return;
    }

    console.log('[REORDER] scheduleReorderPersist', {
      previousIds: completePreviousIds,
      nextIds: completeNextIds,
    });

    cancelScheduledReorderPersist();

    setFeedback(null);
    updateReorderUndoState(null);
    setHasReorderSaveQueued(true);
    prepareCommitTelemetry(completeNextIds, completePreviousIds);

    pendingReorderRef.current = {
      nextIds: [...completeNextIds],
      previousIds: [...completePreviousIds],
    };

    setDirty(true);

    console.log('[REORDER] scheduleReorderPersist scheduling debounce', {
      delayMs: REORDER_DEBOUNCE_MS,
    });

    reorderPersistTimeoutRef.current = setTimeout(() => {
      const payload = pendingReorderRef.current;
      reorderPersistTimeoutRef.current = null;
      pendingReorderRef.current = null;

      if (!payload) {
        return;
      }

      console.log('[REORDER] scheduleReorderPersist debounce payload', {
        nextIds: payload.nextIds,
        previousIds: payload.previousIds,
      });

      persistReorder(payload.previousIds, payload.nextIds).catch(() => {});
    }, REORDER_DEBOUNCE_MS);
  };

  const handleForceSaveClick = () => {
    if (!canReorder) {
      return;
    }

    cancelScheduledReorderPersist();

    const nextIds = [...sortedIdsRef.current];
    const previousIds = [...baselineOrderRef.current];

    console.log('[REORDER] Forçar salvar ordem clicado', {
      nextIds,
      previousIds,
    });

    persistReorder(previousIds, nextIds).catch(() => {});
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event?.active?.id ? String(event.active.id) : null;

    setActiveId(id);
    console.log('[REORDER] handleDragStart', {
      activeId: id,
      currentOrder: [...visibleOrderRef.current],
    });

    cancelScheduledReorderPersist();
    updateReorderUndoState(null);

    if (!id) {
      return;
    }

    dragStartOrderRef.current = [...visibleOrderRef.current];
    keyboardStartOrderRef.current = null;
    setKeyboardActiveId(null);

    measurePromptDimensions(id);

    if (!canReorder) {
      return;
    }

    startReorderSession(id, visibleOrderRef.current.indexOf(id), 'pointer');
  };

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event?.over?.id ? String(event.over.id) : null;
    const currActive = event?.active?.id ? String(event.active.id) : null;

    console.log('[REORDER] onDragOver', { overId });

    if (!overId || !currActive || overId === currActive) {
      return;
    }

    const currentOrder = visibleOrderRef.current;
    const oldIndex = currentOrder.indexOf(currActive);

    if (oldIndex === -1) {
      return;
    }

    let newIndex: number | null = null;

    if (overId === DROP_ZONE_ID) {
      newIndex = currentOrder.length - 1;
    } else {
      newIndex = currentOrder.indexOf(overId);
      if (newIndex === -1) {
        return;
      }
    }

    if (newIndex === oldIndex) {
      return;
    }

    const next = arrayMove(currentOrder, oldIndex, newIndex);

    setVisibleOrder(next);
    visibleOrderRef.current = next;
    setDirty(true);

    console.log('[REORDER] optimistically moved', {
      currActive,
      overId,
      oldIndex,
      newIndex,
      next,
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const currActive = event?.active?.id ? String(event.active.id) : null;
    const overId = event?.over?.id ? String(event.over.id) : null;
    const startingOrder = [...baselineOrderRef.current];
    const nextOrder = [...visibleOrderRef.current];
    const moved = dirty && !arraysShallowEqual(nextOrder, startingOrder);

    console.log('[REORDER] handleDragEnd', {
      activeId: currActive,
      overId,
      startingOrder,
      nextOrder,
      canReorder,
      moved,
    });

    setActiveId(null);
    setKeyboardActiveId(null);
    dragStartOrderRef.current = null;
    keyboardStartOrderRef.current = null;
    clearActiveOverlayDimensions();

    if (!canReorder || !moved) {
      setVisibleOrder(startingOrder);
      visibleOrderRef.current = startingOrder;
      setDirty(false);
      console.log('[REORDER] no-op, restoring baseline');
      return;
    }

    try {
      console.log('[REORDER] scheduling persist...');
      await persistReorder(startingOrder, nextOrder);
      const persistedOrder = [...nextOrder];
      setBaselineOrder(persistedOrder);
      baselineOrderRef.current = [...persistedOrder];
      setDirty(false);
      console.log('[REORDER] persisted successfully');
    } catch (error) {
      console.log('[REORDER][error] persist failed', error);
      setDirty(true);
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setKeyboardActiveId(null);
    cancelScheduledReorderPersist();
    cancelReorderTelemetry();
    const fallbackOrder = dragStartOrderRef.current ?? baselineOrderRef.current ?? promptIdList;
    const restored = [...fallbackOrder];
    setVisibleOrder(restored);
    visibleOrderRef.current = restored;
    setDirty(false);
    dragStartOrderRef.current = null;
    keyboardStartOrderRef.current = null;
    clearActiveOverlayDimensions();
  };

  const handleMovePrompt = (promptId: string, direction: 'up' | 'down') => {
    if (!canReorder) {
      return;
    }

    setSortedIds((current) => {
      const currentIndex = current.indexOf(promptId);

      if (currentIndex === -1) {
        return current;
      }

      const targetIndex =
        direction === 'up'
          ? Math.max(currentIndex - 1, 0)
          : Math.min(currentIndex + 1, current.length - 1);

      if (targetIndex === currentIndex) {
        return current;
      }

      startReorderSession(promptId, currentIndex, 'quick');
      const nextOrder = arrayMove(current, currentIndex, targetIndex);

      scheduleReorderPersist(nextOrder, current);
      const prompt = promptMap.get(promptId);
      if (prompt) {
        announce(
          t('prompts.reorder.keyboardMoved', {
            title: prompt.title,
            position: targetIndex + 1,
            total: nextOrder.length,
          }),
        );
      }
      return nextOrder;
    });
  };

  const isActivationKey = (key: string) => key === 'Enter' || key === ' ';

  const grabPromptForKeyboard = (prompt: Prompt) => {
    cancelScheduledReorderPersist();
    updateReorderUndoState(null);
    const currentOrder = [...sortedIdsRef.current];
    dragStartOrderRef.current = currentOrder;
    keyboardStartOrderRef.current = currentOrder;
    setKeyboardActiveId(prompt.id);
    setActiveId(prompt.id);
    measurePromptDimensions(prompt.id);
    startReorderSession(prompt.id, currentOrder.indexOf(prompt.id), 'keyboard');
    announce(
      t('prompts.reorder.keyboardGrabbed', {
        title: prompt.title,
      }),
    );
  };

  const cancelKeyboardReorder = (prompt: Prompt) => {
    cancelScheduledReorderPersist();
    const startingOrder = keyboardStartOrderRef.current;
    if (startingOrder) {
      setSortedIds([...startingOrder]);
    }
    setKeyboardActiveId(null);
    setActiveId(null);
    dragStartOrderRef.current = null;
    keyboardStartOrderRef.current = null;
    cancelReorderTelemetry();
    clearActiveOverlayDimensions();
    announce(
      t('prompts.reorder.keyboardCancelled', {
        title: prompt.title,
      }),
    );
  };

  const finalizeKeyboardReorder = (prompt: Prompt) => {
    const baselineOrder = keyboardStartOrderRef.current ?? sortedIdsRef.current;
    const currentOrder = [...sortedIdsRef.current];
    setKeyboardActiveId(null);
    setActiveId(null);
    dragStartOrderRef.current = null;
    keyboardStartOrderRef.current = null;
    clearActiveOverlayDimensions();

    if (!arraysShallowEqual(currentOrder, baselineOrder)) {
      scheduleReorderPersist([...currentOrder], [...baselineOrder]);
      announce(
        t('prompts.reorder.keyboardDropped', {
          title: prompt.title,
          position: currentOrder.indexOf(prompt.id) + 1,
          total: currentOrder.length,
        }),
      );
    } else {
      announce(
        t('prompts.reorder.keyboardCancelled', {
          title: prompt.title,
        }),
      );
    }
  };

  const movePromptWithKeyboard = (prompt: Prompt, direction: 'up' | 'down') => {
    setSortedIds((current) => {
      const currentIndex = current.indexOf(prompt.id);

      if (currentIndex === -1) {
        return current;
      }

      const targetIndex =
        direction === 'up'
          ? Math.max(currentIndex - 1, 0)
          : Math.min(currentIndex + 1, current.length - 1);

      if (targetIndex === currentIndex) {
        announce(
          direction === 'up'
            ? t('prompts.reorder.keyboardAtStart', 'Item is already in the first position.')
            : t('prompts.reorder.keyboardAtEnd', 'Item is already in the last position.'),
        );
        return current;
      }

      const nextOrder = arrayMove(current, currentIndex, targetIndex);
      announce(
        t('prompts.reorder.keyboardMoved', {
          title: prompt.title,
          position: targetIndex + 1,
          total: nextOrder.length,
        }),
      );
      return nextOrder;
    });
  };

  const handlePromptKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    prompt: Prompt,
  ) => {
    if (!canReorder) {
      return;
    }

    const hasModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    const isGrabbed = keyboardActiveId === prompt.id;
    const isActivation = isActivationKey(event.key);

    if (!isGrabbed) {
      if (!isActivation || hasModifier) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      grabPromptForKeyboard(prompt);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelKeyboardReorder(prompt);
      return;
    }

    if (isActivation) {
      if (hasModifier) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      finalizeKeyboardReorder(prompt);
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      movePromptWithKeyboard(prompt, event.key === 'ArrowUp' ? 'up' : 'down');
    }
  };

  const updateVariables = updatePrompt.variables;
  const isFormMutationPending =
    updatePrompt.isPending &&
    Boolean(
      updateVariables &&
        (updateVariables.title !== undefined || updateVariables.content !== undefined)
    );
  const isSaving = createPrompt.isPending || isFormMutationPending;
  const isDuplicating = createPrompt.isPending && typeof createPrompt.variables?.position === 'number';
  const isDeleting = deletePrompt.isPending;
  const deletingId = deletePrompt.variables ?? null;
  const isFormOpen = formMode !== null;
  const selectedPrompts = useMemo(
    () => orderedPrompts.filter((prompt) => selectedPromptIds.has(prompt.id)),
    [orderedPrompts, selectedPromptIds],
  );
  const exportablePrompts = useMemo(
    () => selectedPrompts.filter((prompt) => prompt.enabled),
    [selectedPrompts],
  );
  const hasSelection = selectedPrompts.length > 0;
  const hasDisabledSelected = selectedPrompts.length > exportablePrompts.length;
  const exportContent = useMemo(() => {
    return exportablePrompts
      .map((prompt) => `${prompt.title}\n\n${prompt.content}`)
      .join('\n\n---\n\n');
  }, [exportablePrompts]);

  const loadingSkeletons = useMemo(() => Array.from({ length: 3 }), []);

  const renderPromptCard = (prompt: Prompt, options?: PromptCardRenderOptions) => {
    const isExpanded = expandedPromptIds.has(prompt.id);
    const isSelected = selectedPromptIds.has(prompt.id);
    const isTogglePending =
      updatePrompt.isPending &&
      updateVariables?.id === prompt.id &&
      updateVariables.enabled !== undefined &&
      updateVariables.title === undefined &&
      updateVariables.content === undefined;
    const duplicatedTitle = `${prompt.title}${DUPLICATE_SUFFIX}`;
    const isDuplicateInFlight =
      isDuplicating && createPrompt.variables?.title === duplicatedTitle;

    return (
      <PromptCard
        key={prompt.id}
        prompt={prompt}
        options={options}
        isSelected={isSelected}
        onSelectionChange={(checked) => handleTogglePromptSelection(prompt.id, checked)}
        isExpanded={isExpanded}
        onToggleExpansion={() => togglePromptExpansion(prompt.id)}
        canReorder={canReorder}
        registerItemRef={registerItemRef}
        t={t}
        onToggleEnabled={handleToggleEnabled}
        isTogglePending={isTogglePending}
        onEdit={handleOpenEditForm}
        onDuplicate={handleDuplicatePrompt}
        onDelete={handleDeletePrompt}
        isDuplicating={createPrompt.isPending}
        isDuplicateInFlight={isDuplicateInFlight}
        isDeleting={isDeleting}
        deletingId={deletingId}
        contentPreviewLimit={CONTENT_PREVIEW_LIMIT}
      />
    );
  };

  type SortablePromptCardProps = {
    prompt: Prompt;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isActive: boolean;
    showPlaceholder: boolean;
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
    isKeyboardActive: boolean;
  };

  const SortablePromptCard = ({
    prompt,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    isActive,
    showPlaceholder,
    onKeyDown,
    isKeyboardActive,
  }: SortablePromptCardProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } =
      useSortable({
        id: prompt.id,
        disabled: false,
        transition: {
          duration: REORDER_ANIMATION_DURATION_MS,
          easing: REORDER_ANIMATION_EASING,
        },
        animateLayoutChanges: (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true }),
      });

    const style: CSSProperties = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition:
        transition ??
        `transform ${REORDER_ANIMATION_DURATION_MS}ms ${REORDER_ANIMATION_EASING}`,
      zIndex: isDragging ? 10 : undefined,
    };

    return renderPromptCard(prompt, {
      setNodeRef,
      containerAttributes: attributes,
      handleListeners: listeners,
      style,
      isDragging,
      isSorting,
      isActive,
      showPlaceholder,
      canMoveUp,
      canMoveDown,
      onMoveUp,
      onMoveDown,
      onKeyDown,
      isKeyboardActive,
    });
  };

  const hasPrompts = prompts.length > 0;
  const hasFilteredPrompts = filteredPrompts.length > 0;

  const noResultsMessage = useMemo(() => {
    const hasSearch = searchTerm.trim().length > 0;

    if (statusFilter === 'all') {
      return hasSearch
        ? t('prompts.search.noResultsWithSearch', 'No prompts found for this search.')
        : t('prompts.search.noResults', 'No prompts found.');
    }

    if (statusFilter === 'enabled') {
      return hasSearch
        ? t('prompts.search.noEnabledWithSearch', 'No enabled prompts found for this search.')
        : t('prompts.search.noEnabled', 'No enabled prompts found.');
    }

    return hasSearch
      ? t(
          'prompts.search.noDisabledWithSearch',
          'No disabled prompts found for this search.',
        )
      : t('prompts.search.noDisabled', 'No disabled prompts found.');
  }, [searchTerm, statusFilter, t]);

  return (
    <section className="space-y-6" aria-labelledby="prompts-heading">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
      <header className="space-y-2">
        <h1 id="prompts-heading" className="text-2xl font-semibold text-foreground">
          {t('prompts.heading', 'Prompts')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('prompts.subtitle', 'Manage the prompts used to generate your content.')}
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:flex-1 sm:min-w-[220px]">
          <label htmlFor="prompt-search" className="text-sm font-medium text-foreground">
            {t('prompts.search.label', 'Search prompts')}
          </label>
          <input
            id="prompt-search"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/40"
            placeholder={t('prompts.search.placeholder', 'Search by title or content')}
            autoComplete="off"
          />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[180px]">
          <label htmlFor="prompt-status-filter" className="text-sm font-medium text-foreground">
            {t('prompts.filter.status.label', 'Status filter')}
          </label>
          <select
            id="prompt-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/40"
          >
            <option value="all">{t('prompts.filter.status.all', 'All')}</option>
            <option value="enabled">{t('prompts.filter.status.enabled', 'Enabled')}</option>
            <option value="disabled">{t('prompts.filter.status.disabled', 'Disabled')}</option>
          </select>
        </div>
        <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={handleOpenCreateForm}
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            disabled={isSaving}
          >
            {t('prompts.actions.new', 'New prompt')}
          </button>
          <button
            type="button"
            onClick={handleOpenExportModal}
            className="inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            disabled={!hasSelection}
          >
            {t('prompts.actions.exportSelected', 'Export selected')}
          </button>
        </div>
      </div>
      {hasSelection && hasDisabledSelected ? (
        <p className="text-sm font-medium text-amber-600">
          {t('prompts.export.disabledWarning', 'Disabled prompts are not exported.')}
        </p>
      ) : null}

      {feedback ? (
        <div
          role={feedback.type === 'error' ? 'alert' : undefined}
          aria-live={feedback.type === 'error' ? undefined : 'polite'}
          aria-atomic={feedback.type === 'error' ? undefined : true}
          className={clsx(
            'rounded-md border px-4 py-3 text-sm',
            feedback.type === 'success'
              ? 'border-primary/20 bg-primary/5 text-primary'
              : 'border-danger/30 bg-danger/10 text-danger',
          )}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <span>{feedback.message}</span>
            {feedback.action ? (
              <button
                type="button"
                onClick={feedback.action.onClick}
                className={clsx(
                  'inline-flex items-center justify-center rounded-md border px-3 py-1 text-xs font-medium transition',
                  feedback.type === 'success'
                    ? 'border-primary/30 text-primary hover:bg-primary/15'
                    : 'border-danger/40 text-danger hover:bg-danger/20',
                )}
              >
                {feedback.action.label}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isFormOpen ? (
        <form onSubmit={handleSubmit} className="card space-y-4 p-4 sm:p-6" noValidate>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {formMode === 'create'
                ? t('prompts.form.createTitle', 'Create prompt')
                : t('prompts.form.editTitle', 'Edit prompt')}
            </h2>
            <button
              type="button"
              onClick={handleCancelForm}
              className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted sm:w-auto"
            >
              {t('prompts.actions.cancel', 'Cancel')}
            </button>
          </div>

          <div className="space-y-2">
            <label htmlFor="prompt-title" className="text-sm font-medium text-foreground">
              {t('prompts.form.titleLabel', 'Title')}
            </label>
            <input
              id="prompt-title"
              name="title"
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
              maxLength={TITLE_LIMIT}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/40"
              required
            />
            {formErrors.title ? (
              <p className="text-sm text-danger" role="alert">
                {formErrors.title}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label htmlFor="prompt-content" className="text-sm font-medium text-foreground">
                {t('prompts.form.contentLabel', 'Content')}
              </label>
              <button
                type="button"
                onClick={handleToggleContentFieldSize}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary/80"
                aria-pressed={isContentExpanded}
              >
                {isContentExpanded
                  ? t('prompts.form.collapseContent', 'Reduce editor height')
                  : t('prompts.form.expandContent', 'Expand editor area')}
              </button>
            </div>
            <textarea
              id="prompt-content"
              name="content"
              value={contentInput}
              onChange={(event) => setContentInput(event.target.value)}
              ref={contentInputRef}
              className={clsx(
                'w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/40',
                isContentExpanded ? 'min-h-64' : 'min-h-32',
              )}
              style={{ overflow: 'hidden' }}
              required
            />
            {formErrors.content ? (
              <p className="text-sm text-danger" role="alert">
                {formErrors.content}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={isSaving}
            >
              {isSaving
                ? t('prompts.form.saving', 'Saving...')
                : t('prompts.form.save', 'Save prompt')}
            </button>
          </div>
        </form>
      ) : null}

      {isLoading ? (
        <div className="space-y-3" aria-live="polite" aria-atomic="true">
          {loadingSkeletons.map((_, index) => (
            <div key={index} className="card space-y-3 p-4">
              <LoadingSkeleton className="h-5 w-3/4" />
              <LoadingSkeleton className="h-4 w-full" />
              <LoadingSkeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && isError ? (
        <ErrorState
          title={t('prompts.list.error', 'We could not load the prompts. Try again.')}
          action={
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                refetchPromptList();
              }}
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:w-auto"
            >
              {t('prompts.actions.retry', 'Try again')}
            </button>
          }
        />
      ) : null}

      {!isLoading && !isError && !hasPrompts ? (
        <EmptyState
          title={t('prompts.empty.title', 'No prompt registered yet.')}
          description={t('prompts.empty.description', 'Create your first prompt to get started.')}
          action={
            <button
              type="button"
              onClick={handleOpenCreateForm}
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:w-auto"
            >
              {t('prompts.actions.createFirst', 'Create prompt')}
            </button>
          }
        />
      ) : null}

      {!isLoading && !isError && hasPrompts ? (
        hasFilteredPrompts ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t('prompts.list.reorderHint', 'Drag the handle or card to change the order.')}
              </p>
              {!isReorderEnabled ? (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'prompts.list.reorderDisabledWithFilters',
                    'Clear filters to reorder the full list before reordering.',
                  )}
                </p>
              ) : null}
              {isReorderPending ? (
                <p className="text-xs font-medium text-primary" aria-live="polite" aria-atomic="true">
                  {t('prompts.reorder.pending', 'Updating order...')}
                </p>
              ) : null}
              {showForceSaveButton ? (
                <button
                  type="button"
                  onClick={handleForceSaveClick}
                  className="inline-flex items-center justify-center rounded-md border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={reorderPrompts.isPending}
                >
                  {reorderPrompts.isPending
                    ? t('prompts.reorder.forceSaveSaving', 'Salvando...')
                    : t('prompts.reorder.forceSave', 'Forçar salvar ordem')}
                </button>
              ) : null}
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
                {shouldVirtualize ? (
                  <div
                    ref={(element) => {
                      listContainerRef.current = element;
                    }}
                    className="relative max-h-[65vh] overflow-auto"
                    style={{ touchAction: 'pan-y' }}
                    aria-label={t('prompts.list.ariaLabel', 'Saved prompts')}
                  >
                    <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                      <ul className="absolute inset-0 m-0 list-none p-0">
                        {virtualizer.getVirtualItems().map((virtualItem) => {
                          const prompt = orderedPrompts[virtualItem.index];

                          if (!prompt) {
                            return null;
                          }

                          const isLast = virtualItem.index === orderedPrompts.length - 1;
                          const isActivePrompt = activeId === prompt.id;

                          return (
                            <li
                              key={virtualItem.key}
                              className="absolute inset-x-0"
                              role="listitem"
                              style={{
                                transform: `translate3d(0, ${virtualItem.start}px, 0)`,
                                willChange: 'transform',
                              }}
                              ref={(element) => {
                                if (element) {
                                  virtualizer.measureElement(element);
                                }
                              }}
                            >
                              <SortablePromptCard
                                prompt={prompt}
                                canMoveUp={virtualItem.index > 0}
                                canMoveDown={!isLast}
                                onMoveUp={() => handleMovePrompt(prompt.id, 'up')}
                                onMoveDown={() => handleMovePrompt(prompt.id, 'down')}
                                isActive={isActivePrompt}
                                showPlaceholder={isSorting && isActivePrompt}
                                onKeyDown={(event) => handlePromptKeyDown(event, prompt)}
                                isKeyboardActive={keyboardActiveId === prompt.id}
                              />
                              {isLast ? null : <div className="h-3" aria-hidden="true" />}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={(element) => {
                      listContainerRef.current = element;
                    }}
                    className="relative max-h-[65vh] overflow-auto"
                    style={{ touchAction: 'pan-y' }}
                    aria-label={t('prompts.list.ariaLabel', 'Saved prompts')}
                  >
                    <ul className="space-y-3 pr-1">
                      {orderedPrompts.map((prompt, index) => {
                        const isActivePrompt = activeId === prompt.id;

                        return (
                          <li key={prompt.id} role="listitem">
                            <SortablePromptCard
                              prompt={prompt}
                              canMoveUp={index > 0}
                              canMoveDown={index < orderedPrompts.length - 1}
                              onMoveUp={() => handleMovePrompt(prompt.id, 'up')}
                              onMoveDown={() => handleMovePrompt(prompt.id, 'down')}
                              isActive={isActivePrompt}
                              showPlaceholder={isSorting && isActivePrompt}
                              onKeyDown={(event) => handlePromptKeyDown(event, prompt)}
                              isKeyboardActive={keyboardActiveId === prompt.id}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </SortableContext>
              {canReorder && orderedPrompts.length > 0 ? (
                <div
                  ref={setDropZoneRef}
                  className={clsx(
                    'mt-3 rounded-md border border-dashed border-border/70 px-3 py-2 text-center text-xs text-muted-foreground transition',
                    isDropZoneOver ? 'border-primary bg-primary/5 text-primary' : '',
                  )}
                >
                  {t('prompts.list.dropZone', 'Drop here to move the prompt to the end.')}
                </div>
              ) : null}
              <DragOverlay dropAnimation={dropAnimation}>
                {activePrompt
                  ? renderPromptCard(activePrompt, {
                      isOverlay: true,
                      style: {
                        width: activeOverlayDimensionsRef.current
                          ? activeOverlayDimensionsRef.current.width
                          : '100%',
                        height: activeOverlayDimensionsRef.current?.height,
                      },
                      isActive: true,
                    })
                  : null}
              </DragOverlay>
            </DndContext>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground">
            {noResultsMessage}
          </div>
        )
      ) : null}
      {isExportModalOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
              <div className="fixed inset-0 bg-background/80 backdrop-blur" aria-hidden="true" />
              <dialog
                aria-labelledby="export-modal-title"
                className="relative z-10 w-full max-w-2xl rounded-lg border border-border bg-background p-6 shadow-lg"
                aria-modal="true"
                open
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 id="export-modal-title" className="text-lg font-semibold text-foreground">
                      {t('prompts.export.title', 'Export selected prompts')}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'prompts.export.description',
                        'Copy the selected prompts to use them in other tools.',
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseExportModal}
                    className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted sm:w-auto"
                  >
                    {t('prompts.export.close', 'Close')}
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  <label htmlFor="export-preview" className="text-sm font-medium text-foreground">
                    {t('prompts.export.previewLabel', 'Preview')}
                  </label>
                  {hasDisabledSelected ? (
                    <p className="text-xs text-amber-600">
                      {t('prompts.export.disabledWarning', 'Disabled prompts are not exported.')}
                    </p>
                  ) : null}
                  <textarea
                    id="export-preview"
                    ref={exportTextareaRef}
                    value={exportContent}
                    readOnly
                    className="h-64 w-full resize-none rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground focus:outline-none"
                  />
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="text-sm">
                    {copyStatus === 'success' ? (
                      <p className="text-primary">
                        {t('prompts.export.copySuccess', 'Copied successfully.')}
                      </p>
                    ) : null}
                    {copyStatus === 'error' ? (
                      <p className="text-danger">
                        {t('prompts.export.copyError', 'Failed to copy. Copy manually.')}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleCopyExportContent(exportContent).catch((error) => {
                        console.error('[PromptsPage] Failed to copy export content', error);
                      });
                    }}
                    className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:w-auto"
                  >
                    {t('prompts.export.copy', 'Copy')}
                  </button>
                </div>
              </dialog>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
};

export default PromptsPage;
type ReorderUndoState = {
  previousIds: string[];
  previousPrompts: Prompt[];
};

