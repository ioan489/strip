/**
 * component.js
 *
 * defineComponent — the single way to declare a component in this system.
 *
 * What it does:
 *  1. Wraps the render function so that every time it is called, its declared
 *     CSS and JS assets are registered in the current render context.
 *  2. Attaches `.assets`, `.css`, `.js`, and `.displayName` to the wrapper
 *     for introspection (used by layouts, testing, and the build manifest).
 *  3. Returns a function with the same signature as the original — the rest
 *     of your code never needs to know about the asset system.
 *
 * Convention:
 *  - CSS assets use Vite-resolvable paths:  /src/components/Foo/Foo.css
 *  - JS  assets are controller paths:       /src/controllers/Foo.js
 *    These paths must match keys in entry-client.js's module map.
 *  - `critical: true`  → included in initial page load (blocks FCP)
 *  - `critical: false` → deferred; loaded after the critical path
 *
 * Usage:
 *   import { defineComponent } from '../lib/component.js';
 *   import { html }            from '../lib/html.js';
 *
 *   export const HeroSection = defineComponent(
 *     function HeroSection({ headline, subline }) {
 *       return html`
 *         <section class="HeroSection" data-js-controller="HeroSection">
 *           <h1>${headline}</h1>
 *           <p>${subline}</p>
 *         </section>
 *       `;
 *     },
 *     {
 *       css: [{ src: '/src/components/HeroSection/HeroSection.css', critical: true }],
 *       js:  [{ src: '/src/controllers/HeroSection.js', critical: false }],
 *     }
 *   );
 */

import { addAssets } from './render-context.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./render-context.js').Asset} Asset
 */

/**
 * @typedef {Object} ComponentAssetDeclaration
 * @property {{ src: string; critical: boolean; content?: string }[]} [css]
 *   css[].content — the processed CSS string from a Vite `?inline` import.
 *   Add it when you want the CSS to go through Vite's full pipeline and be
 *   inlined as a <style> tag in production. Example in a component file:
 *
 *     import styles from './MyComponent.css?inline';
 *     defineComponent(fn, { css: [{ src: '...', critical: true, content: styles }] })
 *
 * @property {{ src: string; critical: boolean }[]} [js]
 */

/**
 * @template Props
 * @typedef {Object} ComponentFunction
 * @property {string}  displayName
 * @property {Asset[]} assets       - All CSS + JS assets for this component
 * @property {Asset[]} css          - CSS assets only
 * @property {Asset[]} js           - JS  assets only
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Define a component with its associated static assets.
 *
 * @template Props
 * @param {(props: Props) => import('./html.js').RawHtml} fn
 * @param {ComponentAssetDeclaration} [declaration]
 * @returns {((props: Props) => import('./html.js').RawHtml) & ComponentFunction<Props>}
 */
export function defineComponent(fn, declaration = {}) {
  const cssAssets = (declaration.css ?? []).map((a) => ({
    ...a,
    type: /** @type {'css'} */ ('css'),
  }));
  const jsAssets = (declaration.js ?? []).map((a) => ({ ...a, type: /** @type {'js'}  */ ('js') }));
  const allAssets = [...cssAssets, ...jsAssets];

  /**
   * The wrapped component function.
   * Registers assets in the active render context, then delegates to `fn`.
   *
   * @param {Props} props
   * @returns {import('./html.js').RawHtml}
   */
  function component(props) {
    // addAssets is a no-op when called outside a render context (e.g. tests)
    addAssets(allAssets);
    return fn(props);
  }

  // Preserve the original function name for stack traces and DevTools
  Object.defineProperty(component, 'name', { value: fn.name, configurable: true });

  // Attach metadata for introspection by layouts, manifests, and tests
  component.displayName = fn.name;
  component.assets = allAssets;
  component.css = cssAssets;
  component.js = jsAssets;

  return component;
}
