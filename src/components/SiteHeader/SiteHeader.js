/**
 * SiteHeader/SiteHeader.js
 *
 * The global site header component.
 *
 * Pattern demonstrated here:
 *  - defineComponent declares CSS and JS assets statically
 *  - The html tag produces safe, escaped markup
 *  - data-js-controller="SiteHeader" tells the bootstrapper to attach
 *    the SiteHeader controller class after page load
 *  - No client-side rendering — the full nav HTML is server-rendered;
 *    the controller only adds interactivity (dropdowns, mobile menu, etc.)
 *
 * To add a real nav, expand the `nav` prop and render the links with html`.
 */

import styles from './SiteHeader.css?inline';
import { defineComponent } from '../../lib/component.js';
import { html } from '../../lib/html.js';

// ---------------------------------------------------------------------------
// Sub-components (inline here for brevity; extract to own files as they grow)
// ---------------------------------------------------------------------------

function NavLink({ label, href, current = false }) {
  return html`
    <li class="SiteHeader-navItem">
      <a
        class="SiteHeader-navLink${current ? ' is-current' : ''}"
        href="${href}"
        ${current ? 'aria-current="page"' : ''}
        >${label}</a
      >
    </li>
  `;
}

// ---------------------------------------------------------------------------
// SiteHeader
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} NavItem
 * @property {string}  label
 * @property {string}  href
 * @property {boolean} [current]
 */

/**
 * @typedef {Object} SiteHeaderProps
 * @property {NavItem[]} [nav]
 * @property {string}    [ctaLabel]
 * @property {string}    [ctaHref]
 */

export const SiteHeader = defineComponent(
  /**
   * @param {SiteHeaderProps} props
   */
  function SiteHeader({ navigationItems = [], ctaLabel = 'Sign in', ctaHref = '/login' } = {}) {
    return html`
      <header class="SiteHeader" data-js-controller="SiteHeader">
        <div class="SiteHeader-inner">
          <a class="SiteHeader-logo" href="/" aria-label="Home">
            <!-- Logo SVG or wordmark goes here -->
            <span class="SiteHeader-logoText">Stripe Clone</span>
          </a>

          <nav class="SiteHeader-nav" aria-label="Main navigation">
            <ul class="SiteHeader-navList" role="list">
              ${navigationItems.map((item) => NavLink(item))}
            </ul>
          </nav>

          <!-- Mobile menu toggle — controller manages open/close state -->
          <button
            class="SiteHeader-mobileToggle"
            aria-expanded="false"
            aria-controls="mobile-menu"
            aria-label="Open navigation"
            data-js-ref="SiteHeader.mobileToggle">
            <span class="SiteHeader-menuIcon" aria-hidden="true"></span>
          </button>

          <a class="SiteHeader-cta btn btn--primary" href="${ctaHref}"> ${ctaLabel} </a>
        </div>
      </header>
    `;
  },
  {
    css: [
      // Critical: header is above the fold on every page
      { src: '/src/components/SiteHeader/SiteHeader.css', critical: true, content: styles },
    ],
    js: [
      // Critical: header interactions (dropdowns, mobile) should work immediately
      { src: '/src/controllers/SiteHeader.js', critical: true },
    ],
  },
);
