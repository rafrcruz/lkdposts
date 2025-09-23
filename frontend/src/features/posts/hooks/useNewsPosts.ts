import type { UseQueryResult } from '@tanstack/react-query';

import type { PostListResponse } from '../api/posts';
import { usePostList, type PostListParams } from './usePosts';
import { mapToNewsPost, type NewsPostList } from '../types/news';
import { HttpError } from '@/lib/api/http';

export const useNewsPostList = (
  params: Omit<PostListParams, 'enabled'> & { enabled?: boolean },
): UseQueryResult<NewsPostList, HttpError> => {
  return usePostList<NewsPostList>(params, {
    select: (data: PostListResponse) => ({
      items: data.items.map(mapToNewsPost),
    }),
  });
};

