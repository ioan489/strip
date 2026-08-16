/**
 * Raw block definition builders.
 *
 * These produce the pre-factory authoring format (with _version),
 * not compiled Block aggregates.
 *
 * Override any field to test a specific edge case:
 *   rawHeroBlock({ headline: '' })  → fails validation
 *   rawHeroBlock({ _version: 1 })   → triggers migration
 */
export function rawHeroBlock(overrides = {}) {
  return {
    type: 'hero',
    _version: 1,
    headline: 'Test Headline',
    subheadline: 'Test Subheadline',
    ctaHref: '/test',
    ctaLabel: 'Get started',
    ...overrides,
  };
}
