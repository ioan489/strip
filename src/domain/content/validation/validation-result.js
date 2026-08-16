import { deepFreeze } from '../../../lib/deep-freeze.js';

/**
 * Immutable result of validating a piece of content.
 *
 * It aggregates zero or more ValidationError objects.
 * A valid result has `valid === true` and an empty errors array.
 *
 * This is a pure value object – do not throw it.
 *
 * @param {object[]} errors
 * @returns {Readonly<{valid: boolean, errors: readonly object[]}>}
 */
export function createValidationResult(errors = []) {
  if (!Array.isArray(errors)) {
    throw new TypeError('Validation errors must be an array.');
  }

  const safeErrors = errors.map((error) => {
    if (!error || typeof error !== 'object' || !error.path || !error.message) {
      throw new TypeError(
        'Each validation error must have at least "path" (string) and "message" (string).',
      );
    }
    // Already frozen by createValidationError, but we return as‑is
    return error;
  });

  return deepFreeze({
    valid: safeErrors.length === 0,
    errors: safeErrors,
  });
}
