/**
 * deep-freeze.js
 *
 * Recursively freezes an object graph, making it deeply immutable.
 *
 * Why this exists:
 *   Object.freeze() is shallow — nested objects and arrays remain mutable.
 *   The Content Engine requires strong immutability guarantees so that domain
 *   objects (Page, Block, etc.) cannot be modified after construction.
 *
 * Design goals:
 *   - Freeze nested objects and arrays.
 *   - Handle cyclic references safely.
 *   - Preserve object prototypes.
 *   - Avoid unnecessary work for already-frozen objects.
 *   - Work with Maps, Sets, Dates, and custom class instances.
 *
 * Example:
 *   const obj = deepFreeze({
 *     hero: { headline: 'Payments' },
 *     items: [{ id: 1 }]
 *   });
 *
 *   obj.hero.headline = 'Changed'; // TypeError in strict mode
 *   obj.items.push({ id: 2 });     // TypeError in strict mode
 */

/**
 * Deeply freeze an object graph.
 *
 * @template T
 * @param {T} value - The value to freeze. Primitives are returned unchanged.
 * @returns {Readonly<T>} The deeply frozen value.
 */
export function deepFreeze(value) {
  return freezeRecursive(value, new WeakSet());
}

/**
 * Internal recursive freezer.
 *
 * @template T
 * @param {T} value
 * @param {WeakSet<object>} seen - Tracks visited objects to prevent infinite recursion.
 * @returns {Readonly<T>}
 */
function freezeRecursive(value, seen) {
  // Primitives and functions are returned as-is. Functions can still be frozen
  // by Object.freeze below if desired, but they don't contain mutable state
  // relevant to our domain models.
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return value;
  }

  // Avoid infinite recursion on cyclic graphs.
  if (seen.has(value)) {
    return value;
  }

  seen.add(value);

  // Freeze Map contents.
  if (value instanceof Map) {
    for (const [key, mapValue] of value.entries()) {
      freezeRecursive(key, seen);
      freezeRecursive(mapValue, seen);
    }
  }

  // Freeze Set contents.
  if (value instanceof Set) {
    for (const item of value.values()) {
      freezeRecursive(item, seen);
    }
  }

  // Freeze all own properties (including non-enumerable ones).
  for (const property of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, property);

    // Skip properties without a value (e.g. getters/setters).
    if (!descriptor || !('value' in descriptor)) continue;

    freezeRecursive(descriptor.value, seen);
  }

  // Freeze the object itself last, after all nested values are frozen.
  if (!Object.isFrozen(value)) {
    Object.freeze(value);
  }

  return value;
}
