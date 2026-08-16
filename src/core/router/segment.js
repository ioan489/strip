/**
 * segment.js
 *
 * The single source of truth for what a route segment is, how it is parsed
 * from a file-system path fragment, and how it is serialized back to a string.
 *
 * Supported syntax
 * ─────────────────────────────────────────────────────────────
 *  File segment     Type        URL presence        Notes
 * ─────────────────────────────────────────────────────────────
 *  about            static      /about
 *  (group)          group       (none)              layout grouping only
 *  [param]          dynamic     /:value             one segment, required
 *  [...slug]        spread      /:a/:b/:c           one or more, required
 *  [[param]]        optional    /:value or nothing  one segment, optional
 *  [[...slug]]      optSpread   /:a/:b or nothing   zero or more, optional
 * ─────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {'static'|'group'|'dynamic'|'spread'|'optional'|'optSpread'} SegmentType
 */

/**
 * @typedef {Object} Segment
 * @property {SegmentType} type
 * @property {string}      [value] - Populated for 'static' and 'group'
 * @property {string}      [name]  - Populated for 'dynamic', 'spread', 'optional', 'optSpread'
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Valid JS identifier: first char must be letter, _ or $;
 * subsequent chars may also include digits.
 *
 * This is stricter than the original /^[a-zA-Z0-9_$]+$/ which
 * incorrectly allowed names starting with a digit (e.g. "0param").
 */
const PARAM_NAME_RE = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/** Matches a route-group segment like (auth) or (marketing) */
const ROUTE_GROUP_RE = /^\(([^)]+)\)$/;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * @param {string}  name    - Extracted parameter name
 * @param {string}  raw     - Original file segment, e.g. "[0bad]"
 * @param {string}  [source] - Source file path for richer error messages
 */
function assertParamName(name, raw, source) {
  if (!PARAM_NAME_RE.test(name)) {
    const where = source ? ` in "${source}"` : '';
    throw new Error(
      `Invalid param name "${name}" in segment "${raw}"${where}. ` +
        `Param names must be valid JS identifiers: start with a letter, _ or $, ` +
        `followed by letters, digits, _ or $.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a single file-system path segment into a typed Segment descriptor.
 *
 * Patterns are tested from most-specific to least-specific to avoid
 * misclassification — e.g. "[[...slug]]" must be checked before "[[slug]]",
 * and "[...slug]" before "[slug]".
 *
 * @param {string}  raw     - A single path segment, e.g. "[id]" or "[[...slug]]"
 * @param {string}  [source] - Source file path; used only in error messages
 * @returns {Segment}
 */
export function parseSegment(raw, source) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new TypeError(`parseSegment: expected a non-empty string, got ${JSON.stringify(raw)}`);
  }

  // ── Optional catch-all: [[...name]] ───────────────────────────────────────
  if (raw.startsWith('[[...') && raw.endsWith(']]')) {
    const name = raw.slice(5, -2);
    assertParamName(name, raw, source);
    return { type: 'optSpread', name };
  }

  // ── Optional single param: [[name]] ──────────────────────────────────────
  if (raw.startsWith('[[') && raw.endsWith(']]')) {
    const name = raw.slice(2, -2);
    assertParamName(name, raw, source);
    return { type: 'optional', name };
  }

  // ── Required catch-all: [...name] ────────────────────────────────────────
  if (raw.startsWith('[...') && raw.endsWith(']')) {
    const name = raw.slice(4, -1);
    assertParamName(name, raw, source);
    return { type: 'spread', name };
  }

  // ── Dynamic single param: [name] ─────────────────────────────────────────
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const name = raw.slice(1, -1);
    assertParamName(name, raw, source);
    return { type: 'dynamic', name };
  }

  // ── Route group: (name) ───────────────────────────────────────────────────
  const groupMatch = raw.match(ROUTE_GROUP_RE);
  if (groupMatch) {
    return { type: 'group', value: groupMatch[1] };
  }

  // ── Static segment ────────────────────────────────────────────────────────
  return { type: 'static', value: raw };
}

/**
 * Convert a Segment back to its file-system string representation.
 *
 * This is the exact inverse of parseSegment — round-trip safe:
 *   parseSegment(segmentToString(seg)) deep-equals `seg`
 *
 * Used internally to reconstruct canonical route strings from parsed parts,
 * which guarantees group segments are always stripped from the URL.
 *
 * @param {Segment} segment
 * @returns {string}
 */
export function segmentToString(segment) {
  switch (segment.type) {
    case 'static':
      return segment.value;
    case 'group':
      return `(${segment.value})`;
    case 'dynamic':
      return `[${segment.name}]`;
    case 'spread':
      return `[...${segment.name}]`;
    case 'optional':
      return `[[${segment.name}]]`;
    case 'optSpread':
      return `[[...${segment.name}]]`;
    default:
      throw new Error(
        `segmentToString: unknown segment type "${segment.type}". ` +
          `Expected one of: static, group, dynamic, spread, optional, optSpread.`,
      );
  }
}
