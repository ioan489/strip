import { deepFreeze } from '../deep-freeze.js';

/**
 * Creates a structured logger.
 *
 * The logger has no knowledge of the output adapter (console, Pino, Winston).
 * Adapters are injected at bootstrap time and can be swapped per environment.
 *
 * Child loggers inherit context from their parent and can add more.
 * All context is merged shallowly into every log entry.
 *
 * @param {object} adapter   - must implement write(level, message, context)
 * @param {object} [context] - key-value pairs bound to every entry this logger emits
 * @returns {Logger}
 */
export function createLogger(adapter, context = {}) {
  if (!adapter || typeof adapter.write !== 'function') {
    throw new TypeError('Logger requires an adapter with a write(level, message, context) method.');
  }

  function write(level, message, data = {}) {
    adapter.write(level, message, { ...context, ...data });
  }

  return deepFreeze({
    /**
     * Creates a child logger with additional bound context.
     * Useful for scoping logs to a subsystem (e.g. { subsystem: 'bootstrap' }).
     *
     * @param {object} additionalContext
     * @returns {Logger}
     */
    child(additionalContext) {
      return createLogger(adapter, { ...context, ...additionalContext });
    },

    debug(message, data) {
      write('debug', message, data);
    },
    info(message, data) {
      write('info', message, data);
    },
    warn(message, data) {
      write('warn', message, data);
    },
    error(message, data) {
      write('error', message, data);
    },
  });
}
