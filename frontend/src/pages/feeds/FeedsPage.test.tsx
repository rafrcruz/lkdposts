import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import type { Mock, MockedFunction } from 'vitest';
import type { UseMutationResult, UseMutateAsyncFunction, UseQueryResult } from '@tanstack/react-query';

import i18n from '@/config/i18n';
import FeedsPage from './FeedsPage';
import {
  useBulkCreateFeeds,
  useCreateFeed,
  useDeleteFeed,
  useFeedList,
  useResetFeeds,
  useUpdateFeed,
} from '@/features/feeds/hooks/useFeeds';
import type { Feed, FeedResetSummary } from '@/features/feeds/types/feed';
import { fetchFeeds, type FeedListResponse } from '@/features/feeds/api/feeds';
import { HttpError } from '@/lib/api/http';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { AuthContextValue } from '@/features/auth/context/AuthContext';

type FeedsHooksModule = typeof import('@/features/feeds/hooks/useFeeds');

vi.mock('@/features/feeds/hooks/useFeeds', () => ({
  useFeedList: vi.fn<
    Parameters<FeedsHooksModule['useFeedList']>,
    ReturnType<FeedsHooksModule['useFeedList']>
  >(),
  useCreateFeed: vi.fn<
    Parameters<FeedsHooksModule['useCreateFeed']>,
    ReturnType<FeedsHooksModule['useCreateFeed']>
  >(),
  useBulkCreateFeeds: vi.fn<
    Parameters<FeedsHooksModule['useBulkCreateFeeds']>,
    ReturnType<FeedsHooksModule['useBulkCreateFeeds']>
  >(),
  useUpdateFeed: vi.fn<
    Parameters<FeedsHooksModule['useUpdateFeed']>,
    ReturnType<FeedsHooksModule['useUpdateFeed']>
  >(),
  useResetFeeds: vi.fn<
    Parameters<FeedsHooksModule['useResetFeeds']>,
    ReturnType<FeedsHooksModule['useResetFeeds']>
  >(),
  useDeleteFeed: vi.fn<
    Parameters<FeedsHooksModule['useDeleteFeed']>,
    ReturnType<FeedsHooksModule['useDeleteFeed']>
  >(),
}));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/features/feeds/api/feeds', () => ({
  fetchFeeds: vi.fn(),
}));

const mockedUseFeedList = vi.mocked(useFeedList);
const mockedUseCreateFeed = vi.mocked(useCreateFeed);
const mockedUseBulkCreateFeeds = vi.mocked(useBulkCreateFeeds);
const mockedUseUpdateFeed = vi.mocked(useUpdateFeed);
const mockedUseResetFeeds = vi.mocked(useResetFeeds);
const mockedUseDeleteFeed = vi.mocked(useDeleteFeed);
const mockedUseAuth = vi.mocked(useAuth);
const mockedFetchFeeds = vi.mocked(fetchFeeds);

type CreateVariables = { url: string; title?: string | null };
type CreateOptions = Parameters<UseMutationResult<Feed, HttpError, CreateVariables>['mutate']>[1];
type BulkVariables = { urls: string[] };
type BulkOptions = Parameters<UseMutationResult<unknown, HttpError, BulkVariables>['mutate']>[1];
type UpdateVariables = { id: number; url?: string; title?: string | null };
type UpdateOptions = Parameters<UseMutationResult<Feed, HttpError, UpdateVariables>['mutate']>[1];
type DeleteOptions = Parameters<UseMutationResult<{ message: string }, HttpError, number>['mutate']>[1];
type ResetOptions = Parameters<UseMutationResult<FeedResetSummary, HttpError, void>['mutate']>[1];

const buildFeed = (override: Partial<Feed> = {}): Feed => {
  const hasTitleOverride = Object.hasOwn(override, 'title');

  return {
    id: override.id ?? 1,
    url: override.url ?? 'https://example.com/feed.xml',
    title: hasTitleOverride ? (override.title ?? null) : 'Example feed',
    lastFetchedAt: override.lastFetchedAt ?? null,
    createdAt: override.createdAt ?? '2024-01-01T00:00:00.000Z',
    updatedAt: override.updatedAt ?? '2024-01-01T00:00:00.000Z',
  };
};

