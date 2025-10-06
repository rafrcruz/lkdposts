const { z } = require('zod');
const { FEED_MAX_PAGE_SIZE, FEED_MAX_BULK_URLS } = require('../constants/feed');

const positiveInt = z.coerce.number().int().positive();

const normalizeOptionalTitle = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const listFeedsQuerySchema = z
  .object({
    cursor: positiveInt.optional(),
    limit: positiveInt.optional(),
    search: z.string().optional(),
  })
  .strict();

const urlStringSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, { message: 'URL is required' });

const createFeedBodySchema = z
  .object({
    url: urlStringSchema,
    title: z.union([z.string(), z.null()]).optional().transform(normalizeOptionalTitle),
  })
  .strict();

const bulkCreateFeedBodySchema = z
  .object({
    urls: z.array(z.any()).min(1, 'At least one URL must be provided'),
  })
  .strict();

const updateFeedParamsSchema = z
  .object({
    id: positiveInt,
  })
  .strict();

const updateFeedBodySchema = z
  .object({
    url: urlStringSchema.optional(),
    title: z.union([z.string(), z.null()]).optional().transform(normalizeOptionalTitle),
  })
  .strict()
  .refine((data) => data.url !== undefined || data.title !== undefined, {
    message: 'At least one property must be provided',
    path: ['title'],
  });

const deleteFeedParamsSchema = z
  .object({
    id: positiveInt,
  })
  .strict();

module.exports = {
  FEED_MAX_PAGE_SIZE,
  FEED_MAX_BULK_URLS,
  listFeedsQuerySchema,
  createFeedBodySchema,
  bulkCreateFeedBodySchema,
  updateFeedParamsSchema,
  updateFeedBodySchema,
  deleteFeedParamsSchema,
};
