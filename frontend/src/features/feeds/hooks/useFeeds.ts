import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
    onSuccess: () => {
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
    onSuccess: () => {
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

