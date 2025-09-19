import { z } from 'zod';

import { getJson, HttpError, postJson } from '@/lib/api/http';

const authUserSchema = z.object({
  email: z.string().email(),
  role: z.union([z.literal('admin'), z.literal('user')]),
  expiresAt: z.string(),
});

export type AuthenticatedUser = z.infer<typeof authUserSchema>;

export const loginWithGoogle = async (idToken: string) => {
  if (!idToken) {
    throw new Error('Missing Google ID token');
  }

  try {
    return await postJson<AuthenticatedUser, { idToken: string }>('/api/v1/auth/login/google', { idToken }, authUserSchema);
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) {
      throw new HttpError('Seu email nao esta autorizado para acessar este aplicativo.', error.status, error.payload);
    }
    throw error;
  }
};

export const fetchCurrentUser = () => {
  return getJson<AuthenticatedUser>('/api/v1/auth/me', authUserSchema);
};

export const logout = () => {
  return postJson<{ message: string }, Record<string, never>>('/api/v1/auth/logout', {});
};

