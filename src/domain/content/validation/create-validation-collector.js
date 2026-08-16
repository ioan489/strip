import { createValidationResult } from './validation-result.js';

/**
 * Mutable collector used during the validation phase.
 *
 * It gathers ValidationError objects and produces an immutable result.
 *
 * @returns {{
 *   check(error: object|null|undefined): void,
 *   merge(result: { valid: boolean, errors?: readonly object[] }): void,
 *   result(): { valid: boolean, errors: readonly object[] },
 *   size(): number
 * }}
 */
export function createValidationCollector() {
  const errors = [];

  return {
    /**
     * Add a single error. If `null` or `undefined`, does nothing.
     * The error must be an object with `path` and `message` (created by `createValidationError`).
     */
    check(error) {
      if (error == null) return; // rule passed
      if (typeof error !== 'object' || !error.path || !error.message) {
        throw new TypeError(
          'ValidationCollector.check() expects a valid error object (with path + message).',
        );
      }
      errors.push(error);
      return this; // allow chaining
    },

    /**
     * Merge all errors from another validation result.
     */
    merge(result) {
      if (!result || result.valid) return; // nothing to merge
      if (Array.isArray(result.errors)) {
        for (const err of result.errors) {
          if (!err || !err.path || !err.message) {
            throw new TypeError('Merged validation result contains invalid error objects.');
          }
        }
        errors.push(...result.errors);
      }
      return this; // allow chaining
    },

    /**
     * Return a snapshot of the current collection (still mutable until you call result()).
     */
    size() {
      return errors.length;
    },

    /**
     * Produce the final immutable validation result.
     * The collector can still be used afterwards (though not recommended).
     */
    result() {
      return createValidationResult(errors);
    },
  };
}
