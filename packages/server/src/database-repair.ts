import { createHash, randomUUID } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  type DatabaseDocumentId,
  type DatabaseRecordRepairChange,
  isRecordPathInSource,
  planDatabaseMarkdownIdentityRepair,
  planDatabaseUniqueIdRepair,
  repairDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { atomicWriteFile, withFileLock } from '@nedian0brien/synapsenote-core/server';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';
import {
  createDatabaseTransactionJournal,
  type DatabaseTransactionJournal,
} from './database-transaction-journal.ts';
import { tracedAtomicFs, tracedMkdir } from './fs-traced.ts';

export type DatabaseRepairCategory =
  | 'stale_identity'
  | 'invalid_value'
  | 'unique_id_allocation'
  | 'missing_record'
  | 'orphaned_index_entry';

export interface DatabaseRepairFileAction {
  kind: 'rewrite_record';
  path: string;
  categories: readonly Extract<
    DatabaseRepairCategory,
    'stale_identity' | 'invalid_value' | 'unique_id_allocation'
  >[];
  beforeSha256: string;
  afterSha256: string;
  changes: readonly DatabaseRecordRepairChange[];
}

export interface DatabaseRepairMarkdownAction {
  kind: 'rewrite_markdown';
  path: string;
  databaseId: string;
  sourceId: string;
  operation: 'assign_document_id' | 'rewrite_title_alias';
  documentId?: string;
  rowIndex?: number;
  beforeSha256: string;
  afterSha256: string;
}

export interface DatabaseRepairIndexAction {
  kind: 'rebuild_index';
  missingRecordIds: readonly string[];
  orphanedRecordIds: readonly string[];
  changedRecordIds: readonly string[];
  diagnosticsDiffer: boolean;
}

export interface DatabaseRepairUniqueIdManifestAction {
  kind: 'advance_unique_id_watermark';
  databaseId: string;
  propertyNextNumbers: Readonly<Record<string, number>>;
}

export type DatabaseRepairAction =
  | DatabaseRepairFileAction
  | DatabaseRepairMarkdownAction
  | DatabaseRepairIndexAction
  | DatabaseRepairUniqueIdManifestAction;

export interface DatabaseRepairBlocker {
  path: string;
  code:
    | 'ambiguous_source'
    | 'unreadable_record'
    | 'record_symlink'
    | 'external_conflict'
    | 'required_value_needs_input'
    | 'unrepairable_record'
    | 'malformed_owner'
    | 'duplicate_owner'
    | 'missing_document_id'
    | 'invalid_document_id'
    | 'duplicate_document_id'
    | 'duplicate_row_identity'
    | 'broken_document_link';
  message: string;
  propertyId?: string;
  propertyKey?: string;
  rowIndex?: number;
  relatedPath?: string;
}

export interface DatabaseRepairPlan {
  version: 1;
  id: string;
  hash: string;
  createdAt: string;
  expiresAt: string;
  snapshot: {
    manifestRevision: string;
    indexRevision: string;
  };
  committable: boolean;
  actions: readonly DatabaseRepairAction[];
  blockers: readonly DatabaseRepairBlocker[];
  summary: {
    staleIdentities: number;
    invalidValues: number;
    missingRecords: number;
    orphanedIndexEntries: number;
    recordRewrites: number;
    markdownRewrites: number;
    identityIssues: number;
    uniqueIdAllocations: number;
    blocked: number;
  };
}

export interface DatabaseRepairApplyInput {
  planId: string;
  planHash: string;
  approvalToken: string;
  idempotencyKey: string;
  principalId: string;
}

export interface DatabaseRepairUndoInput {
  repairId: string;
  planHash: string;
  undoToken: string;
  idempotencyKey: string;
  principalId: string;
}

export interface DatabaseRepairUndoReceipt {
  version: 1;
  undoId: string;
  repairId: string;
  planHash: string;
  principalId: string;
  undoneAt: string;
  restoredPaths: readonly string[];
  restoredDatabaseIds: readonly string[];
}

export interface DatabaseRepairUndoResult {
  idempotentReplay: boolean;
  receipt: DatabaseRepairUndoReceipt;
}

export interface DatabaseRepairReceipt {
  version: 1;
  repairId: string;
  planId: string;
  planHash: string;
  principalId: string;
  appliedAt: string;
  before: { manifestRevision: string; indexRevision: string };
  after: { manifestRevision: string; indexRevision: string };
  rewrittenPaths: readonly string[];
  rebuiltIndex: boolean;
  rewrittenDatabaseIds: readonly string[];
  undoToken: string;
}

export interface DatabaseRepairResult {
  idempotentReplay: boolean;
  receipt: DatabaseRepairReceipt;
}

export type DatabaseRepairErrorCode =
  | 'repair_plan_not_found'
  | 'repair_plan_expired'
  | 'repair_plan_hash_mismatch'
  | 'repair_approval_required'
  | 'repair_blocked'
  | 'repair_nothing_to_repair'
  | 'repair_snapshot_changed'
  | 'repair_idempotency_conflict'
  | 'repair_file_changed'
  | 'repair_unavailable'
  | 'repair_transaction_failed'
  | 'repair_undo_not_found'
  | 'repair_undo_token_mismatch'
  | 'repair_undo_intervening_edit'
  | 'repair_undo_idempotency_conflict';

