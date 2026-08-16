#!/usr/bin/env node
/**
 * scripts/generate-routes.js
 *
 * Pre-build step: walks the pages directory, compiles every file path into
 * a RouteRecord, and writes the result to dist/server/route-manifest.json.
 *
 * The production router reads this file instead of using Vite's import.meta.glob,
 * which is only available inside the Vite dev server.
 *
 * Why a pre-build step rather than generating at server start?
 *   - The manifest can be committed / cached, making cold starts instant
 *   - Collision errors surface in CI, not at runtime under load
 *   - The file is static JSON — no Node.js startup cost to read it
 *
 * Usage:
 *   node scripts/generate-routes.js
 *   node scripts/generate-routes.js --pages-dir src/custom-pages --out dist/server/routes.json
 *   node scripts/generate-routes.js --dry-run
 *   node scripts/generate-routes.js --case-insensitive
 *
 * Add to package.json scripts:
 *   "generate:routes": "node scripts/generate-routes.js"
 *   "build": "npm run generate:routes && vite build"
 *
 * Exits with code 1 on any error (collisions, parse failures, I/O errors)
 * so CI pipelines fail loudly before a broken build is deployed.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromFilePath } from '../src/core/router/route-record.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ManifestEntry
 * @property {string}   filePath          - e.g. "/src/pages/blog/[id].tsx"
 * @property {string}   route             - e.g. "/blog/[id]"
 * @property {string}   patternSource     - RegExp source string
 * @property {string}   patternFlags      - RegExp flags string ('' or 'i')
 * @property {string[]} spreadParamNames  - Names of spread/optSpread params
 * @property {boolean}  isDynamic
 * @property {boolean}  isSpread
 * @property {boolean}  isOptional
 * @property {number}   segmentCount
 */

/**
 * @typedef {Object} Manifest
 * @property {string}          generatedAt - ISO timestamp
 * @property {string}          version     - Manifest schema version
 * @property {string}          pagesDir    - The pagesDir option used to generate
 * @property {boolean}         caseSensitive
 * @property {number}          count
 * @property {ManifestEntry[]} routes
 */

/**
 * @typedef {Object} CliOptions
 * @property {string}  pagesDir
 * @property {string}  out
 * @property {boolean} caseSensitive
 * @property {boolean} dryRun
 * @property {boolean} verbose
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_VERSION = '2'; // Increment when the shape changes
const PAGE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const NOOP_LOADER = () => Promise.resolve({});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * @param {CliOptions} opts
 */
