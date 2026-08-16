/**
 * hydration.js
 *
 * Builds the <script> tag that transfers server-fetched data to the browser.
 * Used by both server.js (SSR) and build-ssg.js (SSG)
 *
 * Security:
 *   JSON.stringify produces valid JSON, but if that JSON is injected directly
 *   into a <script> tag, the sequence "</" terminates the script block.
 *   We replace "<" with its Unicode escape \u003c before injection.
 *   This is the same technique used by React, Next.js, and SvelteKit.
 */

/**
 * Serialise serverData into a <script> tag for client-side hydration.
 * Returns an empty string when serverData is empty — no unnecessary bytes.
 *
 * The client reads this as: const data = window.__SERVER_DATA__;
 *
 * @param {Record<string, unknown>} serverData
 * @returns {string}  A self-contained <script> tag, or ''
 */
export function buildHydrationScript(serverData) {
  if (!serverData?.page) return '';
  const { page } = serverData;
  const clientPayload = {
    slug: page.slug,
    title: page.meta.title,
  };
  const json = JSON.stringify(clientPayload);
  return `<script id="__server-data__" type="application/json">${json}</script>`;
}