export class DatabaseRepairError extends Error {
  readonly code: DatabaseRepairErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseRepairErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseRepairError';
    this.code = code;
    this.details = details;
  }
}

interface InternalRecordFileAction extends DatabaseRepairFileAction {
  beforeContent: string;
  afterContent: string;
  mode: number;
}

interface InternalMarkdownFileAction extends DatabaseRepairMarkdownAction {
  beforeContent: string;
  afterContent: string;
  mode: number;
}

type InternalFileAction = InternalRecordFileAction | InternalMarkdownFileAction;

interface InternalPlan {
  public: DatabaseRepairPlan;
  fileActions: readonly InternalFileAction[];
  definitionUpdates: readonly { before: DatabaseDefinition; after: DatabaseDefinition }[];
}

interface RepairUndoRecord {
  receipt: DatabaseRepairReceipt;
  files: readonly { path: string; before: string; after: string; mode: number }[];
  definitions: readonly {
    databaseId: string;
    before: DatabaseDefinition;
    after: DatabaseDefinition;
  }[];
}

export interface DatabaseRepairPreviewOptions {
  /** Explicit IDs selected by the user for linked documents missing an ID. */
  documentIds?: Readonly<Record<string, DatabaseDocumentId>>;
}

export interface CreateDatabaseRepairEngineOptions {
  projectDir: string;
  contentDir: string;
  /**
   * Permit a deliberately isolated single-file session to write back to the
   * user's content directory while keeping all `.ok/` state under its
   * throwaway project root. Normal project servers must leave this disabled.
   */
  allowExternalContentDir?: boolean;
  databaseStore: DatabaseStore;
  databaseRecordIndex: DatabaseRecordIndex;
  refreshDatabaseIndex?: () => Promise<unknown>;
  now?: () => Date;
  generateUuid?: () => string;
  journal?: DatabaseTransactionJournal;
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function publicPlanHash(plan: Omit<DatabaseRepairPlan, 'hash'>): string {
  return sha256(stable(plan));
}

function isWithin(base: string, candidate: string): boolean {
  const rel = relative(base, candidate);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

async function readMarkdownFiles(
  contentDir: string,
  maxFiles = 100_000,
): Promise<Array<{ path: string; markdown: string; mode: number }>> {
  const output: Array<{ path: string; markdown: string; mode: number }> = [];
  const visit = async (directory: string): Promise<void> => {
    if (output.length >= maxFiles) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (output.length >= maxFiles) return;
      const absolute = resolve(directory, entry.name);
      const relativePath = relative(contentDir, absolute);
      const stats = await lstat(absolute);
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!stats.isFile() || !/\.md(?:x)?$/iu.test(entry.name)) continue;
      try {
        output.push({
          path: relativePath.split(sep).join('/'),
          markdown: await readFile(absolute, 'utf8'),
          mode: stats.mode & 0o777,
        });
      } catch {
        // The owner planner reports only content it can safely inspect. The
        // index/record repair path still surfaces unreadable legacy records.
      }
    }
  };
  await visit(contentDir);
  return output;
}

function durableRepairResult(value: unknown): DatabaseRepairResult {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof (value as { idempotentReplay?: unknown }).idempotentReplay !== 'boolean' ||
    (value as { receipt?: unknown }).receipt === null ||
    typeof (value as { receipt?: unknown }).receipt !== 'object'
  ) {
    throw new Error('Durable repair result is invalid');
  }
  const receipt = (value as { receipt: Record<string, unknown> }).receipt;
  if (
    receipt.version !== 1 ||
    typeof receipt.repairId !== 'string' ||
    typeof receipt.planId !== 'string' ||
    typeof receipt.planHash !== 'string' ||
    typeof receipt.principalId !== 'string' ||
    !Array.isArray(receipt.rewrittenPaths)
  ) {
    throw new Error('Durable repair receipt is invalid');
  }
  if (receipt.rewrittenDatabaseIds === undefined) receipt.rewrittenDatabaseIds = [];
  if (!Array.isArray(receipt.rewrittenDatabaseIds)) {
    throw new Error('Durable repair receipt database IDs are invalid');
  }
  if (receipt.undoToken !== undefined && typeof receipt.undoToken !== 'string') {
    throw new Error('Durable repair undo token is invalid');
  }
  return structuredClone(value) as DatabaseRepairResult;
}

function durableRepairUndoResult(value: unknown): DatabaseRepairUndoResult {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof (value as { idempotentReplay?: unknown }).idempotentReplay !== 'boolean' ||
    (value as { receipt?: unknown }).receipt === null ||
    typeof (value as { receipt?: unknown }).receipt !== 'object'
  ) {
    throw new Error('Durable repair undo result is invalid');
  }
  const receipt = (value as { receipt: Record<string, unknown> }).receipt;
  if (
    receipt.version !== 1 ||
    typeof receipt.undoId !== 'string' ||
    typeof receipt.repairId !== 'string' ||
    typeof receipt.planHash !== 'string' ||
    typeof receipt.principalId !== 'string' ||
    typeof receipt.undoneAt !== 'string' ||
    !Array.isArray(receipt.restoredPaths) ||
    !Array.isArray(receipt.restoredDatabaseIds)
  ) {
    throw new Error('Durable repair undo receipt is invalid');
  }
  return structuredClone(value) as DatabaseRepairUndoResult;
}

