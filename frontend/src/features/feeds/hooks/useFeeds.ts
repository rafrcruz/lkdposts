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
  updateFeed,
  type FeedListResponse,
} from '../api/feeds';
import type { Feed, FeedBulkResult } from '../types/feed';
import { HttpError } from '@/lib/api/http';
import { useAuth } from '@/features/auth/hooks/useAuth';

type FeedListQueryParams = {
  cursor: string | null;
  limit: number;
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

  const params = queryKey[FEEDS_QUERY_KEY.length];

  if (typeof params !== 'object' || params === null) {
    return false;
  }

  const candidate = params as Record<string, unknown>;
  const hasCursor = Object.prototype.hasOwnProperty.call(candidate, 'cursor');
  const hasLimit = Object.prototype.hasOwnProperty.call(candidate, 'limit');

  if (!hasCursor || !hasLimit) {
    return false;
  }

  const cursor = candidate.cursor;
  const limit = candidate.limit;

  const isCursorValid = cursor === null || typeof cursor === 'string';
  const isLimitValid = typeof limit === 'number';

  return isCursorValid && isLimitValid;
};

const updateFeedListCache = (queryClient: QueryClient, feeds: Feed[]) => {
  if (feeds.length === 0) {
    return;
  }

  const queries = queryClient.getQueriesData<FeedListResponse>({ queryKey: FEEDS_QUERY_KEY });

  queries.forEach(([queryKey, current]) => {
    if (!current || !isFeedListQueryKey(queryKey)) {
      return;
    }

    const [, params] = queryKey;
    const limit = typeof params.limit === 'number' ? params.limit : current.meta.limit;
    const isFirstPage = params.cursor === null;

    const existingIds = new Set(current.items.map((item) => item.id));
    const newFeeds = feeds.filter((feed) => !existingIds.has(feed.id));

    if (newFeeds.length === 0) {
      return;
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
  });
};

type FeedListParams = {
  cursor: string | null;
  limit: number;
};

export const useFeedList = ({ cursor, limit }: FeedListParams) => {
  const { status } = useAuth();
  const isAuthenticated = status === 'authenticated';

  return useQuery<FeedListResponse, HttpError>({
    queryKey: [...FEEDS_QUERY_KEY, { cursor: cursor ?? null, limit }],
    queryFn: () => fetchFeeds({ cursor: cursor ?? undefined, limit }),
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
      queryClient.invalidateQueries({ queryKey: FEEDS_QUERY_KEY }).catch(() => {
        // ignore cache errors
      });
    },
  });
};

