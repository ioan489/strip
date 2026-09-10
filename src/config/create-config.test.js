import { describe, expect, it } from 'vitest';
import { createConfig } from './create-config.js';
import { ConfigurationError } from './config-error.js';
import { ConfigErrorCode } from './config-error-codes.js';

describe('createConfig', () => {
  it('uses development defaults', () => {
    const config = createConfig({});

    expect(config.environment).toBe('development');
    expect(config.isDev).toBe(true);
    expect(config.isProd).toBe(false);
    expect(config.isTest).toBe(false);
    expect(config.server.port).toBe(5173);
    expect(config.server.host).toBe('localhost');
    expect(config.server.base).toBe('/');
    expect(config.content.cache.ttl).toBe(5_000);
  });

  it('creates production configuration', () => {
    const config = createConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      HOST: '0.0.0.0',
      BASE: '/app',
      PAGES_DIR: '/pages',
    });

    expect(config.environment).toBe('production');
    expect(config.isProd).toBe(true);
    expect(config.server.port).toBe(8080);
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.server.base).toBe('/app/');
    expect(config.server.pagesDir).toBe('/pages');
    expect(config.content.cache.ttl).toBe(0);
  });

  it('creates test configuration', () => {
    const config = createConfig({ NODE_ENV: 'test' });

    expect(config.environment).toBe('test');
    expect(config.isTest).toBe(true);
  });

  it('rejects invalid ports with ConfigurationError', () => {
    expect(() => createConfig({ PORT: 'not-a-port' })).toThrow(ConfigurationError);

    const error = catchError(() => createConfig({ PORT: 'not-a-port' }));
    expect(error.code).toBe(ConfigErrorCode.INVALID_PORT);
    expect(error.message).toContain('PORT');
  });

  it('rejects out-of-range ports', () => {
    expect(() => createConfig({ PORT: '0' })).toThrow(ConfigurationError);
    expect(() => createConfig({ PORT: '70000' })).toThrow(ConfigurationError);
    expect(() => createConfig({ PORT: '-1' })).toThrow(ConfigurationError);
  });

  it('rejects invalid environments with ConfigurationError', () => {
    expect(() => createConfig({ NODE_ENV: 'staging-ish' })).toThrow(ConfigurationError);

    const error = catchError(() => createConfig({ NODE_ENV: 'staging-ish' }));
    expect(error.code).toBe(ConfigErrorCode.INVALID_NODE_ENV);
  });

  it('rejects base paths not starting with /', () => {
    const error = catchError(() => createConfig({ BASE: 'app' }));
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.code).toBe(ConfigErrorCode.INVALID_BASE);
  });

  it('rejects empty host strings', () => {
    const error = catchError(() => createConfig({ HOST: '' }));
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.code).toBe(ConfigErrorCode.EMPTY_HOST);
  });

  it('defaults logging minLevel to debug in development', () => {
    const config = createConfig({});
    expect(config.logging.minLevel).toBe('debug');
  });

  it('defaults logging minLevel to info in production', () => {
    const config = createConfig({ NODE_ENV: 'production' });
    expect(config.logging.minLevel).toBe('info');
  });

  it('defaults logging minLevel to debug in test', () => {
    const config = createConfig({ NODE_ENV: 'test' });
    expect(config.logging.minLevel).toBe('debug');
  });

  it('respects LOG_MIN_LEVEL override regardless of environment', () => {
    const config = createConfig({ NODE_ENV: 'production', LOG_MIN_LEVEL: 'warn' });
    expect(config.logging.minLevel).toBe('warn');
  });

  it('returns frozen logging config', () => {
    const config = createConfig({});
    expect(Object.isFrozen(config.logging)).toBe(true);
  });

  it('returns deeply frozen configuration', () => {
    const config = createConfig({});

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.server)).toBe(true);
    expect(Object.isFrozen(config.content)).toBe(true);
    expect(Object.isFrozen(config.content.cache)).toBe(true);
  });

  it('does not allow mutation of frozen config', () => {
    const config = createConfig({});

    expect(() => {
      config.server.port = 9999;
    }).toThrow();

    expect(config.server.port).toBe(5173);
  });
});

describe('ConfigurationError', () => {
  it('preserves cause when provided', () => {
    const cause = new TypeError('Underlying failure');
    const error = new ConfigurationError(ConfigErrorCode.INVALID_PORT, 'Bad port', { cause });

    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Bad port');
    expect(error.code).toBe(ConfigErrorCode.INVALID_PORT);
    expect(error.name).toBe('ConfigurationError');
  });
});

/**
 * Helper to capture the thrown error for property assertions.
 * Vitest's toThrow doesn't let you inspect .code easily.
 */
function catchError(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected function to throw, but it did not');
}