const createQueryResult = (
  data: FeedListResponse,
  override: Partial<UseQueryResult<FeedListResponse, HttpError>> = {},
): UseQueryResult<FeedListResponse, HttpError> => {
  const refetch = vi.fn<
    Parameters<UseQueryResult<FeedListResponse, HttpError>['refetch']>,
    ReturnType<UseQueryResult<FeedListResponse, HttpError>['refetch']>
  >();
  const remove = vi.fn<Parameters<UseQueryResult<FeedListResponse, HttpError>['remove']>, void>();
  const base: UseQueryResult<FeedListResponse, HttpError> = {
    data,
    dataUpdatedAt: Date.now(),
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    failureReasonUpdatedAt: 0,
    fetchStatus: 'idle',
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isRefetchError: false,
    isRefetching: false,
    isSuccess: true,
    refetch,
    remove,
    status: 'success',
  };

  return { ...base, ...override };
};

const createMutationResult = <TData, TVariables>(
  mutateMock: Mock<
    (
      variables: TVariables,
      options?: Parameters<UseMutationResult<TData, HttpError, TVariables>['mutate']>[1],
    ) => void
  >,
  overrides: Partial<Omit<UseMutationResult<TData, HttpError, TVariables>, 'mutate'>> = {},
): UseMutationResult<TData, HttpError, TVariables> => {
  const mutate: UseMutationResult<TData, HttpError, TVariables>['mutate'] = (variables, options) => {
    mutateMock(variables, options);
  };
  const mutateAsync = vi.fn<
    Parameters<UseMutateAsyncFunction<TData, HttpError, TVariables, unknown>>,
    ReturnType<UseMutateAsyncFunction<TData, HttpError, TVariables, unknown>>
  >();
  const base: UseMutationResult<TData, HttpError, TVariables> = {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isError: false,
    isIdle: true,
    isPending: false,
    isPaused: false,
    isSuccess: false,
    mutate,
    mutateAsync,
    reset: vi.fn(),
    status: 'idle',
    submittedAt: 0,
    variables: undefined,
  };

  return { ...base, ...overrides, mutate };
};

const buildAuthContext = (override: Partial<AuthContextValue> = {}): AuthContextValue => {
  const defaultUser = { email: 'user@example.com', role: 'user' as const, expiresAt: '2024-01-01T00:00:00.000Z' };

  return {
    status: override.status ?? 'authenticated',
    user: Object.hasOwn(override, 'user') ? override.user ?? null : defaultUser,
    isAuthenticating: override.isAuthenticating ?? false,
    authError: override.authError ?? null,
    loginWithGoogle: override.loginWithGoogle ?? vi.fn(),
    logout: override.logout ?? vi.fn(),
    clearAuthError: override.clearAuthError ?? vi.fn(),
    refreshSession: override.refreshSession ?? vi.fn(),
  };
};

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <FeedsPage />
    </I18nextProvider>,
  );

let createMutate: Mock<(variables: CreateVariables, options?: CreateOptions) => void>;
let bulkMutate: Mock<(variables: BulkVariables, options?: BulkOptions) => void>;
let updateMutate: Mock<(variables: UpdateVariables, options?: UpdateOptions) => void>;
let deleteMutate: Mock<(variables: number, options?: DeleteOptions) => void>;
let resetMutate: Mock<(variables: void, options?: ResetOptions) => void>;
let resetMutateAsync: MockedFunction<
  UseMutateAsyncFunction<FeedResetSummary, HttpError, void, unknown>
>;
let feedListQueryResult: UseQueryResult<FeedListResponse, HttpError>;
let originalConfirm: typeof globalThis.confirm | undefined;

