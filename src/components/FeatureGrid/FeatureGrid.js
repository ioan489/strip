/**
 * FeatureGrid/FeatureGrid.js
 */

import styles from './FeatureGrid.css?inline';
import { defineComponent } from '../../lib/component.js';
import { html } from '../../lib/html.js';

function FeatureCard({ icon, title, description }) {
  return html`
    <li class="FeatureCard">
      <div class="FeatureCard-icon" aria-hidden="true" data-icon="${icon}"></div>
      <h3 class="FeatureCard-title">${title}</h3>
      <p class="FeatureCard-description">${description}</p>
    </li>
  `;
}

export const FeatureGrid = defineComponent(
  function FeatureGrid({ features = [] }) {
    return html`
      <section class="FeatureGrid">
        <div class="FeatureGrid-inner">
          <ul class="FeatureGrid-list" role="list">
            ${features.map((f) => FeatureCard(f))}
          </ul>
        </div>
      </section>
    `;
  },
  {
    // FeatureGrid is below the fold — typically deferred.
    // content is still set so head-builder can inline it if desired.
    css: [
      {
        src: '/src/components/FeatureGrid/FeatureGrid.css',
        critical: false,
        content: styles,
      },
    ],
    js: [],
  },
);
