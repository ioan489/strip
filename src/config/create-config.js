import { ConfigurationError } from './config-error.js';
import { ConfigErrorCode } from './config-error-codes.js';
import { deepFreeze } from '../lib/deep-freeze.js';

/**
 * Application configuration module.
 *
 * Loads settings from environment variables with sensible defaults,
 * validates inputs, and returns a deeply frozen immutable config object.
 *
 * @module config
 */

// -- Constants -------------------------------------------------------------------

const DEFAULT_PORT = 5173;
const DEFAULT_HOST = 'localhost';
const DEFAULT_BASE = '/';
const DEFAULT_PAGES_DIR = '/src/pages';

const DEFAULT_CONTENT_CACHE = Object.freeze({
  maxSize: 512,
  developmentTtl: 5_000,
  productionTtl: 0,
});

// -- Validation helpers --------------------------------------------------------------

/**
 * Parse and validate the PORT environment variable.
 * @param {string|undefined} value
 * @returns {number}
 * @throws {ConfigurationError}
 */
function parsePort(value) {
  if (value == null || value === '') {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigurationError(
      ConfigErrorCode.INVALID_PORT,
      `Invalid PORT: "${value}". Must be an integer between 1 and 65535.`,
    );
  }

  return port;
}

/**
 * Parse and validate the HOST environment variable.
 * @param {string|undefined} value
 * @returns {string}
 * @throws {ConfigurationError}
 */
function parseHost(value) {
  const host = value ?? DEFAULT_HOST;
  if (host === '') {
    throw new ConfigurationError(ConfigErrorCode.EMPTY_HOST, 'HOST cannot be an empty string');
  }
  return host;
}

/**
 * Parse and validate the NODE_ENV environment variable.
 * @param {string|undefined} value
 * @returns {'development'|'test'|'production'}
 * @throws {ConfigurationError}
 */
function parseEnvironment(value) {
  const environment = value ?? 'development';

  if (!['development', 'test', 'production'].includes(environment)) {
    throw new ConfigurationError(
      ConfigErrorCode.INVALID_NODE_ENV,
      `Invalid NODE_ENV: "${environment}". Must be one of 'development', 'test', or 'production'.`,
    );
  }

  return environment;
}

/**
 * Parse and normalize the BASE environment variable.
 * Ensures it starts with a slash and ends with a trailing slash.
 * @param {string|undefined} value
 * @returns {string}
 * @throws {ConfigurationError}
 */
function normalizeBase(value) {
  const base = value ?? DEFAULT_BASE;

  if (!base.startsWith('/')) {
    throw new ConfigurationError(
      ConfigErrorCode.INVALID_BASE,
      `Invalid BASE: "${base}". Must start with a slash.`,
    );
  }

  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * Normalize the `PAGES_DIR` environment variable.
 *
 * Converts any provided value into a root‑relative URL path:
 * - Falls back to `DEFAULT_PAGES_DIR` when no value is supplied.
 * - Ensures the result starts with a forward slash (`/`).
 * - Removes any trailing slashes.
 *
 * This path is **not** a filesystem absolute path; it is used as a
 * Vite virtual module prefix (e.g. `/src/pages`). Keep it in the same
 * coordinate space as Vite’s `import.meta.glob` keys.
 *
 * @param {string|undefined} value - Raw environment value (e.g. `'src/pages'` or `'/src/pages/'`).
 * @returns {string} Normalized root‑relative path (e.g. `'/src/pages'`).
 */
function normalizePagesDir(value) {
  const dir = value || DEFAULT_PAGES_DIR; // '' || DEFAULT_PAGES_DIR  →  '/src/pages'
  // Ensure it starts with '/' and has no trailing slash
  return '/' + dir.replace(/^\/+|\/+$/g, '');
}

// -- Main config factory -------------------------------------------------------------

/**
 * @typedef {Object} AppConfig
 * @property {'development'|'test'|'production'} environment
 * @property {boolean} isProd
 * @property {boolean} isTest
 * @property {boolean} isDev
 * @property {Readonly<{
 *   port: number,
 *   host: string,
 *   base: string,
 *   pagesDir: string
 * }>} server
 * @property {Readonly<{
 *   cache: Readonly<{
 *     maxSize: number,
 *     ttl: number
 *   }>
 * }>} content
 */

/**
 * Create a validated, frozen configuration object from environment variables.
 *
 * @param {Record<string, string|undefined>} [env] – Environment variables (defaults to `{}`).
 * @returns {Readonly<AppConfig>}
 * @throws {ConfigurationError}
 */
export function createConfig(env = {}) {
  const environment = parseEnvironment(env.NODE_ENV);

  return deepFreeze({
    environment,

    isProd: environment === 'production',
    isTest: environment === 'test',
    isDev: environment === 'development',

    server: {
      port: parsePort(env.PORT),
      host: parseHost(env.HOST),
      base: normalizeBase(env.BASE),
      pagesDir: normalizePagesDir(env.PAGES_DIR),
    },

    content: {
      cache: {
        maxSize: DEFAULT_CONTENT_CACHE.maxSize,
        ttl: {
          development: DEFAULT_CONTENT_CACHE.developmentTtl,
          test: DEFAULT_CONTENT_CACHE.developmentTtl, // or 0 if you want tests cold
          production: DEFAULT_CONTENT_CACHE.productionTtl,
        }[environment],
      },
    },

    logging: {
      minLevel: env.LOG_MIN_LEVEL ?? (environment === 'production' ? 'info' : 'debug'),
    },
  });
}