beforeEach(() => {
  const feeds = [
    buildFeed({ id: 1, title: 'Feed 1', url: 'https://example.com/1.xml', lastFetchedAt: null }),
    buildFeed({ id: 2, title: 'Feed 2', url: 'https://example.com/2.xml', lastFetchedAt: '2024-01-01T12:00:00.000Z' }),
  ];

  feedListQueryResult = createQueryResult({
    items: feeds,
    meta: { nextCursor: null, total: feeds.length, limit: 10 },
  });
  mockedUseFeedList.mockReturnValue(feedListQueryResult);

  createMutate = vi.fn<(variables: CreateVariables, options?: CreateOptions) => void>();
  bulkMutate = vi.fn<(variables: BulkVariables, options?: BulkOptions) => void>();
  updateMutate = vi.fn<(variables: UpdateVariables, options?: UpdateOptions) => void>();
  deleteMutate = vi.fn<(variables: number, options?: DeleteOptions) => void>();
  resetMutate = vi.fn<(variables: void, options?: ResetOptions) => void>();
  resetMutateAsync = vi.fn<
    Parameters<UseMutateAsyncFunction<FeedResetSummary, HttpError, void, unknown>>,
    ReturnType<UseMutateAsyncFunction<FeedResetSummary, HttpError, void, unknown>>
  >();

  mockedUseCreateFeed.mockReturnValue(
    createMutationResult<Feed, CreateVariables>(createMutate, { isPending: false }),
  );

  mockedUseBulkCreateFeeds.mockReturnValue(
    createMutationResult<unknown, BulkVariables>(bulkMutate, { isPending: false }),
  );

  mockedUseUpdateFeed.mockReturnValue(
    createMutationResult<Feed, UpdateVariables>(updateMutate, { isPending: false }),
  );

  mockedUseDeleteFeed.mockReturnValue(
    createMutationResult<{ message: string }, number>(deleteMutate, { isPending: false }),
  );

  mockedUseResetFeeds.mockReturnValue(
    createMutationResult<FeedResetSummary, void>(resetMutate, {
      isPending: false,
      mutateAsync: resetMutateAsync,
    }),
  );

  mockedUseAuth.mockReturnValue(buildAuthContext());
  mockedFetchFeeds.mockReset();
  mockedFetchFeeds.mockResolvedValue({
    items: [],
    meta: { nextCursor: null, total: 0, limit: 50 },
  });

  if (typeof globalThis.confirm === 'function') {
    originalConfirm = globalThis.confirm;
    globalThis.confirm = vi.fn().mockReturnValue(true);
  }
});

afterEach(() => {
  vi.clearAllMocks();

  if (originalConfirm) {
    globalThis.confirm = originalConfirm;
    originalConfirm = undefined;
  }
});

