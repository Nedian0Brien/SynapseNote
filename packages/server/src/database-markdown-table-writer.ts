/**
 * The v2 Markdown owner-table writer.
 *
 * This boundary is intentionally separate from the record-per-file commit
 * engine. It is the only server module allowed to splice v2 owner tables;
 * callers must supply an optimistic revision and the writer never emits a
 * database-owned record frontmatter file.
 */

import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, unlink } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  type DatabaseDefinition,
  type DatabaseDocumentId,
  type DatabaseMarkdownCellPropertyType,
  type DatabaseMarkdownDocumentLink,
  type DatabaseMarkdownOwnerMarker,
  type DatabaseMarkdownTableCell,
  type DatabaseProperty,
  type DatabaseSource,
  createDatabaseDocumentId,
  createDatabaseMarkdownRecordId,
  DATABASE_MARKDOWN_LIMITS,
  decodeDatabaseMarkdownCell,
  deleteDatabaseMarkdownTableRow,
  encodeDatabaseMarkdownCell,
  ensureDatabaseDocumentIdentity,
  insertDatabaseMarkdownTableRow,
  parseDatabaseDocumentIdentity,
  parseDatabaseMarkdownOwner,
  replaceDatabaseMarkdownTableCell,
  replaceDatabaseMarkdownTableRow,
  type ParsedDatabaseMarkdownOwner,
} from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';
import { tracedAtomicFs } from './fs-traced.ts';
import {
  createDatabaseMarkdownTableJournal,
  type DatabaseMarkdownTableJournal,
} from './database-markdown-table-journal.ts';

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
  | 'duplicate_record'
  | 'transaction_failed'
  | 'rollback_failed'
  | 'resource_limit'
  | 'recovery_required';

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
}

const DEFAULT_FS: DatabaseMarkdownTableWriterFs = {
  lstat,
  readFile: (path) => readFile(path, 'utf8'),
  mkdir: async (path) => {
    await mkdir(path, { recursive: true });
  },
  unlink,
};

export interface CreateDatabaseMarkdownTableWriterOptions {
  projectDir: string;
  contentDir: string;
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
  operation: 'update_cell' | 'update_cells' | 'replace_row' | 'delete_row' | 'create_row';
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
  committedAt: string;
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
}

export interface DatabaseMarkdownTableRowMutationInput {
  databaseId: string;
  sourceId: string;
  recordId: string;
  values: Readonly<Record<string, unknown>>;
  expectedOwnerRevision?: string;
  expectedRowRevision?: string;
}

export interface DatabaseMarkdownTableRowCreateInput {
  databaseId: string;
  sourceId: string;
  documentPath: string;
  documentMarkdown: string;
  documentId?: DatabaseDocumentId;
  values?: Readonly<Record<string, unknown>>;
  expectedOwnerRevision: string;
}

export interface DatabaseMarkdownTableUndoInput {
  receipt: DatabaseMarkdownTableMutationReceipt;
  expectedAfterOwnerRevision?: string;
}

export interface DatabaseMarkdownTableMutationResult {
  receipt: DatabaseMarkdownTableMutationReceipt;
  changed: boolean;
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
        ? property.options.find((option) => option.id === entry)?.key ?? entry
        : entry,
    );
  }
  return value;
}

function encodedCell(
  property: DatabaseProperty,
  value: unknown,
): string {
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
  const encoded = encodeDatabaseMarkdownCell(propertyType(property), normalizeStorageValue(property, value));
  if (!encoded.ok) {
    throw new DatabaseMarkdownTableWriterError(
      'invalid_cell_value',
      `Property "${property.key}" cannot be encoded as a Markdown table cell: ${encoded.message}`,
      { propertyId: property.id, codecCode: encoded.code },
    );
  }
  return encoded.text;
}

function decodedTitleLink(owner: ParsedDatabaseMarkdownOwner, source: DatabaseSource, rowIndex: number): DatabaseMarkdownDocumentLink {
  const storage = sourceStorage(source);
  const titleColumn = storage.storedPropertyIds.indexOf(storage.titlePropertyId);
  const cell = owner.rows[rowIndex]?.cells[titleColumn];
  if (!cell) {
    throw new DatabaseMarkdownTableWriterError('owner_invalid', 'The v2 owner row has no Title cell', {
      rowIndex,
    });
  }
  const decoded = decodeDatabaseMarkdownCell('title', cell.raw);
  if (!decoded.ok || decoded.value === null || Array.isArray(decoded.value) || typeof decoded.value !== 'object') {
    throw new DatabaseMarkdownTableWriterError('owner_invalid', 'The v2 owner row Title cell is not a document wikilink', {
      rowIndex,
    });
  }
  return decoded.value as DatabaseMarkdownDocumentLink;
}

