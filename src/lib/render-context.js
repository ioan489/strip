/**
 * render-context.js
 *
 * Per-request render context using AsyncLocalStorage.
 *
 * Problem it solves:
 *   When a component renders, it needs to register its CSS and JS assets so
 *   the server can inject the correct <link> tags and script registry into
 *   the <head>. But components are called deep in a tree — threading a
 *   context object through every function signature is verbose and fragile.
 *
 * Solution:
 *   AsyncLocalStorage creates a request-scoped store that is automatically
 *   available anywhere within the same async call chain. Components call
 *   addAssets() which writes to the current request's store. The server reads
 *   the collected assets after the page finishes rendering.
 *
 *   This is the same mechanism Next.js uses for request-scoped data (headers(),
 *   cookies()) and how OpenTelemetry propagates trace context in Node.js.
 *
 * Usage (server):
 *   const { result, assets } = await runWithContext(() => Page({ params }));
 *
 * Usage (component — via defineComponent, not called directly):
 *   addAssets([{ type: 'css', src: '/src/components/Foo/Foo.css', critical: true }]);
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Asset
 * @property {'css'|'js'} type
 * @property {string}     src       - URL or Vite-resolvable path to the asset
 * @property {boolean}    critical  - true → load before FCP; false → defer
 * @property {string}     [id]      - Dedup key; defaults to `src` when absent
 * @property {string}     [content] - Processed CSS string from a Vite ?inline import.
 *                                    When present, head-builder inlines this as a <style>
 *                                    tag instead of emitting a <link>. This is how
 *                                    component CSS goes through Vite's full pipeline
 *                                    (PostCSS, nesting, autoprefixing, minification)
 *                                    and still ends up inlined in the HTML document.
 */

/**
 * @typedef {Object} RenderStore
 * @property {Asset[]}    assets
 * @property {Set<string>} seen    - Tracks asset IDs to prevent duplicates
 */

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = Symbol.for('stripe-clone:render-context-storage');

if (!globalThis[STORAGE_KEY]) {
  globalThis[STORAGE_KEY] = new AsyncLocalStorage();
}

/** @type {AsyncLocalStorage<RenderStore>} */
const storage = globalThis[STORAGE_KEY];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a render function inside a fresh per-request context.
 *
 * All `addAssets()` calls made anywhere within `fn` (including in nested
 * component calls) write to this context's asset list.
 *
 * @template T
 * @param {() => T | Promise<T>} fn  - The render function to execute
 * @returns {Promise<{ result: T; assets: Asset[] }>}
 */
export async function runWithContext(fn) {
  /** @type {RenderStore} */
  const store = { assets: [], seen: new Set() };

  const result = await storage.run(store, fn);

  return { result, assets: store.assets };
}

/**
 * Register assets from within a component.
 *
 * Safe to call outside a render context (e.g. in unit tests) — it becomes
 * a no-op when there is no active store.
 *
 * Automatically deduplicates: if the same asset `src` (or `id`) is added
 * more than once — e.g. because multiple page sections use the same Button
 * component — it is only included once in the final head.
 *
 * @param {Asset[]} assets
 */
export function addAssets(assets) {
  const store = storage.getStore();
  if (!store) return; // no active context — no-op

  for (const asset of assets) {
    const key = asset.id ?? asset.src;
    if (!store.seen.has(key)) {
      store.seen.add(key);
      store.assets.push(asset);
    }
  }
}

/**
 * Read the assets collected so far in the current render context.
 *
 * Primarily useful for testing individual components in isolation.
 *
 * @returns {Asset[]}
 */
export function getAssets() {
  return storage.getStore()?.assets ?? [];
}
