/**
 * html.js — Tagged template literal for safe HTML generation
 *
 * Design contract:
 *  - Every interpolated value is HTML-escaped by default (XSS-safe)
 *  - Components that use `html` return RawHtml — safe to nest with no re-escaping
 *  - `raw()` wraps a trusted string to opt out of escaping
 *  - Arrays are flattened and joined (enables .map() patterns inline)
 *  - null / undefined → empty string  |  boolean → empty string (JSX convention)
 *  - Numbers render as-is (0 → "0", not suppressed)
 *
 * Usage:
 *   import { html, raw, renderToString } from '../lib/html.js';
 *
 *   function Button({ label, href }) {
 *     return html`<a class="btn" href="${href}">${label}</a>`;
 *   }
 *
 *   // Nest components — no `raw()` needed because html tag returns RawHtml
 *   function Card({ title, children }) {
 *     return html`<div class="card"><h2>${title}</h2>${children}</div>`;
 *   }
 *
 *   // Trusted external HTML (e.g. from a CMS rich-text field)
 *   function Article({ bodyHtml }) {
 *     return html`<article>${raw(bodyHtml)}</article>`;
 *   }
 */

// ---------------------------------------------------------------------------
// RawHtml — the safe-HTML marker type
// ---------------------------------------------------------------------------

/**
 * A value of this type has been either produced by the `html` tag (and is
 * therefore already escaped) or explicitly wrapped in `raw()` (and is
 * therefore trusted by the caller). It will not be escaped again if
 * interpolated into another `html` template.
 */
export class RawHtml {
  /** @type {string} */
  #value;

  /** @param {unknown} value */
  constructor(value) {
    this.#value = value == null ? '' : String(value);
  }

  toString() {
    return this.#value;
  }
  valueOf() {
    return this.#value;
  }

  /** Number of characters in the rendered string. */
  get length() {
    return this.#value.length;
  }
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape a value for safe insertion into HTML text or attribute content.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value).replace(ESCAPE_RE, (c) => ESCAPE_MAP[c]);
}

// ---------------------------------------------------------------------------
// Value interpolation
// ---------------------------------------------------------------------------

/**
 * Recursively process a single interpolated template value.
 *
 * @param {unknown} value
 * @returns {string}
 */
function interpolate(value) {
  if (value == null) return '';
  if (value instanceof RawHtml) return value.toString();
  if (Array.isArray(value)) return value.map(interpolate).join('');
  if (typeof value === 'boolean') return ''; // false / true → nothing (JSX convention)
  if (typeof value === 'number') return String(value); // 0, 3.14, etc.
  return escapeHtml(String(value));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tagged template literal for composing HTML safely.
 *
 * All interpolated values are HTML-escaped unless they are already RawHtml
 * (produced by another `html` call or wrapped in `raw()`).
 *
 * Returns a RawHtml instance so it can be freely nested without double-escaping.
 *
 * @param {TemplateStringsArray} strings
 * @param {...unknown}           values
 * @returns {RawHtml}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += interpolate(values[i]) + strings[i + 1];
  }
  return new RawHtml(out);
}

/**
 * Mark a string as trusted HTML — it will not be escaped when interpolated.
 *
 * Use only for values you control or have already sanitised.
 * For user-generated content, sanitise with a dedicated library first.
 *
 * @param {unknown} value
 * @returns {RawHtml}
 */
export function raw(value) {
  if (value instanceof RawHtml) return value; // already safe — no-op
  return new RawHtml(value == null ? '' : String(value));
}

/** Alias for `raw` — pick whichever name reads better at the call site. */
export const unsafe = raw;

/**
 * Convert a RawHtml (or any value) to a plain string.
 *
 * Call this at the top of your render pipeline to produce the final HTML
 * string that goes into the HTTP response.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function renderToString(value) {
  if (value instanceof RawHtml) return value.toString();
  return String(value ?? '');
}
