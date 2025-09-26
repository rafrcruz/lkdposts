import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import i18n from '@/config/i18n';
import PostsPage from './PostsPage';
import {
  useCleanupPosts,
  usePostList,
  useRefreshPosts,
  type PostListParams,
} from '@/features/posts/hooks/usePosts';
import type { PostListResponse } from '@/features/posts/api/posts';
import type { CleanupResult, PostListItem, RefreshSummary } from '@/features/posts/types/post';
import { useFeedList } from '@/features/feeds/hooks/useFeeds';
import type { FeedListResponse } from '@/features/feeds/api/feeds';
import type { Feed } from '@/features/feeds/types/feed';
import { HttpError } from '@/lib/api/http';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { AuthContextValue } from '@/features/auth/context/AuthContext';
import { useAppParams } from '@/features/app-params/hooks/useAppParams';
import type { AppParams } from '@/features/app-params/types/appParams';

vi.mock('@/features/posts/hooks/usePosts');
vi.mock('@/features/feeds/hooks/useFeeds');
vi.mock('@/features/auth/hooks/useAuth');
vi.mock('@/features/app-params/hooks/useAppParams');

const mockedUsePostList = vi.mocked(usePostList);
const mockedUseRefreshPosts = vi.mocked(useRefreshPosts);
const mockedUseCleanupPosts = vi.mocked(useCleanupPosts);
const mockedUseFeedList = vi.mocked(useFeedList);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseAppParams = vi.mocked(useAppParams);

type PostOverride = Partial<Omit<PostListItem, 'post'>> & {
  post?: Partial<NonNullable<PostListItem['post']>> | null;
};

const buildPostMetadata = (
  override: Partial<NonNullable<PostListItem['post']>> = {},
): NonNullable<PostListItem['post']> => ({
  content: Object.hasOwn(override, 'content') ? override.content ?? null : 'Conteudo gerado 1',
  createdAt: Object.hasOwn(override, 'createdAt') ? override.createdAt ?? null : '2024-01-01T12:00:00.000Z',
  status: Object.hasOwn(override, 'status') ? override.status ?? null : 'SUCCESS',
  generatedAt: Object.hasOwn(override, 'generatedAt') ? override.generatedAt ?? null : '2024-01-01T12:00:00.000Z',
  modelUsed: Object.hasOwn(override, 'modelUsed') ? override.modelUsed ?? null : 'gpt-5-nano',
  errorReason: Object.hasOwn(override, 'errorReason') ? override.errorReason ?? null : null,
  tokensInput: Object.hasOwn(override, 'tokensInput') ? override.tokensInput ?? null : null,
  tokensOutput: Object.hasOwn(override, 'tokensOutput') ? override.tokensOutput ?? null : null,
  promptBaseHash: Object.hasOwn(override, 'promptBaseHash') ? override.promptBaseHash ?? null : 'hash-example',
  attemptCount: override.attemptCount ?? 1,
  updatedAt:
    Object.hasOwn(override, 'updatedAt')
      ? override.updatedAt ?? null
      : override.generatedAt ?? override.createdAt ?? '2024-01-01T12:00:00.000Z',
});

const normalizePostMetadata = (
  value: Partial<NonNullable<PostListItem['post']>> | null | undefined,
): PostListItem['post'] => {
  if (value == null) {
    return value ?? null;
  }
  return buildPostMetadata(value);
};

const buildPost = (override: PostOverride = {}): PostListItem => ({
  id: override.id ?? 1,
  title: override.title ?? 'Post 1',
  contentSnippet: override.contentSnippet ?? 'Resumo da noticia 1',
  noticia: Object.hasOwn(override, 'noticia') ? override.noticia ?? null : '<p>Resumo da noticia 1</p>',
  publishedAt: override.publishedAt ?? '2024-01-01T00:00:00.000Z',
  feed:
    Object.hasOwn(override, 'feed')
      ? (override.feed as PostListItem['feed'])
      : {
          id: 1,
          title: 'Feed 1',
          url: 'https://example.com/feed.xml',
        },
  post: Object.hasOwn(override, 'post') ? normalizePostMetadata(override.post) : buildPostMetadata(),
});