async function main(opts) {
  const start = performance.now();

  log(`\n🗂  Route manifest generator`);
  log(`   Pages dir : ${opts.pagesDir}`);
  log(`   Output    : ${opts.out}`);
  log(`   Options   : caseSensitive=${opts.caseSensitive} dryRun=${opts.dryRun}\n`);

  // ── 1. Discover page files ──────────────────────────────────────────────────
  const absPagesDir = path.resolve(ROOT, opts.pagesDir);
  const filePaths = await discoverPageFiles(absPagesDir, opts.pagesDir);

  if (filePaths.length === 0) {
    throw new Error(
      `No page files found in "${absPagesDir}".\n` +
        `Check --pages-dir and ensure pages exist with extensions: ${[...PAGE_EXTENSIONS].join(', ')}`,
    );
  }

  log(`   Found ${filePaths.length} candidate file(s)`);

  // ── 2. Parse each file path into a RouteRecord ─────────────────────────────
  //
  // We use fromFilePath with a no-op loader because the generate script only
  // needs route metadata — not the actual module contents. The loader is only
  // called at request time by the production router, not here.
  const { entries, errors } = parseFilePaths(filePaths, opts);

  if (errors.length > 0) {
    const detail = errors.map((e) => `  • ${e}`).join('\n');
    throw new Error(`Route parse failures (${errors.length}):\n${detail}`);
  }

  log(`   Parsed    ${entries.length} route(s)`);

  // ── 3. Detect collisions ────────────────────────────────────────────────────
  //
  // Collisions are always fatal in the generate script — the manifest should
  // never be written in an ambiguous state. The router also detects collisions
  // at startup, but catching them here gives a better error location (build
  // time vs runtime).
  const collisions = detectCollisions(entries);
  if (collisions.length > 0) {
    const detail = collisions.map((c) => `  • ${c}`).join('\n');
    throw new Error(`Route collision(s) detected (${collisions.length}):\n${detail}`);
  }

  // ── 4. Sort ─────────────────────────────────────────────────────────────────
  const sorted = sortEntries(entries);

  // ── 5. Assemble manifest ────────────────────────────────────────────────────
  /** @type {Manifest} */
  const manifest = {
    generatedAt: new Date().toISOString(),
    version: MANIFEST_VERSION,
    pagesDir: opts.pagesDir,
    caseSensitive: opts.caseSensitive,
    count: sorted.length,
    routes: sorted,
  };

  // ── 6. Print route table ────────────────────────────────────────────────────
  printRouteTable(sorted);

  // ── 7. Write (or dry-run) ───────────────────────────────────────────────────
  if (opts.dryRun) {
    log('\n⚠️  Dry run — manifest not written.\n');
  } else {
    await writeManifest(manifest, opts.out);
    const ms = (performance.now() - start).toFixed(1);
    log(`\n✅  Manifest written to "${opts.out}" in ${ms}ms\n`);
  }
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Recursively walk the pages directory and return Vite-style paths for all
 * files with a recognised page extension, excluding ignored files.
 *
 * Vite-style path format: /src/pages/blog/[id].tsx
 * (leading slash, relative to project root, forward slashes on all platforms)
 *
 * Uses a manual recursive walk rather than `{ recursive: true }` on readdir
 * because `dirent.path` (needed to reconstruct absolute paths from recursive
 * results) was only added in Node 20.1. This implementation works on Node 18+.
 *
 * @param {string} absPagesDir  - Absolute filesystem path to the pages directory
 * @param {string} relPagesDir  - Relative path from root, e.g. "src/pages"
 * @returns {Promise<string[]>} - Vite-style paths, sorted alphabetically
 */
async function discoverPageFiles(absPagesDir, relPagesDir) {
  const results = [];

  try {
    await walk(absPagesDir, results);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Pages directory not found: "${absPagesDir}"`);
    }
    throw err;
  }

  // Convert absolute paths to Vite-style paths: /src/pages/blog/[id].tsx
  return results.map((absFile) => '/' + path.relative(ROOT, absFile).replace(/\\/g, '/')).sort();
}

/**
 * Recursive directory walker. Appends absolute file paths to `out`.
 * Skips ignored files (_, ., .test., .spec.) before recursing into directories
 * to avoid descending into __tests__ or _drafts folders.
 *
 * @param {string}   dir - Absolute path of the directory to walk
 * @param {string[]} out - Accumulator for found file paths
 */
async function walk(dir, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue;

    const absPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(absPath, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (PAGE_EXTENSIONS.has(ext)) {
        out.push(absPath);
      }
    }
  }
}

/**
 * @param {string} filename - Basename of the file
 * @returns {boolean}
 */
function shouldIgnore(filename) {
  return (
    filename.startsWith('_') ||
    filename.startsWith('.') ||
    filename.includes('.test.') ||
    filename.includes('.spec.')
  );
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Call fromFilePath for every discovered file.
 * Collect parse errors rather than throwing immediately so the caller can
 * report all failures at once instead of one at a time.
 *
 * @param {string[]}   filePaths - Vite-style paths
 * @param {CliOptions} opts
 * @returns {{ entries: ManifestEntry[]; errors: string[] }}
 */
function parseFilePaths(filePaths, opts) {
  const entries = [];
  const errors = [];

  for (const filePath of filePaths) {
    try {
      const record = fromFilePath(filePath, NOOP_LOADER, {
        pagesDir: '/' + opts.pagesDir.replace(/^\//, '').replace(/\/$/, ''),
        caseSensitive: opts.caseSensitive,
      });

      entries.push(recordToEntry(record));
    } catch (err) {
      errors.push(`${filePath}: ${err.message}`);
    }
  }

  return { entries, errors };
}

/**
 * Convert a RouteRecord to a plain JSON-serialisable ManifestEntry.
 *
 * The mapping is exact and documented so that _loadProductionManifest
 * in router.js can be read alongside this function as a matching pair.
 *
 *   record.pattern.source  → patternSource   (RegExp is not JSON-serialisable)
 *   record.pattern.flags   → patternFlags
 *   [...record.spreadParams] → spreadParamNames (Set → Array)
 *
 * @param {import('../src/core/router/route-record.js').RouteRecord} record
 * @returns {ManifestEntry}
 */
function recordToEntry(record) {
  return {
    filePath: record.filePath,
    route: record.route,
    patternSource: record.pattern.source,
    patternFlags: record.pattern.flags,
    spreadParamNames: [...record.spreadParams],
    isDynamic: record.isDynamic,
    isSpread: record.isSpread,
    isOptional: record.isOptional,
    segmentCount: record.segmentCount,
  };
}

// ---------------------------------------------------------------------------
// Collision detection
// ---------------------------------------------------------------------------

/**
 * Detect structurally identical routes and semantic overlaps.
 *
 * Uses the same normalisation the router uses at runtime: strip named-group
 * identifiers from the pattern source before comparing. This means /[id] and
 * /[slug] are correctly identified as identical despite different param names.
 *
 * @param {ManifestEntry[]} entries
 * @returns {string[]} Collision descriptions
 */
function detectCollisions(entries) {
  const byStructure = new Map();
  const warnings = [];

  for (const entry of entries) {
    // Strip (?<name> → (?  so structural identity survives param renaming
    const sig = entry.patternSource.replace(/\?<[^>]+>/g, '?');

    if (byStructure.has(sig)) {
      const prev = byStructure.get(sig);
      warnings.push(
        `Exact collision: "${prev.route}" and "${entry.route}" match identical URLs\n` +
          `    ${prev.filePath}\n` +
          `    ${entry.filePath}`,
      );
    }
    byStructure.set(sig, entry);
  }

  // Semantic: does a static route's path also match a dynamic pattern?
  const statics = entries.filter((e) => !e.isDynamic);
  const dynamics = entries.filter((e) => e.isDynamic && !e.isSpread);

  for (const se of statics) {
    for (const de of dynamics) {
      if (se.route === de.route) continue;
      const pattern = new RegExp(de.patternSource, de.patternFlags);
      if (se.route.match(pattern)) {
        warnings.push(
          `Semantic collision: static "${se.route}" is also matched by dynamic "${de.route}"\n` +
            `    Static will win due to sort order — verify this is intentional`,
        );
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Sort routes with the same priority order as ViteRouter._sortRoutes:
 *   static > dynamic > spread
 *   more segments first within each tier
 *   alphabetical as tiebreaker
 *
 * The sort here must produce the same order as the router's sort so that
 * the manifest file represents the actual match priority.
 *
 * @param {ManifestEntry[]} entries
 * @returns {ManifestEntry[]}
 */
function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (!a.isDynamic && b.isDynamic) return -1;
    if (a.isDynamic && !b.isDynamic) return 1;
    if (!a.isSpread && b.isSpread) return -1;
    if (a.isSpread && !b.isSpread) return 1;

    if (a.segmentCount !== b.segmentCount) return b.segmentCount - a.segmentCount;

    return a.route.localeCompare(b.route);
  });
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/**
 * Write the manifest JSON atomically.
 *
 * Atomic write strategy: write to a `.tmp` file first, then rename.
 * rename() is atomic on POSIX — if the process dies mid-write, the
 * existing manifest is never corrupted. On Windows, rename() over an
 * existing file is also atomic since Node 12.
 *
 * @param {Manifest} manifest
 * @param {string}   outPath
 */
async function writeManifest(manifest, outPath) {
  const absOut = path.resolve(ROOT, outPath);
  const tmpOut = absOut + '.tmp';

  // Ensure the output directory exists
  await fs.mkdir(path.dirname(absOut), { recursive: true });

  const json = JSON.stringify(manifest, null, 2);

  await fs.writeFile(tmpOut, json, 'utf-8');
  await fs.rename(tmpOut, absOut);
}

/**
 * Print a human-readable route table to stdout.
 *
 * @param {ManifestEntry[]} entries
 */
function printRouteTable(entries) {
  const COL = { route: 38, type: 10, segs: 5, params: 20 };
  const hr = '─'.repeat(Object.values(COL).reduce((a, b) => a + b + 3, 0));

  log('\n   Route table (in match priority order):');
  log(
    `   ${'Route'.padEnd(COL.route)} ${'Type'.padEnd(COL.type)} ${'Segs'.padEnd(COL.segs)} Params`,
  );
  log('   ' + hr);

  for (const e of entries) {
    const type = e.isSpread ? 'spread' : e.isDynamic ? 'dynamic' : 'static';
    const params = e.spreadParamNames.length > 0 ? `[...${e.spreadParamNames.join(', ...')}]` : '';

    const route = e.route.padEnd(COL.route);
    const t = type.padEnd(COL.type);
    const s = String(e.segmentCount).padEnd(COL.segs);

    log(`   ${route} ${t} ${s} ${params}`);
  }

  log('');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Parse process.argv arguments into an options object.
 * Supports both --flag=value and --flag value forms.
 *
 * @param {string[]} args
 * @returns {CliOptions}
 */
function parseArgs(args) {
  const opts = {
    pagesDir: 'src/pages',
    out: 'dist/server/route-manifest.json',
    caseSensitive: true,
    dryRun: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      opts.dryRun = true;
      continue;
    }
    if (arg === '--case-insensitive') {
      opts.caseSensitive = false;
      continue;
    }
    if (arg === '--verbose') {
      opts.verbose = true;
      continue;
    }

    const [key, val] = arg.startsWith('--') ? arg.slice(2).split('=') : [];
    const value = val ?? args[++i];

    if (key === 'pages-dir') {
      opts.pagesDir = value;
      continue;
    }
    if (key === 'out') {
      opts.out = value;
      continue;
    }

    console.warn(`Unknown argument: ${arg}`);
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

function log(msg) {
  process.stdout.write(msg + '\n');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function run() {
  try {
    await main(parseArgs(process.argv.slice(2)));
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

run();
