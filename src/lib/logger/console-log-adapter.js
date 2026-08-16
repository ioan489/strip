/**
 * Console log adapter.
 *
 * Emits newline-delimited JSON to stdout/stderr.
 * Compatible with log aggregators (Datadog, Logtail, etc.) that ingest NDJSON.
 *
 * In dev you can pipe through `jq` for pretty output:
 *   node server.js | jq '.'
 *
 * @param {object} [options]
 * @param {'debug'|'info'|'warn'|'error'} [options.minLevel='debug']
 */
export function createConsoleLogAdapter({ minLevel = 'debug' } = {}) {
  const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
  const minLevelNum = LEVELS[minLevel] ?? 0;

  return Object.freeze({
    write(level, message, context) {
      if ((LEVELS[level] ?? 0) < minLevelNum) return;

      const entry = {
        time: new Date().toISOString(),
        level,
        message,
        ...context,
      };

      const line = JSON.stringify(entry);

      if (level === 'error') console.error(line);
      else if (level === 'warn') console.warn(line);
      else console.log(line);
    },
  });
}
