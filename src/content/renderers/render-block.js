import { ContentError, ContentErrorCode } from '../../domain/content/index.js';

/**
 * Creates a renderBlock function bound to a specific renderer registry.
 *
 * @param {object} rendererRegistry
 * @returns {(block: Block) => string}
 */
export function createRenderBlock(rendererRegistry) {
  return function renderBlock(block) {
    if (!block) {
      throw new ContentError(
        ContentErrorCode.INVALID_ARGUMENT,
        'renderBlock called without a block.',
      );
    }
    return rendererRegistry.get(block.type).render(block);
  };
}
