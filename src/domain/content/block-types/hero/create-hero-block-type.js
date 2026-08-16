import { createBlockType } from '../block-type.js';

import { createValidationCollector, requiredString } from '../../validation/index.js';

/**
 * Creates the runtime definition for the Hero block type.
 *
 * The Hero BlockType owns the Hero content contract:
 *  • normalisation (trimming strings, applying defaults)
 *  • validation (enforcing required fields)
 *
 * It does NOT know about:
 *  • rendering (React, HTML, Vite)
 *  • where the content comes from (CMS, filesystem)
 *  • the PageFactory or repositories
 *
 * @returns {BlockType}
 */
export function createHeroBlockType() {
  return createBlockType({
    name: 'hero',
    version: 2,

    /**
     * v1 → v2: ctaLabel was added as a required field.
     *
     * Content authored before this change carries no ctaLabel.
     * The migration supplies the default so validation still passes.
     */
    migrations: {
      1: (content) => ({
        ...content,
        ctaLabel: content.ctaLabel ?? 'Get started',
      }),
    },

    normalize(definition) {
      return {
        headline:
          typeof definition.headline === 'string'
            ? definition.headline.trim()
            : definition.headline,
        subheadline:
          typeof definition.subheadline === 'string'
            ? definition.subheadline.trim()
            : definition.subheadline,
        ctaLabel:
          typeof definition.ctaLabel === 'string'
            ? definition.ctaLabel.trim()
            : definition.ctaLabel,
        ctaHref:
          typeof definition.ctaHref === 'string' ? definition.ctaHref.trim() : definition.ctaHref,
      };
    },

    validate(data) {
      const validation = createValidationCollector();

      validation.check(requiredString(data.headline, 'headline'));
      validation.check(requiredString(data.subheadline, 'subheadline'));
      validation.check(requiredString(data.ctaLabel, 'ctaLabel'));
      validation.check(requiredString(data.ctaHref, 'ctaHref'));

      return validation.result();
    },
  });
}
