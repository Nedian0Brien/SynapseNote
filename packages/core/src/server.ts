/**
 * Node-only sub-export for `@nedian0brien/synapsenote-core`.
 *
 * The exports in here statically import `node:fs`, `node:fs/promises`,
 * `node:os`, `node:path`, and `node:crypto` — bundling them into a browser
 * build via Vite produces "Module 'node:fs' has been externalized" (or
 * `node:crypto`, etc.) runtime errors as soon as a stub property is
 * accessed.
 *
 * Browser consumers (`packages/app`) keep importing from the main barrel
 * (`@nedian0brien/synapsenote-core`); server / cli / desktop main consumers
 * import from `@nedian0brien/synapsenote-core/server` to reach the writers.
 *
 * STOP rule: never re-export anything from this file via `src/index.ts` —
 * the split is the contract.
 */

export {
  type ConfigPathPresence,
  type InspectConfigPathsOptions,
  inspectConfigPaths,
} from './config/inspect-config-paths.ts';
export {
  type ReadConfigSafelyOptions,
  type ReadConfigSafelyResult,
  readConfigSafely,
} from './config/read-config-safely.ts';
export {
  DEFAULT_LOGS_MAX_BYTES,
  DEFAULT_SPANS_MAX_BYTES,
  DEFAULT_TELEMETRY_ATTRIBUTE_DENYLIST,
} from './config/schema.ts';
export {
  resolveConfigPath,
  USER_CONFIG_FILENAME,
  type WriteConfigPatchOptions,
  type WriteConfigPatchResult,
  type WriteConfigPatchSuccess,
  writeConfigPatch,
} from './config/write-config-patch.ts';
export {
  createDatabasePortableBundle,
  DATABASE_INTERCHANGE_MAX_FILES,
  DATABASE_INTERCHANGE_MAX_TEXT_BYTES,
  DATABASE_PORTABLE_BUNDLE_SCHEMA,
  DATABASE_PORTABLE_BUNDLE_VERSION,
  type DatabaseInferredPropertyType,
  type DatabaseMarkdownImportDraft,
  type DatabaseMarkdownImportFile,
  type DatabaseMarkdownImportIssue,
  type DatabaseMarkdownImportPropertyDraft,
  type DatabaseMarkdownImportRecordDraft,
  type DatabasePortableBundle,
  type DatabasePortableBundleAssetEntry,
  type DatabasePortableBundleTextEntry,
  inferDatabaseFromMarkdown,
  parseDatabasePortableBundle,
  parseDatabasePortableBundleJson,
  serializeDatabasePortableBundle,
} from './database/interchange.ts';
export {
  createDatabaseMarkdownTableExport,
  type DatabaseMarkdownCanonicalExportEntry,
  type DatabaseMarkdownComputedSnapshotRecord,
  type DatabaseMarkdownTableExport,
  type DatabaseMarkdownTableExportMode,
} from './database/markdown-table-export.ts';
export {
  type NotionExportDatabase,
  type NotionExportDataSource,
  type NotionExportProperty,
  type NotionExportRecord,
  type NotionExportTemplate,
  type NotionExportView,
  type NotionImportIssue,
  type NotionImportPlan,
  type NotionImportPropertyDraft,
  type NotionNormalizedExport,
  planNotionDatabaseImport,
} from './database/notion-import.ts';
export {
  type AtomicWriteFsAdapter,
  type AtomicWriteOptions,
  type AtomicWriteSyncOptions,
  atomicWriteFile,
  atomicWriteFileSync,
} from './util/atomic-yaml-write.ts';
export {
  FileLockTimeoutError,
  type WithFileLockOptions,
  withFileLock,
  withFileLockSync,
} from './util/file-lock.ts';