const buildFeed = (override: Partial<Feed> = {}): Feed => ({
  id: override.id ?? 1,
  url: override.url ?? 'https://example.com/feed.xml',
  title: Object.hasOwn(override, 'title') ? override.title ?? null : 'Feed 1',
  lastFetchedAt: override.lastFetchedAt ?? null,
  createdAt: override.createdAt ?? '2024-01-01T00:00:00.000Z',
  updatedAt: override.updatedAt ?? '2024-01-01T00:00:00.000Z',
});

const buildAppParams = (override: Partial<AppParams> = {}): AppParams => ({
  posts_refresh_cooldown_seconds: override.posts_refresh_cooldown_seconds ?? 0,
  posts_time_window_days: override.posts_time_window_days ?? 7,
  updated_at: override.updated_at ?? '2024-01-01T00:00:00.000Z',
  updated_by: Object.hasOwn(override, 'updated_by') ? override.updated_by ?? null : 'admin@example.com',
});

const buildAppParamsHook = (
  paramsOverride: Partial<AppParams> = {},
  overrides: Partial<ReturnType<typeof useAppParams>> = {},
): ReturnType<typeof useAppParams> => {
  const params = buildAppParams(paramsOverride);

  return {
    params,
    status: 'success',
    error: null,
    isFetching: false,
    fetchedAt: Date.now(),
    refresh: vi.fn(async () => params),
    update: vi.fn(async () => params),
    clearError: vi.fn(),
    ...overrides,
  };
};

const buildAuthContext = (override: Partial<AuthContextValue> = {}): AuthContextValue => {
  const defaultUser: AuthContextValue['user'] =
    override.user ?? {
      email: 'user@example.com',
      role: 'user',
      expiresAt: '2024-01-01T00:00:00.000Z',
    };

  return {
    status: 'authenticated',
    user: defaultUser,
    isAuthenticating: false,
    authError: null,
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
    clearAuthError: vi.fn(),
    refreshSession: vi.fn(() => Promise.resolve({ authenticated: true, user: defaultUser })),
    ...override,
  };
};

const createPostQueryResult = (
  override: Partial<UseQueryResult<PostListResponse, HttpError>> = {},
): UseQueryResult<PostListResponse, HttpError> => {
  const defaultRefetch = vi.fn<Parameters<UseQueryResult<PostListResponse, HttpError>['refetch']>, ReturnType<UseQueryResult<PostListResponse, HttpError>['refetch']>>(
    () => Promise.resolve({ data: override.data ?? null }),
  );

  const refetch = override.refetch ?? defaultRefetch;
  const base: UseQueryResult<PostListResponse, HttpError> = {
    data: undefined,
    dataUpdatedAt: 0,
    error: null,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    failureReasonUpdatedAt: 0,
    fetchStatus: 'idle',
    isError: false,
    isFetched: false,
    isFetchedAfterMount: false,
    isFetching: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPending: false,
    isRefetchError: false,
    isRefetching: false,
    isSuccess: false,
    refetch,
    remove: vi.fn(),
    status: 'pending',
  };

  return { ...base, ...override, refetch };
};

const createMutationResult = <TData, TVariables>(
  mutateAsyncMock: Mock<(...args: Parameters<UseMutationResult<TData, HttpError, TVariables>['mutateAsync']>) => ReturnType<UseMutationResult<TData, HttpError, TVariables>['mutateAsync']>>,
  overrides: Partial<Omit<UseMutationResult<TData, HttpError, TVariables>, 'mutate' | 'mutateAsync'>> = {},
): UseMutationResult<TData, HttpError, TVariables> => {
  const mutate: UseMutationResult<TData, HttpError, TVariables>['mutate'] = (variables, options) => {
    void mutateAsyncMock(variables, options);
  };

  return {
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
    mutateAsync: mutateAsyncMock,
    reset: vi.fn(),
    status: 'idle',
    submittedAt: 0,
    variables: undefined,
    ...overrides,
  };
};

const createFeedListQueryResult = (
  override: Partial<UseQueryResult<FeedListResponse, HttpError>> = {},
): UseQueryResult<FeedListResponse, HttpError> => {
  const base: UseQueryResult<FeedListResponse, HttpError> = {
    data: { items: [], meta: { nextCursor: null, total: 0, limit: 50 } },
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
    refetch: vi.fn(),
    remove: vi.fn(),
    status: 'success',
  };

  return { ...base, ...override };
};

