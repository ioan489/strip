// src/__tests__/integration/content-bootstrap.test.js
import { describe, it, expect } from 'vitest';
import { buildContentContainer } from '../../content/bootstrap/container.js';
import { createTestLogger } from '../../testing/helpers/create-test-logger.js';
import { ContentError, ContentErrorCode } from '../../domain/content/errors/index.js';

// One container for the whole suite — bootstrapping is the expensive part.
const container = await buildContentContainer({ logger: createTestLogger() });

describe('Content bootstrap — container shape', () => {
  it('exports content, navigation, siteConfig, renderBlock', () => {
    expect(container.content).toBeDefined();
    expect(container.navigation).toBeDefined();
    expect(container.siteConfig).toBeDefined();
    expect(container.renderBlock).toBeDefined();
  });
});

describe('Content bootstrap — content API', () => {
  it('resolves the payments page', async () => {
    const page = await container.content.page('payments');
    expect(page.slug).toBe('payments');
    expect(page.status).toBe('published');
  });

  it('returns pages array with at least one page', async () => {
    const pages = await container.content.pages();
    expect(pages.length).toBeGreaterThan(0);
  });

  it('hasPage returns true for payments', async () => {
    expect(await container.content.hasPage('payments')).toBe(true);
  });

  it('hasPage returns false for non-existent slug', async () => {
    expect(await container.content.hasPage('does-not-exist')).toBe(false);
  });

  it('page() throws ContentError(page_not_found) for missing slug', async () => {
    try {
      await container.content.page('does-not-exist');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContentError);
      expect(err.code).toBe(ContentErrorCode.PAGE_NOT_FOUND);
    }
  });
});

describe('Content bootstrap — navigation', () => {
  it('getMainNav returns a navigation with at least one item', () => {
    const nav = container.navigation.getMainNav();
    expect(nav.items.length).toBeGreaterThan(0);
  });

  it('every navigation item has label and href', () => {
    const nav = container.navigation.getMainNav();
    for (const item of nav.items) {
      expect(typeof item.label).toBe('string');
      expect(typeof item.href).toBe('string');
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.href.length).toBeGreaterThan(0);
    }
  });
});

describe('Content bootstrap — renderBlock', () => {
  it('renders a hero block to an HTML string', async () => {
    const page = await container.content.page('payments');
    const heroBlock = page.blocks.find((b) => b.type === 'hero');
    expect(heroBlock).toBeDefined();

    const result = container.renderBlock(heroBlock);

    // renderBlock returns RawHtml, not a plain string.
    // Convert to string for assertion.
    const html = String(result);

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain(heroBlock.content.headline);
  });

  it('throws for an unknown block type', () => {
    const fakeBlock = { type: 'nonexistent', content: {}, settings: {}, id: 'x' };
    expect(() => container.renderBlock(fakeBlock)).toThrow();
  });
});
