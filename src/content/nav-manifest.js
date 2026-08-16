// src/content/nav-manifest.js
import { createNavManifest } from '../domain/content/navigation/nav-manifest.js';

/**
 * Navigation manifest.
 *
 * Single source of truth for the site navigation structure.
 *
 * Navigation is a site-level concern, defined here explicitly and independently
 * of page content. A page can exist without appearing in navigation, and nav
 * items can be reordered or hidden without touching any page file.
 *
 * Extension points (add when needed, validate in NavigationService):
 *   children?: NavManifestEntry[]   — dropdown sub-items
 *   external?: boolean              — opens in new tab
 *   mobileOnly?: boolean
 *   desktopOnly?: boolean
 *
 * @type {readonly { label: string; href: string; order: number }[]}
 */
export default createNavManifest([
  { label: 'Payments', href: '/payments', order: 0 },
  { label: 'Terminal', href: '/terminal', order: 10 },
  { label: 'Stripe Docs', href: 'https://stripe.com/docs', order: 99, external: true },
]);
