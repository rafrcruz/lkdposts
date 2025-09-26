import { z } from 'zod';

import { postFeedReferenceSchema } from './post';

export const postRequestPreviewMessageContentSchema = z.object({
  type: z.string(),
  text: z.string(),
});

export const postRequestPreviewMessageSchema = z.object({
  role: z.string(),
  content: z.array(postRequestPreviewMessageContentSchema),
});

export const postRequestPreviewArticleSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  contentSnippet: z.string(),
  articleHtml: z.string().nullable(),
  link: z.string().nullable(),
  guid: z.string().nullable(),
  publishedAt: z.string().nullable(),
  feed: postFeedReferenceSchema,
});

export const postRequestPreviewPayloadSchema = z.object({
  article: postRequestPreviewArticleSchema,
  message: postRequestPreviewMessageSchema,
  context: z.string(),
});

export const postRequestPreviewSchema = z.object({
  prompt_base: z.string(),
  prompt_base_hash: z.string(),
  news_payload: postRequestPreviewPayloadSchema.nullable(),
  model: z.string(),
});

export type PostRequestPreviewPayload = z.infer<typeof postRequestPreviewPayloadSchema>;
export type PostRequestPreview = z.infer<typeof postRequestPreviewSchema>;
