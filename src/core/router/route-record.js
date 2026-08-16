import { parseSegment, segmentToString } from './segment.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {import('./segment.js').Segment} Segment
 */

/**
 * A fully-compiled, frozen route descriptor.
 *
 * @typedef {Object} RouteRecord
 * @property {string}     route        - Canonical URL string e.g. "/blog/[id]" (display/debug)
 * @property {RegExp}     pattern      - Named-group RegExp; match against normalised pathname
 * @property {Set<string>} spreadParams - Param names whose matched value must be split on '/'
 *                                        Covers both 'spread' and 'optSpread' types.
 *                                        All other matched named groups are plain strings.
 * @property {boolean}    isDynamic    - Has at least one non-static URL segment
 * @property {boolean}    isSpread     - Has a required or optional catch-all
 * @property {boolean}    isOptional   - Has at least one optional segment
 * @property {number}     segmentCount - URL-visible segment count; used for sort priority
 * @property {Function}   loader       - Async fn that returns the route's ES module
 * @property {string}     filePath     - Source file path; used as cache key and in diagnostics
 */

/**
 * @typedef {Object} RouteRecordOptions
 * @property {string}  [pagesDir='/src/pages'] - Directory prefix to strip from filePath
 * @property {boolean} [caseSensitive=true]     - When false adds the 'i' flag to the RegExp
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIN_SEP_RE = /\\/g;
const FILE_EXT_RE = /\.(js|jsx|ts|tsx|mjs|cjs)$/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a file path + loader into a frozen RouteRecord.
 *
 * Validates inputs eagerly so misconfigurations surface at startup,
 * not at the moment a route is first matched under load.
 *
 * @param {string}           filePath
 * @param {Function}         loader
 * @param {RouteRecordOptions} [options]
 * @returns {Readonly<RouteRecord>}
 */
