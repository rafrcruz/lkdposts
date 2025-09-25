import type { DragEvent, FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react';

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
const CONTENT_PREVIEW_LIMIT = 100;

type FormMode = 'create' | 'edit';

type FormErrors = {
  title?: string;
  content?: string;
};

type Feedback = {
  type: 'success' | 'error';
  message: string;
};

const truncateContent = (content: string) => {
  const normalized = content.trim();

  if (normalized.length <= CONTENT_PREVIEW_LIMIT) {
    return normalized || '…';
  }

  return `${normalized.slice(0, CONTENT_PREVIEW_LIMIT).trimEnd()}…`;
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

  const prompts = promptList.data ?? [];
  const isLoading = promptList.isLoading && !promptList.isFetched;
  const isError = promptList.isError;

  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);

  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const lastFetchErrorRef = useRef<unknown>(null);

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
    }
  }, [pendingScrollId, promptList.data]);

  const resetForm = () => {
    setFormMode(null);
    setEditingPrompt(null);
    setTitleInput('');
    setContentInput('');
    setFormErrors({});
  };

  const handleOpenCreateForm = () => {
    setFeedback(null);
    setFormMode('create');
    setEditingPrompt(null);
    setTitleInput('');
    setContentInput('');
    setFormErrors({});
  };

  const handleOpenEditForm = (prompt: Prompt) => {
    setFeedback(null);
    setFormMode('edit');
    setEditingPrompt(prompt);
    setTitleInput(prompt.title);
    setContentInput(prompt.content);
    setFormErrors({});
  };

  const handleCancelForm = () => {
    resetForm();
  };

  const registerItemRef = (id: number) => (element: HTMLDivElement | null) => {
    if (!element) {
      itemRefs.current.delete(id);
      return;
    }

    itemRefs.current.set(id, element);
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

  const reportError = (action: 'create' | 'update' | 'delete' | 'reorder', error: unknown, extra: Record<string, unknown>) => {
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

  const reorderById = (sourceId: number, targetId: number | null) => {
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

  const handleDragStart = (event: DragEvent<HTMLDivElement>, promptId: number) => {
    setDraggingId(promptId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(promptId));
  };

  const resolveSourceId = (event: DragEvent<HTMLDivElement>) => {
    if (draggingId !== null) {
      return draggingId;
    }

    const data = event.dataTransfer.getData('text/plain');
    const parsed = Number.parseInt(data, 10);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnItem = (event: DragEvent<HTMLDivElement>, targetId: number) => {
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

  const isSaving = createPrompt.isPending || updatePrompt.isPending;
  const isDeleting = deletePrompt.isPending;
  const deletingId = deletePrompt.variables ?? null;
  const isFormOpen = formMode !== null;

  const loadingSkeletons = useMemo(() => Array.from({ length: 3 }), []);

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
        <button
          type="button"
          onClick={handleOpenCreateForm}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
        >
          {t('prompts.actions.new', 'New prompt')}
        </button>
        {reorderPrompts.isPending ? (
          <span className="text-xs text-muted-foreground">
            {t('prompts.reorder.pending', 'Updating order...')}
          </span>
        ) : null}
      </div>

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
            <label htmlFor="prompt-content" className="text-sm font-medium text-foreground">
              {t('prompts.form.contentLabel', 'Content')}
            </label>
            <textarea
              id="prompt-content"
              name="content"
              value={contentInput}
              onChange={(event) => setContentInput(event.target.value)}
              className="min-h-32 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/40"
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
          <div
            onDragOver={handleDragOver}
            onDrop={handleDropOnList}
            className="space-y-3"
            role="list"
          >
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                role="listitem"
                className={clsx(
                  'card flex flex-col gap-3 p-4 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary',
                  draggingId === prompt.id ? 'opacity-60 ring-2 ring-primary/40' : '',
                )}
                draggable
                onDragStart={(event) => handleDragStart(event, prompt.id)}
                onDragOver={handleDragOver}
                onDrop={(event) => handleDropOnItem(event, prompt.id)}
                onDragEnd={handleDragEnd}
                tabIndex={0}
                ref={registerItemRef(prompt.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-1 flex-col gap-1">
                    <h3 className="text-base font-semibold text-foreground">{prompt.title}</h3>
                    <p className="text-sm text-muted-foreground">{truncateContent(prompt.content)}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditForm(prompt)}
                      className="inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                    >
                      {t('prompts.actions.edit', 'Edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePrompt(prompt)}
                      className="inline-flex items-center justify-center rounded-md border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                      disabled={isDeleting}
                    >
                      {isDeleting && deletingId === prompt.id
                        ? t('prompts.actions.deleting', 'Deleting...')
                        : t('prompts.actions.delete', 'Delete')}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span aria-hidden="true">⋮⋮</span>
                  <span className="sr-only">
                    {t('prompts.list.dragLabel', 'Drag to reposition this prompt.')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default PromptsPage;
