// src/__tests__/integration/draft-exclusion.test.js
//
// Verifies the full chain: draft page → ContentError(page_not_found)
// → isDraftSkip in build-ssg.js catches it correctly.
// This is the bug that caused draft pages to render as "Page not available"
// before the getServerData fix.

import { describe, it, expect } from 'vitest';
import { buildContentContainer } from '../../content/bootstrap/container.js';
import { createSourceBackedRepository } from '../../domain/content/repositories/create-source-backed-repository.js';
import { createLocalModuleSource } from '../../content/sources/create-local-module-source.js';
import { createPageFactory } from '../../domain/content/factories/index.js';
import { ContentError, ContentErrorCode } from '../../domain/content/errors/index.js';
import { createTestRegistry } from '../../testing/helpers/create-test-registry.js';
import { createTestLogger } from '../../testing/helpers/create-test-logger.js';
import { rawPageModule } from '../../testing/fixtures/index.js';

describe('Draft page exclusion', () => {
  it('draft pages are absent from the published repository', async () => {
    const source = createLocalModuleSource({
      published: rawPageModule({ slug: 'pub', status: 'published' }),
      draft: rawPageModule({ slug: 'draft', status: 'draft' }),
    });

    const repo = await createSourceBackedRepository({
      source,
      pageFactory: createPageFactory({ blockTypeRegistry: createTestRegistry() }),
      preview: false,
      loading: 'eager',
      logger: createTestLogger(),
    });

    // Published page is accessible
    expect(await repo.hasPage('pub')).toBe(true);

    // Draft page throws page_not_found — which isDraftSkip() recognises
    expect(await repo.hasPage('draft')).toBe(false);

    try {
      await repo.getPage('draft');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ContentError);
      expect(err.code).toBe(ContentErrorCode.PAGE_NOT_FOUND);
    }
  });

  it('draft pages ARE accessible in the preview repository', async () => {
    const source = createLocalModuleSource({
      draft: rawPageModule({ slug: 'draft', status: 'draft' }),
    });

    const repo = await createSourceBackedRepository({
      source,
      pageFactory: createPageFactory({ blockTypeRegistry: createTestRegistry() }),
      preview: true,
      loading: 'eager',
      logger: createTestLogger(),
    });

    expect(await repo.hasPage('draft')).toBe(true);
  });
});
