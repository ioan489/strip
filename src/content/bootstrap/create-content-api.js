import { isPreview } from '../../lib/preview-context.js';

/**
 * Creates the public content API.
 *
 * Hides repository selection from consumers.
 * Consumers call content.page(), content.pages(), etc.
 * They never touch publishedRepository or previewRepository directly.
 *
 * @param {object} options
 * @param {object} options.publishedRepository
 * @param {object} options.previewRepository
 *
 * @returns {Readonly<object>}
 */
export function createContentApi({ publishedRepository, previewRepository }) {
  function getRepository() {
    return isPreview() ? previewRepository : publishedRepository;
  }

  return Object.freeze({
    /**
     * Get a page by slug.
     *
     * @param {string} slug
     */
    page: (slug) => getRepository().getPage(slug),

    /**
     * Get all pages.
     */
    pages: () => getRepository().getPages(),

    /**
     * Get all page slugs.
     */
    slugs: () => getRepository().getSlugs(),

    /**
     * Check if a page exists.
     *
     * @param {string} slug
     */
    hasPage: (slug) => getRepository().hasPage(slug),
  });
}
