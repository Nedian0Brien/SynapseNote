/**
 * The v2 Markdown owner-table writer.
 *
 * This boundary is intentionally separate from the record-per-file commit
 * engine. It is the only server module allowed to splice v2 owner tables;
 * callers must supply an optimistic revision and the writer never emits a
 * database-owned record frontmatter file.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { Dirent, Stats } from 'node:fs';
import { lstat, mkdir, readdir, readFile, rename, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  createDatabaseDocumentId,
  createDatabaseMarkdownRecordId,
  DATABASE_MARKDOWN_LIMITS,
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  type DatabaseDocumentId,
  type DatabaseMarkdownCellPropertyType,
  type DatabaseMarkdownDocumentLink,
  type DatabaseMarkdownOwnerMarker,
  type DatabaseMarkdownTableCell,
  type DatabaseProperty,
  type DatabaseRecordActor,
  type DatabaseRecordPageLayoutOverride,
  type DatabaseSource,
  databaseMarkdownTableCellRevision,
  databaseMarkdownTableRowRevision,
  decodeDatabaseMarkdownCell,
  deleteDatabaseMarkdownTableRow,
  encodeDatabaseMarkdownCell,
  ensureDatabaseDocumentIdentity,
  insertDatabaseMarkdownTableRow,
  type ParsedDatabaseMarkdownOwner,
  parseDatabaseDocumentIdentity,
  parseDatabaseMarkdownOwner,
  reassignDatabaseDocumentIdentity,
  replaceDatabaseDocumentTitle,
  replaceDatabaseMarkdownTableCell,
  replaceDatabaseMarkdownTableRow,
  resolveDatabaseMarkdownDocumentLink,
  rewriteDatabaseMarkdownDocumentLinks,
  updateDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import {
  createDatabaseMarkdownTableJournal,
  type DatabaseMarkdownTableJournal,
} from './database-markdown-table-journal.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';
import { tracedAtomicFs } from './fs-traced.ts';

export type DatabaseMarkdownTableWriterErrorCode =
  | 'invalid_request'
  | 'source_not_found'
  | 'v2_storage_required'
  | 'owner_not_found'
  | 'owner_invalid'
  | 'target_changed'
  | 'property_not_stored'
  | 'derived_property_read_only'
  | 'allocated_property_read_only'
  | 'invalid_cell_value'
  | 'record_not_found'
  | 'document_not_found'
  | 'document_identity_invalid'
  | 'document_path_conflict'
  | 'document_title_invalid'
  | 'document_move_invalid'
  | 'duplicate_record'
  | 'transaction_failed'
  | 'rollback_failed'
  | 'resource_limit'
  | 'recovery_required'
  | 'reference_only';

export class DatabaseMarkdownTableWriterError extends Error {
  readonly code: DatabaseMarkdownTableWriterErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseMarkdownTableWriterErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseMarkdownTableWriterError';
    this.code = code;
    this.details = details;
  }
}

export interface DatabaseMarkdownTableWriterFs {
  lstat(path: string): Promise<Stats>;
  readFile(path: string): Promise<string>;
  mkdir(path: string): Promise<void>;
  unlink(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  readdir(path: string): Promise<Dirent[]>;
}

const DEFAULT_FS: DatabaseMarkdownTableWriterFs = {
  lstat,
  readFile: (path) => readFile(path, 'utf8'),
  mkdir: async (path) => {
    await mkdir(path, { recursive: true });
  },
  unlink,
  rename,
  readdir: (path) => readdir(path, { withFileTypes: true }),
};

export interface CreateDatabaseMarkdownTableWriterOptions {
  projectDir: string;
  contentDir: string;
  /**
   * Permit a deliberately isolated single-file session to write owner tables
   * into the user's content directory while keeping the writer journal and
   * lock under its throwaway project root. Normal project servers must leave
   * this disabled so a split project/content layout cannot widen the write
   * surface accidentally.
   */
  allowExternalContentDir?: boolean;
  databaseStore: DatabaseStore;
  databaseRecordIndex?: DatabaseRecordIndex;
  refreshDatabaseIndex?: () => Promise<unknown>;
  fs?: Partial<DatabaseMarkdownTableWriterFs>;
  generateUuid?: () => string;
  journal?: DatabaseMarkdownTableJournal;
  atomicWrite?: (path: string, content: string) => Promise<void>;
}

export interface DatabaseMarkdownTableRevision {
  sha256: string;
  bytes: number;
}

export interface DatabaseMarkdownTableFileDelta {
  path: string;
  operation: 'create' | 'update' | 'delete';
  before: DatabaseMarkdownTableRevision | null;
  after: DatabaseMarkdownTableRevision | null;
}

