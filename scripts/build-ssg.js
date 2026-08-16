#!/usr/bin/env node
/**
 * scripts/build-ssg.js
 *
 * Static Site Generation pipeline.
 *
 * Reads the pre-built route manifest, renders every static route to a
 * complete HTML file, and writes the results into dist/client/ alongside
 * the JS/CSS assets that Vite already produced.
 *
 * Prerequisites (the "build" npm script runs these in order):
 *   1. vite build                              → dist/client/  (JS, CSS, template)
 *   2. vite build --ssr src/entry-server.js    → dist/server/  (SSR render fn + page modules)
 *   3. node scripts/generate-routes.js         → dist/server/route-manifest.json
 *   4. node scripts/build-ssg.js               ← this file
 *
 * Output (merged into dist/client/):
 *   /                 → dist/client/index.html
 *   /about            → dist/client/about/index.html
 *   /pricing          → dist/client/pricing/index.html
 *   /blog/hello-world → dist/client/blog/hello-world/index.html
 *
 * Dynamic routes:
 *   A dynamic route (e.g. /blog/[slug]) is pre-rendered only if its page
 *   module exports getStaticPaths(). That function returns the list of param
 *   sets to render:
 *
 *     export async function getStaticPaths() {
 *       const posts = await fetchPostsFromCms();
 *       return posts.map(p => ({ params: { slug: p.slug } }));
 *     }
 *
 *   Dynamic routes without getStaticPaths are skipped with a warning.
 *   This is intentional — you opt in to pre-rendering, never accidentally.
 *
 * CLI options:
 *   --out-dir <path>     Output directory (default: dist/client)
 *   --concurrency <n>    Max parallel renders (default: 4)
 *   --verbose            Print each page as it renders
 *   --dry-run            Plan and log what would be written, but write nothing
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ViteRouter } from '../src/core/router/router.js';
import { buildRenderContext } from '../src/lib/render-context-factory.js';
import { renderPage, resolveStaticPaths, hasStaticPaths } from '../src/lib/render-page.js';
import { ContentError, ContentErrorCode } from '../src/domain/content/errors/index.js';
import { createAppLogger } from '../src/lib/logger/create-logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} RenderJob
 * @property {string} url           - The URL to render, e.g. "/blog/hello-world"
 * @property {import('../src/core/router/router.js').RouteRecord} routeRecord
 * @property {Record<string,string>} params
 * @property {string} outFile       - Absolute path to the output .html file
 */

/**
 * @typedef {Object} BuildResult
 * @property {number}  total     - Total jobs attempted
 * @property {number}  written   - Successfully written
 * @property {number}  skipped   - Skipped (dynamic routes without getStaticPaths)
 * @property {number}  drafted   - Skipped because content status is 'draft'
 * @property {string[]} errors   - Error messages for failed renders
 * @property {number}  durationMs
 */

/**
 * @typedef {Object} CliOptions
 * @property {string}  outDir
 * @property {number}  concurrency
 * @property {boolean} verbose
 * @property {boolean} dryRun
 */

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const opts = parseArgs(process.argv.slice(2));

