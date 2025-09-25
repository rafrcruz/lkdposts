const { z } = require('zod');

const updateAppParamsBodySchema = z
  .object({
    posts_refresh_cooldown_seconds: z.number().int().optional(),
    posts_time_window_days: z.number().int().optional(),
  })
  .strip()
  .refine(
    (data) =>
      Object.hasOwn(data, 'posts_refresh_cooldown_seconds') || Object.hasOwn(data, 'posts_time_window_days'),
    {
      message: 'At least one property must be provided',
      path: ['posts_refresh_cooldown_seconds'],
    }
  );

module.exports = {
  updateAppParamsBodySchema,
};
