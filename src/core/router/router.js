/**
 * ViteRouter — Enterprise-grade file-system router for Vite SSR
 *
 * Features:
 *  - Pluggable logger (silent by default in test, structured in prod)
 *  - Middleware hooks: beforeMatch, afterMatch, onError
 *  - Telemetry hooks: onMatchDuration
 *  - LRU-bounded route cache with TTL support
 *  - Strict ESM-safe production manifest loading
 *  - Semantic collision detection (static vs dynamic overlap)
 *  - Typed JSDoc throughout
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromFilePath } from './route-record.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./route-record.js').RouteRecord} RouteRecord
 */

/**
 * @typedef {Object} RouteMatch
 * @property {RouteRecord}                       route
 * @property {Record<string, string|string[]>}   params
 * @property {string}                            url
 * @property {string}                            matchedPattern
 */

/**
 * @typedef {Object} RouterOptions
 * @property {Logger}          [logger]           - Pluggable logger (default: ConsoleLogger)
 * @property {number}          [cacheMaxSize=512]  - Max LRU module cache entries
 * @property {number}          [cacheTtlMs=0]      - Cache TTL in ms; 0 = no expiry
 * @property {MiddlewareFn[]}  [middleware=[]]     - Ordered middleware applied on every match
 * @property {TelemetryFn}     [onMatchDuration]   - Called after every match with timing data
 * @property {boolean}         [strictCollisions=false] - Also throw on collisions in dev
 * @property {string}          [pagesDir='/src/pages']  - Forwarded to fromFilePath
 * @property {boolean}         [caseSensitive=true]     - Forwarded to fromFilePath
 */

/**
 * @typedef {(ctx: MatchContext, next: () => Promise<void>) => Promise<void>} MiddlewareFn
 */

/**
 * @typedef {Object} MatchContext
 * @property {string}          url
 * @property {RouteMatch|null} match
 */

/**
 * @typedef {(info: { url: string; durationMs: number; matched: boolean }) => void} TelemetryFn
 */

/**
 * @typedef {Object} Logger
 * @property {Function} debug
 * @property {Function} info
 * @property {Function} warn
 * @property {Function} error
 */

/// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

class ConsoleLogger {
  constructor(namespace = 'ViteRouter') {
    this.ns = namespace;
  }

  #line(msg, meta) {
    const base = `[${this.ns}] ${msg}`;
    return meta && Object.keys(meta).length > 0 ? [base, meta] : [base];
  }

  debug() {
    /* silent in production by default; swap for a pino/winston instance */
  }
  info(msg, meta) {
    console.log(...this.#line(msg, meta));
  }
  warn(msg, meta) {
    console.warn(...this.#line(msg, meta));
  }
  error(msg, meta) {
    console.error(...this.#line(msg, meta));
  }
}

// ---------------------------------------------------------------------------
// LRU cache with optional TTL
// ---------------------------------------------------------------------------

class BoundedCache {
  /**
   * @param {number} maxSize
   * @param {number} ttlMs  - 0 = no TTL
   */
  constructor(maxSize = 512, ttlMs = 0) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    /** @type {Map<string, { value: unknown; ts: number }>} */
    this._store = new Map();
  }

  #expired(entry) {
    return this.ttlMs > 0 && Date.now() - entry.ts > this.ttlMs;
  }

  has(key) {
    const e = this._store.get(key);
    if (!e) return false;
    if (this.#expired(e)) {
      this._store.delete(key);
      return false;
    }
    return true;
  }

  get(key) {
    const e = this._store.get(key);
    if (!e) return undefined;
    if (this.#expired(e)) {
      this._store.delete(key);
      return undefined;
    }
    // Refresh LRU position
    this._store.delete(key);
    this._store.set(key, e);
    return e.value;
  }

  set(key, value) {
    if (!this._store.has(key) && this._store.size >= this.maxSize) {
      // Evict least-recently-used (first inserted in Map order)
      this._store.delete(this._store.keys().next().value);
    }
    this._store.set(key, { value, ts: Date.now() });
  }

  delete(key) {
    this._store.delete(key);
  }
  clear() {
    this._store.clear();
  }
  get size() {
    return this._store.size;
  }
}

// ---------------------------------------------------------------------------
// ViteRouter
// ---------------------------------------------------------------------------

export class ViteRouter {
  /**
   * @param {import('vite').ViteDevServer|null} vite
   * @param {RouterOptions} [options]
   */
  constructor(vite = null, options = {}) {
    const {
      logger = new ConsoleLogger(),
      cacheMaxSize = 512,
      cacheTtlMs = 0,
      middleware = [],
      onMatchDuration,
      strictCollisions = false,
      pagesDir = '/src/pages',
      caseSensitive = true,
    } = options;

    this.vite = vite;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.logger = logger;
    this.strictCollisions = strictCollisions;
    this.pagesDir = pagesDir;
    this.caseSensitive = caseSensitive;

    /** @type {RouteRecord[]} */
    this.routes = [];
    this.initialized = false;

    this._cache = new BoundedCache(cacheMaxSize, cacheTtlMs);
    this._middleware = [...middleware];
    this._onMatchDuration = onMatchDuration ?? null;
    this._hmrListeners = [];

    if (vite && !this.isProduction) {
      this._setupHMR();
    }
  }

