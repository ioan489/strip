import { AsyncLocalStorage } from 'node:async_hooks';

const STORAGE_KEY = Symbol.for('stripe-clone:preview-context');
if (!globalThis[STORAGE_KEY]) {
  globalThis[STORAGE_KEY] = new AsyncLocalStorage();
}
const storage = globalThis[STORAGE_KEY];

/**
 * Run a function inside a preview context.
 * @param {boolean} preview - true if preview mode
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export async function runWithPreview(preview, fn) {
  return storage.run(preview, fn);
}

/**
 * Returns true if the current request is in preview mode.
 * Safe to call outside a context (returns false).
 */
export function isPreview() {
  return storage.getStore() === true;
}
