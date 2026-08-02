import { createHash, randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  type DatabaseAutonomyDecision,
  type DatabaseAutonomyMode,
  type DatabaseAutonomyOperation,
  type DatabaseAutonomyScope,
  type DatabaseAutonomyUsage,
  type DatabaseRecordActor,
  DatabaseRecordActorSchema,
  type DatabaseRecordPageLayoutOverride,
  DatabaseRecordPageLayoutOverrideSchema,
  type DatabaseSource,
  type DatabaseTransactionFileDelta,
  type DatabaseTransactionReceipt,
  DatabaseTransactionReceiptSchema,
  type DatabaseUndoReceipt,
  DatabaseUndoReceiptSchema,
  evaluateDatabaseAutonomy,
  parseDatabaseRecordActorKey,
  parseFrontmatterYaml,
  stripFrontmatter,
  unwrapFrontmatterFences,
} from '@nedian0brien/synapsenote-core';
import { withFileLock } from '@nedian0brien/synapsenote-core/server';
import { Document } from 'yaml';
import { z } from 'zod';
import type { DatabaseAgentRunStore } from './database-agent-run-store.ts';
import {
  type DatabasePlanApprovalCode,
  DatabasePlanApprovalCodeSchema,
  type DatabasePlanArtifact,
  type DatabasePlanEngine,
} from './database-plan.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';
import { type DatabaseCommitOutcomeClass, recordDatabaseCommit } from './database-telemetry.ts';
import {
  createDatabaseTransactionJournal,
  type DatabaseTransactionJournal,
} from './database-transaction-journal.ts';
import { commitWip, type ShadowHandle, shadowGit, type WriterIdentity } from './shadow-repo.ts';
import { RUNTIME_VERSION } from './version-constants.ts';

export interface DatabaseCommitInput {
  planId: string;
  planHash: string;
  expectedSnapshotRevision: string;
  idempotencyKey: string;
  approvalToken?: string;
  /** Approval scopes acknowledged by the caller; exact plans may reject partial scopes. */
  approvalCodes?: readonly DatabasePlanApprovalCode[];
  /** Opaque server-issued capability binding this request to an autonomy session. */
  autonomySessionToken?: string;
  actor: {
    principalId: string;
    kind: 'human' | 'agent' | 'sync' | 'filesystem' | 'system';
    sessionId?: string;
  };
  assertions?: {
    databaseAbsent?: boolean;
    createdRecords?: number;
  };
}

export function databaseWriterIdentity(actor: DatabaseCommitInput['actor']): WriterIdentity {
  const writerHash = createHash('sha256').update(actor.principalId).digest('hex').slice(0, 16);
  if (actor.kind === 'filesystem') {
    return { id: 'file-system', name: 'File System', email: 'filesystem@local' };
  }
  if (actor.kind === 'sync') {
    return { id: 'git-upstream', name: 'Git (upstream)', email: 'upstream@local' };
  }
  if (actor.kind === 'system') {
    return {
      id: 'synapsenote-service',
      name: 'SynapseNote (service)',
      email: 'noreply@synapsenote.local',
    };
  }
  return {
    id: `${actor.kind === 'agent' ? 'agent' : 'principal'}-${writerHash}`,
    name: actor.principalId,
    email: `${writerHash}@database.synapsenote.local`,
  };
}

export function databaseTimelineDocumentNames(
  projectPaths: readonly string[],
  contentRelative: string,
): string[] {
  const prefix = contentRelative === '' ? '' : `${contentRelative}/`;
  return [
    ...new Set(
      projectPaths.flatMap((path) => {
        if (prefix && !path.startsWith(prefix)) return [];
        const relativePath = prefix ? path.slice(prefix.length) : path;
        const match = /^(.*)\.(md|mdx)$/.exec(relativePath);
        return match?.[1] ? [match[1]] : [];
      }),
    ),
  ].sort();
}

export function databaseTimelineCommitMessage(input: {
  actor: DatabaseCommitInput['actor'];
  summary: string;
  docs: readonly string[];
}): string {
  const writer = databaseWriterIdentity(input.actor);
  const summary = input.summary
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 2_000);
  const subject = `database: ${summary}`.slice(0, 240);
  return `${subject}\n\nok-contributors: ${JSON.stringify({
    v: 1,
    id: writer.id,
    name: writer.name,
    colorSeed: input.actor.principalId,
    docs: [...new Set(input.docs)].sort(),
    summaries: [summary],
  })}`;
}

const DatabaseCommitAuditToolSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._+/-]{0,127}$/),
    version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/),
  })
  .strict();

