/**
 * entry-server.js
 *
 * The SSR render function called by server.js for every page request.
 *
 * Responsibilities:
 *  - Assemble the final <head> content from collected assets + page meta
 *  - Return { html, head } fragments that server.js injects into index.html
 *
 * This function is intentionally thin — it is a hand-off point between
 * the server infrastructure (server.js) and the page rendering system.
 * The actual HTML is produced by page modules and layout components.
 *
 * Context shape (provided by server.js → handlePageRoute):
 *   pageHtml  {string}   The rendered page HTML (from layout + components)
 *   assets    {Asset[]}  Collected by render-context during the page render
 *   head      {string}   Optional additional head HTML from the page module's meta
 */

import { buildHead } from './lib/head-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./lib/render-context.js').Asset} Asset
 */

/**
 * @typedef {Object} RenderContext
 * @property {string}   [pageHtml]    - Body HTML from the page render
 * @property {Asset[]}  [assets]      - Assets collected during render
 * @property {string}   [head]        - Additional head HTML from page meta
 * @property {Record<string, unknown>} [serverData] - Server-fetched data (for hydration)
 */

/**
 * @typedef {Object} RenderResult
 * @property {string} html - Fragment for <!--app-html-->
 * @property {string} head - Fragment for <!--app-head-->
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIEWPORT_META = `<meta name="viewport" content="width=device-width, initial-scale=1.0">`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble the final head and body fragments for a page.
 *
 * @param {string}        _url     - The request URL (available for plugins/logging)
 * @param {RenderContext} context
 * @returns {Promise<RenderResult>}
 */
export function render(_url, context = {}) {
  const { pageHtml = null, assets = [], head: pageHead = '' } = context;

  // ── 404 / no-match fallback ─────────────────────────────────────────────────
  //
  // When no route matched, server.js calls renderSpaShell which calls render()
  // without a pageHtml. We return a minimal shell so client-side routing
  // (if present) can handle the path.
  if (!pageHtml) {
    return {
      html: '',
      head: [VIEWPORT_META, `<title>Not Found</title>`].join('\n'),
    };
  }

  // ── Assemble <head> ─────────────────────────────────────────────────────────
  //
  // Order matters for performance:
  //  1. Viewport (must be early)
  //  2. Asset head (preconnects, critical CSS, deferred CSS, script registry)
  //  3. Page-level meta (title, description, og tags, etc.)
  const assetHead = buildHead(assets);

  const head = [VIEWPORT_META, pageHead, assetHead].filter(Boolean).join('\n');

  return {
    html: pageHtml,
    head,
  };
}