export class DatabaseRepairEngine {
  readonly #projectDir: string;
  readonly #contentDir: string;
  readonly #databaseStore: DatabaseStore;
  readonly #databaseRecordIndex: DatabaseRecordIndex;
  readonly #refreshDatabaseIndex: () => Promise<unknown>;
  readonly #now: () => Date;
  readonly #generateUuid: () => string;
  readonly #journal: DatabaseTransactionJournal;
  readonly #plans = new Map<string, InternalPlan>();
  readonly #idempotency = new Map<string, { fingerprint: string; result: DatabaseRepairResult }>();
  readonly #repairRecords = new Map<string, RepairUndoRecord>();
  readonly #undoIdempotency = new Map<
    string,
    { fingerprint: string; result: DatabaseRepairUndoResult }
  >();
  readonly #undoneRepairs = new Map<string, DatabaseRepairUndoResult>();
  #transactionActive = false;

  constructor(options: CreateDatabaseRepairEngineOptions) {
    this.#projectDir = resolve(options.projectDir);
    this.#contentDir = resolve(options.contentDir);
    if (!isWithin(this.#projectDir, this.#contentDir) && !options.allowExternalContentDir) {
      throw new Error('Database repair contentDir must be inside projectDir');
    }
    this.#databaseStore = options.databaseStore;
    this.#databaseRecordIndex = options.databaseRecordIndex;
    this.#refreshDatabaseIndex =
      options.refreshDatabaseIndex ?? (() => this.#databaseRecordIndex.rebuild());
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
    this.#journal = options.journal ?? createDatabaseTransactionJournal(this.#projectDir);
  }

  isTransactionActive(): boolean {
    return this.#transactionActive;
  }

  expectedApprovalToken(planHash: string): string {
    return `approve:${planHash}`;
  }

  async preview(
    ttlSeconds = 600,
    options: DatabaseRepairPreviewOptions = {},
  ): Promise<DatabaseRepairPlan> {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 3_600) {
      throw new DatabaseRepairError('repair_blocked', 'Repair plan TTL must be 30-3600 seconds');
    }
    const consistency = await this.#databaseRecordIndex.checkConsistency();
    const storeSnapshot = this.#databaseStore.snapshot();
    const indexSnapshot = this.#databaseRecordIndex.snapshot();
    const blockers: DatabaseRepairBlocker[] = [];
    const fileActions: InternalFileAction[] = [];
    const duplicatePathsById = new Map<string, string[]>();
    const uniqueIdValuesByPath = new Map<string, Record<string, number>>();
    const definitionUpdates: Array<{ before: DatabaseDefinition; after: DatabaseDefinition }> = [];
    const v2ManagedPaths = new Set<string>();

    const v2Databases = storeSnapshot.databases.filter((database) =>
      database.sources.some((source) => source.storage?.kind === 'markdown_table'),
    );
    if (v2Databases.length > 0) {
      const markdownFiles = await readMarkdownFiles(this.#contentDir);
      const byPath = new Map(markdownFiles.map((file) => [file.path, file]));
      for (const database of v2Databases) {
        for (const source of database.sources) {
          const storage = source.storage;
          if (!storage || storage.kind !== 'markdown_table') continue;
          const folder = source.folder
            .replaceAll('\\', '/')
            .replace(/^\.\//u, '')
            .replace(/\/$/u, '');
          const relevant = markdownFiles.filter(
            (file) =>
              file.path === storage.owner.path ||
              folder === '.' ||
              folder === '' ||
              file.path === folder ||
              file.path.startsWith(`${folder}/`),
          );
          for (const file of relevant) v2ManagedPaths.add(file.path);
          const ownerFile = byPath.get(storage.owner.path);
          if (!ownerFile) {
            blockers.push({
              path: storage.owner.path,
              code: 'malformed_owner',
              message: 'Configured v2 owner document could not be read',
            });
          }
          const identityPlan = planDatabaseMarkdownIdentityRepair({
            databaseId: database.id,
            sourceId: source.id,
            owners: relevant
              .filter(
                ({ path, markdown }) =>
                  path === storage.owner.path || markdown.includes('synapsenote:database'),
              )
              .map(({ path, markdown }) => ({ path, markdown })),
            documents: relevant
              .filter((file) => file.path !== storage.owner.path)
              .map(({ path, markdown }) => ({ path, markdown })),
            proposedDocumentIds: options.documentIds,
          });
          for (const issue of identityPlan.issues) {
            if (issue.code === 'stale_alias') continue;
            blockers.push({
              path: issue.path,
              code: issue.code,
              message: issue.message,
              ...(issue.rowIndex === undefined ? {} : { rowIndex: issue.rowIndex }),
              ...(issue.relatedPath ? { relatedPath: issue.relatedPath } : {}),
            });
          }
          for (const action of identityPlan.actions) {
            const path = action.kind === 'assign_document_id' ? action.path : action.ownerPath;
            const file = byPath.get(path);
            if (!file) {
              blockers.push({
                path,
                code: 'unreadable_record',
                message: 'Identity repair target could not be read',
              });
              continue;
            }
            fileActions.push({
              kind: 'rewrite_markdown',
              path,
              databaseId: database.id,
              sourceId: source.id,
              operation: action.kind,
              ...(action.kind === 'assign_document_id' ? { documentId: action.documentId } : {}),
              ...(action.kind === 'rewrite_title_alias' && action.rowIndex >= 0
                ? { rowIndex: action.rowIndex }
                : {}),
              beforeSha256: action.beforeSha256,
              afterSha256: action.afterSha256,
              beforeContent: file.markdown,
              afterContent: action.afterMarkdown,
              mode: file.mode,
            });
          }
        }
      }
    }

    for (const database of storeSnapshot.databases) {
      const propertyNextNumbers: Record<string, number> = {};
      for (const source of database.sources) {
        const properties = source.properties.filter(
          (
            property,
          ): property is Extract<(typeof source.properties)[number], { type: 'unique_id' }> =>
            property.type === 'unique_id',
        );
        if (properties.length === 0) continue;
        const records = indexSnapshot.records
          .filter((record) => record.databaseId === database.id && record.sourceId === source.id)
          .sort(
            (left, right) => left.path.localeCompare(right.path) || left.id.localeCompare(right.id),
          );
        const repair = planDatabaseUniqueIdRepair(properties, records);
        for (const assignment of repair.assignments) {
          const record = records.find((candidate) => candidate.id === assignment.recordId);
          if (!record) continue;
          const values = uniqueIdValuesByPath.get(record.path) ?? {};
          values[assignment.propertyId] = assignment.number;
          uniqueIdValuesByPath.set(record.path, values);
        }
        Object.assign(propertyNextNumbers, repair.nextNumbers);
      }
      const after = structuredClone(database);
      for (const source of after.sources) {
        for (const property of source.properties) {
          if (property.type !== 'unique_id') continue;
          const nextNumber = propertyNextNumbers[property.id];
          if (nextNumber !== undefined) property.nextNumber = nextNumber;
        }
      }
      if (stable(after) !== stable(database)) {
        definitionUpdates.push({ before: structuredClone(database), after });
      }
    }

    for (const issue of indexSnapshot.issues) {
      if (issue.code === 'duplicate_record_id' && issue.recordId) {
        const paths = duplicatePathsById.get(issue.recordId) ?? [];
        paths.push(issue.path);
        duplicatePathsById.set(issue.recordId, paths);
      }
    }
    const replacementIds = new Map<string, string>();
    for (const paths of duplicatePathsById.values()) {
      const ordered = [...new Set(paths)].sort((left, right) => left.localeCompare(right));
      for (const path of ordered.slice(1)) {
        replacementIds.set(path, `rec_${this.#generateUuid().replaceAll('-', '').toLowerCase()}`);
      }
    }

    const repairPaths = new Set(
      indexSnapshot.issues
        .filter(
          (issue) =>
            !v2ManagedPaths.has(issue.path) &&
            (issue.code === 'invalid_record' || issue.code === 'duplicate_record_id'),
        )
        .map((issue) => issue.path),
    );
    for (const path of uniqueIdValuesByPath.keys()) repairPaths.add(path);
    for (const path of [...repairPaths].sort((left, right) => left.localeCompare(right))) {
      if (duplicatePathsById.size > 0 && !replacementIds.has(path)) {
        const duplicate = indexSnapshot.issues.find(
          (issue) => issue.path === path && issue.code === 'duplicate_record_id',
        );
        if (duplicate) continue;
      }
      const v2Issue = indexSnapshot.issues.find(
        (issue) =>
          issue.path === path &&
          issue.databaseId !== undefined &&
          storeSnapshot.databases.some(
            (database) =>
              database.id === issue.databaseId &&
              database.sources.some(
                (source) =>
                  source.id === issue.sourceId && source.storage?.kind === 'markdown_table',
              ),
          ),
      );
      if (v2Issue) continue;
      const owners = storeSnapshot.databases
        .flatMap((database) =>
          database.sources
            // V2 owner/linked documents are repaired by the Markdown identity
            // planner above. They are not legacy frontmatter records and must
            // never be sent through the v1 record-repair materializer.
            .filter((source) => !source.storage && isRecordPathInSource(path, source))
            .map((source) => ({ database, source })),
        )
        .sort(
          (left, right) =>
            left.database.id.localeCompare(right.database.id) ||
            left.source.id.localeCompare(right.source.id),
        );
      if (owners.length !== 1) {
        blockers.push({
          path,
          code: 'ambiguous_source',
          message: `Record path matches ${owners.length} data sources; choose one before repair`,
        });
        continue;
      }
      const owner = owners[0];
      if (!owner) continue;
      const absolutePath = resolve(this.#contentDir, path);
      if (!isWithin(this.#contentDir, absolutePath)) {
        blockers.push({ path, code: 'unrepairable_record', message: 'Unsafe record path' });
        continue;
      }
      let content: string;
      let mode: number;
      try {
        const stats = await lstat(absolutePath);
        if (stats.isSymbolicLink() || !stats.isFile()) {
          blockers.push({
            path,
            code: 'record_symlink',
            message: 'Symbolic links and non-regular files cannot be repaired',
          });
          continue;
        }
        content = await readFile(absolutePath, 'utf-8');
        mode = stats.mode & 0o777;
      } catch {
        blockers.push({ path, code: 'unreadable_record', message: 'Record could not be read' });
        continue;
      }
      const repaired = repairDatabaseRecord({
        definition: owner.database,
        sourceId: owner.source.id,
        path,
        markdown: content,
        ...(replacementIds.has(path)
          ? { recordId: replacementIds.get(path) as `rec_${string}` }
          : {}),
        generateUuid: this.#generateUuid,
        ...(uniqueIdValuesByPath.has(path)
          ? { uniqueIdValues: uniqueIdValuesByPath.get(path) }
          : {}),
      });
      if (!repaired.ok) {
        blockers.push({
          path,
          code:
            repaired.code === 'required_value_needs_input'
              ? 'required_value_needs_input'
              : 'unrepairable_record',
          message: repaired.message,
          ...(repaired.propertyId ? { propertyId: repaired.propertyId } : {}),
          ...(repaired.propertyKey ? { propertyKey: repaired.propertyKey } : {}),
        });
        continue;
      }
      if (!repaired.changed) continue;
      const categories = [
        ...(repaired.changes.some((change) => change.kind === 'set_identity')
          ? (['stale_identity'] as const)
          : []),
        ...(repaired.changes.some(
          (change) => change.kind !== 'set_identity' && change.kind !== 'allocate_unique_id',
        )
          ? (['invalid_value'] as const)
          : []),
        ...(repaired.changes.some((change) => change.kind === 'allocate_unique_id')
          ? (['unique_id_allocation'] as const)
          : []),
      ];
      fileActions.push({
        kind: 'rewrite_record',
        path,
        categories,
        beforeSha256: sha256(content),
        afterSha256: sha256(repaired.markdown),
        changes: repaired.changes,
        beforeContent: content,
        afterContent: repaired.markdown,
        mode,
      });
    }

    for (const issue of indexSnapshot.issues) {
      if (v2ManagedPaths.has(issue.path)) continue;
      if (
        issue.code === 'invalid_record' ||
        issue.code === 'duplicate_record_id' ||
        issue.code === 'duplicate_unique_value'
      ) {
        continue;
      }
      blockers.push({
        path: issue.path,
        code:
          issue.code === 'record_symlink'
            ? 'record_symlink'
            : issue.code === 'external_conflict'
              ? 'external_conflict'
              : 'unreadable_record',
        message: issue.message,
      });
    }

    const indexAction: DatabaseRepairIndexAction | null = consistency.consistent
      ? null
      : {
          kind: 'rebuild_index',
          missingRecordIds: consistency.missingRecordIds,
          orphanedRecordIds: consistency.staleRecordIds,
          changedRecordIds: consistency.changedRecordIds,
          diagnosticsDiffer: consistency.diagnosticsDiffer,
        };
    const publicActions: DatabaseRepairAction[] = [
      ...fileActions.map(
        ({ beforeContent: _before, afterContent: _after, mode: _mode, ...action }) =>
          structuredClone(action),
      ),
      ...definitionUpdates.map(({ after }) => ({
        kind: 'advance_unique_id_watermark' as const,
        databaseId: after.id,
        propertyNextNumbers: Object.fromEntries(
          after.sources.flatMap((source) =>
            source.properties
              .filter((property) => property.type === 'unique_id')
              .map((property) => [property.id, property.nextNumber] as const),
          ),
        ),
      })),
      ...(indexAction ? [indexAction] : []),
    ];
    const createdAt = this.#now();
    const withoutHash: Omit<DatabaseRepairPlan, 'hash'> = {
      version: 1,
      id: `repair_plan_${randomUUID().replaceAll('-', '')}`,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + ttlSeconds * 1_000).toISOString(),
      snapshot: {
        manifestRevision: storeSnapshot.revision,
        indexRevision: indexSnapshot.revision,
      },
      committable: blockers.length === 0 && publicActions.length > 0,
      actions: publicActions,
      blockers: blockers.sort((left, right) => left.path.localeCompare(right.path)),
      summary: {
        staleIdentities: fileActions.reduce(
          (count, action) =>
            count +
            (action.kind === 'rewrite_record'
              ? action.changes.filter((change) => change.kind === 'set_identity').length
              : 0),
          0,
        ),
        invalidValues: fileActions.reduce(
          (count, action) =>
            count +
            (action.kind === 'rewrite_record'
              ? action.changes.filter(
                  (change) =>
                    change.kind !== 'set_identity' && change.kind !== 'allocate_unique_id',
                ).length
              : 0),
          0,
        ),
        missingRecords: consistency.missingRecordIds.length,
        orphanedIndexEntries: consistency.staleRecordIds.length,
        recordRewrites: fileActions.filter((action) => action.kind === 'rewrite_record').length,
        markdownRewrites: fileActions.filter((action) => action.kind === 'rewrite_markdown').length,
        identityIssues: blockers.filter((blocker) =>
          [
            'malformed_owner',
            'duplicate_owner',
            'missing_document_id',
            'invalid_document_id',
            'duplicate_document_id',
            'duplicate_row_identity',
            'broken_document_link',
          ].includes(blocker.code),
        ).length,
        uniqueIdAllocations: fileActions.reduce(
          (count, action) =>
            count +
            (action.kind === 'rewrite_record'
              ? action.changes.filter((change) => change.kind === 'allocate_unique_id').length
              : 0),
          0,
        ),
        blocked: blockers.length,
      },
    };
    const plan: DatabaseRepairPlan = { ...withoutHash, hash: publicPlanHash(withoutHash) };
    this.#plans.set(plan.id, {
      public: structuredClone(plan),
      fileActions,
      definitionUpdates,
    });
    return structuredClone(plan);
  }

  async apply(input: DatabaseRepairApplyInput): Promise<DatabaseRepairResult> {
    if (
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 256 ||
      input.principalId.trim() === ''
    ) {
      throw new DatabaseRepairError('repair_blocked', 'Apply requires idempotency and principal');
    }
    const idempotencyHash = sha256(input.idempotencyKey);
    const fingerprint = sha256(
      stable({
        planId: input.planId,
        planHash: input.planHash,
        approvalToken: input.approvalToken,
        principalId: input.principalId,
      }),
    );
    await this.#refreshJournal();
    const replay = this.#idempotency.get(idempotencyHash);
    if (replay) {
      if (replay.fingerprint !== fingerprint) {
        throw new DatabaseRepairError(
          'repair_idempotency_conflict',
          'Idempotency key belongs to another repair request',
        );
      }
      return { ...structuredClone(replay.result), idempotentReplay: true };
    }
    const plan = this.#plans.get(input.planId);
    if (!plan) {
      throw new DatabaseRepairError('repair_plan_not_found', 'Repair plan was not found');
    }
    if (Date.parse(plan.public.expiresAt) <= this.#now().getTime()) {
      throw new DatabaseRepairError('repair_plan_expired', 'Repair plan expired');
    }
    if (input.planHash !== plan.public.hash) {
      throw new DatabaseRepairError('repair_plan_hash_mismatch', 'Repair plan hash does not match');
    }
    if (input.approvalToken !== this.expectedApprovalToken(plan.public.hash)) {
      throw new DatabaseRepairError(
        'repair_approval_required',
        'Approval must bind to the plan hash',
      );
    }
    if (!plan.public.committable) {
      throw new DatabaseRepairError('repair_blocked', 'Repair plan contains blockers', {
        blockers: plan.public.blockers,
      });
    }
    if (plan.public.actions.length === 0) {
      throw new DatabaseRepairError('repair_nothing_to_repair', 'Repair plan has no actions');
    }

    const lockPath = resolve(this.#projectDir, '.ok', 'databases', '.repair.lock');
    await tracedMkdir(resolve(lockPath, '..'), { recursive: true });
    return withFileLock(lockPath, async () => {
      await this.#refreshJournal();
      const secondReplay = this.#idempotency.get(idempotencyHash);
      if (secondReplay) {
        if (secondReplay.fingerprint !== fingerprint) {
          throw new DatabaseRepairError(
            'repair_idempotency_conflict',
            'Idempotency key belongs to another repair request',
          );
        }
        return { ...structuredClone(secondReplay.result), idempotentReplay: true };
      }
      const currentStore = this.#databaseStore.snapshot();
      const currentIndex = this.#databaseRecordIndex.snapshot();
      if (
        currentStore.revision !== plan.public.snapshot.manifestRevision ||
        currentIndex.revision !== plan.public.snapshot.indexRevision
      ) {
        throw new DatabaseRepairError(
          'repair_snapshot_changed',
          'Database changed after repair preview',
          {
            expected: plan.public.snapshot,
            observed: {
              manifestRevision: currentStore.revision,
              indexRevision: currentIndex.revision,
            },
          },
        );
      }
      for (const action of plan.fileActions) {
        let content: string;
        try {
          content = await readFile(resolve(this.#contentDir, action.path), 'utf-8');
        } catch {
          throw new DatabaseRepairError(
            'repair_file_changed',
            `Repair target "${action.path}" is unavailable`,
          );
        }
        if (sha256(content) !== action.beforeSha256) {
          throw new DatabaseRepairError('repair_file_changed', `Record "${action.path}" changed`);
        }
      }

      this.#transactionActive = true;
      const written: InternalFileAction[] = [];
      const updatedDefinitions: Array<{ before: DatabaseDefinition; after: DatabaseDefinition }> =
        [];
      try {
        for (const update of plan.definitionUpdates) {
          await this.#databaseStore.update(update.after.id, update.after);
          updatedDefinitions.push(update);
        }
        for (const action of plan.fileActions) {
          await atomicWriteFile(resolve(this.#contentDir, action.path), action.afterContent, {
            fs: tracedAtomicFs,
            mode: action.mode,
          });
          written.push(action);
        }
        await this.#refreshDatabaseIndex();
        const afterStore = this.#databaseStore.snapshot();
        const afterIndex = this.#databaseRecordIndex.snapshot();
        for (const action of plan.fileActions) {
          if (
            action.kind === 'rewrite_record' &&
            !afterIndex.records.some((record) => record.path === action.path)
          ) {
            throw new DatabaseRepairError(
              'repair_transaction_failed',
              `Repaired record "${action.path}" did not materialize`,
            );
          }
        }
        const repairId = `repair_${randomUUID().replaceAll('-', '')}`;
        const undoToken = `repair_undo_${randomUUID().replaceAll('-', '')}`;
        const receipt: DatabaseRepairReceipt = {
          version: 1,
          repairId,
          planId: plan.public.id,
          planHash: plan.public.hash,
          principalId: input.principalId,
          appliedAt: this.#now().toISOString(),
          before: structuredClone(plan.public.snapshot),
          after: {
            manifestRevision: afterStore.revision,
            indexRevision: afterIndex.revision,
          },
          rewrittenPaths: plan.fileActions.map((action) => action.path),
          rebuiltIndex: plan.public.actions.some((action) => action.kind === 'rebuild_index'),
          rewrittenDatabaseIds: plan.definitionUpdates.map((update) => update.after.id),
          undoToken,
        };
        const result = { idempotentReplay: false, receipt };
        await this.#journal.persistRepair({
          idempotencyKeyHash: idempotencyHash,
          requestFingerprint: fingerprint,
          undoToken,
          undoFiles: plan.fileActions.map((action) => ({
            path: action.path,
            before: action.beforeContent,
            after: action.afterContent,
          })),
          undoDefinitions: plan.definitionUpdates.map((update) => ({
            databaseId: update.after.id,
            before: update.before,
            after: update.after,
          })),
          result,
        });
        this.#idempotency.set(idempotencyHash, { fingerprint, result: structuredClone(result) });
        this.#repairRecords.set(repairId, {
          receipt: structuredClone(receipt),
          files: plan.fileActions.map((action) => ({
            path: action.path,
            before: action.beforeContent,
            after: action.afterContent,
            mode: action.mode,
          })),
          definitions: plan.definitionUpdates.map((update) => ({
            databaseId: update.after.id,
            before: structuredClone(update.before),
            after: structuredClone(update.after),
          })),
        });
        return result;
      } catch (error) {
        const rollbackErrors: string[] = [];
        for (const action of [...written].reverse()) {
          try {
            await atomicWriteFile(resolve(this.#contentDir, action.path), action.beforeContent, {
              fs: tracedAtomicFs,
              mode: action.mode,
            });
          } catch {
            rollbackErrors.push(action.path);
          }
        }
        for (const update of [...updatedDefinitions].reverse()) {
          try {
            await this.#databaseStore.update(update.before.id, update.before);
          } catch {
            rollbackErrors.push(`database:${update.before.id}`);
          }
        }
        try {
          await this.#refreshDatabaseIndex();
        } catch {
          rollbackErrors.push('<derived-index>');
        }
        if (error instanceof DatabaseRepairError && rollbackErrors.length === 0) throw error;
        throw new DatabaseRepairError(
          'repair_transaction_failed',
          'Database repair failed and was rolled back',
          { rollbackErrors },
          error,
        );
      } finally {
        this.#transactionActive = false;
      }
    });
  }

  async undo(input: DatabaseRepairUndoInput): Promise<DatabaseRepairUndoResult> {
    if (
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 256 ||
      input.principalId.trim() === ''
    ) {
      throw new DatabaseRepairError('repair_blocked', 'Undo requires idempotency and principal');
    }
    const idempotencyHash = sha256(input.idempotencyKey);
    const fingerprint = sha256(
      stable({
        repairId: input.repairId,
        planHash: input.planHash,
        undoToken: input.undoToken,
        principalId: input.principalId,
      }),
    );
    await this.#refreshJournal();
    const replay = this.#undoIdempotency.get(idempotencyHash);
    if (replay) {
      if (replay.fingerprint !== fingerprint) {
        throw new DatabaseRepairError(
          'repair_undo_idempotency_conflict',
          'Undo idempotency key belongs to another request',
        );
      }
      return { ...structuredClone(replay.result), idempotentReplay: true };
    }
    if (this.#undoneRepairs.has(input.repairId)) {
      throw new DatabaseRepairError('repair_undo_not_found', 'Repair has already been undone', {
        repairId: input.repairId,
      });
    }
    const repair = this.#repairRecords.get(input.repairId);
    if (!repair) {
      throw new DatabaseRepairError('repair_undo_not_found', 'Repair undo artifact was not found');
    }
    if (
      repair.receipt.planHash !== input.planHash ||
      repair.receipt.undoToken !== input.undoToken
    ) {
      throw new DatabaseRepairError(
        'repair_undo_token_mismatch',
        'Undo token does not bind to the repair receipt',
      );
    }
    const lockPath = resolve(this.#projectDir, '.ok', 'databases', '.repair.lock');
    await tracedMkdir(resolve(lockPath, '..'), { recursive: true });
    return withFileLock(lockPath, async () => {
      await this.#refreshJournal();
      const secondReplay = this.#undoIdempotency.get(idempotencyHash);
      if (secondReplay) {
        if (secondReplay.fingerprint !== fingerprint) {
          throw new DatabaseRepairError(
            'repair_undo_idempotency_conflict',
            'Undo idempotency key belongs to another request',
          );
        }
        return { ...structuredClone(secondReplay.result), idempotentReplay: true };
      }
      const currentStore = this.#databaseStore.snapshot();
      const currentIndex = this.#databaseRecordIndex.snapshot();
      if (
        currentStore.revision !== repair.receipt.after.manifestRevision ||
        currentIndex.revision !== repair.receipt.after.indexRevision
      ) {
        throw new DatabaseRepairError(
          'repair_undo_intervening_edit',
          'Undo refused because the database changed after repair',
        );
      }
      for (const file of repair.files) {
        let current: string;
        try {
          current = await readFile(resolve(this.#contentDir, file.path), 'utf8');
        } catch {
          throw new DatabaseRepairError(
            'repair_undo_intervening_edit',
            `Undo target "${file.path}" is unavailable`,
          );
        }
        if (sha256(current) !== sha256(file.after)) {
          throw new DatabaseRepairError(
            'repair_undo_intervening_edit',
            `Undo refused because "${file.path}" changed after repair`,
          );
        }
      }
      this.#transactionActive = true;
      const restoredFiles: (typeof repair.files)[number][] = [];
      const restoredDefinitions: (typeof repair.definitions)[number][] = [];
      try {
        for (const definition of repair.definitions) {
          await this.#databaseStore.update(definition.databaseId, definition.before);
          restoredDefinitions.push(definition);
        }
        for (const file of repair.files) {
          await atomicWriteFile(resolve(this.#contentDir, file.path), file.before, {
            fs: tracedAtomicFs,
            mode: file.mode,
          });
          restoredFiles.push(file);
        }
        await this.#refreshDatabaseIndex();
        const receipt: DatabaseRepairUndoReceipt = {
          version: 1,
          undoId: `repair_undo_result_${randomUUID().replaceAll('-', '')}`,
          repairId: input.repairId,
          planHash: input.planHash,
          principalId: input.principalId,
          undoneAt: this.#now().toISOString(),
          restoredPaths: repair.files.map((file) => file.path),
          restoredDatabaseIds: repair.definitions.map((definition) => definition.databaseId),
        };
        const result = { idempotentReplay: false, receipt };
        await this.#journal.persistRepairUndo({
          idempotencyKeyHash: idempotencyHash,
          requestFingerprint: fingerprint,
          result,
        });
        this.#undoIdempotency.set(idempotencyHash, {
          fingerprint,
          result: structuredClone(result),
        });
        this.#undoneRepairs.set(input.repairId, structuredClone(result));
        return result;
      } catch (error) {
        for (const file of [...restoredFiles].reverse()) {
          await atomicWriteFile(resolve(this.#contentDir, file.path), file.after, {
            fs: tracedAtomicFs,
            mode: file.mode,
          }).catch(() => undefined);
        }
        for (const definition of [...restoredDefinitions].reverse()) {
          await this.#databaseStore
            .update(definition.databaseId, definition.after)
            .catch(() => undefined);
        }
        await this.#refreshDatabaseIndex().catch(() => undefined);
        if (error instanceof DatabaseRepairError) throw error;
        throw new DatabaseRepairError(
          'repair_transaction_failed',
          'Repair undo failed and was rolled back',
          {},
          error,
        );
      } finally {
        this.#transactionActive = false;
      }
    });
  }

