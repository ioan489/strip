/**
 * render-page.js
 *
 * The single, shared function that renders a route match into a complete
 * HTML document string.
 *
 * Used by:
 *   server.js      — called on every SSR request (with a real Express req)
 *   build-ssg.js   — called at build time for each pre-rendered page
 *                    (with a synthetic req-like object)
 *
 * Because this function is called from both contexts, it must never import
 * anything from server.js (which starts an HTTP server on import) and must
 * never depend on a live HTTP request object — it only needs { url, headers }.
 */

import { runWithContext } from './render-context.js';
import { buildHydrationScript } from './hydration.js';
import { HTTP_METHODS } from './constants.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {import('../core/router/router.js').RouteMatch} RouteMatch
 * @typedef {import('./render-context-factory.js').RenderContext} RenderContext
 */

/**
 * A minimal request-like object. The real Express req is a superset of this.
 * The SSG script creates a synthetic one so getServerData can read url/headers.
 *
 * @typedef {Object} RequestLike
 * @property {string} url
 * @property {Record<string, string>} [headers]
 * @property {string} [method]
 */

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Determine whether a page module is actually an API endpoint.
 *
 * An API module exports HTTP-method handlers (get, post, …) but no renderable
 * Page component. Passing one to renderPage is a programming error — the
 * caller should route these to handleApiRoute in server.js instead, or simply
 * skip them in the SSG script.
 *
 * @param {Record<string, unknown>} mod
 * @returns {boolean}
 */
function isApiModule(mod) {
  if (mod.default || mod.Page) return false;
  return HTTP_METHODS.some((m) => typeof mod[m] === 'function');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a matched route into a complete HTML document.
 *
 * @param {string}      url        - Pathname (and optional query) used for template transform
 * @param {RouteMatch}  match      - Result of router.match()
 * @param {RenderContext} renderCtx - Template + render function pair
 * @param {RequestLike} [req]      - Minimal request object for getServerData; defaults to { url }
 * @returns {Promise<string>}        Complete HTML document string
 *
 * @throws {Error} If the route module is an API module (not renderable)
 * @throws {Error} If the route module has no default or Page export
 */
export async function renderPage(url, match, renderCtx, req) {
  const { route, params } = match;

  // ── Load the page module ────────────────────────────────────────────────────
  const pageModule = await route.loader();

  if (isApiModule(pageModule)) {
    throw new Error(
      `renderPage: "${route.route}" is an API route (exports HTTP method handlers). ` +
        `API routes cannot be rendered as HTML pages.`,
    );
  }

  // ── Synthetic request object ────────────────────────────────────────────────
  //
  // SSG passes null/undefined for req; we create a minimal stand-in.
  // Server passes the real Express req object which is a superset of this.
  const request = req ?? { url, method: 'GET', headers: {} };

  // ── Server-side data fetching ───────────────────────────────────────────────
  //
  // getServerData is optional — pages without dynamic data simply omit it.
  const serverData = pageModule.getServerData
    ? await pageModule.getServerData({ req: request, params }).catch((err) => {
        // Attach route context without replacing the original error.
        // Callers depend on err.code being intact:
        //   - resolveHttpStatus maps ContentError(page_not_found) → 404
        //   - isDraftSkip in build-ssg.js identifies draft pages by code
        if (!err.route) err.route = route.route;
        throw err;
      })
    : {};

  // ── Template + render function (parallel) ────────────────────────────────────
  const [template, render] = await Promise.all([renderCtx.getTemplate(url), renderCtx.getRender()]);

  // ── Render the Page component inside the asset-collection context ────────────
  //
  // runWithContext wraps the call in an AsyncLocalStorage store so that every
  // defineComponent() wrapper can call addAssets() during render, collecting
  // CSS/JS assets without threading a context object through the tree.
  const { result: pageResult, assets } = await runWithContext(async () => {
    const Page = pageModule.default ?? pageModule.Page;

    if (typeof Page === 'undefined') {
      throw Object.assign(
        new Error(
          `renderPage: "${route.route}" has no default or Page export. ` +
            `Every page module must export a default function or a named "Page" function.`,
        ),
        { status: 500 },
      );
    }

    return Page({ params, serverData }, request);
  });

  // pageResult is { html, head } from Layout(), or a bare string/RawHtml
  const pageHtml = pageResult?.html ?? String(pageResult ?? '');
  const pageMeta = pageResult?.head ?? '';

  // ── SSR assembly: combine pageHtml + assets → full head + body ────────────
  const rendered = render(url, { pageHtml, assets, head: pageMeta });

  // ── Inject server data for client-side hydration ─────────────────────────
  const hydrationScript = buildHydrationScript(serverData);

  // ── Final document ─────────────────────────────────────────────────────────
  return template
    .replace('<!--app-head-->', (rendered.head ?? '') + hydrationScript)
    .replace('<!--app-html-->', rendered.html ?? '');
}

// ---------------------------------------------------------------------------
// Introspection helpers (used by build-ssg.js)
// ---------------------------------------------------------------------------

/**
 * Check whether a page module exports getStaticPaths.
 * Used by the SSG script to decide whether a dynamic route can be pre-rendered.
 *
 * @param {Record<string, unknown>} mod
 * @returns {mod is { getStaticPaths: () => Promise<{ params: Record<string,string> }[]> }}
 */
export function hasStaticPaths(mod) {
  return typeof mod.getStaticPaths === 'function';
}

/**
 * Call getStaticPaths on a page module and return the list of param sets.
 *
 * @param {Record<string, unknown>} mod
 * @param {string} routePath   - For error context
 * @returns {Promise<{ params: Record<string, string> }[]>}
 */
export async function resolveStaticPaths(mod, routePath) {
  if (!hasStaticPaths(mod)) {
    throw new Error(`resolveStaticPaths: "${routePath}" does not export getStaticPaths`);
  }
  const result = await mod.getStaticPaths();
  if (!Array.isArray(result)) {
    throw new Error(`getStaticPaths in "${routePath}" must return an array of { params } objects`);
  }
  return result;
}
