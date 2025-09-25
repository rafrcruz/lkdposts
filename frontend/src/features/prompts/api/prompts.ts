import { deleteJson, getJson, patchJson, postJson, putJson } from '@/lib/api/http';
import { promptListSchema, promptSchema, type Prompt, type PromptList, type PromptReorderItem } from '../types/prompt';

export const PROMPTS_QUERY_KEY = ['prompts'] as const;

type CreatePromptPayload = {
  title: string;
  content: string;
  position?: number;
};

type UpdatePromptPayload = {
  title: string;
  content: string;
};

type ReorderPayload = {
  items: PromptReorderItem[];
};

export const fetchPrompts = () => {
  return getJson<PromptList>('/api/prompts', promptListSchema);
};

export const createPrompt = (payload: CreatePromptPayload) => {
  return postJson<Prompt, CreatePromptPayload>('/api/prompts', payload, promptSchema);
};

export const updatePrompt = (id: number, payload: UpdatePromptPayload) => {
  return patchJson<Prompt, UpdatePromptPayload>(`/api/prompts/${id}`, payload, promptSchema);
};

export const deletePrompt = (id: number) => {
  return deleteJson<{ message?: string }>(`/api/prompts/${id}`);
};

export const reorderPrompts = (payload: ReorderPayload) => {
  return putJson<Record<string, unknown>, ReorderPayload>('/api/prompts/reorder', payload);
};