try {
  const result = await build(opts);
  printSummary(result);
  if (result.errors.length > 0) process.exit(1);
} catch (err) {
  console.error(`\n❌ SSG build failed: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * @param {CliOptions} opts
 * @returns {Promise<BuildResult>}
 */
async function build(opts) {
  const start = performance.now();

  // Must be set before buildRenderContext so it takes the production path
  process.env.NODE_ENV = 'production';

  const outDir = path.resolve(ROOT, opts.outDir);
  log(`\n📦 SSG build\n   Output → ${outDir}\n   Concurrency → ${opts.concurrency}\n`);

  const ssgLogger = createAppLogger().child({ subsystem: 'ssg' });

  // ── 1. Initialize router from the pre-built manifest ──────────────────────
  const router = new ViteRouter(null, {
    logger: ssgLogger.child({ subsystem: 'router' }),
    pagesDir: '/src/pages',
  });
  await router.initialize();

  // ── 2. Production render context ──────────────────────────────────────────
  //
  // buildRenderContext reads dist/client/index.html into memory here and
  // closes over it. Even though we will later overwrite dist/client/index.html
  // with the rendered home page, every subsequent renderPage call still uses
  // the original Vite-built template (from the closure), not the overwritten file.
  const renderCtx = await buildRenderContext(null);

  // ── 3. Collect render jobs ─────────────────────────────────────────────────
  const { jobs, skipped } = await collectJobs(router.routes, outDir, opts);

  if (jobs.length === 0 && skipped === 0) {
    log('⚠️  No routes to render.\n');
    return { total: 0, written: 0, skipped: 0, errors: [], durationMs: 0 };
  }

  log(`   Routes: ${jobs.length} to render, ${skipped} skipped\n`);

  // ── 4. Render all jobs with concurrency control ────────────────────────────
  const { errors, drafted } = await renderAll(jobs, renderCtx, opts);

  return {
    total: jobs.length,
    written: jobs.length - errors.length - drafted,
    skipped,
    drafted, // pages skipped because their content status is 'draft'
    errors,
    durationMs: performance.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Job collection
// ---------------------------------------------------------------------------

/**
 * Walk the route list and produce a flat array of RenderJobs.
 *
 * Route classification:
 *
 *   Static (/about)         → one job, no params
 *   Optional (/blog/[[p]])  → one job for the base path (/blog), no params
 *   Dynamic (/blog/[slug])  → load module, call getStaticPaths, one job per entry
 *   Dynamic + no gSP        → skipped with warning
 *
 * @param {import('../src/core/router/router.js').RouteRecord[]} routes
 * @param {string} outDir
 * @param {CliOptions} opts
 * @returns {Promise<{ jobs: RenderJob[]; skipped: number }>}
 */
async function collectJobs(routes, outDir, opts) {
  const jobs = [];
  let skipped = 0;

  for (const routeRecord of routes) {
    // ── Static + optional: render the base URL with empty params ─────────────
    if (!routeRecord.isDynamic || routeRecord.isOptional) {
      // For optional routes like /blog/[[page]], the base URL is /blog
      const url = stripOptionalSuffix(routeRecord.route);
      jobs.push(buildJob(url, routeRecord, {}, outDir));
      continue;
    }

    // ── Dynamic: check for getStaticPaths ─────────────────────────────────────
    let pageModule;
    try {
      pageModule = await routeRecord.loader();
    } catch (err) {
      log(`⚠️  Could not load module for ${routeRecord.route}: ${err.message}`);
      skipped++;
      continue;
    }

    if (!hasStaticPaths(pageModule)) {
      if (opts.verbose) {
        log(`⏭️  Skipping ${routeRecord.route} — no getStaticPaths`);
      }
      skipped++;
      continue;
    }

    // ── Dynamic with getStaticPaths ───────────────────────────────────────────
    let staticPaths;
    try {
      staticPaths = await resolveStaticPaths(pageModule, routeRecord.route);
    } catch (err) {
      log(`❌  getStaticPaths failed for ${routeRecord.route}: ${err.message}`);
      skipped++;
      continue;
    }

    for (const { params } of staticPaths) {
      const url = buildUrl(routeRecord.route, params);
      jobs.push(buildJob(url, routeRecord, params, outDir));
    }
  }

  return { jobs, skipped };
}

/**
 * Build a URL from a route pattern and its params.
 * e.g. route="/blog/[slug]" params={slug:"hello"} → "/blog/hello"
 *
 * @param {string} routePattern
 * @param {Record<string,string|string[]>} params
 * @returns {string}
 */
function buildUrl(routePattern, params) {
  return routePattern.replace(/\[\.\.\.([^\]]+)\]|\[([^\]]+)\]/g, (_, spread, single) => {
    const key = spread ?? single;
    const value = params[key];
    return Array.isArray(value) ? value.join('/') : (value ?? '');
  });
}

/**
 * Strip the optional segment suffix from a route pattern so we render the
 * base URL: "/blog/[[page]]" → "/blog"
 *
 * @param {string} route
 * @returns {string}
 */
function stripOptionalSuffix(route) {
  return route.replace(/\/\[\[.*?\]\]$/, '') || '/';
}

/**
 * @param {string} url
 * @param {import('../src/core/router/router.js').RouteRecord} routeRecord
 * @param {Record<string,string>} params
 * @param {string} outDir
 * @returns {RenderJob}
 */
function buildJob(url, routeRecord, params, outDir) {
  const outFile =
    url === '/'
      ? path.join(outDir, 'index.html')
      : path.join(outDir, ...url.replace(/^\//, '').split('/'), 'index.html');

  return { url, routeRecord, params, outFile };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render all jobs with a configurable concurrency limit.
 * Returns an array of error message strings for failed renders.
 * Does not throw — the caller decides whether to exit(1) based on error count.
 *
 * @param {RenderJob[]}  jobs
 * @param {import('../src/lib/render-context-factory.js').RenderContext} renderCtx
 * @param {CliOptions}   opts
 * @returns {Promise<string[]>}
 */
async function renderAll(jobs, renderCtx, opts) {
  const limit = createLimiter(opts.concurrency);
  const errors = [];
  let drafted = 0;

  await Promise.all(
    jobs.map((job) =>
      limit(async () => {
        try {
          const result = await renderJob(job, renderCtx, opts);
          if (result?.skipped) {
            drafted++;
            log(`⏭️  ${job.url} — skipped (draft, not in published repo)`);
          }
        } catch (err) {
          const msg = `${job.url}: ${err.message}`;
          errors.push(msg);
          log(`❌  ${msg}`);
        }
      }),
    ),
  );

  return { errors, drafted };
}

/**
 * Render a single job and write the result atomically.
 *
 * @param {RenderJob}    job
 * @param {import('../src/lib/render-context-factory.js').RenderContext} renderCtx
 * @param {CliOptions}   opts
 */
async function renderJob(job, renderCtx, opts) {
  // Build a synthetic RouteMatch compatible with renderPage
  const match = {
    route: job.routeRecord,
    params: job.params,
    url: job.url,
    matchedPattern: job.routeRecord.pattern.source,
  };

  let html;
  try {
    html = await renderPage(job.url, match, renderCtx, {
      url: job.url,
      method: 'GET',
      headers: {},
    });
  } catch (err) {
    // A PAGE_NOT_FOUND (or equivalent) error means the page exists as a route
    // file but its content is draft — the published repository doesn't have it.
    // This is intentional, not a build failure. Skip silently.
    if (isDraftSkip(err)) {
      return { skipped: true, url: job.url };
    }
    throw err; // Re-throw genuine render errors
  }

  if (opts.dryRun) {
    log(`  [dry-run] would write: ${path.relative(ROOT, job.outFile)}`);
    return { written: true };
  }

  // Atomic write: write to a .tmp file first, then rename.
  // If the process is killed mid-write, the existing file is never corrupted.
  await fs.mkdir(path.dirname(job.outFile), { recursive: true });

  const tmp = job.outFile + '.ssg-tmp';
  await fs.writeFile(tmp, html, 'utf-8');
  await fs.rename(tmp, job.outFile);

  if (opts.verbose) {
    log(`✅  ${job.url.padEnd(40)} → ${path.relative(ROOT, job.outFile)}`);
  } else {
    process.stdout.write('.');
  }

  return { written: true };
}

// ---------------------------------------------------------------------------
// Draft-skip detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the error represents a draft page being excluded from
 * the published repository — a deliberate skip, not a build failure.
 *
 * ContentError.code is matched directly against the domain constants.
 * No string parsing, no message pattern matching.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isDraftSkip(err) {
  if (!(err instanceof ContentError)) return false;
  return (
    err.code === ContentErrorCode.PAGE_NOT_FOUND || err.code === ContentErrorCode.CONTENT_NOT_FOUND
  );
}

// ---------------------------------------------------------------------------
// Concurrency limiter
// ---------------------------------------------------------------------------

/**
 * Create a function that limits the number of promises running in parallel.
 *
 * Usage:
 *   const limit = createLimiter(4);
 *   await Promise.all(tasks.map(task => limit(() => doWork(task))));
 *
 * @param {number} max
 * @returns {<T>(fn: () => Promise<T>) => Promise<T>}
 */
function createLimiter(max) {
  let running = 0;
  const queue = [];

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      const attempt = async () => {
        running++;
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          running--;
          if (queue.length > 0) queue.shift()();
        }
      };

      if (running < max) {
        attempt();
      } else {
        queue.push(attempt);
      }
    });
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * @param {BuildResult} result
 */
function printSummary(result) {
  const sec = (result.durationMs / 1000).toFixed(2);
  console.log(`\n\n${'─'.repeat(50)}`);
  console.log(`SSG Build Summary`);
  console.log(`─`.repeat(50));
  console.log(`  Pages rendered : ${result.written}`);
  console.log(`  Pages skipped  : ${result.skipped}  (dynamic routes without getStaticPaths)`);
  console.log(`  Pages drafted  : ${result.drafted}  (status: draft — excluded from build)`);
  console.log(`  Errors         : ${result.errors.length}`);
  console.log(`  Duration       : ${sec}s`);

  if (result.errors.length > 0) {
    console.log(`\nFailed pages:`);
    result.errors.forEach((e) => console.log(`  ✗ ${e}`));
    console.log(`\n❌ Build completed with errors.`);
  } else {
    console.log(`\n✅ SSG build complete.`);
  }
  console.log('─'.repeat(50) + '\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * @param {string[]} args
 * @returns {CliOptions}
 */
function parseArgs(args) {
  const opts = {
    outDir: process.env.SSG_OUT_DIR ?? 'dist/client',
    concurrency: Number(process.env.SSG_CONCURRENCY ?? 4),
    verbose: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--verbose') {
      opts.verbose = true;
      continue;
    }
    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }

    const [key, val] = arg.startsWith('--') ? arg.slice(2).split('=') : [];
    const value = val ?? args[++i];

    if (key === 'out-dir') {
      opts.outDir = value;
      continue;
    }
    if (key === 'concurrency') {
      opts.concurrency = Number(value);
      continue;
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(msg + '\n');
}
