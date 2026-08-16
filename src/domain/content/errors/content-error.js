/**
 * content-error.js
 *
 * Base error for the Content Engine.
 *
 * Every domain-level failure originating from the Content Engine should throw
 * ContentError (or a future subclass if justified).
 *
 * Infrastructure failures (filesystem, network, CMS SDK) should NOT throw this
 * directly. They should be translated into ContentError by repositories.
 */

export class ContentError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(code, message, options = {}) {
    super(message, options);

    this.name = new.target.name;

    /**
     * Stable machine-readable error code.
     *
     * Never parse error.message.
     */
    this.code = code;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }

    Error.captureStackTrace?.(this, new.target);
  }
}
