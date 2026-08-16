import { createPageFactory } from '../../domain/content/factories/index.js';
import { ContentError, ContentErrorCode } from '../../domain/content/errors/index.js';

import { registerBlockTypes } from './register-block-types.js';
import { registerRenderers } from './register-renderers.js';
import { createRepositories } from './create-repositories.js';
import { createServices } from './create-services.js';
import { createContentApi } from './create-content-api.js';
import { createRenderBlock } from '../renderers/render-block.js';
import { createAppLogger } from '../../lib/logger/create-logger.js';

import navManifest from '../nav-manifest.js';
import siteConfigModule from '../site-config.js';
import payments from '../pages/payments.js';

export async function buildContentContainer({ logger }) {
  // ── Logger ─────────────────────────────────────────────────────────────────
  //
  // Created first so every subsequent bootstrap phase can log to it.
  const bootstrapLog = logger.child({ subsystem: 'bootstrap' });
  bootstrapLog.info('Bootstrap started');

  // ── Block Types ────────────────────────────────────────────────────────────

  const blockTypeRegistry = registerBlockTypes();

  bootstrapLog.info('Block types registered', {
    count: blockTypeRegistry.size(),
    types: blockTypeRegistry.values().map((bt) => `${bt.name}@v${bt.version}`),
  });

  // ── Renderers ──────────────────────────────────────────────────────────────

  const rendererRegistry = registerRenderers();

  bootstrapLog.info('Renderers registered', {
    count: rendererRegistry.values().length,
    types: rendererRegistry.values().map((r) => r.type),
  });

  // ── Registry Coherence Check ───────────────────────────────────────────────
  //
  // Every registered BlockType must have a renderer.
  // Failure here means a developer added a block type without a renderer
  // (or vice versa). Caught at startup — never at render time.
  for (const blockType of blockTypeRegistry.values()) {
    if (!rendererRegistry.has(blockType.name)) {
      const message =
        `BlockType "${blockType.name}" has no registered renderer. ` +
        `Add a renderer in src/content/renderers/ and register it in register-renderers.js.`;

      bootstrapLog.error('Registry coherence check failed', {
        blockType: blockType.name,
        version: blockType.version,
      });

      throw new ContentError(ContentErrorCode.CONTENT_DEFINITION_ERROR, message);
    }
  }

  bootstrapLog.debug('Registry coherence check passed');

  // ── Factory ────────────────────────────────────────────────────────────────

  const pageFactory = createPageFactory({ blockTypeRegistry });

  // ── Pages ──────────────────────────────────────────────────────────────────

  const rawPages = Object.freeze({ payments });

  // ── Repositories ───────────────────────────────────────────────────────────

  const { publishedRepository, previewRepository } = await createRepositories({
    pageFactory,
    pages: rawPages,
    logger: bootstrapLog,
  });

  bootstrapLog.info('Content compiled', {
    pages: await publishedRepository.getSlugs(),
  });

  // ── Services ───────────────────────────────────────────────────────────────

  const { navigation, siteConfig } = createServices({
    navManifest,
    siteConfigModule,
  });

  bootstrapLog.debug('Navigation built', {
    items: navigation.getMainNav().items.map((i) => i.href),
  });

  // ── Content API ────────────────────────────────────────────────────────────

  const content = createContentApi({ publishedRepository, previewRepository });

  // ── Renderer ───────────────────────────────────────────────────────────────
  //
  // Bound to the registry constructed here. No hidden singleton.
  // The coherence check above guarantees every content block can be rendered.

  const renderBlock = createRenderBlock(rendererRegistry);

  bootstrapLog.info('Bootstrap complete');

  return Object.freeze({ content, navigation, siteConfig, renderBlock });
}
