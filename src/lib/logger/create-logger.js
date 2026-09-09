import { createLogger } from './logger.js';
import { createConsoleLogAdapter } from './console-log-adapter.js';

/**
 * Creates the application logger.
 *
 * The adapter is chosen based on environment.
 * In production, replace createConsoleLogAdapter with a Pino adapter
 * (or any object implementing write(level, message, context)) here —
 * no other file changes.
 *
 * @param {object} [options]
 * @param {'debug'|'info'|'warn'|'error'} [options.minLevel='debug']
 * @returns {Logger}
 */
export function createAppLogger({ minLevel = 'debug' } = {}) {
  const adapter = createConsoleLogAdapter({ minLevel });
  return createLogger(adapter, { app: 'site' });
}
