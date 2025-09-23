import { z } from 'zod';

export const postFeedReferenceSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().nullable(),
    url: z.string().nullable(),
  })
  .nullable();

export const postContentSchema = z
  .object({
    content: z.string(),
    createdAt: z.string().nullable(),
  })
  .nullable();

export const postListItemSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string(),
    contentSnippet: z.string(),
    publishedAt: z.string(),
    feed: postFeedReferenceSchema,
    post: postContentSchema,
  })
  .extend({
    link: z.string().nullable().optional(),
    articleHtml: z.string().nullable().optional(),
    noticia: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
  });

export type PostListItem = z.infer<typeof postListItemSchema>;

export const postListSchema = z.object({
  items: z.array(postListItemSchema),
});

export type PostList = z.infer<typeof postListSchema>;

export const postListMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  limit: z.number().int().positive(),
});

export type PostListMeta = z.infer<typeof postListMetaSchema>;

export const refreshFeedSummarySchema = z.object({
  feedId: z.number().int().positive(),
  feedUrl: z.string().nullable(),
  feedTitle: z.string().nullable(),
  skippedByCooldown: z.boolean(),
  cooldownSecondsRemaining: z.number().nullable(),
  itemsRead: z.number().int().nonnegative(),
  itemsWithinWindow: z.number().int().nonnegative(),
  articlesCreated: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  invalidItems: z.number().int().nonnegative(),
  error: z.string().nullable(),
});

export type RefreshFeedSummary = z.infer<typeof refreshFeedSummarySchema>;

export const refreshSummarySchema = z.object({
  now: z.string(),
  feeds: z.array(refreshFeedSummarySchema),
});

export type RefreshSummary = z.infer<typeof refreshSummarySchema>;

export const cleanupResultSchema = z.object({
  removedArticles: z.number().int().nonnegative(),
  removedPosts: z.number().int().nonnegative(),
});

export type CleanupResult = z.infer<typeof cleanupResultSchema>;
