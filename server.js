import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { buildRenderContext } from './src/lib/render-context-factory.js';
import { renderPage } from './src/lib/render-page.js';
import { HTTP_METHODS } from './src/lib/constants.js';
import { ViteRouter } from './src/core/router/router.js';
import { runWithPreview } from './src/lib/preview-context.js';
import { createAppLogger } from './src/lib/logger/create-logger.js';
import { resolveHttpStatus, isOperationalError } from './src/lib/errors/http-error-mapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// -- Configuration --------------------------------------------------------------
//
// All tunables in one frozen object. Nothing else in this file reads
// process.env directly — makes testing and containerisation straightforward.

const config = Object.freeze({
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 5173),
  host: process.env.HOST ?? 'localhost',
  base: process.env.BASE ?? '/',
  pagesDir: process.env.PAGES_DIR ?? '/src/pages',
});

// -- Logger --------------------------------------------------------------------

const logger = createAppLogger();
const serverLog = logger.child({ subsystem: 'server' });

// -- Entry point -------------------------------------------------------------------

try {
  const { server } = await bootstrap();
  setupGracefulShutdown(server);
} catch (err) {
  serverLog.error('Fatal: server failed to start', { error: err.message, stack: err.stack });
  process.exit(1);
}

// -- Bootstrap -------------------------------------------------------------------

async function bootstrap() {
  const app = express();

  // ── 1. Security + body-parsing middleware ────────────────────────────────────
  app.use(securityHeaders());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // ── 2. Vite dev server or production static file serving ────────────────────
  const vite = await mountStaticMiddleware(app);

  // ── 3. File-system router ────────────────────────────────────────────────────
  const router = new ViteRouter(vite, {
    logger: logger.child({ subsystem: 'router' }),
    pagesDir: config.pagesDir,
  });
  await router.initialize();
  serverLog.info('Router ready', { routes: router.routes.length });

  // ── 4. Render context ────────────────────────────────────────────────────────
  //
  // In production: template HTML and the render() function are loaded once
  // and cached for the lifetime of the server process.
  //
  // In development: each request reloads the template and re-imports
  // entry-server through Vite's SSR module system, picking up HMR changes.
  const renderCtx = await buildRenderContext(vite);

  // ── 5. Dev-only suppressions ─────────────────────────────────────────────────
  if (!config.isProd) {
    // Chrome DevTools sends this request automatically in some versions.
    // Without this handler it falls through to SSR and produces a noisy warning.
    app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) =>
      res.status(204).end(),
    );
  }

  // ── 6. SSR catch-all ─────────────────────────────────────────────────────────
  //
  // Mounted without a path so it catches every method and every path that
  // was not handled by vite.middlewares or the dev suppression above.
  //
  // This replaces app.use('*all', ...) which is Express 5 syntax and
  // silently never fires under Express 4.
  app.use(createSsrHandler(router, renderCtx));

  // ── 7. Centralised error handler ─────────────────────────────────────────────
  //
  // Must be the last thing registered and must have exactly 4 parameters
  // for Express to recognise it as an error-handling middleware.
  app.use(createErrorHandler(vite));

  // ── 8. Start listening ────────────────────────────────────────────────────────
  const server = await startListening(app);
  return { app, server };
}

// ── Static middleware ──────────────────────────────────────────────────────────

/**
 * Development: mount Vite's dev server middleware and return the ViteDevServer.
 * Production: mount compression + sirv for built client assets; return null.
 *
 * @param {import('express').Application} app
 * @returns {Promise<import('vite').ViteDevServer | null>}
 */
async function mountStaticMiddleware(app) {
  if (!config.isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
      base: config.base,
    });
    app.use(vite.middlewares);
    return vite;
  }

  // Load both in parallel — no dependency between them
  const [{ default: compression }, { default: sirv }] = await Promise.all([
    import('compression'),
    import('sirv'),
  ]);
  app.use(compression());
  app.use(config.base, sirv(path.join(__dirname, 'dist/client'), { extensions: [] }));
  return null;
}

// ── SSR handler ────────────────────────────────────────────────────────────────

/**
 * The main SSR middleware: matches the URL to a file-system route, loads the
 * page module, and renders HTML — or delegates to the error handler via next(err).
 *
 * @param {ViteRouter}     router
 * @param {RenderContext}  renderCtx
 * @returns {import('express').RequestHandler}
 */
