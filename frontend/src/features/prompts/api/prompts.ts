import { deleteJson, getJson, patchJson, postJson, putJson } from '@/lib/api/http';
import { promptListSchema, promptSchema, type Prompt, type PromptList, type PromptReorderItem } from '../types/prompt';

export const PROMPTS_QUERY_KEY = ['prompts'] as const;

type CreatePromptPayload = {
  title: string;
  content: string;
  position?: number;
  enabled?: boolean;
};

type UpdatePromptPayload = {
  title?: string;
  content?: string;
  enabled?: boolean;
};

type ReorderPayload = {
  items: PromptReorderItem[];
};

export const fetchPrompts = () => {
  return getJson<PromptList>('/api/v1/prompts', promptListSchema);
};

export const createPrompt = (payload: CreatePromptPayload) => {
  return postJson<Prompt, CreatePromptPayload>('/api/v1/prompts', payload, promptSchema);
};

export const updatePrompt = (id: string, payload: UpdatePromptPayload) => {
  return patchJson<Prompt, UpdatePromptPayload>(`/api/v1/prompts/${id}`, payload, promptSchema);
};

export const deletePrompt = (id: string) => {
  return deleteJson<{ message?: string }>(`/api/v1/prompts/${id}`);
};

export const reorderPrompts = (payload: ReorderPayload) => {
  return putJson<Record<string, unknown>, ReorderPayload>('/api/v1/prompts/reorder', payload);
};
