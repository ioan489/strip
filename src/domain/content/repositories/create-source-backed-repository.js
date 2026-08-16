import { ContentError, ContentErrorCode } from '../errors/index.js';

/**
 * Creates a repository that compiles pages from any content source.
 *
 * Strategy is selected by the `loading` option:
 *
 *   'eager'  — compile at construction time (local modules)
 *              fails at startup, never at request time
 *
 *   'lazy'   — compile on first access (CMS / async sources)
 *              non-blocking startup; transient failures can be retried
 *
 * @param {object} params
 * @param {{ loadAllPages(): Promise<object[]> }} params.source
 * @param {object} params.pageFactory
 * @param {boolean} [params.preview=false]
 * @param {'eager'|'lazy'} [params.loading='lazy']
 * @param {object} [params.logger]
 */
export async function createSourceBackedRepository({
  source,
  pageFactory,
  preview = false,
  loading = 'lazy',
  logger = null,
}) {
  if (!source || typeof source.loadAllPages !== 'function') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'createSourceBackedRepository requires a source with loadAllPages().',
    );
  }
  if (!pageFactory || typeof pageFactory.createFromModule !== 'function') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'createSourceBackedRepository requires a pageFactory.',
    );
  }

  /** @type {Map<string, import('../models/page.js').Page> | null} */
  let runtimePages = null;

  async function compile() {
    const rawPages = await source.loadAllPages();
    const map = new Map();

    for (const [index, raw] of rawPages.entries()) {
      let page;
      try {
        page = pageFactory.createFromModule(raw);
      } catch (err) {
        throw new ContentError(
          ContentErrorCode.CONTENT_DEFINITION_ERROR,
          `Failed to compile page at index ${index} ("${raw?.slug ?? 'unknown'}"): ${err.message}`,
          { cause: err },
        );
      }

      if (!preview && page.status !== 'published') continue;

      if (map.has(page.slug)) {
        throw new ContentError(
          ContentErrorCode.CONTENT_ALREADY_EXISTS,
          `Duplicate page slug "${page.slug}".`,
        );
      }

      map.set(page.slug, page);
    }

    logger?.debug('Pages compiled', {
      total: rawPages.length,
      loaded: map.size,
      preview,
    });

    return map;
  }

  // Eager: compile now, block until done, surface errors immediately.
  if (loading === 'eager') {
    runtimePages = await compile();
  }

  // Lazy: one in-flight promise at a time; on rejection, clears so retry is possible.
  let pendingLoad = null;

  async function ensureLoaded() {
    if (runtimePages) return;

    if (!pendingLoad) {
      pendingLoad = compile()
        .then((map) => {
          runtimePages = map;
          pendingLoad = null;
        })
        .catch((err) => {
          // Clear so the next request can retry (useful for transient CMS failures).
          pendingLoad = null;
          throw err;
        });
    }

    await pendingLoad;
  }

  return Object.freeze({
    async getPage(slug) {
      await ensureLoaded();
      const page = runtimePages.get(slug);
      if (!page) {
        throw new ContentError(ContentErrorCode.PAGE_NOT_FOUND, `Page "${slug}" not found.`);
      }
      return page;
    },

    async hasPage(slug) {
      await ensureLoaded();
      return runtimePages.has(slug);
    },

    async getPages() {
      await ensureLoaded();
      return [...runtimePages.values()];
    },

    async getSlugs() {
      await ensureLoaded();
      return [...runtimePages.keys()];
    },
  });
}