const buildRefreshSummary = (override: Partial<RefreshSummary> = {}): RefreshSummary => ({
  now: new Date().toISOString(),
  feeds: [],
  ...override,
});

const readMetricValue = (label: string) => {
  const labelElement = screen.getByText(label);
  const container = labelElement.closest('div');
  if (!container) {
    throw new Error(`Metric container not found for label: ${label}`);
  }

  const valueElement = container.querySelector('dd');
  if (!valueElement) {
    throw new Error(`Metric value not found for label: ${label}`);
  }

  return valueElement.textContent?.trim() ?? '';
};

const renderPage = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <PostsPage />
    </I18nextProvider>,
  );

describe('PostsPage', () => {
  let refreshMutateAsync: Mock;
  let cleanupMutateAsync: Mock;

  beforeEach(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.clear();
    }
    mockedUseAuth.mockReturnValue(buildAuthContext());
    mockedUseAppParams.mockReturnValue(buildAppParamsHook());

    const feeds: Feed[] = [buildFeed({ id: 1, title: 'Feed 1' }), buildFeed({ id: 2, title: 'Feed 2' })];
    const defaultPosts: PostListItem[] = [
      buildPost(),
      buildPost({
        id: 2,
        title: 'Post 2',
        contentSnippet: 'Resumo 2',
        noticia: '<p>Resumo 2</p>',
        post: { content: 'Conteudo gerado 2', createdAt: '2024-01-01T15:00:00.000Z' },
      }),
    ];

    mockedUseFeedList.mockReturnValue(
      createFeedListQueryResult({
        data: { items: feeds, meta: { nextCursor: null, total: feeds.length, limit: 50 } },
      }),
    );

    refreshMutateAsync = vi.fn(() => Promise.resolve<RefreshSummary>(buildRefreshSummary()));

    cleanupMutateAsync = vi.fn(() =>
      Promise.resolve<CleanupResult>({ removedArticles: 0, removedPosts: 0 }),
    );

    mockedUseRefreshPosts.mockReturnValue(createMutationResult(refreshMutateAsync));
    mockedUseCleanupPosts.mockReturnValue(createMutationResult(cleanupMutateAsync));

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: {
          items: defaultPosts,
          meta: { nextCursor: null, limit: 10 },
        },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls refresh and cleanup on mount and renders posts afterwards', async () => {
    renderPage();

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(1);
      expect(cleanupMutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByRole('heading', { name: 'Post 1' })).toBeInTheDocument();
    expect(screen.getByText('Conteudo gerado 1')).toBeInTheDocument();
  });

  it('shows loading skeleton on mount and replaces it with content afterwards', async () => {
    renderPage();

    expect(screen.getAllByTestId('loading-skeleton')).toHaveLength(3);

    await screen.findByRole('heading', { name: 'Post 1' });

    expect(screen.queryByTestId('loading-skeleton')).toBeNull();
  });

  it('renders sections with POST open and NOTICIA closed by default and toggles correctly', async () => {
    const user = userEvent.setup();

    renderPage();

    const firstPostHeading = await screen.findByRole('heading', { name: 'Post 1' });
    expect(firstPostHeading).toBeInTheDocument();

    const postButton = screen.getAllByRole('button', { name: /^POST$/ })[0];
    expect(postButton).toHaveAttribute('aria-expanded', 'true');

    const postContent = screen.getByText('Conteudo gerado 1');
    expect(postContent).toBeVisible();

    const newsButton = screen.getAllByRole('button', { name: /NOTICIA/i })[0];
    expect(newsButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(newsButton);

    const newsContent = await screen.findByText('Resumo da noticia 1');
    expect(newsContent).toBeVisible();
    expect(newsButton).toHaveAttribute('aria-expanded', 'true');

    await user.click(postButton);

    await waitFor(() => {
      expect(postButton).toHaveAttribute('aria-expanded', 'false');
    });

    expect(screen.queryByText('Conteudo gerado 1')).toBeNull();
  });

  it('renders the refresh summary and allows dismissing it', async () => {
    const user = userEvent.setup();

    refreshMutateAsync = vi.fn(() =>
      Promise.resolve<RefreshSummary>(
        buildRefreshSummary({
          feeds: [
            {
              feedId: 1,
              feedTitle: 'Feed 1',
              feedUrl: null,
              skippedByCooldown: false,
              cooldownSecondsRemaining: null,
              itemsRead: 4,
              itemsWithinWindow: 2,
              articlesCreated: 1,
              duplicates: 0,
              invalidItems: 0,
              error: null,
            },
          ],
        }),
      ),
    );
    mockedUseRefreshPosts.mockReturnValue(createMutationResult(refreshMutateAsync));

    renderPage();

    await screen.findByRole('heading', { name: 'Post 1' });

    expect(screen.getByText('Resumo da atualizacao')).toBeInTheDocument();
    expect(screen.getByText('Feeds processados')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Feed 1' })).toBeInTheDocument();

    const dismissButton = screen.getByRole('button', { name: 'Dispensar resumo' });
    await user.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByText('Resumo da atualizacao')).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Resumo da atualizacao')).toBeInTheDocument();
    });
  });

  it('supports pagination keeping the cursor state', async () => {
    const user = userEvent.setup();

    const firstPagePost = buildPost({ title: 'Primeiro post' });
    const secondPagePost = buildPost({ id: 2, title: 'Segundo post', contentSnippet: 'Resumo pagina 2' });
    const refetchMock = vi.fn(() => Promise.resolve({ data: null }));

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      if (!params.cursor) {
        return createPostQueryResult({
          data: { items: [firstPagePost], meta: { nextCursor: 'cursor-1', limit: 10 } },
          isSuccess: true,
          isFetched: true,
          status: 'success',
          refetch: refetchMock,
        });
      }

      return createPostQueryResult({
        data: { items: [secondPagePost], meta: { nextCursor: null, limit: 10 } },
        isSuccess: true,
        isFetched: true,
        status: 'success',
        refetch: refetchMock,
      });
    });

    renderPage();

    await screen.findByText('Primeiro post');
    expect(screen.getByText('Pagina 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Proxima' }));

    await screen.findByText('Segundo post');
    expect(screen.getByText('Pagina 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Anterior' }));

    await screen.findByText('Primeiro post');
    expect(screen.getByText('Pagina 1')).toBeInTheDocument();
  });

  it('blocks refresh during cooldown window and shows warning message', async () => {
    const user = userEvent.setup();
    mockedUseAppParams.mockReturnValue(buildAppParamsHook({ posts_refresh_cooldown_seconds: 120 }));
    refreshMutateAsync = vi.fn(() => Promise.resolve<RefreshSummary>(buildRefreshSummary()));
    mockedUseRefreshPosts.mockReturnValue(createMutationResult(refreshMutateAsync));

    renderPage();

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(1);
      expect(cleanupMutateAsync).toHaveBeenCalledTimes(1);
    });

    const refreshButton = await screen.findByRole('button', { name: 'Atualizar' });
    expect(refreshButton).not.toBeDisabled();

    await waitFor(() => {
      expect(refreshButton).toHaveAttribute('aria-disabled', 'true');
    });

    await user.click(refreshButton);

    expect(refreshMutateAsync).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Aguarde/i)).toBeInTheDocument();
  });

  it('shows diagnostics panel for admin and updates refresh counter', async () => {
    const user = userEvent.setup();
    mockedUseAuth.mockReturnValue(
      buildAuthContext({
        user: { email: 'admin@example.com', role: 'admin', expiresAt: '2024-01-01T00:00:00.000Z' },
      }),
    );
    mockedUseAppParams.mockReturnValue(buildAppParamsHook({ posts_refresh_cooldown_seconds: 0 }));

    renderPage();

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(1);
      expect(cleanupMutateAsync).toHaveBeenCalledTimes(1);
    });

    const toggleButton = await screen.findByRole('button', { name: /Diagnostico/i });
    await user.click(toggleButton);

    expect(readMetricValue('Atualizacoes (sessao)')).toBe('0');
    expect(readMetricValue('Bloqueios por cooldown (sessao)')).toBe('0');
    expect(readMetricValue('Tempo medio de busca (ms, sessao)')).toMatch(/ms$/i);

    const refreshButton = await screen.findByRole('button', { name: 'Atualizar' });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(2);
      expect(readMetricValue('Atualizacoes (sessao)')).toBe('1');
    });
  });

  it('records cooldown blocks in diagnostics when refresh is attempted too early', async () => {
    const user = userEvent.setup();
    mockedUseAuth.mockReturnValue(
      buildAuthContext({
        user: { email: 'admin@example.com', role: 'admin', expiresAt: '2024-01-01T00:00:00.000Z' },
      }),
    );
    mockedUseAppParams.mockReturnValue(buildAppParamsHook({ posts_refresh_cooldown_seconds: 300 }));

    renderPage();

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(1);
      expect(cleanupMutateAsync).toHaveBeenCalledTimes(1);
    });

    const toggleButton = await screen.findByRole('button', { name: /Diagnostico/i });
    await user.click(toggleButton);

    expect(readMetricValue('Bloqueios por cooldown (sessao)')).toBe('0');

    const refreshButton = await screen.findByRole('button', { name: 'Atualizar' });
    await user.click(refreshButton);

    expect(refreshMutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(readMetricValue('Bloqueios por cooldown (sessao)')).toBe('1');
    });
  });

  it('propagates updated window days to the posts query after refresh', async () => {
    const user = userEvent.setup();

    const appParamsState = buildAppParamsHook({ posts_refresh_cooldown_seconds: 0, posts_time_window_days: 7 });
    mockedUseAppParams.mockImplementation(() => appParamsState);

    const windowDaysHistory: Array<PostListParams['windowDays'] | null | undefined> = [];
    mockedUsePostList.mockImplementation((params: PostListParams) => {
      windowDaysHistory.push(params.windowDays);

      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: {
          items: [buildPost({ id: 10, title: 'Janela inicial' })],
          meta: { nextCursor: null, limit: 10 },
        },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    const view = renderPage();

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(windowDaysHistory).toContain(7);
    });

    act(() => {
      appParamsState.params = buildAppParams({ posts_refresh_cooldown_seconds: 0, posts_time_window_days: 3 });
      appParamsState.fetchedAt = Date.now();
      view.rerender(
        <I18nextProvider i18n={i18n}>
          <PostsPage />
        </I18nextProvider>,
      );
    });

    const refreshButton = await screen.findByRole('button', { name: 'Atualizar' });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(windowDaysHistory).toContain(3);
    });
  });

  it('renders empty state using the configured time window', async () => {
    mockedUseAppParams.mockReturnValue(buildAppParamsHook({ posts_time_window_days: 3 }));
    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: { items: [], meta: { nextCursor: null, limit: 10 } },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(1);
      expect(cleanupMutateAsync).toHaveBeenCalledTimes(1);
    });

    await screen.findByText('Nenhum post recente.');
    expect(
      screen.getByText('Posts dos ultimos 3 dias aparecerao aqui apos uma atualizacao.'),
    ).toBeInTheDocument();
  });

  it('keeps posts visible when the refresh summary reports partial errors', async () => {
    refreshMutateAsync = vi.fn(() =>
      Promise.resolve<RefreshSummary>(
        buildRefreshSummary({
          feeds: [
            {
              feedId: 1,
              feedTitle: 'Feed 1',
              feedUrl: null,
              skippedByCooldown: false,
              cooldownSecondsRemaining: null,
              itemsRead: 2,
              itemsWithinWindow: 1,
              articlesCreated: 0,
              duplicates: 0,
              invalidItems: 0,
              error: 'falha no feed',
            },
          ],
        }),
      ),
    );
    mockedUseRefreshPosts.mockReturnValue(createMutationResult(refreshMutateAsync));

    renderPage();

    await screen.findByRole('heading', { name: 'Post 1' });

    expect(screen.getByText('Alguns feeds retornaram erros durante a atualizacao.')).toBeInTheDocument();
    expect(screen.getByText('Erro: falha no feed')).toBeInTheDocument();
    expect(screen.getByText('Post 1')).toBeInTheDocument();
  });

  it('applies feed filter and refetches the list', async () => {
    const user = userEvent.setup();

    const postsByFeed = new Map<number | null, PostListItem[]>([
      [null, [buildPost({ title: 'Post geral' })]],
      [2, [buildPost({ id: 3, title: 'Post do feed 2', contentSnippet: 'Resumo feed 2' })]],
    ]);

    let latestParams: PostListParams | null = null;

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      latestParams = params;

      if (!params.enabled) {
        return createPostQueryResult();
      }

      const items = postsByFeed.get(params.feedId ?? null) ?? [];

      return createPostQueryResult({
        data: { items, meta: { nextCursor: null, limit: 10 } },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    await screen.findByText('Post geral');

    const select = screen.getByLabelText('Filtrar por feed');
    await user.selectOptions(select, '2');

    await screen.findByText('Post do feed 2');
    await waitFor(() => {
      expect(latestParams?.feedId).toBe(2);
    });
  });

  it('repeats the sequence when clicking refresh', async () => {
    const user = userEvent.setup();

    const firstPagePost = buildPost({ title: 'Primeiro post' });
    const secondPagePost = buildPost({ id: 2, title: 'Segundo post', contentSnippet: 'Resumo pagina 2' });
    const refetchMock = vi.fn(() => Promise.resolve({ data: null }));

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult({ refetch: refetchMock });
      }

      if (params.cursor) {
        return createPostQueryResult({
          data: { items: [secondPagePost], meta: { nextCursor: null, limit: 10 } },
          isSuccess: true,
          isFetched: true,
          status: 'success',
          refetch: refetchMock,
        });
      }

      return createPostQueryResult({
        data: { items: [firstPagePost], meta: { nextCursor: 'cursor-1', limit: 10 } },
        isSuccess: true,
        isFetched: true,
        status: 'success',
        refetch: refetchMock,
      });
    });

    renderPage();

    await screen.findByText('Primeiro post');

    await user.click(screen.getByRole('button', { name: 'Proxima' }));

    await screen.findByText('Segundo post');
    expect(screen.getByText('Pagina 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(2);
      expect(cleanupMutateAsync).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Pagina 1')).toBeInTheDocument();
      expect(screen.getByText('Primeiro post')).toBeInTheDocument();
    });
  });

  it('renders the full article HTML with block elements and responsive media', async () => {
    const user = userEvent.setup();

    const richHtml = `
      <h2>Subtitulo da materia</h2>
      <p>Introducao com <strong>destaque</strong> e varias informacoes complementares para garantir uma leitura completa do artigo, fornecendo contexto detalhado sobre o tema tratado.</p>
      <ul><li>Ponto 1 com detalhes adicionais relevantes para o entendimento.</li><li>Ponto 2 com descricao extensa cobrindo aspectos importantes.</li></ul>
      <p>Fechamento com conclusoes e chamada para acao, destacando implicacoes futuras.</p>
      <img src="https://example.com/imagem.jpg" />
    `;

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: {
          items: [
            buildPost({
              id: 10,
              title: 'Noticia rica',
              noticia: richHtml,
              contentSnippet: 'Resumo estruturado',
            }),
          ],
          meta: { nextCursor: null, limit: 10 },
        },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Noticia rica' });

    const articleToggle = screen.getAllByRole('button', { name: /NOTICIA/i })[0];
    await user.click(articleToggle);

    await waitFor(() => {
      expect(document.getElementById('article-content-10-html')).not.toBeNull();
    });

    const htmlContainer = document.getElementById('article-content-10-html') as HTMLElement;
    expect(htmlContainer.querySelector('h2')).not.toBeNull();
    expect(htmlContainer.querySelectorAll('p').length).toBeGreaterThanOrEqual(1);
    expect(htmlContainer.querySelector('ul')).not.toBeNull();

    const image = htmlContainer.querySelector('img') as HTMLImageElement;
    expect(image).not.toBeNull();
    await waitFor(() => {
      expect(image).toHaveAttribute('loading', 'lazy');
    });
    expect(image.getAttribute('alt')).toBe('');
    expect(image.style.maxWidth).toBe('100%');
    expect(image.style.height).toBe('auto');
  });

  it('renders article HTML without escaping tags', async () => {
    const user = userEvent.setup();

    const html =
      '<p>Trecho com <strong>tag</strong> e um contexto amplo que se estende por varias sentencas, garantindo que o algoritmo de avaliacao reconheca o conteudo como robusto e adequado para exibicao completa no painel.</p>';

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: {
          items: [
            buildPost({
              id: 20,
              title: 'Noticia sem escape',
              noticia: html,
              contentSnippet: 'Trecho com tag',
            }),
          ],
          meta: { nextCursor: null, limit: 10 },
        },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Noticia sem escape' });

    const articleToggle = screen.getAllByRole('button', { name: /NOTICIA/i })[0];
    await user.click(articleToggle);

    await waitFor(() => {
      const container = document.getElementById('article-content-20-html');
      expect(container).not.toBeNull();
      expect(container?.querySelectorAll('p').length ?? 0).toBeGreaterThan(0);
    });

    const htmlContainer = document.getElementById('article-content-20-html') as HTMLElement;
    expect(htmlContainer.textContent).toContain('Trecho com tag');
    expect(screen.queryByText(/<p>/i)).not.toBeInTheDocument();
  });

  it('collapses and expands long article content', async () => {
    const user = userEvent.setup();

    const longSegment = '<p>' + 'Conteudo longo '.repeat(60) + '</p>';
    const longHtml = `<h2>Resumo extenso</h2>${longSegment.repeat(6)}`;

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: {
          items: [
            buildPost({
              id: 30,
              title: 'Noticia extensa',
              noticia: longHtml,
              contentSnippet: 'Conteudo muito extenso',
            }),
          ],
          meta: { nextCursor: null, limit: 10 },
        },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Noticia extensa' });

    const articleToggle = screen.getAllByRole('button', { name: /NOTICIA/i })[0];
    await user.click(articleToggle);

    const showMoreButton = await screen.findByRole('button', { name: 'Ver mais' });
    const htmlContainer = document.getElementById('article-content-30-html') as HTMLElement;
    expect(htmlContainer.className).toContain('article-content--collapsed');
    expect(showMoreButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(showMoreButton);

    await waitFor(() => {
      expect(htmlContainer.className).not.toContain('article-content--collapsed');
    });
    expect(showMoreButton).toHaveAttribute('aria-expanded', 'true');
    expect(showMoreButton).toHaveTextContent('Ver menos');
  });

  it('shows fallback excerpt and admin notice when article is weak', async () => {
    const user = userEvent.setup();

    mockedUseAuth.mockReturnValue(
      buildAuthContext({
        user: {
          email: 'admin@example.com',
          role: 'admin',
          expiresAt: '2024-01-01T00:00:00.000Z',
        },
      }),
    );

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: {
          items: [
            buildPost({
              id: 40,
              title: 'Noticia parcial',
              noticia: 'Atualizacao rapida',
              contentSnippet: 'Resumo curto',
            }),
          ],
          meta: { nextCursor: null, limit: 10 },
        },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Noticia parcial' });

    const articleToggle = screen.getAllByRole('button', { name: /NOTICIA/i })[0];
    await user.click(articleToggle);

    expect(await screen.findByText('Atualizacao rapida')).toBeInTheDocument();
    expect(screen.getByText('Conteudo parcial da noticia. Verifique a coleta no feed.')).toBeInTheDocument();
    expect(document.getElementById('article-content-40-html')).toBeNull();
  });

  it('opens article links in a new tab with noopener noreferrer', async () => {
    const user = userEvent.setup();

    const html =
      '<p>Este texto contextualiza a noticia com bastante detalhes para garantir que o conteudo nao seja considerado fraco pelo analizador. <a href="https://example.com/noticia">Leia mais detalhes completos</a> sobre o caso e entenda os proximos passos.</p>';

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: {
          items: [
            buildPost({
              id: 50,
              title: 'Noticia com link',
              noticia: html,
              contentSnippet: 'Visite o link',
            }),
          ],
          meta: { nextCursor: null, limit: 10 },
        },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    await screen.findByRole('heading', { name: 'Noticia com link' });

    const articleToggle = screen.getAllByRole('button', { name: /NOTICIA/i })[0];
    await user.click(articleToggle);

    await waitFor(() => {
      expect(document.getElementById('article-content-50-html')).not.toBeNull();
    });

    const anchor = document
      .getElementById('article-content-50-html')
      ?.querySelector('a') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    await waitFor(() => {
      expect(anchor).toHaveAttribute('target', '_blank');
    });
    const relValue = anchor.getAttribute('rel') ?? '';
    expect(relValue.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  });

  it('shows empty state when the user has no feeds', async () => {
    mockedUseFeedList.mockReturnValue(
      createFeedListQueryResult({
        data: { items: [], meta: { nextCursor: null, total: 0, limit: 50 } },
      }),
    );

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: { items: [], meta: { nextCursor: null, limit: 10 } },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    expect(await screen.findByText('Nenhum feed disponivel ainda.')).toBeInTheDocument();
  });

  it('shows empty state when there are no recent posts', async () => {
    mockedUseFeedList.mockReturnValue(
      createFeedListQueryResult({
        data: { items: [buildFeed()], meta: { nextCursor: null, total: 1, limit: 50 } },
      }),
    );

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: { items: [], meta: { nextCursor: null, limit: 10 } },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(1);
      expect(cleanupMutateAsync).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('Nenhum post recente.')).toBeInTheDocument();
  });

  it('renders error states when refresh or cleanup fail', async () => {
    const error = new HttpError('falha na atualizacao', 500);
    refreshMutateAsync = vi.fn(() => Promise.reject(error));
    cleanupMutateAsync = vi.fn(() => Promise.reject(new HttpError('falha limpeza', 500)));
    mockedUseRefreshPosts.mockReturnValue(createMutationResult(refreshMutateAsync));
    mockedUseCleanupPosts.mockReturnValue(createMutationResult(cleanupMutateAsync));

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        data: { items: [buildPost()], meta: { nextCursor: null, limit: 10 } },
        isSuccess: true,
        isFetched: true,
        status: 'success',
      });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Nao foi possivel atualizar seus feeds.')).toBeInTheDocument();
      expect(screen.getByText('Nao foi possivel limpar artigos antigos.')).toBeInTheDocument();
    });
  });

  it('shows list error state with retry action when query fails', async () => {
    const refetch = vi.fn(() => Promise.resolve({ data: null }));
    let latestParams: PostListParams | null = null;

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      latestParams = params;

      if (!params.enabled) {
        return createPostQueryResult();
      }

      return createPostQueryResult({
        isError: true,
        isSuccess: false,
        isFetched: true,
        status: 'error',
        error: new Error('falha listagem'),
        data: undefined,
        refetch,
      });
    });

    renderPage();

    const errorTitle = await screen.findByText('Nao foi possivel carregar os posts. Tente novamente mais tarde.');
    expect(errorTitle).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(2);
      expect(cleanupMutateAsync).toHaveBeenCalledTimes(2);
      expect(refetch).toHaveBeenCalled();
      expect(latestParams?.feedId ?? null).toBeNull();
    });
  });

  it('retries the sequence keeping the selected filter when clicking try again', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn(() => Promise.resolve({ data: null }));
    let latestParams: PostListParams | null = null;

    mockedUsePostList.mockImplementation((params: PostListParams) => {
      latestParams = params;

      if (!params.enabled) {
        return createPostQueryResult({ refetch });
      }

      return createPostQueryResult({
        isError: true,
        isSuccess: false,
        isFetched: true,
        status: 'error',
        error: new Error('falha listagem'),
        data: undefined,
        refetch,
      });
    });

    renderPage();

    await screen.findByText('Nao foi possivel carregar os posts. Tente novamente mais tarde.');

    const select = screen.getByLabelText('Filtrar por feed');
    await user.selectOptions(select, '2');

    await waitFor(() => {
      expect(latestParams?.feedId).toBe(2);
    });

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(refreshMutateAsync).toHaveBeenCalledTimes(2);
      expect(cleanupMutateAsync).toHaveBeenCalledTimes(2);
      expect(refetch).toHaveBeenCalled();
      expect(latestParams?.feedId).toBe(2);
    });
  });
});