  // -------------------------------------------------------------------------
  // HMR
  // -------------------------------------------------------------------------

  _setupHMR() {
    const pagesMarker = this.pagesDir.replace(/\\/g, '/');

    let debounceTimer;
    const onAll = (event, filePath) => {
      if (!filePath.replace(/\\/g, '/').includes(pagesMarker)) return;
      if (event !== 'add' && event !== 'unlink') return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          await this.loadDevelopmentRoutes();
          this.logger.info('Route table rebuilt', { event, file: path.basename(filePath) });
        } catch (err) {
          this.logger.error('Route table rebuild failed', { error: err.message });
        }
      }, 100);
    };

    this.vite.watcher.on('all', onAll);
    // Store refs for cleanup
    this._hmrListeners = [{ event: 'all', fn: onAll }];
  }

  /** Release HMR listeners and clear caches. Call on server shutdown. */
  dispose() {
    for (const { event, fn } of this._hmrListeners) {
      this.vite?.watcher.off(event, fn);
    }
    this._hmrListeners = [];
    this._cache.clear();
    this.initialized = false;
    this.logger.debug('Router disposed');
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  async initialize() {
    try {
      if (this.isProduction) {
        await this._loadProductionManifest();
      } else {
        await this.loadDevelopmentRoutes();
      }
      this.initialized = true;
      this.logger.info('Router initialized', { routes: this.routes.length });

      if (!this.isProduction) {
        this._logRouteTable();
      }
    } catch (err) {
      this.logger.error('Failed to initialize router', { error: err.message, stack: err.stack });
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Development route loading
  // -------------------------------------------------------------------------

  async loadDevelopmentRoutes() {
    let modules;
    try {
      ({ pageModules: modules } = await this.vite.ssrLoadModule(
        '/src/core/router/vite-page-glob.js',
      ));
    } catch (err) {
      this.logger.error('Failed to load page glob module', { error: err.message });
      throw err;
    }

    const records = [];

    for (const [filePath, importFn] of Object.entries(modules)) {
      if (this._shouldIgnore(filePath)) continue;

      const loader = this._buildDevLoader(filePath, importFn);
      records.push(
        fromFilePath(filePath, loader, {
          pagesDir: this.pagesDir,
          caseSensitive: this.caseSensitive,
        }),
      );
    }

    this._detectCollisions(records);
    this.routes = this._sortRoutes(records);
  }

  /**
   * @param {string}   filePath
   * @param {Function} importFn
   * @returns {Function}
   */
  _buildDevLoader(filePath, importFn) {
    return async () => {
      try {
        return await importFn();
      } catch (err) {
        this.logger.error('Failed to load route module', { filePath, error: err.message });
        throw err;
      }
    };
  }

  // -------------------------------------------------------------------------
  // Production
  // -------------------------------------------------------------------------

  async _loadProductionManifest() {
    const raw = await this._resolveManifest();
    this.manifest = JSON.parse(raw);
    const records = [];

    for (const entry of this.manifest.routes) {
      const loader = this._buildProdLoader(entry);

      // Reconstruct the frozen RouteRecord from serialised manifest fields.
      // spreadParamNames is an array in JSON; convert to a Set for O(1) lookup.
      records.push(
        Object.freeze({
          route: entry.route,
          pattern: new RegExp(entry.patternSource, entry.patternFlags ?? ''),
          spreadParams: new Set(entry.spreadParamNames ?? []),
          isDynamic: entry.isDynamic,
          isSpread: entry.isSpread,
          isOptional: entry.isOptional,
          segmentCount: entry.segmentCount,
          loader,
          filePath: entry.filePath,
        }),
      );
    }

    this._detectCollisions(records);
    this.routes = this._sortRoutes(records);
  }

  async _resolveManifest() {
    const candidates = [
      path.join(__dirname, '../../../dist/server/route-manifest.json'),
      path.join(process.cwd(), 'dist/server/route-manifest.json'),
      path.join(process.cwd(), '.vite-ssr-temp/route-manifest.json'),
    ];

    for (const candidate of candidates) {
      try {
        const data = await fs.readFile(candidate, 'utf-8');
        this.logger.info('Route manifest loaded', { from: candidate });
        return data;
      } catch {
        /* try next */
      }
    }

    throw new Error(
      `Route manifest not found. Searched:\n${candidates.map((c) => `  ${c}`).join('\n')}\n` +
        `Run \`npm run generate:routes\` first.`,
    );
  }

  /**
   * Expected manifest entry shape (for reference when writing generate:routes):
   * {
   *   filePath:        string,   // e.g. "./src/pages/blog/[id].tsx"
   *   route:           string,   // e.g. "/blog/[id]"
   *   patternSource:   string,   // e.g. "^\\/blog\\/(?<id>[^/]+)$"
   *   patternFlags:    string,   // e.g. "" or "i"
   *   spreadParamNames: string[], // e.g. [] or ["slug"]
   *   isDynamic:       boolean,
   *   isSpread:        boolean,
   *   isOptional:      boolean,
   *   segmentCount:    number,
   * }
   *
   * @param {{ filePath: string; route: string }} entry
   * @returns {Function}
   */
  _buildProdLoader(entry) {
    return async () => {
      const cached = this._cache.get(entry.filePath);
      if (cached !== undefined) return cached;

      // Manifest filePaths are Vite-style: /src/pages/index.js
      // The SSR build uses preserveModulesRoot:'src', which strips the src/
      // directory from output paths. The actual file on disk is therefore at
      // dist/server/pages/index.js — NOT dist/server/src/pages/index.js.
      // Strip the leading /src/ (or ./src/ or bare src/) to match.
      const relPath = entry.filePath
        .replace(/^\/src\//, '') // /src/pages/index.js  → pages/index.js
        .replace(/^\.\/src\//, '') // ./src/pages/index.js → pages/index.js
        .replace(/^src\//, ''); // src/pages/index.js   → pages/index.js

      const builtPath = path.join(process.cwd(), 'dist/server', relPath);

      try {
        const mod = await import(`file://${builtPath}`);
        this._cache.set(entry.filePath, mod);
        return mod;
      } catch (err) {
        this.logger.error('Failed to load production route module', {
          route: entry.route,
          builtPath,
          error: err.message,
        });
        throw err;
      }
    };
  }

  // -------------------------------------------------------------------------
  // Route matching
  // -------------------------------------------------------------------------

  /**
   * Match a URL to a route record.
   * Runs configured middleware around the match.
   *
   * @param {string} url
   * @returns {Promise<RouteMatch|null>}
   */
  async match(url) {
    if (!this.initialized) {
      throw new Error('Router not initialised. Call router.initialize() first.');
    }

    const start = performance.now();
    const pathname = this._normalizeUrl(url);
    const ctx = { url: pathname, match: null };

    await this._runMiddleware(ctx, async () => {
      ctx.match = this._matchRoute(pathname);
    });

    if (this._onMatchDuration) {
      this._onMatchDuration({
        url: pathname,
        durationMs: performance.now() - start,
        matched: ctx.match !== null,
      });
    }

    return ctx.match;
  }

  /**
   * Synchronous core match — no middleware, no telemetry.
   * Useful for internal use and testing.
   *
   * @param {string} pathname
   * @returns {RouteMatch|null}
   */
  _matchRoute(pathname) {
    for (const route of this.routes) {
      const m = pathname.match(route.pattern);
      if (!m) continue;

      return {
        route,
        params: this._extractParams(route, m),
        url: pathname,
        matchedPattern: route.pattern.source,
      };
    }
    return null;
  }

  /**
   * Extract URL params from a RegExp match using named capture groups.
   *
   * match.groups already contains { paramName: value } because the patterns
   * use named groups — no positional index mapping needed.
   *
   * Spread params (spread / optSpread) have a raw string value like "a/b/c"
   * that is split into an array. Optional params that were not part of the URL
   * are absent from match.groups (undefined) and are simply omitted.
   *
   * @param {RouteRecord}      route
   * @param {RegExpMatchArray} match
   * @returns {Record<string, string|string[]>}
   */
  _extractParams(route, match) {
    const groups = match.groups ?? {};
    const params = {};

    for (const [name, value] of Object.entries(groups)) {
      if (route.spreadParams.has(name)) {
        // Spread and optSpread: split the matched path fragment into segments.
        // Absent optional spread (value === undefined) → empty array.
        params[name] = value ? value.split('/').filter(Boolean) : [];
      } else if (value !== undefined) {
        // Dynamic and optional: plain string; skip if absent (optional segment not matched)
        params[name] = value;
      }
    }

    return params;
  }

  // -------------------------------------------------------------------------
  // Middleware
  // -------------------------------------------------------------------------

  /**
   * @param {MatchContext} ctx
   * @param {Function}     core
   */
  async _runMiddleware(ctx, core) {
    let i = 0;
    const chain = [
      ...this._middleware,
      async (_ctx, next) => {
        await core();
        await next();
      },
    ];
    const next = async () => {
      const fn = chain[i++];
      if (fn) await fn(ctx, next);
    };
    await next();
  }

  /**
   * Register a middleware at runtime.
   * @param {MiddlewareFn} fn
   * @returns {this}
   */
  use(fn) {
    this._middleware.push(fn);
    return this;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** @param {string} filePath */
  _shouldIgnore(filePath) {
    const base = path.basename(filePath);
    return (
      base.startsWith('_') ||
      base.startsWith('.') ||
      base.includes('.test.') ||
      base.includes('.spec.')
    );
  }

  /**
   * Sort order: static > dynamic > spread.
   * Within the same tier: more segments first, then alphabetical.
   *
   * @param {RouteRecord[]} routes
   * @returns {RouteRecord[]}
   */
  _sortRoutes(routes) {
    return [...routes].sort((a, b) => {
      if (!a.isDynamic && b.isDynamic) return -1;
      if (a.isDynamic && !b.isDynamic) return 1;
      if (!a.isSpread && b.isSpread) return -1;
      if (a.isSpread && !b.isSpread) return 1;

      if (a.segmentCount !== b.segmentCount) return b.segmentCount - a.segmentCount;

      return a.route.localeCompare(b.route);
    });
  }

  /**
   * Detect exact and semantic route collisions.
   *
   * Exact collision: two routes that match identical URLs.
   *   Detection: normalise pattern source by stripping named-group identifiers
   *   before comparing, so /[id] and /[slug] are correctly flagged as identical.
   *   Without this normalisation the original string compare would miss them
   *   because "(?<id>[^/]+)" ≠ "(?<slug>[^/]+)" even though both match the same URLs.
   *
   * Semantic collision: a static route whose path is also matched by a dynamic one.
   *   The static route wins (sorted first), but this warrants a warning.
   *
   * @param {RouteRecord[]} routes
   */
  _detectCollisions(routes) {
    const byStructure = new Map();
    const warnings = [];

    for (const route of routes) {
      // Strip (?<name> ...) → (? ...) so structural equality survives param renaming
      const sig = route.pattern.source.replace(/\?<[^>]+>/g, '?');

      if (byStructure.has(sig)) {
        const prev = byStructure.get(sig);
        warnings.push(
          `Exact collision: "${prev.route}" and "${route.route}" match identical URLs.\n` +
            `  Files: ${prev.filePath}, ${route.filePath}`,
        );
      }
      byStructure.set(sig, route);
    }

    // Semantic check: does any static URL also match a dynamic pattern?
    const statics = routes.filter((r) => !r.isDynamic);
    const dynamics = routes.filter((r) => r.isDynamic && !r.isSpread);

    for (const sr of statics) {
      for (const dr of dynamics) {
        if (sr.route === dr.route) continue; // already caught as exact
        if (sr.route.match(dr.pattern)) {
          warnings.push(
            `Semantic collision: static "${sr.route}" is also matched by dynamic "${dr.route}". ` +
              `Static takes priority due to sort order — verify this is intentional.`,
          );
        }
      }
    }

    if (warnings.length === 0) return;

    this.logger.warn('Route collisions detected', { count: warnings.length });
    warnings.forEach((w) => this.logger.warn(w));

    if (this.isProduction || this.strictCollisions) {
      throw new Error(
        `${warnings.length} route collision(s) must be resolved.\n${warnings.join('\n')}`,
      );
    }
  }

  /** @param {string} url */
  _normalizeUrl(url) {
    if (!url || url === '/') return '/';
    let clean = url.split('?')[0].split('#')[0];
    clean = clean.replace(/\/+/g, '/');
    if (!clean.startsWith('/')) clean = '/' + clean;
    if (clean !== '/' && clean.endsWith('/')) clean = clean.slice(0, -1);
    return clean;
  }

  // -------------------------------------------------------------------------
  // Diagnostics
  // -------------------------------------------------------------------------

  _logRouteTable() {
    const rows = this.routes.map((r) => ({
      route: r.route,
      file: path.basename(r.filePath),
      type: r.isSpread ? 'spread' : r.isDynamic ? 'dynamic' : 'static',
      segments: r.segmentCount,
      optional: r.isOptional,
      spread: [...r.spreadParams],
    }));
    this.logger.info('Route table', { routes: rows });
  }

  /**
   * Returns a serialisable snapshot of the active route table.
   * Safe to expose from a /_debug/routes or /health endpoint.
   *
   * @returns {Array<{route:string; filePath:string; type:string; spreadParams:string[]; segmentCount:number; isOptional:boolean}>}
   */
  inspect() {
    return this.routes.map((r) => ({
      route: r.route,
      filePath: r.filePath,
      type: r.isSpread ? 'spread' : r.isDynamic ? 'dynamic' : 'static',
      spreadParams: [...r.spreadParams],
      segmentCount: r.segmentCount,
      isOptional: r.isOptional,
    }));
  }
}

export default ViteRouter;
