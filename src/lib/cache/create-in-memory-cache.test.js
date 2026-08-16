// src/lib/cache/create-in-memory-cache.test.js
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createInMemoryCache } from './create-in-memory-cache.js';

describe('createInMemoryCache', () => {
  describe('construction', () => {
    it('throws for maxSize < 1', () => {
      expect(() => createInMemoryCache({ maxSize: 0 })).toThrow();
    });
    it('throws for negative defaultTtl', () => {
      expect(() => createInMemoryCache({ defaultTtl: -1 })).toThrow();
    });
  });

  describe('basic operations', () => {
    let cache;
    beforeEach(() => {
      cache = createInMemoryCache();
    });

    it('returns undefined for a missing key', async () => {
      expect(await cache.get('missing')).toBeUndefined();
    });

    it('stores and retrieves a value', async () => {
      await cache.set('k', 'v');
      expect(await cache.get('k')).toBe('v');
    });

    it('stores objects by reference', async () => {
      const obj = { a: 1 };
      await cache.set('obj', obj);
      expect(await cache.get('obj')).toBe(obj);
    });

    it('has() returns true for existing key', async () => {
      await cache.set('k', 'v');
      expect(await cache.has('k')).toBe(true);
    });

    it('delete() removes a key', async () => {
      await cache.set('k', 'v');
      await cache.delete('k');
      expect(await cache.get('k')).toBeUndefined();
    });

    it('clear() removes all entries and resets stats', async () => {
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.clear();
      expect(await cache.get('a')).toBeUndefined();
      expect(cache.getStats().hits).toBe(0);
    });
  });

  describe('TTL', () => {
    afterEach(() => vi.useRealTimers());

    it('returns undefined after TTL expires', async () => {
      vi.useFakeTimers();
      const cache = createInMemoryCache();
      await cache.set('k', 'v', 100);
      vi.advanceTimersByTime(101);
      expect(await cache.get('k')).toBeUndefined();
    });

    it('has() returns false for expired entries', async () => {
      vi.useFakeTimers();
      const cache = createInMemoryCache();
      await cache.set('k', 'v', 100);
      vi.advanceTimersByTime(101);
      expect(await cache.has('k')).toBe(false);
    });

    it('ttl=0 means no expiry', async () => {
      vi.useFakeTimers();
      const cache = createInMemoryCache({ defaultTtl: 0 });
      await cache.set('k', 'v');
      vi.advanceTimersByTime(999_999);
      expect(await cache.get('k')).toBe('v');
    });

    it('per-entry ttl overrides defaultTtl', async () => {
      vi.useFakeTimers();
      const cache = createInMemoryCache({ defaultTtl: 10_000 });
      await cache.set('k', 'v', 100); // override to 100ms
      vi.advanceTimersByTime(101);
      expect(await cache.get('k')).toBeUndefined();
    });
  });

  describe('LRU eviction', () => {
    it('evicts the LRU entry when at capacity', async () => {
      const cache = createInMemoryCache({ maxSize: 3 });
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.set('c', 3);
      await cache.set('d', 4); // evicts 'a'
      expect(await cache.get('a')).toBeUndefined();
      expect(await cache.get('d')).toBe(4);
    });

    it('a get() promotes the key to MRU position', async () => {
      const cache = createInMemoryCache({ maxSize: 3 });
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.set('c', 3);
      await cache.get('a'); // 'a' is now MRU; 'b' is now LRU
      await cache.set('d', 4); // evicts 'b'
      expect(await cache.get('b')).toBeUndefined();
      expect(await cache.get('a')).toBe(1);
    });

    it('updating an existing key does not grow the cache', async () => {
      const cache = createInMemoryCache({ maxSize: 2 });
      await cache.set('a', 1);
      await cache.set('b', 2);
      await cache.set('a', 99); // update, not insert
      expect(cache.getStats().size).toBe(2);
    });
  });

  describe('getStats()', () => {
    it('tracks hits and misses', async () => {
      const cache = createInMemoryCache();
      await cache.set('k', 'v');
      await cache.get('k'); // hit
      await cache.get('nope'); // miss
      const s = cache.getStats();
      expect(s.hits).toBe(1);
      expect(s.misses).toBe(1);
    });

    it('computes hit rate to 3 decimal places', async () => {
      const cache = createInMemoryCache();
      await cache.set('k', 'v');
      await cache.get('k'); // hit
      await cache.get('k'); // hit
      await cache.get('nope'); // miss
      expect(cache.getStats().hitRate).toBe('0.667');
    });

    it('returns null hitRate when no requests have been made', () => {
      expect(createInMemoryCache().getStats().hitRate).toBeNull();
    });

    it('tracks evictions', async () => {
      const cache = createInMemoryCache({ maxSize: 1 });
      await cache.set('a', 1);
      await cache.set('b', 2); // evicts 'a'
      expect(cache.getStats().evictions).toBe(1);
    });

    it('tracks expirations separately from evictions', async () => {
      vi.useFakeTimers();
      const cache = createInMemoryCache();
      await cache.set('k', 'v', 100);
      vi.advanceTimersByTime(101);
      await cache.get('k'); // triggers lazy expiration
      expect(cache.getStats().expirations).toBe(1);
      expect(cache.getStats().evictions).toBe(0);
      vi.useRealTimers();
    });
  });
});
