import { z } from 'zod';

export const promptSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  content: z.string(),
  position: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Prompt = z.infer<typeof promptSchema>;

export const promptListSchema = z.array(promptSchema);

export type PromptList = z.infer<typeof promptListSchema>;

export const promptReorderItemSchema = z.object({
  id: z.number().int().positive(),
  position: z.number().int().nonnegative(),
});

export type PromptReorderItem = z.infer<typeof promptReorderItemSchema>;
