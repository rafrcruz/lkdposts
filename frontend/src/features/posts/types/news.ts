import type { PostListItem } from './post';

export type NewsPost = {
  id: number;
  title: string;
  html: string;
  link?: string | null;
  publishedAt?: string | null;
  author?: string | null;
  contentSnippet?: string | null;
};

export type NewsPostList = {
  items: NewsPost[];
};

export const mapToNewsPost = (item: PostListItem): NewsPost => ({
  id: item.id,
  title: item.title,
  html: item.noticia ?? item.articleHtml ?? '',
  link: item.link ?? null,
  publishedAt: item.publishedAt ?? null,
  author: item.author ?? null,
  contentSnippet: item.contentSnippet ?? null,
});

