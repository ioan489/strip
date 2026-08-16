import { HeroSection } from '../../components/HeroSection/HeroSection.js';
import { createBlockRenderer } from './block-renderer.js';

/**
 * Creates the renderer for Hero blocks.
 *
 * It reads block.content (which has been normalised and validated by the
 * HeroBlockType) and maps it to the HeroSection component.
 *
 * @returns {BlockRenderer}
 */
export function createHeroBlockRenderer() {
  return createBlockRenderer({
    type: 'hero',

    /**
     * @param {import('../models/block.js').Block} block
     * @returns {string} HTML string (via html tagged template)
     */
    render(block) {
      const { headline, subheadline, ctaHref, ctaLabel } = block.content;

      // HeroSection returns a RawHtml object; convert to string for the renderer contract.
      return HeroSection({
        headline,
        subheadline,
        ctaHref,
        ctaLabel,
      });
    },
  });
}
