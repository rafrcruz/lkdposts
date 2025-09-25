import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { fetchAppParams, updateAppParams } from '../api/appParams';
import { type AppParams, type AppParamsUpdateInput } from '../types/appParams';
import {
  clearAppParamsCache,
  getAppParamsStorageKey,
  readAppParamsCache,
  writeAppParamsCache,
} from '../storage/appParamsStorage';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { HttpError } from '@/lib/api/http';

const ONE_HOUR_IN_MS = 60 * 60 * 1000;

type AppParamsStatus = 'idle' | 'loading' | 'success' | 'error';

type RefreshOptions = {
  force?: boolean;
};

type AppParamsContextValue = {
  params: AppParams | null;
  status: AppParamsStatus;
  error: unknown;
  isFetching: boolean;
  fetchedAt: number | null;
  refresh: (options?: RefreshOptions) => Promise<AppParams | null>;
  update: (changes: AppParamsUpdateInput) => Promise<AppParams>;
  clearError: () => void;
};

const AppParamsContext = createContext<AppParamsContextValue | undefined>(undefined);

const isCacheExpired = (fetchedAt: number) => Date.now() - fetchedAt >= ONE_HOUR_IN_MS;

export const AppParamsProvider = ({ children }: { children: ReactNode }) => {
  const { status: authStatus } = useAuth();
  const [params, setParams] = useState<AppParams | null>(null);
  const [status, setStatus] = useState<AppParamsStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const hasInitialisedRef = useRef(false);

  const applyParams = useCallback((nextParams: AppParams, nextFetchedAt: number) => {
    setParams(nextParams);
    setFetchedAt(nextFetchedAt);
    setStatus('success');
    setError(null);
  }, []);

  const handleFetchError = useCallback(
    (fetchError: unknown, hasCachedValue: boolean) => {
      if (fetchError instanceof HttpError && fetchError.status === 401) {
        // Let auth flow handle unauthorized errors
        return;
      }

      setError(fetchError);
      if (!hasCachedValue) {
        setStatus('error');
      }
    },
    [],
  );

  const fetchAndApply = useCallback(async () => {
    const response = await fetchAppParams();
    const timestamp = Date.now();
    writeAppParamsCache(response, timestamp);
    applyParams(response, timestamp);
    return response;
  }, [applyParams]);

  const refresh = useCallback<Required<AppParamsContextValue>['refresh']>(
    async (options = {}) => {
      if (authStatus !== 'authenticated') {
        return null;
      }

      const cached = readAppParamsCache();
      const hasCachedValue = Boolean(cached);
      const shouldUseCache = cached && !options.force && !isCacheExpired(cached.fetchedAt);

      if (shouldUseCache) {
        applyParams(cached.value, cached.fetchedAt);
        return cached.value;
      }

      setIsFetching(true);
      try {
        return await fetchAndApply();
      } catch (fetchError) {
        handleFetchError(fetchError, hasCachedValue);
        throw fetchError;
      } finally {
        setIsFetching(false);
      }
    },
    [applyParams, authStatus, fetchAndApply, handleFetchError],
  );

  const update = useCallback<Required<AppParamsContextValue>['update']>(
    async (changes) => {
      const response = await updateAppParams(changes);
      const timestamp = Date.now();
      writeAppParamsCache(response, timestamp);
      applyParams(response, timestamp);
      return response;
    },
    [applyParams],
  );

  useEffect(() => {
    if (authStatus !== 'authenticated') {
      if (authStatus === 'guest') {
        clearAppParamsCache();
      }
      hasInitialisedRef.current = false;
      setParams(null);
      setFetchedAt(null);
      setStatus('idle');
      setError(null);
      setIsFetching(false);
      return;
    }

    if (hasInitialisedRef.current) {
      return;
    }

    hasInitialisedRef.current = true;

    const cached = readAppParamsCache();
    if (cached) {
      applyParams(cached.value, cached.fetchedAt);
    } else {
      setStatus('loading');
    }

    const shouldFetch = !cached || isCacheExpired(cached.fetchedAt);

    if (!shouldFetch) {
      return;
    }

    let isActive = true;
    setIsFetching(true);

    fetchAndApply()
      .catch((fetchError) => {
        if (!isActive) {
          return;
        }
        handleFetchError(fetchError, Boolean(cached));
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setIsFetching(false);
      });

    return () => {
      isActive = false;
    };
  }, [applyParams, authStatus, fetchAndApply, handleFetchError]);

  useEffect(() => {
    const browserWindow = 'window' in globalThis ? globalThis.window : undefined;
    if (!browserWindow) {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== browserWindow.localStorage) {
        return;
      }

      if (event.key !== getAppParamsStorageKey()) {
        return;
      }

      const cached = readAppParamsCache();

      if (!cached) {
        if (authStatus === 'authenticated') {
          setParams(null);
          setFetchedAt(null);
          setStatus('idle');
        }
        return;
      }

      applyParams(cached.value, cached.fetchedAt);
    };

    browserWindow.addEventListener('storage', handleStorage);
    return () => {
      browserWindow.removeEventListener('storage', handleStorage);
    };
  }, [applyParams, authStatus]);

  const clearError = useCallback(() => {
    setError(null);
    if (!params) {
      setStatus('idle');
    }
  }, [params]);

  const value = useMemo<AppParamsContextValue>(
    () => ({ params, status, error, isFetching, fetchedAt, refresh, update, clearError }),
    [params, status, error, isFetching, fetchedAt, refresh, update, clearError],
  );

  return <AppParamsContext.Provider value={value}>{children}</AppParamsContext.Provider>;
};

export const useAppParamsContext = () => {
  const context = useContext(AppParamsContext);
  if (!context) {
    throw new Error('useAppParamsContext must be used within an AppParamsProvider');
  }

  return context;
};
