const { z } = require('zod');
const postsService = require('../services/posts.service');

const positiveInt = z.coerce.number().int().positive();
const MAX_PAGE_SIZE = postsService.constants.MAX_PAGE_SIZE;

const listPostsQuerySchema = z
  .object({
    cursor: z
      .string()
      .optional()
      .transform((value) => {
        if (value == null) {
          return undefined;
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }),
    limit: positiveInt.optional(),
    feedId: positiveInt.optional(),
  })
  .strict();

module.exports = {
  listPostsQuerySchema,
};
