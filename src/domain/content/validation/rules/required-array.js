import { createValidationError } from '../create-validation-error.js';

export function requiredArray(value, path) {
  if (!Array.isArray(value)) {
    return createValidationError({
      path,
      message: `${path} must be an array.`,
      code: 'MUST_BE_ARRAY',
    });
  }

  return null;
}
