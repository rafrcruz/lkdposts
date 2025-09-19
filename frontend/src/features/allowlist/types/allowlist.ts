import { z } from 'zod';

export const allowedRoleSchema = z.union([z.literal('admin'), z.literal('user')]);
export type AllowedRole = z.infer<typeof allowedRoleSchema>;

export const allowlistEntrySchema = z.object({
  id: z.number().int().nonnegative(),
  email: z.string().email(),
  role: allowedRoleSchema,
  immutable: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AllowlistEntry = z.infer<typeof allowlistEntrySchema>;

export const allowlistCollectionSchema = z.object({
  items: z.array(allowlistEntrySchema),
});

export type AllowlistCollection = z.infer<typeof allowlistCollectionSchema>;
