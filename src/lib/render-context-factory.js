/**
 * render-context-factory.js
 *
 * Creates a RenderContext — a pair of functions that return the HTML template
 * and the SSR render function for a given environment.
 *
 * Extracted from server.js so that both the Express server and the SSG build
 * script can import it. Importing server.js directly would execute its top-level
 * await (bootstrap → app.listen), which would start an HTTP server mid-build.
 *
 * Development:
 *   Template: read fresh from disk and transformed by Vite on every call
 *             (picks up edits to index.html without restart)
 *   Render:   loaded via vite.ssrLoadModule so HMR keeps it current
 *
 * Production / SSG:
 *   Template: read once from dist/client/index.html and closed over
 *             (immutable after Vite build — no reason to re-read)
 *   Render:   imported once from dist/server/entry-server.js and closed over
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the project root (two levels up from src/lib/) */
const ROOT = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {(url: string, ctx?: object) => Promise<{ html: string; head: string }>} RenderFn
 */

/**
 * @typedef {Object} RenderContext
 * @property {(url: string) => Promise<string>}  getTemplate  - Returns the HTML template string
 * @property {()           => Promise<RenderFn>} getRender    - Returns the SSR render function
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a RenderContext for the current environment.
 *
 * @param {import('vite').ViteDevServer | null} vite
 *   Pass the Vite dev server in development, null in production / SSG.
 * @returns {Promise<RenderContext>}
 */
export async function buildRenderContext(vite) {
  if (vite) {
    // ── Development ──────────────────────────────────────────────────────────
    //
    // Both template and render function are re-fetched on every call so that
    // HMR changes to index.html and entry-server.js are picked up immediately.
    return {
      getTemplate: async (url) => {
        const raw = await fs.readFile(path.join(ROOT, 'index.html'), 'utf-8');
        return vite.transformIndexHtml(url, raw);
      },
      getRender: async () => {
        const mod = await vite.ssrLoadModule('/src/entry-server.js');
        return mod.render;
      },
    };
  }

  // ── Production / SSG ───────────────────────────────────────────────────────
  //
  // Load both in parallel — they are independent. The results are cached via
  // closure for the lifetime of the process. For SSG, this means the template
  // is cached in memory before the build script starts overwriting HTML files,
  // so every page render uses the original Vite-built template regardless of
  // what the build script writes to dist/client/index.html.
  const distClient = path.join(ROOT, 'dist', 'client');
  const distServer = path.join(ROOT, 'dist', 'server');

  const [template, { render }] = await Promise.all([
    fs.readFile(path.join(distClient, 'index.html'), 'utf-8').catch((err) => {
      throw new Error(
        `dist/client/index.html not found — did you run "vite build" first?\n${err.message}`,
      );
    }),
    import(`file://${path.join(distServer, 'entry-server.js')}`).catch((err) => {
      throw new Error(
        `dist/server/entry-server.js not found — did you run "vite build --ssr src/entry-server.js" first?\n${err.message}`,
      );
    }),
  ]);

  return {
    getTemplate: async (_url) => template,
    getRender: async () => render,
  };
}
