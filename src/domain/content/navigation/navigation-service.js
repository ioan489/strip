import { createNavigationItem } from './navigation-item.js';
import { createNavigation } from './navigation.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';

/**
 * Creates a navigation service backed by a static manifest.
 *
 * Navigation is built once at construction time — no I/O, no repository
 * query, no per-request cost. This separates navigation structure (a
 * site-level concern) from page content (a per-page concern).
 *
 * getMainNav() is kept synchronous. Callers may still await it safely;
 * the async signature is reserved for future CMS-backed implementations.
 *
 * @param {readonly { label: string; href: string; order?: number }[]} manifest
 * @returns {{ getMainNav(): import('./navigation.js').Navigation }}
 */
export function createNavigationService(manifest) {
  if (!Array.isArray(manifest)) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'NavigationService requires a manifest array.',
    );
  }

  const items = manifest.map((entry, index) => {
    if (
      !entry ||
      typeof entry.label !== 'string' ||
      entry.label.trim() === '' ||
      typeof entry.href !== 'string' ||
      entry.href.trim() === ''
    ) {
      throw new ContentError(
        ContentErrorCode.INVALID_ARGUMENT,
        `Navigation manifest entry at index ${index} must have non-empty label and href strings.`,
      );
    }

    return createNavigationItem({
      label: entry.label.trim(),
      href: entry.href.trim(),
      order: entry.order ?? index,
      external: entry.external ?? false,
    });
  });

  // Built once. Navigation is static for the lifetime of the process.
  const mainNav = createNavigation(items);

  return Object.freeze({
    /**
     * Returns the pre-built main navigation.
     *
     * @returns {import('./navigation.js').Navigation}
     */
    getMainNav() {
      return mainNav;
    },
  });
}
