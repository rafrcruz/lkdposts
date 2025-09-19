import { z } from 'zod';

import { deleteJson, getJson, patchJson, postJson } from '@/lib/api/http';
import type { AllowedRole, AllowlistEntry } from '../types/allowlist';

const allowlistEntrySchema = z.object({
  id: z.number().int().nonnegative(),
  email: z.string().email(),
  role: z.union([z.literal('admin'), z.literal('user')]),
  immutable: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const allowlistCollectionSchema = z.object({
  items: z.array(allowlistEntrySchema),
});

export const ALLOWLIST_QUERY_KEY = ['allowlist'] as const;

export type AllowlistResponse = z.infer<typeof allowlistCollectionSchema>['items'];

export const fetchAllowlist = async () => {
  const response = await getJson('/api/v1/allowlist', allowlistCollectionSchema);
  return response.items;
};

export const createAllowlistEntry = (payload: { email: string; role: AllowedRole }) => {
  return postJson<AllowlistEntry, { email: string; role: AllowedRole }>('/api/v1/allowlist', payload, allowlistEntrySchema);
};

export const updateAllowlistEntryRole = (id: number, role: AllowedRole) => {
  return patchJson<AllowlistEntry, { role: AllowedRole }>(`/api/v1/allowlist/${id}`, { role }, allowlistEntrySchema);
};

export const removeAllowlistEntry = (id: number) => {
  return deleteJson<{ message: string }>(`/api/v1/allowlist/${id}`);
};
