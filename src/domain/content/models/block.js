import { deepFreeze } from '../../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';

/**
 * Private brand used to distinguish trusted Blocks from arbitrary objects.
 *
 * Not exported.
 * Not enumerable.
 * Not serialized.
 */
const BLOCK_BRAND = Symbol('ContentBlock');

/**
 * Creates a trusted immutable Content Block.
 *
 * Every block must have a unique identifier, a type (string), and
 * a content payload (plain object). Optional settings are also accepted.
 *
 * @param {object} input
 * @param {string} input.id        - unique block identifier (e.g. "block-0")
 * @param {string} input.type      - block type name (must be registered in BlockTypeRegistry)
 * @param {object} input.content   - block‑specific payload (e.g. { headline, subheadline } for Hero)
 * @param {object} [input.settings={}] - optional metadata (visibility, animation, etc.)
 * @returns {Readonly<{id: string, type: string, content: object, settings: object}>}
 */
export function createBlock(input) {
  validateBlock(input);

  const block = {
    id: input.id.trim(),
    type: input.type,
    content: input.content,
    settings: input.settings ?? {},
  };

  Object.defineProperty(block, BLOCK_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return deepFreeze(block);
}

/**
 * Determine whether a value is a trusted Block created by createBlock().
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBlock(value) {
  return typeof value === 'object' && value !== null && value[BLOCK_BRAND] === true;
}

/**
 * Validate raw block data.
 *
 * Throws ContentError when invalid.
 *
 * @param {unknown} input
 */
export function validateBlock(input) {
  if (!isPlainObject(input)) {
    throw new ContentError(ContentErrorCode.INVALID_BLOCK, 'Block must be an object.');
  }

  validateId(input.id);
  validateContent(input.content);
  validateSettings(input.settings);
}

function validateId(id) {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new ContentError(
      ContentErrorCode.INVALID_BLOCK_ID,
      'Block requires a non empty string id.',
    );
  }
}

function validateContent(content) {
  if (!isPlainObject(content)) {
    throw new ContentError(
      ContentErrorCode.INVALID_BLOCK_CONTENT,
      'Block content must be an object.',
    );
  }
}

function validateSettings(settings) {
  if (settings !== undefined && !isPlainObject(settings)) {
    throw new ContentError(
      ContentErrorCode.INVALID_BLOCK_SETTINGS,
      'Block settings must be a plain object if provided.',
    );
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}
