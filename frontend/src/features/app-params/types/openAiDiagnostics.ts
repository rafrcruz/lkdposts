import { z } from 'zod';

const usageSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
    cached_tokens: z.number().optional(),
  })
  .passthrough();

const baseResultSchema = z.object({
  model: z.string(),
  baseURL: z.string(),
  timeoutMs: z.number(),
  latencyMs: z.number(),
});

const errorDetailsSchema = z.object({
  status: z.number().nullable(),
  type: z.string().nullable(),
  code: z.string().nullable(),
  message: z.string().nullable(),
  request_id: z.string().nullable(),
});

export const openAiDiagSuccessSchema = baseResultSchema.extend({
  ok: z.literal(true),
  usage: usageSchema.nullish(),
  cachedTokens: z.number().optional(),
});

export const openAiDiagErrorSchema = baseResultSchema.extend({
  ok: z.literal(false),
  error: errorDetailsSchema,
});

export const openAiDiagResultSchema = z.union([openAiDiagSuccessSchema, openAiDiagErrorSchema]);

export type OpenAiDiagSuccess = z.infer<typeof openAiDiagSuccessSchema>;
export type OpenAiDiagError = z.infer<typeof openAiDiagErrorSchema>;
export type OpenAiDiagResult = z.infer<typeof openAiDiagResultSchema>;
