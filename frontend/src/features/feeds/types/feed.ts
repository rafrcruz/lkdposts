import { z } from 'zod';

export const feedSchema = z.object({
  id: z.number().int().positive(),
  url: z.string().url(),
  title: z.string().nullable(),
  lastFetchedAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Feed = z.infer<typeof feedSchema>;

export const feedListSchema = z.object({
  items: z.array(feedSchema),
});

export type FeedList = z.infer<typeof feedListSchema>;

export const feedListMetaSchema = z
  .object({
    nextCursor: z.string().nullable(),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
  })
  .passthrough();

export type FeedListMeta = z.infer<typeof feedListMetaSchema>;

const duplicateReasonSchema = z.union([
  z.literal('ALREADY_EXISTS'),
  z.literal('DUPLICATE_IN_PAYLOAD'),
]);

const invalidReasonSchema = z.union([z.literal('INVALID_URL'), z.literal('URL_REQUIRED')]);

export type FeedDuplicateReason = z.infer<typeof duplicateReasonSchema>;
export type FeedInvalidReason = z.infer<typeof invalidReasonSchema>;

export const feedBulkResultSchema = z.object({
  created: z.array(feedSchema),
  duplicates: z.array(
    z.object({
      url: z.string().url(),
      reason: duplicateReasonSchema,
      feedId: z.number().int().positive().nullable(),
    }),
  ),
  invalid: z.array(
    z.object({
      url: z.string(),
      reason: invalidReasonSchema,
    }),
  ),
});

export type FeedBulkResult = z.infer<typeof feedBulkResultSchema>;