export interface DatabaseMarkdownTableMutationReceipt {
  version: 1;
  mutationId: string;
  operation:
    | 'update_cell'
    | 'update_cells'
    | 'replace_row'
    | 'delete_row'
    | 'create_row'
    | 'copy_row'
    | 'update_title'
    | 'move_document'
    | 'update_lifecycle';
  databaseId: string;
  sourceId: string;
  ownerPath: string;
  recordId: string;
  propertyId?: string;
  rowIndex: number;
  files: readonly DatabaseMarkdownTableFileDelta[];
  beforeOwnerRevision: string;
  afterOwnerRevision: string;
  /** Durable-journal payload for byte-exact undo. */
  beforeOwnerContent: string;
  afterOwnerContent?: string;
  /** Present only for create-row transactions. */
  createdDocumentContent?: string;
  /** Present only for title transactions that update the linked document. */
  documentPath?: string;
  beforeDocumentRevision?: string;
  afterDocumentRevision?: string;
  beforeDocumentContent?: string;
  afterDocumentContent?: string;
  /** Present only for document move transactions. */
  previousDocumentPath?: string;
  /** Present for lifecycle or membership transactions that also update the manifest. */
  manifestPath?: string;
  beforeManifestRevision?: string;
  afterManifestRevision?: string;
  beforeManifestContent?: string;
  afterManifestContent?: string;
  committedAt: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableCellMutationInput {
  databaseId: string;
  sourceId: string;
  recordId: string;
  propertyId: string;
  value: unknown;
  expectedOwnerRevision?: string;
  expectedRowRevision?: string;
  expectedCellRevision?: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableBulkCellMutationInput {
  databaseId: string;
  sourceId: string;
  cells: readonly {
    recordId: string;
    propertyId: string;
    value: unknown;
    expectedRowRevision?: string;
    expectedCellRevision?: string;
  }[];
  expectedOwnerRevision: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableRowMutationInput {
  databaseId: string;
  sourceId: string;
  recordId: string;
  values: Readonly<Record<string, unknown>>;
  expectedOwnerRevision?: string;
  expectedRowRevision?: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableRowCreateInput {
  databaseId: string;
  sourceId: string;
  documentPath: string;
  documentMarkdown: string;
  documentId?: DatabaseDocumentId;
  values?: Readonly<Record<string, unknown>>;
  expectedOwnerRevision: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableRowsCreateInput {
  databaseId: string;
  sourceId: string;
  rows: readonly Omit<
    DatabaseMarkdownTableRowCreateInput,
    'databaseId' | 'sourceId' | 'expectedOwnerRevision'
  >[];
  expectedOwnerRevision: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableRowCopyInput {
  databaseId: string;
  sourceId: string;
  recordId: string;
  /** A linked view is a projection, never a second canonical row. */
  mode: 'duplicate_document' | 'linked_view';
  documentPath: string;
  documentId?: DatabaseDocumentId;
  expectedOwnerRevision: string;
  expectedRowRevision?: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableTitleMutationInput {
  databaseId: string;
  sourceId: string;
  recordId: string;
  title: string;
  expectedOwnerRevision: string;
  expectedDocumentRevision?: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableDocumentMoveInput {
  databaseId: string;
  sourceId: string;
  recordId: string;
  newDocumentPath: string;
  expectedOwnerRevision: string;
  expectedDocumentRevision?: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableLifecycleMutationInput {
  databaseId: string;
  sourceId: string;
  recordId: string;
  /** Set true/false to archive/restore; omit to leave archive state unchanged. */
  archived?: boolean;
  /** Explicit null clears the row layout override. */
  pageLayoutOverride?: DatabaseRecordPageLayoutOverride | null;
  actor?: DatabaseRecordActor;
  now?: string;
  expectedOwnerRevision: string;
  /** SHA-256 of the database manifest file, not the aggregate store snapshot revision. */
  expectedManifestRevision?: string;
}

export interface DatabaseMarkdownTableUndoInput {
  receipt: DatabaseMarkdownTableMutationReceipt;
  expectedAfterOwnerRevision?: string;
  actor?: DatabaseRecordActor;
}

export interface DatabaseMarkdownTableMutationResult {
  receipt: DatabaseMarkdownTableMutationReceipt;
  changed: boolean;
}

export interface DatabaseMarkdownTableRowsCreateResult {
  changed: boolean;
  receipts: readonly DatabaseMarkdownTableMutationReceipt[];
}

interface ResolvedSource {
  database: DatabaseDefinition;
  source: DatabaseSource;
  marker: DatabaseMarkdownOwnerMarker;
  owner: ParsedDatabaseMarkdownOwner;
  markdown: string;
  ownerAbsolutePath: string;
}

interface ResolvedRow {
  rowIndex: number;
  recordId: string;
  documentPath: string;
  documentId: DatabaseDocumentId;
}

interface ManifestMutation {
  path: string;
  before: string;
  after: string;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function revision(value: string): DatabaseMarkdownTableRevision {
  return { sha256: sha256(value), bytes: Buffer.byteLength(value, 'utf8') };
}

function safeRelativePath(path: string, extension: '.md' | '.mdx' | null = null): boolean {
  if (!path || path.includes('\0') || path.includes('\\')) return false;
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  if (path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  return extension === null || path.endsWith(extension);
}

function documentLinkTarget(path: string): string {
  return path.replace(/\.(?:md|mdx)$/i, '');
}

function sourceStorage(source: DatabaseSource) {
  if (!source.storage || source.storage.kind !== 'markdown_table') {
    throw new DatabaseMarkdownTableWriterError(
      'v2_storage_required',
      `Source "${source.id}" is not configured for Markdown owner-table storage`,
      { sourceId: source.id },
    );
  }
  return source.storage;
}

function propertyType(property: DatabaseProperty): DatabaseMarkdownCellPropertyType {
  switch (property.type) {
    case 'title':
    case 'text':
    case 'number':
    case 'checkbox':
    case 'date':
    case 'select':
    case 'status':
    case 'multi_select':
    case 'url':
    case 'email':
    case 'phone':
    case 'person':
    case 'files':
    case 'relation':
    case 'unique_id':
    case 'place':
      return property.type;
    default:
      throw new DatabaseMarkdownTableWriterError(
        property.type === 'formula' || property.type === 'rollup'
          ? 'derived_property_read_only'
          : 'property_not_stored',
        `Property "${property.id}" is not a writable v2 stored property`,
        { propertyId: property.id, propertyType: property.type },
      );
  }
}

function normalizeStorageValue(property: DatabaseProperty, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (property.type === 'select' || property.type === 'status') {
    if (typeof value !== 'string') return value;
    return property.options.find((option) => option.id === value)?.key ?? value;
  }
  if (property.type === 'multi_select' && Array.isArray(value)) {
    return value.map((entry) =>
      typeof entry === 'string'
        ? (property.options.find((option) => option.id === entry)?.key ?? entry)
        : entry,
    );
  }
  return value;
}

function encodedCell(property: DatabaseProperty, value: unknown): string {
  if (
    property.type === 'unique_id' &&
    (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
  ) {
    throw new DatabaseMarkdownTableWriterError(
      'invalid_cell_value',
      `Unique ID property "${property.id}" requires a positive safe integer`,
      { propertyId: property.id },
    );
  }
  const encoded = encodeDatabaseMarkdownCell(
    propertyType(property),
    normalizeStorageValue(property, value),
  );
  if (!encoded.ok) {
    throw new DatabaseMarkdownTableWriterError(
      'invalid_cell_value',
      `Property "${property.key}" cannot be encoded as a Markdown table cell: ${encoded.message}`,
      { propertyId: property.id, codecCode: encoded.code },
    );
  }
  return encoded.text;
}

function decodedTitleLink(
  owner: ParsedDatabaseMarkdownOwner,
  source: DatabaseSource,
  rowIndex: number,
): DatabaseMarkdownDocumentLink {
  const storage = sourceStorage(source);
  const titleColumn = storage.storedPropertyIds.indexOf(storage.titlePropertyId);
  const cell = owner.rows[rowIndex]?.cells[titleColumn];
  if (!cell) {
    throw new DatabaseMarkdownTableWriterError(
      'owner_invalid',
      'The v2 owner row has no Title cell',
      {
        rowIndex,
      },
    );
  }
  const decoded = decodeDatabaseMarkdownCell('title', cell.raw);
  if (
    !decoded.ok ||
    decoded.value === null ||
    Array.isArray(decoded.value) ||
    typeof decoded.value !== 'object'
  ) {
    throw new DatabaseMarkdownTableWriterError(
      'owner_invalid',
      'The v2 owner row Title cell is not a document wikilink',
      {
        rowIndex,
      },
    );
  }
  return decoded.value as DatabaseMarkdownDocumentLink;
}

/** Replace only the user-facing title declaration while preserving Markdown body bytes. */
function replaceMarkdownDocumentTitle(markdown: string, title: string): string {
  const result = replaceDatabaseDocumentTitle(markdown, title);
  if (!result.ok) {
    throw new DatabaseMarkdownTableWriterError('document_title_invalid', result.message, {
      title,
      validationCode: result.code,
    });
  }
  return result.markdown;
}

export class DatabaseMarkdownTableWriter {
  readonly #projectDir: string;
  readonly #contentDir: string;
  readonly #allowExternalContentDir: boolean;
  readonly #databaseStore: DatabaseStore;
  readonly #refreshDatabaseIndex: () => Promise<unknown>;
  readonly #fs: DatabaseMarkdownTableWriterFs;
  readonly #generateUuid: () => string;
  readonly #lockPath: string;
  readonly #journal: DatabaseMarkdownTableJournal;
  readonly #atomicWrite: (path: string, content: string) => Promise<void>;

  constructor(options: CreateDatabaseMarkdownTableWriterOptions) {
    this.#projectDir = resolve(options.projectDir);
    this.#contentDir = resolve(options.contentDir);
    this.#allowExternalContentDir = options.allowExternalContentDir ?? false;
    this.#databaseStore = options.databaseStore;
    this.#refreshDatabaseIndex =
      options.refreshDatabaseIndex ??
      (options.databaseRecordIndex
        ? () => options.databaseRecordIndex!.rebuild()
        : async () => undefined);
    this.#fs = { ...DEFAULT_FS, ...options.fs };
    this.#generateUuid = options.generateUuid ?? randomUUID;
    this.#journal = options.journal ?? createDatabaseMarkdownTableJournal(this.#projectDir);
    this.#atomicWrite =
      options.atomicWrite ??
      ((path, content) => atomicWriteFile(path, content, { fs: tracedAtomicFs }));
    this.#lockPath = resolve(this.#projectDir, '.ok', 'databases', '.commit.lock');
    if (!isWithin(this.#projectDir, this.#contentDir) && !this.#allowExternalContentDir) {
      throw new Error('Database Markdown table contentDir must be inside projectDir');
    }
  }

  async updateCell(
    input: DatabaseMarkdownTableCellMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#updateCellLocked(input));
  }

  async updateCells(
    input: DatabaseMarkdownTableBulkCellMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#updateCellsLocked(input));
  }

  /** Commit-engine seam; the caller already owns `.commit.lock`. */
  async updateCellsWithinCommit(
    input: DatabaseMarkdownTableBulkCellMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#updateCellsLocked(input);
  }

  async replaceRow(
    input: DatabaseMarkdownTableRowMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#replaceRowLocked(input));
  }

  async deleteRow(
    input: Omit<DatabaseMarkdownTableRowMutationInput, 'values'>,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#deleteRowLocked(input));
  }

  /** Commit-engine seam; the caller already owns `.commit.lock`. */
  async deleteRowWithinCommit(
    input: Omit<DatabaseMarkdownTableRowMutationInput, 'values'>,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#deleteRowLocked(input);
  }

  async createRow(
    input: DatabaseMarkdownTableRowCreateInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#createRowLocked(input));
  }

  /** Commit-engine seam; the caller already owns `.commit.lock`. */
  async createRowWithinCommit(
    input: DatabaseMarkdownTableRowCreateInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#createRowLocked(input);
  }

  /** Create several initial rows while holding the writer lock once. */
  async createRows(
    input: DatabaseMarkdownTableRowsCreateInput,
  ): Promise<DatabaseMarkdownTableRowsCreateResult> {
    return this.#withLock(() => this.#createRowsLocked(input));
  }

  /**
   * Commit-engine seam. The database commit engine already owns the shared
   * `.commit.lock`, so acquiring it a second time would deadlock. Callers
   * must invoke this only while that outer transaction lock is held.
   */
  async createRowsWithinCommit(
    input: DatabaseMarkdownTableRowsCreateInput,
  ): Promise<DatabaseMarkdownTableRowsCreateResult> {
    return this.#createRowsLocked(input);
  }

  async copyRow(
    input: DatabaseMarkdownTableRowCopyInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#copyRowLocked(input));
  }

  async updateTitle(
    input: DatabaseMarkdownTableTitleMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#updateTitleLocked(input));
  }

  /** Commit-engine seam; the caller already owns `.commit.lock`. */
  async updateTitleWithinCommit(
    input: DatabaseMarkdownTableTitleMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#updateTitleLocked(input);
  }

  async moveDocument(
    input: DatabaseMarkdownTableDocumentMoveInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#moveDocumentLocked(input));
  }

  async updateLifecycle(
    input: DatabaseMarkdownTableLifecycleMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#updateLifecycleLocked(input));
  }

  async undo(
    input: DatabaseMarkdownTableUndoInput,
  ): Promise<{ changed: boolean; receipt: DatabaseMarkdownTableMutationReceipt }> {
    return this.#withLock(() => this.#undoLocked(input));
  }

  /** Commit-engine seam; the caller already owns `.commit.lock`. */
  async undoWithinCommit(
    input: DatabaseMarkdownTableUndoInput,
  ): Promise<{ changed: boolean; receipt: DatabaseMarkdownTableMutationReceipt }> {
    return this.#undoLocked(input);
  }

  /** Reconcile transactions left on disk after a process kill without guessing. */
  async recover(): Promise<
    readonly { mutationId: string; state: 'committed' | 'rolled_back' | 'recovery_required' }[]
  > {
    const entries = await this.#journal.listInflight();
    const recovered: Array<{
      mutationId: string;
      state: 'committed' | 'rolled_back' | 'recovery_required';
    }> = [];
    for (const entry of entries) {
      let allBefore = true;
      let allAfter = true;
      for (const file of entry.files) {
        const current = await this.#fs
          .readFile(this.#safeJournalAbsolutePath(file.path))
          .catch(() => null);
        const currentRevision = current === null ? null : sha256(current);
        allBefore &&= currentRevision === file.beforeSha256;
        allAfter &&= currentRevision === file.afterSha256;
      }
      const state = allAfter ? 'committed' : allBefore ? 'rolled_back' : 'recovery_required';
      await this.#journal.checkpoint(entry.mutationId, state);
      recovered.push({ mutationId: entry.mutationId, state });
    }
    return recovered;
  }

  async #withLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.#fs.mkdir(resolve(this.#lockPath, '..'));
    return withFileLock(this.#lockPath, async () => {
      const unresolved = (await this.#journal.listInflight()).find(
        (entry) => entry.state === 'recovery_required',
      );
      if (unresolved) {
        throw new DatabaseMarkdownTableWriterError(
          'recovery_required',
          'A previous v2 owner-table transaction requires recovery before another write',
          { mutationId: unresolved.mutationId },
        );
      }
      return operation();
    });
  }

  async #loadSource(databaseId: string, sourceId: string): Promise<ResolvedSource> {
    const database = this.#databaseStore.getById(databaseId);
    const source = database?.sources.find((candidate) => candidate.id === sourceId);
    if (!database || !source) {
      throw new DatabaseMarkdownTableWriterError(
        'source_not_found',
        `Source "${sourceId}" was not found`,
        {
          databaseId,
          sourceId,
        },
      );
    }
    const storage = sourceStorage(source);
    const ownerPath = storage.owner.path;
    if (!safeRelativePath(ownerPath, '.md')) {
      throw new DatabaseMarkdownTableWriterError(
        'owner_invalid',
        'The configured v2 owner path is unsafe',
        {
          ownerPath,
        },
      );
    }
    const ownerAbsolutePath = this.#safeAbsolutePath(ownerPath);
    await this.#assertNoSymlinkComponents(ownerPath);
    let markdown: string;
    try {
      markdown = await this.#fs.readFile(ownerAbsolutePath);
    } catch (error) {
      throw new DatabaseMarkdownTableWriterError(
        'owner_not_found',
        `Owner document "${ownerPath}" could not be read`,
        {
          ownerPath,
        },
        error,
      );
    }
    const parsed = parseDatabaseMarkdownOwner(markdown);
    if (!parsed.ok) {
      throw new DatabaseMarkdownTableWriterError(
        'owner_invalid',
        `Owner document "${ownerPath}" is invalid: ${parsed.message}`,
        {
          ownerPath,
          parserCode: parsed.code,
        },
      );
    }
    if (
      parsed.owner.marker.databaseId !== database.id ||
      parsed.owner.marker.sourceId !== source.id ||
      parsed.owner.marker.blockId !== storage.owner.blockId ||
      JSON.stringify(parsed.owner.marker.columns) !== JSON.stringify(storage.storedPropertyIds)
    ) {
      throw new DatabaseMarkdownTableWriterError(
        'owner_invalid',
        'Owner marker does not match the manifest storage binding',
        {
          ownerPath,
          expected: {
            databaseId: database.id,
            sourceId: source.id,
            blockId: storage.owner.blockId,
            columns: storage.storedPropertyIds,
          },
          observed: parsed.owner.marker,
        },
      );
    }
    return {
      database,
      source,
      marker: parsed.owner.marker,
      owner: parsed.owner,
      markdown,
      ownerAbsolutePath,
    };
  }

  async #resolveRow(resolved: ResolvedSource, recordId: string): Promise<ResolvedRow> {
    const seen = new Map<string, number>();
    const documents = await this.#listDocumentCandidates();
    for (const row of resolved.owner.rows) {
      const link = decodedTitleLink(resolved.owner, resolved.source, row.rowIndex);
      const resolution = resolveDatabaseMarkdownDocumentLink({
        link,
        documents,
        fromPath: sourceStorage(resolved.source).owner.path,
      });
      if (!resolution.ok || !resolution.candidate) {
        throw new DatabaseMarkdownTableWriterError(
          'document_not_found',
          `Owner row ${row.rowIndex} document link could not be resolved (${resolution.code})`,
          { rowIndex: row.rowIndex, target: link.target, resolverCode: resolution.code },
        );
      }
      const documentPath = resolution.candidate.path;
      const absolute = this.#safeAbsolutePath(documentPath);
      let markdown: string;
      try {
        markdown = await this.#fs.readFile(absolute);
      } catch (error) {
        throw new DatabaseMarkdownTableWriterError(
          'document_not_found',
          `Linked document "${documentPath}" could not be read`,
          {
            rowIndex: row.rowIndex,
            documentPath,
          },
          error,
        );
      }
      const identity = parseDatabaseDocumentIdentity(markdown);
      if (!identity.ok) {
        throw new DatabaseMarkdownTableWriterError(
          'document_identity_invalid',
          `Linked document "${documentPath}" has no valid generic document identity`,
          {
            rowIndex: row.rowIndex,
            documentPath,
            identityCode: identity.code,
          },
        );
      }
      const derivedRecordId = createDatabaseMarkdownRecordId(
        resolved.source.id,
        identity.documentId,
      );
      const previous = seen.get(derivedRecordId);
      if (previous !== undefined) {
        throw new DatabaseMarkdownTableWriterError(
          'duplicate_record',
          `Rows ${previous} and ${row.rowIndex} resolve to the same record identity`,
          {
            recordId: derivedRecordId,
            firstRowIndex: previous,
            secondRowIndex: row.rowIndex,
          },
        );
      }
      seen.set(derivedRecordId, row.rowIndex);
      if (derivedRecordId === recordId) {
        return {
          rowIndex: row.rowIndex,
          recordId: derivedRecordId,
          documentPath,
          documentId: identity.documentId,
        };
      }
    }
    throw new DatabaseMarkdownTableWriterError(
      'record_not_found',
      `Record "${recordId}" is not present in the v2 owner table`,
      {
        recordId,
      },
    );
  }

  async #listDocumentCandidates(): Promise<
    readonly {
      path: string;
      documentId: string;
      aliases?: readonly string[];
    }[]
  > {
    const candidates: Array<{ path: string; documentId: string; aliases?: readonly string[] }> = [];
    const visit = async (directory: string, prefix: string): Promise<void> => {
      const entries = await this.#fs.readdir(directory).catch(() => [] as Dirent[]);
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        const absolute = resolve(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          await visit(absolute, path);
          continue;
        }
        if (!entry.isFile() || !/\.(?:md|mdx)$/iu.test(path)) continue;
        const markdown = await this.#fs.readFile(absolute).catch(() => null);
        if (markdown === null) continue;
        const identity = parseDatabaseDocumentIdentity(markdown);
        if (!identity.ok) continue;
        const title = /^title:\s*["']?(.+?)["']?\s*$/mu.exec(markdown)?.[1]?.trim();
        candidates.push({
          path,
          documentId: identity.documentId,
          ...(title ? { aliases: [title] } : {}),
        });
      }
    };
    await visit(this.#contentDir, '');
    return candidates.sort((left, right) => left.path.localeCompare(right.path));
  }

  async #updateCellLocked(
    input: DatabaseMarkdownTableCellMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(
      resolved,
      input.expectedOwnerRevision,
      input.expectedRowRevision,
      input.expectedCellRevision,
    );
    const row = await this.#resolveRow(resolved, input.recordId);
    const storage = sourceStorage(resolved.source);
    const columnIndex = storage.storedPropertyIds.indexOf(input.propertyId);
    const property = resolved.source.properties.find(
      (candidate) => candidate.id === input.propertyId,
    );
    if (!property) {
      throw new DatabaseMarkdownTableWriterError(
        'property_not_stored',
        `Property "${input.propertyId}" is not defined by the source`,
        {
          propertyId: input.propertyId,
        },
      );
    }
    if (property.type === 'unique_id') {
      throw new DatabaseMarkdownTableWriterError(
        'allocated_property_read_only',
        `Unique ID property "${property.id}" is allocated by the database and cannot be edited directly`,
        { propertyId: property.id },
      );
    }
    if (columnIndex < 0) {
      throw new DatabaseMarkdownTableWriterError(
        property.type === 'formula' || property.type === 'rollup'
          ? 'derived_property_read_only'
          : 'property_not_stored',
        `Property "${input.propertyId}" is not stored in the v2 owner table`,
        { propertyId: input.propertyId },
      );
    }
    const cell = resolved.owner.rows[row.rowIndex]?.cells[columnIndex];
    if (!cell)
      throw new DatabaseMarkdownTableWriterError('owner_invalid', 'Owner row cell is missing', {
        rowIndex: row.rowIndex,
        columnIndex,
      });
    this.#assertRowAndCellRevisions(
      resolved,
      row.rowIndex,
      cell,
      input.expectedRowRevision,
      input.expectedCellRevision,
    );
    const nextValue = encodedCell(property, input.value);
    if (cell.raw.trim() === nextValue) {
      return {
        changed: false,
        receipt: this.#receipt(
          'update_cell',
          resolved,
          row,
          resolved.markdown,
          resolved.markdown,
          input.propertyId,
          undefined,
          input.actor,
        ),
      };
    }
    const after = replaceDatabaseMarkdownTableCell(
      resolved.markdown,
      resolved.owner,
      row.rowIndex,
      columnIndex,
      nextValue,
    );
    return this.#commitOwnerOnly(
      'update_cell',
      resolved,
      row,
      after,
      input.propertyId,
      undefined,
      input.actor,
    );
  }

  async #updateCellsLocked(
    input: DatabaseMarkdownTableBulkCellMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    if (!Array.isArray(input.cells) || input.cells.length === 0 || input.cells.length > 10_000) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'A v2 bulk mutation must contain 1-10000 cells',
      );
    }
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision);
    const storage = sourceStorage(resolved.source);
    const seen = new Set<string>();
    const replacements: Array<{
      row: ResolvedRow;
      columnIndex: number;
      encoded: string;
      start: number;
      end: number;
    }> = [];
    for (const cellInput of input.cells) {
      const key = `${cellInput.recordId}\0${cellInput.propertyId}`;
      if (seen.has(key))
        throw new DatabaseMarkdownTableWriterError(
          'invalid_request',
          'A bulk mutation repeats the same row/property cell',
          { key },
        );
      seen.add(key);
      const row = await this.#resolveRow(resolved, cellInput.recordId);
      const columnIndex = storage.storedPropertyIds.indexOf(cellInput.propertyId);
      const property = resolved.source.properties.find(
        (candidate) => candidate.id === cellInput.propertyId,
      );
      if (!property)
        throw new DatabaseMarkdownTableWriterError(
          'property_not_stored',
          `Property "${cellInput.propertyId}" is not defined by the source`,
          { propertyId: cellInput.propertyId },
        );
      if (property.type === 'unique_id')
        throw new DatabaseMarkdownTableWriterError(
          'allocated_property_read_only',
          `Unique ID property "${property.id}" is allocated by the database`,
          { propertyId: property.id },
        );
      if (columnIndex < 0)
        throw new DatabaseMarkdownTableWriterError(
          property.type === 'formula' || property.type === 'rollup'
            ? 'derived_property_read_only'
            : 'property_not_stored',
          `Property "${cellInput.propertyId}" is not stored in the v2 owner table`,
          { propertyId: cellInput.propertyId },
        );
      const cell = resolved.owner.rows[row.rowIndex]?.cells[columnIndex];
      if (!cell)
        throw new DatabaseMarkdownTableWriterError('owner_invalid', 'Owner row cell is missing', {
          rowIndex: row.rowIndex,
          columnIndex,
        });
      this.#assertRowAndCellRevisions(
        resolved,
        row.rowIndex,
        cell,
        cellInput.expectedRowRevision,
        cellInput.expectedCellRevision,
      );
      replacements.push({
        row,
        columnIndex,
        encoded: encodedCell(property, cellInput.value),
        start: cell.valueRange.start,
        end: cell.valueRange.end,
      });
    }
    let after = resolved.markdown;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
      after =
        after.slice(0, replacement.start) + replacement.encoded + after.slice(replacement.end);
    }
    const row = replacements[0]?.row;
    if (!row)
      throw new DatabaseMarkdownTableWriterError('invalid_request', 'Bulk mutation has no cells');
    if (after === resolved.markdown)
      return {
        changed: false,
        receipt: this.#receipt(
          'update_cells',
          resolved,
          row,
          after,
          after,
          undefined,
          undefined,
          input.actor,
        ),
      };
    return this.#commitOwnerOnly(
      'update_cells',
      resolved,
      row,
      after,
      undefined,
      undefined,
      input.actor,
    );
  }

  async #replaceRowLocked(
    input: DatabaseMarkdownTableRowMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision, input.expectedRowRevision);
    const row = await this.#resolveRow(resolved, input.recordId);
    const storage = sourceStorage(resolved.source);
    const encodedValues = storage.storedPropertyIds.map((propertyId) => {
      const property = resolved.source.properties.find((candidate) => candidate.id === propertyId);
      if (!property)
        throw new DatabaseMarkdownTableWriterError(
          'owner_invalid',
          `Stored property "${propertyId}" is missing from the source`,
        );
      if (input.values[propertyId] === undefined && property.type === 'title') {
        throw new DatabaseMarkdownTableWriterError(
          'invalid_cell_value',
          'A row replacement must retain its Title document wikilink',
          { propertyId },
        );
      }
      return encodedCell(property, input.values[propertyId]);
    });
    this.#assertRowAndCellRevisions(
      resolved,
      row.rowIndex,
      resolved.owner.rows[row.rowIndex]!.cells[0]!,
      input.expectedRowRevision,
      undefined,
    );
    const after = replaceDatabaseMarkdownTableRow(
      resolved.markdown,
      resolved.owner,
      row.rowIndex,
      encodedValues,
    );
    if (after === resolved.markdown) {
      return {
        changed: false,
        receipt: this.#receipt(
          'replace_row',
          resolved,
          row,
          resolved.markdown,
          resolved.markdown,
          undefined,
          undefined,
          input.actor,
        ),
      };
    }
    return this.#commitOwnerOnly(
      'replace_row',
      resolved,
      row,
      after,
      undefined,
      undefined,
      input.actor,
    );
  }

  async #updateTitleLocked(
    input: DatabaseMarkdownTableTitleMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision);
    const row = await this.#resolveRow(resolved, input.recordId);
    const storage = sourceStorage(resolved.source);
    const titleColumn = storage.storedPropertyIds.indexOf(storage.titlePropertyId);
    if (titleColumn < 0) {
      throw new DatabaseMarkdownTableWriterError(
        'owner_invalid',
        'The v2 source does not store its Title property',
      );
    }
    const titleCell = resolved.owner.rows[row.rowIndex]?.cells[titleColumn];
    if (!titleCell)
      throw new DatabaseMarkdownTableWriterError(
        'owner_invalid',
        'The v2 row Title cell is missing',
      );
    const link = decodedTitleLink(resolved.owner, resolved.source, row.rowIndex);
    const documentAbsolutePath = this.#safeAbsolutePath(row.documentPath);
    const beforeDocument = await this.#fs.readFile(documentAbsolutePath).catch((error) => {
      throw new DatabaseMarkdownTableWriterError(
        'document_not_found',
        `Linked document "${row.documentPath}" could not be read`,
        { documentPath: row.documentPath },
        error,
      );
    });
    const beforeDocumentRevision = sha256(beforeDocument);
    if (
      input.expectedDocumentRevision !== undefined &&
      input.expectedDocumentRevision !== beforeDocumentRevision
    ) {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Linked Markdown document changed after the title mutation was planned',
        {
          documentPath: row.documentPath,
          expectedRevision: input.expectedDocumentRevision,
          observedRevision: beforeDocumentRevision,
        },
      );
    }
    const afterDocument = replaceMarkdownDocumentTitle(beforeDocument, input.title);
    const nextLink: DatabaseMarkdownDocumentLink = {
      kind: 'wikilink',
      target: link.target,
      alias: input.title.trim(),
    };
    const encodedLink = encodedCell(
      resolved.source.properties.find((property) => property.id === storage.titlePropertyId)!,
      nextLink,
    );
    const afterOwner = replaceDatabaseMarkdownTableCell(
      resolved.markdown,
      resolved.owner,
      row.rowIndex,
      titleColumn,
      encodedLink,
    );
    if (afterOwner === resolved.markdown && afterDocument === beforeDocument) {
      return {
        changed: false,
        receipt: this.#titleReceipt(
          resolved,
          row,
          resolved.markdown,
          resolved.markdown,
          row.documentPath,
          beforeDocument,
          beforeDocument,
          undefined,
          input.actor,
        ),
      };
    }
    const ownerBefore = resolved.markdown;
    const ownerRevision = revision(ownerBefore);
    const afterOwnerRevision = revision(afterOwner);
    const documentAfterRevision = revision(afterDocument);
    const mutationId = `mut_${this.#generateUuid().replaceAll('-', '')}`;
    await this.#assertOwnerStillCurrent(resolved);
    await this.#assertNoSymlinkComponents(storage.owner.path);
    await this.#assertNoSymlinkComponents(row.documentPath);
    try {
      await this.#journal.prepare({
        mutationId,
        files: [
          {
            path: storage.owner.path,
            beforeSha256: ownerRevision.sha256,
            afterSha256: afterOwnerRevision.sha256,
            before: ownerBefore,
            after: afterOwner,
          },
          {
            path: row.documentPath,
            beforeSha256: beforeDocumentRevision,
            afterSha256: documentAfterRevision.sha256,
            before: beforeDocument,
            after: afterDocument,
          },
        ],
        ...(input.actor ? { actor: input.actor } : {}),
        history: {
          operation: 'update_title',
          databaseId: resolved.database.id,
          sourceId: resolved.source.id,
          recordId: row.recordId,
          propertyId: storage.titlePropertyId,
          beforeRevision: ownerRevision.sha256,
          afterRevision: afterOwnerRevision.sha256,
        },
      });
      await this.#journal.checkpoint(mutationId, 'writing');
      await this.#atomicWrite(documentAbsolutePath, afterDocument);
      await this.#assertOwnerStillCurrent(resolved);
      await this.#atomicWrite(resolved.ownerAbsolutePath, afterOwner);
      await this.#refreshDatabaseIndex();
      await this.#verifyCommittedFiles([
        { path: storage.owner.path, afterSha256: afterOwnerRevision.sha256 },
        { path: row.documentPath, afterSha256: documentAfterRevision.sha256 },
      ]);
      await this.#journal.checkpoint(mutationId, 'committed');
    } catch (error) {
      try {
        const ownerCurrent = await this.#fs.readFile(resolved.ownerAbsolutePath).catch(() => null);
        if (ownerCurrent !== null && sha256(ownerCurrent) === afterOwnerRevision.sha256) {
          await this.#atomicWrite(resolved.ownerAbsolutePath, ownerBefore);
        }
        const documentCurrent = await this.#fs.readFile(documentAbsolutePath).catch(() => null);
        if (documentCurrent !== null && sha256(documentCurrent) === documentAfterRevision.sha256) {
          await this.#atomicWrite(documentAbsolutePath, beforeDocument);
        }
        await this.#journal.checkpoint(mutationId, 'rolled_back');
      } catch (rollbackError) {
        await this.#journal.checkpoint(mutationId, 'recovery_required').catch(() => undefined);
        throw new DatabaseMarkdownTableWriterError(
          'rollback_failed',
          'V2 title transaction failed and compensation was incomplete',
          {
            ownerPath: storage.owner.path,
            documentPath: row.documentPath,
          },
          rollbackError,
        );
      }
      if (error instanceof DatabaseMarkdownTableWriterError && error.code === 'target_changed')
        throw error;
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        'V2 title transaction failed and was rolled back',
        {
          ownerPath: storage.owner.path,
          documentPath: row.documentPath,
        },
        error,
      );
    }
    return {
      changed: true,
      receipt: this.#titleReceipt(
        resolved,
        row,
        ownerBefore,
        afterOwner,
        row.documentPath,
        beforeDocument,
        afterDocument,
        mutationId,
        input.actor,
      ),
    };
  }

  async #updateLifecycleLocked(
    input: DatabaseMarkdownTableLifecycleMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    if (input.archived === undefined && input.pageLayoutOverride === undefined) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'A lifecycle mutation must change archive state or page layout metadata',
      );
    }
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision);
    const row = await this.#resolveRow(resolved, input.recordId);
    const manifestPath = `.ok/databases/${resolved.database.key}.yml`;
    const manifestAbsolutePath = this.#safeProjectAbsolutePath(manifestPath);
    await this.#assertNoProjectSymlinkComponents(manifestPath);
    const beforeManifest = await this.#fs.readFile(manifestAbsolutePath).catch((error) => {
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        `Database manifest "${manifestPath}" could not be read`,
        { manifestPath },
        error,
      );
    });
    if (
      input.expectedManifestRevision !== undefined &&
      input.expectedManifestRevision !== sha256(beforeManifest)
    ) {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Database manifest changed after the lifecycle mutation was planned',
        {
          manifestPath,
          expectedRevision: input.expectedManifestRevision,
          observedRevision: sha256(beforeManifest),
        },
      );
    }
    const now = input.now ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(now))) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'Lifecycle timestamp must be an ISO date-time',
      );
    }
    const existing = resolved.database.storageMetadata?.recordLifecycle ?? {};
    const previous = existing[input.recordId] ?? {};
    const next = {
      ...previous,
      ...(input.archived === undefined ? {} : { archivedAt: input.archived ? now : null }),
      ...(input.pageLayoutOverride === undefined
        ? {}
        : { pageLayoutOverride: input.pageLayoutOverride ?? undefined }),
      lastEditedAt: now,
      lastEditedBy: input.actor ?? { kind: 'system', principal_id: 'synapsenote' },
    };
    if (next.pageLayoutOverride === undefined)
      delete (next as { pageLayoutOverride?: unknown }).pageLayoutOverride;
    let nextDatabase: DatabaseDefinition;
    try {
      nextDatabase = DatabaseDefinitionSchema.parse({
        ...resolved.database,
        storageMetadata: {
          ...(resolved.database.storageMetadata ?? {}),
          recordLifecycle: {
            ...existing,
            [input.recordId]: next,
          },
        },
      });
    } catch (error) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'Lifecycle metadata does not satisfy the v2 schema',
        { recordId: input.recordId },
        error,
      );
    }
    const afterManifest = updateDatabaseManifestYaml(beforeManifest, nextDatabase);
    const ownerRevision = sha256(resolved.markdown);
    const beforeManifestRevision = sha256(beforeManifest);
    const afterManifestRevision = sha256(afterManifest);
    if (afterManifest === beforeManifest) {
      return {
        changed: false,
        receipt: this.#lifecycleReceipt(
          resolved,
          row,
          manifestPath,
          beforeManifest,
          beforeManifest,
          ownerRevision,
          ownerRevision,
          undefined,
          undefined,
          undefined,
          input.actor,
        ),
      };
    }
    const mutationId = `mut_${this.#generateUuid().replaceAll('-', '')}`;
    await this.#assertOwnerStillCurrent(resolved);
    try {
      await this.#journal.prepare({
        mutationId,
        ...(input.actor ? { actor: input.actor } : {}),
        files: [
          {
            path: manifestPath,
            beforeSha256: beforeManifestRevision,
            afterSha256: afterManifestRevision,
            before: beforeManifest,
            after: afterManifest,
          },
        ],
        history: {
          operation: 'update_lifecycle',
          databaseId: resolved.database.id,
          sourceId: resolved.source.id,
          recordId: row.recordId,
          beforeRevision: beforeManifestRevision,
          afterRevision: afterManifestRevision,
        },
      });
      await this.#journal.checkpoint(mutationId, 'writing');
      const currentManifest = await this.#fs.readFile(manifestAbsolutePath);
      if (sha256(currentManifest) !== beforeManifestRevision) {
        throw new DatabaseMarkdownTableWriterError(
          'target_changed',
          'Database manifest changed during the lifecycle mutation',
          { manifestPath, observedRevision: sha256(currentManifest) },
        );
      }
      await this.#atomicWrite(manifestAbsolutePath, afterManifest);
      await this.#databaseStore.reload();
      await this.#refreshDatabaseIndex();
      await this.#verifyCommittedFiles([
        { path: manifestPath, afterSha256: afterManifestRevision },
      ]);
      await this.#journal.checkpoint(mutationId, 'committed');
    } catch (error) {
      try {
        const current = await this.#fs.readFile(manifestAbsolutePath).catch(() => null);
        if (current !== null && sha256(current) === afterManifestRevision) {
          await this.#atomicWrite(manifestAbsolutePath, beforeManifest);
        }
        await this.#databaseStore.reload();
        await this.#journal.checkpoint(mutationId, 'rolled_back');
      } catch (rollbackError) {
        await this.#journal.checkpoint(mutationId, 'recovery_required').catch(() => undefined);
        throw new DatabaseMarkdownTableWriterError(
          'rollback_failed',
          'V2 lifecycle metadata transaction failed and compensation was incomplete',
          { manifestPath },
          rollbackError,
        );
      }
      if (error instanceof DatabaseMarkdownTableWriterError) throw error;
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        'V2 lifecycle metadata transaction failed and was rolled back',
        { manifestPath },
        error,
      );
    }
    return {
      changed: true,
      receipt: this.#lifecycleReceipt(
        resolved,
        row,
        manifestPath,
        beforeManifest,
        afterManifest,
        ownerRevision,
        ownerRevision,
        mutationId,
        beforeManifestRevision,
        afterManifestRevision,
        input.actor,
      ),
    };
  }

  async #moveDocumentLocked(
    input: DatabaseMarkdownTableDocumentMoveInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision);
    const row = await this.#resolveRow(resolved, input.recordId);
    if (
      !safeRelativePath(input.newDocumentPath, null) ||
      !/\.(?:md|mdx)$/iu.test(input.newDocumentPath)
    ) {
      throw new DatabaseMarkdownTableWriterError(
        'document_move_invalid',
        'A moved document path must be a normalized relative Markdown path',
        { newDocumentPath: input.newDocumentPath },
      );
    }
    if (input.newDocumentPath === row.documentPath)
      return {
        changed: false,
        receipt: this.#moveReceipt(
          resolved,
          row,
          resolved.markdown,
          resolved.markdown,
          row.documentPath,
          row.documentPath,
          '',
          '',
          undefined,
          input.actor,
        ),
      };
    await this.#assertNoSymlinkComponents(row.documentPath);
    await this.#assertNoSymlinkComponents(input.newDocumentPath);
    const oldAbsolute = this.#safeAbsolutePath(row.documentPath);
    const newAbsolute = this.#safeAbsolutePath(input.newDocumentPath);
    try {
      const existing = await this.#fs.lstat(newAbsolute);
      if (existing.isFile() || existing.isDirectory() || existing.isSymbolicLink()) {
        throw new DatabaseMarkdownTableWriterError(
          'document_path_conflict',
          `Document path "${input.newDocumentPath}" is already occupied`,
          { newDocumentPath: input.newDocumentPath },
        );
      }
    } catch (error) {
      if (error instanceof DatabaseMarkdownTableWriterError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const beforeDocument = await this.#fs.readFile(oldAbsolute).catch((error) => {
      throw new DatabaseMarkdownTableWriterError(
        'document_not_found',
        `Linked document "${row.documentPath}" could not be read`,
        { documentPath: row.documentPath },
        error,
      );
    });
    const beforeDocumentRevision = sha256(beforeDocument);
    if (
      input.expectedDocumentRevision !== undefined &&
      input.expectedDocumentRevision !== beforeDocumentRevision
    ) {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Linked Markdown document changed after the move was planned',
        {
          expectedRevision: input.expectedDocumentRevision,
          observedRevision: beforeDocumentRevision,
        },
      );
    }
    const titleColumn = sourceStorage(resolved.source).storedPropertyIds.indexOf(
      sourceStorage(resolved.source).titlePropertyId,
    );
    const titleCell = resolved.owner.rows[row.rowIndex]?.cells[titleColumn];
    if (!titleCell)
      throw new DatabaseMarkdownTableWriterError(
        'owner_invalid',
        'The v2 row Title cell is missing',
      );
    const oldLink = decodedTitleLink(resolved.owner, resolved.source, row.rowIndex);
    const nextLink: DatabaseMarkdownDocumentLink = {
      kind: 'wikilink',
      target: documentLinkTarget(input.newDocumentPath),
      ...(oldLink.alias ? { alias: oldLink.alias } : {}),
    };
    const titleProperty = resolved.source.properties.find(
      (property) => property.id === sourceStorage(resolved.source).titlePropertyId,
    );
    if (!titleProperty)
      throw new DatabaseMarkdownTableWriterError(
        'owner_invalid',
        'The v2 source Title property is missing',
      );
    const rewrittenLinks = rewriteDatabaseMarkdownDocumentLinks({
      markdown: resolved.markdown,
      oldPath: row.documentPath,
      newPath: input.newDocumentPath,
    });
    const afterOwnerWithLinks = rewrittenLinks.markdown;
    const afterOwnerParsed = parseDatabaseMarkdownOwner(afterOwnerWithLinks);
    if (!afterOwnerParsed.ok) {
      throw new DatabaseMarkdownTableWriterError(
        'owner_invalid',
        `Moved document link rewrite produced an invalid owner: ${afterOwnerParsed.message}`,
      );
    }
    const afterOwner = replaceDatabaseMarkdownTableCell(
      afterOwnerWithLinks,
      afterOwnerParsed.owner,
      row.rowIndex,
      titleColumn,
      encodedCell(titleProperty, nextLink),
    );
    const ownerRevision = revision(resolved.markdown);
    const afterOwnerRevision = revision(afterOwner);
    const mutationId = `mut_${this.#generateUuid().replaceAll('-', '')}`;
    await this.#assertOwnerStillCurrent(resolved);
    try {
      await this.#journal.prepare({
        mutationId,
        ...(input.actor ? { actor: input.actor } : {}),
        files: [
          {
            path: row.documentPath,
            beforeSha256: beforeDocumentRevision,
            afterSha256: null,
            before: beforeDocument,
            after: null,
          },
          {
            path: input.newDocumentPath,
            beforeSha256: null,
            afterSha256: beforeDocumentRevision,
            before: null,
            after: beforeDocument,
          },
          {
            path: sourceStorage(resolved.source).owner.path,
            beforeSha256: ownerRevision.sha256,
            afterSha256: afterOwnerRevision.sha256,
            before: resolved.markdown,
            after: afterOwner,
          },
        ],
        history: {
          operation: 'move_document',
          databaseId: resolved.database.id,
          sourceId: resolved.source.id,
          recordId: row.recordId,
          propertyId: sourceStorage(resolved.source).titlePropertyId,
          beforeRevision: ownerRevision.sha256,
          afterRevision: afterOwnerRevision.sha256,
        },
      });
      await this.#journal.checkpoint(mutationId, 'writing');
      await this.#fs.mkdir(resolve(newAbsolute, '..'));
      await this.#fs.rename(oldAbsolute, newAbsolute);
      await this.#assertOwnerStillCurrent(resolved);
      await this.#atomicWrite(resolved.ownerAbsolutePath, afterOwner);
      await this.#refreshDatabaseIndex();
      await this.#verifyCommittedFiles([
        { path: sourceStorage(resolved.source).owner.path, afterSha256: afterOwnerRevision.sha256 },
        { path: input.newDocumentPath, afterSha256: beforeDocumentRevision },
      ]);
      await this.#journal.checkpoint(mutationId, 'committed');
    } catch (error) {
      try {
        const ownerCurrent = await this.#fs.readFile(resolved.ownerAbsolutePath).catch(() => null);
        if (ownerCurrent !== null && sha256(ownerCurrent) === afterOwnerRevision.sha256)
          await this.#atomicWrite(resolved.ownerAbsolutePath, resolved.markdown);
        const newCurrent = await this.#fs.readFile(newAbsolute).catch(() => null);
        if (newCurrent !== null && sha256(newCurrent) === beforeDocumentRevision)
          await this.#fs.rename(newAbsolute, oldAbsolute);
        await this.#journal.checkpoint(mutationId, 'rolled_back');
      } catch (rollbackError) {
        await this.#journal.checkpoint(mutationId, 'recovery_required').catch(() => undefined);
        throw new DatabaseMarkdownTableWriterError(
          'rollback_failed',
          'V2 document move failed and compensation was incomplete',
          { oldPath: row.documentPath, newPath: input.newDocumentPath },
          rollbackError,
        );
      }
      if (error instanceof DatabaseMarkdownTableWriterError && error.code === 'target_changed')
        throw error;
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        'V2 document move failed and was rolled back',
        { oldPath: row.documentPath, newPath: input.newDocumentPath },
        error,
      );
    }
    return {
      changed: true,
      receipt: this.#moveReceipt(
        resolved,
        row,
        resolved.markdown,
        afterOwner,
        row.documentPath,
        input.newDocumentPath,
        beforeDocument,
        beforeDocument,
        mutationId,
        input.actor,
      ),
    };
  }

  async #deleteRowLocked(
    input: Omit<DatabaseMarkdownTableRowMutationInput, 'values'>,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision, input.expectedRowRevision);
    const row = await this.#resolveRow(resolved, input.recordId);
    this.#assertRowAndCellRevisions(
      resolved,
      row.rowIndex,
      resolved.owner.rows[row.rowIndex]!.cells[0]!,
      input.expectedRowRevision,
      undefined,
    );
    const after = deleteDatabaseMarkdownTableRow(resolved.markdown, resolved.owner, row.rowIndex);
    const lifecycle = resolved.database.storageMetadata?.recordLifecycle;
    if (!lifecycle || lifecycle[input.recordId] === undefined) {
      return this.#commitOwnerOnly(
        'delete_row',
        resolved,
        row,
        after,
        undefined,
        undefined,
        input.actor,
      );
    }
    const manifestPath = `.ok/databases/${resolved.database.key}.yml`;
    const manifestAbsolutePath = this.#safeProjectAbsolutePath(manifestPath);
    await this.#assertNoProjectSymlinkComponents(manifestPath);
    const beforeManifest = await this.#fs.readFile(manifestAbsolutePath).catch((error) => {
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        `Database manifest "${manifestPath}" could not be read`,
        { manifestPath },
        error,
      );
    });
    const remainingLifecycle = { ...lifecycle };
    delete remainingLifecycle[input.recordId];
    let afterManifest: string;
    try {
      afterManifest = updateDatabaseManifestYaml(
        beforeManifest,
        DatabaseDefinitionSchema.parse({
          ...resolved.database,
          storageMetadata: {
            ...(resolved.database.storageMetadata ?? {}),
            recordLifecycle: remainingLifecycle,
          },
        }),
      );
    } catch (error) {
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        'The database manifest could not be updated while removing lifecycle metadata',
        { manifestPath, recordId: input.recordId },
        error,
      );
    }
    if (afterManifest === beforeManifest) {
      return this.#commitOwnerOnly(
        'delete_row',
        resolved,
        row,
        after,
        undefined,
        undefined,
        input.actor,
      );
    }
    return this.#commitOwnerOnly(
      'delete_row',
      resolved,
      row,
      after,
      undefined,
      {
        path: manifestPath,
        before: beforeManifest,
        after: afterManifest,
      },
      input.actor,
    );
  }

  async #createRowLocked(
    input: DatabaseMarkdownTableRowCreateInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision);
    if (
      Buffer.byteLength(input.documentMarkdown, 'utf8') >
      DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes
    ) {
      throw new DatabaseMarkdownTableWriterError(
        'resource_limit',
        'The linked Markdown document exceeds the v2 document byte limit',
        { limit: DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes },
      );
    }
    if (resolved.owner.rows.length >= DATABASE_MARKDOWN_LIMITS.rows) {
      throw new DatabaseMarkdownTableWriterError(
        'resource_limit',
        'The v2 owner table has reached its row limit',
        { limit: DATABASE_MARKDOWN_LIMITS.rows },
      );
    }
    if (!safeRelativePath(input.documentPath, null) || !/\.(?:md|mdx)$/i.test(input.documentPath)) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'A new v2 row document path must be a normalized relative Markdown path',
        {
          documentPath: input.documentPath,
        },
      );
    }
    await this.#assertNoSymlinkComponents(input.documentPath);
    const documentAbsolutePath = this.#safeAbsolutePath(input.documentPath);
    try {
      const stats = await this.#fs.lstat(documentAbsolutePath);
      if (stats.isSymbolicLink() || stats.isFile() || stats.isDirectory()) {
        throw new DatabaseMarkdownTableWriterError(
          'document_path_conflict',
          `Document path "${input.documentPath}" is already occupied`,
          {
            documentPath: input.documentPath,
          },
        );
      }
    } catch (error) {
      if (error instanceof DatabaseMarkdownTableWriterError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const existing = parseDatabaseDocumentIdentity(input.documentMarkdown);
    const documentId =
      input.documentId ??
      (existing.ok ? existing.documentId : createDatabaseDocumentId(this.#generateUuid));
    const ensured = ensureDatabaseDocumentIdentity({
      markdown: input.documentMarkdown,
      documentId,
    });
    if (!ensured.ok) {
      throw new DatabaseMarkdownTableWriterError('document_identity_invalid', ensured.message, {
        documentPath: input.documentPath,
      });
    }
    if (existing.ok && existing.documentId !== documentId) {
      throw new DatabaseMarkdownTableWriterError(
        'document_identity_invalid',
        'The supplied document identity does not match documentId',
        {
          expectedDocumentId: documentId,
          observedDocumentId: existing.documentId,
        },
      );
    }
    const recordId = createDatabaseMarkdownRecordId(resolved.source.id, documentId);
    try {
      await this.#resolveRow(resolved, recordId);
      throw new DatabaseMarkdownTableWriterError(
        'duplicate_record',
        `Document identity already belongs to record "${recordId}"`,
        { recordId },
      );
    } catch (error) {
      if (!(error instanceof DatabaseMarkdownTableWriterError) || error.code !== 'record_not_found')
        throw error;
    }
    const storage = sourceStorage(resolved.source);
    const link: DatabaseMarkdownDocumentLink = {
      kind: 'wikilink',
      target: documentLinkTarget(input.documentPath),
    };
    const values = input.values ?? {};
    const encodedValues = storage.storedPropertyIds.map((propertyId) => {
      const property = resolved.source.properties.find((candidate) => candidate.id === propertyId);
      if (!property)
        throw new DatabaseMarkdownTableWriterError(
          'owner_invalid',
          `Stored property "${propertyId}" is missing from the source`,
        );
      if (property.type === 'unique_id' && values[propertyId] === undefined) {
        throw new DatabaseMarkdownTableWriterError(
          'allocated_property_read_only',
          `Unique ID property "${property.id}" requires a preallocated value from the reviewed plan`,
          { propertyId: property.id },
        );
      }
      return property.type === 'title'
        ? encodedCell(property, link)
        : encodedCell(property, values[propertyId]);
    });
    const afterOwner = insertDatabaseMarkdownTableRow(
      resolved.markdown,
      resolved.owner,
      resolved.owner.rows.length,
      encodedValues,
    );
    if (Buffer.byteLength(afterOwner, 'utf8') > DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes) {
      throw new DatabaseMarkdownTableWriterError(
        'resource_limit',
        'The v2 owner document exceeds the byte limit after row creation',
        { limit: DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes },
      );
    }
    const documentRevision = revision(ensured.markdown);
    const ownerRevision = revision(resolved.markdown);
    const mutationId = `mut_${this.#generateUuid().replaceAll('-', '')}`;
    try {
      await this.#journal.prepare({
        mutationId,
        ...(input.actor ? { actor: input.actor } : {}),
        files: [
          {
            path: input.documentPath,
            beforeSha256: null,
            afterSha256: documentRevision.sha256,
            before: null,
            after: ensured.markdown,
          },
          {
            path: sourceStorage(resolved.source).owner.path,
            beforeSha256: ownerRevision.sha256,
            afterSha256: sha256(afterOwner),
            before: resolved.markdown,
            after: afterOwner,
          },
        ],
        history: {
          operation: 'create_row',
          databaseId: resolved.database.id,
          sourceId: resolved.source.id,
          recordId,
          beforeRevision: ownerRevision.sha256,
          afterRevision: sha256(afterOwner),
        },
      });
      await this.#journal.checkpoint(mutationId, 'writing');
      await this.#assertNoSymlinkComponents(input.documentPath);
      await this.#assertNoSymlinkComponents(sourceStorage(resolved.source).owner.path);
      await this.#fs.mkdir(resolve(documentAbsolutePath, '..'));
      await this.#atomicWrite(documentAbsolutePath, ensured.markdown);
      await this.#assertOwnerStillCurrent(resolved);
      await this.#atomicWrite(resolved.ownerAbsolutePath, afterOwner);
      await this.#refreshDatabaseIndex();
      await this.#verifyCommittedFiles([
        { path: input.documentPath, afterSha256: documentRevision.sha256 },
        { path: sourceStorage(resolved.source).owner.path, afterSha256: sha256(afterOwner) },
      ]);
      await this.#journal.checkpoint(mutationId, 'committed');
    } catch (error) {
      try {
        const ownerCurrent = await this.#fs.readFile(resolved.ownerAbsolutePath).catch(() => null);
        if (ownerCurrent !== null && sha256(ownerCurrent) === sha256(afterOwner)) {
          await this.#atomicWrite(resolved.ownerAbsolutePath, resolved.markdown);
        }
        const documentCurrent = await this.#fs.readFile(documentAbsolutePath).catch(() => null);
        if (documentCurrent !== null && sha256(documentCurrent) === documentRevision.sha256)
          await this.#fs.unlink(documentAbsolutePath);
        await this.#journal.checkpoint(mutationId, 'rolled_back');
      } catch (rollbackError) {
        await this.#journal.checkpoint(mutationId, 'recovery_required').catch(() => undefined);
        throw new DatabaseMarkdownTableWriterError(
          'rollback_failed',
          'V2 row creation failed and compensation was incomplete',
          {
            ownerPath: sourceStorage(resolved.source).owner.path,
            documentPath: input.documentPath,
          },
          rollbackError,
        );
      }
      if (error instanceof DatabaseMarkdownTableWriterError && error.code === 'target_changed') {
        throw error;
      }
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        'V2 row creation failed and was rolled back',
        {
          ownerPath: sourceStorage(resolved.source).owner.path,
          documentPath: input.documentPath,
        },
        error,
      );
    }
    const row: ResolvedRow = {
      rowIndex: resolved.owner.rows.length,
      recordId,
      documentPath: input.documentPath,
      documentId,
    };
    const receipt: DatabaseMarkdownTableMutationReceipt = {
      version: 1,
      mutationId,
      operation: 'create_row',
      databaseId: resolved.database.id,
      sourceId: resolved.source.id,
      ownerPath: sourceStorage(resolved.source).owner.path,
      recordId,
      rowIndex: row.rowIndex,
      files: [
        { path: input.documentPath, operation: 'create', before: null, after: documentRevision },
        {
          path: sourceStorage(resolved.source).owner.path,
          operation: 'update',
          before: ownerRevision,
          after: revision(afterOwner),
        },
      ],
      beforeOwnerRevision: ownerRevision.sha256,
      afterOwnerRevision: sha256(afterOwner),
      beforeOwnerContent: resolved.markdown,
      createdDocumentContent: ensured.markdown,
      afterOwnerContent: afterOwner,
      committedAt: new Date().toISOString(),
      ...(input.actor ? { actor: input.actor } : {}),
    };
    return { changed: true, receipt };
  }

  async #createRowsLocked(
    input: DatabaseMarkdownTableRowsCreateInput,
  ): Promise<DatabaseMarkdownTableRowsCreateResult> {
    const receipts: DatabaseMarkdownTableMutationReceipt[] = [];
    let expectedOwnerRevision = input.expectedOwnerRevision;
    try {
      for (const row of input.rows) {
        const result = await this.#createRowLocked({
          ...row,
          databaseId: input.databaseId,
          sourceId: input.sourceId,
          expectedOwnerRevision,
          ...(input.actor ? { actor: input.actor } : {}),
        });
        if (!result.changed) continue;
        receipts.push(result.receipt);
        expectedOwnerRevision = result.receipt.afterOwnerRevision;
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const receipt of [...receipts].reverse()) {
        try {
          await this.#undoLocked({
            receipt,
            expectedAfterOwnerRevision: receipt.afterOwnerRevision,
            ...(input.actor ? { actor: input.actor } : {}),
          });
        } catch (rollbackError) {
          rollbackErrors.push(
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          );
        }
      }
      if (rollbackErrors.length > 0) {
        throw new DatabaseMarkdownTableWriterError(
          'rollback_failed',
          'V2 batch row creation failed and compensation was incomplete',
          { rollbackErrors },
          error,
        );
      }
      throw error;
    }
    return { changed: receipts.length > 0, receipts };
  }

  async #copyRowLocked(
    input: DatabaseMarkdownTableRowCopyInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    if (input.mode === 'linked_view') {
      throw new DatabaseMarkdownTableWriterError(
        'reference_only',
        'A linked view is reference-only and cannot copy a canonical row',
        { databaseId: input.databaseId, sourceId: input.sourceId, recordId: input.recordId },
      );
    }
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision, input.expectedRowRevision);
    const row = await this.#resolveRow(resolved, input.recordId);
    if (
      !safeRelativePath(input.documentPath, null) ||
      !/\.(?:md|mdx)$/iu.test(input.documentPath)
    ) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'A copied v2 row document path must be a normalized relative Markdown path',
        { documentPath: input.documentPath },
      );
    }
    const sourceMarkdown = await this.#fs
      .readFile(this.#safeAbsolutePath(row.documentPath))
      .catch((error) => {
        throw new DatabaseMarkdownTableWriterError(
          'document_not_found',
          `Linked Markdown document "${row.documentPath}" could not be read`,
          { documentPath: row.documentPath },
          error,
        );
      });
    const sourceIdentity = parseDatabaseDocumentIdentity(sourceMarkdown);
    if (!sourceIdentity.ok) {
      throw new DatabaseMarkdownTableWriterError(
        'document_identity_invalid',
        `Linked Markdown document "${row.documentPath}" has no valid identity`,
        { documentPath: row.documentPath, identityCode: sourceIdentity.code },
      );
    }
    const documentId = input.documentId ?? createDatabaseDocumentId(this.#generateUuid);
    const reassigned = reassignDatabaseDocumentIdentity({ markdown: sourceMarkdown, documentId });
    if (!reassigned.ok) {
      throw new DatabaseMarkdownTableWriterError('document_identity_invalid', reassigned.message, {
        documentPath: row.documentPath,
        identityCode: reassigned.code,
      });
    }
    const storage = sourceStorage(resolved.source);
    const sourceRow = resolved.owner.rows[row.rowIndex];
    if (!sourceRow)
      throw new DatabaseMarkdownTableWriterError('owner_invalid', 'The source row is missing');
    const values: Record<string, unknown> = {};
    for (const [columnIndex, propertyId] of storage.storedPropertyIds.entries()) {
      const property = resolved.source.properties.find((candidate) => candidate.id === propertyId);
      const cell = sourceRow.cells[columnIndex];
      if (!property || !cell)
        throw new DatabaseMarkdownTableWriterError(
          'owner_invalid',
          'The source row schema is incomplete',
        );
      if (property.type === 'title') continue;
      const decoded = decodeDatabaseMarkdownCell(propertyType(property), cell.raw);
      if (!decoded.ok) {
        throw new DatabaseMarkdownTableWriterError('invalid_cell_value', decoded.message, {
          propertyId,
          codecCode: decoded.code,
        });
      }
      values[propertyId] = decoded.value;
    }
    const result = await this.#createRowLocked({
      databaseId: input.databaseId,
      sourceId: input.sourceId,
      documentPath: input.documentPath,
      documentMarkdown: reassigned.markdown,
      documentId,
      values,
      expectedOwnerRevision: input.expectedOwnerRevision,
      ...(input.actor ? { actor: input.actor } : {}),
    });
    return result.changed
      ? { changed: true, receipt: { ...result.receipt, operation: 'copy_row' } }
      : result;
  }

  async #commitOwnerOnly(
    operation: 'update_cell' | 'update_cells' | 'replace_row' | 'delete_row',
    resolved: ResolvedSource,
    row: ResolvedRow,
    after: string,
    propertyId?: string,
    manifest?: ManifestMutation,
    actor?: DatabaseRecordActor,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    const before = resolved.markdown;
    const ownerRevision = revision(before);
    const afterRevision = revision(after);
    if (
      after !== before &&
      Buffer.byteLength(after, 'utf8') > DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes
    ) {
      throw new DatabaseMarkdownTableWriterError(
        'resource_limit',
        'The v2 owner document exceeds the byte limit after mutation',
        { limit: DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes },
      );
    }
    const receipt = this.#receipt(
      operation,
      resolved,
      row,
      before,
      after,
      propertyId,
      manifest,
      actor,
    );
    if (before === after && manifest === undefined) return { changed: false, receipt };
    try {
      await this.#assertOwnerStillCurrent(resolved);
      await this.#assertNoSymlinkComponents(sourceStorage(resolved.source).owner.path);
      if (manifest) {
        await this.#assertNoProjectSymlinkComponents(manifest.path);
        const currentManifest = await this.#fs.readFile(
          this.#safeProjectAbsolutePath(manifest.path),
        );
        if (sha256(currentManifest) !== sha256(manifest.before)) {
          throw new DatabaseMarkdownTableWriterError(
            'target_changed',
            'Database manifest changed after the v2 membership mutation was planned',
            { manifestPath: manifest.path, observedRevision: sha256(currentManifest) },
          );
        }
      }
      await this.#journal.prepare({
        mutationId: receipt.mutationId,
        ...(actor ? { actor } : {}),
        files: [
          {
            path: sourceStorage(resolved.source).owner.path,
            beforeSha256: ownerRevision.sha256,
            afterSha256: afterRevision.sha256,
            before,
            after,
          },
          ...(manifest
            ? [
                {
                  path: manifest.path,
                  beforeSha256: sha256(manifest.before),
                  afterSha256: sha256(manifest.after),
                  before: manifest.before,
                  after: manifest.after,
                },
              ]
            : []),
        ],
        history: {
          operation,
          databaseId: resolved.database.id,
          sourceId: resolved.source.id,
          recordId: row.recordId,
          ...(propertyId ? { propertyId } : {}),
          beforeRevision: ownerRevision.sha256,
          afterRevision: afterRevision.sha256,
        },
      });
      await this.#journal.checkpoint(receipt.mutationId, 'writing');
      await this.#assertNoSymlinkComponents(sourceStorage(resolved.source).owner.path);
      await this.#atomicWrite(resolved.ownerAbsolutePath, after);
      if (manifest) {
        const manifestAbsolutePath = this.#safeProjectAbsolutePath(manifest.path);
        const currentManifest = await this.#fs.readFile(manifestAbsolutePath);
        if (sha256(currentManifest) !== sha256(manifest.before)) {
          throw new DatabaseMarkdownTableWriterError(
            'target_changed',
            'Database manifest changed during the v2 membership mutation',
            { manifestPath: manifest.path, observedRevision: sha256(currentManifest) },
          );
        }
        await this.#atomicWrite(manifestAbsolutePath, manifest.after);
      }
      if (manifest) await this.#databaseStore.reload();
      await this.#refreshDatabaseIndex();
      await this.#verifyCommittedFiles([
        {
          path: sourceStorage(resolved.source).owner.path,
          afterSha256: afterRevision.sha256,
        },
        ...(manifest ? [{ path: manifest.path, afterSha256: sha256(manifest.after) }] : []),
      ]);
      await this.#journal.checkpoint(receipt.mutationId, 'committed');
    } catch (error) {
      try {
        const current = await this.#fs.readFile(resolved.ownerAbsolutePath);
        if (sha256(current) === afterRevision.sha256) {
          await this.#atomicWrite(resolved.ownerAbsolutePath, before);
        }
        if (manifest) {
          const manifestAbsolutePath = this.#safeProjectAbsolutePath(manifest.path);
          const currentManifest = await this.#fs.readFile(manifestAbsolutePath).catch(() => null);
          if (currentManifest !== null && sha256(currentManifest) === sha256(manifest.after)) {
            await this.#atomicWrite(manifestAbsolutePath, manifest.before);
          }
          await this.#databaseStore.reload();
        }
        await this.#journal.checkpoint(receipt.mutationId, 'rolled_back');
      } catch (rollbackError) {
        await this.#journal
          .checkpoint(receipt.mutationId, 'recovery_required')
          .catch(() => undefined);
        throw new DatabaseMarkdownTableWriterError(
          'rollback_failed',
          'V2 owner-table write failed and compensation was incomplete',
          {
            ownerPath: resolved.ownerAbsolutePath,
            beforeRevision: ownerRevision.sha256,
            afterRevision: afterRevision.sha256,
          },
          rollbackError,
        );
      }
      if (error instanceof DatabaseMarkdownTableWriterError && error.code === 'target_changed') {
        throw error;
      }
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        'V2 owner-table write failed and was rolled back',
        {
          ownerPath: resolved.ownerAbsolutePath,
        },
        error,
      );
    }
    return { changed: true, receipt };
  }

  async #undoLocked(
    input: DatabaseMarkdownTableUndoInput,
  ): Promise<{ changed: boolean; receipt: DatabaseMarkdownTableMutationReceipt }> {
    const receipt = input.receipt;
    if (receipt.version !== 1 || !receipt.ownerPath || !receipt.afterOwnerRevision) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'The v2 mutation receipt is malformed',
      );
    }
    const resolved = await this.#loadSource(receipt.databaseId, receipt.sourceId);
    const configuredOwnerPath = sourceStorage(resolved.source).owner.path;
    if (configuredOwnerPath !== receipt.ownerPath) {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Undo receipt no longer points at the source owner document',
        {
          expectedOwnerPath: receipt.ownerPath,
          observedOwnerPath: configuredOwnerPath,
        },
      );
    }
    const current = await this.#fs.readFile(resolved.ownerAbsolutePath);
    const expectedAfter = input.expectedAfterOwnerRevision ?? receipt.afterOwnerRevision;
    if (sha256(current) !== expectedAfter && sha256(current) !== receipt.beforeOwnerRevision) {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Undo refused because the owner document changed after the mutation',
        {
          ownerPath: receipt.ownerPath,
          expectedAfterRevision: expectedAfter,
          observedRevision: sha256(current),
        },
      );
    }
    const titleDocumentPath =
      receipt.operation === 'update_title' ? receipt.documentPath : undefined;
    const moveDocumentPath =
      receipt.operation === 'move_document' ? receipt.documentPath : undefined;
    const movePreviousPath =
      receipt.operation === 'move_document' ? receipt.previousDocumentPath : undefined;
    const lifecycleManifestPath = receipt.manifestPath;
    const titleDocumentAbsolute = titleDocumentPath
      ? this.#safeAbsolutePath(titleDocumentPath)
      : null;
    const moveDocumentAbsolute = moveDocumentPath ? this.#safeAbsolutePath(moveDocumentPath) : null;
    const lifecycleManifestAbsolute = lifecycleManifestPath
      ? this.#safeProjectAbsolutePath(lifecycleManifestPath)
      : null;
    const titleDocumentCurrent = titleDocumentAbsolute
      ? await this.#fs.readFile(titleDocumentAbsolute).catch((error) => {
          throw new DatabaseMarkdownTableWriterError(
            'document_not_found',
            'Undo refused because the linked title document disappeared',
            { documentPath: titleDocumentPath },
            error,
          );
        })
      : null;
    if (receipt.operation === 'update_title') {
      if (
        !receipt.beforeDocumentContent ||
        !receipt.afterDocumentRevision ||
        !receipt.beforeDocumentRevision ||
        !titleDocumentPath
      ) {
        throw new DatabaseMarkdownTableWriterError(
          'invalid_request',
          'Title receipt does not carry recoverable linked-document bytes',
        );
      }
      if (
        sha256(titleDocumentCurrent!) !== receipt.afterDocumentRevision &&
        sha256(titleDocumentCurrent!) !== receipt.beforeDocumentRevision
      ) {
        throw new DatabaseMarkdownTableWriterError(
          'target_changed',
          'Undo refused because the linked title document changed after the mutation',
          {
            documentPath: titleDocumentPath,
            expectedAfterRevision: receipt.afterDocumentRevision,
            observedRevision: sha256(titleDocumentCurrent!),
          },
        );
      }
    }
    const movedDocumentCurrent = moveDocumentAbsolute
      ? await this.#fs.readFile(moveDocumentAbsolute).catch((error) => {
          throw new DatabaseMarkdownTableWriterError(
            'document_not_found',
            'Undo refused because the moved document disappeared',
            { documentPath: moveDocumentPath },
            error,
          );
        })
      : null;
    if (receipt.operation === 'move_document') {
      if (
        !receipt.beforeDocumentContent ||
        !receipt.afterDocumentRevision ||
        !receipt.beforeDocumentRevision ||
        !moveDocumentPath ||
        !movePreviousPath
      ) {
        throw new DatabaseMarkdownTableWriterError(
          'invalid_request',
          'Move receipt does not carry recoverable document paths/bytes',
        );
      }
      if (sha256(movedDocumentCurrent!) !== receipt.afterDocumentRevision) {
        throw new DatabaseMarkdownTableWriterError(
          'target_changed',
          'Undo refused because the moved document changed after the mutation',
          {
            documentPath: moveDocumentPath,
            expectedAfterRevision: receipt.afterDocumentRevision,
            observedRevision: sha256(movedDocumentCurrent!),
          },
        );
      }
      const previousAbsolute = this.#safeAbsolutePath(movePreviousPath);
      const previousExists = await this.#fs
        .lstat(previousAbsolute)
        .then(() => true)
        .catch(() => false);
      if (previousExists)
        throw new DatabaseMarkdownTableWriterError(
          'document_path_conflict',
          'Undo refused because the previous document path is occupied',
          { documentPath: movePreviousPath },
        );
    }
    let lifecycleManifestCurrent: string | null = null;
    if (lifecycleManifestPath) {
      if (
        !lifecycleManifestPath ||
        !lifecycleManifestAbsolute ||
        !receipt.beforeManifestContent ||
        !receipt.afterManifestRevision ||
        !receipt.beforeManifestRevision
      ) {
        throw new DatabaseMarkdownTableWriterError(
          'invalid_request',
          'Manifest mutation receipt does not carry recoverable bytes',
        );
      }
      lifecycleManifestCurrent = await this.#fs
        .readFile(lifecycleManifestAbsolute)
        .catch((error) => {
          throw new DatabaseMarkdownTableWriterError(
            'target_changed',
            'Undo refused because the database manifest disappeared',
            { manifestPath: lifecycleManifestPath },
            error,
          );
        });
      if (
        sha256(lifecycleManifestCurrent) !== receipt.afterManifestRevision &&
        sha256(lifecycleManifestCurrent) !== receipt.beforeManifestRevision
      ) {
        throw new DatabaseMarkdownTableWriterError(
          'target_changed',
          'Undo refused because the database manifest changed after the mutation',
          {
            manifestPath: lifecycleManifestPath,
            expectedAfterRevision: receipt.afterManifestRevision,
            observedRevision: sha256(lifecycleManifestCurrent),
          },
        );
      }
    }
    if (
      sha256(current) === receipt.beforeOwnerRevision &&
      (receipt.operation !== 'update_title' ||
        sha256(titleDocumentCurrent!) === receipt.beforeDocumentRevision) &&
      (!lifecycleManifestPath ||
        sha256(lifecycleManifestCurrent!) === receipt.beforeManifestRevision)
    )
      return { changed: false, receipt };
    const undoMutationId = `mut_${randomUUID().replaceAll('-', '')}`;
    const beforeOwner =
      receipt.operation === 'create_row' || receipt.operation === 'copy_row'
        ? this.#ownerBefore(receipt, resolved.markdown)
        : await this.#beforeOwnerBytes(receipt);
    const ownerFilePath = receipt.ownerPath;
    const undoFiles: Array<{
      path: string;
      beforeSha256: string | null;
      afterSha256: string | null;
      before: string | null;
      after: string | null;
    }> = [
      {
        path: ownerFilePath,
        beforeSha256: sha256(current),
        afterSha256: sha256(beforeOwner),
        before: current,
        after: beforeOwner,
      },
    ];
    let documentAbsolute: string | null = null;
    let documentBefore: string | null = null;
    if (receipt.operation === 'create_row' || receipt.operation === 'copy_row') {
      const documentFile = receipt.files.find(
        (file) => file.path !== receipt.ownerPath && file.operation === 'create',
      );
      if (!documentFile)
        throw new DatabaseMarkdownTableWriterError(
          'invalid_request',
          'Create-row receipt has no document file delta',
        );
      documentAbsolute = this.#safeAbsolutePath(documentFile.path);
      documentBefore = await this.#fs.readFile(documentAbsolute).catch(() => null);
      if (
        documentBefore !== null &&
        documentFile.after &&
        sha256(documentBefore) !== documentFile.after.sha256
      ) {
        throw new DatabaseMarkdownTableWriterError(
          'target_changed',
          'Undo refused because the created document changed after the mutation',
          {
            documentPath: documentFile.path,
          },
        );
      }
      undoFiles.push({
        path: documentFile.path,
        beforeSha256: documentBefore === null ? null : sha256(documentBefore),
        afterSha256: null,
        before: documentBefore,
        after: null,
      });
    } else if (receipt.operation === 'update_title') {
      documentAbsolute = titleDocumentAbsolute;
      documentBefore = titleDocumentCurrent;
      undoFiles.push({
        path: titleDocumentPath!,
        beforeSha256: sha256(documentBefore!),
        afterSha256: sha256(receipt.beforeDocumentContent!),
        before: documentBefore,
        after: receipt.beforeDocumentContent!,
      });
    } else if (receipt.operation === 'move_document') {
      documentAbsolute = moveDocumentAbsolute;
      documentBefore = movedDocumentCurrent;
      undoFiles.push({
        path: moveDocumentPath!,
        beforeSha256: sha256(documentBefore!),
        afterSha256: null,
        before: documentBefore,
        after: null,
      });
      undoFiles.push({
        path: movePreviousPath!,
        beforeSha256: null,
        afterSha256: sha256(receipt.beforeDocumentContent!),
        before: null,
        after: receipt.beforeDocumentContent!,
      });
    } else if (lifecycleManifestPath) {
      undoFiles.push({
        path: lifecycleManifestPath!,
        beforeSha256: sha256(lifecycleManifestCurrent!),
        afterSha256: sha256(receipt.beforeManifestContent!),
        before: lifecycleManifestCurrent,
        after: receipt.beforeManifestContent!,
      });
    }
    await this.#assertOwnerStillCurrent({ ...resolved, markdown: current });
    await this.#assertNoSymlinkComponents(receipt.ownerPath);
    for (const file of undoFiles.slice(1)) {
      if (file.path.startsWith('.ok/')) await this.#assertNoProjectSymlinkComponents(file.path);
      else await this.#assertNoSymlinkComponents(file.path);
    }
    await this.#journal.prepare({
      mutationId: undoMutationId,
      ...((input.actor ?? receipt.actor) ? { actor: input.actor ?? receipt.actor } : {}),
      files: undoFiles,
      history: {
        operation: `undo:${receipt.operation}`,
        databaseId: receipt.databaseId,
        sourceId: receipt.sourceId,
        recordId: receipt.recordId,
        ...(receipt.propertyId ? { propertyId: receipt.propertyId } : {}),
        beforeRevision: sha256(current),
        afterRevision: sha256(beforeOwner),
      },
    });
    await this.#journal.checkpoint(undoMutationId, 'writing');
    let ownerWritten = false;
    let documentWritten = false;
    let lifecycleManifestWritten = false;
    try {
      await this.#atomicWrite(resolved.ownerAbsolutePath, beforeOwner);
      ownerWritten = true;
      if (
        receipt.operation === 'update_title' &&
        documentAbsolute &&
        receipt.beforeDocumentContent !== undefined
      ) {
        await this.#atomicWrite(documentAbsolute, receipt.beforeDocumentContent);
        documentWritten = true;
      } else if (
        receipt.operation === 'move_document' &&
        documentAbsolute &&
        receipt.beforeDocumentContent !== undefined &&
        movePreviousPath
      ) {
        await this.#fs.unlink(documentAbsolute);
        const previousAbsolute = this.#safeAbsolutePath(movePreviousPath);
        await this.#fs.mkdir(resolve(previousAbsolute, '..'));
        await this.#atomicWrite(previousAbsolute, receipt.beforeDocumentContent);
        documentWritten = true;
      } else if (
        lifecycleManifestPath &&
        lifecycleManifestAbsolute &&
        receipt.beforeManifestContent !== undefined
      ) {
        await this.#atomicWrite(lifecycleManifestAbsolute, receipt.beforeManifestContent);
        lifecycleManifestWritten = true;
      } else if (documentAbsolute && documentBefore !== null) {
        await this.#fs.unlink(documentAbsolute);
      }
      await this.#journal.checkpoint(undoMutationId, 'committed');
    } catch (error) {
      try {
        if (ownerWritten) await this.#atomicWrite(resolved.ownerAbsolutePath, current);
        if (
          receipt.operation === 'move_document' &&
          documentWritten &&
          documentAbsolute &&
          movePreviousPath &&
          documentBefore !== null
        ) {
          const previousAbsolute = this.#safeAbsolutePath(movePreviousPath);
          const previousCurrent = await this.#fs.readFile(previousAbsolute).catch(() => null);
          if (
            previousCurrent !== null &&
            sha256(previousCurrent) === sha256(receipt.beforeDocumentContent!)
          ) {
            await this.#fs.unlink(previousAbsolute);
          }
          await this.#fs.mkdir(resolve(documentAbsolute, '..'));
          await this.#atomicWrite(documentAbsolute, documentBefore);
        } else if (documentWritten && documentAbsolute && documentBefore !== null) {
          await this.#atomicWrite(documentAbsolute, documentBefore);
        } else if (documentAbsolute && documentBefore !== null) {
          const documentCurrent = await this.#fs.readFile(documentAbsolute).catch(() => null);
          if (documentCurrent === null) {
            await this.#fs.mkdir(resolve(documentAbsolute, '..'));
            await this.#atomicWrite(documentAbsolute, documentBefore);
          }
        }
        if (
          lifecycleManifestWritten &&
          lifecycleManifestAbsolute &&
          lifecycleManifestCurrent !== null
        ) {
          await this.#atomicWrite(lifecycleManifestAbsolute, lifecycleManifestCurrent);
        }
        await this.#journal.checkpoint(undoMutationId, 'rolled_back');
      } catch (rollbackError) {
        await this.#journal.checkpoint(undoMutationId, 'recovery_required').catch(() => undefined);
        throw new DatabaseMarkdownTableWriterError(
          'rollback_failed',
          'V2 undo failed and compensation was incomplete',
          { ownerPath: receipt.ownerPath },
          rollbackError,
        );
      }
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        'V2 undo failed and was rolled back',
        { ownerPath: receipt.ownerPath },
        error,
      );
    }
    try {
      if (lifecycleManifestPath) await this.#databaseStore.reload();
      await this.#refreshDatabaseIndex();
    } catch (error) {
      throw new DatabaseMarkdownTableWriterError(
        'transaction_failed',
        'V2 undo completed bytes but index refresh failed',
        {
          ownerPath: receipt.ownerPath,
        },
        error,
      );
    }
    return { changed: true, receipt };
  }

  #receipt(
    operation: Exclude<
      DatabaseMarkdownTableMutationReceipt['operation'],
      'update_title' | 'update_lifecycle'
    >,
    resolved: ResolvedSource,
    row: ResolvedRow,
    before: string,
    after: string,
    propertyId?: string,
    manifest?: ManifestMutation,
    actor?: DatabaseRecordActor,
  ): DatabaseMarkdownTableMutationReceipt {
    const beforeRevision = revision(before);
    const afterRevision = revision(after);
    const manifestBeforeRevision = manifest ? revision(manifest.before) : null;
    const manifestAfterRevision = manifest ? revision(manifest.after) : null;
    return {
      version: 1,
      mutationId: `mut_${this.#generateUuid().replaceAll('-', '')}`,
      operation,
      databaseId: resolved.database.id,
      sourceId: resolved.source.id,
      ownerPath: sourceStorage(resolved.source).owner.path,
      recordId: row.recordId,
      ...(propertyId ? { propertyId } : {}),
      rowIndex: row.rowIndex,
      files: [
        {
          path: sourceStorage(resolved.source).owner.path,
          operation: 'update',
          before: beforeRevision,
          after: afterRevision,
        },
        ...(manifest && manifestBeforeRevision && manifestAfterRevision
          ? [
              {
                path: manifest.path,
                operation: 'update' as const,
                before: manifestBeforeRevision,
                after: manifestAfterRevision,
              },
            ]
          : []),
      ],
      beforeOwnerRevision: beforeRevision.sha256,
      afterOwnerRevision: afterRevision.sha256,
      beforeOwnerContent: before,
      afterOwnerContent: after,
      ...(manifest
        ? {
            manifestPath: manifest.path,
            beforeManifestRevision: manifestBeforeRevision!.sha256,
            afterManifestRevision: manifestAfterRevision!.sha256,
            beforeManifestContent: manifest.before,
            afterManifestContent: manifest.after,
          }
        : {}),
      committedAt: new Date().toISOString(),
      ...(actor ? { actor } : {}),
    };
  }

  #titleReceipt(
    resolved: ResolvedSource,
    row: ResolvedRow,
    beforeOwner: string,
    afterOwner: string,
    documentPath: string,
    beforeDocument: string,
    afterDocument: string,
    mutationId = `mut_${this.#generateUuid().replaceAll('-', '')}`,
    actor?: DatabaseRecordActor,
  ): DatabaseMarkdownTableMutationReceipt {
    const beforeOwnerRevision = revision(beforeOwner);
    const afterOwnerRevision = revision(afterOwner);
    const beforeDocumentRevision = revision(beforeDocument);
    const afterDocumentRevision = revision(afterDocument);
    return {
      version: 1,
      mutationId,
      operation: 'update_title',
      databaseId: resolved.database.id,
      sourceId: resolved.source.id,
      ownerPath: sourceStorage(resolved.source).owner.path,
      recordId: row.recordId,
      propertyId: sourceStorage(resolved.source).titlePropertyId,
      rowIndex: row.rowIndex,
      files: [
        {
          path: sourceStorage(resolved.source).owner.path,
          operation: 'update',
          before: beforeOwnerRevision,
          after: afterOwnerRevision,
        },
        {
          path: documentPath,
          operation: 'update',
          before: beforeDocumentRevision,
          after: afterDocumentRevision,
        },
      ],
      beforeOwnerRevision: beforeOwnerRevision.sha256,
      afterOwnerRevision: afterOwnerRevision.sha256,
      beforeOwnerContent: beforeOwner,
      afterOwnerContent: afterOwner,
      documentPath,
      beforeDocumentRevision: beforeDocumentRevision.sha256,
      afterDocumentRevision: afterDocumentRevision.sha256,
      beforeDocumentContent: beforeDocument,
      afterDocumentContent: afterDocument,
      committedAt: new Date().toISOString(),
      ...(actor ? { actor } : {}),
    };
  }

  #moveReceipt(
    resolved: ResolvedSource,
    row: ResolvedRow,
    beforeOwner: string,
    afterOwner: string,
    previousDocumentPath: string,
    documentPath: string,
    beforeDocument: string,
    afterDocument: string,
    mutationId = `mut_${this.#generateUuid().replaceAll('-', '')}`,
    actor?: DatabaseRecordActor,
  ): DatabaseMarkdownTableMutationReceipt {
    const beforeOwnerRevision = revision(beforeOwner);
    const afterOwnerRevision = revision(afterOwner);
    const beforeDocumentRevision = revision(beforeDocument);
    const afterDocumentRevision = revision(afterDocument);
    return {
      version: 1,
      mutationId,
      operation: 'move_document',
      databaseId: resolved.database.id,
      sourceId: resolved.source.id,
      ownerPath: sourceStorage(resolved.source).owner.path,
      recordId: row.recordId,
      propertyId: sourceStorage(resolved.source).titlePropertyId,
      rowIndex: row.rowIndex,
      files: [
        {
          path: previousDocumentPath,
          operation: 'delete',
          before: beforeDocumentRevision,
          after: null,
        },
        { path: documentPath, operation: 'create', before: null, after: afterDocumentRevision },
        {
          path: sourceStorage(resolved.source).owner.path,
          operation: 'update',
          before: beforeOwnerRevision,
          after: afterOwnerRevision,
        },
      ],
      beforeOwnerRevision: beforeOwnerRevision.sha256,
      afterOwnerRevision: afterOwnerRevision.sha256,
      beforeOwnerContent: beforeOwner,
      afterOwnerContent: afterOwner,
      documentPath,
      previousDocumentPath,
      beforeDocumentRevision: beforeDocumentRevision.sha256,
      afterDocumentRevision: afterDocumentRevision.sha256,
      beforeDocumentContent: beforeDocument,
      afterDocumentContent: afterDocument,
      committedAt: new Date().toISOString(),
      ...(actor ? { actor } : {}),
    };
  }

  #lifecycleReceipt(
    resolved: ResolvedSource,
    row: ResolvedRow,
    manifestPath: string,
    beforeManifest: string,
    afterManifest: string,
    beforeOwnerRevision: string,
    afterOwnerRevision: string,
    mutationId = `mut_${this.#generateUuid().replaceAll('-', '')}`,
    beforeManifestRevision = sha256(beforeManifest),
    afterManifestRevision = sha256(afterManifest),
    actor?: DatabaseRecordActor,
  ): DatabaseMarkdownTableMutationReceipt {
    return {
      version: 1,
      mutationId,
      operation: 'update_lifecycle',
      databaseId: resolved.database.id,
      sourceId: resolved.source.id,
      ownerPath: sourceStorage(resolved.source).owner.path,
      recordId: row.recordId,
      rowIndex: row.rowIndex,
      files: [
        {
          path: manifestPath,
          operation: 'update',
          before: {
            sha256: beforeManifestRevision,
            bytes: Buffer.byteLength(beforeManifest, 'utf8'),
          },
          after: { sha256: afterManifestRevision, bytes: Buffer.byteLength(afterManifest, 'utf8') },
        },
      ],
      beforeOwnerRevision,
      afterOwnerRevision,
      beforeOwnerContent: resolved.markdown,
      manifestPath,
      beforeManifestRevision,
      afterManifestRevision,
      beforeManifestContent: beforeManifest,
      afterManifestContent: afterManifest,
      committedAt: new Date().toISOString(),
      ...(actor ? { actor } : {}),
    };
  }

  async #beforeOwnerBytes(receipt: DatabaseMarkdownTableMutationReceipt): Promise<string> {
    if (typeof receipt.beforeOwnerContent === 'string') return receipt.beforeOwnerContent;
    throw new DatabaseMarkdownTableWriterError(
      'invalid_request',
      'This receipt does not carry recoverable before bytes; use the durable transaction journal',
    );
  }

  #ownerBefore(receipt: DatabaseMarkdownTableMutationReceipt, fallback: string): string {
    if (typeof receipt.beforeOwnerContent === 'string') return receipt.beforeOwnerContent;
    if (receipt.beforeOwnerRevision === sha256(fallback)) return fallback;
    throw new DatabaseMarkdownTableWriterError(
      'invalid_request',
      'This receipt does not carry recoverable before bytes; use the durable transaction journal',
    );
  }

  #assertExpectedRevision(
    resolved: ResolvedSource,
    expected: string | undefined,
    expectedRowRevision?: string,
    expectedCellRevision?: string,
  ): void {
    if (
      expected === undefined &&
      expectedRowRevision === undefined &&
      expectedCellRevision === undefined
    ) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'A v2 mutation requires an expected owner revision',
      );
    }
    if (expected === undefined) return;
    const observed = sha256(resolved.markdown);
    if (observed !== expected) {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Owner document changed after the v2 mutation was planned',
        {
          ownerPath: sourceStorage(resolved.source).owner.path,
          expectedRevision: expected,
          observedRevision: observed,
        },
      );
    }
  }

  async #assertOwnerStillCurrent(resolved: ResolvedSource): Promise<void> {
    const current = await this.#fs.readFile(resolved.ownerAbsolutePath).catch((error) => {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Owner document disappeared before the v2 write',
        {
          ownerPath: sourceStorage(resolved.source).owner.path,
        },
        error,
      );
    });
    const expected = sha256(resolved.markdown);
    const observed = sha256(current);
    if (expected !== observed) {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Owner document changed during the v2 write',
        {
          ownerPath: sourceStorage(resolved.source).owner.path,
          expectedRevision: expected,
          observedRevision: observed,
        },
      );
    }
  }

  async #verifyCommittedFiles(
    files: readonly { path: string; afterSha256: string | null }[],
  ): Promise<void> {
    for (const file of files) {
      const absolute = this.#safeJournalAbsolutePath(file.path);
      const current = await this.#fs.readFile(absolute).catch(() => null);
      const observed = current === null ? null : sha256(current);
      if (observed !== file.afterSha256) {
        throw new DatabaseMarkdownTableWriterError(
          'transaction_failed',
          'V2 commit verification failed after the index refresh',
          { path: file.path, expectedRevision: file.afterSha256, observedRevision: observed },
        );
      }
    }
  }

  #assertRowAndCellRevisions(
    resolved: ResolvedSource,
    rowIndex: number,
    cell: DatabaseMarkdownTableCell,
    expectedRowRevision: string | undefined,
    expectedCellRevision: string | undefined,
  ): void {
    const row = resolved.owner.rows[rowIndex];
    if (!row)
      throw new DatabaseMarkdownTableWriterError(
        'owner_invalid',
        `Owner row ${rowIndex} is missing`,
      );
    const observedRow = databaseMarkdownTableRowRevision(row);
    if (expectedRowRevision !== undefined && expectedRowRevision !== observedRow) {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Owner table row changed after the v2 mutation was planned',
        {
          rowIndex,
          expectedRevision: expectedRowRevision,
          observedRevision: observedRow,
        },
      );
    }
    const observedCell = databaseMarkdownTableCellRevision(cell);
    if (expectedCellRevision !== undefined && expectedCellRevision !== observedCell) {
      throw new DatabaseMarkdownTableWriterError(
        'target_changed',
        'Owner table cell changed after the v2 mutation was planned',
        {
          rowIndex,
          columnIndex: cell.columnIndex,
          expectedRevision: expectedCellRevision,
          observedRevision: observedCell,
        },
      );
    }
  }

  #safeAbsolutePath(path: string): string {
    const absolute = resolve(this.#contentDir, path);
    if (!isWithin(this.#contentDir, absolute)) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'V2 writer target escapes the content directory',
        { path },
      );
    }
    return absolute;
  }

  #safeProjectAbsolutePath(path: string): string {
    const absolute = resolve(this.#projectDir, path);
    if (!isWithin(this.#projectDir, absolute)) {
      throw new DatabaseMarkdownTableWriterError(
        'invalid_request',
        'V2 writer target escapes the project directory',
        { path },
      );
    }
    return absolute;
  }

  #safeJournalAbsolutePath(path: string): string {
    return path.startsWith('.ok/') || path === '.ok'
      ? this.#safeProjectAbsolutePath(path)
      : this.#safeAbsolutePath(path);
  }

  async #assertNoProjectSymlinkComponents(path: string): Promise<void> {
    const absolute = this.#safeProjectAbsolutePath(path);
    const relativePath = relative(this.#projectDir, absolute);
    let cursor = this.#projectDir;
    for (const segment of relativePath.split(sep)) {
      cursor = resolve(cursor, segment);
      try {
        const stats = await this.#fs.lstat(cursor);
        if (stats.isSymbolicLink()) {
          throw new DatabaseMarkdownTableWriterError(
            'invalid_request',
            'V2 writer refuses symbolic-link path components',
            { path },
          );
        }
      } catch (error) {
        if (error instanceof DatabaseMarkdownTableWriterError) throw error;
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
    }
  }

  async #assertNoSymlinkComponents(path: string): Promise<void> {
    const absolute = this.#safeAbsolutePath(path);
    const relativePath = relative(this.#contentDir, absolute);
    let cursor = this.#contentDir;
    for (const segment of relativePath.split(sep)) {
      cursor = resolve(cursor, segment);
      try {
        const stats = await this.#fs.lstat(cursor);
        if (stats.isSymbolicLink()) {
          throw new DatabaseMarkdownTableWriterError(
            'invalid_request',
            'V2 writer refuses symbolic-link path components',
            { path },
          );
        }
      } catch (error) {
        if (error instanceof DatabaseMarkdownTableWriterError) throw error;
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
    }
  }
}

function normalizeDocumentPath(target: string): string | null {
  if (!safeRelativePath(target, null)) return null;
  const path = /\.(?:md|mdx)$/i.test(target) ? target : `${target}.md`;
  return safeRelativePath(path, null) && /\.(?:md|mdx)$/i.test(path) ? path : null;
}

function isWithin(base: string, candidate: string): boolean {
  const rel = relative(base, candidate);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

export function createDatabaseMarkdownTableWriter(
  options: CreateDatabaseMarkdownTableWriterOptions,
): DatabaseMarkdownTableWriter {
  return new DatabaseMarkdownTableWriter(options);
}
