import { BlockTypes } from '../../domain/content/constants/index.js';

/**
 * Creates a Hero block definition (authoring format).
 *
 * This is part of the content authoring API – it produces a raw definition
 * that the PageFactory later normalises, validates, and turns into a trusted Block.
 *
 * @param {Object} input
 * @param {string} input.headline
 * @param {string} input.subheadline
 * @param {string} input.ctaHref
 * @param {string} input.ctaLabel
 * @returns {Readonly<{type: string, headline: string, subheadline: string, ctaHref: string, ctaLabel: string}>}
 */
export function hero({ headline, subheadline, ctaHref, ctaLabel }) {
  return Object.freeze({
    type: BlockTypes.HERO,
    _version: 2,
    headline,
    subheadline,
    ctaHref,
    ctaLabel,
  });
}
