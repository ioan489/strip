/**
 * Creates an in-memory LRU cache with optional per-entry TTL.
 *
 * Design decisions:
 *
 *   LRU eviction — the Map preserves insertion order. The least-recently-used
 *   entry is always first. On a cache hit, the entry is deleted and re-inserted
 *   at the end (O(1)). On eviction, the first key is removed (O(1)).
 *   This gives correct LRU behaviour without a doubly-linked list.
 *
 *   Lazy TTL expiry — expired entries are removed on access, not by a background
 *   timer. This is correct for a static site: no idle CPU, no timer ref keeping
 *   the process alive, no race between timer and GC.
 *
 *   Stats — every operation updates counters. Call getStats() from a health
 *   endpoint or log it periodically to understand real cache behaviour.
 *
 * @param {object} [options]
 * @param {number} [options.maxSize=512]   - max entries before LRU eviction
 * @param {number} [options.defaultTtl=0]  - default TTL in ms; 0 = no expiry
 * @returns {import('./cache-adapter.js').CacheAdapter}
 */
export function createInMemoryCache({ maxSize = 512, defaultTtl = 0 } = {}) {
  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new TypeError(`createInMemoryCache: maxSize must be a positive integer, got ${maxSize}.`);
  }
  if (typeof defaultTtl !== 'number' || defaultTtl < 0) {
    throw new TypeError(
      `createInMemoryCache: defaultTtl must be a non-negative number, got ${defaultTtl}.`,
    );
  }

  /**
   * @type {Map<string, { value: unknown; expiresAt: number | null }>}
   */
  const store = new Map();

  const stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  };

  // ── Private helpers ──────────────────────────────────────────────────────

  function isExpired(entry) {
    return entry.expiresAt !== null && entry.expiresAt < Date.now();
  }

  /**
   * Move an existing entry to tail (most-recently-used position).
   * Called on every cache hit to maintain LRU ordering.
   */
  function touch(key, entry) {
    store.delete(key);
    store.set(key, entry);
  }

  /**
   * Evict the least-recently-used entry (Map head).
   * Called when store.size === maxSize and a new key is being inserted.
   */
  function evictLru() {
    const lruKey = store.keys().next().value;
    if (lruKey !== undefined) {
      store.delete(lruKey);
      stats.evictions++;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  return Object.freeze({
    /**
     * @param {string} key
     * @returns {Promise<unknown | undefined>}
     */
    async get(key) {
      const entry = store.get(key);

      if (!entry) {
        stats.misses++;
        return undefined;
      }

      if (isExpired(entry)) {
        store.delete(key);
        stats.expirations++;
        stats.misses++;
        return undefined;
      }

      touch(key, entry);
      stats.hits++;
      return entry.value;
    },

    /**
     * @param {string} key
     * @param {unknown} value
     * @param {number} [ttl] - overrides defaultTtl for this entry; 0 = no expiry
     * @returns {Promise<void>}
     */
    async set(key, value, ttl) {
      const resolvedTtl = ttl ?? defaultTtl;
      const expiresAt = resolvedTtl > 0 ? Date.now() + resolvedTtl : null;
      const entry = { value, expiresAt };

      if (store.has(key)) {
        // Key already exists: delete to refresh LRU position, then reinsert.
        store.delete(key);
      } else if (store.size >= maxSize) {
        // At capacity: evict LRU before inserting the new entry.
        evictLru();
      }

      store.set(key, entry);
    },

    /**
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async delete(key) {
      return store.delete(key);
    },

    /**
     * Removes all entries and resets stats.
     * @returns {Promise<void>}
     */
    async clear() {
      store.clear();
      stats.hits = 0;
      stats.misses = 0;
      stats.evictions = 0;
      stats.expirations = 0;
    },

    /**
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async has(key) {
      const entry = store.get(key);
      if (!entry) return false;

      if (isExpired(entry)) {
        store.delete(key);
        stats.expirations++;
        return false;
      }

      return true;
    },

    /**
     * Returns a snapshot of cache statistics.
     *
     * Safe to expose from a /health or /_debug/cache endpoint.
     * Call logger.debug('Cache stats', cache.getStats()) periodically
     * to understand real hit rate in production.
     *
     * @returns {import('./cache-adapter.js').CacheStats}
     */
    getStats() {
      const total = stats.hits + stats.misses;
      return {
        size: store.size,
        maxSize,
        hits: stats.hits,
        misses: stats.misses,
        evictions: stats.evictions,
        expirations: stats.expirations,
        hitRate: total > 0 ? (stats.hits / total).toFixed(3) : null,
      };
    },
  });
}
