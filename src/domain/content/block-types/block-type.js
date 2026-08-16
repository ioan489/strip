import { deepFreeze } from '../../../lib/deep-freeze.js';
import { ContentError, ContentErrorCode } from '../errors/index.js';

/**
 * Private brand.
 *
 * Ensures only createBlockType() can create trusted BlockType instances.
 */
const BLOCK_TYPE_BRAND = Symbol('BlockType');

/**
 * Create an immutable BlockType.
 *
 * A BlockType describes the schema rules for one kind of content block
 * (hero, feature-grid, logo-cloud, etc.).
 *
 * @param {{
 *   name: string;
 *   version: number;
 *   validate: (content: object) => { valid: boolean, errors: object[] }
 *   normalize?: (content: object) => object;
 *   migrations?: { [key: number]: (content: object) => object };
 * }} input
 *
 * @returns {Readonly<{
 *   name: string;
 *   version: number;
 *   migrations: { [key: number]: (content: object) => object };
 *   validate(content: object): { valid: boolean, errors: object[] };
 *   normalize(content: object): object;
 * }>}
 */
export function createBlockType(input) {
  validateInput(input);

  const blockType = {
    name: input.name.trim(),
    version: input.version,
    migrations: input.migrations ?? {},
    validate: input.validate,
    normalize: input.normalize ?? identity,
  };

  Object.defineProperty(blockType, BLOCK_TYPE_BRAND, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return deepFreeze(blockType);
}

/**
 * Returns true only for BlockTypes created by createBlockType().
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isBlockType(value) {
  return typeof value === 'object' && value !== null && value[BLOCK_TYPE_BRAND] === true;
}

/**
 * Validate BlockType metadata.
 *
 * @param {unknown} input
 */
function validateInput(input) {
  if (!isPlainObject(input)) {
    throw new ContentError(
      ContentErrorCode.INVALID_BLOCK_TYPE,
      'BlockType definition must be an object.',
    );
  }

  validateName(input.name);
  validateVersion(input.version);
  if (input.migrations !== undefined) {
    validateMigrations(input.migrations, input.version);
  }
  validateValidate(input.validate);
  if (input.normalize !== undefined) {
    validateNormalize(input.normalize);
  }
}

function validateName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ContentError(
      ContentErrorCode.INVALID_BLOCK_TYPE,
      'BlockType name must be a non-empty string.',
    );
  }
}

function validateVersion(version) {
  if (!Number.isInteger(version) || version < 1) {
    throw new ContentError(
      ContentErrorCode.INVALID_BLOCK_TYPE,
      'BlockType version must be an integer greater than zero.',
    );
  }
}

function validateMigrations(migrations, version) {
  if (!isPlainObject(migrations)) {
    throw new ContentError(
      ContentErrorCode.INVALID_BLOCK_TYPE,
      'BlockType migrations must be a plain object if provided.',
    );
  }

  for (const [key, fn] of Object.entries(migrations)) {
    const fromVersion = Number(key);

    if (!Number.isInteger(fromVersion) || fromVersion < 1) {
      throw new ContentError(
        ContentErrorCode.INVALID_BLOCK_TYPE,
        `Migration key "${key}" must be a positive integer (the version being migrated FROM).`,
      );
    }

    if (fromVersion >= version) {
      throw new ContentError(
        ContentErrorCode.INVALID_BLOCK_TYPE,
        `Migration key ${fromVersion} must be less than the current BlockType version ${version}. ` +
          `Migrations describe transitions TO the current version, not beyond it.`,
      );
    }

    if (typeof fn !== 'function') {
      throw new ContentError(
        ContentErrorCode.INVALID_BLOCK_TYPE,
        `migrations[${fromVersion}] must be a function.`,
      );
    }
  }
}

function validateValidate(fn) {
  if (typeof fn !== 'function') {
    throw new ContentError(
      ContentErrorCode.INVALID_BLOCK_TYPE,
      'BlockType must define a validate() function.',
    );
  }
}

function validateNormalize(fn) {
  if (typeof fn !== 'function') {
    throw new ContentError(ContentErrorCode.INVALID_BLOCK_TYPE, 'normalize must be a function.');
  }
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function identity(value) {
  return value;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}
