import { createBlock, createPage } from '../models';
import { createValidationCollector, createValidationError } from '../validation';
import { ContentError, ContentErrorCode, ContentValidationError } from '../errors';
import { runMigrations } from '../migrations/migration-runner.js';

/**
 * Creates the application's PageFactory.
 *
 * The factory is the only place that transforms raw authoring modules
 * into trusted, immutable Page aggregates. It does so by:
 *
 *  1. delegating normalisation and validation to BlockTypes
 *  2. aggregating all validation errors (never fails on first error)
 *  3. prefixing error paths with the block index
 *  4. constructing trusted Block and Page objects
 *
 * It knows nothing about HTTP, rendering, or persistence.
 */
export function createPageFactory({ blockTypeRegistry }) {
  if (!blockTypeRegistry) {
    throw new ContentError(ContentErrorCode.INVALID_ARGUMENT, 'blockTypeRegistry is required.');
  }

  /**
   * Builds one trusted Block from a raw definition.
   *
   * If validation fails, the function returns the validation result
   * and a null block. The caller will collect these and fail the
   * whole page if any block is invalid.
   */
  function tryBuildBlock(definition, index) {
    const blockType = blockTypeRegistry.get(definition.type);
    if (!blockType) {
      const issue = createValidationCollector()
        .check(
          createValidationError({
            path: `blocks[${index}].type`,
            message: `Unknown block type "${definition.type}".`,
            code: ContentErrorCode.CONTENT_NOT_FOUND,
          }),
        )
        .result();
      return { validation: issue, block: null };
    }

    // 1. Run schema migrations (v_authored → v_current, strips _version)
    let migratedContent;
    try {
      migratedContent = runMigrations(definition, blockType);
    } catch (error) {
      const issue = createValidationCollector()
        .check(
          createValidationError({
            path: `blocks[${index}]`,
            message: error.message,
            code: ContentErrorCode.CONTENT_DEFINITION_ERROR,
          }),
        )
        .result();
      return { validation: issue, block: null };
    }

    // 2. Normalise the raw content (e.g. trim strings)
    const normalizedContent = blockType.normalize(migratedContent);

    // 3. Validate the normalised content
    const blockValidation = blockType.validate(normalizedContent);

    // 4. Prefix all error paths with the block’s position
    const prefixedErrors = blockValidation.errors.map((err) =>
      createValidationError({
        path: `blocks[${index}].${err.path}`,
        message: err.message,
        code: err.code,
        suggestion: err.suggestion,
      }),
    );
    const prefixedValidation = {
      valid: blockValidation.valid,
      errors: prefixedErrors,
    };

    if (!prefixedValidation.valid) {
      return { validation: prefixedValidation, block: null };
    }

    // 5. Create the immutable Block
    const block = createBlock({
      id: `block-${index}`, // deterministic ID for static generation
      type: blockType.name,
      content: normalizedContent,
      // settings could be forwarded if your definitions carry them:
      // settings: definition.settings ?? {},
    });

    return { validation: prefixedValidation, block };
  }

  return Object.freeze({
    /**
     * Transforms an authoring module (raw JS object) into a Page aggregate.
     *
     * @param {object} module – the raw page module (e.g. from a content folder)
     * @returns {Page}
     * @throws {ContentValidationError} if any block fails validation
     */
    createFromModule(module) {
      // Guard the module shape
      if (!module || typeof module !== 'object') {
        throw new ContentError(
          ContentErrorCode.CONTENT_DEFINITION_ERROR,
          'Page module must be an object.',
        );
      }

      if (typeof module.slug !== 'string' || module.slug.trim().length === 0) {
        throw new ContentError(
          ContentErrorCode.CONTENT_DEFINITION_ERROR,
          'Page module must export a non-empty string slug.',
        );
      }

      if (!Array.isArray(module.blocks)) {
        throw new ContentError(
          ContentErrorCode.CONTENT_DEFINITION_ERROR,
          `Page "${module.slug}" must export a blocks array.`,
        );
      }

      // Collect all block-level validations
      const globalCollector = createValidationCollector();
      const runtimeBlocks = [];

      for (let i = 0; i < module.blocks.length; i++) {
        const { validation, block } = tryBuildBlock(module.blocks[i], i);
        globalCollector.merge(validation);
        if (block) {
          runtimeBlocks.push(block);
        }
      }

      const finalValidation = globalCollector.result();

      if (!finalValidation.valid) {
        throw new ContentValidationError(module.slug, finalValidation);
      }

      // All blocks valid → build the immutable Page
      return createPage({
        slug: module.slug,
        meta: module.meta ?? {}, // page.js expects an object with title
        blocks: runtimeBlocks,
        status: module.status,
      });
    },
  });
}
