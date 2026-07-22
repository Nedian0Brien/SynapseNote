import { createHash } from 'node:crypto';
import type { Dirent, Stats } from 'node:fs';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  type DatabaseRecordId,
  DatabaseStableKeySchema,
  ensureDatabaseRecordIdentity,
  isRecordPathInSource,
  materializeDatabaseRecord,
  parseDatabaseManifestYaml,
  serializeDatabaseManifestYaml,
  updateDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import {
  type AtomicWriteFsAdapter,
  atomicWriteFile,
  FileLockTimeoutError,
  withFileLock,
} from '@nedian0brien/synapsenote-core/server';
import { tracedAtomicFs, tracedMkdir, tracedRename, tracedUnlink } from './fs-traced.ts';

export const DATABASE_MANIFEST_RELATIVE_DIR = '.ok/databases';

export type DatabaseStoreDiagnosticCode =
  | 'unreadable_manifest'
  | 'manifest_symlink'
  | 'invalid_manifest'
  | 'filename_key_mismatch'
  | 'duplicate_database_id'
  | 'duplicate_database_key';

export interface DatabaseStoreDiagnostic {
  code: DatabaseStoreDiagnosticCode;
  /** Manifest basename only. Never an absolute or unresolved filesystem path. */
  file: string;
  message: string;
  manifestCode?: string;
  schemaPath?: readonly (string | number)[];
  line?: number | null;
  column?: number | null;
}

export interface DatabaseStoreSnapshot {
  databases: readonly DatabaseDefinition[];
  diagnostics: readonly DatabaseStoreDiagnostic[];
  revision: string;
  loadedAt: string;
}

export type DatabaseStoreErrorCode =
  | 'invalid_definition'
  | 'invalid_key'
  | 'not_found'
  | 'conflict'
  | 'store_invalid'
  | 'lock_timeout'
  | 'io_error'
  | 'invalid_record_path'
  | 'record_not_found'
  | 'record_symlink'
  | 'record_identity_error';

export class DatabaseStoreError extends Error {
  readonly code: DatabaseStoreErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseStoreErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseStoreError';
    this.code = code;
    this.details = details;
  }
}

export interface DatabaseStoreFs {
  readdir(path: string): Promise<Dirent[]>;
  readFile(path: string): Promise<string>;
  lstat(path: string): Promise<Stats>;
  realpath(path: string): Promise<string>;
  mkdir(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  atomic: AtomicWriteFsAdapter;
}

const DEFAULT_FS: DatabaseStoreFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, 'utf-8'),
  lstat,
  realpath,
  mkdir: async (path) => {
    await tracedMkdir(path, { recursive: true });
  },
  rename: tracedRename,
  unlink: tracedUnlink,
  atomic: tracedAtomicFs,
};

export interface CreateDatabaseStoreOptions {
  projectDir: string;
  contentDir: string;
  /** Test-only filesystem seam; production uses traced writes. */
  fs?: Partial<DatabaseStoreFs>;
  /** Test-only UUID seam for record identity assignment. */
  generateUuid?: () => string;
}

export interface AssignDatabaseRecordIdInput {
  databaseId: string;
  sourceId: string;
  /** Content-root-relative Markdown or MDX path. */
  recordPath: string;
  /** Durable importers may freeze an ID before writing so rollback is exact. */
  recordId?: DatabaseRecordId;
}

export interface AssignDatabaseRecordIdResult {
  databaseId: string;
  sourceId: string;
  recordPath: string;
  recordId: DatabaseRecordId;
  changed: boolean;
}

export type DatabaseOnboardingAction = 'include' | 'exclude' | 'modify' | 'reject';

export type DatabaseOnboardingReasonCode =
  | 'ready'
  | 'record_identity_required'
  | 'required_property_missing'
  | 'unsupported_extension'
  | 'subfolder_excluded'
  | 'symlink_rejected'
  | 'non_regular_file'
  | 'unreadable_file'
  | 'malformed_frontmatter'
  | 'record_identity_conflict'
  | 'invalid_record';

