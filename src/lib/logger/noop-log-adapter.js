/**
 * No-op adapter. Suppresses all output.
 * Use in unit tests to keep output clean.
 *
 * const logger = createLogger(createNoopLogAdapter());
 */
export function createNoopLogAdapter() {
  return Object.freeze({
    write() {},
  });
}
