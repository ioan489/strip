/**
 * vite.config.js
 *
 * Standard Vite configuration for this SSR project.
 * The only non-standard addition is ssrHmrPlugin, which handles
 * automatic browser refresh when server-side files change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import { ssrHmrPlugin } from './plugins/ssr-hmr.js';

// ---------------------------------------------------------------------------
// Page discovery (SSR build only)
// ---------------------------------------------------------------------------
//
// The SSR build entry point is src/entry-server.js, which does NOT statically
// import any page files. Pages are loaded at runtime via dynamic import() in
// _buildProdLoader. Because they are not in the static dependency graph,
// Vite's SSR build would never include them — you'd get only entry-server.js.
//
// Solution: list every page file as an additional Rollup entry point.
// Rollup then includes each page (and its unique dependencies) in the output,
// while shared dependencies (src/lib/*.js) are deduplicated and written once.
//
// findPages() does the same filtering as generate-routes.js so the two stay
// in sync: it skips _ prefixed files, dot files, and test/spec files.

const PAGE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);

function findPages(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip the same files the router ignores
    if (entry.name.startsWith('_')) continue;
    if (entry.name.startsWith('.')) continue;
    if (entry.name.includes('.test.')) continue;
    if (entry.name.includes('.spec.')) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findPages(fullPath));
    } else if (PAGE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

export default defineConfig(({ isSsrBuild = false }) => ({
  plugins: [
    /**
     * Sends full-reload to the browser when any SSR-relevant file changes.
     * Without this, file changes are processed by the server (Vite correctly
     * invalidates its SSR module graph) but the browser never knows to reload.
     *
     * verbose: true logs which file triggered each reload — useful when
     * diagnosing unexpected reloads during development.
     */
    ssrHmrPlugin({
      verbose: true,
      watchDirs: [
        '/src/pages/',
        '/src/layouts/',
        '/src/components/',
        '/src/lib/',
        '/src/content/',
        '/src/domain/',
      ],
    }),
  ],

  // Build configuration
  build: {
    // Output directory differs between client and SSR builds.
    // Vite sets isSsrBuild = true when invoked with --ssr.
    //   npm run build:client  →  vite build                          → dist/client/
    //   npm run build:server  →  vite build --ssr src/entry-server.js → dist/server/
    outDir: isSsrBuild ? 'dist/server' : 'dist/client',

    // Emit a manifest.json for the client build only.
    // This lets the SSR render function reference hashed asset filenames.
    manifest: !isSsrBuild,

    rollupOptions: isSsrBuild
      ? {
          input: [
            // Absolute paths are required on Windows.
            // path.resolve() uses process.cwd() which is the project root
            // when the build command is run from there (standard).
            path.resolve('src/entry-server.js'),
            ...findPages(path.resolve('src/pages')),
          ],

          output: {
            // preserveModules keeps each source module as its own file in dist/server/.
            // Without it, vite build --ssr produces one bundle (entry-server.js only),
            // so _buildProdLoader cannot import individual page files at runtime.
            //
            // preserveModulesRoot:'src' strips the leading src/ from output paths:
            //   src/pages/index.js  -> dist/server/pages/index.js
            //   src/entry-server.js -> dist/server/entry-server.js
            //
            // _buildProdLoader is updated to strip the Vite-style /src/ prefix
            // from filePaths before joining with dist/server/ so both sides agree.
            preserveModules: true,
            preserveModulesRoot: 'src',

            // Explicit .js extension for all output files.
            // Without this, Rollup might emit .mjs for ES module output.
            entryFileNames: '[name].js',
            chunkFileNames: '[name].js',
          },
        }
      : {},
  },
}));
