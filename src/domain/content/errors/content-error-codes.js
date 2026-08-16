import { deepFreeze } from '../../../lib/deep-freeze.js';

export const ContentErrorCode = deepFreeze({
  // Block‑related
  INVALID_BLOCK_TYPE: 'invalid_block_type',
  INVALID_BLOCK: 'invalid_block',
  INVALID_BLOCK_ID: 'invalid_block_id',
  INVALID_BLOCK_CONTENT: 'invalid_block_content',
  INVALID_BLOCK_SETTINGS: 'invalid_block_settings',

  // Page‑related
  INVALID_PAGE: 'invalid_page',
  PAGE_NOT_FOUND: 'page_not_found',

  // Generic
  INVALID_ARGUMENT: 'invalid_argument',
  CONTENT_ALREADY_EXISTS: 'content_already_exists',
  CONTENT_NOT_FOUND: 'content_not_found',
  CONTENT_FROZEN: 'content_frozen',
  CONTENT_VALIDATION_FAILED: 'content_validation_failed',
  CONTENT_DEFINITION_ERROR: 'content_definition_error',
});
