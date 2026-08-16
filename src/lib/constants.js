/**
 * constants.js — shared constants
 *
 * Centralised in one place so that server.js, render-page.js, and build-ssg.js
 * all agree on what constitutes an HTTP method, avoiding silent drift.
 */

/** HTTP methods that a page module may export as API route handlers. */
export const HTTP_METHODS = Object.freeze([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
]);
