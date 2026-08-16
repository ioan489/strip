// src/domain/content/factories/create-page-factory.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { createPageFactory } from './create-page-factory.js';
import { ContentValidationError, ContentError } from '../errors/index.js';
import { isPage } from '../models/page.js';
import { createTestRegistry } from '../../../testing/helpers/create-test-registry.js';
import { rawPageModule, rawHeroBlock } from '../../../testing/fixtures/index.js';

describe('createPageFactory', () => {
  let factory;

  beforeEach(() => {
    factory = createPageFactory({ blockTypeRegistry: createTestRegistry() });
  });

  describe('construction', () => {
    it('throws when blockTypeRegistry is absent', () => {
      expect(() => createPageFactory({})).toThrow(ContentError);
    });
  });

  describe('createFromModule', () => {
    it('returns a trusted Page for a valid module', () => {
      const page = factory.createFromModule(rawPageModule());
      expect(isPage(page)).toBe(true);
      expect(page.slug).toBe('test-page');
    });

    it('defaults status to published when omitted', () => {
      const page = factory.createFromModule(rawPageModule({ status: undefined }));
      expect(page.status).toBe('published');
    });

    it('trims whitespace from headline via normalize', () => {
      const page = factory.createFromModule(
        rawPageModule({ blocks: [rawHeroBlock({ headline: '  spaced  ' })] }),
      );
      expect(page.blocks[0].content.headline).toBe('spaced');
    });

    it('assigns deterministic block IDs', () => {
      const page = factory.createFromModule(rawPageModule());
      expect(page.blocks[0].id).toBe('block-0');
    });

    it('applies v1→v2 migration (ctaLabel defaulted)', () => {
      const page = factory.createFromModule(
        rawPageModule({ blocks: [rawHeroBlock({ _version: 1, ctaLabel: undefined })] }),
      );
      expect(page.blocks[0].content.ctaLabel).toBe('Get started');
    });

    it('throws ContentError for null module', () => {
      expect(() => factory.createFromModule(null)).toThrow(ContentError);
    });

    it('throws ContentError for empty slug', () => {
      expect(() => factory.createFromModule(rawPageModule({ slug: '' }))).toThrow(ContentError);
    });

    it('throws ContentValidationError for invalid block content', () => {
      expect(() =>
        factory.createFromModule(rawPageModule({ blocks: [rawHeroBlock({ headline: '' })] })),
      ).toThrow(ContentValidationError);
    });

    it('collects ALL validation errors, not just the first', () => {
      try {
        factory.createFromModule(
          rawPageModule({ blocks: [rawHeroBlock({ headline: '', subheadline: '', ctaHref: '' })] }),
        );
      } catch (err) {
        expect(err).toBeInstanceOf(ContentValidationError);
        expect(err.validationResult.errors.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('prefixes error paths with block index', () => {
      try {
        factory.createFromModule(rawPageModule({ blocks: [rawHeroBlock({ headline: '' })] }));
      } catch (err) {
        expect(err.validationResult.errors[0].path).toMatch(/^blocks\[0\]/);
      }
    });

    it('reports errors from multiple invalid blocks with correct indices', () => {
      try {
        factory.createFromModule(
          rawPageModule({
            blocks: [rawHeroBlock({ headline: '' }), rawHeroBlock({ ctaHref: '' })],
          }),
        );
      } catch (err) {
        const paths = err.validationResult.errors.map((e) => e.path);
        expect(paths.some((p) => p.startsWith('blocks[0]'))).toBe(true);
        expect(paths.some((p) => p.startsWith('blocks[1]'))).toBe(true);
      }
    });

    it('throws for unknown block type', () => {
      expect(() =>
        factory.createFromModule(rawPageModule({ blocks: [{ type: 'unknown-type' }] })),
      ).toThrow();
    });
  });
});