export interface DatabaseOnboardingReason {
  code: DatabaseOnboardingReasonCode;
  message: string;
  propertyId?: string;
  propertyKey?: string;
}

export type DatabaseOnboardingPlannedChange =
  | { type: 'assign_record_id' }
  | { type: 'provide_required_property'; propertyId: string; propertyKey: string };

export interface DatabaseOnboardingItem {
  /** Content-root-relative path. Absolute paths are never returned. */
  path: string;
  action: DatabaseOnboardingAction;
  reasons: readonly DatabaseOnboardingReason[];
  plannedChanges: readonly DatabaseOnboardingPlannedChange[];
}

export interface PreviewDatabaseSourceOnboardingInput {
  databaseId: string;
  sourceId: string;
  /** Maximum number of file-like entries returned. Defaults to 10,000. */
  maxEntries?: number;
}

export interface DatabaseOnboardingPreview {
  databaseId: string;
  sourceId: string;
  sourceFolder: string;
  items: readonly DatabaseOnboardingItem[];
  summary: Readonly<Record<DatabaseOnboardingAction, number>>;
  complete: boolean;
  entryLimit: number;
}

interface ManifestCandidate {
  file: string;
  definition: DatabaseDefinition;
}

function emptySnapshot(): DatabaseStoreSnapshot {
  return {
    databases: [],
    diagnostics: [],
    revision: 'sha256:empty',
    loadedAt: new Date(0).toISOString(),
  };
}

function cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition {
  return structuredClone(definition);
}

function cloneSnapshot(snapshot: DatabaseStoreSnapshot): DatabaseStoreSnapshot {
  return structuredClone(snapshot);
}

