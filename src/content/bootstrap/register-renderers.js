import { createBlockRendererRegistry } from '../renderers/create-block-renderer-registry.js';
import { createHeroBlockRenderer } from '../renderers/hero-block-renderer.js';

/**
 * Creates and freezes the renderer registry.
 *
 * Every block type renderer must be registered here.
 * Mirrors register-block-types.js — the container enforces
 * that every registered BlockType has a corresponding renderer.
 */
export function registerRenderers() {
  return createBlockRendererRegistry().register(createHeroBlockRenderer()).freeze();
}
