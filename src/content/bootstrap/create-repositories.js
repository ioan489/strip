import {
  createCachedContentRepository,
  createSourceBackedRepository,
} from '../../domain/content/repositories/index.js';
import { createLocalModuleSource } from '../sources/create-local-module-source.js';

import { createInMemoryCache } from '../../lib/cache/create-in-memory-cache.js';

/**
 * Creates content repositories from a local module source.
 *
 * Eager loading is used: compilation failures surface at startup.
 * Swap createLocalModuleSource for createContentfulSource to load from a CMS instead.
 *
 * @param {object} options
 * @param {object} options.pageFactory
 * @param {object} options.pages
 *
 * @returns {{
 *   publishedRepository: object,
 *   previewRepository: object
 * }}
 */
export async function createRepositories({ pageFactory, pages, logger, cacheConfig }) {
  const source = createLocalModuleSource(pages);

  const contentCache = createInMemoryCache({
    maxSize: cacheConfig.maxSize,
    defaultTtl: cacheConfig.ttl,
  });

  const [publishedBase, previewRepository] = await Promise.all([
    createSourceBackedRepository({
      source,
      pageFactory,
      preview: false,
      loading: 'eager',
      logger,
    }),
    createSourceBackedRepository({
      source,
      pageFactory,
      preview: true,
      loading: 'eager',
      logger,
    }),
  ]);

  const publishedRepository = createCachedContentRepository(publishedBase, contentCache, {
    ttl: cacheConfig.ttl,
  });

  logger?.debug('Content cache initialised', {
    maxSize: cacheConfig.maxSize,
    ttl: cacheConfig.ttl === 0 ? 'infinite' : `${cacheConfig.ttl}ms`,
  });

  return Object.freeze({ publishedRepository, previewRepository, contentCache });
}