function errnoCode(error: unknown): string | undefined {
  return error !== null && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function asStoreIoError(operation: string, error: unknown): DatabaseStoreError {
  if (error instanceof DatabaseStoreError) return error;
  if (error instanceof FileLockTimeoutError) {
    return new DatabaseStoreError(
      'lock_timeout',
      `Database store ${operation} could not acquire its lock`,
      { operation },
      error,
    );
  }
  return new DatabaseStoreError(
    'io_error',
    `Database store ${operation} failed`,
    { operation, errno: errnoCode(error) },
    error,
  );
}

/**
 * Project-scoped canonical manifest store. Public inputs and outputs contain
 * database IDs, stable keys, and content-relative record paths only; absolute
 * filesystem paths remain private implementation details.
 */
export class DatabaseStore {
  readonly #databaseDir: string;
  readonly #projectDir: string;
  readonly #contentDir: string;
  readonly #lockPath: string;
  readonly #fs: DatabaseStoreFs;
  readonly #generateUuid: (() => string) | undefined;
  #snapshot: DatabaseStoreSnapshot = emptySnapshot();

  constructor(options: CreateDatabaseStoreOptions) {
    this.#projectDir = resolve(options.projectDir);
    this.#databaseDir = resolve(this.#projectDir, DATABASE_MANIFEST_RELATIVE_DIR);
    this.#contentDir = resolve(options.contentDir);
    this.#lockPath = resolve(this.#databaseDir, '.store.lock');
    this.#fs = {
      ...DEFAULT_FS,
      ...options.fs,
      atomic: options.fs?.atomic ?? DEFAULT_FS.atomic,
    };
    this.#generateUuid = options.generateUuid;
  }

  snapshot(): DatabaseStoreSnapshot {
    return cloneSnapshot(this.#snapshot);
  }

  list(): readonly DatabaseDefinition[] {
    return this.#snapshot.databases.map(cloneDefinition);
  }

  getById(databaseId: string): DatabaseDefinition | null {
    const found = this.#snapshot.databases.find((database) => database.id === databaseId);
    return found ? cloneDefinition(found) : null;
  }

  getByKey(key: string): DatabaseDefinition | null {
    const found = this.#snapshot.databases.find((database) => database.key === key);
    return found ? cloneDefinition(found) : null;
  }

  async reload(): Promise<DatabaseStoreSnapshot> {
    try {
      const exists = await this.#databaseDirectoryExists();
      if (!exists) {
        this.#snapshot = {
          ...emptySnapshot(),
          loadedAt: new Date().toISOString(),
        };
        return this.snapshot();
      }
      await this.#assertDatabaseDirectorySafe();
      return await withFileLock(this.#lockPath, async () => {
        this.#snapshot = await this.#loadUnlocked();
        return this.snapshot();
      });
    } catch (error) {
      throw asStoreIoError('reload', error);
    }
  }

  async create(input: unknown): Promise<DatabaseDefinition> {
    const definition = this.#parseDefinition(input);
    return this.#withWriteLock('create', async () => {
      const snapshot = await this.#loadValidSnapshotForWrite();
      if (snapshot.databases.some((database) => database.id === definition.id)) {
        throw new DatabaseStoreError('conflict', `Database ID "${definition.id}" already exists`, {
          databaseId: definition.id,
        });
      }
      if (snapshot.databases.some((database) => database.key === definition.key)) {
        throw new DatabaseStoreError(
          'conflict',
          `Database key "${definition.key}" already exists`,
          { key: definition.key },
        );
      }

      await this.#writeManifest(definition.key, serializeDatabaseManifestYaml(definition));
      this.#snapshot = await this.#loadUnlocked();
      return cloneDefinition(definition);
    });
  }

  async update(databaseId: string, input: unknown): Promise<DatabaseDefinition> {
    const definition = this.#parseDefinition(input);
    return this.#withWriteLock('update', async () => {
      const snapshot = await this.#loadValidSnapshotForWrite();
      const current = snapshot.databases.find((database) => database.id === databaseId);
      if (!current) this.#throwNotFound(databaseId);
      if (definition.id !== databaseId) {
        throw new DatabaseStoreError(
          'invalid_definition',
          'A database update cannot change its stable ID',
          { databaseId, proposedDatabaseId: definition.id },
        );
      }
      if (definition.key !== current.key) {
        throw new DatabaseStoreError(
          'invalid_definition',
          'Use renameKey() to change a database stable key',
          { databaseId, currentKey: current.key, proposedKey: definition.key },
        );
      }

      const previousYaml = await this.#fs.readFile(this.#manifestPath(current.key));
      await this.#writeManifest(current.key, updateDatabaseManifestYaml(previousYaml, definition));
      this.#snapshot = await this.#loadUnlocked();
      return cloneDefinition(definition);
    });
  }

  async renameKey(databaseId: string, newKeyInput: string): Promise<DatabaseDefinition> {
    const parsedKey = DatabaseStableKeySchema.safeParse(newKeyInput);
    if (!parsedKey.success) {
      throw new DatabaseStoreError('invalid_key', `Invalid database key "${newKeyInput}"`, {
        key: newKeyInput,
      });
    }
    const newKey = parsedKey.data;

    return this.#withWriteLock('rename', async () => {
      const snapshot = await this.#loadValidSnapshotForWrite();
      const current = snapshot.databases.find((database) => database.id === databaseId);
      if (!current) this.#throwNotFound(databaseId);
      if (current.key === newKey) return cloneDefinition(current);
      if (snapshot.databases.some((database) => database.key === newKey)) {
        throw new DatabaseStoreError('conflict', `Database key "${newKey}" already exists`, {
          key: newKey,
        });
      }

      const renamed = DatabaseDefinitionSchema.parse({ ...current, key: newKey });
      const previousYaml = await this.#fs.readFile(this.#manifestPath(current.key));
      await this.#writeManifest(current.key, updateDatabaseManifestYaml(previousYaml, renamed));
      try {
        await this.#fs.rename(this.#manifestPath(current.key), this.#manifestPath(newKey));
      } catch (error) {
        try {
          await this.#writeManifest(current.key, previousYaml);
        } catch (rollbackError) {
          throw new DatabaseStoreError(
            'io_error',
            `Database "${databaseId}" rename failed and its manifest rollback also failed`,
            { operation: 'rename', databaseId, errno: errnoCode(error) },
            rollbackError,
          );
        }
        throw error;
      }

      this.#snapshot = await this.#loadUnlocked();
      return cloneDefinition(renamed);
    });
  }

  async delete(databaseId: string): Promise<DatabaseDefinition> {
    return this.#withWriteLock('delete', async () => {
      const snapshot = await this.#loadValidSnapshotForWrite();
      const current = snapshot.databases.find((database) => database.id === databaseId);
      if (!current) this.#throwNotFound(databaseId);
      await this.#fs.unlink(this.#manifestPath(current.key));
      this.#snapshot = await this.#loadUnlocked();
      return cloneDefinition(current);
    });
  }

  async assignRecordId(input: AssignDatabaseRecordIdInput): Promise<AssignDatabaseRecordIdResult> {
    return this.#withWriteLock('assign-record-id', async () => {
      const snapshot = await this.#loadValidSnapshotForWrite();
      const database = snapshot.databases.find((candidate) => candidate.id === input.databaseId);
      if (!database) this.#throwNotFound(input.databaseId);
      const source = database.sources.find((candidate) => candidate.id === input.sourceId);
      if (!source) {
        throw new DatabaseStoreError(
          'not_found',
          `Data source "${input.sourceId}" was not found in database "${input.databaseId}"`,
          { databaseId: input.databaseId, sourceId: input.sourceId },
        );
      }
      if (!isRecordPathInSource(input.recordPath, source)) {
        throw new DatabaseStoreError(
          'invalid_record_path',
          `Record path "${input.recordPath}" is outside data source "${input.sourceId}"`,
          { sourceId: input.sourceId, recordPath: input.recordPath },
        );
      }

      const recordPath = resolve(this.#contentDir, input.recordPath);
      let stats: Stats;
      let markdown: string;
      try {
        stats = await this.#fs.lstat(recordPath);
        if (stats.isSymbolicLink()) {
          throw new DatabaseStoreError(
            'record_symlink',
            `Record "${input.recordPath}" is a symbolic link and cannot receive database metadata`,
            { recordPath: input.recordPath },
          );
        }
        if (!stats.isFile()) {
          throw new DatabaseStoreError(
            'record_not_found',
            `Record "${input.recordPath}" is not a regular file`,
            { recordPath: input.recordPath },
          );
        }
        const [contentRealPath, recordRealPath] = await Promise.all([
          this.#fs.realpath(this.#contentDir),
          this.#fs.realpath(recordPath),
        ]);
        const escaped = relative(contentRealPath, recordRealPath);
        if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
          throw new DatabaseStoreError(
            'invalid_record_path',
            `Record path "${input.recordPath}" resolves outside the content directory`,
            { recordPath: input.recordPath },
          );
        }
        markdown = await this.#fs.readFile(recordPath);
      } catch (error) {
        if (error instanceof DatabaseStoreError) throw error;
        if (errnoCode(error) === 'ENOENT') {
          throw new DatabaseStoreError(
            'record_not_found',
            `Record "${input.recordPath}" does not exist`,
            { recordPath: input.recordPath },
            error,
          );
        }
        throw error;
      }

      const ensured = ensureDatabaseRecordIdentity({
        markdown,
        databaseId: database.id,
        sourceId: source.id,
        ...(input.recordId ? { recordId: input.recordId } : {}),
        generateUuid: this.#generateUuid,
      });
      if (!ensured.ok) {
        throw new DatabaseStoreError('record_identity_error', ensured.message, {
          databaseId: database.id,
          sourceId: source.id,
          recordPath: input.recordPath,
          identityError: ensured.code,
        });
      }

      if (ensured.changed) {
        await atomicWriteFile(recordPath, ensured.markdown, {
          fs: this.#fs.atomic,
          mode: stats.mode & 0o777,
        });
      }

      return {
        databaseId: database.id,
        sourceId: source.id,
        recordPath: input.recordPath,
        recordId: ensured.recordId,
        changed: ensured.changed,
      };
    });
  }

  async previewSourceOnboarding(
    input: PreviewDatabaseSourceOnboardingInput,
  ): Promise<DatabaseOnboardingPreview> {
    const entryLimit = input.maxEntries ?? 10_000;
    if (!Number.isSafeInteger(entryLimit) || entryLimit < 1 || entryLimit > 100_000) {
      throw new DatabaseStoreError(
        'invalid_definition',
        'Onboarding preview maxEntries must be an integer from 1 to 100000',
        { maxEntries: input.maxEntries },
      );
    }

    const snapshot = await this.reload();
    if (snapshot.diagnostics.length > 0) {
      throw new DatabaseStoreError(
        'store_invalid',
        'Database manifests contain diagnostics; repair them before onboarding records',
        { diagnosticCount: snapshot.diagnostics.length },
      );
    }
    const database = snapshot.databases.find((candidate) => candidate.id === input.databaseId);
    if (!database) this.#throwNotFound(input.databaseId);
    const source = database.sources.find((candidate) => candidate.id === input.sourceId);
    if (!source) {
      throw new DatabaseStoreError(
        'not_found',
        `Data source "${input.sourceId}" was not found in database "${input.databaseId}"`,
        { databaseId: input.databaseId, sourceId: input.sourceId },
      );
    }

    const sourceRoot = resolve(this.#contentDir, source.folder === '.' ? '' : source.folder);
    await this.#assertOnboardingSourceRoot(source.folder, sourceRoot);

    const items: DatabaseOnboardingItem[] = [];
    let complete = true;
    const walk = async (directory: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await this.#fs.readdir(directory);
      } catch (error) {
        throw new DatabaseStoreError(
          'io_error',
          `Data source folder "${source.folder}" could not be scanned`,
          { operation: 'onboarding-preview', errno: errnoCode(error) },
          error,
        );
      }
      entries.sort((left, right) => left.name.localeCompare(right.name));

      for (const entry of entries) {
        if (items.length >= entryLimit) {
          complete = false;
          return;
        }
        const absolutePath = resolve(directory, entry.name);
        const recordPath = relative(this.#contentDir, absolutePath).split(sep).join('/');

        if (entry.isSymbolicLink()) {
          items.push({
            path: recordPath,
            action: 'reject',
            reasons: [
              {
                code: 'symlink_rejected',
                message: `Symbolic link "${recordPath}" cannot be onboarded`,
              },
            ],
            plannedChanges: [],
          });
          continue;
        }
        if (entry.isDirectory()) {
          await walk(absolutePath);
          if (!complete) return;
          continue;
        }
        if (!entry.isFile()) {
          items.push({
            path: recordPath,
            action: 'reject',
            reasons: [
              {
                code: 'non_regular_file',
                message: `Path "${recordPath}" is not a regular file`,
              },
            ],
            plannedChanges: [],
          });
          continue;
        }
        if (!recordPath.endsWith('.md') && !recordPath.endsWith('.mdx')) {
          items.push({
            path: recordPath,
            action: 'exclude',
            reasons: [
              {
                code: 'unsupported_extension',
                message: `File "${recordPath}" is not Markdown or MDX`,
              },
            ],
            plannedChanges: [],
          });
          continue;
        }
        if (!isRecordPathInSource(recordPath, source)) {
          items.push({
            path: recordPath,
            action: 'exclude',
            reasons: [
              {
                code: 'subfolder_excluded',
                message: `File "${recordPath}" is in a subfolder excluded by this data source`,
              },
            ],
            plannedChanges: [],
          });
          continue;
        }

        items.push(
          await this.#previewOnboardingRecord(database, source.id, recordPath, absolutePath),
        );
      }
    };

    await walk(sourceRoot);
    const summary: Record<DatabaseOnboardingAction, number> = {
      include: 0,
      exclude: 0,
      modify: 0,
      reject: 0,
    };
    for (const item of items) summary[item.action] += 1;
    return {
      databaseId: database.id,
      sourceId: source.id,
      sourceFolder: source.folder,
      items,
      summary,
      complete,
      entryLimit,
    };
  }

  async #assertOnboardingSourceRoot(sourceFolder: string, sourceRoot: string): Promise<void> {
    try {
      const stats = await this.#fs.lstat(sourceRoot);
      if (stats.isSymbolicLink()) {
        throw new DatabaseStoreError(
          'record_symlink',
          `Data source folder "${sourceFolder}" is a symbolic link and cannot be onboarded`,
          { sourceFolder },
        );
      }
      if (!stats.isDirectory()) {
        throw new DatabaseStoreError(
          'record_not_found',
          `Data source folder "${sourceFolder}" is not a directory`,
          { sourceFolder },
        );
      }
      const [contentRealPath, sourceRealPath] = await Promise.all([
        this.#fs.realpath(this.#contentDir),
        this.#fs.realpath(sourceRoot),
      ]);
      const escaped = relative(contentRealPath, sourceRealPath);
      if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
        throw new DatabaseStoreError(
          'invalid_record_path',
          `Data source folder "${sourceFolder}" resolves outside the content directory`,
          { sourceFolder },
        );
      }
    } catch (error) {
      if (error instanceof DatabaseStoreError) throw error;
      if (errnoCode(error) === 'ENOENT') {
        throw new DatabaseStoreError(
          'record_not_found',
          `Data source folder "${sourceFolder}" does not exist`,
          { sourceFolder },
          error,
        );
      }
      throw asStoreIoError('onboarding-preview', error);
    }
  }

  async #previewOnboardingRecord(
    database: DatabaseDefinition,
    sourceId: string,
    recordPath: string,
    absolutePath: string,
  ): Promise<DatabaseOnboardingItem> {
    let markdown: string;
    try {
      markdown = await this.#fs.readFile(absolutePath);
    } catch {
      return {
        path: recordPath,
        action: 'reject',
        reasons: [
          {
            code: 'unreadable_file',
            message: `File "${recordPath}" could not be read`,
          },
        ],
        plannedChanges: [],
      };
    }

    const ensured = ensureDatabaseRecordIdentity({
      markdown,
      databaseId: database.id,
      sourceId,
      generateUuid: () => '00000000-0000-4000-8000-000000000000',
    });
    if (!ensured.ok) {
      const malformed = ensured.code === 'malformed_frontmatter';
      return {
        path: recordPath,
        action: 'reject',
        reasons: [
          {
            code: malformed ? 'malformed_frontmatter' : 'record_identity_conflict',
            message: ensured.message,
          },
        ],
        plannedChanges: [],
      };
    }

    const materialized = materializeDatabaseRecord({
      definition: database,
      sourceId,
      path: recordPath,
      markdown: ensured.markdown,
    });
    const plannedChanges: DatabaseOnboardingPlannedChange[] = ensured.changed
      ? [{ type: 'assign_record_id' }]
      : [];
    const reasons: DatabaseOnboardingReason[] = ensured.changed
      ? [
          {
            code: 'record_identity_required',
            message: `File "${recordPath}" needs stable database record metadata`,
          },
        ]
      : [];

    if (materialized.ok) {
      if (plannedChanges.length === 0) {
        return {
          path: recordPath,
          action: 'include',
          reasons: [{ code: 'ready', message: `File "${recordPath}" is ready to include` }],
          plannedChanges,
        };
      }
      return { path: recordPath, action: 'modify', reasons, plannedChanges };
    }

    if (
      materialized.code === 'invalid_record' &&
      materialized.issues?.every((issue) => issue.code === 'missing_required_value')
    ) {
      for (const issue of materialized.issues) {
        reasons.push({
          code: 'required_property_missing',
          message: issue.message,
          propertyId: issue.propertyId,
          propertyKey: issue.propertyKey,
        });
        plannedChanges.push({
          type: 'provide_required_property',
          propertyId: issue.propertyId,
          propertyKey: issue.propertyKey,
        });
      }
      return { path: recordPath, action: 'modify', reasons, plannedChanges };
    }

    return {
      path: recordPath,
      action: 'reject',
      reasons: [
        {
          code: 'invalid_record',
          message: materialized.message,
        },
      ],
      plannedChanges: [],
    };
  }

  #parseDefinition(input: unknown): DatabaseDefinition {
    const parsed = DatabaseDefinitionSchema.safeParse(input);
    if (!parsed.success) {
      throw new DatabaseStoreError(
        'invalid_definition',
        parsed.error.issues[0]?.message ?? 'Invalid database definition',
        { issues: parsed.error.issues },
      );
    }
    return parsed.data;
  }

  #throwNotFound(databaseId: string): never {
    throw new DatabaseStoreError('not_found', `Database "${databaseId}" was not found`, {
      databaseId,
    });
  }

  #manifestPath(key: string): string {
    return resolve(this.#databaseDir, `${key}.yml`);
  }

  async #databaseDirectoryExists(): Promise<boolean> {
    try {
      const stats = await this.#fs.lstat(this.#databaseDir);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw new DatabaseStoreError(
          'io_error',
          'Database manifest storage is not a regular directory',
          { operation: 'reload' },
        );
      }
      return true;
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return false;
      throw error;
    }
  }

  async #withWriteLock<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      await this.#ensureDatabaseDirectory();
      return await withFileLock(this.#lockPath, fn);
    } catch (error) {
      throw asStoreIoError(operation, error);
    }
  }

  async #ensureDatabaseDirectory(): Promise<void> {
    const metadataDir = resolve(this.#projectDir, '.ok');
    try {
      const metadataStats = await this.#fs.lstat(metadataDir);
      if (!metadataStats.isDirectory() && !metadataStats.isSymbolicLink()) {
        throw new DatabaseStoreError('io_error', 'Project metadata storage is not a directory', {
          operation: 'path-validation',
        });
      }
      if (metadataStats.isSymbolicLink()) {
        const [projectRealPath, metadataRealPath] = await Promise.all([
          this.#fs.realpath(this.#projectDir),
          this.#fs.realpath(metadataDir),
        ]);
        const escaped = relative(projectRealPath, metadataRealPath);
        if (escaped === '..' || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) {
          throw new DatabaseStoreError(
            'io_error',
            'Project metadata storage resolves outside the project directory',
            { operation: 'path-validation' },
          );
        }
      }
    } catch (error) {
      if (error instanceof DatabaseStoreError) throw error;
      if (errnoCode(error) !== 'ENOENT') throw error;
    }

    await this.#fs.mkdir(this.#databaseDir);
    await this.#assertDatabaseDirectorySafe();
  }

  async #assertDatabaseDirectorySafe(): Promise<void> {
    const [projectRealPath, databaseRealPath] = await Promise.all([
      this.#fs.realpath(this.#projectDir),
      this.#fs.realpath(this.#databaseDir),
    ]);
    const escaped = relative(projectRealPath, databaseRealPath);
    const parentPrefix = `..${sep}`;
    if (escaped === '..' || escaped.startsWith(parentPrefix) || isAbsolute(escaped)) {
      throw new DatabaseStoreError(
        'io_error',
        'Database manifest storage resolves outside the project directory',
        { operation: 'path-validation' },
      );
    }
  }

  async #writeManifest(key: string, yaml: string): Promise<void> {
    await atomicWriteFile(this.#manifestPath(key), yaml, { fs: this.#fs.atomic });
  }

  async #loadValidSnapshotForWrite(): Promise<DatabaseStoreSnapshot> {
    const snapshot = await this.#loadUnlocked();
    this.#snapshot = snapshot;
    if (snapshot.diagnostics.length > 0) {
      throw new DatabaseStoreError(
        'store_invalid',
        'Database manifests contain diagnostics; repair them before writing',
        { diagnosticCount: snapshot.diagnostics.length },
      );
    }
    return snapshot;
  }

  async #loadUnlocked(): Promise<DatabaseStoreSnapshot> {
    let entries: Dirent[];
    try {
      entries = await this.#fs.readdir(this.#databaseDir);
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') {
        return {
          ...emptySnapshot(),
          loadedAt: new Date().toISOString(),
        };
      }
      throw error;
    }

    const candidates: ManifestCandidate[] = [];
    const diagnostics: DatabaseStoreDiagnostic[] = [];
    const revision = createHash('sha256');
    const manifests = entries
      .filter((entry) => entry.name.endsWith('.yml'))
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of manifests) {
      revision.update(entry.name).update('\0');
      if (entry.isSymbolicLink()) {
        diagnostics.push({
          code: 'manifest_symlink',
          file: entry.name,
          message: `Manifest "${entry.name}" is a symbolic link and was not loaded`,
        });
        revision.update('symlink\0');
        continue;
      }
      if (!entry.isFile()) continue;

      let yaml: string;
      try {
        yaml = await this.#fs.readFile(resolve(this.#databaseDir, entry.name));
        revision.update(yaml).update('\0');
      } catch (error) {
        diagnostics.push({
          code: 'unreadable_manifest',
          file: entry.name,
          message: `Manifest "${entry.name}" could not be read`,
        });
        revision.update(`unreadable:${errnoCode(error) ?? 'unknown'}\0`);
        continue;
      }

      const parsed = parseDatabaseManifestYaml(yaml);
      if (!parsed.ok) {
        for (const diagnostic of parsed.diagnostics) {
          diagnostics.push({
            code: 'invalid_manifest',
            file: entry.name,
            message: diagnostic.message,
            manifestCode: diagnostic.code,
            schemaPath: diagnostic.path,
            line: diagnostic.line,
            column: diagnostic.column,
          });
        }
        continue;
      }

      const fileKey = basename(entry.name, '.yml');
      if (fileKey !== parsed.definition.key) {
        diagnostics.push({
          code: 'filename_key_mismatch',
          file: entry.name,
          message: `Manifest filename key "${fileKey}" does not match definition key "${parsed.definition.key}"`,
        });
        continue;
      }
      candidates.push({ file: entry.name, definition: parsed.definition });
    }

    const idCounts = new Map<string, number>();
    const keyCounts = new Map<string, number>();
    for (const candidate of candidates) {
      idCounts.set(candidate.definition.id, (idCounts.get(candidate.definition.id) ?? 0) + 1);
      keyCounts.set(candidate.definition.key, (keyCounts.get(candidate.definition.key) ?? 0) + 1);
    }

    const databases: DatabaseDefinition[] = [];
    for (const candidate of candidates) {
      let duplicate = false;
      if ((idCounts.get(candidate.definition.id) ?? 0) > 1) {
        diagnostics.push({
          code: 'duplicate_database_id',
          file: candidate.file,
          message: `Database ID "${candidate.definition.id}" is declared more than once`,
        });
        duplicate = true;
      }
      if ((keyCounts.get(candidate.definition.key) ?? 0) > 1) {
        diagnostics.push({
          code: 'duplicate_database_key',
          file: candidate.file,
          message: `Database key "${candidate.definition.key}" is declared more than once`,
        });
        duplicate = true;
      }
      if (!duplicate) databases.push(candidate.definition);
    }

    databases.sort((left, right) => left.key.localeCompare(right.key));
    diagnostics.sort(
      (left, right) => left.file.localeCompare(right.file) || left.code.localeCompare(right.code),
    );
    const digest = manifests.length === 0 ? 'empty' : revision.digest('hex');
    return {
      databases,
      diagnostics,
      revision: `sha256:${digest}`,
      loadedAt: new Date().toISOString(),
    };
  }
}

export function createDatabaseStore(options: CreateDatabaseStoreOptions): DatabaseStore {
  return new DatabaseStore(options);
}
