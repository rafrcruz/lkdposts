import { useMutation } from '@tanstack/react-query';

import { fetchPostRequestPreview } from '../api/posts';
import type { PostRequestPreview } from '../types/post-preview';
import { HttpError } from '@/lib/api/http';

export const usePostRequestPreview = () => {
  return useMutation<PostRequestPreview, HttpError, { newsId?: number }>({
    mutationFn: ({ newsId }) => fetchPostRequestPreview({ newsId }),
  });
};
