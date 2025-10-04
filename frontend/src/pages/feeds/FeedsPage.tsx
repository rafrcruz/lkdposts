import { FormEvent, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';

import {
  useBulkCreateFeeds,
  useCreateFeed,
  useDeleteFeed,
  useFeedList,
  useResetFeeds,
  useUpdateFeed,
} from '@/features/feeds/hooks/useFeeds';
import type {
  Feed,
  FeedBulkResult,
  FeedDuplicateReason,
  FeedInvalidReason,
  FeedListMeta,
} from '@/features/feeds/types/feed';
import { HttpError } from '@/lib/api/http';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatDate, useLocale } from '@/utils/formatters';
import { useAuth } from '@/features/auth/hooks/useAuth';

const PAGE_SIZE = 10;

type FeedbackMessage = {
  type: 'success' | 'error';
  message: string;
};

type BulkSummary = {
  created: FeedBulkResult['created'];
  duplicates: FeedBulkResult['duplicates'];
  invalid: FeedBulkResult['invalid'];
};

const isValidUrl = (value: string) => {
  const candidate = value.trim();

  if (!candidate) {
    return false;
  }

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const extractErrorCode = (error: HttpError) => {
  const payload = error.payload;

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.code === 'string') {
    return record.code;
  }

  if (record.error && typeof record.error === 'object') {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.code === 'string') {
      return nested.code;
    }
  }

  return null;
};

const buildFeedbackClassName = (feedback: FeedbackMessage | null) => {
  if (!feedback) {
    return '';
  }

  return feedback.type === 'success' ? 'text-sm text-primary' : 'text-sm text-destructive';
};

const buildFeedbackAccessibilityProps = (feedback: FeedbackMessage | null) => {
  if (!feedback) {
    return {} as const;
  }

  if (feedback.type === 'error') {
    return { role: 'alert', 'aria-live': 'assertive' as const, 'aria-atomic': true as const };
  }

  return { 'aria-live': 'polite' as const, 'aria-atomic': true as const };
};