export const DatabaseCommitInputSchema = z
  .object({
    planId: z.string().startsWith('plan_'),
    planHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    expectedSnapshotRevision: z.union([
      z.string().regex(/^sha256:[a-f0-9]{64}$/),
      z.literal('sha256:empty'),
    ]),
    idempotencyKey: z.string().min(8).max(256),
    approvalToken: z.string().startsWith('approve:sha256:').optional(),
    approvalCodes: z.array(DatabasePlanApprovalCodeSchema).max(20).optional(),
    autonomySessionToken: z.string().startsWith('dbsession_').max(256).optional(),
    actor: z
      .object({
        principalId: z.string().min(1).max(256),
        kind: z.enum(['human', 'agent', 'sync', 'filesystem', 'system']),
        sessionId: z.string().min(1).max(256).optional(),
      })
      .strict(),
    assertions: z
      .object({
        databaseAbsent: z.boolean().optional(),
        createdRecords: z.number().int().nonnegative().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export interface DatabaseCommitResult {
  mutationId: string;
  planId: string;
  planHash: string;
  idempotentReplay: boolean;
  actualDiff: DatabaseTransactionReceipt['files'];
  verification: DatabaseTransactionReceipt['verification'];
  revisions: DatabaseTransactionReceipt['result'];
  auditReceipt: DatabaseTransactionReceipt;
  undoToken: string;
}

export interface DatabaseUndoInput {
  action: 'preview' | 'apply' | 'redo_preview' | 'redo_apply';
  undoToken: string;
  idempotencyKey?: string;
  actor?: DatabaseCommitInput['actor'];
}

export interface DatabaseUndoResult {
  action: DatabaseUndoInput['action'];
  undoId: string;
  mutationId: string;
  canApply: boolean;
  idempotentReplay: boolean;
  expectedSnapshotRevision: string;
  observedSnapshotRevision: string;
  conflicts: DatabaseUndoReceipt['conflicts'];
  receipt: DatabaseUndoReceipt | null;
}

export type DatabaseCommitErrorCode =
  | 'commit_unavailable'
  | 'agent_run_unavailable'
  | 'invalid_commit_request'
  | 'plan_hash_mismatch'
  | 'approval_required'
  | 'autonomy_policy_unavailable'
  | 'plan_not_committable'
  | 'snapshot_changed'
  | 'permission_changed'
  | 'query_snapshot_changed'
  | 'write_guard_unavailable'
  | 'assertion_failed'
  | 'target_changed'
  | 'transaction_failed'
  | 'rollback_failed'
  | 'idempotency_conflict'
  | 'undo_not_found'
  | 'undo_invalid_request';

const COMMIT_CONFLICT_CODES: ReadonlySet<DatabaseCommitErrorCode> = new Set([
  'plan_not_committable',
  'snapshot_changed',
  'permission_changed',
  'query_snapshot_changed',
  'target_changed',
  'idempotency_conflict',
]);
const COMMIT_ROLLBACK_CODES: ReadonlySet<DatabaseCommitErrorCode> = new Set([
  'transaction_failed',
  'rollback_failed',
]);

function classifyCommitOutcome(error: unknown): DatabaseCommitOutcomeClass {
  if (!(error instanceof DatabaseCommitError)) return 'failure';
  if (COMMIT_CONFLICT_CODES.has(error.code)) return 'conflict';
  if (COMMIT_ROLLBACK_CODES.has(error.code)) return 'rollback';
  return 'failure';
}

export class DatabaseCommitError extends Error {
  readonly code: DatabaseCommitErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseCommitErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'DatabaseCommitError';
    this.code = code;
    this.details = details;
  }
}

interface CommitFs {
  lstat(path: string): Promise<Stats>;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  rm(path: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
}

const DEFAULT_FS: CommitFs = {
  lstat,
  mkdir: async (path) => {
    await mkdir(path, { recursive: true });
  },
  writeFile: async (path, content) => {
    await writeFile(path, content, { encoding: 'utf8', flag: 'wx' });
  },
  rename,
  unlink,
  rm: async (path) => {
    await rm(path, { recursive: true, force: true });
  },
  readFile,
};

interface CommitGit {
  snapshot(writer: WriterIdentity, message: string): Promise<string>;
  hashBlob(path: string): Promise<string>;
}

export interface DatabaseCommitAutonomyPolicy {
  databaseMode?: DatabaseAutonomyMode;
  sessionMode?: DatabaseAutonomyMode;
  delegation?: DatabaseAutonomyScope;
  usage?: DatabaseAutonomyUsage;
  revision: string;
}

export type ResolveDatabaseCommitAutonomyPolicy = (input: {
  databaseId: string;
  sessionId: string | undefined;
  sessionToken: string | undefined;
  principalId: string;
}) => DatabaseCommitAutonomyPolicy | Promise<DatabaseCommitAutonomyPolicy>;

export type ConsumeDatabaseCommitAutonomyBudget = (input: {
  databaseId: string;
  sessionId: string;
  sessionToken: string;
  expectedRevision: string;
  requestId: string;
  operations: readonly DatabaseAutonomyOperation[];
}) => Promise<unknown>;

export interface CreateDatabaseCommitEngineOptions {
  projectDir: string;
  contentDir: string;
  /**
   * Permit a deliberately isolated single-file session to write back to the
   * user's content directory while keeping transaction journals and locks
   * under its throwaway project root. Normal project servers must leave this
   * disabled.
   */
  allowExternalContentDir?: boolean;
  databaseStore: DatabaseStore;
  databaseRecordIndex: DatabaseRecordIndex;
  /** Server lifecycle seam that serializes rebuilds with concurrent watcher events. */
  refreshDatabaseIndex?: () => Promise<unknown>;
  databasePlanEngine: DatabasePlanEngine;
  getShadow?: () => ShadowHandle | null;
  branch?: () => string;
  now?: () => Date;
  generateUuid?: () => string;
  fs?: Partial<CommitFs>;
  git?: CommitGit;
  journal?: DatabaseTransactionJournal;
  resolveAutonomyPolicy?: ResolveDatabaseCommitAutonomyPolicy;
  consumeAutonomyBudget?: ConsumeDatabaseCommitAutonomyBudget;
  agentRunStore?: DatabaseAgentRunStore;
  auditTool?: { name: string; version: string };
}

interface CommitTarget {
  projectPath: string;
  absolutePath: string;
  content: string | null;
  beforeContent: string | null;
  operation: 'create' | 'update' | 'delete';
}

interface UndoEntry {
  tokenId: string;
  receipt: DatabaseTransactionReceipt;
  beforeFiles: ReadonlyMap<string, string | null>;
  afterFiles: ReadonlyMap<string, string | null>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function durableCommitResult(value: unknown, undoToken: string): DatabaseCommitResult {
  if (!value || typeof value !== 'object') throw new Error('Commit result must be an object');
  const result = value as Partial<DatabaseCommitResult>;
  const receipt = DatabaseTransactionReceiptSchema.parse(result.auditReceipt);
  if (
    result.mutationId !== receipt.mutationId ||
    result.planId !== receipt.planId ||
    result.planHash !== receipt.planHash ||
    result.undoToken !== undoToken ||
    !undoToken.startsWith(`${receipt.undo.tokenId}.`) ||
    typeof result.idempotentReplay !== 'boolean' ||
    !Array.isArray(result.actualDiff) ||
    !result.verification ||
    !result.revisions
  ) {
    throw new Error('Commit journal result does not match its receipt');
  }
  return clone(result as DatabaseCommitResult);
}

function durableUndoResult(value: unknown): DatabaseUndoResult {
  if (!value || typeof value !== 'object') throw new Error('Undo result must be an object');
  const result = value as Partial<DatabaseUndoResult>;
  const receipt = result.receipt === null ? null : DatabaseUndoReceiptSchema.parse(result.receipt);
  if (
    !['preview', 'apply', 'redo_preview', 'redo_apply'].includes(result.action as string) ||
    typeof result.undoId !== 'string' ||
    typeof result.mutationId !== 'string' ||
    typeof result.canApply !== 'boolean' ||
    typeof result.idempotentReplay !== 'boolean' ||
    typeof result.expectedSnapshotRevision !== 'string' ||
    typeof result.observedSnapshotRevision !== 'string' ||
    !Array.isArray(result.conflicts) ||
    (receipt && (receipt.undoId !== result.undoId || receipt.mutationId !== result.mutationId))
  ) {
    throw new Error('Undo journal result does not match its receipt');
  }
  return clone({ ...result, receipt } as DatabaseUndoResult);
}

function compactUuid(generateUuid: () => string): string {
  return generateUuid().replaceAll('-', '');
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function requiredApprovalCodes(plan: DatabasePlanArtifact): DatabasePlanApprovalCode[] {
  return [
    ...new Set(
      plan.approvals.filter((approval) => approval.required).map((approval) => approval.code),
    ),
  ].sort();
}

function assertApprovalSelection(
  plan: DatabasePlanArtifact,
  selectedCodes: readonly DatabasePlanApprovalCode[] | undefined,
): void {
  if (selectedCodes === undefined) return;
  const required = requiredApprovalCodes(plan);
  const selected = [...new Set(selectedCodes)].sort();
  if (selected.length !== selectedCodes.length || stable(selected) !== stable(required)) {
    throw new DatabaseCommitError(
      'approval_required',
      'This exact plan is one atomic change group; approve every required scope together',
      {
        atomic: true,
        atomicGroup: { id: plan.id, approvalCodes: required },
        requiredApprovalCodes: required,
        selectedApprovalCodes: selected,
      },
    );
  }
}

function isWithin(base: string, candidate: string): boolean {
  const rel = relative(base, candidate);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function errno(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function storedValue(
  property:
    | NonNullable<DatabasePlanArtifact['diff']['records'][number]['after']>['values'][string]
    | undefined,
  definitionProperty: ReturnType<
    DatabasePlanEngine['getDraft']
  >['normalized']['definition']['sources'][number]['properties'][number],
  people: ReturnType<DatabasePlanEngine['getDraft']>['normalized']['definition']['people'],
): unknown {
  if (property === undefined) return undefined;
  if (definitionProperty.type === 'select' || definitionProperty.type === 'status') {
    return definitionProperty.options.find((option) => option.id === property)?.key ?? property;
  }
  if (definitionProperty.type === 'multi_select' && Array.isArray(property)) {
    return property.map(
      (entry) => definitionProperty.options.find((option) => option.id === entry)?.key ?? entry,
    );
  }
  if (definitionProperty.type === 'person' && Array.isArray(property)) {
    return property.map((entry) => people.find((person) => person.id === entry)?.key ?? entry);
  }
  return property;
}

function recordMarkdown(
  definition: ReturnType<DatabasePlanEngine['getDraft']>['normalized']['definition'],
  source: ReturnType<DatabasePlanEngine['getDraft']>['normalized']['definition']['sources'][number],
  record: ReturnType<DatabasePlanEngine['getDraft']>['normalized']['sampleRecords'][number],
  previous?: { markdown: string; source: DatabaseSource },
  editedAt = new Date().toISOString(),
  editedBy: DatabaseRecordActor = { kind: 'system', principal_id: 'unknown' },
): string {
  let previousArchivedAt: string | null = null;
  let previousCreatedAt: string | null = null;
  let previousCreatedBy: DatabaseRecordActor | null = null;
  let previousPageLayoutOverride: DatabaseRecordPageLayoutOverride | null = null;
  const document = previous
    ? (() => {
        const { frontmatter } = stripFrontmatter(previous.markdown);
        const parsed = parseFrontmatterYaml(unwrapFrontmatterFences(frontmatter));
        if (parsed.map === null) throw new Error('Existing record frontmatter is malformed');
        const metadata = parsed.map._sn;
        if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
          if (typeof metadata.archived_at === 'string') previousArchivedAt = metadata.archived_at;
          if (typeof metadata.created_at === 'string') previousCreatedAt = metadata.created_at;
          const createdBy = DatabaseRecordActorSchema.safeParse(metadata.created_by);
          if (createdBy.success) previousCreatedBy = createdBy.data;
          const pageLayoutOverride = DatabaseRecordPageLayoutOverrideSchema.safeParse(
            metadata.page_layout_override,
          );
          if (pageLayoutOverride.success) previousPageLayoutOverride = pageLayoutOverride.data;
        }
        return parsed.doc;
      })()
    : new Document({});
  const archivedAt =
    record.archivedAt === undefined ? previousArchivedAt : (record.archivedAt ?? null);
  const pageLayoutOverride =
    record.pageLayoutOverride === undefined
      ? previousPageLayoutOverride
      : (record.pageLayoutOverride ?? null);
  const createdTimeProperty = source.properties.find(
    (property) => property.type === 'created_time',
  );
  const derivedCreatedAt = createdTimeProperty ? record.values[createdTimeProperty.id] : undefined;
  const createdByProperty = source.properties.find((property) => property.type === 'created_by');
  const derivedCreatedBy = createdByProperty ? record.values[createdByProperty.id] : undefined;
  const createdBy =
    previousCreatedBy ??
    (previous && typeof derivedCreatedBy === 'string'
      ? (parseDatabaseRecordActorKey(derivedCreatedBy) ?? editedBy)
      : editedBy);
  const storedProperties = new Map<string, unknown>();
  for (const property of source.properties) {
    if (
      property.type === 'created_time' ||
      property.type === 'last_edited_time' ||
      property.type === 'created_by' ||
      property.type === 'last_edited_by' ||
      property.type === 'button'
    ) {
      continue;
    }
    const value = storedValue(record.values[property.id], property, definition.people);
    if (value !== undefined) storedProperties.set(property.key, value);
  }
  for (const property of previous?.source.properties ?? []) {
    if (!storedProperties.has(property.key)) document.delete(property.key);
  }
  document.set('_sn', {
    database_id: definition.id,
    source_id: source.id,
    record_id: record.id,
    created_at:
      previousCreatedAt ??
      (previous &&
      typeof derivedCreatedAt === 'string' &&
      Number.isFinite(Date.parse(derivedCreatedAt))
        ? derivedCreatedAt
        : editedAt),
    last_edited_at: editedAt,
    created_by: structuredClone(createdBy),
    last_edited_by: structuredClone(editedBy),
    ...(archivedAt ? { archived_at: archivedAt } : {}),
    ...(pageLayoutOverride ? { page_layout_override: structuredClone(pageLayoutOverride) } : {}),
  });
  for (const [key, value] of storedProperties) document.set(key, value);
  const yaml = document.toString({ lineWidth: 0 });
  return `---\n${yaml}---\n${record.body}`;
}

function autonomyRequests(plan: DatabasePlanArtifact): readonly DatabaseAutonomyOperation[] {
  const requests: DatabaseAutonomyOperation[] = [];
  const database = plan.normalizedOperations.find(
    (operation) => operation.kind === 'ensure_database',
  );
  if (database?.action === 'create') {
    requests.push({
      action: 'create_database',
      recordCount: 0,
      propertyIds: plan.affectedObjects.propertyIds,
      reversible: true,
    });
  }
  if (database?.action === 'delete') {
    requests.push({
      action: 'delete_database',
      recordCount: plan.diff.records.filter((record) => record.action === 'delete').length,
      propertyIds: plan.affectedObjects.propertyIds,
      touchesBody: true,
      reversible: true,
      destructive: true,
    });
  }
  if (
    plan.normalizedOperations.some(
      (operation) => operation.kind === 'alter_schema' && operation.action === 'update',
    )
  ) {
    const propertyIds = plan.normalizedOperations.flatMap((operation) =>
      (operation.kind === 'ensure_property' || operation.kind === 'ensure_relation') &&
      operation.action !== 'noop'
        ? [operation.propertyId]
        : [],
    );
    requests.push({ action: 'alter_schema', recordCount: 0, propertyIds, reversible: true });
  }
  const created = plan.diff.records.filter((record) => record.action === 'create').length;
  const updated = plan.diff.records.filter((record) => record.action === 'update').length;
  const moved = plan.diff.records.filter((record) => record.action === 'move').length;
  const deleted = plan.diff.records.filter((record) => record.action === 'delete').length;
  const changedRecordIds = new Set(plan.diff.records.map((record) => record.recordId));
  const propertyIds = plan.normalizedOperations.flatMap((operation) =>
    operation.kind === 'mutate_record' && changedRecordIds.has(operation.recordId)
      ? operation.operations.flatMap((mutation) =>
          mutation.propertyId === null ? [] : [mutation.propertyId],
        )
      : [],
  );
  const touchesBody = plan.normalizedOperations.some(
    (operation) =>
      operation.kind === 'mutate_record' &&
      changedRecordIds.has(operation.recordId) &&
      operation.operations.some(
        (mutation) => mutation.kind === 'append' && mutation.propertyId === null,
      ),
  );
  if (created > 0) {
    requests.push({
      action: 'create_record',
      recordCount: created,
      propertyIds: plan.affectedObjects.propertyIds,
      touchesBody: true,
      reversible: true,
    });
  }
  if (updated + moved > 0) {
    const changed = updated + moved;
    requests.push({
      action: changed === 1 ? 'update_record' : 'bulk_update',
      recordCount: changed,
      propertyIds: propertyIds.length > 0 ? propertyIds : plan.affectedObjects.propertyIds,
      touchesBody: touchesBody || moved > 0,
      reversible: true,
    });
  }
  if (deleted > 0) {
    requests.push({
      action: 'delete_record',
      recordCount: deleted,
      propertyIds: [],
      reversible: true,
    });
  }
  return requests;
}

function auditIntentSummary(plan: DatabasePlanArtifact): string {
  const operationKinds = [
    ...new Set(
      plan.normalizedOperations
        .filter((operation) => !('action' in operation) || operation.action !== 'noop')
        .map((operation) => operation.kind),
    ),
  ].sort();
  const databaseCount = new Set(plan.affectedObjects.databaseIds).size;
  const sourceCount = new Set(plan.affectedObjects.sourceIds).size;
  return `Apply reviewed ${operationKinds.join(', ')} plan across ${databaseCount} database(s) and ${sourceCount} data source(s), changing ${plan.diff.manifests.length} manifest(s) and ${plan.diff.records.length} record file(s).`;
}

export class DatabaseCommitEngine {
  readonly #projectDir: string;
  readonly #contentDir: string;
  readonly #allowExternalContentDir: boolean;
  readonly #databaseStore: DatabaseStore;
  readonly #databaseRecordIndex: DatabaseRecordIndex;
  readonly #refreshDatabaseIndex: () => Promise<unknown>;
  readonly #databasePlanEngine: DatabasePlanEngine;
  readonly #getShadow: () => ShadowHandle | null;
  readonly #branch: () => string;
  readonly #now: () => Date;
  readonly #generateUuid: () => string;
  readonly #fs: CommitFs;
  readonly #gitOverride?: CommitGit;
  readonly #journal: DatabaseTransactionJournal;
  readonly #resolveAutonomyPolicy?: ResolveDatabaseCommitAutonomyPolicy;
  readonly #consumeAutonomyBudget?: ConsumeDatabaseCommitAutonomyBudget;
  readonly #agentRunStore?: DatabaseAgentRunStore;
  readonly #auditTool: { name: string; version: string };
  readonly #idempotency = new Map<string, { fingerprint: string; result: DatabaseCommitResult }>();
  readonly #undoEntries = new Map<string, UndoEntry>();
  readonly #undoIdempotency = new Map<
    string,
    { fingerprint: string; result: DatabaseUndoResult }
  >();
  #transactionActive = false;

  constructor(options: CreateDatabaseCommitEngineOptions) {
    this.#projectDir = resolve(options.projectDir);
    this.#contentDir = resolve(options.contentDir);
    this.#allowExternalContentDir = options.allowExternalContentDir ?? false;
    if (!isWithin(this.#projectDir, this.#contentDir) && !this.#allowExternalContentDir) {
      throw new Error('Database commit contentDir must be inside projectDir');
    }
    this.#databaseStore = options.databaseStore;
    this.#databaseRecordIndex = options.databaseRecordIndex;
    this.#refreshDatabaseIndex =
      options.refreshDatabaseIndex ?? (() => this.#databaseRecordIndex.rebuild());
    this.#databasePlanEngine = options.databasePlanEngine;
    this.#getShadow = options.getShadow ?? (() => null);
    this.#branch = options.branch ?? (() => 'main');
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
    this.#fs = { ...DEFAULT_FS, ...options.fs };
    this.#gitOverride = options.git;
    this.#journal = options.journal ?? createDatabaseTransactionJournal(this.#projectDir);
    this.#resolveAutonomyPolicy = options.resolveAutonomyPolicy;
    this.#consumeAutonomyBudget = options.consumeAutonomyBudget;
    this.#agentRunStore = options.agentRunStore;
    this.#auditTool = DatabaseCommitAuditToolSchema.parse(
      options.auditTool ?? {
        name: 'synapsenote-server/database-commit',
        version: RUNTIME_VERSION,
      },
    );
  }

  expectedApprovalToken(planHash: string): string {
    return `approve:${planHash}`;
  }

  isTransactionActive(): boolean {
    return this.#transactionActive;
  }

  /**
   * Recovers the durable result of an exact idempotent commit without
   * re-planning it. Durable task executors use this after a process crash so
   * an already-committed internal phase is never applied twice.
   */
  async getIdempotentResult(idempotencyKey: string): Promise<DatabaseCommitResult | null> {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 256) return null;
    await this.#refreshJournal();
    const entry = this.#idempotency.get(sha256(idempotencyKey));
    return entry ? { ...clone(entry.result), idempotentReplay: true } : null;
  }

  async commit(input: DatabaseCommitInput): Promise<DatabaseCommitResult> {
    const startedAt = performance.now();
    try {
      const result = await this.#commitUninstrumented(input);
      recordDatabaseCommit('success', performance.now() - startedAt);
      return result;
    } catch (error) {
      recordDatabaseCommit(classifyCommitOutcome(error), performance.now() - startedAt);
      throw error;
    }
  }

  async #commitUninstrumented(input: DatabaseCommitInput): Promise<DatabaseCommitResult> {
    if (
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 256 ||
      input.actor.principalId.trim() === ''
    ) {
      throw new DatabaseCommitError(
        'invalid_commit_request',
        'Commit requires an 8-256 character idempotency key and an actor principal',
      );
    }
    await this.#refreshJournal();
    const idempotencyKeyHash = sha256(input.idempotencyKey);
    const requestFingerprint = sha256(
      stable({
        planId: input.planId,
        planHash: input.planHash,
        expectedSnapshotRevision: input.expectedSnapshotRevision,
        actor: input.actor,
        approvalCodes: input.approvalCodes ?? null,
        assertions: input.assertions ?? {},
      }),
    );
    const replay = this.#idempotency.get(idempotencyKeyHash);
    if (replay) {
      if (replay.fingerprint !== requestFingerprint) {
        throw new DatabaseCommitError(
          'idempotency_conflict',
          'Idempotency key was already used for a different database commit request',
          { idempotencyKeyHash },
        );
      }
      return { ...clone(replay.result), idempotentReplay: true };
    }
    const lockPath = resolve(this.#projectDir, '.ok', 'databases', '.commit.lock');
    await this.#fs.mkdir(resolve(lockPath, '..'));
    return withFileLock(lockPath, async () => {
      await this.#refreshJournal();
      const secondReplay = this.#idempotency.get(idempotencyKeyHash);
      if (secondReplay) {
        if (secondReplay.fingerprint !== requestFingerprint) {
          throw new DatabaseCommitError('idempotency_conflict', 'Idempotency key conflict', {
            idempotencyKeyHash,
          });
        }
        return { ...clone(secondReplay.result), idempotentReplay: true };
      }
      let agentRunId: string | undefined;
      try {
        const plan = this.#databasePlanEngine.getPlan(input.planId);
        const draft = this.#databasePlanEngine.getDraft(plan.draftId);
        if (input.actor.kind === 'agent' && this.#agentRunStore) {
          try {
            await this.#agentRunStore.persistPlanBundle(plan, draft);
          } catch (error) {
            throw new DatabaseCommitError(
              'agent_run_unavailable',
              'Agent Run recovery state is unavailable; the database commit was not started',
              { phase: 'plan_persistence' },
              error,
            );
          }
          try {
            agentRunId = (await this.#agentRunStore.propose(plan, input.actor)).id;
          } catch (error) {
            throw new DatabaseCommitError(
              'agent_run_unavailable',
              'Agent run history is unavailable; the database commit was not started',
              { phase: 'proposal' },
              error,
            );
          }
        }
        if (plan.hash !== input.planHash) {
          throw new DatabaseCommitError('plan_hash_mismatch', 'Commit plan hash does not match', {
            expectedPlanHash: plan.hash,
            providedPlanHash: input.planHash,
          });
        }
        assertApprovalSelection(plan, input.approvalCodes);
        if (
          input.approvalToken !== undefined &&
          input.approvalToken !== this.expectedApprovalToken(plan.hash)
        ) {
          throw new DatabaseCommitError(
            'approval_required',
            'Commit approval token does not bind to the exact plan hash',
            { expectedTokenFormat: 'approve:<planHash>', planHash: plan.hash },
          );
        }
        if (input.approvalToken === undefined) {
          await this.#authorizeWithoutApproval(plan, input, idempotencyKeyHash);
        }
        if (!plan.committable) {
          throw new DatabaseCommitError('plan_not_committable', 'Plan has unresolved conflicts', {
            conflicts: plan.conflicts,
          });
        }
        const current = this.#databaseStore.snapshot();
        if (
          current.revision !== input.expectedSnapshotRevision ||
          current.revision !== plan.snapshotRevision
        ) {
          throw new DatabaseCommitError(
            'snapshot_changed',
            'Database snapshot changed after planning',
            {
              planSnapshotRevision: plan.snapshotRevision,
              expectedSnapshotRevision: input.expectedSnapshotRevision,
              observedSnapshotRevision: current.revision,
            },
          );
        }
        let observedWriteGuards: DatabasePlanArtifact['writeGuards'];
        try {
          observedWriteGuards = this.#databasePlanEngine.captureWriteGuards(
            plan.draftId,
            plan.immutableTargetSet,
          );
        } catch (error) {
          throw new DatabaseCommitError(
            'write_guard_unavailable',
            'Current write concurrency guards could not be resolved safely',
            { reason: error instanceof Error ? error.message : String(error) },
            error,
          );
        }
        if (stable(observedWriteGuards.permissions) !== stable(plan.writeGuards.permissions)) {
          throw new DatabaseCommitError(
            'permission_changed',
            'Effective write permission changed after planning',
            {
              expected: plan.writeGuards.permissions,
              observed: observedWriteGuards.permissions,
            },
          );
        }
        if (
          stable(observedWriteGuards.querySnapshots) !== stable(plan.writeGuards.querySnapshots)
        ) {
          throw new DatabaseCommitError(
            'query_snapshot_changed',
            'A query snapshot used to select write targets changed after planning',
            {
              expected: plan.writeGuards.querySnapshots,
              observed: observedWriteGuards.querySnapshots,
            },
          );
        }
        const verificationActor = draft.normalized.verificationChange?.actor;
        if (
          verificationActor &&
          (verificationActor.kind !== input.actor.kind ||
            verificationActor.principal_id !== input.actor.principalId)
        ) {
          throw new DatabaseCommitError(
            'approval_required',
            'Verification must be committed by the same authenticated actor shown in review',
            {
              reviewedActor: verificationActor,
              commitActor: { kind: input.actor.kind, principal_id: input.actor.principalId },
            },
          );
        }
        const databaseOperation = plan.normalizedOperations.find(
          (operation) => operation.kind === 'ensure_database',
        );
        if (
          input.assertions?.databaseAbsent === true ||
          (input.assertions?.databaseAbsent !== false && databaseOperation?.action === 'create')
        ) {
          const existing = current.databases.find(
            (database) =>
              database.id === draft.normalized.definition.id ||
              database.key === draft.normalized.definition.key,
          );
          if (existing) {
            throw new DatabaseCommitError('assertion_failed', 'Database must remain absent', {
              existingDatabaseId: existing.id,
            });
          }
        }
        if (!plan.requiresCommit) {
          throw new DatabaseCommitError(
            'plan_not_committable',
            'Desired database state is already converged and requires no commit',
            { planId: plan.id, converged: true },
          );
        }
        if (
          input.assertions?.createdRecords !== undefined &&
          input.assertions.createdRecords !== draft.normalized.sampleRecords.length
        ) {
          throw new DatabaseCommitError('assertion_failed', 'createdRecords assertion failed', {
            expected: input.assertions.createdRecords,
            planned: draft.normalized.sampleRecords.length,
          });
        }
        // The read barrier opens at the first canonical write, not here.
        // `#execute` raises it immediately before the rename loop; everything
        // before that point — assertions, the base checkpoint snapshot, and
        // staging writes into a private directory — leaves the canonical tree
        // untouched, so a concurrent read sees the same committed state it
        // would have seen a moment earlier. The `finally` still clears the flag
        // on every path, including a failure before it was ever raised.
        try {
          if (agentRunId) {
            try {
              await this.#agentRunStore?.markExecuting(agentRunId);
            } catch (error) {
              throw new DatabaseCommitError(
                'agent_run_unavailable',
                'Agent run execution state could not be persisted; the database commit was not started',
                { phase: 'execution_start', agentRunId },
                error,
              );
            }
          }
          const result = await this.#execute({
            input,
            plan,
            idempotencyKeyHash,
            requestFingerprint,
            draft,
          });
          if (agentRunId) {
            await this.#agentRunStore?.markSucceeded(agentRunId, result).catch(() => undefined);
          }
          return result;
        } finally {
          this.#transactionActive = false;
        }
      } catch (error) {
        if (
          agentRunId &&
          !(error instanceof DatabaseCommitError && error.code === 'approval_required')
        ) {
          await this.#agentRunStore
            ?.markFailed(agentRunId, {
              code: error instanceof DatabaseCommitError ? error.code : 'transaction_failed',
              message:
                error instanceof DatabaseCommitError
                  ? error.message
                  : 'Database transaction failed before verification',
            })
            .catch(() => undefined);
        }
        throw error;
      }
    });
  }

  async #authorizeWithoutApproval(
    plan: DatabasePlanArtifact,
    input: DatabaseCommitInput,
    requestId: string,
  ): Promise<void> {
    if (input.actor.kind !== 'agent') {
      throw new DatabaseCommitError(
        'approval_required',
        'Only an agent acting within trusted autonomy policy may commit without exact approval',
        { reasons: ['non_agent_actor'] },
      );
    }
    const databaseId = plan.affectedObjects.databaseIds[0];
    if (!databaseId || plan.affectedObjects.databaseIds.length !== 1) {
      throw new DatabaseCommitError(
        'autonomy_policy_unavailable',
        'Autonomy policy requires one exact database scope',
        { databaseIds: plan.affectedObjects.databaseIds },
      );
    }
    let policy: DatabaseCommitAutonomyPolicy;
    try {
      policy = this.#resolveAutonomyPolicy
        ? await this.#resolveAutonomyPolicy({
            databaseId,
            sessionId: input.actor.sessionId,
            sessionToken: input.autonomySessionToken,
            principalId: input.actor.principalId,
          })
        : { revision: 'sha256:unconfigured' };
    } catch (error) {
      throw new DatabaseCommitError(
        'autonomy_policy_unavailable',
        'Current database autonomy policy could not be resolved safely',
        {},
        error,
      );
    }
    const operations = autonomyRequests(plan);
    const decisions: DatabaseAutonomyDecision[] = [];
    let usage = policy.usage ?? { records: 0, actions: 0, egressBytes: 0 };
    for (const request of operations) {
      const decision = evaluateDatabaseAutonomy({
        ...request,
        databaseId,
        databaseMode: policy.databaseMode,
        sessionMode: policy.sessionMode,
        delegation: policy.delegation,
        usage,
        now: this.#now(),
      });
      decisions.push(decision);
      if (decision.decision === 'allow') {
        usage = {
          records: usage.records + request.recordCount,
          actions: usage.actions + 1,
          egressBytes: usage.egressBytes + (request.externalEgressBytes ?? 0),
        };
      }
    }
    const denied = decisions.filter((decision) => decision.decision === 'require_approval');
    if (decisions.length === 0 || denied.length > 0) {
      throw new DatabaseCommitError(
        'approval_required',
        'Current autonomy policy requires exact user approval for this database plan',
        {
          policyRevision: policy.revision,
          decisions: denied.length > 0 ? denied : decisions,
        },
      );
    }
    if (!input.actor.sessionId || !input.autonomySessionToken || !this.#consumeAutonomyBudget) {
      throw new DatabaseCommitError(
        'autonomy_policy_unavailable',
        'Automatic commit budget enforcement is unavailable for this session',
      );
    }
    try {
      await this.#consumeAutonomyBudget({
        databaseId,
        sessionId: input.actor.sessionId,
        sessionToken: input.autonomySessionToken,
        expectedRevision: policy.revision,
        requestId,
        operations,
      });
    } catch (error) {
      throw new DatabaseCommitError(
        'approval_required',
        'Current autonomy delegation could not reserve the required budget',
        {},
        error,
      );
    }
  }

  async undo(input: DatabaseUndoInput): Promise<DatabaseUndoResult> {
    if (!input.undoToken.startsWith('undo_') || !input.undoToken.includes('.')) {
      throw new DatabaseCommitError('undo_invalid_request', 'Undo token is malformed');
    }
    await this.#refreshJournal();
    const entry = this.#undoEntries.get(sha256(input.undoToken));
    if (!entry) {
      throw new DatabaseCommitError(
        'undo_not_found',
        'Undo token is unknown, expired, or already belongs to another server process',
      );
    }
    const isRedo = input.action === 'redo_preview' || input.action === 'redo_apply';
    if (isRedo && entry.afterFiles.size !== entry.receipt.files.length) {
      throw new DatabaseCommitError(
        'undo_not_found',
        'Redo content is unavailable for this transaction journal entry',
      );
    }
    if (input.action === 'preview' || input.action === 'redo_preview') {
      const inspection = isRedo
        ? await this.#inspectRedo(entry)
        : await this.#inspectUndo(entry.receipt);
      return {
        action: input.action,
        undoId: entry.tokenId,
        mutationId: entry.receipt.mutationId,
        canApply: inspection.conflicts.length === 0,
        idempotentReplay: false,
        expectedSnapshotRevision: isRedo
          ? entry.receipt.base.snapshotRevision
          : entry.receipt.undo.expectedSnapshotRevision,
        observedSnapshotRevision: inspection.observedSnapshotRevision,
        conflicts: inspection.conflicts,
        receipt: null,
      };
    }
    if (
      !input.idempotencyKey ||
      input.idempotencyKey.length < 8 ||
      input.idempotencyKey.length > 256 ||
      !input.actor ||
      input.actor.principalId.trim() === ''
    ) {
      throw new DatabaseCommitError(
        'undo_invalid_request',
        'Applying undo requires an 8-256 character idempotency key and an actor principal',
      );
    }
    const applyInput = { ...input, actor: input.actor };
    const idempotencyKeyHash = sha256(input.idempotencyKey);
    const fingerprint = sha256(
      stable({
        action: input.action,
        tokenHash: sha256(input.undoToken),
        actor: applyInput.actor,
      }),
    );
    const replay = this.#undoIdempotency.get(idempotencyKeyHash);
    if (replay) {
      if (replay.fingerprint !== fingerprint) {
        throw new DatabaseCommitError(
          'idempotency_conflict',
          'Idempotency key was already used for a different database undo request',
          { idempotencyKeyHash },
        );
      }
      return { ...clone(replay.result), idempotentReplay: true };
    }
    const lockPath = resolve(this.#projectDir, '.ok', 'databases', '.commit.lock');
    await this.#fs.mkdir(resolve(lockPath, '..'));
    return withFileLock(lockPath, async () => {
      await this.#refreshJournal();
      const secondReplay = this.#undoIdempotency.get(idempotencyKeyHash);
      if (secondReplay) {
        if (secondReplay.fingerprint !== fingerprint) {
          throw new DatabaseCommitError('idempotency_conflict', 'Idempotency key conflict', {
            idempotencyKeyHash,
          });
        }
        return { ...clone(secondReplay.result), idempotentReplay: true };
      }
      const inspection = isRedo
        ? await this.#inspectRedo(entry)
        : await this.#inspectUndo(entry.receipt);
      if (inspection.conflicts.length > 0) {
        const refused = DatabaseUndoReceiptSchema.parse({
          version: 1,
          undoId: entry.tokenId,
          mutationId: entry.receipt.mutationId,
          checkedAt: this.#now().toISOString(),
          status: 'refused',
          expectedSnapshotRevision: isRedo
            ? entry.receipt.base.snapshotRevision
            : entry.receipt.undo.expectedSnapshotRevision,
          observedSnapshotRevision: inspection.observedSnapshotRevision,
          conflicts: inspection.conflicts,
        });
        const result: DatabaseUndoResult = {
          action: input.action,
          undoId: entry.tokenId,
          mutationId: entry.receipt.mutationId,
          canApply: false,
          idempotentReplay: false,
          expectedSnapshotRevision: isRedo
            ? entry.receipt.base.snapshotRevision
            : entry.receipt.undo.expectedSnapshotRevision,
          observedSnapshotRevision: inspection.observedSnapshotRevision,
          conflicts: refused.conflicts,
          receipt: refused,
        };
        await this.#journal.persistUndo({
          idempotencyKeyHash,
          requestFingerprint: fingerprint,
          result,
        });
        this.#undoIdempotency.set(idempotencyKeyHash, { fingerprint, result: clone(result) });
        return result;
      }
      this.#transactionActive = true;
      try {
        return isRedo
          ? await this.#applyRedo({
              entry,
              input: applyInput as DatabaseUndoInput & {
                action: 'redo_apply';
                actor: DatabaseCommitInput['actor'];
              },
              idempotencyKeyHash,
              fingerprint,
              inspection,
            })
          : await this.#applyUndo({
              entry,
              input: applyInput as DatabaseUndoInput & {
                action: 'apply';
                actor: DatabaseCommitInput['actor'];
              },
              idempotencyKeyHash,
              fingerprint,
              inspection,
            });
      } finally {
        this.#transactionActive = false;
      }
    });
  }

  /**
   * Content-relative record path for a committed file, or null when the write
   * is not a Markdown record under the content directory.
   */
  #committedRecordPath(absolutePath: string): string | null {
    const relativePath = relative(this.#contentDir, absolutePath).split(sep).join('/');
    if (relativePath === '' || relativePath === '..' || relativePath.startsWith('../')) return null;
    if (isAbsolute(relativePath)) return null;
    if (!relativePath.endsWith('.md') && !relativePath.endsWith('.mdx')) return null;
    return relativePath;
  }

  /**
   * Reflects a committed write in the record index before postconditions run.
   *
   * A full rebuild re-reads every record file under every source folder — the
   * lifecycle benchmark measures ~3.2s at a thousand records against ~3ms for
   * the incremental path — and it runs inside the transaction window, where
   * `#assertReadable` refuses every read. Paying that for an ordinary row add
   * is what makes the whole surface go inert after each edit.
   *
   * Only a manifest write needs the rebuild. The index advances its manifest
   * watermark solely inside `rebuild()`, and reads are refused while that
   * watermark trails the store; a record-only commit leaves the manifest bytes
   * untouched, so the store revision is unchanged and the watermark still
   * matches. Anything that is not a Markdown record under the content
   * directory therefore falls back to the full refresh.
   */
  async #reflectCommittedTargets(targets: readonly CommitTarget[]): Promise<void> {
    const recordChanges: { recordPath: string; operation: CommitTarget['operation'] }[] = [];
    for (const target of targets) {
      const recordPath = this.#committedRecordPath(target.absolutePath);
      if (recordPath === null) {
        await this.#refreshDatabaseIndex();
        return;
      }
      recordChanges.push({ recordPath, operation: target.operation });
    }
    for (const change of recordChanges) {
      if (change.operation === 'delete') {
        this.#databaseRecordIndex.deletePath(change.recordPath);
        continue;
      }
      const markdown = await this.#fs.readFile(resolve(this.#contentDir, change.recordPath));
      this.#databaseRecordIndex.upsertPath(change.recordPath, markdown.toString('utf-8'));
    }
  }

  async #refreshJournal(): Promise<void> {
    try {
      const snapshot = await this.#journal.load();
      const redoFilesByMutationId = new Map(
        snapshot.redos.map((entry) => [entry.mutationId, entry.files] as const),
      );
      for (const entry of snapshot.commits) {
        const result = durableCommitResult(entry.result, entry.undoToken);
        const receipt = result.auditReceipt;
        const beforeFiles = new Map(
          (entry.undoFiles ?? receipt.files.map((file) => ({ path: file.path, before: null }))).map(
            (file) => [file.path, file.before] as const,
          ),
        );
        const afterFiles = new Map(
          (redoFilesByMutationId.get(receipt.mutationId) ?? []).map(
            (file) => [file.path, file.after] as const,
          ),
        );
        for (const file of receipt.files) {
          const before = beforeFiles.get(file.path);
          if (
            (file.operation === 'create' && before !== null) ||
            ((file.operation === 'update' || file.operation === 'delete') &&
              (typeof before !== 'string' || sha256(before) !== file.before.sha256))
          ) {
            throw new Error(`Commit journal undo base does not match receipt for ${file.path}`);
          }
        }
        this.#idempotency.set(receipt.idempotencyKeyHash, {
          fingerprint: entry.requestFingerprint,
          result,
        });
        this.#undoEntries.set(sha256(entry.undoToken), {
          tokenId: receipt.undo.tokenId,
          receipt: clone(receipt),
          beforeFiles,
          afterFiles,
        });
      }
      for (const entry of snapshot.undos) {
        this.#undoIdempotency.set(entry.idempotencyKeyHash, {
          fingerprint: entry.requestFingerprint,
          result: durableUndoResult(entry.result),
        });
      }
    } catch (error) {
      throw new DatabaseCommitError(
        'commit_unavailable',
        'Database transaction journal is unavailable or corrupt',
        {},
        error,
      );
    }
  }

  async #inspectRedo(entry: UndoEntry): Promise<{
    observedSnapshotRevision: string;
    conflicts: DatabaseUndoReceipt['conflicts'];
  }> {
    // Reuse the hardened path/symlink/hash checks from undo with a synthetic
    // receipt whose expected state is the committed transaction base. The
    // synthetic deltas never leave this process or enter the journal.
    const files = entry.receipt.files.map((file) => {
      if (file.operation === 'create') {
        return { operation: 'delete' as const, path: file.path, before: file.after, after: null };
      }
      return {
        operation: 'update' as const,
        path: file.path,
        before: file.before,
        after: file.before,
      };
    });
    return this.#inspectUndo({
      ...entry.receipt,
      files,
      undo: {
        ...entry.receipt.undo,
        expectedSnapshotRevision: entry.receipt.base.snapshotRevision,
      },
    } as DatabaseTransactionReceipt);
  }

  async #inspectUndo(receipt: DatabaseTransactionReceipt): Promise<{
    observedSnapshotRevision: string;
    conflicts: DatabaseUndoReceipt['conflicts'];
  }> {
    const observedSnapshotRevision = this.#databaseStore.snapshot().revision;
    const conflicts: DatabaseUndoReceipt['conflicts'] = [];
    if (observedSnapshotRevision !== receipt.undo.expectedSnapshotRevision) {
      conflicts.push({
        path: receipt.files[0]?.path ?? '.ok/databases/.commit.lock',
        reason: 'snapshot_changed',
        expectedSha256: null,
        observedSha256: null,
      });
    }
    for (const file of receipt.files) {
      const expected = file.after?.sha256 ?? null;
      const absolutePath = resolve(this.#projectDir, file.path);
      if (!this.#isAllowedContentPath(absolutePath)) {
        conflicts.push({
          path: file.path,
          reason: 'path_changed',
          expectedSha256: expected,
          observedSha256: null,
        });
        continue;
      }
      if (file.operation === 'delete') {
        try {
          const stats = await this.#fs.lstat(absolutePath);
          const observedSha256 =
            !stats.isSymbolicLink() &&
            stats.isFile() &&
            !(await this.#hasSymlinkComponent(absolutePath))
              ? sha256(await this.#fs.readFile(absolutePath))
              : null;
          conflicts.push({
            path: file.path,
            reason: 'path_recreated',
            expectedSha256: null,
            observedSha256,
          });
        } catch (error) {
          if (errno(error) !== 'ENOENT') throw error;
        }
        continue;
      }
      try {
        if (await this.#hasSymlinkComponent(absolutePath)) {
          conflicts.push({
            path: file.path,
            reason: 'path_changed',
            expectedSha256: expected,
            observedSha256: null,
          });
          continue;
        }
        const stats = await this.#fs.lstat(absolutePath);
        if (stats.isSymbolicLink() || !stats.isFile()) {
          conflicts.push({
            path: file.path,
            reason: 'path_changed',
            expectedSha256: expected,
            observedSha256: null,
          });
          continue;
        }
        const observed = sha256(await this.#fs.readFile(absolutePath));
        if (observed !== expected) {
          conflicts.push({
            path: file.path,
            reason: 'path_changed',
            expectedSha256: expected,
            observedSha256: observed,
          });
        }
      } catch (error) {
        if (errno(error) !== 'ENOENT') throw error;
        conflicts.push({
          path: file.path,
          reason: 'path_missing',
          expectedSha256: expected,
          observedSha256: null,
        });
      }
    }
    return { observedSnapshotRevision, conflicts };
  }

  async #applyUndo(context: {
    entry: UndoEntry;
    input: DatabaseUndoInput & {
      action: 'apply' | 'redo_apply';
      actor: DatabaseCommitInput['actor'];
    };
    idempotencyKeyHash: string;
    fingerprint: string;
    inspection: { observedSnapshotRevision: string; conflicts: DatabaseUndoReceipt['conflicts'] };
  }): Promise<DatabaseUndoResult> {
    const { entry, input, idempotencyKeyHash, fingerprint, inspection } = context;
    const stagingRoot = resolve(this.#projectDir, '.ok', '.database-transactions', entry.tokenId);
    const moved: Array<{ target: string; staged: string; path: string }> = [];
    const restored: string[] = [];
    try {
      await this.#assertSafeAbsentTarget(
        stagingRoot,
        `.ok/.database-transactions/${entry.tokenId}`,
      );
      await this.#fs.mkdir(stagingRoot);
      const restoreFiles = new Map<string, string>();
      for (const file of entry.receipt.files) {
        const before = entry.beforeFiles.get(file.path);
        if (file.operation === 'update' || file.operation === 'delete') {
          if (typeof before !== 'string') {
            throw new DatabaseCommitError(
              'commit_unavailable',
              'Durable undo content is missing for an updated or deleted file',
              { path: file.path },
            );
          }
          const restorePath = resolve(stagingRoot, 'restore', file.path);
          await this.#fs.mkdir(resolve(restorePath, '..'));
          await this.#fs.writeFile(restorePath, before);
          restoreFiles.set(file.path, restorePath);
        } else if (file.operation !== 'create') {
          throw new DatabaseCommitError(
            'commit_unavailable',
            `Undo does not support transaction operation "${file.operation}" yet`,
            { path: file.path, operation: file.operation },
          );
        }
      }
      for (const file of entry.receipt.files) {
        if (file.operation === 'delete') continue;
        const target = resolve(this.#projectDir, file.path);
        const staged = resolve(stagingRoot, 'removed', file.path);
        await this.#fs.mkdir(resolve(staged, '..'));
        await this.#assertSafeAbsentTarget(
          staged,
          `.ok/.database-transactions/${entry.tokenId}/removed/${file.path}`,
        );
        await this.#fs.rename(target, staged);
        moved.push({ target, staged, path: file.path });
      }
      for (const file of entry.receipt.files) {
        const restorePath = restoreFiles.get(file.path);
        if (!restorePath) continue;
        const target = resolve(this.#projectDir, file.path);
        await this.#fs.mkdir(resolve(target, '..'));
        await this.#fs.rename(restorePath, target);
        restored.push(target);
      }
      const resultSnapshot = await this.#databaseStore.reload();
      await this.#refreshDatabaseIndex();
      if (resultSnapshot.revision !== entry.receipt.base.snapshotRevision) {
        throw new DatabaseCommitError(
          'transaction_failed',
          'Undo postcondition did not restore the transaction base snapshot',
          {
            expectedSnapshotRevision: entry.receipt.base.snapshotRevision,
            observedSnapshotRevision: resultSnapshot.revision,
          },
        );
      }
      const git = this.#gitForActor();
      const resultGitHead = await git.snapshot(
        this.#writerForActor(input.actor),
        databaseTimelineCommitMessage({
          actor: input.actor,
          summary: `Undo ${entry.receipt.intentSummary}`,
          docs: databaseTimelineDocumentNames(
            entry.receipt.files.map((file) => file.path),
            relative(this.#projectDir, this.#contentDir).split(sep).join('/'),
          ),
        }),
      );
      const receipt = DatabaseUndoReceiptSchema.parse({
        version: 1,
        undoId: entry.tokenId,
        mutationId: entry.receipt.mutationId,
        checkedAt: this.#now().toISOString(),
        status: 'applied',
        expectedSnapshotRevision: entry.receipt.undo.expectedSnapshotRevision,
        observedSnapshotRevision: inspection.observedSnapshotRevision,
        resultSnapshotRevision: resultSnapshot.revision,
        resultGitHead: `sha1:${resultGitHead}`,
        conflicts: [],
      });
      const result: DatabaseUndoResult = {
        action: input.action,
        undoId: entry.tokenId,
        mutationId: entry.receipt.mutationId,
        canApply: true,
        idempotentReplay: false,
        expectedSnapshotRevision: entry.receipt.undo.expectedSnapshotRevision,
        observedSnapshotRevision: inspection.observedSnapshotRevision,
        conflicts: [],
        receipt,
      };
      await this.#journal.persistUndo({
        idempotencyKeyHash,
        requestFingerprint: fingerprint,
        result,
      });
      await this.#fs.rm(stagingRoot).catch(() => undefined);
      this.#undoIdempotency.set(idempotencyKeyHash, { fingerprint, result: clone(result) });
      return result;
    } catch (error) {
      const rollbackErrors: Array<{ path: string; errno?: string }> = [];
      for (const target of [...restored].reverse()) {
        try {
          await this.#fs.unlink(target);
        } catch (rollbackError) {
          if (errno(rollbackError) !== 'ENOENT') {
            rollbackErrors.push({
              path: relative(this.#projectDir, target),
              errno: errno(rollbackError),
            });
          }
        }
      }
      for (const file of [...moved].reverse()) {
        try {
          await this.#fs.mkdir(resolve(file.target, '..'));
          await this.#fs.rename(file.staged, file.target);
        } catch (rollbackError) {
          rollbackErrors.push({ path: file.path, errno: errno(rollbackError) });
        }
      }
      try {
        await this.#databaseStore.reload();
        await this.#refreshDatabaseIndex();
      } catch (rollbackError) {
        rollbackErrors.push({ path: '<derived-state>', errno: errno(rollbackError) });
      }
      await this.#fs.rm(stagingRoot).catch(() => undefined);
      if (rollbackErrors.length > 0) {
        throw new DatabaseCommitError(
          'rollback_failed',
          'Database undo failed and rollback was incomplete',
          { undoId: entry.tokenId, rollbackErrors },
          error,
        );
      }
      if (error instanceof DatabaseCommitError) throw error;
      throw new DatabaseCommitError(
        'transaction_failed',
        'Database undo failed and was rolled back',
        { undoId: entry.tokenId, errno: errno(error) },
        error,
      );
    }
  }

  async #applyRedo(context: {
    entry: UndoEntry;
    input: DatabaseUndoInput & { action: 'redo_apply'; actor: DatabaseCommitInput['actor'] };
    idempotencyKeyHash: string;
    fingerprint: string;
    inspection: { observedSnapshotRevision: string; conflicts: DatabaseUndoReceipt['conflicts'] };
  }): Promise<DatabaseUndoResult> {
    const { entry } = context;
    const files = entry.receipt.files.map((file) => {
      const after = entry.afterFiles.get(file.path);
      if (after === undefined) {
        throw new DatabaseCommitError('undo_not_found', `Redo content is missing for ${file.path}`);
      }
      if (file.operation === 'create') {
        return {
          operation: 'delete' as const,
          path: file.path,
          before: file.after,
          after: null,
        };
      }
      if (file.operation === 'delete') {
        return {
          operation: 'create' as const,
          path: file.path,
          before: null,
          after: file.before,
        };
      }
      return {
        operation: 'update' as const,
        path: file.path,
        before: file.after,
        after: file.after,
      };
    });
    const syntheticReceipt = {
      ...entry.receipt,
      intentSummary: `Redo ${entry.receipt.intentSummary}`,
      files,
      base: entry.receipt.result,
      undo: {
        ...entry.receipt.undo,
        expectedSnapshotRevision: entry.receipt.base.snapshotRevision,
      },
    } as DatabaseTransactionReceipt;
    const syntheticEntry: UndoEntry = {
      tokenId: entry.tokenId,
      receipt: syntheticReceipt,
      beforeFiles: new Map(
        entry.receipt.files.map((file) => [file.path, entry.afterFiles.get(file.path) ?? null]),
      ),
      afterFiles: new Map(),
    };
    return this.#applyUndo({
      ...context,
      entry: syntheticEntry,
    });
  }

  #writerForActor(actor: DatabaseCommitInput['actor']): WriterIdentity {
    return databaseWriterIdentity(actor);
  }

  #gitForActor(): CommitGit {
    if (this.#gitOverride) return this.#gitOverride;
    const shadow = this.#getShadow();
    if (!shadow) {
      throw new DatabaseCommitError(
        'commit_unavailable',
        'Database transaction requires the shadow Git repository',
      );
    }
    return {
      snapshot: (identity, message) => commitWip(shadow, identity, '', message, this.#branch()),
      hashBlob: async (path) => {
        const oid = (await shadowGit(shadow).raw('hash-object', '-w', '--', path)).trim();
        return `sha1:${oid}`;
      },
    };
  }

  async #execute(context: {
    input: DatabaseCommitInput;
    plan: DatabasePlanArtifact;
    idempotencyKeyHash: string;
    requestFingerprint: string;
    draft: ReturnType<DatabasePlanEngine['getDraft']>;
  }): Promise<DatabaseCommitResult> {
    const { input, plan, idempotencyKeyHash, requestFingerprint, draft } = context;
    const shadow = this.#gitOverride ? null : this.#getShadow();
    if (!this.#gitOverride && !shadow) {
      throw new DatabaseCommitError(
        'commit_unavailable',
        'Database commit requires the shadow Git repository',
      );
    }
    const writer = databaseWriterIdentity(input.actor);
    const git: CommitGit =
      this.#gitOverride ??
      ({
        snapshot: (identity, message) =>
          commitWip(shadow as ShadowHandle, identity, '', message, this.#branch()),
        hashBlob: async (path) => {
          const oid = (
            await shadowGit(shadow as ShadowHandle).raw('hash-object', '-w', '--', path)
          ).trim();
          return `sha1:${oid}`;
        },
      } satisfies CommitGit);
    const mutationId = `mut_${compactUuid(this.#generateUuid)}`;
    const undoTokenId = `undo_${compactUuid(this.#generateUuid)}`;
    const undoToken = `${undoTokenId}.${compactUuid(this.#generateUuid)}`;
    const commitTimestamp = this.#now().toISOString();
    const commitActor: DatabaseRecordActor = {
      kind: input.actor.kind,
      principal_id: input.actor.principalId,
    };
    const stagingRoot = resolve(this.#projectDir, '.ok', '.database-transactions', mutationId);
    const contentRelative = relative(this.#projectDir, this.#contentDir).split(sep).join('/');
    const targets: CommitTarget[] = plan.diff.manifests.map((manifest) => ({
      projectPath: manifest.path,
      absolutePath: resolve(this.#projectDir, manifest.path),
      content: manifest.after,
      beforeContent: manifest.before,
      operation: manifest.action,
    }));
    const currentDefinition = this.#databaseStore.getById(draft.normalized.definition.id);
    for (const copy of draft.normalized.recordCopies) {
      const projectPath = `${
        contentRelative === '' ? '' : `${contentRelative}/`
      }${copy.sourcePath}`;
      const absolutePath = resolve(this.#projectDir, projectPath);
      try {
        if (await this.#hasSymlinkComponent(absolutePath)) {
          throw new DatabaseCommitError(
            'target_changed',
            `Record copy source "${copy.sourceRecordId}" crosses a symbolic link`,
            { path: projectPath, recordId: copy.sourceRecordId },
          );
        }
        const stats = await this.#fs.lstat(absolutePath);
        if (!stats.isFile() || stats.isSymbolicLink()) {
          throw new DatabaseCommitError(
            'target_changed',
            `Record copy source "${copy.sourceRecordId}" is not a regular file`,
            { path: projectPath, recordId: copy.sourceRecordId },
          );
        }
        const observed = await this.#fs.readFile(absolutePath);
        if (sha256(observed) !== copy.expectedRevision) {
          throw new DatabaseCommitError(
            'target_changed',
            `Record copy source "${copy.sourceRecordId}" changed after planning`,
            {
              path: projectPath,
              expectedRevision: copy.expectedRevision,
              observedRevision: sha256(observed),
            },
          );
        }
      } catch (error) {
        if (error instanceof DatabaseCommitError) throw error;
        throw new DatabaseCommitError(
          'target_changed',
          `Record copy source "${copy.sourceRecordId}" is missing or unreadable`,
          { path: projectPath, recordId: copy.sourceRecordId, errno: errno(error) },
          error,
        );
      }
    }
    for (const recordDiff of plan.diff.records) {
      const source = draft.normalized.definition.sources.find(
        (candidate) => candidate.id === recordDiff.sourceId,
      );
      if (!source) {
        throw new DatabaseCommitError(
          'transaction_failed',
          'Plan record target no longer resolves to its immutable draft',
          { recordId: recordDiff.recordId },
        );
      }
      const projectPath = `${
        contentRelative === '' ? '' : `${contentRelative}/`
      }${recordDiff.path}`;
      const absolutePath = resolve(this.#projectDir, projectPath);
      if (recordDiff.action === 'move') {
        const move = draft.normalized.recordMoves.find(
          (candidate) => candidate.recordId === recordDiff.recordId,
        );
        const previousSource = currentDefinition?.sources.find(
          (candidate) => candidate.id === move?.sourceId,
        );
        if (!move || !previousSource || !recordDiff.targetPath) {
          throw new DatabaseCommitError(
            'transaction_failed',
            'Move target no longer resolves to its immutable draft',
            { recordId: recordDiff.recordId },
          );
        }
        const beforeContent = (await this.#fs.readFile(absolutePath)).toString('utf8');
        if (sha256(beforeContent) !== move.expectedRevision) {
          throw new DatabaseCommitError(
            'target_changed',
            `Record "${recordDiff.recordId}" changed after move planning`,
            { path: projectPath, expectedRevision: move.expectedRevision },
          );
        }
        const targetProjectPath = `${
          contentRelative === '' ? '' : `${contentRelative}/`
        }${recordDiff.targetPath}`;
        targets.push({
          projectPath,
          absolutePath,
          content: null,
          beforeContent,
          operation: 'delete',
        });
        targets.push({
          projectPath: targetProjectPath,
          absolutePath: resolve(this.#projectDir, targetProjectPath),
          content: recordMarkdown(
            draft.normalized.definition,
            source,
            {
              id: move.recordId,
              sourceId: move.targetSourceId,
              values: move.values,
              body: move.body,
              expectedRevision: null,
              archivedAt: move.archivedAt,
              pageLayoutOverride: move.pageLayoutOverride,
            },
            { markdown: beforeContent, source: previousSource },
            commitTimestamp,
            commitActor,
          ),
          beforeContent: null,
          operation: 'create',
        });
        continue;
      }
      let beforeContent: string | null = null;
      let previous: { markdown: string; source: DatabaseSource } | undefined;
      if (recordDiff.action === 'update' || recordDiff.action === 'delete') {
        beforeContent = (await this.#fs.readFile(absolutePath)).toString('utf8');
        if (sha256(beforeContent) !== recordDiff.before?.revision) {
          throw new DatabaseCommitError(
            'target_changed',
            `Record "${recordDiff.recordId}" changed after planning`,
            {
              path: projectPath,
              expectedRevision: recordDiff.before?.revision ?? null,
              observedRevision: sha256(beforeContent),
            },
          );
        }
        const previousSource = currentDefinition?.sources.find(
          (candidate) => candidate.id === recordDiff.sourceId,
        );
        if (!previousSource) {
          throw new DatabaseCommitError(
            'target_changed',
            'Existing record source no longer resolves in the planned base schema',
            { recordId: recordDiff.recordId, sourceId: recordDiff.sourceId },
          );
        }
        previous = { markdown: beforeContent, source: previousSource };
      }
      if (recordDiff.action === 'delete') {
        if (
          !draft.normalized.recordDeletions.some(
            (record) => record.recordId === recordDiff.recordId,
          )
        ) {
          throw new DatabaseCommitError(
            'transaction_failed',
            'Delete target no longer resolves to its immutable draft',
            { recordId: recordDiff.recordId },
          );
        }
        targets.push({
          projectPath,
          absolutePath,
          content: null,
          beforeContent,
          operation: 'delete',
        });
        continue;
      }
      const sample = draft.normalized.sampleRecords.find(
        (record) => record.id === recordDiff.recordId,
      );
      if (!sample) {
        throw new DatabaseCommitError(
          'transaction_failed',
          'Plan record value no longer resolves to its immutable draft',
          { recordId: recordDiff.recordId },
        );
      }
      targets.push({
        projectPath,
        absolutePath,
        content: recordMarkdown(
          draft.normalized.definition,
          source,
          sample,
          previous,
          commitTimestamp,
          commitActor,
        ),
        beforeContent,
        operation: recordDiff.action,
      });
    }
    const moved: Array<{ target: CommitTarget; backupPath: string | null }> = [];
    let baseGitHead = '';
    try {
      for (const target of targets) {
        if (!this.#isAllowedContentPath(target.absolutePath)) {
          throw new DatabaseCommitError('target_changed', 'Commit target escapes project root', {
            path: target.projectPath,
          });
        }
        await this.#assertTargetState(target);
      }
      baseGitHead = await git.snapshot(
        writer,
        `checkpoint: database transaction base ${mutationId}`,
      );
      await this.#fs.mkdir(stagingRoot);
      const staged = new Map<string, string>();
      for (const target of targets) {
        if (target.operation === 'delete') continue;
        if (target.content === null) throw new Error('write target has no staged content');
        const stagePath = resolve(stagingRoot, 'files', target.projectPath);
        await this.#fs.mkdir(resolve(stagePath, '..'));
        await this.#fs.writeFile(stagePath, target.content);
        staged.set(target.projectPath, stagePath);
      }
      const fileDeltas: DatabaseTransactionFileDelta[] = [];
      for (const target of targets) {
        if (target.operation === 'delete') {
          if (target.beforeContent === null) throw new Error('delete target has no before content');
          const beforeStagePath = resolve(stagingRoot, 'before', target.projectPath);
          await this.#fs.mkdir(resolve(beforeStagePath, '..'));
          await this.#fs.writeFile(beforeStagePath, target.beforeContent);
          fileDeltas.push({
            operation: 'delete',
            path: target.projectPath,
            before: {
              sha256: sha256(target.beforeContent),
              gitBlob: await git.hashBlob(beforeStagePath),
              bytes: Buffer.byteLength(target.beforeContent, 'utf8'),
            },
            after: null,
          });
          continue;
        }
        const stagePath = staged.get(target.projectPath);
        if (!stagePath) throw new Error('staged target missing');
        if (target.content === null) throw new Error('write target has no content');
        const bytes = Buffer.byteLength(target.content, 'utf8');
        const gitBlob = await git.hashBlob(stagePath);
        const after = { sha256: sha256(target.content), gitBlob, bytes };
        if (target.operation === 'create') {
          fileDeltas.push({ operation: 'create', path: target.projectPath, before: null, after });
        } else {
          if (target.beforeContent === null) throw new Error('update target has no before content');
          const beforeStagePath = resolve(stagingRoot, 'before', target.projectPath);
          await this.#fs.mkdir(resolve(beforeStagePath, '..'));
          await this.#fs.writeFile(beforeStagePath, target.beforeContent);
          fileDeltas.push({
            operation: 'update',
            path: target.projectPath,
            before: {
              sha256: sha256(target.beforeContent),
              gitBlob: await git.hashBlob(beforeStagePath),
              bytes: Buffer.byteLength(target.beforeContent, 'utf8'),
            },
            after,
          });
        }
      }
      // First canonical write: from here a read could observe a partially
      // applied transaction, so the barrier goes up now rather than around the
      // whole commit. The base checkpoint snapshot above is ~7 git processes
      // against an unchanged tree; holding the barrier across it made every
      // row add freeze the surface for no protection.
      this.#transactionActive = true;
      for (const target of targets) {
        await this.#fs.mkdir(resolve(target.absolutePath, '..'));
        let backupPath: string | null = null;
        if (target.operation === 'update' || target.operation === 'delete') {
          backupPath = resolve(stagingRoot, 'replaced', target.projectPath);
          await this.#fs.mkdir(resolve(backupPath, '..'));
          await this.#fs.rename(target.absolutePath, backupPath);
          moved.push({ target, backupPath });
        }
        if (target.operation === 'delete') continue;
        const stagePath = staged.get(target.projectPath);
        if (!stagePath) throw new Error('staged target missing');
        await this.#fs.rename(stagePath, target.absolutePath);
        if (target.operation === 'create') moved.push({ target, backupPath: null });
      }
      const storeSnapshot = await this.#databaseStore.reload();
      await this.#reflectCommittedTargets(targets);
      const checks = this.#verify(plan, draft, input.assertions);
      if (checks.some((check) => check.status === 'failed')) {
        throw new DatabaseCommitError('transaction_failed', 'Database postcondition failed', {
          checks,
        });
      }
      const resultGitHead = await git.snapshot(
        writer,
        databaseTimelineCommitMessage({
          actor: input.actor,
          summary: auditIntentSummary(plan),
          docs: databaseTimelineDocumentNames(
            targets.map((target) => target.projectPath),
            contentRelative,
          ),
        }),
      );
      const receipt = DatabaseTransactionReceiptSchema.parse({
        version: 1,
        mutationId,
        planId: plan.id,
        planHash: plan.hash,
        intentSummary: auditIntentSummary(plan),
        tool: this.#auditTool,
        dataSources: {
          databaseIds: [...new Set(plan.affectedObjects.databaseIds)].sort(),
          sourceIds: [...new Set(plan.affectedObjects.sourceIds)].sort(),
        },
        idempotencyKeyHash,
        actor: input.actor,
        committedAt: commitTimestamp,
        base: {
          gitHead: `sha1:${baseGitHead}`,
          snapshotRevision: plan.snapshotRevision,
        },
        result: {
          gitHead: `sha1:${resultGitHead}`,
          snapshotRevision: storeSnapshot.revision,
        },
        files: fileDeltas,
        verification: { status: 'passed', checks },
        undo: {
          tokenId: undoTokenId,
          strategy: 'git_three_way_reverse',
          expectedSnapshotRevision: storeSnapshot.revision,
        },
      });
      const result: DatabaseCommitResult = {
        mutationId,
        planId: plan.id,
        planHash: plan.hash,
        idempotentReplay: false,
        actualDiff: receipt.files,
        verification: receipt.verification,
        revisions: receipt.result,
        auditReceipt: receipt,
        undoToken,
      };
      await this.#journal.persistRedo(
        mutationId,
        targets.map((target) => ({
          path: target.projectPath,
          after: target.content,
        })),
      );
      await this.#journal.persistCommit(mutationId, {
        requestFingerprint,
        undoToken,
        undoFiles: targets.map((target) => ({
          path: target.projectPath,
          before: target.beforeContent,
        })),
        result,
      });
      this.#idempotency.set(idempotencyKeyHash, {
        fingerprint: requestFingerprint,
        result: clone(result),
      });
      this.#undoEntries.set(sha256(undoToken), {
        tokenId: undoTokenId,
        receipt: clone(receipt),
        beforeFiles: new Map(
          targets.map((target) => [target.projectPath, target.beforeContent] as const),
        ),
        afterFiles: new Map(targets.map((target) => [target.projectPath, target.content] as const)),
      });
      await this.#fs.rm(stagingRoot).catch(() => undefined);
      return clone(result);
    } catch (error) {
      if (moved.length > 0) {
        const rollbackErrors: Array<{ path: string; errno?: string }> = [];
        for (const movedTarget of [...moved].reverse()) {
          try {
            try {
              await this.#fs.unlink(movedTarget.target.absolutePath);
            } catch (unlinkError) {
              if (errno(unlinkError) !== 'ENOENT') throw unlinkError;
            }
            if (movedTarget.backupPath) {
              await this.#fs.mkdir(resolve(movedTarget.target.absolutePath, '..'));
              await this.#fs.rename(movedTarget.backupPath, movedTarget.target.absolutePath);
            }
          } catch (rollbackError) {
            rollbackErrors.push({
              path: movedTarget.target.projectPath,
              errno: errno(rollbackError),
            });
          }
        }
        try {
          await this.#databaseStore.reload();
          await this.#refreshDatabaseIndex();
        } catch (rollbackError) {
          rollbackErrors.push({
            path: '<derived-state>',
            errno: errno(rollbackError),
          });
        }
        if (rollbackErrors.length > 0) {
          throw new DatabaseCommitError(
            'rollback_failed',
            'Database transaction failed and rollback was incomplete',
            { mutationId, rollbackErrors, baseGitHead: baseGitHead || null },
            error,
          );
        }
      }
      await this.#fs.rm(stagingRoot).catch(() => undefined);
      if (error instanceof DatabaseCommitError) throw error;
      throw new DatabaseCommitError(
        'transaction_failed',
        'Database transaction failed and was rolled back',
        { mutationId, errno: errno(error), baseGitHead: baseGitHead || null },
        error,
      );
    }
  }

  #verify(
    plan: DatabasePlanArtifact,
    draft: ReturnType<DatabasePlanEngine['getDraft']>,
    assertions: DatabaseCommitInput['assertions'],
  ): DatabaseTransactionReceipt['verification']['checks'] {
    const definition = draft.normalized.definition;
    if (draft.normalized.databaseDeletion) {
      const databaseAbsent = this.#databaseStore.getById(definition.id) === null;
      const recordsAbsent = this.#databaseRecordIndex.list(definition.id).length === 0;
      const stableTargetsResolved = plan.targetResolutions.every((resolution) =>
        plan.immutableTargetSet.includes(resolution.targetId),
      );
      return [
        {
          code: 'database_absent',
          status: databaseAbsent ? 'passed' : 'failed',
          message: databaseAbsent
            ? 'Deleted database manifest is absent from the canonical store'
            : 'Deleted database manifest remains present',
        },
        {
          code: 'records_absent',
          status: recordsAbsent ? 'passed' : 'failed',
          message: recordsAbsent
            ? 'Every frozen database record is absent from the canonical index'
            : 'At least one deleted database record remains indexed',
        },
        {
          code: 'stable_targets_resolved',
          status: stableTargetsResolved ? 'passed' : 'failed',
          message: stableTargetsResolved
            ? 'Every deletion target resolves to an immutable stable ID'
            : 'At least one deletion target is outside the immutable stable-ID set',
        },
      ];
    }
    const stored = this.#databaseStore.getById(definition.id);
    const manifestValid = stored !== null && stable(stored) === stable(definition);
    const stableTargetsResolved = plan.targetResolutions.every((resolution) =>
      plan.immutableTargetSet.includes(resolution.targetId),
    );
    const indexed = this.#databaseRecordIndex.list(definition.id);
    const requiredValues = draft.normalized.sampleRecords.every((sample) => {
      const record = indexed.find((candidate) => candidate.id === sample.id);
      const source = definition.sources.find((candidate) => candidate.id === sample.sourceId);
      return Boolean(
        record &&
          source?.properties.every(
            (property) => !property.required || record.values[property.id] !== undefined,
          ),
      );
    });
    const uniqueValues = definition.sources.every((source) =>
      source.properties
        .filter((property) => property.semantics.constraints.unique)
        .every((property) => {
          const values = indexed
            .filter((record) => record.sourceId === source.id)
            .map((record) => record.values[property.id])
            .filter((value) => value !== undefined)
            .map(stable);
          return new Set(values).size === values.length;
        }),
    );
    const recordCount =
      assertions?.createdRecords === undefined || indexed.length === assertions.createdRecords;
    const verificationChange = draft.normalized.verificationChange;
    const verificationAttribution = verificationChange
      ? stable(
          indexed.find((record) => record.id === verificationChange.recordId)?.values[
            verificationChange.propertyId
          ],
        ) === stable(verificationChange.value)
      : true;
    const relationIntegrity = indexed.every((record) => {
      const source = definition.sources.find((candidate) => candidate.id === record.sourceId);
      if (!source) return false;
      return source.properties.every((property) => {
        if (property.type !== 'relation') return true;
        const value = record.values[property.id];
        if (value === undefined) return true;
        const relationIds = Array.isArray(value) ? value : [value];
        return relationIds.every((recordId) => {
          const target = this.#databaseRecordIndex.getById(String(recordId));
          if (!target || target.sourceId !== property.targetSourceId) return false;
          if (!property.pairedPropertyId) return true;
          const targetSource = definition.sources.find(
            (candidate) => candidate.id === property.targetSourceId,
          );
          const pairedProperty = targetSource?.properties.find(
            (candidate) => candidate.id === property.pairedPropertyId,
          );
          if (!pairedProperty || pairedProperty.type !== 'relation') return false;
          const inverseValue = target.values[pairedProperty.id];
          const inverseIds =
            inverseValue === undefined
              ? []
              : Array.isArray(inverseValue)
                ? inverseValue.map(String)
                : [String(inverseValue)];
          return inverseIds.includes(record.id);
        });
      });
    });
    return [
      {
        code: 'manifest_valid',
        status: manifestValid ? 'passed' : 'failed',
        message: manifestValid
          ? 'Committed manifest matches normalized desired state'
          : 'Committed manifest differs from normalized desired state',
      },
      {
        code: 'stable_ids_unique',
        status: manifestValid ? 'passed' : 'failed',
        message: manifestValid ? 'Manifest stable IDs remain unique' : 'Manifest validation failed',
      },
      {
        code: 'stable_targets_resolved',
        status: stableTargetsResolved ? 'passed' : 'failed',
        message: stableTargetsResolved
          ? 'Every human-addressed target resolves to an immutable stable ID'
          : 'At least one write target remains outside the immutable stable-ID set',
      },
      {
        code: 'required_values',
        status: requiredValues && recordCount ? 'passed' : 'failed',
        message:
          requiredValues && recordCount
            ? 'Planned records satisfy required values and count assertions'
            : 'Planned record required-value or count assertion failed',
      },
      {
        code: 'unique_key',
        status: uniqueValues ? 'passed' : 'failed',
        message: uniqueValues ? 'Unique-key values are unique' : 'Unique-key values are duplicated',
      },
      {
        code: 'relation_integrity',
        status: relationIntegrity ? 'passed' : 'failed',
        message: relationIntegrity
          ? 'Every relation resolves to the declared source and every paired edge is symmetric'
          : 'A relation target is missing, belongs to the wrong source, or lacks its paired edge',
      },
      ...(verificationChange
        ? [
            {
              code: 'verification_attribution',
              status: verificationAttribution ? ('passed' as const) : ('failed' as const),
              message: verificationAttribution
                ? 'Stored verification matches the authenticated actor and reviewed evidence'
                : 'Stored verification attribution or evidence differs from the reviewed lifecycle',
            },
          ]
        : []),
    ];
  }

  async #assertTargetState(target: CommitTarget): Promise<void> {
    if (target.operation === 'create') {
      await this.#assertSafeAbsentTarget(target.absolutePath, target.projectPath);
      return;
    }
    if (target.beforeContent === null) {
      throw new DatabaseCommitError(
        'target_changed',
        'Existing target has no planned base content',
        {
          path: target.projectPath,
        },
      );
    }
    if (await this.#hasSymlinkComponent(target.absolutePath)) {
      throw new DatabaseCommitError(
        'target_changed',
        `Commit target "${target.projectPath}" crosses a symbolic link`,
        { path: target.projectPath },
      );
    }
    try {
      const stats = await this.#fs.lstat(target.absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new DatabaseCommitError(
          'target_changed',
          `Commit target "${target.projectPath}" is not a regular file`,
          { path: target.projectPath },
        );
      }
      const observed = await this.#fs.readFile(target.absolutePath);
      if (sha256(observed) !== sha256(target.beforeContent)) {
        throw new DatabaseCommitError(
          'target_changed',
          `Commit target "${target.projectPath}" changed after planning`,
          {
            path: target.projectPath,
            expectedSha256: sha256(target.beforeContent),
            observedSha256: sha256(observed),
          },
        );
      }
    } catch (error) {
      if (error instanceof DatabaseCommitError) throw error;
      throw new DatabaseCommitError(
        'target_changed',
        `Commit target "${target.projectPath}" is missing or unreadable`,
        { path: target.projectPath, errno: errno(error) },
        error,
      );
    }
  }

  async #assertSafeAbsentTarget(absolutePath: string, projectPath: string): Promise<void> {
    const segments = relative(this.#projectDir, absolutePath).split(sep);
    let current = this.#projectDir;
    for (const segment of segments) {
      current = resolve(current, segment);
      try {
        const stats = await this.#fs.lstat(current);
        if (stats.isSymbolicLink()) {
          throw new DatabaseCommitError(
            'target_changed',
            `Commit target "${projectPath}" crosses a symbolic link`,
            { path: projectPath },
          );
        }
        if (current === absolutePath) {
          throw new DatabaseCommitError(
            'target_changed',
            `Commit target "${projectPath}" already exists`,
            { path: projectPath },
          );
        }
      } catch (error) {
        if (error instanceof DatabaseCommitError) throw error;
        if (errno(error) !== 'ENOENT') throw error;
      }
    }
  }

  /**
   * Project-relative paths are the normal write surface. In ephemeral
   * single-file mode the content directory is intentionally outside the
   * throwaway project root, so the only additional writable surface is that
   * exact content directory. This keeps arbitrary path traversal blocked.
   */
  #isAllowedContentPath(absolutePath: string): boolean {
    return (
      isWithin(this.#projectDir, absolutePath) ||
      (this.#allowExternalContentDir && isWithin(this.#contentDir, absolutePath))
    );
  }

  async #hasSymlinkComponent(absolutePath: string): Promise<boolean> {
    const segments = relative(this.#projectDir, absolutePath).split(sep);
    let current = this.#projectDir;
    for (const segment of segments) {
      current = resolve(current, segment);
      try {
        if ((await this.#fs.lstat(current)).isSymbolicLink()) return true;
      } catch (error) {
        if (errno(error) !== 'ENOENT') throw error;
        return false;
      }
    }
    return false;
  }
}

export function createDatabaseCommitEngine(
  options: CreateDatabaseCommitEngineOptions,
): DatabaseCommitEngine {
  return new DatabaseCommitEngine(options);
}
