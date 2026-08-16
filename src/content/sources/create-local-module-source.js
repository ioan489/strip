import { ContentError, ContentErrorCode } from '../../domain/content/errors/index.js';

/**
 * Creates a content source backed by locally imported JS modules.
 *
 * loadAllPages() is synchronous in intent — data is already in memory.
 * Returns a Promise for interface consistency with async sources.
 *
 * @param {Record<string, object>} modules - map of key → raw page module
 * @returns {{ loadAllPages(): Promise<object[]> }}
 */
export function createLocalModuleSource(modules) {
  if (!isPlainObject(modules)) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'LocalModuleSource requires a plain object of page modules.',
    );
  }

  // Snapshot at construction time — caller mutations don't affect the source.
  const frozen = Object.freeze({ ...modules });

  return Object.freeze({
    async loadAllPages() {
      return Object.values(frozen);
    },
  });
}

function isPlainObject(value) {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}