export function fromFilePath(filePath, loader, options = {}) {
  // ── Input validation ──────────────────────────────────────────────────────

  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new TypeError(
      `fromFilePath: "filePath" must be a non-empty string, got ${JSON.stringify(filePath)}`,
    );
  }
  if (typeof loader !== 'function') {
    throw new TypeError(
      `fromFilePath: "loader" must be a function, got ${typeof loader} for "${filePath}"`,
    );
  }

  const { pagesDir = '/src/pages', caseSensitive = true } = options;

  // ── Normalise filePath → raw route string ─────────────────────────────────

  // Windows CI uses backslashes; normalise before any split or replace
  const normalised = filePath.replace(WIN_SEP_RE, '/');

  let routePath = normalised
    .replace(new RegExp(`^${_escapeRegex(pagesDir)}`), '')
    .replace(FILE_EXT_RE, '');

  // /about/index → /about  |  /index → '' → '/'
  if (routePath.endsWith('/index')) routePath = routePath.slice(0, -6);
  if (routePath === '') routePath = '/';

  // ── Parse segments ────────────────────────────────────────────────────────

  const rawSegments = routePath === '/' ? [] : routePath.split('/').filter(Boolean);

  let allSegments;
  try {
    allSegments = rawSegments.map((seg) => parseSegment(seg, filePath));
  } catch (err) {
    throw new Error(`fromFilePath ("${filePath}"): ${err.message}`, { cause: err });
  }

  // URL-visible segments — route groups have no URL representation
  const urlSegments = allSegments.filter((s) => s.type !== 'group');

  // ── Structural validation ─────────────────────────────────────────────────
  //
  // Catch authoring mistakes at build time, not at request time.

  _validateSegments(urlSegments, filePath);

  // ── Canonical route string ────────────────────────────────────────────────
  //
  // Reconstruct from urlSegments — not from routePath — so that group
  // segments (stripped above) can never appear in the route string.

  const route = urlSegments.length === 0 ? '/' : '/' + urlSegments.map(segmentToString).join('/');

  // ── Named-group RegExp ────────────────────────────────────────────────────

  const pattern = _buildPattern(urlSegments, caseSensitive);

  // ── Spread param registry ─────────────────────────────────────────────────
  //
  // When extracting params from match.groups, spread and optSpread values
  // are raw strings like "a/b/c" that need splitting into arrays.
  // Rather than inspecting the route structure at match-time, we pre-compute
  // which param names need that treatment.

  const spreadParams = new Set(
    urlSegments.filter((s) => s.type === 'spread' || s.type === 'optSpread').map((s) => s.name),
  );

  // ── Derived flags ─────────────────────────────────────────────────────────

  const isDynamic = urlSegments.some((s) => s.type !== 'static');
  const isSpread = urlSegments.some((s) => s.type === 'spread' || s.type === 'optSpread');
  const isOptional = urlSegments.some((s) => s.type === 'optional' || s.type === 'optSpread');

  // Freeze so the record can be safely shared across requests
  return Object.freeze({
    route,
    pattern,
    spreadParams,
    isDynamic,
    isSpread,
    isOptional,
    segmentCount: urlSegments.length,
    loader,
    filePath,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validate structural constraints on the URL-visible segments of a route.
 * These rules are enforced at record-creation time rather than match-time.
 *
 * Rule 1 — Catch-all must be last.
 *   Spread / optSpread segment must be the final URL segment.
 *   A catch-all mid-route makes any subsequent segments unreachable.
 *
 * Rule 2 — No duplicate param names.
 *   Named capture groups in a RegExp must be unique. Duplicates cause a
 *   SyntaxError at pattern construction; better to report it clearly here.
 *
 * @param {Segment[]} urlSegments
 * @param {string}    filePath
 */
function _validateSegments(urlSegments, filePath) {
  const ctx = `"${filePath}"`;

  // Rule 1
  for (let i = 0; i < urlSegments.length - 1; i++) {
    const seg = urlSegments[i];
    if (seg.type === 'spread' || seg.type === 'optSpread') {
      const remaining = urlSegments.length - 1 - i;
      throw new Error(
        `Route error in ${ctx}: catch-all segment "${segmentToString(seg)}" ` +
          `must be the last segment but has ${remaining} segment(s) after it.`,
      );
    }
  }

  // Rule 2
  const seen = new Set();
  for (const seg of urlSegments) {
    if (seg.type === 'static' || seg.type === 'group') continue;
    if (seen.has(seg.name)) {
      throw new Error(
        `Route error in ${ctx}: duplicate param name "${seg.name}". ` +
          `Every param in a route must have a unique name.`,
      );
    }
    seen.add(seg.name);
  }
}

/**
 * Build a URL-matching RegExp from URL-visible segments using named capture groups.
 *
 * Named groups make the RegExp self-describing — match.groups already contains
 * the correct param names, with no need for a separate positional mapping array.
 *
 * Segment → pattern contribution
 * ────────────────────────────────────────────────────────────────────────────
 *  static    'about'        /about
 *  dynamic   '[id]'         /(?<id>[^/]+)       one non-slash segment, required
 *  spread    '[...slug]'    /(?<slug>.+)         one or more chars incl. '/', required
 *  optional  '[[page]]'     (?:/(?<page>[^/]+))? slash + segment both optional
 *  optSpread '[[...slug]]'  (?:/(?<slug>.*))?    slash + everything optional
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Why spread uses (.+) and not (.*):
 *   Required spread must match at least one character after its separator.
 *   Zero-or-more semantics belong to optSpread, which wraps the separator
 *   in the optional group so the entire thing can be absent.
 *
 * Why optional segments wrap the slash inside the optional group:
 *   (?:/(?<page>[^/]+))? ensures that /blog and /blog/2 both match
 *   a route defined as /blog/[[page]], because the separator / is
 *   only present when the optional content is present.
 *
 * @param {Segment[]} urlSegments
 * @param {boolean}   caseSensitive
 * @returns {RegExp}
 */
function _buildPattern(urlSegments, caseSensitive) {
  const flags = caseSensitive ? '' : 'i';

  if (urlSegments.length === 0) {
    return new RegExp('^/$', flags);
  }

  let str = '';

  for (const seg of urlSegments) {
    switch (seg.type) {
      case 'static':
        str += '/' + _escapeRegex(seg.value);
        break;

      case 'dynamic':
        str += `/(?<${seg.name}>[^/]+)`;
        break;

      case 'spread':
        str += `/(?<${seg.name}>.+)`;
        break;

      case 'optional':
        str += `(?:/(?<${seg.name}>[^/]+))?`;
        break;

      case 'optSpread':
        // Build with concatenation to avoid any whitespace from template literals.
        // Pattern: (?:/(?<name>.*))?
        //   - The outer (?:...)? makes both the slash and the capture optional.
        //   - (.*) allows zero or more characters (including none), because the
        //     URL normaliser already strips trailing slashes, so an empty match
        //     after the slash is not reachable in practice.
        str += '(?:/(?<' + seg.name + '>.*))' + '?';
        break;

      default:
        // Forward-compatible: unknown future types contribute nothing
        break;
    }
  }

  return new RegExp(`^${str}$`, flags);
}

/** @param {string} str */
function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
