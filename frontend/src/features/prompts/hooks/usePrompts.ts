import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createPrompt,
  deletePrompt,
  fetchPrompts,
  reorderPrompts,
  updatePrompt,
  PROMPTS_QUERY_KEY,
} from '../api/prompts';
import type { Prompt, PromptList } from '../types/prompt';
import { HttpError } from '@/lib/api/http';
import { useAuth } from '@/features/auth/hooks/useAuth';

const sortPrompts = (items: PromptList) => {
  return [...items].sort((a, b) => {
    const positionDiff = a.position - b.position;
    if (positionDiff !== 0) {
      return positionDiff;
    }

    const createdDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (createdDiff !== 0) {
      return createdDiff;
    }

    return a.id.localeCompare(b.id);
  });
};

export const usePromptList = () => {
  const { status } = useAuth();
  const enabled = status === 'authenticated';

  return useQuery<PromptList, HttpError>({
    queryKey: PROMPTS_QUERY_KEY,
    queryFn: fetchPrompts,
    enabled,
    select: sortPrompts,
  });
};

export const useCreatePrompt = () => {
  const queryClient = useQueryClient();
  return useMutation<Prompt, HttpError, { title: string; content: string; position?: number; enabled?: boolean }>({
    mutationFn: ({ title, content, position, enabled }) => createPrompt({ title, content, position, enabled }),
    onSuccess: (created) => {
      queryClient.setQueryData<PromptList | undefined>(PROMPTS_QUERY_KEY, (current) => {
        if (!current) {
          return [created];
        }
        return sortPrompts([...current, created]);
      });
    },
  });
};

type UpdatePromptVariables = {
  id: string;
  title?: string;
  content?: string;
  enabled?: boolean;
};

export const useUpdatePrompt = () => {
  const queryClient = useQueryClient();
  return useMutation<Prompt, HttpError, UpdatePromptVariables>({
    mutationFn: ({ id, title, content, enabled }) => updatePrompt(id, { title, content, enabled }),
    onSuccess: (updated) => {
      queryClient.setQueryData<PromptList | undefined>(PROMPTS_QUERY_KEY, (current) => {
        if (!current) {
          return current;
        }
        const next = current.map((item) => (item.id === updated.id ? updated : item));
        return sortPrompts(next);
      });
    },
  });
};

export const useDeletePrompt = () => {
  const queryClient = useQueryClient();
  return useMutation<{ message?: string }, HttpError, string>({
    mutationFn: (id) => deletePrompt(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<PromptList | undefined>(PROMPTS_QUERY_KEY, (current) => {
        if (!current) {
          return current;
        }
        return current.filter((item) => item.id !== id);
      });
    },
  });
};

export const useReorderPrompts = () => {
  return useMutation<PromptList, HttpError, PromptList>({
    mutationFn: async (nextOrder) => {
      const items = nextOrder.map((prompt) => ({ id: prompt.id, position: prompt.position }));
      const response = await reorderPrompts({ items });
      return sortPrompts(response.items);
    },
  });
};