const FeedsPage = () => {
  const { t } = useTranslation();
  const locale = useLocale();

  useEffect(() => {
    document.title = t('feeds.meta.title', 'lkdposts - Feeds');
  }, [t]);

  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([]);

  const [singleUrl, setSingleUrl] = useState('');
  const [singleTitle, setSingleTitle] = useState('');
  const [singleFeedback, setSingleFeedback] = useState<FeedbackMessage | null>(null);

  const [bulkInput, setBulkInput] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState<FeedbackMessage | null>(null);
  const [bulkSummary, setBulkSummary] = useState<BulkSummary | null>(null);

  const [editingFeed, setEditingFeed] = useState<Feed | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editFeedback, setEditFeedback] = useState<FeedbackMessage | null>(null);

  const [listFeedback, setListFeedback] = useState<FeedbackMessage | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<FeedbackMessage | null>(null);
  const [shouldRefreshFeeds, setShouldRefreshFeeds] = useState(false);
  const [feedPendingDeletion, setFeedPendingDeletion] = useState<Feed | null>(null);

  const feedList = useFeedList({ cursor, limit: PAGE_SIZE });
  const { refetch: refetchFeedList } = feedList;
  const createFeed = useCreateFeed();
  const bulkCreate = useBulkCreateFeeds();
  const updateFeedMutation = useUpdateFeed();
  const deleteFeedMutation = useDeleteFeed();
  const resetFeedsMutation = useResetFeeds();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const feeds: Feed[] = feedList.data?.items ?? [];
  const meta: FeedListMeta | undefined = feedList.data?.meta;
  const nextCursor: string | null = meta?.nextCursor ?? null;
  const totalFeeds: number = meta?.total ?? 0;
  const currentPage = previousCursors.length + 1;

  const isLoading = feedList.isLoading && !feedList.isFetched;
  const isError = feedList.isError;
  const isFetching = feedList.isFetching;

  const isCreating = createFeed.isPending;
  const isBulkCreating = bulkCreate.isPending;
  const isUpdating = updateFeedMutation.isPending;
  const isDeleting = deleteFeedMutation.isPending;
  const isResettingFeeds = resetFeedsMutation.isPending;

  const resetPagination = () => {
    setCursor(null);
    setPreviousCursors([]);
    setShouldRefreshFeeds(true);
  };

  useEffect(() => {
    if (!shouldRefreshFeeds) {
      return;
    }

    setShouldRefreshFeeds(false);
    Promise.resolve(refetchFeedList()).catch(() => {
      // the query state already exposes fetch errors to the UI
    });
  }, [shouldRefreshFeeds, refetchFeedList]);

  const resolveErrorMessage = (error: unknown): string => {
    if (error instanceof HttpError) {
      const code = extractErrorCode(error);

      if (error.status === 409 && code === 'FEED_ALREADY_EXISTS') {
        return t('feeds.errors.duplicate', 'Este feed ja foi adicionado.');
      }

      if (error.status === 400 && code === 'INVALID_URL') {
        return t('feeds.errors.invalidUrl', 'Informe uma URL valida iniciando com http:// ou https://');
      }

      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return t('feeds.errors.generic', 'A operacao falhou. Tente novamente.');
  };

  const getDuplicateReasonLabel = (reason: FeedDuplicateReason) => {
    if (reason === 'ALREADY_EXISTS') {
      return t('feeds.bulkForm.reasons.alreadyExists', 'Este feed ja existe para o usuario.');
    }

    return t('feeds.bulkForm.reasons.duplicateInPayload', 'URL duplicada no envio em lote.');
  };

  const getInvalidReasonLabel = (reason: FeedInvalidReason) => {
    if (reason === 'URL_REQUIRED') {
      return t('feeds.bulkForm.reasons.urlRequired', 'URL obrigatoria.');
    }

    return t('feeds.bulkForm.reasons.invalidUrl', 'Formato de URL invalido.');
  };

  const handleCreateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSingleFeedback(null);
    setListFeedback(null);

    const trimmedUrl = singleUrl.trim();
    const trimmedTitle = singleTitle.trim();

    if (!trimmedUrl) {
      setSingleFeedback({
        type: 'error',
        message: t('feeds.form.errors.urlRequired', 'Informe uma URL.'),
      });
      return;
    }

    if (!isValidUrl(trimmedUrl)) {
      setSingleFeedback({
        type: 'error',
        message: t('feeds.form.errors.invalidUrl', 'Informe uma URL valida iniciando com http:// ou https://'),
      });
      return;
    }

    const payload: { url: string; title?: string | null } = { url: trimmedUrl };

    if (trimmedTitle.length > 0) {
      payload.title = trimmedTitle;
    }

    createFeed.mutate(payload, {
      onSuccess: () => {
        setSingleFeedback({
          type: 'success',
          message: t('feeds.form.success', 'Feed adicionado com sucesso.'),
        });
        setSingleUrl('');
        setSingleTitle('');
        resetPagination();
      },
      onError: (error) => {
        setSingleFeedback({ type: 'error', message: resolveErrorMessage(error) });
      },
    });
  };

  const handleBulkSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBulkFeedback(null);
    setListFeedback(null);

    const lines = bulkInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      setBulkSummary(null);
      setBulkFeedback({
        type: 'error',
        message: t('feeds.bulkForm.errors.empty', 'Informe ao menos uma URL para adicionar.'),
      });
      return;
    }

    const seen = new Set<string>();
    const sanitized: string[] = [];
    const localDuplicates: BulkSummary['duplicates'] = [];
    const localInvalid: BulkSummary['invalid'] = [];

      for (const candidate of lines) {
        if (seen.has(candidate)) {
          localDuplicates.push({ url: candidate, reason: 'DUPLICATE_IN_PAYLOAD', feedId: null });
          continue;
        }

        seen.add(candidate);

        if (!isValidUrl(candidate)) {
          localInvalid.push({ url: candidate, reason: 'INVALID_URL' });
          continue;
        }

        sanitized.push(candidate);
      }

    if (sanitized.length === 0) {
      setBulkSummary({ created: [], duplicates: localDuplicates, invalid: localInvalid });
      setBulkFeedback({
        type: 'error',
        message: t('feeds.bulkForm.errors.noValidEntries', 'Nenhuma URL valida para envio.'),
      });
      return;
    }

    bulkCreate.mutate(
      { urls: sanitized },
      {
        onSuccess: (result) => {
          const summary: BulkSummary = {
            created: result.created,
            duplicates: [...result.duplicates, ...localDuplicates],
            invalid: [...result.invalid, ...localInvalid],
          };

          setBulkSummary(summary);
          setBulkFeedback({
            type: 'success',
            message: t('feeds.bulkForm.success', {
              count: result.created.length,
            }),
          });
          setBulkInput('');
          resetPagination();
        },
        onError: (error) => {
          setBulkSummary({ created: [], duplicates: localDuplicates, invalid: localInvalid });
          setBulkFeedback({ type: 'error', message: resolveErrorMessage(error) });
        },
      },
    );
  };

  const handleStartEditing = (feed: Feed) => {
    setEditFeedback(null);
    setListFeedback(null);
    setEditingFeed(feed);
    setEditUrl(feed.url);
    setEditTitle(feed.title ?? '');
  };

  const handleCancelEdit = () => {
    setEditingFeed(null);
    setEditUrl('');
    setEditTitle('');
    setEditFeedback(null);
  };

  const handleEditSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editingFeed) {
      return;
    }

    setEditFeedback(null);
    setListFeedback(null);

    const trimmedUrl = editUrl.trim();
    const trimmedTitle = editTitle.trim();

    if (!trimmedUrl) {
      setEditFeedback({
        type: 'error',
        message: t('feeds.list.edit.errors.urlRequired', 'Informe uma URL.'),
      });
      return;
    }

    if (!isValidUrl(trimmedUrl)) {
      setEditFeedback({
        type: 'error',
        message: t('feeds.list.edit.errors.invalidUrl', 'Informe uma URL valida iniciando com http:// ou https://'),
      });
      return;
    }

    const payload: { id: number; url?: string; title?: string | null } = {
      id: editingFeed.id,
    };

    if (trimmedUrl !== editingFeed.url) {
      payload.url = trimmedUrl;
    }

    const originalTitle = editingFeed.title ?? '';
    if (trimmedTitle !== originalTitle) {
      payload.title = trimmedTitle;
    }

    updateFeedMutation.mutate(payload, {
      onSuccess: () => {
        setListFeedback({
          type: 'success',
          message: t('feeds.list.feedback.updated', 'Feed atualizado com sucesso.'),
        });
        handleCancelEdit();
      },
      onError: (error) => {
        setEditFeedback({ type: 'error', message: resolveErrorMessage(error) });
      },
    });
  };

  const handleRequestDelete = (feed: Feed) => {
    setListFeedback(null);
    setEditFeedback(null);
    setDeleteFeedback(null);
    setFeedPendingDeletion(feed);
  };

  const handleCloseDeleteDialog = () => {
    if (isDeleting) {
      return;
    }

    setFeedPendingDeletion(null);
    setDeleteFeedback(null);
  };

  const handleConfirmDelete = () => {
    if (!feedPendingDeletion) {
      return;
    }

    const targetFeed = feedPendingDeletion;

    setDeleteFeedback(null);
    deleteFeedMutation.mutate(targetFeed.id, {
      onSuccess: () => {
        setListFeedback({
          type: 'success',
          message: t('feeds.list.feedback.removed', 'Feed removido com sucesso.'),
        });
        setFeedPendingDeletion(null);
        setDeleteFeedback(null);
        if (editingFeed?.id === targetFeed.id) {
          handleCancelEdit();
        }
        resetPagination();
      },
      onError: (error) => {
        const message = resolveErrorMessage(error);
        setDeleteFeedback({ type: 'error', message });
        setListFeedback({ type: 'error', message });
      },
    });
  };

  const deleteDialogTitleId = useId();
  const deleteDialogDescriptionId = useId();

  const handleResetFeeds = async () => {
    if (!isAdmin) {
      return;
    }

    const browserWindow = 'window' in globalThis ? globalThis.window : undefined;
    const confirmed =
      browserWindow?.confirm(
        t(
          'feeds.reset.confirmation',
          'Esta ação excluirá todas as notícias e posts gerados a partir dos feeds e reiniciará o processamento de todos os feeds. Deseja continuar?',
        ),
      ) ?? false;

    if (!confirmed) {
      return;
    }

    setListFeedback(null);

    try {
      const result = await resetFeedsMutation.mutateAsync();
      const message = t(
        'feeds.reset.success',
        'Reset concluído. Feeds reiniciados: {{feeds}} · Notícias removidas: {{articles}} · Posts removidos: {{posts}}.',
        {
          feeds: result.feedsResetCount,
          articles: result.articlesDeletedCount,
          posts: result.postsDeletedCount,
        },
      );
      setListFeedback({ type: 'success', message });
    } catch {
      setListFeedback({
        type: 'error',
        message: t(
          'feeds.reset.error',
          'Não foi possível concluir o reset. Tente novamente ou contate o administrador.',
        ),
      });
    }
  };

  const renderBulkSummary = () => {
    if (!bulkSummary) {
      return null;
    }

    const { created, duplicates, invalid } = bulkSummary;

    const createdContent =
      created.length > 0 ? (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {created.map((feed) => (
            <li key={feed.id} className="rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground break-all">{feed.title ?? feed.url}</p>
              <p className="mt-1 text-xs text-muted-foreground break-all">{feed.url}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('feeds.bulkForm.summary.feedId', { id: feed.id })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('feeds.bulkForm.summary.none', 'Nenhum item nesta categoria.')}</p>
      );

    const duplicateContent =
      duplicates.length > 0 ? (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {duplicates.map((entry) => (
            <li
              key={`${entry.url}-${entry.feedId ?? 'local'}`}
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800"
            >
              <p className="text-sm font-medium break-all">{entry.url}</p>
              <p className="mt-1 text-xs">
                {getDuplicateReasonLabel(entry.reason)}
                {entry.feedId ? ` • ${t('feeds.bulkForm.summary.feedId', { id: entry.feedId })}` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('feeds.bulkForm.summary.none', 'Nenhum item nesta categoria.')}</p>
      );

    const invalidContent =
      invalid.length > 0 ? (
        <ul className="space-y-2 text-sm text-muted-foreground">
          {invalid.map((entry) => (
            <li key={`${entry.url}-${entry.reason}`} className="rounded-md border border-destructive/60 bg-destructive/10 p-3">
              <p className="text-sm font-medium text-foreground break-all">{entry.url}</p>
              <p className="mt-1 text-xs text-destructive">{getInvalidReasonLabel(entry.reason)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('feeds.bulkForm.summary.none', 'Nenhum item nesta categoria.')}</p>
      );

    return (
      <div className="rounded-md border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">{t('feeds.bulkForm.summary.title', 'Resumo da operacao')}</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">{t('feeds.bulkForm.summary.created', { count: created.length })}</h4>
            {createdContent}
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">{t('feeds.bulkForm.summary.duplicates', { count: duplicates.length })}</h4>
            {duplicateContent}
          </div>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">{t('feeds.bulkForm.summary.invalid', { count: invalid.length })}</h4>
            {invalidContent}
          </div>
        </div>
      </div>
    );
  };

  const renderTableContent = () => {
    if (isLoading) {
      return (
        <div className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
          {t('feeds.list.loading', 'Carregando feeds...')}
        </div>
      );
    }

    if (isError) {
      return (
        <div className="px-4 py-6 text-sm text-destructive sm:px-6" role="alert">
          {t('feeds.list.error', 'Nao foi possivel carregar os feeds. Tente novamente mais tarde.')}
        </div>
      );
    }

    if (feeds.length === 0) {
      return (
        <EmptyState
          title={t('feeds.list.empty.title', 'Nenhum feed cadastrado ainda.')}
          description={t('feeds.list.empty.description', 'Adicione seus feeds individuais ou em lote para comecar a gerar posts.')}
          className="m-6"
        />
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/50 text-left uppercase text-xs tracking-wide text-muted-foreground">
            <tr>
              <th className="px-6 py-3">{t('feeds.list.headers.feed', 'Feed')}</th>
              <th className="px-6 py-3">{t('feeds.list.headers.lastFetchedAt', 'Ultima atualizacao')}</th>
              <th className="px-6 py-3 text-right">{t('feeds.list.headers.actions', 'Acoes')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {feeds.map((feed) =>
              editingFeed?.id === feed.id ? (
                <tr key={feed.id} className="bg-muted/40">
                  <td className="px-6 py-4" colSpan={3}>
                    <form className="space-y-4" onSubmit={handleEditSubmit} noValidate>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="text-sm">
                          <span className="mb-1 block font-medium">{t('feeds.list.edit.url', 'URL')}</span>
                          <input
                            type="url"
                            value={editUrl}
                            onChange={(event) => setEditUrl(event.target.value)}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                            placeholder="https://example.com/feed.xml"
                            required
                            disabled={isUpdating}
                          />
                        </label>
                        <label className="text-sm">
                          <span className="mb-1 block font-medium">{t('feeds.list.edit.title', 'Titulo')}</span>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                            placeholder={t('feeds.list.edit.titlePlaceholder', 'Opcional')}
                            disabled={isUpdating}
                          />
                        </label>
                      </div>
                      {editFeedback ? (
                        <p
                          className={buildFeedbackClassName(editFeedback)}
                          {...buildFeedbackAccessibilityProps(editFeedback)}
                        >
                          {editFeedback.message}
                        </p>
                      ) : null}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                        <button
                          type="button"
                          className="inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                          onClick={handleCancelEdit}
                          disabled={isUpdating}
                        >
                          {t('feeds.list.edit.cancel', 'Cancelar')}
                        </button>
                        <button
                          type="submit"
                          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                          disabled={isUpdating}
                        >
                          {isUpdating
                            ? t('feeds.list.edit.saving', 'Salvando...')
                            : t('feeds.list.edit.save', 'Salvar alteracoes')}
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={feed.id}>
                  <td className="px-6 py-4 align-top">
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium text-foreground">
                          {feed.title ?? t('feeds.list.untitled', 'Sem titulo')}
                        </span>
                        <a
                          href={feed.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all text-xs text-primary underline-offset-2 hover:underline"
                        >
                          {feed.url}
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('feeds.list.feedId', { id: feed.id })}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4 align-top text-sm text-muted-foreground">
                    {feed.lastFetchedAt
                      ? formatDate(feed.lastFetchedAt, locale)
                      : t('feeds.list.neverFetched', 'Ainda nao processado')}
                  </td>
                  <td className="px-6 py-4 align-top text-right text-sm">
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        onClick={() => handleStartEditing(feed)}
                        disabled={isUpdating || isDeleting}
                      >
                        {t('feeds.list.edit.trigger', 'Editar')}
                      </button>
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center rounded-md border border-destructive px-3 py-2 text-xs font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        onClick={() => handleRequestDelete(feed)}
                        disabled={isDeleting || isUpdating}
                      >
                        {isDeleting ? t('feeds.list.deleting', 'Removendo...') : t('feeds.list.delete', 'Excluir')}
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const hasPreviousPage = previousCursors.length > 0;
  const hasNextPage = nextCursor !== null;

  const handlePreviousPage = () => {
    if (!hasPreviousPage) {
      return;
    }

    const nextPrev = previousCursors.slice(0, -1);
    const previous = previousCursors.at(-1) ?? null;
    setPreviousCursors(nextPrev);
    setCursor(previous);
  };

  const handleNextPage = () => {
    if (!hasNextPage || !nextCursor) {
      return;
    }

    setPreviousCursors((prev) => [...prev, cursor]);
    setCursor(nextCursor);
  };

  const deleteDialog =
    feedPendingDeletion && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
            <div className="fixed inset-0 bg-background/80 backdrop-blur" aria-hidden="true" />
            <dialog
              aria-labelledby={deleteDialogTitleId}
              aria-describedby={deleteDialogDescriptionId}
              className="relative z-10 w-full max-w-md space-y-6 rounded-lg border border-border bg-background p-6 shadow-lg"
              aria-modal="true"
              open
            >
              <div className="space-y-2">
                <h2 id={deleteDialogTitleId} className="text-lg font-semibold text-foreground">
                  {t('feeds.list.deleteConfirmTitle', 'Remover feed')}
                </h2>
                <p id={deleteDialogDescriptionId} className="text-sm text-muted-foreground">
                  {t('feeds.list.deleteConfirm', 'Remover este feed?')}
                </p>
              </div>
              <div className="space-y-1 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">
                  {feedPendingDeletion.title ?? t('feeds.list.untitled', 'Sem titulo')}
                </span>
                <span className="break-all text-xs text-muted-foreground">{feedPendingDeletion.url}</span>
              </div>
              {deleteFeedback ? (
                <p
                  className={buildFeedbackClassName(deleteFeedback)}
                  {...buildFeedbackAccessibilityProps(deleteFeedback)}
                >
                  {deleteFeedback.message}
                </p>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  onClick={handleCloseDeleteDialog}
                  disabled={isDeleting}
                >
                  {t('feeds.list.edit.cancel', 'Cancelar')}
                </button>
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('feeds.list.deleting', 'Removendo...') : t('feeds.list.delete', 'Excluir')}
                </button>
              </div>
            </dialog>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">{t('feeds.heading', 'Feeds RSS')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('feeds.subtitle', 'Gerencie os feeds que alimentarao a geracao de posts.')} 
        </p>
      </header>

      <section className="card space-y-4 px-4 py-6 sm:px-6">
        <h2 className="text-lg font-medium text-foreground">{t('feeds.form.title', 'Adicionar feed')}</h2>
        <form className="grid gap-4 md:grid-cols-[2fr,1fr,auto]" onSubmit={handleCreateSubmit} noValidate>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t('feeds.form.url', 'URL')}</span>
            <input
              type="url"
              value={singleUrl}
              onChange={(event) => setSingleUrl(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="https://example.com/feed.xml"
              required
              disabled={isCreating}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t('feeds.form.titleLabel', 'Titulo (opcional)')}</span>
            <input
              type="text"
              value={singleTitle}
              onChange={(event) => setSingleTitle(event.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder={t('feeds.form.titlePlaceholder', 'Ex.: Blog da empresa')}
              disabled={isCreating}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isCreating}
            >
              {isCreating ? t('feeds.form.adding', 'Adicionando...') : t('feeds.form.submit', 'Adicionar')}
            </button>
          </div>
        </form>
        {singleFeedback ? (
          <p
            className={buildFeedbackClassName(singleFeedback)}
            {...buildFeedbackAccessibilityProps(singleFeedback)}
          >
            {singleFeedback.message}
          </p>
        ) : null}
      </section>

      <section className="card space-y-4 px-4 py-6 sm:px-6">
        <h2 className="text-lg font-medium text-foreground">{t('feeds.bulkForm.title', 'Adicionar feeds em lote')}</h2>
        <form className="space-y-4" onSubmit={handleBulkSubmit} noValidate>
          <label className="text-sm">
            <span className="mb-1 block font-medium">{t('feeds.bulkForm.label', 'Uma URL por linha')}</span>
            <textarea
              value={bulkInput}
              onChange={(event) => setBulkInput(event.target.value)}
              rows={6}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder={t('feeds.bulkForm.placeholder', 'https://example.com/feed-1.xml\nhttps://example.com/feed-2.xml')}
              disabled={isBulkCreating}
            />
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t('feeds.bulkForm.hint', 'Linhas vazias sao ignoradas e duplicatas locais nao serao enviadas.')}
            </p>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={isBulkCreating}
            >
              {isBulkCreating ? t('feeds.bulkForm.adding', 'Processando...') : t('feeds.bulkForm.submit', 'Adicionar em lote')}
            </button>
          </div>
        </form>
        {bulkFeedback ? (
          <p
            className={buildFeedbackClassName(bulkFeedback)}
            {...buildFeedbackAccessibilityProps(bulkFeedback)}
          >
            {bulkFeedback.message}
          </p>
        ) : null}
        {renderBulkSummary()}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-lg font-medium text-foreground">{t('feeds.list.title', 'Feeds do usuario')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('feeds.list.caption', {
                count: totalFeeds,
                page: currentPage,
              })}
            </p>
          </div>
        <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end sm:text-right">
          {isAdmin ? (
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-md border border-destructive px-3 py-2 text-xs font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                onClick={() => {
                  void handleResetFeeds();
                }}
                disabled={isResettingFeeds}
              >
                {isResettingFeeds
                  ? t('feeds.reset.pending', 'Resetando...')
                  : t('feeds.reset.action', 'Resetar feeds (admin)')}
              </button>
            ) : null}
            {isFetching ? (
              <span className="text-xs text-muted-foreground">{t('feeds.list.syncing', 'Sincronizando...')}</span>
            ) : null}
            {listFeedback ? (
              <p
                className={buildFeedbackClassName(listFeedback)}
                {...buildFeedbackAccessibilityProps(listFeedback)}
              >
                {listFeedback.message}
              </p>
            ) : null}
          </div>
        </div>
        {renderTableContent()}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>{t('feeds.list.pagination.page', { page: currentPage })}</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              onClick={handlePreviousPage}
              disabled={!hasPreviousPage || isLoading}
            >
              {t('feeds.list.pagination.previous', 'Anterior')}
            </button>
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              onClick={handleNextPage}
              disabled={!hasNextPage || isLoading}
            >
              {t('feeds.list.pagination.next', 'Proxima')}
            </button>
          </div>
        </div>
      </section>
      {deleteDialog}
    </div>
  );
};

export default FeedsPage;
