import { createSiteConfig } from './site-config.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';

/**
 * Loads site configuration from a raw module.
 *
 * @param {object} rawConfig - the default export of src/content/site-config.js
 * @returns {SiteConfig}
 */
export function createSiteConfigService(rawConfig) {
  return createSiteConfig(rawConfig);
}
