/**
 * @file cache-adapter.js
 *
 * Documents the CacheAdapter contract.
 *
 * Any object satisfying this shape can be passed to createCachedContentRepository.
 * Implementations: createInMemoryCache (this package), Redis adapter, Cloudflare KV adapter.
 *
 * TTL is always in milliseconds. 0 means no expiry.
 *
 * @typedef {object} CacheAdapter
 * @property {(key: string) => Promise<unknown | undefined>} get
 * @property {(key: string, value: unknown, ttl?: number) => Promise<void>} set
 * @property {(key: string) => Promise<boolean>} delete
 * @property {() => Promise<void>} clear
 * @property {(key: string) => Promise<boolean>} has
 * @property {() => CacheStats} getStats
 */

/**
 * @typedef {object} CacheStats
 * @property {number} size        - current number of entries
 * @property {number} maxSize     - eviction threshold
 * @property {number} hits
 * @property {number} misses
 * @property {number} evictions   - LRU evictions
 * @property {number} expirations - TTL expirations
 * @property {string|null} hitRate - formatted 0.000–1.000, null if no requests yet
 */
