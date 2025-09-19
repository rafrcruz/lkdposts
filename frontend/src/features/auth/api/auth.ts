import { z } from 'zod';

import { getJson, HttpError, postJson } from '@/lib/api/http';

const authUserSchema = z.object({
  email: z.string().email(),
  role: z.union([z.literal('admin'), z.literal('user')]),
  expiresAt: z.string(),
});

export type AuthenticatedUser = z.infer<typeof authUserSchema>;

export type AuthSession =
  | { authenticated: true; user: AuthenticatedUser }
  | { authenticated: false; user: null };

export const loginWithGoogle = async (idToken: string) => {
  if (!idToken) {
    throw new Error('Missing Google ID token');
  }

  try {
    return await postJson<AuthenticatedUser, { idToken: string }>(
      '/api/v1/auth/login/google',
      { idToken },
      authUserSchema,
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 403) {
      throw new HttpError('Seu email nao esta autorizado para acessar este aplicativo.', error.status, error.payload);
    }
    throw error;
  }
};

export const getCurrentUser = async (): Promise<AuthSession> => {
  try {
    const user = await getJson<AuthenticatedUser>('/api/v1/auth/me', authUserSchema);
    return { authenticated: true, user };
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      return { authenticated: false, user: null };
    }

    throw error;
  }
};

export const logout = () => {
  return postJson<{ message: string }, Record<string, never>>('/api/v1/auth/logout', {});
};
