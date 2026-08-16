import { deepFreeze } from '../../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';
import { ContentStatus } from '../constants/content-status.js';
import { isBlock } from './block.js';

const PAGE_BRAND = Symbol('ContentPage');

/**
 * Creates a trusted immutable Page aggregate.
 *
 * A Page is the top‑level content unit: it has a unique slug, meta information
 * (title, description, optional navigation), and an ordered list of trusted Blocks.
 *
 * @param {object} input
 * @param {string} input.slug     - URL‑safe identifier (e.g. "payments")
 * @param {object} input.meta     - SEO and display metadata
 * @param {string} input.meta.title           - page title
 * @param {string} [input.meta.description]   - optional meta description
 * @param {object[]} input.blocks - trusted Block objects
 * @param {string} [input.status] - one of ContentStatus values; defaults to PUBLISHED
 * @returns {Readonly<{slug: string, meta: Readonly<{title: string, description?: string}>, blocks: readonly object[], status: string}>}
 */
export function createPage(input) {
  validateInput(input);

  const pageMeta = deepFreeze({
    title: input.meta.title.trim(),
    ...(input.meta.description !== undefined ? { description: input.meta.description.trim() } : {}),
  });

  const page = {
    slug: input.slug.trim(),
    meta: pageMeta,
    blocks: Object.freeze([...input.blocks]),
    status: input.status ?? ContentStatus.PUBLISHED,
  };

  Object.defineProperty(page, PAGE_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return deepFreeze(page);
}

/**
 * Returns true only for trusted Pages.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPage(value) {
  return typeof value === 'object' && value !== null && value[PAGE_BRAND] === true;
}

function validateInput(input) {
  if (!isPlainObject(input)) {
    throw new ContentError(ContentErrorCode.INVALID_PAGE, 'Page must be an object.');
  }

  validateSlug(input.slug);
  validateMeta(input.meta);
  validateBlocks(input.blocks);
  validateStatus(input.status);
}

function validateSlug(slug) {
  if (typeof slug !== 'string' || slug.trim().length === 0) {
    throw new ContentError(ContentErrorCode.INVALID_PAGE, 'Page slug must be a non-empty string.');
  }
}

function validateMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    throw new ContentError(
      ContentErrorCode.INVALID_PAGE,
      'Page meta must be an object with at least a title.',
    );
  }

  if (typeof meta.title !== 'string' || meta.title.trim().length === 0) {
    throw new ContentError(
      ContentErrorCode.INVALID_PAGE,
      'Page meta.title must be a non‑empty string.',
    );
  }

  if (meta.description !== undefined && typeof meta.description !== 'string') {
    throw new ContentError(
      ContentErrorCode.INVALID_PAGE,
      'Page meta.description must be a string if provided.',
    );
  }
}

function validateBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    throw new ContentError(ContentErrorCode.INVALID_PAGE, 'Page blocks must be an array.');
  }

  for (const block of blocks) {
    if (!isBlock(block)) {
      throw new ContentError(ContentErrorCode.INVALID_PAGE, 'Page contains an untrusted Block.');
    }
  }
}

function validateStatus(status) {
  const resolvedStatus = status ?? ContentStatus.PUBLISHED;
  if (!Object.values(ContentStatus).includes(resolvedStatus)) {
    throw new ContentError(
      ContentErrorCode.INVALID_PAGE,
      `Invalid page status "${resolvedStatus}". Must be one of: ${Object.values(ContentStatus).join(', ')}`,
    );
  }
}

function isPlainObject(value) {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}
