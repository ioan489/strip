/**
 * head-builder.js
 *
 * Converts a flat list of Asset objects (collected during a page render)
 * into the HTML that goes inside <head>.
 *
 * ── CSS strategy ─────────────────────────────────────────────────────────────
 *
 *  asset.content is set  →  <style>{content}</style>
 *    The CSS string came from a Vite `?inline` import in the component file.
 *    Vite ran the file through its full pipeline (PostCSS, nesting resolution,
 *    autoprefixing, minification) before returning it as a string. We inject
 *    it directly — zero network request, instant first paint.
 *    Works identically in development and production because Vite processes
 *    `?inline` imports in both dev (ssrLoadModule) and SSR builds.
 *
 *  asset.content not set, asset.critical = true  →  <link rel="stylesheet">
 *    External render-blocking stylesheet. Use for global CSS, font-face rules,
 *    or any CSS that cannot be bundled via `?inline` (e.g. very large files
 *    you want the browser to cache separately). In development this also lets
 *    Vite's CSS HMR work — Vite replaces <link> href values on file change.
 *
 *  asset.critical = false  →  <link media="print" data-js-lazy-style>
 *    The media="print" lazy-load trick: browser downloads the file without
 *    blocking render, then a MutationObserver swaps media → "all" on load.
 *    <noscript> fallback for JS-disabled browsers.
 *    Use for below-the-fold component styles that aren't needed for FCP.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./render-context.js').Asset} Asset
 */

// ---------------------------------------------------------------------------
// Lazy-CSS inline script
// ---------------------------------------------------------------------------

/**
 * External lazy-CSS loader reference.
 *
 * Previously this was an inline <script> containing the MutationObserver logic.
 * Inline scripts require `unsafe-inline` in Content-Security-Policy, which
 * defeats script CSP entirely. Moving the logic to public/lazy-css.js means
 * it is served as /lazy-css.js — a same-origin external script covered by
 * `script-src 'self'` with no exemptions needed.
 *
 * Emitted once per page only when at least one deferred stylesheet is present.
 * The `defer` attribute ensures it runs after HTML parsing without blocking
 * render — identical timing to the previous inline approach.
 */
const LAZY_CSS_SCRIPT = `<script src="/lazy-css.js" defer></script>`;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Preconnect + dns-prefetch hints for any external origins in the asset list.
 * Only emitted for absolute URLs — relative (same-origin) assets don't need them.
 *
 * @param {Asset[]} assets
 * @returns {string}
 */
function buildPreconnects(assets) {
  const origins = new Set();
  for (const asset of assets) {
    try {
      origins.add(new URL(asset.src).origin);
    } catch {
      // relative URL — same origin, no hint needed
    }
  }
  return [...origins]
    .map(
      (o) =>
        `<link rel="preconnect" href="${o}" crossorigin>\n<link rel="dns-prefetch" href="${o}">`,
    )
    .join('\n');
}

/**
 * Build HTML for all CSS assets.
 *
 * Three-pass sort to match Stripe's <head> output order:
 *
 *  Pass 1 — inline <style> tags (asset.content present)
 *    All components using ?inline imports go here, in asset registration order.
 *    Grouped first so the browser has ALL critical styles before it encounters
 *    any network request. A single render-blocking inline block is cheaper than
 *    multiple render-blocking <link> tags because there are no round-trips.
 *
 *  Pass 2 — critical external <link rel="stylesheet">
 *    For global stylesheets served from a CDN or large files deliberately kept
 *    external for long-term browser caching. Render-blocking but cacheable.
 *    Empty in most pages if all CSS uses ?inline.
 *
 *  Pass 3 — deferred <link media="print"> (not critical)
 *    Non-blocking download; MutationObserver swaps to media="all" on load.
 *    <noscript> fallback included.
 *
 * Within each pass, assets appear in registration order (which is controlled
 * by the evaluation order in _layout.js):
 *   base.css → typography.css → SiteHeader → page components → SiteFooter
 *
 * @param {Asset[]} cssAssets
 * @returns {{ html: string; hasDeferred: boolean }}
 */
function buildCssHtml(cssAssets) {
  let hasDeferred = false;
  const parts = [];

  // ── Pass 1: inline <style> ────────────────────────────────────────────────
  for (const asset of cssAssets) {
    if (asset.content) {
      parts.push(`<style>${asset.content}</style>`);
    }
  }

  // ── Pass 2: critical external <link> ─────────────────────────────────────
  for (const asset of cssAssets) {
    if (!asset.content && asset.critical) {
      parts.push(`<link rel="stylesheet" href="${asset.src}">`);
    }
  }

  // ── Pass 3: deferred <link media="print"> ────────────────────────────────
  for (const asset of cssAssets) {
    if (!asset.content && !asset.critical) {
      hasDeferred = true;
      parts.push(
        `<link rel="stylesheet" href="${asset.src}" media="print" data-js-lazy-style>`,
        `<noscript><link rel="stylesheet" href="${asset.src}"></noscript>`,
      );
    }
  }

  return { html: parts.join('\n'), hasDeferred };
}

/**
 * Build the <script type="application/json" data-js-script-registry> tag.
 * The bootstrapper reads this and imports the listed controller modules.
 *
 * @param {Asset[]} jsAssets
 * @returns {string}
 */
function buildScriptRegistry(jsAssets) {
  if (jsAssets.length === 0) return '';
  const entries = jsAssets.map((a) => ({ path: a.src, critical: a.critical }));
  return `<script type="application/json" data-js-script-registry>${JSON.stringify(entries)}</script>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build all <head> content from the assets collected during a page render.
 *
 * Synchronous — asset.content strings are already in memory from ?inline imports,
 * so no I/O is needed at render time.
 *
 * @param {Asset[]} assets  - Collected via AsyncLocalStorage during SSR/SSG
 * @returns {string}          HTML fragment ready for <!--app-head-->
 */
export function buildHead(assets) {
  if (assets.length === 0) return '';

  const cssAssets = assets.filter((a) => a.type === 'css');
  const jsAssets = assets.filter((a) => a.type === 'js');

  const preconnects = buildPreconnects(assets);
  const { html: cssHtml, hasDeferred } = buildCssHtml(cssAssets);
  const scriptRegistry = buildScriptRegistry(jsAssets);

  return [
    preconnects,
    cssHtml,
    // Only emit the lazy-swap script when there is at least one deferred sheet.
    // Pages where every asset is inlined don't need the MutationObserver at all.
    hasDeferred ? LAZY_CSS_SCRIPT : '',
    scriptRegistry,
  ]
    .filter(Boolean)
    .join('\n');
}
