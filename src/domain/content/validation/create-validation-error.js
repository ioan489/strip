/**
 * A single immutable validation issue describing a broken rule on a content field.
 *
 * Validators never throw. They collect issues through the ValidationCollector.
 *
 * @param {object} params
 * @param {string} params.path        - dot‑notation path to the invalid field (e.g. "headline", "blocks[0].content.title")
 * @param {string} params.message     - human‑readable error message
 * @param {string} [params.code]      - stable machine‑readable error code (optional, prefer using your error code constants)
 * @param {string} [params.suggestion] - optional fix hint for content editors
 * @returns {Readonly<{path: string, message: string, code?: string, suggestion?: string}>}
 */
export function createValidationError({ path, message, code, suggestion } = {}) {
  // Programmer errors – throw immediately, not via the collector
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new TypeError('ValidationError requires a non‑empty path.');
  }
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new TypeError('ValidationError requires a non‑empty message.');
  }
  if (code !== undefined && (typeof code !== 'string' || code.trim().length === 0)) {
    throw new TypeError('ValidationError code must be a non‑empty string if provided.');
  }
  if (
    suggestion !== undefined &&
    (typeof suggestion !== 'string' || suggestion.trim().length === 0)
  ) {
    throw new TypeError('ValidationError suggestion must be a non‑empty string if provided.');
  }

  const error = {
    path: path.trim(),
    message: message.trim(),
  };

  if (code) {
    error.code = code.trim();
  }
  if (suggestion) {
    error.suggestion = suggestion.trim();
  }

  // Value objects are frozen immediately – no external mutation possible
  return Object.freeze(error);
}
