import { deepFreeze } from '../../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';

const SITE_CONFIG_BRAND = Symbol('SiteConfig');

/**
 * Immutable site configuration.
 *
 * @param {object} input
 * @param {string} [input.logo] - URL or path to logo
 * @param {{ label: string, url: string }[]} [input.socialLinks]
 * @returns {Readonly<{logo?: string, socialLinks?: readonly object[]}>}
 */
export function createSiteConfig(input) {
  validateConfig(input);

  const logo = input.logo?.trim();
  const socialLinks = input.socialLinks ?? [];

  const config = {
    ...(logo ? { logo: logo.trim() } : {}),
    socialLinks: deepFreeze(socialLinks.map((link) => ({ ...link }))),
  };

  Object.defineProperty(config, SITE_CONFIG_BRAND, { value: true, enumerable: false });
  return deepFreeze(config);
}

function isPlainObject(value) {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

function validateConfig(input) {
  if (!isPlainObject(input)) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'SiteConfig requires a plain object as input.',
    );
  }
  validateLogo(input.logo);
  validateSocialLinks(input.socialLinks);
}

function validateLogo(logo) {
  if (logo !== undefined && typeof logo !== 'string') {
    throw new ContentError(ContentErrorCode.INVALID_ARGUMENT, 'SiteConfig logo must be a string.');
  }
}

function validateSocialLinks(links) {
  if (links === undefined) return; // not provided – valid

  if (!Array.isArray(links)) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'SiteConfig socialLinks must be an array.',
    );
  }

  links.forEach((link, index) => validateLinkItem(link, index));
}

function validateLinkItem(link, index) {
  if (!isPlainObject(link)) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      `SiteConfig socialLinks[${index}] must be a plain object.`,
    );
  }
  if (typeof link.label !== 'string' || link.label.trim().length === 0) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      `SiteConfig socialLinks[${index}].label must be a non-empty string.`,
    );
  }
  if (typeof link.url !== 'string' || link.url.trim().length === 0) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      `SiteConfig socialLinks[${index}].url must be a non-empty string.`,
    );
  }
}

export function isSiteConfig(value) {
  return typeof value === 'object' && value !== null && value[SITE_CONFIG_BRAND] === true;
}
