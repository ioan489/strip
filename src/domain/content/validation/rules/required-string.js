import { createValidationError } from '../create-validation-error.js'; // optional, but ensures consistency

/**
 * Rule: required non‑empty string.
 *
 * Returns a ValidationError if the value is not a non‑empty string,
 * or `null` if the rule passes.
 *
 * @param {unknown} value
 * @param {string} path
 * @returns {object|null}
 */
export function requiredString(value, path) {
  if (typeof value !== 'string') {
    return createValidationError({
      path,
      message: `${path} must be a string.`,
      code: 'INVALID_STRING',
    });
  }
  if (value.trim().length === 0) {
    return createValidationError({
      path,
      message: `${path} cannot be empty.`,
      code: 'EMPTY_STRING',
    });
  }
  return null;
}
