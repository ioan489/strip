import { ContentError, ContentErrorCode } from '../errors/index.js';
import { isPage } from '../models/page.js';

/**
 * @file cache-adapter.js
 * Wraps a content repository with caching.
 *
 * Every public method first checks the cache. On a cache miss it calls the
 * underlying repository, stores the result, and returns it.
 *
 * Because our Page aggregates are deeply immutable, they can be safely cached
 * without risk of mutation. This cache is purely additive – it never changes
 * the behaviour of the wrapped repository, only its performance.
 *
 * Namespacing is automatic: all cache keys are prefixed with `content::`
 * to avoid collisions with other subsystems.
 *
 * @param {object} repository – the underlying repository (must implement getPage, hasPage, getPages, getSlugs)
 * @param {import('../../../lib/cache/cache-adapter.js').CacheAdapter} cacheAdapter
 * @param {object} [options]
 * @param {number} [options.ttl=0] – default time-to-live in ms; 0 = infinite
 * @returns {object} cached repository (same interface)
 */
export function createCachedContentRepository(repository, cacheAdapter, { ttl = 0 } = {}) {
  if (!repository || typeof repository.getPage !== 'function') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'CachedContentRepository requires a valid content repository.',
    );
  }
  if (!cacheAdapter || typeof cacheAdapter.get !== 'function') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'CachedContentRepository requires a cache adapter.',
    );
  }

  const PREFIX = 'content::';
  const key = (slug) => `${PREFIX}page:${slug}`;
  const ALL_PAGES_KEY = `${PREFIX}pages:all`;
  const SLUGS_KEY = `${PREFIX}slugs:all`;

  return Object.freeze({
    /**
     * @param {string} slug
     * @returns {import('../models/page.js').Page}
     */
    async getPage(slug) {
      const cacheKey = key(slug);
      const cached = await cacheAdapter.get(cacheKey);
      if (cached) {
        // Sanity: ensure it's still a trusted Page (should never not be)
        if (!isPage(cached)) {
          await cacheAdapter.delete(cacheKey);
        } else {
          return cached;
        }
      }

      const page = repository.getPage(slug);
      await cacheAdapter.set(cacheKey, page, ttl);
      return page;
    },

    /**
     * @param {string} slug
     * @returns {boolean}
     */
    async hasPage(slug) {
      const cacheKey = key(slug);
      if (await cacheAdapter.has(cacheKey)) return true;
      const exists = repository.hasPage(slug);
      // Don't cache boolean misses permanently; rely on the underlying repo
      return exists;
    },

    /**
     * @returns {import('../models/page.js').Page[]}
     */
    async getPages() {
      const cached = await cacheAdapter.get(ALL_PAGES_KEY);
      if (cached) return cached;

      const pages = repository.getPages();
      await cacheAdapter.set(ALL_PAGES_KEY, pages, ttl);
      return pages;
    },

    /**
     * @returns {string[]}
     */
    async getSlugs() {
      const cached = await cacheAdapter.get(SLUGS_KEY);
      if (cached) return cached;

      const slugs = repository.getSlugs();
      await cacheAdapter.set(SLUGS_KEY, slugs, ttl);
      return slugs;
    },
  });
}
