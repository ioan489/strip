/**
 * HeroSection/HeroSection.js
 */

import styles from './HeroSection.css?inline';
import { defineComponent } from '../../lib/component.js';
import { html } from '../../lib/html.js';

export const HeroSection = defineComponent(
  function HeroSection({ headline, subheadline, ctaHref = '/start', ctaLabel }) {
    return html`
      <section class="HeroSection" data-js-controller="HeroSection">
        <div class="HeroSection-inner">
          <h1 class="HeroSection-headline">${headline}</h1>
          <p class="HeroSection-subline">${subheadline}</p>
          <a class="HeroSection-cta btn btn--primary btn--large" href="${ctaHref}">
            ${ctaLabel} <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>
    `;
  },
  {
    css: [{ src: '/src/components/HeroSection/HeroSection.css', critical: true, content: styles }],
    js: [{ src: '/src/controllers/HeroSection.js', critical: true }],
  },
);
