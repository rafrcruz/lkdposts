import { z } from 'zod';

export const openAiModelOptions = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'] as const;

export const appParamsSchema = z.object({
  posts_refresh_cooldown_seconds: z.number().int().nonnegative(),
  posts_time_window_days: z.number().int().min(1),
  'openai.model': z.enum(openAiModelOptions),
  updated_at: z.string(),
  updated_by: z.string().nullable().optional(),
});

export type AppParams = z.infer<typeof appParamsSchema>;

export type AppParamsUpdateInput = Partial<
  Pick<AppParams, 'posts_refresh_cooldown_seconds' | 'posts_time_window_days' | 'openai.model'>
>;
