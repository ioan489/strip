/**
 * Maps error codes to HTTP status codes.
 *
 * Only add entries here when you are certain a domain code should always
 * produce a specific HTTP status. When in doubt, let it be 500.
 */
const CONTENT_CODE_TO_STATUS = Object.freeze({
  page_not_found: 404,
  content_not_found: 404,
  invalid_argument: 400,
  content_validation_failed: 422,
  // 500s are intentionally absent — unknown = internal error = 500 is correct.
});

/**
 * Whether an error looks like a ContentError.
 *
 * Uses duck-typing instead of instanceof because in Vite SSR the error is
 * constructed inside Vite's module sandbox and server.js loads this mapper
 * through Node's native module system. They are different class instances,
 * so instanceof always returns false across that boundary.
 *
 * A ContentError always has:
 *   - name: 'ContentError' or a subclass name
 *   - code: a string from ContentErrorCode
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isContentError(err) {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof err.code === 'string' &&
    (err.name === 'ContentError' || err.name === 'ContentValidationError')
  );
}

/**
 * Resolves the HTTP status code for any error.
 *
 * Priority:
 *  1. err.status — set explicitly by application code (e.g. 404 on a route)
 *  2. Domain error code mapping
 *  3. 500 — default for anything unexpected
 *
 * @param {unknown} err
 * @returns {number}
 */
export function resolveHttpStatus(err) {
  if (Number.isInteger(err?.status)) return err.status;

  if (isContentError(err)) {
    return CONTENT_CODE_TO_STATUS[err.code] ?? 500;
  }

  return 500;
}

/**
 * Operational errors are known, expected failures (not bugs).
 * They get 'warn' log level. Unexpected errors get 'error'.
 *
 * This distinction matters for alerting thresholds:
 * a spike in operational errors might be user error;
 * a spike in non-operational errors is always a code problem.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isOperationalError(err) {
  if (isContentError(err)) return true;
  if (Number.isInteger(err?.status) && err.status < 500) return true;
  return false;
}
