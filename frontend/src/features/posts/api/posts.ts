import {
  cleanupResultSchema,
  postListMetaSchema,
  postListSchema,
  refreshSummarySchema,
  type CleanupResult,
  type PostList,
  type PostListMeta,
  type RefreshSummary,
} from '../types/post';

import { getJsonWithMeta, postJson } from '@/lib/api/http';

export const POSTS_QUERY_KEY = ['posts'] as const;

export type PostListResponse = {
  items: PostList['items'];
  meta: PostListMeta;
};

type FetchPostsParams = {
  cursor?: string | null;
  limit?: number;
  feedId?: number | null;
};

const buildPostsPath = ({ cursor, limit, feedId }: FetchPostsParams = {}) => {
  const searchParams = new URLSearchParams();

  if (cursor) {
    searchParams.set('cursor', cursor);
  }

  if (typeof limit === 'number') {
    searchParams.set('limit', String(limit));
  }

  if (typeof feedId === 'number') {
    searchParams.set('feedId', String(feedId));
  }

  const query = searchParams.toString();
  return query ? `/api/v1/posts?${query}` : '/api/v1/posts';
};

export const fetchPosts = async (params: FetchPostsParams = {}): Promise<PostListResponse> => {
  const path = buildPostsPath(params);
  const response = await getJsonWithMeta(path, postListSchema, postListMetaSchema);

  return {
    items: response.data.items,
    meta: response.meta,
  };
};

export const refreshPosts = () => {
  return postJson<RefreshSummary, Record<string, never>>('/api/v1/posts/refresh', {}, refreshSummarySchema);
};

export const cleanupPosts = () => {
  return postJson<CleanupResult, Record<string, never>>('/api/v1/posts/cleanup', {}, cleanupResultSchema);
};
