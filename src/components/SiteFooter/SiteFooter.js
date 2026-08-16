/**
 * SiteFooter/SiteFooter.js
 */

import styles from './SiteFooter.css?inline';
import { defineComponent } from '../../lib/component.js';
import { html } from '../../lib/html.js';

export const SiteFooter = defineComponent(
  function SiteFooter() {
    return html`
      <footer class="SiteFooter" data-js-controller="SiteFooter">
        <div class="SiteFooter-inner">
          <p class="SiteFooter-copy">
            &copy; ${new Date().getFullYear()} Stripe Clone. All rights reserved.
          </p>
        </div>
      </footer>
    `;
  },
  {
    // SiteFooter is below the fold — deferred, not critical.
    // Since it still has a ?inline import the content is available,
    // and head-builder will inline it regardless of the critical flag.
    // If you want it truly deferred (lazy link), remove the content field
    // and keep a non-inline import for a separate CSS file instead.
    css: [
      {
        src: '/src/components/SiteFooter/SiteFooter.css',
        critical: false,
        content: styles,
      },
    ],
    js: [],
  },
);
