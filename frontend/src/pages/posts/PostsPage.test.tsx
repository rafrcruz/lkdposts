import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/features/posts/hooks/usePosts');
vi.mock('@/features/feeds/hooks/useFeeds');

const mockedUsePostList = vi.mocked(usePostList);
const mockedUseRefreshPosts = vi.mocked(useRefreshPosts);
const mockedUseCleanupPosts = vi.mocked(useCleanupPosts);
const mockedUseFeedList = vi.mocked(useFeedList);

const buildPost = (override: Partial<PostListItem> = {}): PostListItem => ({
  id: override.id ?? 1,
  title: override.title ?? 'Post 1',
  contentSnippet: override.contentSnippet ?? 'Resumo da noticia 1',
  publishedAt: override.publishedAt ?? '2024-01-01T00:00:00.000Z',
  feed:
    Object.prototype.hasOwnProperty.call(override, 'feed')
      ? (override.feed as PostListItem['feed'])
      : {
          id: 1,
          title: 'Feed 1',
          url: 'https://example.com/feed.xml',
        },
  post:
    Object.prototype.hasOwnProperty.call(override, 'post')
      ? (override.post as PostListItem['post'])
      : {
          content: 'Conteudo gerado 1',
          createdAt: '2024-01-01T12:00:00.000Z',
        },
});

const buildFeed = (override: Partial<Feed> = {}): Feed => ({
  id: override.id ?? 1,
  url: override.url ?? 'https://example.com/feed.xml',
  title: Object.prototype.hasOwnProperty.call(override, 'title') ? override.title ?? null : 'Feed 1',
  lastFetchedAt: override.lastFetchedAt ?? null,
  createdAt: override.createdAt ?? '2024-01-01T00:00:00.000Z',
  updatedAt: override.updatedAt ?? '2024-01-01T00:00:00.000Z',
});

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
    const feeds: Feed[] = [buildFeed({ id: 1, title: 'Feed 1' }), buildFeed({ id: 2, title: 'Feed 2' })];
    const defaultPosts: PostListItem[] = [
      buildPost(),
      buildPost({
        id: 2,
        title: 'Post 2',
        contentSnippet: 'Resumo 2',
        post: { content: 'Conteudo gerado 2', createdAt: '2024-01-01T15:00:00.000Z' },
      }),
    ];

    mockedUseFeedList.mockReturnValue(
      createFeedListQueryResult({
        data: { items: feeds, meta: { nextCursor: null, total: feeds.length, limit: 50 } },
      }),
    );

    refreshMutateAsync = vi.fn(() =>
      Promise.resolve<RefreshSummary>({
        now: '2024-01-02T00:00:00.000Z',
        feeds: [],
      }),
    );

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
      Promise.resolve<RefreshSummary>({
        now: '2024-01-02T00:00:00.000Z',
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

  it('keeps posts visible when the refresh summary reports partial errors', async () => {
    refreshMutateAsync = vi.fn(() =>
      Promise.resolve<RefreshSummary>({
        now: '2024-01-02T00:00:00.000Z',
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
