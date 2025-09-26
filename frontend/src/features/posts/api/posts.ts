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

import { getJson, getJsonWithMeta, postJson } from '@/lib/api/http';
import { postRequestPreviewSchema, type PostRequestPreview } from '../types/post-preview';

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

type FetchPostRequestPreviewParams = {
  newsId?: number;
};

export const fetchPostRequestPreview = async (
  params: FetchPostRequestPreviewParams = {},
): Promise<PostRequestPreview> => {
  const searchParams = new URLSearchParams();

  if (typeof params.newsId === 'number') {
    searchParams.set('news_id', String(params.newsId));
  }

  const query = searchParams.toString();
  const path = query
    ? `/api/v1/admin/news/preview-payload?${query}`
    : '/api/v1/admin/news/preview-payload';

  return getJson(path, postRequestPreviewSchema);
};
