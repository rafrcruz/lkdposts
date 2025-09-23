import {
  feedBulkResultSchema,
  feedListMetaSchema,
  feedListSchema,
  feedSchema,
  type Feed,
  type FeedBulkResult,
  type FeedList,
  type FeedListMeta,
  feedResetSummarySchema,
  type FeedResetSummary,
} from '../types/feed';

import { deleteJson, getJsonWithMeta, patchJson, postJson } from '@/lib/api/http';

export const FEEDS_QUERY_KEY = ['feeds'] as const;

export type FeedListResponse = {
  items: FeedList['items'];
  meta: FeedListMeta;
};

type FetchFeedsParams = {
  cursor?: string | null;
  limit?: number;
};

const buildFeedsPath = ({ cursor, limit }: FetchFeedsParams = {}) => {
  const searchParams = new URLSearchParams();

  if (cursor) {
    searchParams.set('cursor', cursor);
  }

  if (typeof limit === 'number') {
    searchParams.set('limit', String(limit));
  }

  const query = searchParams.toString();
  return query ? `/api/v1/feeds?${query}` : '/api/v1/feeds';
};

export const fetchFeeds = async (params: FetchFeedsParams = {}): Promise<FeedListResponse> => {
  const path = buildFeedsPath(params);
  const response = await getJsonWithMeta(path, feedListSchema, feedListMetaSchema);
  return {
    items: response.data.items,
    meta: response.meta,
  };
};

export const createFeed = (payload: { url: string; title?: string | null }) => {
  const body: { url: string; title?: string | null } = { url: payload.url };

  if (payload.title !== undefined) {
    body.title = payload.title;
  }

  return postJson<Feed, { url: string; title?: string | null }>('/api/v1/feeds', body, feedSchema);
};

export const bulkCreateFeeds = (urls: string[]) => {
  return postJson<FeedBulkResult, { urls: string[] }>('/api/v1/feeds/bulk', { urls }, feedBulkResultSchema);
};

export const updateFeed = (id: number, payload: { url?: string; title?: string | null }) => {
  return patchJson<Feed, { url?: string; title?: string | null }>(`/api/v1/feeds/${id}`, payload, feedSchema);
};

export const deleteFeed = (id: number) => {
  return deleteJson<{ message: string }>(`/api/v1/feeds/${id}`);
};

export const resetAllFeeds = () => {
  return postJson<FeedResetSummary, Record<string, never>>(
    '/api/v1/feeds/reset',
    {},
    feedResetSummarySchema,
  );
};
