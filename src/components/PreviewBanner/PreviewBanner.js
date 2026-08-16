/**
 * PreviewBanner/PreviewBanner.js
 *
 * A fixed banner rendered at the top of every page when preview mode is
 * active. Serves two purposes:
 *
 *  1. Makes it immediately obvious you are viewing draft content.
 *  2. Provides an exit link that clears the preview cookie/param.
 *
 * This component is NOT registered with defineComponent because it is
 * conditionally rendered by the layout — it has no corresponding
 * controller and needs no CSS file (styles are inline for isolation).
 */

import { html } from '../../lib/html.js';

/**
 * @param {{ exitHref?: string }} [props]
 * @returns {import('../../lib/html.js').RawHtml}
 */
export function PreviewBanner({ exitHref = '?preview=false' } = {}) {
  return html`
    <div
      id="preview-banner"
      role="status"
      aria-label="Preview mode active"
      style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        background: #635bff;
        color: #fff;
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 0.8125rem;
        font-weight: 600;
        letter-spacing: 0.02em;
        padding: 0.375rem 1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      ">
      <span> ⚡ PREVIEW MODE — You are viewing unpublished draft content. </span>
      <a
        href="${exitHref}"
        style="
          color: rgba(255,255,255,0.85);
          text-decoration: underline;
          font-weight: 500;
          white-space: nowrap;
        "
        >Exit preview</a
      >
    </div>

    <!-- Push page content below the fixed banner -->
    <div style="height: 2rem;" aria-hidden="true"></div>
  `;
}
