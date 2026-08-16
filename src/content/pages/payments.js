/**
 * Payments page content.
 *
 * This module contains content only.
 *
 * It intentionally knows nothing about:
 *
 *  - SSR
 *  - Layout
 *  - Components
 *  - HTML
 *  - Vite
 *  - Rendering
 *
 * Think of this as if it were coming from a CMS.
 */
import { hero } from '../builders/index.js';

export default Object.freeze({
  slug: 'payments',

  status: 'published',

  meta: Object.freeze({
    title: 'Payments infrastructure for the internet',
    description:
      'Millions of companies use Stripe to accept payments, grow revenue, and accelerate business opportunities.',
  }),

  blocks: Object.freeze([
    hero({
      headline: 'Financial infrastructure for the internet',
      subheadline:
        'Millions of companies—from startups to Fortune 500s—use Stripe to accept payments, grow revenue, and accelerate new business opportunities.',
      ctaHref: '/register',
      ctaLabel: 'Start now',
    }),
  ]),
});
