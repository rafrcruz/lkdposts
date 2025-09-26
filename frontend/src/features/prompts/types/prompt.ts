import { z } from 'zod';

export const promptSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  content: z.string(),
  position: z.number().int().nonnegative(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Prompt = z.infer<typeof promptSchema>;

export const promptListSchema = z.array(promptSchema);

export type PromptList = z.infer<typeof promptListSchema>;

export const promptListResponseSchema = z.object({
  items: promptListSchema,
});

export type PromptListResponse = z.infer<typeof promptListResponseSchema>;

export const promptReorderItemSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().nonnegative(),
});

export type PromptReorderItem = z.infer<typeof promptReorderItemSchema>;
