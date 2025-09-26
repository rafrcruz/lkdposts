const { z } = require('zod');

const previewPayloadQuerySchema = z
  .object({
    news_id: z
      .string()
      .optional()
      .transform((value) => {
        if (value == null) {
          return undefined;
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      })
      .transform((value) => (value === undefined ? undefined : Number.parseInt(value, 10)))
      .refine((value) => value === undefined || Number.isInteger(value), {
        message: 'news_id must be a positive integer',
      })
      .refine((value) => value === undefined || value > 0, {
        message: 'news_id must be a positive integer',
      }),
  })
  .strict()
  .transform(({ news_id }) => ({ newsId: news_id }));

module.exports = {
  previewPayloadQuerySchema,
};
