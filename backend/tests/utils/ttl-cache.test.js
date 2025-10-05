const { createTtlCache } = require('../../src/utils/ttl-cache');

describe('createTtlCache', () => {
  const initialTime = new Date('2024-01-01T00:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(initialTime);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores and retrieves values while entries are valid', () => {
    const cache = createTtlCache({ ttlMs: 1_000 });

    cache.set('key', 'value');

    expect(cache.get('key')).toBe('value');
  });

  it('expires entries based on the provided ttl', () => {
    const cache = createTtlCache({ ttlMs: 1_000 });

    cache.set('expiring', 'value');

    jest.advanceTimersByTime(999);
    expect(cache.get('expiring')).toBe('value');

    jest.advanceTimersByTime(1);
    expect(cache.get('expiring')).toBeUndefined();
  });

  it('supports custom ttl per entry', () => {
    const cache = createTtlCache({ ttlMs: 10_000 });

    cache.set('short', 'value', 500);
    cache.set('long', 'value', 2_000);

    jest.advanceTimersByTime(600);

    expect(cache.get('short')).toBeUndefined();
    expect(cache.get('long')).toBe('value');
  });

  it('prunes expired entries when requested', () => {
    const cache = createTtlCache({ ttlMs: 500 });

    cache.set('a', 'value-a');
    jest.advanceTimersByTime(600);

    cache.prune();

    expect(cache.get('a')).toBeUndefined();
  });

  it('enforces maximum capacity by removing the oldest entries first', () => {
    const cache = createTtlCache({ ttlMs: 5_000, maxEntries: 2 });

    cache.set('first', 'one', 1_000);
    cache.set('second', 'two', 2_000);

    jest.advanceTimersByTime(100);

    cache.set('third', 'three', 3_000);

    expect(cache.get('first')).toBeUndefined();
    expect(cache.get('second')).toBe('two');
    expect(cache.get('third')).toBe('three');
  });
});
