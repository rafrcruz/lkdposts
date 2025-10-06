import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import {
  FEEDS_QUERY_KEY,
  bulkCreateFeeds,
  createFeed,
  deleteFeed,
  fetchFeeds,
  resetAllFeeds,
  updateFeed,
  type FeedListResponse,
} from '../api/feeds';
import type { Feed, FeedBulkResult, FeedResetSummary } from '../types/feed';
import { HttpError } from '@/lib/api/http';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { POSTS_QUERY_KEY, type PostListResponse } from '@/features/posts/api/posts';

type FeedListQueryParams = {
  cursor: string | null;
  limit: number;
  search: string | null;
};

type FeedListQueryKey = readonly [...typeof FEEDS_QUERY_KEY, FeedListQueryParams];

const isFeedListQueryKey = (queryKey: unknown): queryKey is FeedListQueryKey => {
  if (!Array.isArray(queryKey)) {
    return false;
  }

  if (queryKey.length !== FEEDS_QUERY_KEY.length + 1) {
    return false;
  }

  const matchesBaseKey = FEEDS_QUERY_KEY.every((segment, index) => queryKey[index] === segment);

  if (!matchesBaseKey) {
    return false;
  }

  const paramsCandidate: unknown = queryKey[FEEDS_QUERY_KEY.length];

  if (typeof paramsCandidate !== 'object' || paramsCandidate === null) {
    return false;
  }

  const candidate = paramsCandidate as Record<string, unknown>;
  const hasCursor = Object.hasOwn(candidate, 'cursor');
  const hasLimit = Object.hasOwn(candidate, 'limit');
  const hasSearch = Object.hasOwn(candidate, 'search');

  if (!hasCursor || !hasLimit || !hasSearch) {
    return false;
  }

  const cursor = candidate.cursor;
  const limit = candidate.limit;
  const search = candidate.search;

  const isCursorValid = cursor === null || typeof cursor === 'string';
  const isLimitValid = typeof limit === 'number';
  const isSearchValid = search === null || typeof search === 'string';

  return isCursorValid && isLimitValid && isSearchValid;
};

const updateFeedListCache = (queryClient: QueryClient, feeds: Feed[]) => {
  if (feeds.length === 0) {
    return;
  }

  const queries = queryClient.getQueriesData<FeedListResponse>({ queryKey: FEEDS_QUERY_KEY });

  for (const [queryKey, current] of queries) {
    if (!current || !isFeedListQueryKey(queryKey)) {
      continue;
    }

    const [, params] = queryKey;
    const limit = params.limit;
    const isFirstPage = params.cursor === null;
    const search = params.search;

    const existingIds = new Set(current.items.map((item) => item.id));
    const newFeeds = feeds.filter((feed) => {
      if (existingIds.has(feed.id)) {
        return false;
      }

      if (search && !feed.url.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }

      return true;
    });

    if (newFeeds.length === 0) {
      continue;
    }

    const nextItems = isFirstPage ? [...newFeeds, ...current.items].slice(0, limit) : current.items;
    const nextMeta = {
      ...current.meta,
      total: current.meta.total + newFeeds.length,
    };

    queryClient.setQueryData<FeedListResponse>(queryKey, {
      ...current,
      items: nextItems,
      meta: nextMeta,
    });
  }
};

type FeedListParams = {
  cursor: string | null;
  limit: number;
  search: string | null;
};

export const useFeedList = ({ cursor, limit, search }: FeedListParams) => {
  const { status } = useAuth();
  const isAuthenticated = status === 'authenticated';

  return useQuery<FeedListResponse, HttpError>({
    queryKey: [...FEEDS_QUERY_KEY, { cursor: cursor ?? null, limit, search: search ?? null }],
    queryFn: () => {
      const params: { cursor?: string | null; limit: number; search?: string | null } = { limit };

      if (cursor) {
        params.cursor = cursor;
      }

      if (search) {
        params.search = search;
      }

      return fetchFeeds(params);
    },
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });
};

export const useCreateFeed = () => {
  const queryClient = useQueryClient();
  return useMutation<Feed, HttpError, { url: string; title?: string | null }>({
    mutationFn: (payload) => createFeed(payload),
    onSuccess: (created) => {
      updateFeedListCache(queryClient, [created]);
      queryClient.invalidateQueries({ queryKey: FEEDS_QUERY_KEY }).catch(() => {
        // ignore cache errors
      });
    },
  });
};

export const useBulkCreateFeeds = () => {
  const queryClient = useQueryClient();
  return useMutation<FeedBulkResult, HttpError, { urls: string[] }>({
    mutationFn: ({ urls }) => bulkCreateFeeds(urls),
    onSuccess: (result) => {
      updateFeedListCache(queryClient, result.created);
      queryClient.invalidateQueries({ queryKey: FEEDS_QUERY_KEY }).catch(() => {
        // ignore cache errors
      });
    },
  });
};

export const useUpdateFeed = () => {
  const queryClient = useQueryClient();
  return useMutation<Feed, HttpError, { id: number; url?: string; title?: string | null }>({
    mutationFn: ({ id, url, title }) => updateFeed(id, { url, title }),
    onSuccess: (updated) => {
      queryClient.setQueriesData<FeedListResponse | undefined>({ queryKey: FEEDS_QUERY_KEY }, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((item) => (item.id === updated.id ? updated : item)),
        };
      });
      queryClient.invalidateQueries({ queryKey: FEEDS_QUERY_KEY }).catch(() => {
        // ignore cache errors
      });
    },
  });
};

export const useDeleteFeed = () => {
  const queryClient = useQueryClient();
  return useMutation<{ message: string }, HttpError, number>({
    mutationFn: (id) => deleteFeed(id),
    onSuccess: (_result, id) => {
      queryClient.setQueriesData<FeedListResponse | undefined>({ queryKey: FEEDS_QUERY_KEY }, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.filter((item) => item.id !== id),
          meta: {
            ...current.meta,
            total: Math.max(current.meta.total - 1, 0),
          },
        };
      });
      queryClient.invalidateQueries({
        queryKey: FEEDS_QUERY_KEY,
        refetchType: 'inactive',
      }).catch(() => {
        // ignore cache errors
      });
    },
  });
};

export const useResetFeeds = () => {
  const queryClient = useQueryClient();
  return useMutation<FeedResetSummary, HttpError, void>({
    mutationFn: () => resetAllFeeds(),
    onSuccess: () => {
      queryClient.setQueriesData<FeedListResponse | undefined>({ queryKey: FEEDS_QUERY_KEY }, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((item) => ({ ...item, lastFetchedAt: null })),
        };
      });

      queryClient.setQueriesData<PostListResponse | undefined>({ queryKey: POSTS_QUERY_KEY }, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: [],
          meta: {
            ...current.meta,
            nextCursor: null,
          },
        };
      });

      queryClient.invalidateQueries({ queryKey: FEEDS_QUERY_KEY }).catch(() => {
        // ignore cache errors
      });
      queryClient.invalidateQueries({ queryKey: POSTS_QUERY_KEY }).catch(() => {
        // ignore cache errors
      });
    },
  });
};

