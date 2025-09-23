import { useMemo } from 'react';

import { extractArticlePreview, type ArticlePreview } from '../utils/extractArticlePreview';

type PostPreviewSource = {
  id: number | string;
  noticia?: string | null;
  articleHtml?: string | null;
  contentSnippet?: string | null;
  link?: string | null;
};

const wrapFallbackHtml = (content?: string | null) => {
  if (!content) {
    return '';
  }

  return `<p>${content}</p>`;
};

export const usePostPreview = (post: PostPreviewSource): ArticlePreview => {
  return useMemo(() => {
    const htmlSource = post.noticia ?? post.articleHtml ?? '';
    const html = htmlSource && htmlSource.trim().length > 0 ? htmlSource : wrapFallbackHtml(post.contentSnippet);
    const baseUrl = post.link ?? undefined;

    if (!html) {
      return { excerpt: '' };
    }

    try {
      return extractArticlePreview(html, baseUrl);
    } catch (error) {
      console.error('Failed to extract article preview', error);
      return extractArticlePreview(wrapFallbackHtml(post.contentSnippet), baseUrl);
    }
  }, [post.articleHtml, post.contentSnippet, post.link, post.noticia]);
};

export type { ArticlePreview } from '../utils/extractArticlePreview';