describe('FeedsPage', () => {
  it('renders feed list with pagination controls', () => {
    const feeds = [
      buildFeed({ id: 10, title: 'Primeiro feed', url: 'https://site.com/rss', lastFetchedAt: null }),
      buildFeed({ id: 11, title: 'Segundo feed', url: 'https://site.com/blog', lastFetchedAt: '2024-02-02T10:00:00.000Z' }),
    ];

    mockedUseFeedList.mockReturnValue(
      createQueryResult({ items: feeds, meta: { nextCursor: '22', total: 20, limit: 10 } }),
    );

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: /Feeds RSS/i })).toBeInTheDocument();
    expect(screen.getByText('https://site.com/rss')).toBeInTheDocument();
    expect(screen.getByText('https://site.com/blog')).toBeInTheDocument();
    expect(screen.getByText('Ainda nao processado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Proxima/i })).not.toBeDisabled();
  });

  it('allows filtering feeds by partial URL', async () => {
    const user = userEvent.setup();

    renderPage();
    mockedUseFeedList.mockClear();

    const searchInput = screen.getByLabelText(/Filtrar por URL/i);
    await user.clear(searchInput);
    await user.type(searchInput, '  blog ');
    await user.click(screen.getByRole('button', { name: /Buscar/i }));

    await waitFor(() => {
      expect(mockedUseFeedList).toHaveBeenCalledWith({ cursor: null, limit: 10, search: 'blog' });
    });
  });

  it('shows a dedicated empty state when the search returns no feeds', async () => {
    const user = userEvent.setup();

    const emptyResult = createQueryResult({ items: [], meta: { nextCursor: null, total: 0, limit: 10 } });
    mockedUseFeedList.mockReturnValue(emptyResult);

    renderPage();

    expect(
      screen.getByText('Nenhum feed cadastrado ainda.', { exact: false }),
    ).toBeInTheDocument();

    const searchInput = screen.getByLabelText(/Filtrar por URL/i);
    await user.clear(searchInput);
    await user.type(searchInput, 'news');
    await user.click(screen.getByRole('button', { name: /Buscar/i }));

    await screen.findByText('Nenhum feed encontrado para esta busca.');
    expect(
      screen.getByText('Ajuste o filtro ou limpe a busca para ver todos os feeds.'),
    ).toBeInTheDocument();
  });

  it('creates feed individually and shows success feedback', async () => {
    const user = userEvent.setup();

    createMutate.mockImplementation((variables, options) => {
      const created = buildFeed({ id: 30, url: variables.url, title: variables.title ?? undefined });
      options?.onSuccess?.(created, variables, undefined);
    });

    renderPage();

    const urlInput = screen.getByLabelText(/^URL$/i);
    await user.clear(urlInput);
    await user.type(urlInput, '  https://news.com/feed.xml  ');
    const titleInput = screen.getByLabelText(/^Titulo/i);
    await user.clear(titleInput);
    await user.type(titleInput, '  Noticias ');
    await user.click(screen.getByRole('button', { name: /Adicionar$/i }));

    expect(createMutate).toHaveBeenCalledWith(
      { url: 'https://news.com/feed.xml', title: 'Noticias' },
      expect.any(Object),
    );
    expect(screen.getByText('Feed adicionado com sucesso.')).toBeInTheDocument();
    expect(urlInput).toHaveValue('');
    expect(titleInput).toHaveValue('');
    await waitFor(() => {
      expect(feedListQueryResult.refetch).toHaveBeenCalledTimes(1);
    });
  });

  it('validates URL locally before creating feed', async () => {
    const user = userEvent.setup();

    renderPage();

    const urlField = screen.getByLabelText(/^URL$/i);
    await user.clear(urlField);
    await user.type(urlField, 'invalid-url');
    expect(urlField).toHaveValue('invalid-url');
    await user.click(screen.getByRole('button', { name: /Adicionar$/i }));

    expect(createMutate).not.toHaveBeenCalled();
    await screen.findByText(
      (content) =>
        content.includes('Informe uma URL') ||
        content.includes('Enter a valid URL starting with http:// or https://'),
    );
  });

  it('displays duplicate error when API rejects creation', async () => {
    const user = userEvent.setup();

    const duplicateError = new HttpError('duplicate', 409, {
      error: { code: 'FEED_ALREADY_EXISTS' },
    });

    createMutate.mockImplementation((variables, options) => {
      options?.onError?.(duplicateError, variables, undefined);
    });

    renderPage();

    const editUrlInput = screen.getByLabelText(/^URL$/i);
    await user.clear(editUrlInput);
    await user.type(editUrlInput, 'https://news.com/feed.xml');
    await user.click(screen.getByRole('button', { name: /Adicionar$/i }));

    expect(createMutate).toHaveBeenCalled();
    expect(screen.getByText('Este feed ja foi adicionado.')).toBeInTheDocument();
  });

  it('shows bulk creation summary with created, duplicates and invalid entries', async () => {
    const user = userEvent.setup();

    const createdFeed = buildFeed({ id: 40, url: 'https://valid-1.com/rss', title: null });
    const createdFeed2 = buildFeed({ id: 41, url: 'https://valid-2.com/rss', title: 'Valid 2' });

    bulkMutate.mockImplementation((variables, options) => {
      options?.onSuccess?.(
        {
          created: [createdFeed, createdFeed2],
          duplicates: [{ url: 'https://existing.com/rss', reason: 'ALREADY_EXISTS', feedId: 5 }],
          invalid: [],
        },
        variables,
        undefined,
      );
    });

    renderPage();

    const textarea = screen.getByLabelText(/Uma URL por linha/i);
    await user.clear(textarea);
    await user.type(
      textarea,
      'https://valid-1.com/rss\n\ninvalid-url\nhttps://valid-1.com/rss\nhttps://valid-2.com/rss',
    );
    await user.click(screen.getByRole('button', { name: /Adicionar em lote/i }));

    expect(bulkMutate).toHaveBeenCalledWith(
      { urls: ['https://valid-1.com/rss', 'https://valid-2.com/rss'] },
      expect.any(Object),
    );

    const successMessage = i18n.t('feeds.bulkForm.success', { count: 2 });
    expect(screen.getByText(successMessage)).toBeInTheDocument();
    await waitFor(() => {
      expect(feedListQueryResult.refetch).toHaveBeenCalledTimes(1);
    });

    const summaryTitle = i18n.t('feeds.bulkForm.summary.title', 'Resumo da operacao');
    const summary = screen.getByText(summaryTitle).closest('div');
    expect(summary).not.toBeNull();
    const summaryElement = summary as HTMLElement;

    const createdHeading = i18n.t('feeds.bulkForm.summary.created', { count: 2 });
    const createdSection = within(summaryElement).getByText(createdHeading).closest('div');
    expect(createdSection).not.toBeNull();
    const createdElement = createdSection as HTMLElement;
    expect(within(createdElement).getAllByText('https://valid-1.com/rss').length).toBeGreaterThan(0);
    expect(within(createdElement).getAllByText('https://valid-2.com/rss').length).toBeGreaterThan(0);

    const duplicatesHeading = i18n.t('feeds.bulkForm.summary.duplicates', { count: 2 });
    const duplicatesSection = within(summaryElement).getByText(duplicatesHeading).closest('div');
    expect(duplicatesSection).not.toBeNull();
    const duplicatesElement = duplicatesSection as HTMLElement;
    expect(within(duplicatesElement).getByText('https://existing.com/rss')).toBeInTheDocument();
    expect(within(duplicatesElement).getByText('https://valid-1.com/rss')).toBeInTheDocument();
    expect(within(duplicatesElement).getByText('URL duplicada no envio em lote.')).toBeInTheDocument();

    const invalidHeading = i18n.t('feeds.bulkForm.summary.invalid', { count: 1 });
    const invalidSection = within(summaryElement).getByText(invalidHeading).closest('div');
    expect(invalidSection).not.toBeNull();
    const invalidElement = invalidSection as HTMLElement;
    expect(within(invalidElement).getByText('invalid-url')).toBeInTheDocument();
    expect(within(invalidElement).getByText('Formato de URL invalido.')).toBeInTheDocument();
    const feedIdLabel = i18n.t('feeds.bulkForm.summary.feedId', { id: 5 });
    expect(
      within(summaryElement).getByText((content) => content.includes(feedIdLabel)),
    ).toBeInTheDocument();
  });

  it('exports all feeds as CSV', async () => {
    const user = userEvent.setup();

    const firstPage = {
      items: [
        buildFeed({ id: 10, title: 'Feed export 1', url: 'https://export.com/1.xml', lastFetchedAt: '2024-01-05T00:00:00.000Z' }),
      ],
      meta: { nextCursor: '20', total: 3, limit: 50 },
    } satisfies FeedListResponse;

    const secondPage = {
      items: [
        buildFeed({ id: 20, title: null, url: 'https://export.com/2.xml', lastFetchedAt: null }),
        buildFeed({ id: 30, title: 'Feed export 3', url: 'https://export.com/3.xml', lastFetchedAt: '2024-01-07T00:00:00.000Z' }),
      ],
      meta: { nextCursor: null, total: 3, limit: 50 },
    } satisfies FeedListResponse;

    mockedFetchFeeds.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      renderPage();

      const exportButton = screen.getByRole('button', { name: /Exportar CSV/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(mockedFetchFeeds).toHaveBeenCalledTimes(2);
      });

      expect(mockedFetchFeeds).toHaveBeenNthCalledWith(1, { limit: 50 });
      expect(mockedFetchFeeds).toHaveBeenNthCalledWith(2, { cursor: '20', limit: 50 });

      const blobArg = createObjectURLSpy.mock.calls[0]?.[0] as Blob | undefined;
      expect(blobArg).toBeInstanceOf(Blob);
      expect(blobArg?.type).toBe('text/csv;charset=utf-8;');
      expect(blobArg).toBeDefined();
      const csvContent = await blobArg!.text();
      expect(csvContent).toContain('Feed export 1');
      expect(csvContent).toContain('https://export.com/3.xml');

      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock');
      await screen.findByText('Exportação concluída. 3 feeds exportados.');
    } finally {
      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
      clickSpy.mockRestore();
    }
  });

  it('updates feed successfully and closes the edit form', async () => {
    const user = userEvent.setup();

    updateMutate.mockImplementation((variables, options) => {
      const updated = buildFeed({ id: variables.id, url: 'https://example.com/1.xml', title: 'Atualizado' });
      options?.onSuccess?.(updated, variables, undefined);
    });

    renderPage();

    await user.click(screen.getAllByRole('button', { name: /Editar/i })[0]);
    await user.clear(screen.getByDisplayValue('Feed 1'));
    await user.type(screen.getByLabelText(/^Titulo$/i), 'Atualizado');
    await user.click(screen.getByRole('button', { name: /Salvar alteracoes/i }));

    expect(updateMutate).toHaveBeenCalledWith(
      { id: 1, title: 'Atualizado' },
      expect.any(Object),
    );
    expect(screen.getByText('Feed atualizado com sucesso.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Editar/i })[0]).toBeEnabled();
  });

  it('shows duplicate error when updating feed URL to an existing one', async () => {
    const user = userEvent.setup();

    const duplicateError = new HttpError('duplicate', 409, {
      error: { code: 'FEED_ALREADY_EXISTS' },
    });

    updateMutate.mockImplementation((variables, options) => {
      options?.onError?.(duplicateError, variables, undefined);
    });

    renderPage();

    await user.click(screen.getAllByRole('button', { name: /Editar/i })[0]);
    const urlInput = screen.getByDisplayValue('https://example.com/1.xml');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://duplicado.com/rss');
    await user.click(screen.getByRole('button', { name: /Salvar alteracoes/i }));

    expect(updateMutate).toHaveBeenCalled();
    expect(screen.getByText('Este feed ja foi adicionado.')).toBeInTheDocument();
  });

  it('removes feed after confirmation and shows feedback', async () => {
    const user = userEvent.setup();

    deleteMutate.mockImplementation((id, options) => {
      options?.onSuccess?.({ message: 'ok' }, id, undefined);
    });

    renderPage();

    await user.click(screen.getAllByRole('button', { name: /Excluir/i })[0]);

    expect(deleteMutate).not.toHaveBeenCalled();

    const dialogTitle = i18n.t('feeds.list.deleteConfirmTitle', 'Remover feed');
    const dialog = await screen.findByRole('dialog', { name: new RegExp(dialogTitle, 'i') });

    await user.click(within(dialog).getByRole('button', { name: /Excluir/i }));

    expect(deleteMutate).toHaveBeenCalledWith(1, expect.any(Object));
    expect(screen.getByText('Feed removido com sucesso.')).toBeInTheDocument();
    expect(feedListQueryResult.refetch).not.toHaveBeenCalled();
  });

  it('does not render the reset button for non-admin users', () => {
    mockedUseAuth.mockReturnValue(
      buildAuthContext({ user: { email: 'user@example.com', role: 'user', expiresAt: '2024-01-01T00:00:00.000Z' } }),
    );

    renderPage();

    expect(screen.queryByRole('button', { name: /Resetar feeds/i })).not.toBeInTheDocument();
  });

  it('allows admins to trigger feed reset and shows success feedback', async () => {
    const user = userEvent.setup();
    const summary: FeedResetSummary = {
      feedsResetCount: 3,
      articlesDeletedCount: 4,
      postsDeletedCount: 5,
      durationMs: 42,
    };

    resetMutateAsync.mockResolvedValue(summary);
    mockedUseAuth.mockReturnValue(
      buildAuthContext({ user: { email: 'admin@example.com', role: 'admin', expiresAt: '2024-01-01T00:00:00.000Z' } }),
    );

    renderPage();

    const button = screen.getByRole('button', { name: /Resetar feeds \(admin\)/i });
    await user.click(button);

    const dialog = await screen.findByRole('dialog', { name: /Resetar feeds/i });
    await user.click(within(dialog).getByRole('button', { name: /Resetar feeds \(admin\)/i }));

    expect(resetMutateAsync).toHaveBeenCalled();

    const successMessage = i18n.t(
      'feeds.reset.success',
      'Reset concluído. Feeds reiniciados: {{feeds}} · Notícias removidas: {{articles}} · Posts removidos: {{posts}}.',
      {
        feeds: summary.feedsResetCount,
        articles: summary.articlesDeletedCount,
        posts: summary.postsDeletedCount,
      },
    );

    expect(await screen.findByText(successMessage)).toBeInTheDocument();
  });

  it('shows an error message when the reset operation fails', async () => {
    const user = userEvent.setup();
    mockedUseAuth.mockReturnValue(
      buildAuthContext({ user: { email: 'admin@example.com', role: 'admin', expiresAt: '2024-01-01T00:00:00.000Z' } }),
    );

    resetMutateAsync.mockRejectedValue(new HttpError('failure', 500));

    renderPage();

    const button = screen.getByRole('button', { name: /Resetar feeds \(admin\)/i });
    await user.click(button);

    const dialog = await screen.findByRole('dialog', { name: /Resetar feeds/i });
    await user.click(within(dialog).getByRole('button', { name: /Resetar feeds \(admin\)/i }));

    expect(resetMutateAsync).toHaveBeenCalled();

    const errorMessage = i18n.t(
      'feeds.reset.error',
      'Não foi possível concluir o reset. Tente novamente ou contate o administrador.',
    );

    const errorMessages = await screen.findAllByText(errorMessage);
    expect(errorMessages.length).toBeGreaterThan(0);
  });
});