  async #refreshJournal(): Promise<void> {
    try {
      const snapshot = await this.#journal.load();
      for (const entry of snapshot.repairs) {
        const result = durableRepairResult(entry.result);
        this.#idempotency.set(entry.idempotencyKeyHash, {
          fingerprint: entry.requestFingerprint,
          result,
        });
        const undoFiles = entry.undoFiles;
        const canHydrateUndo =
          entry.undoToken !== undefined &&
          undoFiles?.every((file) => file.before !== null) === true &&
          result.receipt.undoToken === entry.undoToken;
        if (canHydrateUndo) {
          if (!undoFiles) throw new Error('repair journal undo files unexpectedly missing');
          const definitions: Array<{
            databaseId: string;
            before: DatabaseDefinition;
            after: DatabaseDefinition;
          }> = [];
          let definitionsValid = true;
          if (
            undoFiles.some(
              (file) => !isWithin(this.#contentDir, resolve(this.#contentDir, file.path)),
            )
          ) {
            definitionsValid = false;
          }
          for (const definition of entry.undoDefinitions ?? []) {
            const before = DatabaseDefinitionSchema.safeParse(definition.before);
            const after = DatabaseDefinitionSchema.safeParse(definition.after);
            if (!before.success || !after.success) {
              definitionsValid = false;
              break;
            }
            definitions.push({
              databaseId: definition.databaseId,
              before: before.data,
              after: after.data,
            });
          }
          if (!definitionsValid) continue;
          this.#repairRecords.set(result.receipt.repairId, {
            receipt: result.receipt,
            files: undoFiles.map((file) => ({
              ...file,
              before: file.before as string,
              mode: 0o644,
            })),
            definitions,
          });
        }
      }
      for (const entry of snapshot.repairUndos) {
        const result = durableRepairUndoResult(entry.result);
        this.#undoIdempotency.set(entry.idempotencyKeyHash, {
          fingerprint: entry.requestFingerprint,
          result: structuredClone(result),
        });
        this.#undoneRepairs.set(result.receipt.repairId, structuredClone(result));
      }
    } catch (error) {
      throw new DatabaseRepairError(
        'repair_unavailable',
        'Database repair journal is unavailable or corrupt',
        {},
        error,
      );
    }
  }
}

export function createDatabaseRepairEngine(
  options: CreateDatabaseRepairEngineOptions,
): DatabaseRepairEngine {
  return new DatabaseRepairEngine(options);
}
