import { deepFreeze } from '../../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';
import { isBlockType } from '../block-types/index.js';

/**
 * Creates the application's BlockType registry.
 *
 * Registration only happens during bootstrap. After `freeze()`, the registry
 * becomes immutable for the lifetime of the process.
 *
 * The registry enforces that only trusted BlockType objects are registered.
 */
export function createBlockTypeRegistry() {
  /** @type {Map<string, import('../models/block-type.js').BlockType>} */
  const blockTypes = new Map();
  let frozen = false;

  function assertMutable() {
    if (frozen) {
      throw new ContentError(
        ContentErrorCode.CONTENT_FROZEN,
        'The BlockType registry has already been frozen.',
      );
    }
  }

  return Object.freeze({
    /**
     * Register a BlockType.
     *
     * @param {BlockType} blockType - must be created by `createBlockType()`
     * @returns {this}
     */
    register(blockType) {
      assertMutable();

      if (!isBlockType(blockType)) {
        throw new ContentError(
          ContentErrorCode.INVALID_BLOCK_TYPE,
          'Only trusted BlockType objects can be registered.',
        );
      }

      if (blockTypes.has(blockType.name)) {
        throw new ContentError(
          ContentErrorCode.CONTENT_ALREADY_EXISTS,
          `BlockType "${blockType.name}" is already registered.`,
        );
      }

      blockTypes.set(blockType.name, blockType);
      return this;
    },

    /**
     * Returns a registered BlockType.
     *
     * @param {string} name
     * @returns {BlockType}
     */
    get(name) {
      const blockType = blockTypes.get(name);
      if (!blockType) {
        throw new ContentError(ContentErrorCode.CONTENT_NOT_FOUND, `Unknown BlockType "${name}".`);
      }
      return blockType;
    },

    /**
     * Whether a BlockType exists.
     * @param {string} name
     * @returns {boolean}
     */
    has(name) {
      return blockTypes.has(name);
    },

    /**
     * Immutable snapshot of all block types.
     * @returns {readonly BlockType[]}
     */
    values() {
      return deepFreeze([...blockTypes.values()]);
    },

    /**
     * Immutable snapshot of [name, BlockType] tuples.
     * Each tuple is frozen.
     * @returns {readonly (readonly [string, BlockType])[]}
     */
    entries() {
      return deepFreeze([...blockTypes.entries()]);
    },

    /**
     * Prevent any further registration.
     */
    freeze() {
      frozen = true;
      return this;
    },

    /**
     * Bootstrap state.
     */
    isFrozen() {
      return frozen;
    },

    /**
     * Number of registered BlockTypes.
     */
    size() {
      return blockTypes.size;
    },
  });
}
