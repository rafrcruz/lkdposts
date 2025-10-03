const { z } = require('zod');

const openAiModelSchema = z.string();

const updateAppParamsBodySchema = z
  .object({
    posts_refresh_cooldown_seconds: z.number().int().optional(),
    posts_time_window_days: z.number().int().optional(),
    'openai.model': openAiModelSchema.optional(),
  })
  .strip()
  .refine(
    (data) =>
      Object.hasOwn(data, 'posts_refresh_cooldown_seconds') ||
      Object.hasOwn(data, 'posts_time_window_days') ||
      Object.hasOwn(data, 'openai.model'),
    {
      message: 'At least one property must be provided',
      path: ['posts_refresh_cooldown_seconds'],
    }
  );

module.exports = {
  openAiModelSchema,
  updateAppParamsBodySchema,
};
