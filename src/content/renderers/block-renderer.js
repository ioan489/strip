import { deepFreeze } from '../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../../domain/content/index.js';

const BLOCK_RENDERER_BRAND = Symbol('BlockRenderer');

/**
 * Creates an immutable BlockRenderer.
 *
 * A renderer translates a trusted Block into an HTML string.
 * It must not validate, normalise, or load data.
 *
 * @param {object} input
 * @param {string} input.type   - block type name (must match a registered BlockType)
 * @param {(block: import('../models/block.js').Block) => string} input.render
 * @returns {Readonly<{ type: string, render(block: object): string }>}
 */
export function createBlockRenderer({ type, render }) {
  if (typeof type !== 'string' || type.trim() === '') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'BlockRenderer requires a non‑empty type string.',
    );
  }
  if (typeof render !== 'function') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'BlockRenderer requires a render function.',
    );
  }

  const renderer = {
    type: type.trim(),
    render,
  };

  Object.defineProperty(renderer, BLOCK_RENDERER_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return deepFreeze(renderer);
}

/**
 * Returns true only for trusted BlockRenderer instances.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBlockRenderer(value) {
  return typeof value === 'object' && value !== null && value[BLOCK_RENDERER_BRAND] === true;
}
