/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  getCurrentUser,
  loginWithGoogle as loginWithGoogleRequest,
  logout as logoutRequest,
  type AuthenticatedUser,
  type AuthSession,
} from '../api/auth';
import { ALLOWLIST_QUERY_KEY } from '@/features/allowlist/api/allowlist';
import { HELLO_QUERY_KEY } from '@/features/hello/hooks/useHelloMessage';

const GUEST_SESSION: AuthSession = { authenticated: false, user: null };

export type AuthStatus = 'unknown' | 'authenticated' | 'guest';

export type AuthContextValue = {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  isAuthenticating: boolean;
  authError: string | null;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
  refreshSession: () => Promise<AuthSession>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('unknown');
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const applySession = useCallback((session: AuthSession) => {
    if (session.authenticated) {
      setUser(session.user);
      setStatus('authenticated');
      return;
    }

    setUser(null);
    setStatus('guest');
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
      const session = await getCurrentUser();
      setAuthError(null);
      applySession(session);
      if (session.authenticated) {
        clearCaches();
      }
      return session;
    } catch (error) {
      applySession(GUEST_SESSION);
      if (error instanceof Error) {
        setAuthError(error.message);
      }
      throw error;
    }
  }, [applySession, clearCaches]);

  useEffect(() => {
    let isMounted = true;

    const initialise = async () => {
      try {
        const session = await getCurrentUser();
        if (!isMounted) {
          return;
        }
        setAuthError(null);
        applySession(session);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        applySession(GUEST_SESSION);
        if (error instanceof Error) {
          setAuthError(error.message);
        }
      }
    };

    initialise().catch(() => {
      // handled above
    });

    return () => {
      isMounted = false;
    };
  }, [applySession]);

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      setIsAuthenticating(true);
      setAuthError(null);
      try {
        await loginWithGoogleRequest(idToken);
        const session = await refreshSession();
        if (!session.authenticated) {
          throw new Error('Sessao nao estabelecida apos o login. Tente novamente.');
        }
      } catch (error) {
        applySession(GUEST_SESSION);
        if (error instanceof Error) {
          setAuthError(error.message);
        }
        throw error;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [applySession, refreshSession]
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
      applySession(GUEST_SESSION);
      queryClient.clear();
    }
  }, [applySession, queryClient]);

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
