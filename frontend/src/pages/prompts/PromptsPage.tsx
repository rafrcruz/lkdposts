import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
import type { DraggableAttributes, DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingSkeleton } from '@/components/feedback/LoadingSkeleton';
import {
  useCreatePrompt,
  useDeletePrompt,
  usePromptList,
  useReorderPrompts,
  useUpdatePrompt,
} from '@/features/prompts/hooks/usePrompts';
import type { Prompt } from '@/features/prompts/types/prompt';
import { HttpError } from '@/lib/api/http';
import { clsx } from 'clsx';

const TITLE_LIMIT = 120;
const CONTENT_PREVIEW_LIMIT = 240;
const VIRTUALIZATION_THRESHOLD = 50;
const ESTIMATED_ITEM_HEIGHT = 196;
const DROP_ZONE_ID = 'prompts-reorder-dropzone';

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

type Feedback = {
  type: 'success' | 'error';
  message: string;
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

const normalizeOrder = (items: Prompt[]): Prompt[] => {
  return items.map((item, index) => ({ ...item, position: index + 1 }));
};

const PromptsPage = () => {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t('prompts.meta.title', 'lkdposts - Prompts');
    Sentry.addBreadcrumb({
      category: 'prompts',
      message: 'prompts:view_opened',
      level: 'info',
    });
  }, [t]);

  const promptList = usePromptList();
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
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(new Set());
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const exportTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastFetchErrorRef = useRef<unknown>(null);

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
  const [sortedIds, setSortedIds] = useState<string[]>(promptIdList);
  const [activeId, setActiveId] = useState<string | null>(null);
  const promptMap = useMemo(() => {
    const map = new Map<string, Prompt>();
    filteredPrompts.forEach((prompt) => {
      map.set(prompt.id, prompt);
    });
    return map;
  }, [filteredPrompts]);
  const orderedPrompts = useMemo(() => {
    return sortedIds
      .map((id) => promptMap.get(id))
      .filter((prompt): prompt is Prompt => Boolean(prompt));
  }, [promptMap, sortedIds]);
  const isSorting = activeId !== null;
  const shouldVirtualize = !isSorting && orderedPrompts.length > VIRTUALIZATION_THRESHOLD;
  const isReorderEnabled = normalizedSearch.length === 0 && statusFilter === 'all';
  const isReorderPending = reorderPrompts.isPending;
  const canReorder = isReorderEnabled && !isReorderPending;
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
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? orderedPrompts.length : 0,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 8,
    getItemKey: (index) => orderedPrompts[index]?.id ?? index,
  });

  useEffect(() => {
    if (isSorting || isReorderPending) {
      return;
    }

    setSortedIds((current) => {
      if (arraysShallowEqual(current, promptIdList)) {
        return current;
      }

      return [...promptIdList];
    });
  }, [isSorting, isReorderPending, promptIdList]);

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
  ]);

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
    const duplicatedTitle = `${prompt.title} (cópia)`;
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

  const requestReorder = (orderedIds: string[]) => {
    if (reorderPrompts.isPending) {
      return;
    }

    if (orderedIds.length !== prompts.length) {
      return;
    }

    const itemsById = new Map(prompts.map((item) => [item.id, item] as const));
    const next = orderedIds
      .map((id) => itemsById.get(id))
      .filter((item): item is Prompt => Boolean(item));

    if (next.length !== prompts.length) {
      return;
    }

    const normalized = normalizeOrder(next);

    setFeedback(null);
    reorderPrompts.mutate(normalized, {
      onSuccess: () => {
        setFeedback({
          type: 'success',
          message: t('prompts.feedback.reordered', 'Prompt order updated.'),
        });
      },
      onError: (error) => {
        setFeedback({
          type: 'error',
          message: resolveErrorMessage(
            error,
            t('prompts.reorder.error', 'We could not reorder the prompts. Try again.'),
          ),
        });
        reportError('reorder', error, { promptIds: normalized.map((item) => item.id) });
      },
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!canReorder) {
      return;
    }

    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!canReorder) {
      return;
    }

    const { active, over } = event;

    if (!over) {
      return;
    }

    const activeIdValue = String(active.id);

    setSortedIds((current) => {
      const activeIndex = current.indexOf(activeIdValue);

      if (activeIndex === -1) {
        return current;
      }

      if (over.id === DROP_ZONE_ID) {
        const lastIndex = current.length - 1;
        if (activeIndex === lastIndex) {
          return current;
        }

        return arrayMove(current, activeIndex, lastIndex);
      }

      const overIdValue = String(over.id);
      const overIndex = current.indexOf(overIdValue);

      if (overIndex === -1 || overIndex === activeIndex) {
        return current;
      }

      return arrayMove(current, activeIndex, overIndex);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!canReorder) {
      setActiveId(null);
      setSortedIds(promptIdList);
      return;
    }

    const { active, over } = event;
    setActiveId(null);

    if (!over) {
      setSortedIds(promptIdList);
      return;
    }

    const activeIdValue = String(active.id);

    setSortedIds((current) => {
      const currentIndex = current.indexOf(activeIdValue);

      if (currentIndex === -1) {
        return [...promptIdList];
      }

      if (over.id === DROP_ZONE_ID) {
        const targetIndex = current.length - 1;
        const nextOrder = arrayMove(current, currentIndex, targetIndex);

        if (arraysShallowEqual(nextOrder, current)) {
          return current;
        }

        requestReorder(nextOrder);
        return nextOrder;
      }

      const overIdValue = String(over.id);
      const targetIndex = current.indexOf(overIdValue);

      if (targetIndex === -1) {
        return [...promptIdList];
      }

      const nextOrder = arrayMove(current, currentIndex, targetIndex);

      if (arraysShallowEqual(nextOrder, current)) {
        return current;
      }

      requestReorder(nextOrder);
      return nextOrder;
    });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setSortedIds(promptIdList);
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

      const nextOrder = arrayMove(current, currentIndex, targetIndex);

      requestReorder(nextOrder);
      return nextOrder;
    });
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

  type PromptCardRenderOptions = {
    setNodeRef?: (element: HTMLDivElement | null) => void;
    handleAttributes?: DraggableAttributes;
    handleListeners?: SyntheticListenerMap;
    style?: CSSProperties;
    isDragging?: boolean;
    isSorting?: boolean;
    isOverlay?: boolean;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
  };

  const renderPromptCard = (prompt: Prompt, options?: PromptCardRenderOptions) => {
    const normalizedContent = prompt.content.trim();
    const displayContent = normalizedContent.length > 0 ? prompt.content : '…';
    const shouldShowToggle =
      normalizedContent.length > CONTENT_PREVIEW_LIMIT || normalizedContent.includes('\n');
    const isExpanded = expandedPromptIds.has(prompt.id);
    const contentElementId = `prompt-content-${prompt.id}`;
    const duplicatedTitle = `${prompt.title} (cópia)`;
    const isCurrentDuplicatePending =
      isDuplicating && createPrompt.variables?.title === duplicatedTitle;
    const isEnabled = prompt.enabled;
    const statusLabel = isEnabled
      ? t('prompts.status.enabled', 'Enabled')
      : t('prompts.status.disabled', 'Disabled');
    const toggleAriaLabel = isEnabled
      ? t('prompts.toggle.disable', 'Disable prompt')
      : t('prompts.toggle.enable', 'Enable prompt');
    const isTogglePending =
      updatePrompt.isPending &&
      updateVariables?.id === prompt.id &&
      updateVariables.enabled !== undefined &&
      updateVariables.title === undefined &&
      updateVariables.content === undefined;
    const canMoveUp = options?.canMoveUp ?? false;
    const canMoveDown = options?.canMoveDown ?? false;

    const assignRef = (element: HTMLDivElement | null) => {
      if (!options?.isOverlay) {
        registerItemRef(prompt.id)(element);
      }

      if (options?.setNodeRef) {
        options.setNodeRef(element);
      }
    };

    const isDragging = options?.isDragging ?? false;
    const isSortingItem = options?.isSorting ?? false;

    return (
      <div
        key={prompt.id}
        role="listitem"
        className={clsx(
          'card flex flex-col gap-3 p-4 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary',
          isDragging ? 'opacity-60 ring-2 ring-primary/40' : '',
          isSortingItem ? 'transition-transform duration-150' : '',
          options?.isOverlay ? 'pointer-events-none' : '',
          !isEnabled ? 'border-dashed border-border/70 bg-muted/30' : '',
        )}
        tabIndex={0}
        ref={assignRef}
        style={options?.style}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-1 gap-3">
              <div className="pt-1">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40"
                  checked={selectedPromptIds.has(prompt.id)}
                  onChange={(event) => handleTogglePromptSelection(prompt.id, event.target.checked)}
                  aria-label={t('prompts.selection.toggle', 'Select prompt')}
                />
              </div>
              <div className="flex flex-1 flex-col gap-3">
                <h3 className="text-base font-semibold text-foreground">{prompt.title}</h3>
                <div className="space-y-2">
                  <div
                    id={contentElementId}
                    className={clsx(
                      'whitespace-pre-wrap break-words text-sm text-muted-foreground',
                      !isExpanded && shouldShowToggle ? 'line-clamp-3' : '',
                    )}
                  >
                    {displayContent}
                  </div>
                  {shouldShowToggle ? (
                    <button
                      type="button"
                      onClick={() => togglePromptExpansion(prompt.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary/80"
                      aria-expanded={isExpanded}
                      aria-controls={contentElementId}
                    >
                      {isExpanded
                        ? t('prompts.actions.collapse', 'Collapse')
                        : t('prompts.actions.expand', 'Expand')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                aria-label={toggleAriaLabel}
                onClick={() => handleToggleEnabled(prompt, !isEnabled)}
                disabled={isTogglePending}
                className={clsx(
                  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition',
                  isEnabled
                    ? 'border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                    : 'border-border text-muted-foreground hover:bg-muted',
                  isTogglePending ? 'cursor-not-allowed opacity-60' : '',
                )}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'inline-flex h-2.5 w-2.5 rounded-full',
                    isEnabled ? 'bg-emerald-500' : 'bg-muted-foreground',
                  )}
                />
                {statusLabel}
              </button>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-start">
                <button
                  type="button"
                  onClick={() => handleOpenEditForm(prompt)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                >
                  {t('prompts.actions.edit', 'Edit')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicatePrompt(prompt)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                  disabled={createPrompt.isPending}
                >
                  {isCurrentDuplicatePending
                    ? t('prompts.actions.duplicating', 'Duplicating...')
                    : t('prompts.actions.duplicate', 'Duplicate')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePrompt(prompt)}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                  disabled={isDeleting}
                >
                  {isDeleting && deletingId === prompt.id
                    ? t('prompts.actions.deleting', 'Deleting...')
                    : t('prompts.actions.delete', 'Delete')}
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                {t('prompts.list.updatedAt', 'Last updated:')}
              </span>{' '}
              {new Date(prompt.updatedAt).toLocaleString()}
            </p>
            <p>
              <span className="font-medium text-foreground">
                {t('prompts.list.createdAt', 'Created:')}
              </span>{' '}
              {new Date(prompt.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            type="button"
            className={clsx(
              'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              canReorder ? 'cursor-grab hover:text-foreground' : 'cursor-not-allowed opacity-60',
              isDragging ? 'cursor-grabbing' : '',
            )}
            {...(options?.handleAttributes ?? {})}
            {...(options?.handleListeners ?? {})}
            disabled={!canReorder}
            aria-label={t('prompts.list.dragLabel', 'Drag to reposition this prompt.')}
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
          {canReorder ? (
            <div className="sr-only space-y-1">
              <button
                type="button"
                onClick={options?.onMoveUp}
                disabled={!canMoveUp || isReorderPending}
              >
                {t('prompts.list.moveUp', 'Move prompt up')}
              </button>
              <button
                type="button"
                onClick={options?.onMoveDown}
                disabled={!canMoveDown || isReorderPending}
              >
                {t('prompts.list.moveDown', 'Move prompt down')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  type SortablePromptCardProps = {
    prompt: Prompt;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
  };

  const SortablePromptCard = ({
    prompt,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
  }: SortablePromptCardProps) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } = useSortable({
      id: prompt.id,
      disabled: !canReorder,
    });

    const style: CSSProperties = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      transition: transition ?? undefined,
      zIndex: isDragging ? 10 : undefined,
    };

    return renderPromptCard(prompt, {
      setNodeRef,
      handleAttributes: attributes,
      handleListeners: listeners,
      style,
      isDragging,
      isSorting,
      canMoveUp,
      canMoveDown,
      onMoveUp,
      onMoveDown,
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
      <header className="space-y-2">
        <h1 id="prompts-heading" className="text-2xl font-semibold text-foreground">
          {t('prompts.heading', 'Prompts')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('prompts.subtitle', 'Manage the prompts used to generate your content.')}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
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
        <div className="min-w-[180px]">
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
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenCreateForm}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
          >
            {t('prompts.actions.new', 'New prompt')}
          </button>
          <button
            type="button"
            onClick={handleOpenExportModal}
            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
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
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={clsx(
            'rounded-md border px-4 py-3 text-sm',
            feedback.type === 'success'
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-danger/30 bg-danger/10 text-danger',
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      {isFormOpen ? (
        <form onSubmit={handleSubmit} className="card space-y-4 p-6" noValidate>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              {formMode === 'create'
                ? t('prompts.form.createTitle', 'Create prompt')
                : t('prompts.form.editTitle', 'Edit prompt')}
            </h2>
            <button
              type="button"
              onClick={handleCancelForm}
              className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
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
            <div className="flex items-center justify-between gap-2">
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

          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="space-y-3" role="status" aria-live="polite">
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
                Promise.resolve(promptList.refetch()).catch(() => {
                  // the query already exposes the error state
                });
              }}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
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
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
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
                <p className="text-xs font-medium text-primary" role="status" aria-live="polite">
                  {t('prompts.reorder.pending', 'Updating order...')}
                </p>
              ) : null}
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
                {shouldVirtualize ? (
                  <div
                    ref={(element) => {
                      listContainerRef.current = element;
                    }}
                    className="relative max-h-[65vh] overflow-auto"
                    role="list"
                    aria-label={t('prompts.list.ariaLabel', 'Saved prompts')}
                  >
                    <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                      {virtualizer.getVirtualItems().map((virtualItem) => {
                        const prompt = orderedPrompts[virtualItem.index];

                        if (!prompt) {
                          return null;
                        }

                        const isLast = virtualItem.index === orderedPrompts.length - 1;

                        return (
                          <div
                            key={virtualItem.key}
                            className="absolute inset-x-0 pb-3"
                            style={{ transform: `translateY(${virtualItem.start}px)` }}
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
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    ref={(element) => {
                      listContainerRef.current = element;
                    }}
                    className="space-y-3"
                    role="list"
                    aria-label={t('prompts.list.ariaLabel', 'Saved prompts')}
                  >
                    {orderedPrompts.map((prompt, index) => (
                      <SortablePromptCard
                        key={prompt.id}
                        prompt={prompt}
                        canMoveUp={index > 0}
                        canMoveDown={index < orderedPrompts.length - 1}
                        onMoveUp={() => handleMovePrompt(prompt.id, 'up')}
                        onMoveDown={() => handleMovePrompt(prompt.id, 'down')}
                      />
                    ))}
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
              <DragOverlay dropAnimation={null}>
                {activePrompt
                  ? renderPromptCard(activePrompt, {
                      isOverlay: true,
                      style: { width: '100%' },
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-modal-title"
                className="w-full max-w-2xl rounded-lg border border-border bg-background p-6 shadow-lg"
              >
                <div className="flex items-start justify-between gap-4">
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
                    className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
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
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
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
                      void handleCopyExportContent(exportContent);
                    }}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
                  >
                    {t('prompts.export.copy', 'Copy')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
};

export default PromptsPage;
