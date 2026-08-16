/**
 * pages/index.js — Home page
 *
 * This file demonstrates the complete page authoring pattern:
 *
 *  export const meta       — static page metadata (title, description, og tags)
 *  export getServerData    — optional server-side data fetching (like getServerSideProps)
 *  export default          — the page render function; returns a LayoutResult
 *
 * The page function:
 *  - Imports only the components it uses
 *  - Calls Layout() with its content as `children`
 *  - Does NOT manage assets — defineComponent + AsyncLocalStorage handles that
 *  - Does NOT write <html>, <head>, or <body> — that is the shell's job
 *
 * The returned { html, head } is consumed by server.js → handlePageRoute,
 * which passes it to entry-server.js → render(), which injects it into index.html.
 */

import { Layout } from '../layouts/_layout.js';
import { html } from '../lib/html.js';
import { content, renderBlock } from '../content/runtime.js';

// ---------------------------------------------------------------------------
// Server-side data fetching
// ---------------------------------------------------------------------------
//
// Runs on the server before the page renders.
// Receives { req, params } — return anything the page template needs.
// Equivalent to Next.js getServerSideProps.

export async function getServerData() {
  const page = await content.page('payments');
  return { page };
}

// ---------------------------------------------------------------------------
// Page render function
// ---------------------------------------------------------------------------

/**
 * @param {{ params: Record<string,string>; serverData: Awaited<ReturnType<typeof getServerData>> }} props
 * @returns {import('../layouts/_layout.js').LayoutResult}
 */
export default async function HomePage({ serverData }) {
  const { page } = serverData;

  return Layout({
    meta: page.meta,
    // Pass children as a function so component execution is deferred.
    // The Layout calls children() at the right moment — after registering
    // global (base.css, typography.css) and layout component (SiteHeader)
    // assets. Without the function wrapper, HeroSection and FeatureGrid would
    // run — and register their CSS — before Layout() is even called, putting
    // page styles before global styles in the <head>.
    children: () => html` ${page.blocks.map((block) => renderBlock(block))} `,
  });
}
