import {
  allowlistCollectionSchema,
  allowlistEntrySchema,
  type AllowedRole,
  type AllowlistCollection,
  type AllowlistEntry,
} from '../types/allowlist';

import { deleteJson, getJson, patchJson, postJson } from '@/lib/api/http';

export const ALLOWLIST_QUERY_KEY = ['allowlist'] as const;

export type AllowlistResponse = AllowlistCollection['items'];

export const fetchAllowlist = async () => {
  const response = await getJson('/api/v1/allowlist', allowlistCollectionSchema);
  return response.items;
};

export const createAllowlistEntry = (payload: { email: string; role: AllowedRole }) => {
  return postJson<AllowlistEntry, { email: string; role: AllowedRole }>(
    '/api/v1/allowlist',
    payload,
    allowlistEntrySchema,
  );
};

export const updateAllowlistEntryRole = (id: number, role: AllowedRole) => {
  return patchJson<AllowlistEntry, { role: AllowedRole }>(
    `/api/v1/allowlist/${id}`,
    { role },
    allowlistEntrySchema,
  );
};

export const removeAllowlistEntry = (id: number) => {
  return deleteJson<{ message: string }>(`/api/v1/allowlist/${id}`);
};
