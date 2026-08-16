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
 * @returns {Logger}
 */
export function createAppLogger() {
  const isProd = process.env.NODE_ENV === 'production';

  const adapter = createConsoleLogAdapter({
    minLevel: process.env.LOG_MIN_LEVEL ?? (isProd ? 'info' : 'debug'),
  });

  return createLogger(adapter, { app: 'site' });
}