export class DatabaseMarkdownTableWriter {
  readonly #projectDir: string;
  readonly #contentDir: string;
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
    this.#databaseStore = options.databaseStore;
    this.#refreshDatabaseIndex =
      options.refreshDatabaseIndex ??
      (options.databaseRecordIndex ? () => options.databaseRecordIndex!.rebuild() : async () => undefined);
    this.#fs = { ...DEFAULT_FS, ...options.fs };
    this.#generateUuid = options.generateUuid ?? randomUUID;
    this.#journal = options.journal ?? createDatabaseMarkdownTableJournal(this.#projectDir);
    this.#atomicWrite =
      options.atomicWrite ??
      ((path, content) => atomicWriteFile(path, content, { fs: tracedAtomicFs }));
    this.#lockPath = resolve(this.#projectDir, '.ok', 'databases', '.commit.lock');
    if (!isWithin(this.#projectDir, this.#contentDir)) {
      throw new Error('Database Markdown table contentDir must be inside projectDir');
    }
  }

  async updateCell(input: DatabaseMarkdownTableCellMutationInput): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#updateCellLocked(input));
  }

  async updateCells(
    input: DatabaseMarkdownTableBulkCellMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#updateCellsLocked(input));
  }

  async replaceRow(input: DatabaseMarkdownTableRowMutationInput): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#replaceRowLocked(input));
  }

  async deleteRow(input: Omit<DatabaseMarkdownTableRowMutationInput, 'values'>): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#deleteRowLocked(input));
  }

  async createRow(input: DatabaseMarkdownTableRowCreateInput): Promise<DatabaseMarkdownTableMutationResult> {
    return this.#withLock(() => this.#createRowLocked(input));
  }

  async undo(input: DatabaseMarkdownTableUndoInput): Promise<{ changed: boolean; receipt: DatabaseMarkdownTableMutationReceipt }> {
    return this.#withLock(() => this.#undoLocked(input));
  }

  /** Reconcile transactions left on disk after a process kill without guessing. */
  async recover(): Promise<readonly { mutationId: string; state: 'committed' | 'rolled_back' | 'recovery_required' }[]> {
    const entries = await this.#journal.listInflight();
    const recovered: Array<{ mutationId: string; state: 'committed' | 'rolled_back' | 'recovery_required' }> = [];
    for (const entry of entries) {
      let allBefore = true;
      let allAfter = true;
      for (const file of entry.files) {
        const current = await this.#fs.readFile(this.#safeAbsolutePath(file.path)).catch(() => null);
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
      throw new DatabaseMarkdownTableWriterError('source_not_found', `Source "${sourceId}" was not found`, {
        databaseId,
        sourceId,
      });
    }
    const storage = sourceStorage(source);
    const ownerPath = storage.owner.path;
    if (!safeRelativePath(ownerPath, '.md')) {
      throw new DatabaseMarkdownTableWriterError('owner_invalid', 'The configured v2 owner path is unsafe', {
        ownerPath,
      });
    }
    const ownerAbsolutePath = this.#safeAbsolutePath(ownerPath);
    await this.#assertNoSymlinkComponents(ownerPath);
    let markdown: string;
    try {
      markdown = await this.#fs.readFile(ownerAbsolutePath);
    } catch (error) {
      throw new DatabaseMarkdownTableWriterError('owner_not_found', `Owner document "${ownerPath}" could not be read`, {
        ownerPath,
      }, error);
    }
    const parsed = parseDatabaseMarkdownOwner(markdown);
    if (!parsed.ok) {
      throw new DatabaseMarkdownTableWriterError('owner_invalid', `Owner document "${ownerPath}" is invalid: ${parsed.message}`, {
        ownerPath,
        parserCode: parsed.code,
      });
    }
    if (
      parsed.owner.marker.databaseId !== database.id ||
      parsed.owner.marker.sourceId !== source.id ||
      parsed.owner.marker.blockId !== storage.owner.blockId ||
      JSON.stringify(parsed.owner.marker.columns) !== JSON.stringify(storage.storedPropertyIds)
    ) {
      throw new DatabaseMarkdownTableWriterError('owner_invalid', 'Owner marker does not match the manifest storage binding', {
        ownerPath,
        expected: {
          databaseId: database.id,
          sourceId: source.id,
          blockId: storage.owner.blockId,
          columns: storage.storedPropertyIds,
        },
        observed: parsed.owner.marker,
      });
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
    for (const row of resolved.owner.rows) {
      const link = decodedTitleLink(resolved.owner, resolved.source, row.rowIndex);
      const documentPath = normalizeDocumentPath(link.target);
      if (!documentPath) {
        throw new DatabaseMarkdownTableWriterError('owner_invalid', `Owner row ${row.rowIndex} has an unsafe document target`, {
          rowIndex: row.rowIndex,
        });
      }
      const absolute = this.#safeAbsolutePath(documentPath);
      let markdown: string;
      try {
        markdown = await this.#fs.readFile(absolute);
      } catch (error) {
        throw new DatabaseMarkdownTableWriterError('document_not_found', `Linked document "${documentPath}" could not be read`, {
          rowIndex: row.rowIndex,
          documentPath,
        }, error);
      }
      const identity = parseDatabaseDocumentIdentity(markdown);
      if (!identity.ok) {
        throw new DatabaseMarkdownTableWriterError('document_identity_invalid', `Linked document "${documentPath}" has no valid generic document identity`, {
          rowIndex: row.rowIndex,
          documentPath,
          identityCode: identity.code,
        });
      }
      const derivedRecordId = createDatabaseMarkdownRecordId(resolved.source.id, identity.documentId);
      const previous = seen.get(derivedRecordId);
      if (previous !== undefined) {
        throw new DatabaseMarkdownTableWriterError('duplicate_record', `Rows ${previous} and ${row.rowIndex} resolve to the same record identity`, {
          recordId: derivedRecordId,
          firstRowIndex: previous,
          secondRowIndex: row.rowIndex,
        });
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
    throw new DatabaseMarkdownTableWriterError('record_not_found', `Record "${recordId}" is not present in the v2 owner table`, {
      recordId,
    });
  }

  async #updateCellLocked(input: DatabaseMarkdownTableCellMutationInput): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision, input.expectedRowRevision, input.expectedCellRevision);
    const row = await this.#resolveRow(resolved, input.recordId);
    const storage = sourceStorage(resolved.source);
    const columnIndex = storage.storedPropertyIds.indexOf(input.propertyId);
    const property = resolved.source.properties.find((candidate) => candidate.id === input.propertyId);
    if (!property) {
      throw new DatabaseMarkdownTableWriterError('property_not_stored', `Property "${input.propertyId}" is not defined by the source`, {
        propertyId: input.propertyId,
      });
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
        property.type === 'formula' || property.type === 'rollup' ? 'derived_property_read_only' : 'property_not_stored',
        `Property "${input.propertyId}" is not stored in the v2 owner table`,
        { propertyId: input.propertyId },
      );
    }
    const cell = resolved.owner.rows[row.rowIndex]?.cells[columnIndex];
    if (!cell) throw new DatabaseMarkdownTableWriterError('owner_invalid', 'Owner row cell is missing', { rowIndex: row.rowIndex, columnIndex });
    this.#assertRowAndCellRevisions(resolved, row.rowIndex, cell, input.expectedRowRevision, input.expectedCellRevision);
    const nextValue = encodedCell(property, input.value);
    if (cell.raw.trim() === nextValue) {
      return { changed: false, receipt: this.#receipt('update_cell', resolved, row, resolved.markdown, resolved.markdown, input.propertyId) };
    }
    const after = replaceDatabaseMarkdownTableCell(resolved.markdown, resolved.owner, row.rowIndex, columnIndex, nextValue);
    return this.#commitOwnerOnly('update_cell', resolved, row, after, input.propertyId);
  }

  async #updateCellsLocked(
    input: DatabaseMarkdownTableBulkCellMutationInput,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    if (!Array.isArray(input.cells) || input.cells.length === 0 || input.cells.length > 10_000) {
      throw new DatabaseMarkdownTableWriterError('invalid_request', 'A v2 bulk mutation must contain 1-10000 cells');
    }
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision);
    const storage = sourceStorage(resolved.source);
    const seen = new Set<string>();
    const replacements: Array<{ row: ResolvedRow; columnIndex: number; encoded: string; start: number; end: number }> = [];
    for (const cellInput of input.cells) {
      const key = `${cellInput.recordId}\0${cellInput.propertyId}`;
      if (seen.has(key)) throw new DatabaseMarkdownTableWriterError('invalid_request', 'A bulk mutation repeats the same row/property cell', { key });
      seen.add(key);
      const row = await this.#resolveRow(resolved, cellInput.recordId);
      const columnIndex = storage.storedPropertyIds.indexOf(cellInput.propertyId);
      const property = resolved.source.properties.find((candidate) => candidate.id === cellInput.propertyId);
      if (!property) throw new DatabaseMarkdownTableWriterError('property_not_stored', `Property "${cellInput.propertyId}" is not defined by the source`, { propertyId: cellInput.propertyId });
      if (property.type === 'unique_id') throw new DatabaseMarkdownTableWriterError('allocated_property_read_only', `Unique ID property "${property.id}" is allocated by the database`, { propertyId: property.id });
      if (columnIndex < 0) throw new DatabaseMarkdownTableWriterError(property.type === 'formula' || property.type === 'rollup' ? 'derived_property_read_only' : 'property_not_stored', `Property "${cellInput.propertyId}" is not stored in the v2 owner table`, { propertyId: cellInput.propertyId });
      const cell = resolved.owner.rows[row.rowIndex]?.cells[columnIndex];
      if (!cell) throw new DatabaseMarkdownTableWriterError('owner_invalid', 'Owner row cell is missing', { rowIndex: row.rowIndex, columnIndex });
      this.#assertRowAndCellRevisions(resolved, row.rowIndex, cell, cellInput.expectedRowRevision, cellInput.expectedCellRevision);
      replacements.push({ row, columnIndex, encoded: encodedCell(property, cellInput.value), start: cell.valueRange.start, end: cell.valueRange.end });
    }
    let after = resolved.markdown;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
      after = after.slice(0, replacement.start) + replacement.encoded + after.slice(replacement.end);
    }
    const row = replacements[0]?.row;
    if (!row) throw new DatabaseMarkdownTableWriterError('invalid_request', 'Bulk mutation has no cells');
    if (after === resolved.markdown) return { changed: false, receipt: this.#receipt('update_cells', resolved, row, after, after) };
    return this.#commitOwnerOnly('update_cells', resolved, row, after);
  }

  async #replaceRowLocked(input: DatabaseMarkdownTableRowMutationInput): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision, input.expectedRowRevision);
    const row = await this.#resolveRow(resolved, input.recordId);
    const storage = sourceStorage(resolved.source);
    const encodedValues = storage.storedPropertyIds.map((propertyId) => {
      const property = resolved.source.properties.find((candidate) => candidate.id === propertyId);
      if (!property) throw new DatabaseMarkdownTableWriterError('owner_invalid', `Stored property "${propertyId}" is missing from the source`);
      if (input.values[propertyId] === undefined && property.type === 'title') {
        throw new DatabaseMarkdownTableWriterError('invalid_cell_value', 'A row replacement must retain its Title document wikilink', { propertyId });
      }
      return encodedCell(property, input.values[propertyId]);
    });
    this.#assertRowAndCellRevisions(resolved, row.rowIndex, resolved.owner.rows[row.rowIndex]!.cells[0]!, input.expectedRowRevision, undefined);
    const after = replaceDatabaseMarkdownTableRow(resolved.markdown, resolved.owner, row.rowIndex, encodedValues);
    if (after === resolved.markdown) {
      return { changed: false, receipt: this.#receipt('replace_row', resolved, row, resolved.markdown, resolved.markdown) };
    }
    return this.#commitOwnerOnly('replace_row', resolved, row, after);
  }

  async #deleteRowLocked(input: Omit<DatabaseMarkdownTableRowMutationInput, 'values'>): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision, input.expectedRowRevision);
    const row = await this.#resolveRow(resolved, input.recordId);
    this.#assertRowAndCellRevisions(resolved, row.rowIndex, resolved.owner.rows[row.rowIndex]!.cells[0]!, input.expectedRowRevision, undefined);
    const after = deleteDatabaseMarkdownTableRow(resolved.markdown, resolved.owner, row.rowIndex);
    return this.#commitOwnerOnly('delete_row', resolved, row, after);
  }

  async #createRowLocked(input: DatabaseMarkdownTableRowCreateInput): Promise<DatabaseMarkdownTableMutationResult> {
    const resolved = await this.#loadSource(input.databaseId, input.sourceId);
    this.#assertExpectedRevision(resolved, input.expectedOwnerRevision);
    if (Buffer.byteLength(input.documentMarkdown, 'utf8') > DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes) {
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
      throw new DatabaseMarkdownTableWriterError('invalid_request', 'A new v2 row document path must be a normalized relative Markdown path', {
        documentPath: input.documentPath,
      });
    }
    await this.#assertNoSymlinkComponents(input.documentPath);
    const documentAbsolutePath = this.#safeAbsolutePath(input.documentPath);
    try {
      const stats = await this.#fs.lstat(documentAbsolutePath);
      if (stats.isSymbolicLink() || stats.isFile() || stats.isDirectory()) {
        throw new DatabaseMarkdownTableWriterError('document_path_conflict', `Document path "${input.documentPath}" is already occupied`, {
          documentPath: input.documentPath,
        });
      }
    } catch (error) {
      if (error instanceof DatabaseMarkdownTableWriterError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const existing = parseDatabaseDocumentIdentity(input.documentMarkdown);
    const documentId =
      input.documentId ?? (existing.ok ? existing.documentId : createDatabaseDocumentId(this.#generateUuid));
    const ensured = ensureDatabaseDocumentIdentity({ markdown: input.documentMarkdown, documentId });
    if (!ensured.ok) {
      throw new DatabaseMarkdownTableWriterError('document_identity_invalid', ensured.message, { documentPath: input.documentPath });
    }
    if (existing.ok && existing.documentId !== documentId) {
      throw new DatabaseMarkdownTableWriterError('document_identity_invalid', 'The supplied document identity does not match documentId', {
        expectedDocumentId: documentId,
        observedDocumentId: existing.documentId,
      });
    }
    const recordId = createDatabaseMarkdownRecordId(resolved.source.id, documentId);
    try {
      await this.#resolveRow(resolved, recordId);
      throw new DatabaseMarkdownTableWriterError('duplicate_record', `Document identity already belongs to record "${recordId}"`, { recordId });
    } catch (error) {
      if (!(error instanceof DatabaseMarkdownTableWriterError) || error.code !== 'record_not_found') throw error;
    }
    const storage = sourceStorage(resolved.source);
    const link: DatabaseMarkdownDocumentLink = { kind: 'wikilink', target: documentLinkTarget(input.documentPath) };
    const values = input.values ?? {};
    const encodedValues = storage.storedPropertyIds.map((propertyId) => {
      const property = resolved.source.properties.find((candidate) => candidate.id === propertyId);
      if (!property) throw new DatabaseMarkdownTableWriterError('owner_invalid', `Stored property "${propertyId}" is missing from the source`);
      if (property.type === 'unique_id' && values[propertyId] === undefined) {
        throw new DatabaseMarkdownTableWriterError(
          'allocated_property_read_only',
          `Unique ID property "${property.id}" requires a preallocated value from the reviewed plan`,
          { propertyId: property.id },
        );
      }
      return property.type === 'title' ? encodedCell(property, link) : encodedCell(property, values[propertyId]);
    });
    const afterOwner = insertDatabaseMarkdownTableRow(resolved.markdown, resolved.owner, resolved.owner.rows.length, encodedValues);
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
      });
      await this.#journal.checkpoint(mutationId, 'writing');
      await this.#assertNoSymlinkComponents(input.documentPath);
      await this.#assertNoSymlinkComponents(sourceStorage(resolved.source).owner.path);
      await this.#fs.mkdir(resolve(documentAbsolutePath, '..'));
      await this.#atomicWrite(documentAbsolutePath, ensured.markdown);
      await this.#assertOwnerStillCurrent(resolved);
      await this.#atomicWrite(resolved.ownerAbsolutePath, afterOwner);
      await this.#journal.checkpoint(mutationId, 'committed');
      await this.#refreshDatabaseIndex();
    } catch (error) {
      try {
        const ownerCurrent = await this.#fs.readFile(resolved.ownerAbsolutePath).catch(() => null);
        if (ownerCurrent !== null && sha256(ownerCurrent) === sha256(afterOwner)) {
          await this.#atomicWrite(resolved.ownerAbsolutePath, resolved.markdown);
        }
        const documentCurrent = await this.#fs.readFile(documentAbsolutePath).catch(() => null);
        if (documentCurrent !== null && sha256(documentCurrent) === documentRevision.sha256) await this.#fs.unlink(documentAbsolutePath);
        await this.#journal.checkpoint(mutationId, 'rolled_back');
      } catch (rollbackError) {
        await this.#journal.checkpoint(mutationId, 'recovery_required').catch(() => undefined);
        throw new DatabaseMarkdownTableWriterError('rollback_failed', 'V2 row creation failed and compensation was incomplete', {
          ownerPath: sourceStorage(resolved.source).owner.path,
          documentPath: input.documentPath,
        }, rollbackError);
      }
      if (error instanceof DatabaseMarkdownTableWriterError && error.code === 'target_changed') {
        throw error;
      }
      throw new DatabaseMarkdownTableWriterError('transaction_failed', 'V2 row creation failed and was rolled back', {
        ownerPath: sourceStorage(resolved.source).owner.path,
        documentPath: input.documentPath,
      }, error);
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
        { path: sourceStorage(resolved.source).owner.path, operation: 'update', before: ownerRevision, after: revision(afterOwner) },
      ],
      beforeOwnerRevision: ownerRevision.sha256,
      afterOwnerRevision: sha256(afterOwner),
      beforeOwnerContent: resolved.markdown,
      createdDocumentContent: ensured.markdown,
      afterOwnerContent: afterOwner,
      committedAt: new Date().toISOString(),
    };
    return { changed: true, receipt };
  }

  async #commitOwnerOnly(
    operation: 'update_cell' | 'update_cells' | 'replace_row' | 'delete_row',
    resolved: ResolvedSource,
    row: ResolvedRow,
    after: string,
    propertyId?: string,
  ): Promise<DatabaseMarkdownTableMutationResult> {
    const before = resolved.markdown;
    const ownerRevision = revision(before);
    const afterRevision = revision(after);
    if (after !== before && Buffer.byteLength(after, 'utf8') > DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes) {
      throw new DatabaseMarkdownTableWriterError(
        'resource_limit',
        'The v2 owner document exceeds the byte limit after mutation',
        { limit: DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes },
      );
    }
    const receipt = this.#receipt(operation, resolved, row, before, after, propertyId);
    if (before === after) return { changed: false, receipt };
    try {
      await this.#assertOwnerStillCurrent(resolved);
      await this.#assertNoSymlinkComponents(sourceStorage(resolved.source).owner.path);
      await this.#journal.prepare({
        mutationId: receipt.mutationId,
        files: [{
          path: sourceStorage(resolved.source).owner.path,
          beforeSha256: ownerRevision.sha256,
          afterSha256: afterRevision.sha256,
          before,
          after,
        }],
      });
      await this.#journal.checkpoint(receipt.mutationId, 'writing');
      await this.#assertNoSymlinkComponents(sourceStorage(resolved.source).owner.path);
      await this.#atomicWrite(resolved.ownerAbsolutePath, after);
      await this.#journal.checkpoint(receipt.mutationId, 'committed');
      await this.#refreshDatabaseIndex();
    } catch (error) {
      try {
        const current = await this.#fs.readFile(resolved.ownerAbsolutePath);
        if (sha256(current) === afterRevision.sha256) {
          await this.#atomicWrite(resolved.ownerAbsolutePath, before);
        }
        await this.#journal.checkpoint(receipt.mutationId, 'rolled_back');
      } catch (rollbackError) {
        await this.#journal.checkpoint(receipt.mutationId, 'recovery_required').catch(() => undefined);
        throw new DatabaseMarkdownTableWriterError('rollback_failed', 'V2 owner-table write failed and compensation was incomplete', {
          ownerPath: resolved.ownerAbsolutePath,
          beforeRevision: ownerRevision.sha256,
          afterRevision: afterRevision.sha256,
        }, rollbackError);
      }
      if (error instanceof DatabaseMarkdownTableWriterError && error.code === 'target_changed') {
        throw error;
      }
      throw new DatabaseMarkdownTableWriterError('transaction_failed', 'V2 owner-table write failed and was rolled back', {
        ownerPath: resolved.ownerAbsolutePath,
      }, error);
    }
    return { changed: true, receipt };
  }

  async #undoLocked(input: DatabaseMarkdownTableUndoInput): Promise<{ changed: boolean; receipt: DatabaseMarkdownTableMutationReceipt }> {
    const receipt = input.receipt;
    if (receipt.version !== 1 || !receipt.ownerPath || !receipt.afterOwnerRevision) {
      throw new DatabaseMarkdownTableWriterError('invalid_request', 'The v2 mutation receipt is malformed');
    }
    const resolved = await this.#loadSource(receipt.databaseId, receipt.sourceId);
    const configuredOwnerPath = sourceStorage(resolved.source).owner.path;
    if (configuredOwnerPath !== receipt.ownerPath) {
      throw new DatabaseMarkdownTableWriterError('target_changed', 'Undo receipt no longer points at the source owner document', {
        expectedOwnerPath: receipt.ownerPath,
        observedOwnerPath: configuredOwnerPath,
      });
    }
    const current = await this.#fs.readFile(resolved.ownerAbsolutePath);
    const expectedAfter = input.expectedAfterOwnerRevision ?? receipt.afterOwnerRevision;
    if (sha256(current) !== expectedAfter && sha256(current) !== receipt.beforeOwnerRevision) {
      throw new DatabaseMarkdownTableWriterError('target_changed', 'Undo refused because the owner document changed after the mutation', {
        ownerPath: receipt.ownerPath,
        expectedAfterRevision: expectedAfter,
        observedRevision: sha256(current),
      });
    }
    if (sha256(current) === receipt.beforeOwnerRevision) return { changed: false, receipt };
    const undoMutationId = `mut_${randomUUID().replaceAll('-', '')}`;
    const beforeOwner = receipt.operation === 'create_row'
      ? this.#ownerBefore(receipt, resolved.markdown)
      : await this.#beforeOwnerBytes(receipt);
    const ownerFilePath = receipt.ownerPath;
    const undoFiles: Array<{
      path: string;
      beforeSha256: string | null;
      afterSha256: string | null;
      before: string | null;
      after: string | null;
    }> = [{
      path: ownerFilePath,
      beforeSha256: sha256(current),
      afterSha256: sha256(beforeOwner),
      before: current,
      after: beforeOwner,
    }];
    let documentAbsolute: string | null = null;
    let documentBefore: string | null = null;
    if (receipt.operation === 'create_row') {
      const documentFile = receipt.files.find((file) => file.path !== receipt.ownerPath && file.operation === 'create');
      if (!documentFile) throw new DatabaseMarkdownTableWriterError('invalid_request', 'Create-row receipt has no document file delta');
      documentAbsolute = this.#safeAbsolutePath(documentFile.path);
      documentBefore = await this.#fs.readFile(documentAbsolute).catch(() => null);
      if (documentBefore !== null && documentFile.after && sha256(documentBefore) !== documentFile.after.sha256) {
        throw new DatabaseMarkdownTableWriterError('target_changed', 'Undo refused because the created document changed after the mutation', {
          documentPath: documentFile.path,
        });
      }
      undoFiles.push({
        path: documentFile.path,
        beforeSha256: documentBefore === null ? null : sha256(documentBefore),
        afterSha256: null,
        before: documentBefore,
        after: null,
      });
    }
    await this.#assertOwnerStillCurrent({ ...resolved, markdown: current });
    await this.#assertNoSymlinkComponents(receipt.ownerPath);
    if (documentAbsolute) await this.#assertNoSymlinkComponents(undoFiles[1]!.path);
    await this.#journal.prepare({ mutationId: undoMutationId, files: undoFiles });
    await this.#journal.checkpoint(undoMutationId, 'writing');
    let ownerWritten = false;
    try {
      await this.#atomicWrite(resolved.ownerAbsolutePath, beforeOwner);
      ownerWritten = true;
      if (documentAbsolute && documentBefore !== null) await this.#fs.unlink(documentAbsolute);
      await this.#journal.checkpoint(undoMutationId, 'committed');
    } catch (error) {
      try {
        if (ownerWritten) await this.#atomicWrite(resolved.ownerAbsolutePath, current);
        if (documentAbsolute && documentBefore !== null) {
          const documentCurrent = await this.#fs.readFile(documentAbsolute).catch(() => null);
          if (documentCurrent === null) {
            await this.#fs.mkdir(resolve(documentAbsolute, '..'));
            await this.#atomicWrite(documentAbsolute, documentBefore);
          }
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
      await this.#refreshDatabaseIndex();
    } catch (error) {
      throw new DatabaseMarkdownTableWriterError('transaction_failed', 'V2 undo completed bytes but index refresh failed', {
        ownerPath: receipt.ownerPath,
      }, error);
    }
    return { changed: true, receipt };
  }

  #receipt(
    operation: DatabaseMarkdownTableMutationReceipt['operation'],
    resolved: ResolvedSource,
    row: ResolvedRow,
    before: string,
    after: string,
    propertyId?: string,
  ): DatabaseMarkdownTableMutationReceipt {
    const beforeRevision = revision(before);
    const afterRevision = revision(after);
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
      files: [{ path: sourceStorage(resolved.source).owner.path, operation: 'update', before: beforeRevision, after: afterRevision }],
      beforeOwnerRevision: beforeRevision.sha256,
      afterOwnerRevision: afterRevision.sha256,
      beforeOwnerContent: before,
      afterOwnerContent: after,
      committedAt: new Date().toISOString(),
    };
  }

  async #beforeOwnerBytes(receipt: DatabaseMarkdownTableMutationReceipt): Promise<string> {
    if (typeof receipt.beforeOwnerContent === 'string') return receipt.beforeOwnerContent;
    throw new DatabaseMarkdownTableWriterError('invalid_request', 'This receipt does not carry recoverable before bytes; use the durable transaction journal');
  }

  #ownerBefore(receipt: DatabaseMarkdownTableMutationReceipt, fallback: string): string {
    if (typeof receipt.beforeOwnerContent === 'string') return receipt.beforeOwnerContent;
    if (receipt.beforeOwnerRevision === sha256(fallback)) return fallback;
    throw new DatabaseMarkdownTableWriterError('invalid_request', 'This receipt does not carry recoverable before bytes; use the durable transaction journal');
  }

  #assertExpectedRevision(
    resolved: ResolvedSource,
    expected: string | undefined,
    expectedRowRevision?: string,
    expectedCellRevision?: string,
  ): void {
    if (expected === undefined && expectedRowRevision === undefined && expectedCellRevision === undefined) {
      throw new DatabaseMarkdownTableWriterError('invalid_request', 'A v2 mutation requires an expected owner revision');
    }
    if (expected === undefined) return;
    const observed = sha256(resolved.markdown);
    if (observed !== expected) {
      throw new DatabaseMarkdownTableWriterError('target_changed', 'Owner document changed after the v2 mutation was planned', {
        ownerPath: sourceStorage(resolved.source).owner.path,
        expectedRevision: expected,
        observedRevision: observed,
      });
    }
  }

  async #assertOwnerStillCurrent(resolved: ResolvedSource): Promise<void> {
    const current = await this.#fs.readFile(resolved.ownerAbsolutePath).catch((error) => {
      throw new DatabaseMarkdownTableWriterError('target_changed', 'Owner document disappeared before the v2 write', {
        ownerPath: sourceStorage(resolved.source).owner.path,
      }, error);
    });
    const expected = sha256(resolved.markdown);
    const observed = sha256(current);
    if (expected !== observed) {
      throw new DatabaseMarkdownTableWriterError('target_changed', 'Owner document changed during the v2 write', {
        ownerPath: sourceStorage(resolved.source).owner.path,
        expectedRevision: expected,
        observedRevision: observed,
      });
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
    if (!row) throw new DatabaseMarkdownTableWriterError('owner_invalid', `Owner row ${rowIndex} is missing`);
    const observedRow = sha256(resolved.markdown.slice(row.range.start, row.range.end));
    if (expectedRowRevision !== undefined && expectedRowRevision !== observedRow) {
      throw new DatabaseMarkdownTableWriterError('target_changed', 'Owner table row changed after the v2 mutation was planned', {
        rowIndex,
        expectedRevision: expectedRowRevision,
        observedRevision: observedRow,
      });
    }
    const observedCell = sha256(cell.value);
    if (expectedCellRevision !== undefined && expectedCellRevision !== observedCell) {
      throw new DatabaseMarkdownTableWriterError('target_changed', 'Owner table cell changed after the v2 mutation was planned', {
        rowIndex,
        columnIndex: cell.columnIndex,
        expectedRevision: expectedCellRevision,
        observedRevision: observedCell,
      });
    }
  }

  #safeAbsolutePath(path: string): string {
    const absolute = resolve(this.#contentDir, path);
    if (!isWithin(this.#contentDir, absolute)) {
      throw new DatabaseMarkdownTableWriterError('invalid_request', 'V2 writer target escapes the content directory', { path });
    }
    return absolute;
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
          throw new DatabaseMarkdownTableWriterError('invalid_request', 'V2 writer refuses symbolic-link path components', { path });
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