function createSsrHandler(router, renderCtx) {
  return async (req, res, next) => {
    // req.path is the pathname without query string, already decoded by Express.
    // We use this for router matching (not req.originalUrl which may contain
    // base prefix and query string that would confuse the router).
    const pathname = req.path;

    // req.originalUrl is the full URL including query string, needed by Vite's
    // transformIndexHtml which uses it for plugin injection hooks.
    const fullUrl = req.originalUrl;

    try {
      // router.match() is async — the original code forgot to await this,
      // meaning `match` was always a Promise (truthy), so every request fell
      // through to the SPA shell fallback, bypassing all SSR.
      const match = await router.match(pathname);

      if (!match) {
        // No file-system route registered for this path.
        // Serve the bare SPA shell so client-side routing can take over.
        // Change to next() if you want to produce a proper 404 instead.
        return await renderSpaShell(res, fullUrl, renderCtx);
      }

      const { route, params } = match;

      let pageModule;
      try {
        pageModule = await route.loader();
      } catch (err) {
        serverLog.error('Page module failed to load', { route: route.route, error: err.message });
        return next(err);
      }

      // Dispatch: API endpoints vs renderable pages
      if (isApiModule(pageModule)) {
        return await handleApiRoute(req, res, next, pageModule, params);
      }

      // ── Preview mode detection ─────────────────────────────────────────────
      //
      // Preview is enabled by ?preview=true on the URL (easy to test) OR by a
      // cookie named "preview" (for persistent sessions set via /api/preview).
      // The runWithPreview() call makes isPreview() return the correct value
      // anywhere inside the async render chain — including content.page() in
      // getServerData, which uses the value to switch between the published
      // and draft content repositories.
      const preview = req.query?.preview === 'true' || req.cookies?.preview === 'true';

      return await runWithPreview(preview, () =>
        handlePageRoute(req, res, next, fullUrl, pageModule, params, renderCtx),
      );
    } catch (err) {
      next(err);
    }
  };
}

// ── API routes ─────────────────────────────────────────────────────────────────

/**
 * An API module exports HTTP-method handlers but no renderable Page component.
 * Convention: if a module has `default` or `Page`, it is a page — not an API.
 *
 * @param {Record<string, unknown>} mod
 * @returns {boolean}
 */
function isApiModule(mod) {
  if (mod.default || mod.Page) return false;
  return HTTP_METHODS.some((m) => typeof mod[m] === 'function');
}

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @param {Record<string, unknown>}         mod
 * @param {Record<string, string|string[]>} params
 */
async function handleApiRoute(req, res, next, mod, params) {
  const method = req.method.toLowerCase();
  const handler = mod[method];

  if (typeof handler !== 'function') {
    const allowed = HTTP_METHODS.filter((m) => typeof mod[m] === 'function').map((m) =>
      m.toUpperCase(),
    );

    res
      .set('Allow', allowed.join(', '))
      .status(405)
      .json({ error: `Method ${req.method} not allowed`, allowed });
    return;
  }

  try {
    const result = await handler({ req, res, params });

    // If the handler already responded (called res.json / res.send directly),
    // respect that and do nothing. Otherwise serialise the return value.
    if (!res.headersSent) {
      res.status(200).json(result ?? null);
    }
  } catch (err) {
    next(err);
  }
}

// ── Page routes ────────────────────────────────────────────────────────────────

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @param {string}          url
 * @param {Record<string, unknown>}         mod
 * @param {Record<string, string|string[]>} params
 * @param {RenderContext}   renderCtx
 */
async function handlePageRoute(req, res, next, url, mod, params, renderCtx) {
  try {
    const html = await renderPage(
      url,
      { route: { loader: () => mod, route: url }, params, url },
      renderCtx,
      req,
    );
    res.status(200).set('Content-Type', 'text/html').send(html);
  } catch (err) {
    next(err);
  }
}

// ── SPA shell fallback ─────────────────────────────────────────────────────────

/**
 * Serve the client-only SPA shell for paths the router doesn't recognise.
 * Returns 200 so client-side routing can handle the path after hydration.
 *
 * If you do full SSR for every route and want hard 404s instead, replace
 * this with: next(Object.assign(new Error('Not Found'), { status: 404 }))
 *
 * @param {import('express').Response} res
 * @param {string}        url
 * @param {RenderContext} renderCtx
 */
async function renderSpaShell(res, url, renderCtx) {
  const [template, render] = await Promise.all([renderCtx.getTemplate(url), renderCtx.getRender()]);

  const rendered = await render(url);

  const html = template
    .replace('<!--app-head-->', rendered.head ?? '')
    .replace('<!--app-html-->', rendered.html ?? '');

  res.status(200).set('Content-Type', 'text/html').send(html);
}

