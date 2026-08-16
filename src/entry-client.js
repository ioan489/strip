// /**
//  * entry-client.js — Client-side bootstrapper
//  *
//  * This is the only script that loads unconditionally on every page.
//  * As a <script type="module"> it is deferred automatically by the browser.
//  *
//  * Responsibilities:
//  *  1. Read the per-page script registry injected by head-builder.js
//  *  2. Import critical controller modules first (parallel), then deferred
//  *  3. Hand off to the controller manager (your island engine) to attach
//  *     controllers to their [data-js-controller] DOM nodes
//  *
//  * Module map:
//  *   The registry lists controller paths as strings. Dynamic import() in the
//  *   browser cannot take arbitrary strings (it resolves relative to the module
//  *   URL), so we maintain an explicit map from path → import function.
//  *   In production, Vite replaces these with the hashed chunk URLs.
//  *
//  *   Add a new entry here whenever you create a new controller.
//  */

// // ---------------------------------------------------------------------------
// // Module map
// // ---------------------------------------------------------------------------
// //
// // Keys must exactly match the `src` values declared in component asset metadata.
// // Values are arrow functions wrapping dynamic imports so the module is NOT
// // loaded until explicitly requested.

// const MODULE_MAP = {
//   '/src/controllers/SiteHeader.js': () => import('./controllers/SiteHeader.js'),
//   '/src/controllers/HeroSection.js': () => import('./controllers/HeroSection.js'),
//   '/src/controllers/SiteFooter.js': () => import('./controllers/SiteFooter.js'),
//   // Add more controllers here as you build them
// };

// // ---------------------------------------------------------------------------
// // Bootstrap
// // ---------------------------------------------------------------------------

// (async () => {
//   const registryEl = document.querySelector('[data-js-script-registry]');
//   if (!registryEl) return; // page has no interactive components

//   /** @type {{ path: string; critical: boolean }[]} */
//   let registry;
//   try {
//     registry = JSON.parse(registryEl.textContent);
//   } catch (err) {
//     console.error('[Bootstrapper] Failed to parse script registry:', err);
//     return;
//   }

//   const critical = registry.filter((s) => s.critical);
//   const deferred = registry.filter((s) => !s.critical);

//   // Load critical modules first — these are needed for above-the-fold interactivity
//   await loadModules(critical);

//   // Start the controller manager as soon as critical modules are ready.
//   // Your controller manager implementation goes here.
//   // Example: controllerManager.start();
//   startControllers();

//   // Load deferred modules without blocking — below-the-fold islands
//   loadModules(deferred).catch((err) => {
//     console.error('[Bootstrapper] Failed to load deferred modules:', err);
//   });
// })();

// // ---------------------------------------------------------------------------
// // Internals
// // ---------------------------------------------------------------------------

// /**
//  * Import a list of modules in parallel. Logs warnings for unknown paths
//  * rather than throwing — a missing controller shouldn't crash the page.
//  *
//  * @param {{ path: string }[]} entries
//  * @returns {Promise<void>}
//  */
// async function loadModules(entries) {
//   await Promise.all(
//     entries.map(({ path }) => {
//       const importFn = MODULE_MAP[path];
//       if (!importFn) {
//         console.warn(`[Bootstrapper] No module map entry for: ${path}`);
//         return Promise.resolve();
//       }
//       return importFn().catch((err) => {
//         console.error(`[Bootstrapper] Failed to load module ${path}:`, err);
//       });
//     }),
//   );
// }

// /**
//  * Start the controller manager.
//  *
//  * Replace this stub with your actual controller engine implementation.
//  * The engine should scan the DOM for [data-js-controller] attributes
//  * and instantiate the matching registered controller class for each node.
//  */
// function startControllers() {
//   // Your controller manager start call goes here.
//   // e.g.: controllerManager.start();
//   if (typeof window.__controllerManager !== 'undefined') {
//     window.__controllerManager.start();
//   }
// }
