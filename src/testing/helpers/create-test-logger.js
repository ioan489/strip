import { createLogger } from '../../lib/logger/logger.js';
import { createNoopLogAdapter } from '../../lib/logger/noop-log-adapter.js';

/**
 * Creates a logger that discards all output.
 * Use in every test that touches code accepting a logger parameter —
 * prevents NDJSON spam in test output.
 */
export function createTestLogger() {
  return createLogger(createNoopLogAdapter());
}
