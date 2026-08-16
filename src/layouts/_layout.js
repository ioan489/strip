/**
 * _layout.js
 *
 * The base site shell. Wraps every page's content with the shared
 * SiteHeader and SiteFooter, and contributes their CSS/JS assets
 * to the render context automatically (via defineComponent).
 *
 * Pages import and call Layout() — they never write <html>, <head>, or <body>
 * directly. Those are owned by index.html and entry-server.js.
 *
 * Usage in a page module:
 *
 *   import { Layout }       from '../layouts/_layout.js';
 *   import { HeroSection }  from '../components/HeroSection/HeroSection.js';
 *   import { html }         from '../lib/html.js';
 *
 *   export const meta = { title: 'Home — Stripe Clone' };
 *
 *   export default async function HomePage({ params, serverData }) {
 *     return Layout({
 *       meta,
 *       children: html`
 *         ${HeroSection({ headline: serverData.headline })}
 *       `,
 *     });
 *   }
 *
 * Extending the layout:
 *   Create additional layout files (e.g. _docs-layout.js, _dashboard-layout.js)
 *   that import this one or compose their own shell. Pages opt in explicitly.
 */

import baseCss from '../styles/base.css?inline';
import typographyCss from '../styles/typography.css?inline';

import { html, raw } from '../lib/html.js';
import { SiteHeader } from '../components/SiteHeader/SiteHeader.js';
import { SiteFooter } from '../components/SiteFooter/SiteFooter.js';
import { PreviewBanner } from '../components/PreviewBanner/PreviewBanner.js';
import { addAssets } from '../lib/render-context.js';
import { isPreview } from '../lib/preview-context.js';
import { navigation } from '../content/runtime.js';

// ---------------------------------------------------------------------------
// Layout-level assets
// ---------------------------------------------------------------------------
//
// CSS that applies to the entire site (reset, typography, custom properties)
// is declared here rather than in a specific component. Mark as critical so
// it is linked normally and blocks rendering — this CSS is always needed.

const LAYOUT_ASSETS = [
  { type: 'css', src: '/src/styles/base.css', critical: true, content: baseCss },
  { type: 'css', src: '/src/styles/typography.css', critical: true, content: typographyCss },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} LayoutProps
 * @property {(() => import('../lib/html.js').RawHtml) | import('../lib/html.js').RawHtml} children
 *   Pass as a function `() => html\`...\`` so that component execution (and
 *   therefore asset registration) is deferred until the layout controls it.
 * @property {{ title?: string; description?: string; head?: string }} [meta]
 */

/**
 * @typedef {Object} LayoutResult
 * @property {string} html
 * @property {string} head
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Wrap page content in the site shell.
 *
 * Asset registration for SiteHeader and SiteFooter happens automatically
 * when those components are called below (via defineComponent).
 * Layout-level assets (base CSS, typography) are registered here.
 *
 * @param {LayoutProps} props
 * @returns {LayoutResult}
 */
export function Layout({ children, meta = {} }) {
  // ── Step 1: global CSS (base, typography) ─────────────────────────────────
  // Must be first so they appear before all component styles in <head>.
  addAssets(LAYOUT_ASSETS);

  const nav = navigation.getMainNav();

  // ── Step 2: layout components ─────────────────────────────────────────────
  // Call SiteHeader and SiteFooter here — not inside the html template —
  // so their CSS registers before page-content components do.
  const headerHtml = SiteHeader({ navigationItems: nav.items });
  const footerHtml = SiteFooter();

  // ── Step 3: page children (lazy) ──────────────────────────────────────────
  // If children is a function, call it now. This is when HeroSection,
  // FeatureGrid, etc. execute and register their CSS — after the layout
  // components have already registered theirs.
  const childrenHtml = typeof children === 'function' ? children() : children;

  // ── Step 4: assemble body HTML ─────────────────────────────────────────────
  // Show the preview banner when the current request is in preview mode.
  // isPreview() reads from the same AsyncLocalStorage that runWithPreview()
  // set up in server.js — they share state via globalThis[Symbol.for(...)].
  const previewBannerHtml = isPreview() ? PreviewBanner() : '';

  const bodyHtml = String(html`
    ${raw(previewBannerHtml)} ${raw(headerHtml)}
    <main id="main-content" tabindex="-1">${raw(childrenHtml)}</main>
    ${raw(footerHtml)}
  `);

  return {
    html: bodyHtml,
    head: buildMetaHead(meta),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @param {{ title?: string; description?: string; head?: string }} meta
 * @returns {string}
 */
function buildMetaHead(meta) {
  return [
    meta.title ? `<title>${escapeAttr(meta.title)}</title>` : '',
    meta.description ? `<meta name="description" content="${escapeAttr(meta.description)}">` : '',
    meta.title ? `<meta property="og:title" content="${escapeAttr(meta.title)}">` : '',
    meta.description
      ? `<meta property="og:description" content="${escapeAttr(meta.description)}">`
      : '',
    meta.head ?? '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** @param {string} str */
function escapeAttr(str) {
  return String(str).replace(
    /[&"<>]/g,
    (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c],
  );
}
