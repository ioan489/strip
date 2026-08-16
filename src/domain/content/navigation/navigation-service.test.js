// src/domain/content/navigation/navigation-service.test.js
import { describe, it, expect } from 'vitest';
import { createNavigationService } from './navigation-service.js';
import { createNavManifest } from './nav-manifest.js';
import { ContentError } from '../errors/index.js';

const twoItemManifest = createNavManifest([
  { label: 'Payments', href: '/payments', order: 0 },
  { label: 'Terminal', href: '/terminal', order: 10 },
]);

describe('createNavigationService', () => {
  it('throws ContentError for non-array manifest', () => {
    expect(() => createNavigationService(null)).toThrow(ContentError);
    expect(() => createNavigationService('string')).toThrow(ContentError);
  });

  it('returns items sorted by order', () => {
    const manifest = createNavManifest([
      { label: 'Second', href: '/second', order: 10 },
      { label: 'First', href: '/first', order: 0 },
    ]);
    const nav = createNavigationService(manifest).getMainNav();
    expect(nav.items[0].label).toBe('First');
    expect(nav.items[1].label).toBe('Second');
  });

  it('returns the exact same Navigation object on every call', () => {
    const service = createNavigationService(twoItemManifest);
    expect(service.getMainNav()).toBe(service.getMainNav());
  });

  it('sets external=false by default', () => {
    const manifest = createNavManifest([{ label: 'A', href: '/a' }]);
    const nav = createNavigationService(manifest).getMainNav();
    expect(nav.items[0].external).toBe(false);
  });

  it('preserves external=true for external links', () => {
    const manifest = createNavManifest([
      { label: 'Docs', href: 'https://stripe.com/docs', external: true },
    ]);
    const nav = createNavigationService(manifest).getMainNav();
    expect(nav.items[0].external).toBe(true);
  });

  it('handles an empty manifest', () => {
    const nav = createNavigationService(createNavManifest([])).getMainNav();
    expect(nav.items).toHaveLength(0);
  });
});
