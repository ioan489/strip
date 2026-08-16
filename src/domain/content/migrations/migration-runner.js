import { ContentError, ContentErrorCode } from '../errors/index.js';

/**
 * Runs schema migrations on raw block content.
 *
 * A migration is a pure function: (previousVersionContent) => nextVersionContent.
 * Migrations are chained in sequence until the content reaches the BlockType's
 * current version.
 *
 * The _version field is authoring metadata — it is stripped before the
 * migrated content is returned, so normalizers and validators never see it.
 *
 * @param {object} rawContent      - the raw block definition, may carry _version
 * @param {object} blockType       - a trusted BlockType (name, version, migrations)
 * @returns {object}               - migrated content without _version
 */
export function runMigrations(rawContent, blockType) {
  const { _version, ...content } = rawContent;
  const fromVersion = _version ?? 1;
  const toVersion = blockType.version;

  if (fromVersion === toVersion) {
    return content;
  }

  if (fromVersion > toVersion) {
    throw new ContentError(
      ContentErrorCode.CONTENT_DEFINITION_ERROR,
      `Content declares version ${fromVersion} but BlockType "${blockType.name}" ` +
        `is only at version ${toVersion}. Update the BlockType to handle this content version.`,
    );
  }

  let migrated = content;

  for (let v = fromVersion; v < toVersion; v++) {
    const migration = blockType.migrations?.[v];

    if (typeof migration !== 'function') {
      throw new ContentError(
        ContentErrorCode.CONTENT_DEFINITION_ERROR,
        `BlockType "${blockType.name}" is at version ${toVersion} but defines no migration ` +
          `from v${v} to v${v + 1}. ` +
          `Add migrations[${v}] = (content) => ({ ...content, newField: default }) ` +
          `to handle legacy content authored against the old schema.`,
      );
    }

    migrated = migration(migrated);
  }

  return migrated;
}
