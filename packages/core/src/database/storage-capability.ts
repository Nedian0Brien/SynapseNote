import {
  DATABASE_MANIFEST_LATEST_SUPPORTED_VERSION,
  DATABASE_MANIFEST_SUPPORTED_VERSIONS,
} from './schema.ts';

/**
 * Machine-readable storage compatibility vocabulary shared by every client.
 * A client can make a safe decision before it tries to parse an unknown
 * manifest/table version.
 */
export type DatabaseStorageReadMode = 'full' | 'read_only' | 'unsupported';
export type DatabaseStorageWriteMode =
  | 'v1_record_files'
  | 'v2_markdown_table'
  | 'migration_required'
  | 'unsupported';

export interface DatabaseStorageCapability {
  appProtocolVersion: 1;
  manifestVersion: number;
  tableFormatVersion: number | null;
  read: DatabaseStorageReadMode;
  write: DatabaseStorageWriteMode;
  reason: string;
}

export const DATABASE_STORAGE_CAPABILITY_MATRIX: readonly DatabaseStorageCapability[] = [
  {
    appProtocolVersion: 1,
    manifestVersion: 1,
    tableFormatVersion: null,
    read: 'full',
    write: 'v1_record_files',
    reason: 'V1 record-per-file source; v2 migration is explicit and user-approved',
  },
  {
    appProtocolVersion: 1,
    manifestVersion: 2,
    tableFormatVersion: 2,
    read: 'full',
    write: 'v2_markdown_table',
    reason: 'V2 owner-table source; all writes use the storage-aware table writer',
  },
  {
    appProtocolVersion: 1,
    manifestVersion: 1,
    tableFormatVersion: 2,
    read: 'read_only',
    write: 'migration_required',
    reason: 'A v2 table cannot be activated by a v1 manifest without an explicit migration',
  },
  {
    appProtocolVersion: 1,
    manifestVersion: 2,
    tableFormatVersion: null,
    read: 'read_only',
    write: 'unsupported',
    reason: 'The manifest is v2 but the owner table format is absent or unknown',
  },
];

export const DATABASE_STORAGE_CAPABILITY_UNKNOWN: DatabaseStorageCapability = {
  appProtocolVersion: 1,
  manifestVersion: -1,
  tableFormatVersion: null,
  read: 'unsupported',
  write: 'unsupported',
  reason: 'The manifest or table format version is newer than this client supports',
};

/** Return the capability row for a manifest/table pair without guessing. */
export function databaseStorageCapabilityFor(input: {
  manifestVersion: number;
  tableFormatVersion?: number | null;
}): DatabaseStorageCapability {
  const tableFormatVersion = input.tableFormatVersion ?? null;
  const match = DATABASE_STORAGE_CAPABILITY_MATRIX.find(
    (capability) =>
      capability.manifestVersion === input.manifestVersion &&
      capability.tableFormatVersion === tableFormatVersion,
  );
  if (match) return match;
  return {
    ...DATABASE_STORAGE_CAPABILITY_UNKNOWN,
    manifestVersion: input.manifestVersion,
    tableFormatVersion,
  };
}

/** Capability rows are a public contract; keep this assertion close to it. */
export function assertDatabaseStorageCapabilityContract(): void {
  if (!DATABASE_MANIFEST_SUPPORTED_VERSIONS.includes(1)) {
    throw new Error('Capability matrix must describe manifest version 1');
  }
  if (!DATABASE_MANIFEST_SUPPORTED_VERSIONS.includes(DATABASE_MANIFEST_LATEST_SUPPORTED_VERSION)) {
    throw new Error('Capability matrix must describe the latest supported manifest version');
  }
  for (const version of DATABASE_MANIFEST_SUPPORTED_VERSIONS) {
    const row = DATABASE_STORAGE_CAPABILITY_MATRIX.find(
      (capability) => capability.manifestVersion === version && capability.read === 'full',
    );
    if (!row) throw new Error(`Capability matrix is missing manifest version ${version}`);
  }
}
