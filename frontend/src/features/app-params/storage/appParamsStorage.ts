import { type AppParams } from '../types/appParams';

const STORAGE_KEY = 'lkdposts:app-params';

export type AppParamsCacheEntry = {
  value: AppParams;
  fetchedAt: number;
};

const getStorage = () => {
  if (!('window' in globalThis)) {
    return undefined;
  }

  try {
    return globalThis.window.localStorage;
  } catch {
    return undefined;
  }
};

export const readAppParamsCache = (): AppParamsCacheEntry | null => {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { value: AppParams; fetchedAt: number };
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (typeof parsed.fetchedAt !== 'number') {
      return null;
    }

    return {
      value: parsed.value,
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
};

export const writeAppParamsCache = (value: AppParams, fetchedAt: number) => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ value, fetchedAt } satisfies AppParamsCacheEntry));
  } catch {
    // ignore storage errors
  }
};

export const clearAppParamsCache = () => {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
};

export const getAppParamsStorageKey = () => STORAGE_KEY;