// ── Error handler ──────────────────────────────────────────────────────────────

/**
 * Centralised Express error-handling middleware.
 *
 * The 4-argument signature is required — Express uses the parameter count
 * to distinguish error handlers from regular middleware.
 *
 * @param {import('vite').ViteDevServer | null} vite
 * @returns {import('express').ErrorRequestHandler}
 */
function createErrorHandler(vite) {
  return async (err, req, res, _next) => {
    // In development, rewrite stack frames to point at source files.
    // Only called once — the original called vite?.ssrFixStacktrace AND
    // vite.ssrFixStacktrace in the same block, the second throwing in production.
    if (vite) vite.ssrFixStacktrace(err);

    const status = resolveHttpStatus(err);
    const operational = isOperationalError(err);

    // Operational (4xx): warn. Non-operational (5xx / unexpected): error.
    // This is the key distinction for on-call alerting.
    const logLevel = operational && status < 500 ? 'warn' : 'error';

    serverLog[logLevel]('Request error', {
      method: req.method,
      url: req.originalUrl,
      status,
      code: err.code ?? null, // domain error code if present
      error: err.message,
      stack: status >= 500 ? err.stack : undefined, // stack only for real errors
    });

    if (res.headersSent) return;

    // API / JSON clients get a JSON error body
    if (req.headers.accept?.includes('application/json')) {
      return res.status(status).json({
        error: config.isProd ? httpStatusMessage(status) : err.message,
        code: err.code ?? null,
      });
    }

    // Page clients get a minimal HTML error page
    const body = config.isProd
      ? `<html><body><h1>${httpStatusMessage(status)}</h1></body></html>`
      : `<html><body><pre style="padding:2rem;font-family:monospace">${escapeHtml(err.stack)}</pre></body></html>`;

    res.status(status).set('Content-Type', 'text/html').send(body);
  };
}

// ── Security headers ───────────────────────────────────────────────────────────

/**
 * Minimal security headers applied to every response.
 * For a stricter Content-Security-Policy, configure per application.
 *
 * @returns {import('express').RequestHandler}
 */
function securityHeaders() {
  return (_req, res, next) => {
    // Prevent MIME-type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Disallow embedding in iframes from other origins
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // X-XSS-Protection is deprecated in modern browsers; rely on CSP instead
    res.setHeader('X-XSS-Protection', '0');
    next();
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Minimal HTML escaping for values inserted into tag content or attributes.
 *
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Consistent user-facing messages — never expose internals in prod.
/**
 * Returns a user-facing message for a given HTTP status code.
 *
 * @param {number} status
 * @returns {string}
 */
function httpStatusMessage(status) {
  const messages = {
    400: 'Bad Request',
    404: 'Page Not Found',
    405: 'Method Not Allowed',
    422: 'Unprocessable Content',
    500: 'Internal Server Error',
  };
  return messages[status] ?? 'Server Error';
}

// ── Server lifecycle ───────────────────────────────────────────────────────────

/**
 * Start the HTTP server and resolve with the server instance once the
 * port is bound. Rejects on EADDRINUSE or other listen errors.
 *
 * @param {import('express').Application} app
 * @returns {Promise<import('http').Server>}
 */
function startListening(app) {
  return new Promise((resolve, reject) => {
    app
      .listen(config.port, config.host, () => {
        serverLog.info('Server listening', {
          url: `http://${config.host}:${config.port}${config.base}`,
          mode: config.isProd ? 'production' : 'development',
        });
      })
      .once('listening', function () {
        resolve(this);
      })
      .once('error', reject);
  });
}

/**
 * Drain in-flight connections before exiting so k8s / systemd deploy is clean.
 * Forces exit after FORCE_EXIT_MS if connections do not close in time.
 *
 * @param {import('http').Server} server
 */
function setupGracefulShutdown(server) {
  const FORCE_EXIT_MS = 10_000;

  function shutdown(signal) {
    serverLog.info(`${signal} received — shutting down gracefully`);

    server.close(() => {
      serverLog.info('All connections drained — exiting');
      process.exit(0);
    });

    // .unref() so the timeout does not prevent the event loop from exiting
    // if all connections close before the timeout fires
    setTimeout(() => {
      serverLog.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, FORCE_EXIT_MS).unref();
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
