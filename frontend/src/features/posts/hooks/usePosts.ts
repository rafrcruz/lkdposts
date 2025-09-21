import { useMutation, useQuery } from '@tanstack/react-query';

import { cleanupPosts, fetchPosts, refreshPosts, POSTS_QUERY_KEY, type PostListResponse } from '../api/posts';
import type { CleanupResult, RefreshSummary } from '../types/post';
import { HttpError } from '@/lib/api/http';
import { useAuth } from '@/features/auth/hooks/useAuth';

export type PostListParams = {
  cursor: string | null;
  limit: number;
  feedId: number | null;
  enabled?: boolean;
};

export const usePostList = ({ cursor, limit, feedId, enabled = true }: PostListParams) => {
  const { status } = useAuth();
  const isAuthenticated = status === 'authenticated';

  return useQuery<PostListResponse, HttpError>({
    queryKey: [...POSTS_QUERY_KEY, { cursor: cursor ?? null, limit, feedId: feedId ?? null }],
    queryFn: () => fetchPosts({ cursor: cursor ?? undefined, limit, feedId: feedId ?? undefined }),
    enabled: isAuthenticated && enabled,
    keepPreviousData: true,
  });
};

export const useRefreshPosts = () => {
  return useMutation<RefreshSummary, HttpError>({
    mutationFn: () => refreshPosts(),
  });
};

export const useCleanupPosts = () => {
  return useMutation<CleanupResult, HttpError>({
    mutationFn: () => cleanupPosts(),
  });
};
