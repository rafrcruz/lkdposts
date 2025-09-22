const createTtlCache = ({ ttlMs = 60_000, maxEntries = 50 } = {}) => {
  const store = new Map();
  const normalizedTtl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 0;

  const computeExpiry = (customTtl) => {
    const ttl = Number.isFinite(customTtl) && customTtl > 0 ? customTtl : normalizedTtl;
    return ttl > 0 ? Date.now() + ttl : 0;
  };

  const prune = () => {
    if (store.size === 0) {
      return;
    }

    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        store.delete(key);
      }
    }
  };

  const ensureCapacity = () => {
    if (store.size <= maxEntries) {
      return;
    }

    const entries = Array.from(store.entries());
    entries.sort((a, b) => (a[1].expiresAt || 0) - (b[1].expiresAt || 0));
    while (store.size > maxEntries && entries.length > 0) {
      const [key] = entries.shift();
      store.delete(key);
    }
  };

  const get = (key) => {
    const entry = store.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }

    return entry.value;
  };

  const set = (key, value, ttl = normalizedTtl) => {
    const expiresAt = computeExpiry(ttl);
    store.set(key, { value, expiresAt });
    prune();
    ensureCapacity();
  };

  const remove = (key) => {
    store.delete(key);
  };

  const clear = () => {
    store.clear();
  };

  return {
    get,
    set,
    delete: remove,
    clear,
    prune,
  };
};

module.exports = {
  createTtlCache,
};
