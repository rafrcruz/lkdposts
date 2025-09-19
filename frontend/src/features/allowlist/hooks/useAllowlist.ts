import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ALLOWLIST_QUERY_KEY,
  createAllowlistEntry,
  fetchAllowlist,
  removeAllowlistEntry,
  updateAllowlistEntryRole,
} from '../api/allowlist';
import type { AllowedRole, AllowlistEntry } from '../types/allowlist';
import { HttpError } from '@/lib/api/http';

export const useAllowlist = () => {
  return useQuery({
    queryKey: ALLOWLIST_QUERY_KEY,
    queryFn: fetchAllowlist,
  });
};

export const useCreateAllowlistEntry = () => {
  const queryClient = useQueryClient();
  return useMutation<AllowlistEntry, HttpError, { email: string; role: AllowedRole }>({
    mutationFn: ({ email, role }) => createAllowlistEntry({ email, role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ALLOWLIST_QUERY_KEY });
    },
  });
};

export const useUpdateAllowlistEntryRole = () => {
  const queryClient = useQueryClient();
  return useMutation<AllowlistEntry, HttpError, { id: number; role: AllowedRole }>({
    mutationFn: ({ id, role }) => updateAllowlistEntryRole(id, role),
    onSuccess: (updated) => {
      queryClient.setQueryData<AllowlistEntry[] | undefined>(ALLOWLIST_QUERY_KEY, (current) => {
        if (!current) {
          return current;
        }
        return current.map((item) => (item.id === updated.id ? updated : item));
      });
    },
  });
};

export const useRemoveAllowlistEntry = () => {
  const queryClient = useQueryClient();
  return useMutation<{ message: string }, HttpError, number>({
    mutationFn: (id) => removeAllowlistEntry(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<AllowlistEntry[] | undefined>(ALLOWLIST_QUERY_KEY, (current) => {
        if (!current) {
          return current;
        }
        return current.filter((item) => item.id !== id);
      });
    },
  });
};
