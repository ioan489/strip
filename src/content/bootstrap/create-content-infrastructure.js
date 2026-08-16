/**
 * Creates the internal content infrastructure.
 *
 * This object contains the low-level content building blocks.
 *
 * It is NOT exposed to pages/components.
 *
 * @param {object} options
 * @param {object} options.pageFactory
 * @param {object} options.pages
 * @param {object} options.blockTypeRegistry
 *
 * @returns {Readonly<object>}
 */
export function createContentInfrastructure({ pageFactory, pages, blockTypeRegistry }) {
  return Object.freeze({
    pageFactory,
    pages,
    blockTypeRegistry,
  });
}
