import { ContentError } from './content-error.js';
import { ContentErrorCode } from './content-error-codes.js';

/**
 * Thrown when a content definition fails validation.
 *
 * Carries the full ValidationResult (list of errors with paths, messages, codes)
 * so error handlers can render rich feedback.
 */
export class ContentValidationError extends ContentError {
  /**
   * @param {string} slug - slug of the failing page
   * @param {import('../validation/validation-result.js').ValidationResult} validationResult
   * @param {object} [options]
   */
  constructor(slug, validationResult, options = {}) {
    super(
      ContentErrorCode.CONTENT_VALIDATION_FAILED,
      `Page "${slug}" failed validation with ${validationResult.errors.length} error(s).`,
      options,
    );

    this.name = 'ContentValidationError';
    this.slug = slug;
    this.validationResult = validationResult;
  }
}
