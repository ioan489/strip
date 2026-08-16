import { createValidationError } from '../create-validation-error.js';

export function optionalString(value, path) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    return createValidationError({
      path,
      message: `${path} must be a string.`,
      code: 'INVALID_STRING',
    });
  }

  return null;
}
