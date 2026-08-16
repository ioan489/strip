import { deepFreeze } from '../../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';

const NAV_ITEM_BRAND = Symbol('NavigationItem');

/**
 * Creates an immutable navigation item.
 *
 * @param {object} input
 * @param {string} input.label   - display text
 * @param {string} input.href    - URL (absolute or relative)
 * @param {number} [input.order] - sorting weight; lower = first
 * @returns {Readonly<{label: string, href: string, order: number}>}
 */
export function createNavigationItem(input) {
  validateInput(input);

  const item = {
    label: input.label.trim(),
    href: input.href.trim(),
    order: input.order ?? 0,
    external: input.external ?? false,
  };

  Object.defineProperty(item, NAV_ITEM_BRAND, { value: true, enumerable: false });
  return deepFreeze(item);
}

function validateInput(input) {
  if (!isPlainObject(input)) {
    throw new ContentError(ContentErrorCode.INVALID_ARGUMENT, 'NavigationItem must be an object.');
  }

  validateLabel(input.label);
  validateHref(input.href);
  if (input.order !== undefined) {
    validateOrder(input.order);
  }
  if (input.external !== undefined) {
    validateExternal(input.external);
  }
}

function validateLabel(label) {
  if (typeof label !== 'string' || label.trim().length === 0) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'NavigationItem requires a non-empty label.',
    );
  }
}

function validateHref(href) {
  if (typeof href !== 'string' || href.trim().length === 0) {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'NavigationItem requires a non‑empty href.',
    );
  }
}

function validateOrder(order) {
  if (typeof order !== 'number') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'NavigationItem order must be a number.',
    );
  }
}

function validateExternal(value) {
  if (typeof value !== 'boolean') {
    throw new ContentError(
      ContentErrorCode.INVALID_ARGUMENT,
      'NavigationItem external must be a boolean.',
    );
  }
}

function isPlainObject(value) {
  return (
    typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

export function isNavigationItem(value) {
  return typeof value === 'object' && value !== null && value[NAV_ITEM_BRAND] === true;
}
