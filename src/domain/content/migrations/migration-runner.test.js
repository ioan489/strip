// src/domain/content/migrations/migration-runner.test.js
import { describe, it, expect } from 'vitest';
import { runMigrations } from './migration-runner.js';
import { ContentError } from '../errors/index.js';

const v1 = { name: 'hero', version: 1, migrations: {} };
const v2 = {
  name: 'hero',
  version: 2,
  migrations: {
    1: (c) => ({ ...c, ctaLabel: c.ctaLabel ?? 'Get started' }),
  },
};

describe('runMigrations', () => {
  it('returns content unchanged when versions match', () => {
    expect(runMigrations({ _version: 1, headline: 'Hi' }, v1)).toEqual({ headline: 'Hi' });
  });

  it('strips _version from the result', () => {
    const result = runMigrations({ _version: 1, headline: 'Hi' }, v1);
    expect(result).not.toHaveProperty('_version');
  });

  it('treats absent _version as v1', () => {
    expect(runMigrations({ headline: 'Hi' }, v1)).toEqual({ headline: 'Hi' });
  });

  it('applies a migration from v1 to v2', () => {
    const result = runMigrations({ _version: 1, headline: 'Hi' }, v2);
    expect(result.ctaLabel).toBe('Get started');
  });

  it('does not overwrite an existing field during migration', () => {
    const result = runMigrations({ _version: 1, ctaLabel: 'Custom' }, v2);
    expect(result.ctaLabel).toBe('Custom');
  });

  it('chains multiple migrations in sequence', () => {
    const v3 = {
      name: 'hero',
      version: 3,
      migrations: {
        1: (c) => ({ ...c, fieldA: 'a' }),
        2: (c) => ({ ...c, fieldB: 'b' }),
      },
    };
    const result = runMigrations({ _version: 1 }, v3);
    expect(result.fieldA).toBe('a');
    expect(result.fieldB).toBe('b');
  });

  it('throws ContentError when content version exceeds blockType version', () => {
    expect(() => runMigrations({ _version: 5 }, v2)).toThrow(ContentError);
  });

  it('throws ContentError when a required migration step is missing', () => {
    const broken = { name: 'x', version: 3, migrations: { 1: (c) => c } }; // no 2→3
    expect(() => runMigrations({ _version: 1 }, broken)).toThrow(/migration/i);
  });
});
