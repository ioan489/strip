import { deepFreeze } from '../../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';
import { isNavigationItem } from './navigation-item.js';

const NAVIGATION_BRAND = Symbol('Navigation');

/**
 * Creates an ordered, immutable Navigation collection from trusted NavigationItems.
 *
 * @param {object[]} [rawItems] - array of NavigationItem objects
 * @returns {Readonly<{ items: readonly object[] }>}
 */
export function createNavigation(rawItems) {
  validateNavigation(rawItems);

  const items = [...(rawItems ?? [])].sort((a, b) => a.order - b.order);

  const navigation = {
    items,
  };

  Object.defineProperty(navigation, NAVIGATION_BRAND, { value: true, enumerable: false });
  return deepFreeze(navigation);
}

function validateNavigation(rawItems) {
  if (rawItems === undefined) return; // no items → valid, use default later

  if (!Array.isArray(rawItems)) {
    throw new ContentError(ContentErrorCode.INVALID_ARGUMENT, 'Navigation items must be an array.');
  }

  rawItems.forEach((item, index) => {
    if (!isNavigationItem(item)) {
      throw new ContentError(
        ContentErrorCode.INVALID_ARGUMENT,
        `Navigation item at index ${index} is not a valid NavigationItem.`,
      );
    }
  });
}

export function isNavigation(value) {
  return typeof value === 'object' && value !== null && value[NAVIGATION_BRAND] === true;
}
