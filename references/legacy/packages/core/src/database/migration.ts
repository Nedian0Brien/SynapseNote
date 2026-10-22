import { parseDocument } from 'yaml';
import {
  DATABASE_MANIFEST_MAX_ALIAS_COUNT,
  DATABASE_MANIFEST_MAX_BYTES,
  databaseManifestByteLength,
  parseDatabaseManifestYaml,
} from './manifest.ts';
import {
  DATABASE_MANIFEST_CURRENT_VERSION,
  DATABASE_MANIFEST_SUPPORTED_VERSIONS,
  type DatabaseManifestVersion,
} from './schema.ts';

export interface DatabaseManifestMigrationDefinition {
  id: string;
  fromVersion: DatabaseManifestVersion;
  toVersion: DatabaseManifestVersion;
  kind: 'identity' | 'upgrade';
  lossless: boolean;
  preservesSourceBytes: boolean;
}

/**
 * Canonical directed migration matrix. Version 1 is the baseline, so its only
 * valid migration is a byte-preserving identity. Adding a supported version
 * requires adding its canonical edges and extending the conformance test.
 */
export const DATABASE_MANIFEST_MIGRATIONS: readonly DatabaseManifestMigrationDefinition[] = [
  {
    id: 'database-manifest-v1-identity',
    fromVersion: 1,
    toVersion: 1,
    kind: 'identity',
    lossless: true,
    preservesSourceBytes: true,
  },
];

export type DatabaseManifestMigrationBlockCode =
  | 'invalid_manifest'
  | 'invalid_source_version'
  | 'unsupported_source_version'
  | 'unsupported_target_version'
  | 'migration_path_missing';

export type DatabaseManifestMigrationPlan =
  | {
      status: 'not_needed';
      sourceVersion: DatabaseManifestVersion;
      targetVersion: DatabaseManifestVersion;
      migrationIds: readonly string[];
      lossless: true;
      changed: false;
      outputYaml: string;
    }
  | {
      status: 'blocked';
      sourceVersion: number | null;
      targetVersion: number;
      code: DatabaseManifestMigrationBlockCode;
      message: string;
      migrationIds: readonly string[];
      lossless: false;
      changed: false;
      outputYaml: null;
    };

function declaredVersion(yaml: string): number | null {
  if (databaseManifestByteLength(yaml) > DATABASE_MANIFEST_MAX_BYTES) return null;
  const document = parseDocument(yaml);
  if (document.errors.length > 0) return null;
  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: DATABASE_MANIFEST_MAX_ALIAS_COUNT });
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const version = (value as { version?: unknown }).version;
  return Number.isSafeInteger(version) && Number(version) >= 1 ? Number(version) : null;
}

function isSupportedVersion(version: number): version is DatabaseManifestVersion {
  return (DATABASE_MANIFEST_SUPPORTED_VERSIONS as readonly number[]).includes(version);
}

/**
 * Produce a non-mutating canonical migration plan. Unsupported versions never
 * pass through the v1 parser and never receive guessed or lossy conversions.
 */
export function planDatabaseManifestMigration(
  yaml: string,
  targetVersion: number = DATABASE_MANIFEST_CURRENT_VERSION,
): DatabaseManifestMigrationPlan {
  const sourceVersion = declaredVersion(yaml);
  const blocked = (
    code: DatabaseManifestMigrationBlockCode,
    message: string,
  ): DatabaseManifestMigrationPlan => ({
    status: 'blocked',
    sourceVersion,
    targetVersion,
    code,
    message,
    migrationIds: [],
    lossless: false,
    changed: false,
    outputYaml: null,
  });

  if (!isSupportedVersion(targetVersion)) {
    return blocked(
      'unsupported_target_version',
      `Database manifest target version ${targetVersion} is not supported`,
    );
  }
  if (sourceVersion === null) {
    return blocked('invalid_source_version', 'Database manifest has no valid integer version');
  }
  if (!isSupportedVersion(sourceVersion)) {
    return blocked(
      'unsupported_source_version',
      `Database manifest source version ${sourceVersion} is not supported`,
    );
  }

  const parsed = parseDatabaseManifestYaml(yaml);
  if (!parsed.ok) return blocked('invalid_manifest', parsed.error);
  const identity = DATABASE_MANIFEST_MIGRATIONS.find(
    (migration) => migration.fromVersion === sourceVersion && migration.toVersion === targetVersion,
  );
  if (!identity) {
    return blocked(
      'migration_path_missing',
      `No canonical migration path exists from version ${sourceVersion} to ${targetVersion}`,
    );
  }
  return {
    status: 'not_needed',
    sourceVersion,
    targetVersion,
    migrationIds: [identity.id],
    lossless: true,
    changed: false,
    outputYaml: yaml,
  };
}
