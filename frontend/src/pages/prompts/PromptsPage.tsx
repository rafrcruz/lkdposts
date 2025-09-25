import type { DragEvent, FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react';
import { useVirtualizer } from '@tanstack/react-virtual';

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

type FormMode = 'create' | 'edit';

type FormErrors = {
  title?: string;
  content?: string;
};

type Feedback = {
  type: 'success' | 'error';
  message: string;
};

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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [expandedPromptIds, setExpandedPromptIds] = useState<Set<string>>(new Set());
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const contentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const exportTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastFetchErrorRef = useRef<unknown>(null);

  const shouldVirtualize = prompts.length > VIRTUALIZATION_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? prompts.length : 0,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => ESTIMATED_ITEM_HEIGHT,
    overscan: 8,
    getItemKey: (index) => prompts[index]?.id ?? index,
  });

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

    if (!shouldVirtualize) {
      return;
    }

    const index = prompts.findIndex((item) => item.id === pendingScrollId);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center' });
      return;
    }

    setPendingScrollId(null);
  }, [pendingScrollId, prompts, shouldVirtualize, virtualizer]);

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
  }, [shouldVirtualize, virtualizer, expandedPromptIds, prompts]);

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

  const reorderById = (sourceId: string, targetId: string | null) => {
    if (reorderPrompts.isPending) {
      return;
    }

    if (targetId !== null && targetId === sourceId) {
      return;
    }

    const items = prompts;
    const sourceIndex = items.findIndex((item) => item.id === sourceId);

    if (sourceIndex === -1) {
      return;
    }

    const next = [...items];
    const [moved] = next.splice(sourceIndex, 1);

    let insertIndex = targetId === null ? next.length : next.findIndex((item) => item.id === targetId);

    if (insertIndex < 0) {
      insertIndex = next.length;
    }

    next.splice(insertIndex, 0, moved);

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

  const handleDragStart = (event: DragEvent<HTMLDivElement>, promptId: string) => {
    setDraggingId(promptId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(promptId));
  };

  const resolveSourceId = (event: DragEvent<HTMLDivElement>) => {
    if (draggingId !== null) {
      return draggingId;
    }

    const data = event.dataTransfer.getData('text/plain');
    return data || null;
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnItem = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = resolveSourceId(event);
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null);
      return;
    }

    reorderById(sourceId, targetId);
    setDraggingId(null);
  };

  const handleDropOnList = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const sourceId = resolveSourceId(event);
    if (!sourceId) {
      setDraggingId(null);
      return;
    }

    reorderById(sourceId, null);
    setDraggingId(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
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
    () => prompts.filter((prompt) => selectedPromptIds.has(prompt.id)),
    [prompts, selectedPromptIds],
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

  const renderPromptCard = (prompt: Prompt) => {
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

    return (
      <div
        key={prompt.id}
        role="listitem"
        className={clsx(
          'card flex flex-col gap-3 p-4 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary',
          draggingId === prompt.id ? 'opacity-60 ring-2 ring-primary/40' : '',
          !isEnabled ? 'border-dashed border-border/70 bg-muted/30' : '',
        )}
        draggable
        onDragStart={(event) => handleDragStart(event, prompt.id)}
        onDragOver={handleDragOver}
        onDrop={(event) => handleDropOnItem(event, prompt.id)}
        onDragEnd={handleDragEnd}
        tabIndex={0}
        ref={registerItemRef(prompt.id)}
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden="true">⋮⋮</span>
            <span className="sr-only">
              {t('prompts.list.dragLabel', 'Drag to reposition this prompt.')}
            </span>
          </div>
        </div>
      </div>
    );
  };

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
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
        {reorderPrompts.isPending ? (
          <span className="text-xs text-muted-foreground">
            {t('prompts.reorder.pending', 'Updating order...')}
          </span>
        ) : null}
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

      {!isLoading && !isError && prompts.length === 0 ? (
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

      {!isLoading && !isError && prompts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t('prompts.list.reorderHint', 'Drag the handle or card to change the order.')}
          </p>
          {shouldVirtualize ? (
            <div
              ref={(element) => {
                listContainerRef.current = element;
              }}
              onDragOver={handleDragOver}
              onDrop={handleDropOnList}
              className="relative max-h-[65vh] overflow-auto"
              role="list"
              aria-label={t('prompts.list.ariaLabel', 'Saved prompts')}
            >
              <div
                style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
              >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const prompt = prompts[virtualItem.index];
                  if (!prompt) {
                    return null;
                  }

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
                      {renderPromptCard(prompt)}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDrop={handleDropOnList}
              className="space-y-3"
              role="list"
              aria-label={t('prompts.list.ariaLabel', 'Saved prompts')}
            >
              {prompts.map((prompt) => renderPromptCard(prompt))}
            </div>
          )}
        </div>
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
