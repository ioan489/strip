// src/lib/errors/http-error-mapper.test.js
import { describe, it, expect } from 'vitest';
import { resolveHttpStatus, isOperationalError } from './http-error-mapper.js';

// Simulate a ContentError as it arrives across the Vite SSR module boundary.
// instanceof ContentError fails across that boundary, so the mapper uses
// duck-typing on err.name and err.code. We replicate that shape here.
function makeContentError(code) {
  const err = new Error('test error');
  err.name = 'ContentError';
  err.code = code;
  return err;
}

describe('resolveHttpStatus', () => {
  it('returns err.status when explicitly set', () => {
    const err = Object.assign(new Error(), { status: 403 });
    expect(resolveHttpStatus(err)).toBe(403);
  });

  it('maps page_not_found → 404', () => {
    expect(resolveHttpStatus(makeContentError('page_not_found'))).toBe(404);
  });

  it('maps content_not_found → 404', () => {
    expect(resolveHttpStatus(makeContentError('content_not_found'))).toBe(404);
  });

  it('maps invalid_argument → 400', () => {
    expect(resolveHttpStatus(makeContentError('invalid_argument'))).toBe(400);
  });

  it('maps content_validation_failed → 422', () => {
    expect(resolveHttpStatus(makeContentError('content_validation_failed'))).toBe(422);
  });

  it('maps unknown ContentError code → 500', () => {
    expect(resolveHttpStatus(makeContentError('unknown_code'))).toBe(500);
  });

  it('returns 500 for plain errors with no status', () => {
    expect(resolveHttpStatus(new Error('boom'))).toBe(500);
  });

  it('returns 500 for null', () => {
    expect(resolveHttpStatus(null)).toBe(500);
  });
});

describe('isOperationalError', () => {
  it('returns true for ContentErrors', () => {
    expect(isOperationalError(makeContentError('page_not_found'))).toBe(true);
  });

  it('returns true for explicit 4xx status errors', () => {
    const err = Object.assign(new Error(), { status: 404 });
    expect(isOperationalError(err)).toBe(true);
  });

  it('returns false for plain errors', () => {
    expect(isOperationalError(new Error('crash'))).toBe(false);
  });

  it('returns false for 5xx status errors', () => {
    const err = Object.assign(new Error(), { status: 500 });
    expect(isOperationalError(err)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isOperationalError(null)).toBe(false);
  });
});
