import { createAppLogger } from '../lib/logger/create-logger.js';
import { buildContentContainer } from './bootstrap/container.js';

const logger = createAppLogger();
const { content, navigation, siteConfig, renderBlock } = await buildContentContainer({ logger });

export { content, navigation, siteConfig, renderBlock };
