/**
 * plugins/ssr-hmr.js
 *
 * Vite plugin: SSR Hot Module Replacement
 *
 * Problem this solves:
 *
 *   Vite's built-in HMR is designed for the browser. When a file changes,
 *   Vite walks its CLIENT module graph looking for an HMR boundary
 *   (import.meta.hot.accept). If it finds one, it hot-updates that module
 *   in the browser. If it finds none, it sends `full-reload`.
 *
 *   Page modules and layout/component files loaded only on the SERVER are
 *   not part of the client module graph at all. When they change:
 *     - Vite correctly invalidates them in the SSR module graph ✓
 *     - Vite does NOT send any message to the browser             ✗
 *
 *   Result: the server would re-render with fresh content on the next
 *   request, but the browser never knows to make that request. The developer
 *   has to manually hit F5 to see their change — which is already fixed
 *   by removing the router's custom module cache. But without this plugin
 *   they still need to press F5 manually.
 *
 * What this plugin does:
 *
 *   It hooks into Vite's `handleHotUpdate` lifecycle. When a file in an
 *   SSR-relevant directory changes, the plugin:
 *     1. Explicitly invalidates the module in Vite's SSR module graph
 *        (Vite usually does this already, but being explicit is safer)
 *     2. Sends `{ type: 'full-reload' }` to all connected browser clients
 *        via the Vite WebSocket server
 *     3. Returns [] to tell Vite "I've handled this update — don't also
 *        send your own partial HMR update for this file"
 *
 * Usage — add to vite.config.js:
 *
 *   import { ssrHmrPlugin } from './plugins/ssr-hmr.js';
 *
 *   export default defineConfig({
 *     plugins: [ssrHmrPlugin()],
 *   });
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SsrHmrOptions
 * @property {string[]} [watchDirs]
 *   Directory substrings (forward-slash format) that identify SSR-only files.
 *   A file whose normalised absolute path contains any of these strings will
 *   trigger a full-reload when changed.
 *   Default: ['/src/pages/', '/src/layouts/', '/src/components/', '/src/lib/']
 *
 * @property {boolean} [verbose]
 *   Log which file triggered the reload. Default: false.
 */

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * @param {SsrHmrOptions} [options]
 * @returns {import('vite').Plugin}
 */
export function ssrHmrPlugin(options = {}) {
  const {
    verbose = false,
    watchDirs = [
      '/src/pages/',
      '/src/layouts/',
      '/src/components/',
      '/src/lib/',
      '/src/content/',
      '/src/domain/',
    ],
  } = options;

  return {
    name: 'vite-plugin-ssr-hmr',

    // Only active in dev mode — no-op in production builds
    apply: 'serve',

    /**
     * handleHotUpdate fires whenever a watched file changes.
     *
     * @param {import('vite').HmrContext} ctx
     * @returns {import('vite').ModuleNode[] | void}
     */
    handleHotUpdate(ctx) {
      const { file, server, modules } = ctx;

      // Normalise to forward slashes for cross-platform matching
      const normalised = file.replace(/\\/g, '/');
      const isSSRFile = watchDirs.some((dir) => normalised.includes(dir));

      if (!isSSRFile) {
        // Not an SSR file — let Vite handle its own HMR normally
        return;
      }

      // ── 1. Invalidate in Vite's SSR module graph ────────────────────────────
      //
      // Vite usually does this automatically when a file changes, but being
      // explicit ensures the module is marked stale before the browser makes
      // its next request. Without this, there's a narrow race window where a
      // request arrives before Vite has finished processing the change.
      //
      // We iterate `modules` (Vite module graph nodes for this file) rather
      // than looking up by file path, because a single file can correspond to
      // multiple module graph entries (e.g. with different query strings).
      for (const mod of modules) {
        server.moduleGraph.invalidateModule(mod);
      }

      if (verbose) {
        // Use Vite's own logger so it respects the configured log level
        server.config.logger.info(
          `[ssr-hmr] SSR file changed → full-reload: ${normalised.split('/src/')[1] ?? file}`,
          { timestamp: true },
        );
      }

      // ── 2. Tell the browser to do a full page reload ────────────────────────
      //
      // server.ws.send() broadcasts to all connected Vite HMR WebSocket
      // clients. { type: 'full-reload' } causes the Vite client runtime
      // (injected into every page in dev mode) to call location.reload().
      server.ws.send({ type: 'full-reload' });

      // ── 3. Return [] to suppress Vite's own HMR handling for this file ──────
      //
      // Returning an empty array tells Vite "I've handled this, don't process
      // it further." This prevents Vite from also attempting a module-level
      // HMR update which would be wrong for SSR-only files (they have no
      // client-side HMR boundary to accept the update).
      return [];
    },
  };
}
