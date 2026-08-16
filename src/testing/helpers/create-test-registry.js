import { createBlockTypeRegistry } from '../../domain/content/registry/index.js';
import { createHeroBlockType } from '../../domain/content/block-types/hero/index.js';

/**
 * Creates a fully populated, frozen block type registry.
 * Used in unit tests that need a real registry without bootstrapping the container.
 */
export function createTestRegistry() {
  return createBlockTypeRegistry().register(createHeroBlockType()).freeze();
}
