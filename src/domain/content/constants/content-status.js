/**
 * content-status.js
 *
 * Canonical publication states for content documents.
 *
 * This module defines the lifecycle states understood by the Content Engine.
 * Every page, document, and future content type must use one of these values.
 *
 * The object is deeply immutable to guarantee a single source of truth across
 * the framework.
 *
 * This module intentionally contains no behavior. It defines vocabulary only.
 */

import { deepFreeze } from '../../../lib/deep-freeze.js';

/**
 * Canonical publication states.
 *
 * @readonly
 * @enum {string}
 */
export const ContentStatus = deepFreeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
});
