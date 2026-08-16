import { deepFreeze } from '../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../../domain/content/index.js';
import { isBlockRenderer } from './block-renderer.js';

/**
 * Creates a registry of block renderers.
 *
 * A renderer is responsible only for turning a runtime block into HTML.
 * It must not validate content and must not know about repositories.
 */
export function createBlockRendererRegistry() {
  const renderers = new Map();
  let frozen = false;

  function assertMutable() {
    if (frozen) {
      throw new ContentError(
        ContentErrorCode.CONTENT_FROZEN,
        'The BlockRenderer registry has already been frozen.',
      );
    }
  }

  return Object.freeze({
    register(renderer) {
      assertMutable();

      if (!isBlockRenderer(renderer)) {
        throw new ContentError(
          ContentErrorCode.INVALID_ARGUMENT,
          'Only trusted BlockRenderer objects can be registered.',
        );
      }

      if (renderers.has(renderer.type)) {
        throw new ContentError(
          ContentErrorCode.CONTENT_ALREADY_EXISTS,
          `BlockRenderer "${renderer.type}" is already registered.`,
        );
      }

      renderers.set(renderer.type, renderer);
      return this;
    },

    get(type) {
      const renderer = renderers.get(type);
      if (!renderer) {
        throw new ContentError(
          ContentErrorCode.CONTENT_NOT_FOUND,
          `No renderer registered for block type "${type}".`,
        );
      }
      return renderer;
    },

    has(type) {
      return renderers.has(type);
    },

    freeze() {
      frozen = true;
      return this;
    },

    isFrozen() {
      return frozen;
    },

    values() {
      return Object.freeze([...renderers.values()]);
    },
  });
}
