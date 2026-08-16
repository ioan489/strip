import { createNavigationService } from '../../domain/content/navigation/navigation-service.js';
import { createSiteConfig } from '../../domain/content/site-config/site-config.js';

/**
 * Creates content-level application services.
 *
 * Both services are singletons — constructed once, live for the
 * application lifetime.
 *
 * Navigation is manifest-driven: no repository, no preview state,
 * no I/O. Built once at startup, O(1) per call.
 *
 * Site config is global: no preview switching, same in all contexts.
 *
 * @param {object} options
 * @param {readonly object[]} options.navManifest
 * @param {object} options.siteConfigModule
 */
export function createServices({ navManifest, siteConfigModule }) {
  // Built once. getMainNav() is synchronous and pure.
  const _navService = createNavigationService(navManifest);

  const navigation = Object.freeze({
    getMainNav() {
      return _navService.getMainNav();
    },
  });

  // Validated and frozen at construction time.
  const siteConfig = createSiteConfig(siteConfigModule);

  return Object.freeze({ navigation, siteConfig });
}
