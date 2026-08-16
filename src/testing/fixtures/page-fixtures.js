import { rawHeroBlock } from './block-fixtures.js';

/**
 * Raw page module builders.
 *
 * These produce the pre-factory authoring format,
 * not compiled Page aggregates.
 */
export function rawPageModule(overrides = {}) {
  return {
    slug: 'test-page',
    status: 'published',
    meta: {
      title: 'Test Page Title',
      description: 'Test description',
    },
    blocks: [rawHeroBlock()],
    ...overrides,
  };
}

export function draftPageModule(overrides = {}) {
  return rawPageModule({ status: 'draft', slug: 'draft-page', ...overrides });
}
