import { useCallback, useMemo, useRef, useState } from 'react';

type RawDiagnostics = {
  refreshCount: number;
  cooldownBlocks: number;
  totalFetchDurationMs: number;
  fetchCount: number;
};

type DiagnosticsMetrics = {
  refreshCount: number;
  cooldownBlocks: number;
  avgFetchDurationMs: number;
};

const STORAGE_KEY = 'lkdposts.posts.diagnostics';

const DEFAULT_STATE: RawDiagnostics = {
  refreshCount: 0,
  cooldownBlocks: 0,
  totalFetchDurationMs: 0,
  fetchCount: 0,
};

let hasLoggedSessionStorageError = false;

const getSessionStorage = (): Storage | null => {
  try {
    const { sessionStorage } = globalThis as typeof globalThis & { sessionStorage?: Storage };
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch (error) {
    if (!hasLoggedSessionStorageError) {
      console.warn('Unable to access sessionStorage for posts diagnostics.', error);
      hasLoggedSessionStorageError = true;
    }
    return null;
  }
};

const sanitizeCount = (value: unknown, minimum = 0) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return minimum;
  }

  const normalized = Math.trunc(value);
  return Math.max(normalized, minimum);
};

const sanitizeTotal = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(value, 0);
};

const readDiagnosticsFromStorage = (): RawDiagnostics | null => {
  const storage = getSessionStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<RawDiagnostics> | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      refreshCount: sanitizeCount(parsed.refreshCount),
      cooldownBlocks: sanitizeCount(parsed.cooldownBlocks),
      totalFetchDurationMs: sanitizeTotal(parsed.totalFetchDurationMs),
      fetchCount: sanitizeCount(parsed.fetchCount),
    };
  } catch (error) {
    if (!hasLoggedSessionStorageError) {
      console.warn('Unable to read posts diagnostics from sessionStorage.', error);
      hasLoggedSessionStorageError = true;
    }
    return null;
  }
};

const persistDiagnostics = (state: RawDiagnostics) => {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    if (!hasLoggedSessionStorageError) {
      console.warn('Unable to persist posts diagnostics into sessionStorage.', error);
      hasLoggedSessionStorageError = true;
    }
  }
};

const computeMetrics = (state: RawDiagnostics): DiagnosticsMetrics => {
  const average = state.fetchCount === 0 ? 0 : Math.round(state.totalFetchDurationMs / state.fetchCount);

  return {
    refreshCount: state.refreshCount,
    cooldownBlocks: state.cooldownBlocks,
    avgFetchDurationMs: average,
  };
};

export const usePostsDiagnostics = () => {
  const initialStateRef = useRef<RawDiagnostics | null>(null);
  if (initialStateRef.current === null) {
    initialStateRef.current = readDiagnosticsFromStorage() ?? DEFAULT_STATE;
  }

  const [state, setState] = useState<RawDiagnostics>(initialStateRef.current);

  const updateState = useCallback((updater: (current: RawDiagnostics) => RawDiagnostics) => {
    setState((current) => {
      const next = updater(current);
      persistDiagnostics(next);
      return next;
    });
  }, []);

  const recordRefresh = useCallback(() => {
    updateState((current) => ({
      ...current,
      refreshCount: current.refreshCount + 1,
    }));
  }, [updateState]);

  const recordCooldownBlock = useCallback(() => {
    updateState((current) => ({
      ...current,
      cooldownBlocks: current.cooldownBlocks + 1,
    }));
  }, [updateState]);

  const recordFetchSuccess = useCallback(
    (durationMs: number) => {
      const safeDuration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;

      updateState((current) => ({
        ...current,
        totalFetchDurationMs: current.totalFetchDurationMs + safeDuration,
        fetchCount: current.fetchCount + 1,
      }));
    },
    [updateState],
  );

  const metrics = useMemo(() => computeMetrics(state), [state]);

  return {
    metrics,
    recordRefresh,
    recordCooldownBlock,
    recordFetchSuccess,
  };
};

