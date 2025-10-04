import { z } from 'zod';

export const postFeedReferenceSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().nullable(),
    url: z.string().nullable(),
  })
  .nullable();

export const postGenerationStatusSchema = z.enum(['PENDING', 'SUCCESS', 'FAILED']);

export const postGenerationMetadataSchema = z
  .object({
    content: z.string().nullable(),
    createdAt: z.string().nullable(),
    status: postGenerationStatusSchema.nullable(),
    generatedAt: z.string().nullable(),
    modelUsed: z.string().nullable(),
    errorReason: z.string().nullable(),
    tokensInput: z.number().int().nonnegative().nullable(),
    tokensOutput: z.number().int().nonnegative().nullable(),
    promptBaseHash: z.string().nullable(),
    attemptCount: z.number().int().nonnegative().nullable(),
    updatedAt: z.string().nullable(),
  })
  .partial()
  .nullable();

export const postListItemSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string(),
    contentSnippet: z.string(),
    publishedAt: z.string(),
    feed: postFeedReferenceSchema,
    post: postGenerationMetadataSchema.nullable().optional(),
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

export const postGenerationErrorSchema = z.object({
  articleId: z.number().int().positive().nullable(),
  reason: z.string(),
});

export const postGenerationSummarySchema = z
  .object({
    ownerKey: z.string(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
    eligibleCount: z.number().int().nonnegative(),
    generatedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    skippedCount: z.number().int().nonnegative(),
    promptBaseHash: z.string().nullable(),
    modelUsed: z.string().nullable(),
    errors: z.array(postGenerationErrorSchema).nullable(),
  })
  .nullable();

export const refreshSummarySchema = z.object({
  now: z.string(),
  feeds: z.array(refreshFeedSummarySchema),
  generation: postGenerationSummarySchema.optional(),
});

export type RefreshSummary = z.infer<typeof refreshSummarySchema>;

export const generationStatusSchema = z.enum(['idle', 'in_progress', 'completed', 'failed']);

export const generationPhaseSchema = z.enum([
  'initializing',
  'resolving_params',
  'loading_prompts',
  'collecting_articles',
  'generating_posts',
  'finalizing',
  'completed',
  'failed',
]);

export const postGenerationProgressSchema = z.object({
  ownerKey: z.string(),
  startedAt: z.string(),
  updatedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: generationStatusSchema,
  phase: generationPhaseSchema,
  message: z.string().nullable().optional(),
  eligibleCount: z.number().int().nonnegative().nullable(),
  processedCount: z.number().int().nonnegative(),
  generatedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  currentArticleId: z.number().int().positive().nullable(),
  currentArticleTitle: z.string().nullable(),
  promptBaseHash: z.string().nullable(),
  modelUsed: z.string().nullable(),
  errors: z.array(postGenerationErrorSchema),
  cacheInfo: z
    .object({
      cachedTokens: z.number().int().nonnegative(),
    })
    .nullable(),
  summary: postGenerationSummarySchema.optional(),
});

export type PostGenerationProgress = z.infer<typeof postGenerationProgressSchema>;

export const cleanupResultSchema = z.object({
  removedArticles: z.number().int().nonnegative(),
  removedPosts: z.number().int().nonnegative(),
});

export type CleanupResult = z.infer<typeof cleanupResultSchema>;
