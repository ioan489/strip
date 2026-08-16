// src/domain/content/navigation/nav-manifest.js
import { deepFreeze } from '../../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';

/**
 * Creates a validated, immutable navigation manifest.
 *
 * Validation happens at definition time — errors surface at module load,
 * not during service construction.
 *
 * @param {readonly {
 *   label: string;
 *   href: string;
 *   order?: number;
 *   external?: boolean;
 * }[]} entries
 */
export function createNavManifest(entries) {
  if (!Array.isArray(entries)) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'NavManifest requires an array of entries.',
    );
  }

  return deepFreeze(
    entries.map((entry, index) => {
      validateEntry(entry, index);
      return deepFreeze({
        label: entry.label.trim(),
        href: entry.href.trim(),
        order: entry.order ?? index,
        external: entry.external ?? false,
        // children?: NavManifestEntry[]  — add when dropdown is implemented
      });
    }),
  );
}

function validateEntry(entry, index) {
  if (!isPlainObject(entry)) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      `NavManifest entry at index ${index} must be a plain object.`,
    );
  }
  if (typeof entry.label !== 'string' || entry.label.trim() === '') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      `NavManifest entry[${index}].label must be a non-empty string.`,
    );
  }
  if (typeof entry.href !== 'string' || entry.href.trim() === '') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      `NavManifest entry[${index}].href must be a non-empty string.`,
    );
  }
  if (entry.external !== undefined && typeof entry.external !== 'boolean') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      `NavManifest entry[${index}].external must be a boolean if provided.`,
    );
  }
}

function isPlainObject(value) {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}
