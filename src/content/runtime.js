import { createAppLogger } from '../lib/logger/create-logger.js';
import { createConfig } from '../config/create-config.js';
import { buildContentContainer } from './bootstrap/container.js';

const config = createConfig(process.env);
const logger = createAppLogger({ minLevel: config.logging.minLevel });

const { content, navigation, siteConfig, renderBlock } = await buildContentContainer({
  logger,
  cacheConfig: config.content.cache,
});

export { content, navigation, siteConfig, renderBlock };
