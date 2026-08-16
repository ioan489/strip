import { createBlockTypeRegistry } from '../../domain/content/registry/index.js';
import { createHeroBlockType } from '../../domain/content/block-types/hero/index.js';

/**
 * Creates and freezes the block type registry.
 *
 * Every block type the authoring layer can use must be registered here.
 * Mirrors register-renderers.js — a coherence check in container.js
 * enforces that every registered type has a renderer.
 */
export function registerBlockTypes() {
  return createBlockTypeRegistry().register(createHeroBlockType()).freeze();
}
