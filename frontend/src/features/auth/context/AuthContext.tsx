/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { fetchCurrentUser, loginWithGoogle as loginWithGoogleRequest, logout as logoutRequest, type AuthenticatedUser } from '../api/auth';
import { HttpError } from '@/lib/api/http';
import { ALLOWLIST_QUERY_KEY } from '@/features/allowlist/api/allowlist';
import { HELLO_QUERY_KEY } from '@/features/hello/hooks/useHelloMessage';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export type AuthContextValue = {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  isAuthenticating: boolean;
  authError: string | null;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const applyUser = useCallback((nextUser: AuthenticatedUser | null) => {
    setUser(nextUser);
    setStatus(nextUser ? 'authenticated' : 'unauthenticated');
  }, []);

  const clearCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: HELLO_QUERY_KEY }).catch(() => {
      // ignore cache errors
    });
    queryClient.invalidateQueries({ queryKey: ALLOWLIST_QUERY_KEY }).catch(() => {
      // ignore cache errors
    });
  }, [queryClient]);

  const refreshSession = useCallback(async () => {
    try {
      const currentUser = await fetchCurrentUser();
      setAuthError(null);
      applyUser(currentUser);
    } catch (error) {
      applyUser(null);
      if (error instanceof HttpError && error.status === 401) {
        return;
      }
      if (error instanceof Error) {
        setAuthError(error.message);
      }
    }
  }, [applyUser]);

  useEffect(() => {
    let isMounted = true;

    const initialise = async () => {
      try {
        const currentUser = await fetchCurrentUser();
        if (!isMounted) return;
        setAuthError(null);
        applyUser(currentUser);
      } catch (error) {
        if (!isMounted) return;
        applyUser(null);
        if (!(error instanceof HttpError && error.status === 401) && error instanceof Error) {
          setAuthError(error.message);
        }
        setStatus('unauthenticated');
      }
    };

    initialise().catch(() => {
      // handled above
    });

    return () => {
      isMounted = false;
    };
  }, [applyUser]);

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      setIsAuthenticating(true);
      setAuthError(null);
      try {
        const nextUser = await loginWithGoogleRequest(idToken);
        applyUser(nextUser);
        clearCaches();
      } catch (error) {
        applyUser(null);
        if (error instanceof Error) {
          setAuthError(error.message);
        }
        throw error;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [applyUser, clearCaches]
  );

  const logout = useCallback(async () => {
    setIsAuthenticating(true);
    try {
      await logoutRequest();
    } catch {
      // ignore logout failure to avoid trapping the user in a bad session state
    } finally {
      setIsAuthenticating(false);
      setAuthError(null);
      applyUser(null);
      queryClient.clear();
    }
  }, [applyUser, queryClient]);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAuthenticating,
      authError,
      loginWithGoogle,
      logout,
      clearAuthError,
      refreshSession,
    }),
    [status, user, isAuthenticating, authError, loginWithGoogle, logout, clearAuthError, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};























