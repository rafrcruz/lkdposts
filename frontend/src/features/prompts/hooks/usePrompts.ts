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
  return [...items].sort((a, b) => a.position - b.position || a.id - b.id);
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
  return useMutation<Prompt, HttpError, { title: string; content: string }>({
    mutationFn: ({ title, content }) => createPrompt({ title, content }),
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

export const useUpdatePrompt = () => {
  const queryClient = useQueryClient();
  return useMutation<Prompt, HttpError, { id: number; title: string; content: string }>({
    mutationFn: ({ id, title, content }) => updatePrompt(id, { title, content }),
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
  return useMutation<{ message?: string }, HttpError, number>({
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

type ReorderContext = {
  previous?: PromptList;
};

export const useReorderPrompts = () => {
  const queryClient = useQueryClient();
  return useMutation<unknown, HttpError, PromptList, ReorderContext>({
    mutationFn: async (nextOrder) => {
      const items = nextOrder.map((prompt) => ({ id: prompt.id, position: prompt.position }));
      await reorderPrompts({ items });
    },
    onMutate: async (nextOrder) => {
      await queryClient.cancelQueries({ queryKey: PROMPTS_QUERY_KEY });
      const previous = queryClient.getQueryData<PromptList>(PROMPTS_QUERY_KEY);
      queryClient.setQueryData(PROMPTS_QUERY_KEY, nextOrder);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PROMPTS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PROMPTS_QUERY_KEY });
    },
  });
};
