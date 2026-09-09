/**
 * Custom error type for configuration problems.
 *
 * Provides a machine-readable `code` and optional underlying `cause`.
 */

export class ConfigurationError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(code, message, options = {}) {
    super(message, { cause: options.cause });

    this.name = new.target.name;
    this.code = code;

    Error.captureStackTrace?.(this, new.target);
  }
}
