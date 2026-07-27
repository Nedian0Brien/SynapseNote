import { afterEach, describe, expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DatabaseTransactionReceiptSchema,
  DatabaseUndoReceiptSchema,
  queryDatabaseRecords,
} from '@nedian0brien/synapsenote-core';
import { parseContributors } from '@nedian0brien/synapsenote-core/shadow-repo-layout';
import {
  createDatabaseAgentRunStore,
  type DatabaseAgentRunStore,
} from './database-agent-run-store.ts';
import { createDatabaseAutonomyStore } from './database-autonomy-store.ts';
import {
  type ConsumeDatabaseCommitAutonomyBudget,
  createDatabaseCommitEngine,
  DatabaseCommitError,
  type DatabaseCommitInput,
  type ResolveDatabaseCommitAutonomyPolicy,
} from './database-commit.ts';
import { createDatabaseMarkdownTableWriter } from './database-markdown-table-writer.ts';
import {
  createDatabasePlanEngine,
  DatabasePlanError,
  type ResolveDatabaseWriteGuards,
} from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function desiredState() {
  return {
    database: {
      key: 'committed-tasks',
      name: 'Committed tasks',
      contract: {
        purpose: 'Verify atomic agent commits',
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
    },
    sources: [
      {
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One committed task',
        folder: 'committed-tasks',
        properties: [
          { key: 'title', name: 'Title', type: 'title', required: true },
          {
            key: 'status',
            name: 'Status',
            type: 'select',
            options: [
              { key: 'todo', name: 'Todo' },
              { key: 'done', name: 'Done' },
            ],
          },
        ],
      },
    ],
    views: [],
    uniqueKey: { sourceKey: 'tasks', propertyKey: 'title' },
    templates: [],
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 10 },
    sampleRecords: [
      {
        sourceKey: 'tasks',
        values: { title: 'Atomic commit', status: 'todo' },
        body: 'Created only after the exact plan is approved.\n',
      },
    ],
  };
}

function stableDesiredState(
  draft: ReturnType<ReturnType<typeof createDatabasePlanEngine>['createDraft']>,
) {
  const state = structuredClone(draft.desiredState);
  state.database.id = draft.normalized.definition.id;
  for (const source of state.sources) {
    const normalizedSource = draft.normalized.definition.sources.find(
      (candidate) => candidate.key === source.key,
    );
    if (!normalizedSource) throw new Error(`missing source ${source.key}`);
    source.id = normalizedSource.id;
    for (const property of source.properties) {
      const normalizedProperty = normalizedSource.properties.find(
        (candidate) => candidate.key === property.key,
      );
      if (!normalizedProperty) throw new Error(`missing property ${property.key}`);
      property.id = normalizedProperty.id;
      if (
        (normalizedProperty.type === 'select' || normalizedProperty.type === 'multi_select') &&
        Array.isArray(property.options)
      ) {
        for (const option of property.options) {
          const normalizedOption = normalizedProperty.options.find(
            (candidate) => candidate.key === option.key,
          );
          if (normalizedOption) option.id = normalizedOption.id;
        }
      }
    }
  }
  return state;
}

async function fixture(input?: {
  failRenameAt?: number;
  desiredState?: ReturnType<typeof desiredState>;
  snapshotGate?: Promise<void>;
  onSnapshot?: () => void;
  resolveWriteGuards?: ResolveDatabaseWriteGuards;
  resolveAutonomyPolicy?: ResolveDatabaseCommitAutonomyPolicy;
  consumeAutonomyBudget?: ConsumeDatabaseCommitAutonomyBudget;
  createResolveAutonomyPolicy?: (projectDir: string) => ResolveDatabaseCommitAutonomyPolicy;
  createAgentRunStore?: (projectDir: string) => DatabaseAgentRunStore;
  commitNow?: () => Date;
  allowLegacyV1Mutation?: boolean;
}) {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-commit-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  let uuidCounter = 0;
  const generateUuid = () =>
    `${String(++uuidCounter).padStart(8, '0')}-0000-4000-8000-000000000000`;
  const plans = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
    now: () => new Date('2026-07-19T10:00:00.000Z'),
    generateUuid,
    resolveWriteGuards: input?.resolveWriteGuards,
  });
  const draft = plans.createDraft(input?.desiredState ?? desiredState());
  const plan = plans.createPlan(draft.id);
  const markdownTableWriter = createDatabaseMarkdownTableWriter({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
    refreshDatabaseIndex: () => index.rebuild(),
    generateUuid,
  });
  let snapshotCount = 0;
  const snapshotMessages: string[] = [];
  let renameCount = 0;
  const engine = createDatabaseCommitEngine({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    databaseMarkdownTableWriter: markdownTableWriter,
    allowLegacyV1Mutation: input?.allowLegacyV1Mutation,
    now: input?.commitNow ?? (() => new Date('2026-07-19T10:05:00.000Z')),
    generateUuid,
    git: {
      snapshot: async (_identity, message) => {
        snapshotMessages.push(message);
        input?.onSnapshot?.();
        if (input?.snapshotGate) await input.snapshotGate;
        return String(++snapshotCount).repeat(40).slice(0, 40);
      },
      hashBlob: async () => `sha1:${'a'.repeat(40)}`,
    },
    resolveAutonomyPolicy:
      input?.resolveAutonomyPolicy ?? input?.createResolveAutonomyPolicy?.(projectDir),
    consumeAutonomyBudget: input?.consumeAutonomyBudget,
    agentRunStore: input?.createAgentRunStore?.(projectDir),
    ...(input?.failRenameAt
      ? {
          fs: {
            rename: async (from: string, to: string) => {
              renameCount += 1;
              if (renameCount === input.failRenameAt) {
                const error = new Error('injected rename failure') as NodeJS.ErrnoException;
                error.code = 'EIO';
                throw error;
              }
              await rename(from, to);
            },
          },
        }
      : {}),
  });
  const commitInput = (): DatabaseCommitInput => ({
    planId: plan.id,
    planHash: plan.hash,
    expectedSnapshotRevision: plan.snapshotRevision,
    idempotencyKey: 'commit-request-0001',
    approvalToken: engine.expectedApprovalToken(plan.hash),
    actor: {
      principalId: 'agent:codex',
      kind: 'agent',
      sessionId: 'session-1',
    },
    assertions: {
      databaseAbsent: true,
      createdRecords: draft.normalized.sampleRecords.length,
    },
  });
  return {
    projectDir,
    contentDir,
    store,
    index,
    plans,
    draft,
    plan,
    engine,
    commitInput,
    snapshotCount: () => snapshotCount,
    snapshotMessages,
  };
}

describe('DatabaseCommitEngine', () => {
  test('creates v2 rows as normal linked Markdown documents', async () => {
    const state = structuredClone(desiredState());
    const desiredSource = state.sources[0];
    if (!desiredSource) throw new Error('expected a source');
    desiredSource.storage = 'markdown_table';
    const fixtureState = await fixture({ desiredState: state });

    expect(fixtureState.plan.committable).toBe(true);
    expect(
      fixtureState.plan.conflicts.some(
        (conflict) => conflict.code === 'source_record_migration_required',
      ),
    ).toBe(false);

    const result = await fixtureState.engine.commit(fixtureState.commitInput());
    expect(result.verification.status).toBe('passed');
    const definition = fixtureState.store.getById(fixtureState.draft.normalized.definition.id);
    const source = definition?.sources[0];
    expect(definition?.version).toBe(2);
    expect(source?.storage?.kind).toBe('markdown_table');
    const ownerPath = source?.storage?.kind === 'markdown_table' ? source.storage.owner.path : null;
    if (!ownerPath) throw new Error('expected a Markdown owner path');
    const owner = readFileSync(join(fixtureState.contentDir, ownerPath), 'utf8');
    expect(owner).toContain('[[');
    expect(owner).not.toContain('rec_');

    const records = fixtureState.index.list(fixtureState.draft.normalized.definition.id);
    expect(records).toHaveLength(1);
    const firstRecord = records[0];
    if (!firstRecord) throw new Error('expected one indexed v2 record');
    expect(firstRecord.path).toMatch(/\.md$/u);
    expect(firstRecord.path).not.toMatch(/(?:^|\/)rec_[^/]+\.md$/u);
    expect(existsSync(join(fixtureState.contentDir, firstRecord.path))).toBe(true);
  });

  test('blocks direct production commit paths from mutating an existing v1 database', async () => {
    const fixtureState = await fixture({ allowLegacyV1Mutation: false });
    await fixtureState.engine.commit(fixtureState.commitInput());
    const record = fixtureState.index.list(fixtureState.draft.normalized.definition.id)[0];
    if (!record?.revision) throw new Error('expected an indexed v1 record');
    const updateState = stableDesiredState(fixtureState.draft);
    updateState.sampleRecords = [
      {
        sourceKey: 'tasks',
        id: record.id,
        expectedRevision: record.revision,
        values: { title: 'Blocked v1 edit', status: 'done' },
        body: record.body,
      },
    ];
    const updateDraft = fixtureState.plans.createDraft(updateState);
    const updatePlan = fixtureState.plans.createPlan(updateDraft.id);
    await expect(
      fixtureState.engine.commit({
        planId: updatePlan.id,
        planHash: updatePlan.hash,
        expectedSnapshotRevision: updatePlan.snapshotRevision,
        idempotencyKey: 'v1-production-guard-0001',
        approvalToken: fixtureState.engine.expectedApprovalToken(updatePlan.hash),
        actor: { principalId: 'system:template', kind: 'system' },
      }),
    ).rejects.toMatchObject({
      code: 'storage_read_only',
      details: { databaseId: fixtureState.draft.normalized.definition.id, migrationRequired: true },
    });
    expect(readFileSync(join(fixtureState.contentDir, record.path), 'utf8')).toContain(
      'Atomic commit',
    );
  });

  test('routes v2 property updates and deletes through the owner-table writer', async () => {
    const state = structuredClone(desiredState());
    const source = state.sources[0];
    if (!source) throw new Error('expected a source');
    source.storage = 'markdown_table';
    const fixtureState = await fixture({ desiredState: state });
    await fixtureState.engine.commit(fixtureState.commitInput());

    const record = fixtureState.index.list(fixtureState.draft.normalized.definition.id)[0];
    if (!record) throw new Error('expected one indexed v2 record');
    if (!record.revision) throw new Error('expected a revision for the indexed v2 record');
    const updateState = stableDesiredState(fixtureState.draft);
    const updateSource = updateState.sources[0];
    if (!updateSource) throw new Error('expected an update source');
    updateSource.folder = '.';
    updateState.sampleRecords = [
      {
        sourceKey: 'tasks',
        id: record.id,
        expectedRevision: record.revision,
        values: { title: 'Atomic commit renamed', status: 'done' },
        body: record.body,
      },
    ];
    const updateDraft = fixtureState.plans.createDraft(updateState);
    const updatePlan = fixtureState.plans.createPlan(updateDraft.id);
    expect(updatePlan.committable).toBe(true);
    const updateResult = await fixtureState.engine.commit({
      planId: updatePlan.id,
      planHash: updatePlan.hash,
      expectedSnapshotRevision: updatePlan.snapshotRevision,
      idempotencyKey: 'v2-update-request-0001',
      approvalToken: fixtureState.engine.expectedApprovalToken(updatePlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent', sessionId: 'session-1' },
      assertions: { createdRecords: 1 },
    });
    expect(updateResult.verification.status).toBe('passed');
    const updated = fixtureState.index.getById(record.id);
    if (!updated) throw new Error('expected the updated record');
    if (!updated.revision) throw new Error('expected a revision for the updated record');
    const statusProperty = fixtureState.store
      .getById(fixtureState.draft.normalized.definition.id)
      ?.sources[0]?.properties.find((property) => property.key === 'status');
    if (!statusProperty || !('options' in statusProperty)) {
      throw new Error('expected a status property with options');
    }
    const doneOption = statusProperty.options.find((option) => option.key === 'done');
    if (!doneOption) throw new Error('expected the done status option');
    expect(updated.values[statusProperty.id]).toBe(doneOption.id);
    expect(readFileSync(join(fixtureState.contentDir, updated.path), 'utf8')).toContain(
      'Atomic commit renamed',
    );

    const deleteState = stableDesiredState(updateDraft);
    deleteState.sampleRecords = [];
    deleteState.recordDeletions = [
      {
        sourceKey: 'tasks',
        id: record.id,
        expectedRevision: updated.revision,
      },
    ];
    const deleteDraft = fixtureState.plans.createDraft(deleteState);
    const deletePlan = fixtureState.plans.createPlan(deleteDraft.id);
    expect(deletePlan.committable).toBe(true);
    const deleteResult = await fixtureState.engine.commit({
      planId: deletePlan.id,
      planHash: deletePlan.hash,
      expectedSnapshotRevision: deletePlan.snapshotRevision,
      idempotencyKey: 'v2-delete-request-0001',
      approvalToken: fixtureState.engine.expectedApprovalToken(deletePlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent', sessionId: 'session-1' },
      assertions: { createdRecords: 0 },
    });
    expect(fixtureState.index.getById(record.id)).toBeNull();
    const undoPreview = await fixtureState.engine.undo({
      action: 'preview',
      undoToken: deleteResult.undoToken,
    });
    expect(undoPreview).toMatchObject({ canApply: true, conflicts: [] });
    const undoResult = await fixtureState.engine.undo({
      action: 'apply',
      undoToken: deleteResult.undoToken,
      idempotencyKey: 'v2-delete-undo-0001',
      actor: { principalId: 'agent:codex', kind: 'agent', sessionId: 'session-1' },
    });
    expect(undoResult).toMatchObject({ canApply: true, receipt: { status: 'applied' } });
    expect(fixtureState.index.getById(record.id)).toMatchObject({ id: record.id });
  });

  test('holds a read barrier for the complete commit transaction lifecycle', async () => {
    let releaseSnapshot!: () => void;
    let enteredSnapshot!: () => void;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      enteredSnapshot = resolve;
    });
    const { engine, commitInput } = await fixture({
      snapshotGate,
      onSnapshot: enteredSnapshot,
    });
    const pending = engine.commit(commitInput());
    await entered;
    expect(engine.isTransactionActive()).toBe(true);
    releaseSnapshot();
    await pending;
    expect(engine.isTransactionActive()).toBe(false);
  });

  test('atomically commits an exact approved plan and returns a verified receipt', async () => {
    const {
      projectDir,
      contentDir,
      store,
      index,
      draft,
      plan,
      engine,
      commitInput,
      snapshotCount,
      snapshotMessages,
    } = await fixture();
    const result = await engine.commit(commitInput());
    const mutationId = result.mutationId;
    expect(DatabaseTransactionReceiptSchema.parse(result.auditReceipt)).toBeDefined();
    expect(result).toMatchObject({
      mutationId: expect.stringMatching(/^mut_/),
      planId: plan.id,
      planHash: plan.hash,
      idempotentReplay: false,
      verification: { status: 'passed' },
      revisions: {
        gitHead: expect.stringMatching(/^sha1:/),
        snapshotRevision: expect.stringMatching(/^sha256:/),
      },
      undoToken: expect.stringMatching(/^undo_/),
    });
    expect(result.actualDiff).toHaveLength(2);
    expect(result.actualDiff.every((delta) => delta.operation === 'create')).toBe(true);
    expect(
      result.actualDiff.every((delta) => delta.after?.gitBlob === `sha1:${'a'.repeat(40)}`),
    ).toBe(true);
    expect(snapshotCount()).toBe(2);
    expect(snapshotMessages[0]).toMatch(/^checkpoint: database transaction base mut_/);
    expect(parseContributors(snapshotMessages[1] ?? '')).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^agent-/),
        name: 'agent:codex',
        docs: [expect.stringMatching(/^committed-tasks\//)],
      }),
    ]);
    expect(result.verification.checks).toContainEqual(
      expect.objectContaining({ code: 'stable_targets_resolved', status: 'passed' }),
    );
    expect(result.auditReceipt).toMatchObject({
      planHash: plan.hash,
      intentSummary: expect.stringContaining('Apply reviewed'),
      tool: {
        name: 'synapsenote-server/database-commit',
        version: expect.stringMatching(/^\d+\.\d+\.\d+/),
      },
      dataSources: {
        databaseIds: [draft.normalized.definition.id],
        sourceIds: draft.normalized.definition.sources.map(({ id }) => id).sort(),
      },
      actor: { principalId: 'agent:codex', kind: 'agent', sessionId: 'session-1' },
      files: result.actualDiff,
      verification: result.verification,
    });

    const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    const recordPath = join(contentDir, plan.diff.records[0]?.path ?? 'missing-record-path');
    expect(existsSync(manifestPath)).toBe(true);
    expect(readFileSync(recordPath, 'utf8')).toContain('record_id: rec_');
    expect(readFileSync(recordPath, 'utf8')).toContain('status: todo');
    expect(store.getById(draft.normalized.definition.id)).not.toBeNull();
    expect(index.list(draft.normalized.definition.id)).toHaveLength(1);

    const replay = await engine.commit(commitInput());
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.mutationId).toBe(mutationId);
    expect(snapshotCount()).toBe(2);
  });

  test("R-015: the record materialized on disk exactly matches the plan's proposed diff, not just a plausible file", async () => {
    // R-015 gap: existing tests confirm a commit succeeds and spot-check a
    // couple of substrings in the written file (see the test above), but
    // nothing asserts plan/actual diff EQUALITY as its own property — the
    // plan's `diff.records[].after` (semantic values + body) and the
    // commit's `actualDiff` (content-hash based) are different
    // representations of the same mutation, so this drives both: the
    // actual file diff reports the same path/operation the plan proposed,
    // and the record materialized on disk deserializes to exactly the
    // values and body the plan promised.
    const { plan, engine, commitInput, index } = await fixture();
    const proposedRecord = plan.diff.records[0];
    if (!proposedRecord || proposedRecord.action !== 'create' || !proposedRecord.after) {
      throw new Error('Expected fixture plan to propose exactly one record create');
    }

    const result = await engine.commit(commitInput());

    expect(result.actualDiff).toContainEqual(
      expect.objectContaining({
        path: `content/${proposedRecord.path}`,
        operation: 'create',
      }),
    );

    const materialized = index.getById(proposedRecord.recordId);
    if (!materialized) throw new Error('Expected the proposed record to be indexed after commit');
    expect(materialized.path).toBe(proposedRecord.path);
    expect(materialized.values).toEqual(proposedRecord.after.values);
    expect(materialized.body).toBe(proposedRecord.after.body);
  });

  test('commits authenticated Verification attribution and keeps evidence fresh across badge-only writes', async () => {
    const state = desiredState();
    state.sources[0]?.properties.push({
      key: 'verification',
      name: 'Verification',
      type: 'verification',
      allowExpiry: true,
      requireEvidenceRevision: true,
    } as never);
    const { index, plans, engine, commitInput, draft } = await fixture({ desiredState: state });
    await engine.commit(commitInput());
    const source = draft.normalized.definition.sources[0];
    const property = source?.properties.find((candidate) => candidate.type === 'verification');
    const record = index.list(draft.normalized.definition.id)[0];
    if (!source || !property || !record?.revision || !record.evidenceRevision) {
      throw new Error('Committed Verification fixture is missing');
    }
    const verification = plans.createVerificationDraft(
      {
        databaseId: draft.normalized.definition.id,
        sourceId: source.id,
        recordId: record.id,
        propertyId: property.id,
        expectedRevision: record.revision,
        action: 'verify',
        evidenceRevision: record.evidenceRevision,
        expiresAt: '2026-07-20T10:00:00.000Z',
      },
      { kind: 'agent', principal_id: 'agent:reviewer' },
    );
    const plan = plans.createPlan(verification.draft.id);
    await expect(
      engine.commit({
        planId: plan.id,
        planHash: plan.hash,
        expectedSnapshotRevision: plan.snapshotRevision,
        idempotencyKey: 'verification-commit-forged',
        approvalToken: engine.expectedApprovalToken(plan.hash),
        actor: { principalId: 'agent:other', kind: 'agent', sessionId: 'session-other' },
      }),
    ).rejects.toThrow('same authenticated actor');
    const verificationCommitInput = {
      planId: plan.id,
      planHash: plan.hash,
      expectedSnapshotRevision: plan.snapshotRevision,
      idempotencyKey: 'verification-commit-0001',
      approvalToken: engine.expectedApprovalToken(plan.hash),
      actor: { principalId: 'agent:reviewer', kind: 'agent', sessionId: 'session-verify' },
      assertions: { databaseAbsent: false, createdRecords: 1 },
    } as const;
    const result = await engine.commit(verificationCommitInput);
    expect(result.verification.checks).toContainEqual(
      expect.objectContaining({ code: 'verification_attribution', status: 'passed' }),
    );
    const committed = index.getById(record.id);
    expect(committed?.evidenceRevision).toBe(record.evidenceRevision);
    const query = queryDatabaseRecords({
      source,
      records: committed ? [committed] : [],
      snapshotRevision: index.snapshot().revision,
      verificationTime: new Date('2026-07-19T10:06:00.000Z'),
      query: { select: [property.id] },
    });
    expect(query.records[0]?.verificationProjections?.[property.id]).toMatchObject({
      status: 'verified',
      isStale: false,
      evidenceRevision: record.evidenceRevision,
      currentEvidenceRevision: record.evidenceRevision,
      verifiedBy: { kind: 'agent', principal_id: 'agent:reviewer' },
    });
  });

  test('persists immutable created time and advances read-only last edited time on update', async () => {
    const state = desiredState();
    state.sources[0]?.properties.push(
      { key: 'created_time', name: 'Created time', type: 'created_time' } as never,
      { key: 'last_edited_time', name: 'Last edited time', type: 'last_edited_time' } as never,
      { key: 'created_by', name: 'Created by', type: 'created_by' } as never,
      { key: 'last_edited_by', name: 'Last edited by', type: 'last_edited_by' } as never,
    );
    const times = [
      new Date('2026-07-19T10:05:00.000Z'),
      new Date('2026-07-19T10:10:00.000Z'),
      new Date('2026-07-19T10:20:00.000Z'),
    ];
    const { contentDir, draft, engine, commitInput, plans, index } = await fixture({
      desiredState: state,
      commitNow: () => times.shift() ?? new Date('2026-07-19T10:10:00.000Z'),
    });
    await engine.commit(commitInput());
    const record = index.list(draft.normalized.definition.id)[0];
    if (!record?.revision) throw new Error('expected committed record');
    const recordPath = join(contentDir, record.path);
    const created = readFileSync(recordPath, 'utf8');
    expect(created).toContain('created_at: 2026-07-19T10:05:00.000Z');
    expect(created).toContain('last_edited_at: 2026-07-19T10:05:00.000Z');
    expect(created).toContain('created_by:\n    kind: agent\n    principal_id: agent:codex');
    expect(created).toContain('last_edited_by:\n    kind: agent\n    principal_id: agent:codex');
    expect(created).not.toMatch(/^created_time:/m);
    expect(created).not.toMatch(/^last_edited_time:/m);

    const updateState = stableDesiredState(draft);
    updateState.sampleRecords = [];
    updateState.recordMutations = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        operations: [{ op: 'set', propertyKey: 'status', value: 'done' }],
      },
    ];
    const updateDraft = plans.createDraft(updateState);
    const updatePlan = plans.createPlan(updateDraft.id);
    await engine.commit({
      planId: updatePlan.id,
      planHash: updatePlan.hash,
      expectedSnapshotRevision: updatePlan.snapshotRevision,
      idempotencyKey: 'metadata-time-update-0001',
      approvalToken: engine.expectedApprovalToken(updatePlan.hash),
      actor: { principalId: 'sync:remote', kind: 'sync' },
      assertions: { databaseAbsent: false },
    });
    const updated = readFileSync(recordPath, 'utf8');
    expect(updated).toContain('created_at: 2026-07-19T10:05:00.000Z');
    expect(updated).toContain('last_edited_at: 2026-07-19T10:10:00.000Z');
    expect(updated).toContain('created_by:\n    kind: agent\n    principal_id: agent:codex');
    expect(updated).toContain('last_edited_by:\n    kind: sync\n    principal_id: sync:remote');

    const updatedRecord = index.getById(record.id);
    if (!updatedRecord?.revision) throw new Error('expected updated record');
    const copyState = stableDesiredState(draft);
    copyState.sampleRecords = [];
    copyState.recordCopies = [
      {
        id: updatedRecord.id,
        expectedRevision: updatedRecord.revision,
        sourceKey: 'tasks',
        title: 'Temporal copy',
      },
    ];
    const copyDraft = plans.createDraft(copyState);
    const copyPlan = plans.createPlan(copyDraft.id);
    await engine.commit({
      planId: copyPlan.id,
      planHash: copyPlan.hash,
      expectedSnapshotRevision: copyPlan.snapshotRevision,
      idempotencyKey: 'metadata-time-copy-0001',
      approvalToken: engine.expectedApprovalToken(copyPlan.hash),
      actor: { principalId: 'user:local', kind: 'human' },
      assertions: { databaseAbsent: false },
    });
    const copy = index
      .list(draft.normalized.definition.id)
      .find((candidate) => candidate.id !== record.id);
    if (!copy) throw new Error('expected copied record');
    expect(readFileSync(join(contentDir, copy.path), 'utf8')).toContain(
      'created_at: 2026-07-19T10:20:00.000Z',
    );
    const copied = readFileSync(join(contentDir, copy.path), 'utf8');
    expect(copied).toContain('created_by:\n    kind: human\n    principal_id: user:local');
    expect(copied).toContain('last_edited_by:\n    kind: human\n    principal_id: user:local');
  });

  test('persists, preserves, and clears a revision-bound record page layout override', async () => {
    const { contentDir, draft, engine, commitInput, plans, index } = await fixture();
    await engine.commit(commitInput());
    const record = index.list(draft.normalized.definition.id)[0];
    const source = draft.normalized.definition.sources[0];
    const status = source?.properties.find((property) => property.key === 'status');
    if (!record?.revision || !source || !status) throw new Error('expected stable layout fixture');

    const overrideState = stableDesiredState(draft);
    const sourceState = overrideState.sources[0];
    if (!sourceState) throw new Error('expected source desired state');
    Object.assign(sourceState, {
      pageLayout: {
        pinnedPropertyIds: [status.id],
        panelPropertyIds: [],
        hiddenPropertyIds: [],
        sections: [],
        fullWidthContent: false,
      },
    });
    overrideState.sampleRecords = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: source.key,
        values: { title: 'Atomic commit', status: 'todo' },
        body: record.body,
        pageLayoutOverride: {
          pinnedPropertyIds: [],
          panelPropertyIds: [status.id],
          hiddenPropertyIds: [],
          groupOverrides: [],
          fullWidthContent: true,
        },
      } as never,
    ];
    const overrideDraft = plans.createDraft(overrideState);
    const overridePlan = plans.createPlan(overrideDraft.id);
    expect(overridePlan.diff.records[0]?.after?.pageLayoutOverride).toMatchObject({
      panelPropertyIds: [status.id],
      fullWidthContent: true,
    });
    await engine.commit({
      planId: overridePlan.id,
      planHash: overridePlan.hash,
      expectedSnapshotRevision: overridePlan.snapshotRevision,
      idempotencyKey: 'record-layout-override-0001',
      approvalToken: engine.expectedApprovalToken(overridePlan.hash),
      actor: { principalId: 'user:local', kind: 'human' },
      assertions: { databaseAbsent: false },
    });
    const recordPath = join(contentDir, record.path);
    expect(readFileSync(recordPath, 'utf8')).toContain('page_layout_override:');
    expect(index.getById(record.id)?.pageLayoutOverride).toMatchObject({
      panelPropertyIds: [status.id],
      fullWidthContent: true,
    });

    const preserved = index.getById(record.id);
    if (!preserved?.revision) throw new Error('expected overridden record revision');
    const mutationState = structuredClone(overrideDraft.desiredState);
    mutationState.sampleRecords = [];
    mutationState.recordMutations = [
      {
        id: record.id,
        expectedRevision: preserved.revision,
        sourceKey: source.key,
        operations: [{ op: 'set', propertyKey: 'status', value: 'done' }],
      },
    ];
    const mutationDraft = plans.createDraft(mutationState);
    const mutationPlan = plans.createPlan(mutationDraft.id);
    await engine.commit({
      planId: mutationPlan.id,
      planHash: mutationPlan.hash,
      expectedSnapshotRevision: mutationPlan.snapshotRevision,
      idempotencyKey: 'record-layout-preserve-0001',
      approvalToken: engine.expectedApprovalToken(mutationPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(readFileSync(recordPath, 'utf8')).toContain('page_layout_override:');

    const changed = index.getById(record.id);
    if (!changed?.revision) throw new Error('expected changed record revision');
    const clearState = structuredClone(overrideDraft.desiredState);
    clearState.sampleRecords = [
      {
        id: record.id,
        expectedRevision: changed.revision,
        sourceKey: source.key,
        values: { title: 'Atomic commit', status: 'done' },
        body: changed.body,
        pageLayoutOverride: null,
      },
    ];
    const clearDraft = plans.createDraft(clearState);
    const clearPlan = plans.createPlan(clearDraft.id);
    await engine.commit({
      planId: clearPlan.id,
      planHash: clearPlan.hash,
      expectedSnapshotRevision: clearPlan.snapshotRevision,
      idempotencyKey: 'record-layout-clear-0001',
      approvalToken: engine.expectedApprovalToken(clearPlan.hash),
      actor: { principalId: 'user:local', kind: 'human' },
      assertions: { databaseAbsent: false },
    });
    expect(readFileSync(recordPath, 'utf8')).not.toContain('page_layout_override:');
    expect(index.getById(record.id)?.pageLayoutOverride).toBeUndefined();
  });

  test('commits default Status workflow groups and stores its readable option key', async () => {
    const state = desiredState() as unknown as {
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
      sampleRecords: Array<{ values: Record<string, unknown> }>;
    };
    const sourceState = state.sources[0];
    const sample = state.sampleRecords[0];
    if (!sourceState || !sample) throw new Error('expected Status commit fixtures');
    sourceState.properties[1] = { key: 'status', name: 'Status', type: 'status' };
    sample.values.status = 'not_started';
    const { contentDir, draft, plan, engine, commitInput, index } = await fixture({
      desiredState: state as never,
    });
    const property = draft.normalized.definition.sources[0]?.properties[1];
    if (!property || property.type !== 'status') throw new Error('expected normalized Status');

    await engine.commit(commitInput());
    const recordPath = join(contentDir, plan.diff.records[0]?.path ?? 'missing-status-record');
    expect(readFileSync(recordPath, 'utf8')).toContain('status: not_started');
    expect(index.list(draft.normalized.definition.id)[0]?.values[property.id]).toBe(
      property.options.find((option) => option.key === 'not_started')?.id,
    );
    expect(property.groups.map((group) => group.category)).toEqual([
      'todo',
      'in_progress',
      'complete',
    ]);
  });

  test('commits and re-indexes a structured Date without losing range metadata', async () => {
    const state = desiredState() as unknown as {
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
      sampleRecords: Array<{ values: Record<string, unknown> }>;
    };
    const sourceState = state.sources[0];
    const sample = state.sampleRecords[0];
    if (!sourceState || !sample) throw new Error('expected Date commit fixtures');
    sourceState.properties.push({ key: 'due', name: 'Due', type: 'date' });
    sample.values.due = {
      start: '2026-07-20T00:00:00Z',
      end: '2026-07-20T01:00:00Z',
      timeZone: 'Asia/Seoul',
      reminder: { anchor: 'start', minutesBefore: 30 },
    };
    const { contentDir, draft, plan, engine, commitInput, index } = await fixture({
      desiredState: state as never,
    });
    const property = draft.normalized.definition.sources[0]?.properties.find(
      (candidate) => candidate.key === 'due',
    );
    if (!property || property.type !== 'date') throw new Error('expected normalized Date');

    await engine.commit(commitInput());
    const recordPath = join(contentDir, plan.diff.records[0]?.path ?? 'missing-date-record');
    const markdown = readFileSync(recordPath, 'utf8');
    expect(markdown).toContain('start: 2026-07-20T00:00:00Z');
    expect(markdown).toContain('timeZone: Asia/Seoul');
    expect(index.list(draft.normalized.definition.id)[0]?.values[property.id]).toEqual(
      sample.values.due,
    );
  });

  test('commits Person keys, re-indexes stable IDs, and finds records by display identity', async () => {
    const state = desiredState() as unknown as {
      database: Record<string, unknown>;
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
      sampleRecords: Array<{ values: Record<string, unknown> }>;
    };
    state.database.people = [
      {
        key: 'local_owner',
        name: 'Local Owner',
        kind: 'local',
        subjectId: 'principal-local',
      },
      {
        key: 'codex',
        name: 'Codex',
        kind: 'agent',
        subjectId: 'agent:codex',
      },
    ];
    const sourceState = state.sources[0];
    const sample = state.sampleRecords[0];
    if (!sourceState || !sample) throw new Error('expected Person commit fixtures');
    sourceState.properties.push({
      key: 'owners',
      name: 'Owners',
      type: 'person',
      multiple: true,
    });
    sample.values.owners = ['local_owner', 'codex'];
    const { contentDir, draft, plan, engine, commitInput, index, plans } = await fixture({
      desiredState: state as never,
    });
    const property = draft.normalized.definition.sources[0]?.properties.find(
      (candidate) => candidate.key === 'owners',
    );
    if (!property || property.type !== 'person') throw new Error('expected normalized Person');

    await engine.commit(commitInput());
    const recordPath = join(contentDir, plan.diff.records[0]?.path ?? 'missing-person-record');
    const markdown = readFileSync(recordPath, 'utf8');
    expect(markdown).toContain('owners:\n  - local_owner\n  - codex');
    const indexed = index.list(draft.normalized.definition.id)[0];
    expect(indexed?.values[property.id]).toEqual(
      draft.normalized.definition.people.map((p) => p.id),
    );
    const source = draft.normalized.definition.sources[0];
    const title = source?.properties[0];
    if (!source || !title) throw new Error('expected normalized Person source and title');
    const found = index.searchText({
      databaseId: draft.normalized.definition.id,
      sourceId: source.id,
      text: 'Codex',
      propertyIds: [property.id],
      titlePropertyId: title.id,
      includeBody: false,
      limit: 10,
    });
    expect(found.hits.map((hit) => hit.recordId)).toEqual([indexed?.id]);
    expect(found.hits[0]?.evidence[0]?.snippet).toContain('Codex codex person_');
    const repeated = plans.createDraft(state as never);
    expect(repeated.normalized.definition.people.map((person) => person.id)).toEqual(
      draft.normalized.definition.people.map((person) => person.id),
    );

    const unsafeKeyChange = stableDesiredState(draft) as typeof state & {
      database: Record<string, unknown> & { people: Array<Record<string, unknown>> };
    };
    unsafeKeyChange.database.people = draft.normalized.definition.people.map((person) => ({
      ...person,
      key: person.key === 'local_owner' ? 'renamed_owner' : person.key,
    }));
    unsafeKeyChange.sampleRecords = [];
    const migrationDraft = plans.createDraft(unsafeKeyChange as never);
    const migrationPlan = plans.createPlan(migrationDraft.id);
    expect(migrationPlan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'source_record_migration_required' }),
      ]),
    );
  });

  test('commits ordered Files objects, indexes captions, and supports identity-based add/remove mutations', async () => {
    const state = desiredState() as unknown as {
      sources: Array<{ properties: Array<Record<string, unknown>> }>;
      sampleRecords: Array<{ values: Record<string, unknown> }>;
    };
    const sourceState = state.sources[0];
    const sample = state.sampleRecords[0];
    if (!sourceState || !sample) throw new Error('expected Files commit fixtures');
    sourceState.properties.push({ key: 'assets', name: 'Assets', type: 'files', required: true });
    sample.values.assets = [
      { kind: 'local', path: 'assets/brief.pdf', caption: 'Approved source brief' },
      {
        kind: 'external',
        url: 'https://cdn.example.com/demo.mp4',
        name: 'Demo video',
        caption: 'Final cut',
      },
    ];
    const { contentDir, draft, plan, engine, commitInput, index, plans } = await fixture({
      desiredState: state as never,
    });
    const property = draft.normalized.definition.sources[0]?.properties.find(
      (candidate) => candidate.key === 'assets',
    );
    if (!property || property.type !== 'files') throw new Error('expected normalized Files');

    await engine.commit(commitInput());
    const recordPath = join(contentDir, plan.diff.records[0]?.path ?? 'missing-files-record');
    const markdown = readFileSync(recordPath, 'utf8');
    expect(markdown).toContain('kind: local\n    path: assets/brief.pdf');
    expect(markdown).toContain('caption: Approved source brief');
    const indexed = index.list(draft.normalized.definition.id)[0];
    expect(indexed?.values[property.id]).toEqual(sample.values.assets);
    const source = draft.normalized.definition.sources[0];
    const title = source?.properties.find((candidate) => candidate.type === 'title');
    if (!source || !title || !indexed?.revision) throw new Error('expected indexed Files record');
    expect(
      index
        .searchText({
          databaseId: draft.normalized.definition.id,
          sourceId: source.id,
          text: 'Approved',
          propertyIds: [property.id],
          titlePropertyId: title.id,
          includeBody: false,
          limit: 10,
        })
        .hits.map((hit) => hit.recordId),
    ).toEqual([indexed.id]);

    const mutationState = stableDesiredState(draft) as typeof state & {
      sampleRecords: unknown[];
      recordMutations: unknown[];
    };
    mutationState.sampleRecords = [];
    mutationState.recordMutations = [
      {
        id: indexed.id,
        expectedRevision: indexed.revision,
        sourceKey: source.key,
        operations: [
          { op: 'remove', propertyKey: property.key, value: 'assets/brief.pdf' },
          {
            op: 'add',
            propertyKey: property.key,
            value: {
              kind: 'local',
              path: 'assets/poster.png',
              name: 'Poster',
              caption: 'Launch poster',
            },
          },
        ],
      },
    ];
    const mutationDraft = plans.createDraft(mutationState as never);
    const mutationPlan = plans.createPlan(mutationDraft.id);
    expect(mutationDraft.normalized.recordMutations[0]?.operations).toEqual([
      { kind: 'remove', propertyId: property.id, value: 'assets/brief.pdf' },
      { kind: 'add', propertyId: property.id, value: 'assets/poster.png' },
    ]);
    await engine.commit({
      planId: mutationPlan.id,
      planHash: mutationPlan.hash,
      expectedSnapshotRevision: mutationPlan.snapshotRevision,
      idempotencyKey: 'files-mutation-0002',
      approvalToken: engine.expectedApprovalToken(mutationPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent', sessionId: 'session-files' },
    });
    expect(index.list(draft.normalized.definition.id)[0]?.values[property.id]).toEqual([
      sample.values.assets[1],
      {
        kind: 'local',
        path: 'assets/poster.png',
        name: 'Poster',
        caption: 'Launch poster',
      },
    ]);
  });

  test('recompiles a repeated key-addressed ensure to existing stable IDs and unique record ID', async () => {
    const { draft, engine, commitInput, plans, index } = await fixture();
    await engine.commit(commitInput());
    const indexed = index.list(draft.normalized.definition.id)[0];
    if (!indexed?.revision) throw new Error('expected indexed record');

    const repeatedDraft = plans.createDraft(desiredState());
    expect(repeatedDraft.normalized.definition).toEqual(draft.normalized.definition);
    expect(repeatedDraft.normalized.sampleRecords[0]).toMatchObject({
      id: indexed.id,
      expectedRevision: indexed.revision,
    });
    expect(repeatedDraft.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'database', via: 'stable_key' }),
        expect.objectContaining({ kind: 'source', via: 'stable_key' }),
        expect.objectContaining({ kind: 'property', via: 'stable_key' }),
        expect.objectContaining({ kind: 'option', via: 'stable_key' }),
        expect.objectContaining({
          kind: 'record',
          targetId: indexed.id,
          via: 'unique_property',
        }),
      ]),
    );
    const repeatedPlan = plans.createPlan(repeatedDraft.id);
    expect(repeatedPlan).toMatchObject({
      conflicts: [],
      requiresCommit: false,
      committable: false,
      diff: { manifests: [], records: [] },
    });
    expect(repeatedPlan.targetResolutions).toEqual(repeatedDraft.normalized.targetResolutions);
  });

  test('compiles and atomically commits all fine-grained record mutation operations', async () => {
    const initial = desiredState();
    initial.sources[0]?.properties.push(
      { key: 'note', name: 'Note', type: 'text' } as never,
      { key: 'details', name: 'Details', type: 'text' } as never,
      { key: 'score', name: 'Score', type: 'number' } as never,
      {
        key: 'tags',
        name: 'Tags',
        type: 'multi_select',
        options: [
          { key: 'red', name: 'Red' },
          { key: 'blue', name: 'Blue' },
        ],
      } as never,
      {
        key: 'related',
        name: 'Related',
        type: 'relation',
        targetSourceKey: 'tasks',
        cardinality: 'many',
        pairedPropertyKey: 'related_by',
      } as never,
      {
        key: 'related_by',
        name: 'Related by',
        type: 'relation',
        targetSourceKey: 'tasks',
        cardinality: 'many',
        pairedPropertyKey: 'related',
      } as never,
    );
    initial.sampleRecords = [
      {
        id: 'rec_mutation_subject',
        sourceKey: 'tasks',
        values: {
          title: 'Mutation subject',
          status: 'todo',
          note: 'remove me',
          details: 'Start',
          score: 2,
          tags: ['red'],
          related: ['rec_old_link'],
        },
        body: 'Body',
      },
      {
        id: 'rec_old_link',
        sourceKey: 'tasks',
        values: {
          title: 'Old link',
          status: 'todo',
          related_by: ['rec_mutation_subject'],
        },
        body: '',
      },
      {
        id: 'rec_new_link',
        sourceKey: 'tasks',
        values: { title: 'New link', status: 'todo' },
        body: '',
      },
    ] as never;
    const { contentDir, draft, engine, commitInput, plans, index, store } = await fixture({
      desiredState: initial,
    });
    await engine.commit(commitInput());
    const subject = index.getById('rec_mutation_subject');
    if (!subject?.revision) throw new Error('expected mutation subject');
    const state = stableDesiredState(draft);
    state.sampleRecords = [];
    state.recordMutations = [
      {
        id: subject.id,
        expectedRevision: subject.revision,
        sourceKey: 'tasks',
        operations: [
          { op: 'set', propertyKey: 'title', value: 'Renamed without path move' },
          { op: 'set', propertyKey: 'status', value: 'done' },
          { op: 'unset', propertyKey: 'note' },
          { op: 'add', propertyKey: 'tags', value: 'blue' },
          { op: 'remove', propertyKey: 'tags', value: 'red' },
          { op: 'increment', propertyKey: 'score', by: 3 },
          { op: 'append', propertyKey: 'details', value: ' + more' },
          { op: 'append', value: '\nTail' },
          { op: 'unlink', propertyKey: 'related', recordId: 'rec_old_link' },
          { op: 'link', propertyKey: 'related', recordId: 'rec_new_link' },
        ],
      },
    ];
    const mutationDraft = plans.createDraft(state);
    const mutationPlan = plans.createPlan(mutationDraft.id);
    expect(
      mutationPlan.normalizedOperations.find((operation) => operation.kind === 'mutate_record'),
    ).toMatchObject({
      recordId: subject.id,
      operations: [
        { kind: 'set' },
        { kind: 'set' },
        { kind: 'unset' },
        { kind: 'add' },
        { kind: 'remove' },
        { kind: 'increment', by: 3 },
        { kind: 'append' },
        { kind: 'append', propertyId: null },
        { kind: 'unlink', recordId: 'rec_old_link' },
        { kind: 'link', recordId: 'rec_new_link' },
      ],
    });
    expect(mutationPlan.diff.manifests).toEqual([]);
    expect(mutationPlan.diff.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recordId: subject.id, action: 'update' }),
        expect.objectContaining({ recordId: 'rec_old_link', action: 'update' }),
        expect.objectContaining({ recordId: 'rec_new_link', action: 'update' }),
      ]),
    );
    expect(mutationPlan.diff.records).toHaveLength(3);
    const mutationCommitInput = {
      planId: mutationPlan.id,
      planHash: mutationPlan.hash,
      expectedSnapshotRevision: mutationPlan.snapshotRevision,
      idempotencyKey: 'fine-grained-mutation-0001',
      approvalToken: engine.expectedApprovalToken(mutationPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' as const },
      assertions: { databaseAbsent: false },
    };
    const committed = await engine.commit(mutationCommitInput);
    expect(committed.actualDiff.map((delta) => delta.operation)).toEqual([
      'update',
      'update',
      'update',
    ]);
    const source = draft.normalized.definition.sources[0];
    if (!source) throw new Error('expected source');
    const propertyId = (key: string) => {
      const property = source.properties.find((candidate) => candidate.key === key);
      if (!property) throw new Error(`missing property ${key}`);
      return property.id;
    };
    const updated = index.getById(subject.id);
    expect(updated).toMatchObject({ body: 'Body\nTail' });
    expect(updated?.path).toBe(subject.path);
    expect(updated?.values[propertyId('title')]).toBe('Renamed without path move');
    expect(updated?.values[propertyId('status')]).toMatch(/^opt_/);
    expect(updated?.values[propertyId('note')]).toBeUndefined();
    expect(updated?.values[propertyId('details')]).toBe('Start + more');
    expect(updated?.values[propertyId('score')]).toBe(5);
    expect(updated?.values[propertyId('tags')]).toEqual([
      source.properties
        .find((property) => property.key === 'tags' && property.type === 'multi_select')
        ?.options.find((option) => option.key === 'blue')?.id,
    ]);
    expect(updated?.values[propertyId('related')]).toEqual(['rec_new_link']);
    expect(index.getById('rec_old_link')?.values[propertyId('related_by')]).toEqual([]);
    expect(index.getById('rec_new_link')?.values[propertyId('related_by')]).toEqual([
      'rec_mutation_subject',
    ]);
    const updatedMarkdown = readFileSync(join(contentDir, updated?.path ?? ''), 'utf8');
    expect(updatedMarkdown).toContain('title: Renamed without path move');
    expect(updatedMarkdown).toContain('score: 5');

    const replay = await engine.commit(mutationCommitInput);
    expect(replay.idempotentReplay).toBe(true);
    expect(index.getById(subject.id)).toMatchObject({ body: 'Body\nTail' });
    expect(index.getById(subject.id)?.values[propertyId('score')]).toBe(5);

    const staleState = stableDesiredState(draft);
    staleState.sampleRecords = [];
    staleState.recordMutations = [
      {
        id: subject.id,
        expectedRevision: subject.revision,
        sourceKey: 'tasks',
        operations: [{ op: 'set', propertyKey: 'status', value: 'todo' }],
      },
    ];
    const stalePlan = plans.createPlan(plans.createDraft(staleState).id);
    expect(stalePlan.committable).toBe(false);
    expect(stalePlan.conflicts).toContainEqual(
      expect.objectContaining({ code: 'record_revision_changed', targetId: subject.id }),
    );

    const latest = index.getById(subject.id);
    if (!latest?.revision) throw new Error('expected updated revision');
    const idempotentState = stableDesiredState(draft);
    idempotentState.sampleRecords = [];
    idempotentState.recordMutations = [
      {
        id: latest.id,
        expectedRevision: latest.revision,
        sourceKey: 'tasks',
        operations: [
          { op: 'set', propertyKey: 'status', value: 'done' },
          { op: 'unset', propertyKey: 'note' },
          { op: 'add', propertyKey: 'tags', value: 'blue' },
          { op: 'remove', propertyKey: 'tags', value: 'red' },
          { op: 'unlink', propertyKey: 'related', recordId: 'rec_old_link' },
          { op: 'link', propertyKey: 'related', recordId: 'rec_new_link' },
        ],
      },
    ];
    const noOpPlan = plans.createPlan(plans.createDraft(idempotentState).id);
    expect(noOpPlan).toMatchObject({ requiresCommit: false, committable: false, conflicts: [] });
    expect(noOpPlan.diff.records).toEqual([]);

    const removalState = stableDesiredState(draft);
    removalState.sources[0].properties = removalState.sources[0].properties.filter(
      (property) => property.key !== 'related' && property.key !== 'related_by',
    );
    removalState.recordMutations = [];
    const removalSubject = index.getById('rec_mutation_subject');
    const removalOld = index.getById('rec_old_link');
    const removalNew = index.getById('rec_new_link');
    if (!removalSubject?.revision || !removalOld?.revision || !removalNew?.revision) {
      throw new Error('expected revision-bound relation removal records');
    }
    removalState.sampleRecords = [
      {
        id: removalSubject.id,
        expectedRevision: removalSubject.revision,
        sourceKey: 'tasks',
        values: {
          title: 'Renamed without path move',
          status: 'done',
          details: 'Start + more',
          score: 5,
          tags: ['blue'],
        },
        body: 'Body\nTail',
      },
      {
        id: removalOld.id,
        expectedRevision: removalOld.revision,
        sourceKey: 'tasks',
        values: { title: 'Old link', status: 'todo' },
        body: '',
      },
      {
        id: removalNew.id,
        expectedRevision: removalNew.revision,
        sourceKey: 'tasks',
        values: { title: 'New link', status: 'todo' },
        body: '',
      },
    ];
    const removalDraft = plans.createDraft(removalState);
    const removalPlan = plans.createPlan(removalDraft.id);
    expect(removalPlan.committable).toBe(true);
    expect(removalPlan.diff.records).toHaveLength(3);
    await engine.commit({
      planId: removalPlan.id,
      planHash: removalPlan.hash,
      expectedSnapshotRevision: removalPlan.snapshotRevision,
      idempotencyKey: 'paired-relation-removal-0001',
      approvalToken: engine.expectedApprovalToken(removalPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(index.getById('rec_mutation_subject')?.values[propertyId('related')]).toBeUndefined();
    expect(index.getById('rec_new_link')?.values[propertyId('related_by')]).toBeUndefined();

    const restorationState = stableDesiredState(draft);
    restorationState.sampleRecords = [];
    restorationState.recordMutations = [];
    const restorationDraft = plans.createDraft(restorationState);
    const restoredRelated = restorationDraft.normalized.definition.sources[0]?.properties.find(
      (property) => property.key === 'related',
    );
    const restoredRelatedBy = restorationDraft.normalized.definition.sources[0]?.properties.find(
      (property) => property.key === 'related_by',
    );
    expect(restoredRelated?.id).toBe(propertyId('related'));
    expect(restoredRelatedBy?.id).toBe(propertyId('related_by'));
    const restorationPlan = plans.createPlan(restorationDraft.id);
    expect(restorationPlan.committable).toBe(true);
    expect(restorationPlan.diff.records).toEqual([]);
    await engine.commit({
      planId: restorationPlan.id,
      planHash: restorationPlan.hash,
      expectedSnapshotRevision: restorationPlan.snapshotRevision,
      idempotencyKey: 'paired-relation-restoration-0001',
      approvalToken: engine.expectedApprovalToken(restorationPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    const restoredDefinition = store.getById(draft.normalized.definition.id);
    const restoredPair = restoredDefinition?.sources[0]?.properties.find(
      (property) => property.key === 'related',
    );
    expect(restoredPair).toMatchObject({
      id: propertyId('related'),
      pairedPropertyId: propertyId('related_by'),
    });
  });

  test('atomically updates schema and records, preserves unrelated frontmatter, and durably undoes', async () => {
    const { projectDir, contentDir, store, index, plans, draft, engine, commitInput } =
      await fixture();
    await engine.commit(commitInput());
    const originalRecord = index.list(draft.normalized.definition.id)[0];
    if (!originalRecord) throw new Error('expected committed record');
    const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    const recordPath = join(contentDir, originalRecord.path);
    const originalManifest = readFileSync(manifestPath, 'utf8').replace(
      'name: Committed tasks',
      '# retained manifest comment\nname: Committed tasks',
    );
    writeFileSync(manifestPath, originalManifest);
    const withExternalFrontmatter = readFileSync(recordPath, 'utf8').replace(
      'title: Atomic commit',
      '# retained user metadata\nexternal_note: keep\ntitle: Atomic commit',
    );
    writeFileSync(recordPath, withExternalFrontmatter);
    await index.rebuild();
    const currentRecord = index.getById(originalRecord.id);
    if (!currentRecord?.revision) throw new Error('expected current record revision');

    const state = stableDesiredState(draft);
    const status = state.sources[0]?.properties[1];
    if (!status) throw new Error('expected status property');
    status.key = 'workflow_status';
    status.name = 'Workflow status';
    state.sampleRecords = [
      {
        id: currentRecord.id,
        expectedRevision: currentRecord.revision,
        sourceKey: 'tasks',
        values: { title: 'Atomic commit', workflow_status: 'done' },
        body: 'Updated through stable-ID upsert.\n',
      },
    ];
    const updateDraft = plans.createDraft(state);
    const updatePlan = plans.createPlan(updateDraft.id);
    expect(updatePlan.normalizedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ensure_database', action: 'update' }),
        expect.objectContaining({ kind: 'ensure_property', action: 'update' }),
        expect.objectContaining({
          kind: 'upsert_records',
          created: 0,
          updated: 1,
          unchanged: 0,
        }),
      ]),
    );

    const result = await engine.commit({
      planId: updatePlan.id,
      planHash: updatePlan.hash,
      expectedSnapshotRevision: updatePlan.snapshotRevision,
      idempotencyKey: 'schema-record-update-0001',
      approvalToken: engine.expectedApprovalToken(updatePlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(result.actualDiff.map((delta) => delta.operation)).toEqual(['update', 'update']);
    expect(readFileSync(manifestPath, 'utf8')).toContain('key: workflow_status');
    expect(readFileSync(manifestPath, 'utf8')).toContain('# retained manifest comment');
    const updatedMarkdown = readFileSync(recordPath, 'utf8');
    expect(updatedMarkdown).toContain('# retained user metadata');
    expect(updatedMarkdown).toContain('external_note: keep');
    expect(updatedMarkdown).toContain('workflow_status: done');
    expect(updatedMarkdown).not.toContain('\nstatus: todo');
    expect(index.getById(currentRecord.id)).toMatchObject({
      body: 'Updated through stable-ID upsert.\n',
    });

    const restarted = createDatabaseCommitEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      git: {
        snapshot: async () => 'f'.repeat(40),
        hashBlob: async () => `sha1:${'a'.repeat(40)}`,
      },
    });
    const preview = await restarted.undo({ action: 'preview', undoToken: result.undoToken });
    expect(preview.canApply).toBe(true);
    const undone = await restarted.undo({
      action: 'apply',
      undoToken: result.undoToken,
      idempotencyKey: 'schema-record-undo-0001',
      actor: { principalId: 'agent:codex', kind: 'agent' },
    });
    expect(undone.canApply).toBe(true);
    expect(readFileSync(manifestPath, 'utf8')).toBe(originalManifest);
    expect(readFileSync(recordPath, 'utf8')).toBe(withExternalFrontmatter);
  });

  test('adds a new schema property via a desired-state diff and lets a record use it', async () => {
    const { projectDir, contentDir, store, index, plans, draft, engine, commitInput } =
      await fixture();
    await engine.commit(commitInput());
    const originalRecord = index.list(draft.normalized.definition.id)[0];
    if (!originalRecord?.revision) throw new Error('expected committed record');

    const state = stableDesiredState(draft);
    state.sources[0]?.properties.push({ key: 'priority', name: 'Priority', type: 'number' });
    state.sampleRecords = [
      {
        id: originalRecord.id,
        expectedRevision: originalRecord.revision,
        sourceKey: 'tasks',
        values: { title: 'Atomic commit', status: 'todo', priority: 3 },
        body: 'Created only after the exact plan is approved.\n',
      },
    ];
    const addDraft = plans.createDraft(state);
    const addPlan = plans.createPlan(addDraft.id);
    expect(addPlan.normalizedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ensure_property', action: 'create' }),
      ]),
    );

    const result = await engine.commit({
      planId: addPlan.id,
      planHash: addPlan.hash,
      expectedSnapshotRevision: addPlan.snapshotRevision,
      idempotencyKey: 'add-property-0001',
      approvalToken: engine.expectedApprovalToken(addPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(result.verification.status).toBe('passed');
    const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    expect(readFileSync(manifestPath, 'utf8')).toContain('key: priority');
    const recordPath = join(contentDir, originalRecord.path);
    expect(readFileSync(recordPath, 'utf8')).toContain('priority: 3');
    const priorityProperty = store
      .getById(draft.normalized.definition.id)
      ?.sources.find((source) => source.key === 'tasks')
      ?.properties.find((property) => property.key === 'priority');
    if (!priorityProperty) throw new Error('expected the newly created priority property');
    const updatedRecord = index.getById(originalRecord.id);
    expect(updatedRecord?.values[priorityProperty.id]).toBe(3);
  });

  test('removes an existing schema property in two safe steps: unset by patch, then drop from schema', async () => {
    // A `sampleRecords` upsert is a full replace and requires `body`, which
    // `ProjectedDatabaseRecord` never carries (confirmed by an earlier
    // regression here: omitting `body` silently truncated the record to
    // empty). `recordMutations`/`unset` is a patch that preserves body, but
    // it validates `propertyKey` against the FINAL desired schema, so it
    // cannot reference a property removed in that same submission. The only
    // combination that is both correct and body-safe is two commits: first
    // unset the value while the property still exists, then drop the
    // now-unused property from the schema with no record migration at all.
    const { projectDir, contentDir, index, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());
    const originalRecord = index.list(draft.normalized.definition.id)[0];
    if (!originalRecord?.revision) throw new Error('expected committed record');
    const recordPath = join(contentDir, originalRecord.path);
    const bodyOf = (contents: string) => contents.split('\n---\n').slice(1).join('\n---\n');
    const originalBody = bodyOf(readFileSync(recordPath, 'utf8'));

    const unsetState = stableDesiredState(draft);
    unsetState.sampleRecords = [];
    unsetState.recordMutations = [
      {
        id: originalRecord.id,
        expectedRevision: originalRecord.revision,
        sourceKey: 'tasks',
        operations: [{ op: 'unset', propertyKey: 'status' }],
      },
    ];
    const unsetDraft = plans.createDraft(unsetState);
    const unsetPlan = plans.createPlan(unsetDraft.id);
    const unsetResult = await engine.commit({
      planId: unsetPlan.id,
      planHash: unsetPlan.hash,
      expectedSnapshotRevision: unsetPlan.snapshotRevision,
      idempotencyKey: 'unset-property-0001',
      approvalToken: engine.expectedApprovalToken(unsetPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(unsetResult.verification.status).toBe('passed');
    expect(readFileSync(recordPath, 'utf8')).not.toContain('status:');
    expect(bodyOf(readFileSync(recordPath, 'utf8'))).toBe(originalBody);

    const removeState = stableDesiredState(draft);
    const statusProperty = removeState.sources[0]?.properties[1];
    if (statusProperty?.key !== 'status' || !statusProperty.id) {
      throw new Error('expected an identified status property at index 1');
    }
    const statusPropertyId = statusProperty.id;
    removeState.sources[0].properties = removeState.sources[0].properties.filter(
      (property) => property.key !== 'status',
    );
    removeState.sampleRecords = [];
    const removeDraft = plans.createDraft(removeState);
    const removePlan = plans.createPlan(removeDraft.id);
    expect(removePlan.committable).toBe(true);
    expect(removePlan.normalizedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'alter_schema',
          removedIds: expect.arrayContaining([expect.any(String)]),
        }),
      ]),
    );

    const removeResult = await engine.commit({
      planId: removePlan.id,
      planHash: removePlan.hash,
      expectedSnapshotRevision: removePlan.snapshotRevision,
      idempotencyKey: 'remove-property-0001',
      approvalToken: engine.expectedApprovalToken(removePlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(removeResult.verification.status).toBe('passed');
    expect(bodyOf(readFileSync(recordPath, 'utf8'))).toBe(originalBody);
    const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    expect(readFileSync(manifestPath, 'utf8')).not.toContain('key: status');
    const updatedRecord = index.getById(originalRecord.id);
    expect(updatedRecord?.values[statusPropertyId]).toBeUndefined();
  });

  test('reorders schema properties without moving the server to reject the diff', async () => {
    const { projectDir, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());

    const state = stableDesiredState(draft);
    const properties = state.sources[0]?.properties;
    if (!properties) throw new Error('expected source properties');
    state.sources[0].properties = [...properties].reverse();
    state.sampleRecords = [];
    const reorderDraft = plans.createDraft(state);
    const reorderPlan = plans.createPlan(reorderDraft.id);

    const result = await engine.commit({
      planId: reorderPlan.id,
      planHash: reorderPlan.hash,
      expectedSnapshotRevision: reorderPlan.snapshotRevision,
      idempotencyKey: 'reorder-properties-0001',
      approvalToken: engine.expectedApprovalToken(reorderPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(result.verification.status).toBe('passed');
    const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    const manifest = readFileSync(manifestPath, 'utf8');
    expect(manifest.indexOf('key: status')).toBeLessThan(manifest.indexOf('key: title'));
  });

  test('atomically merges a Select option into a stable target and rewrites only affected records', async () => {
    const { projectDir, contentDir, index, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());
    const record = index.list(draft.normalized.definition.id)[0];
    if (!record?.revision) throw new Error('expected committed Select record');
    const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    const recordPath = join(contentDir, record.path);
    const beforeManifest = readFileSync(manifestPath, 'utf8');
    const beforeRecord = readFileSync(recordPath, 'utf8');

    const state = stableDesiredState(draft);
    const status = state.sources[0]?.properties[1];
    if (!status || !Array.isArray(status.options)) throw new Error('expected Select options');
    const done = status.options.find((option) => option.key === 'done');
    if (!done?.id) throw new Error('expected stable done option');
    status.options = status.options.filter((option) => option.key !== 'todo');
    state.sampleRecords = [];
    state.recordMutations = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        operations: [{ op: 'set', propertyKey: 'status', value: done.id }],
      },
    ];
    const mergePlan = plans.createPlan(plans.createDraft(state).id);
    expect(mergePlan).toMatchObject({
      committable: true,
      conflicts: [],
      diff: {
        manifests: [expect.objectContaining({ action: 'update' })],
        records: [expect.objectContaining({ recordId: record.id, action: 'update' })],
      },
    });
    const result = await engine.commit({
      planId: mergePlan.id,
      planHash: mergePlan.hash,
      expectedSnapshotRevision: mergePlan.snapshotRevision,
      idempotencyKey: 'select-option-merge-0001',
      approvalToken: engine.expectedApprovalToken(mergePlan.hash),
      actor: { principalId: 'user:local', kind: 'human' },
      assertions: { databaseAbsent: false },
    });
    expect(result.actualDiff.map((delta) => delta.operation)).toEqual(['update', 'update']);
    expect(readFileSync(manifestPath, 'utf8')).not.toContain('key: todo');
    expect(readFileSync(manifestPath, 'utf8')).toContain('key: done');
    expect(readFileSync(recordPath, 'utf8')).toContain('status: done');
    expect(index.getById(record.id)?.values).toMatchObject({
      [status.id as string]: done.id,
    });

    const undone = await engine.undo({
      action: 'apply',
      undoToken: result.undoToken,
      idempotencyKey: 'select-option-merge-undo-0001',
      actor: { principalId: 'user:local', kind: 'human' },
    });
    expect(undone.canApply).toBe(true);
    expect(readFileSync(manifestPath, 'utf8')).toBe(beforeManifest);
    expect(readFileSync(recordPath, 'utf8')).toBe(beforeRecord);
  });

  test('atomically deletes an exact revision and durably restores it with undo', async () => {
    const { contentDir, index, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());
    const record = index.list(draft.normalized.definition.id)[0];
    if (!record?.revision) throw new Error('expected committed deletion target');
    const recordPath = join(contentDir, record.path);
    const originalMarkdown = readFileSync(recordPath, 'utf8');

    const state = stableDesiredState(draft);
    state.sampleRecords = [];
    state.recordDeletions = [
      { id: record.id, expectedRevision: record.revision, sourceKey: 'tasks' },
    ];
    const deletionPlan = plans.createPlan(plans.createDraft(state).id);
    expect(deletionPlan).toMatchObject({
      committable: true,
      risk: { level: 'high' },
      approvals: expect.arrayContaining([
        expect.objectContaining({ code: 'delete_record', required: true }),
      ]),
      diff: {
        manifests: [],
        records: [{ recordId: record.id, action: 'delete', after: null }],
      },
    });
    const deleted = await engine.commit({
      planId: deletionPlan.id,
      planHash: deletionPlan.hash,
      expectedSnapshotRevision: deletionPlan.snapshotRevision,
      idempotencyKey: 'record-delete-0001',
      approvalToken: engine.expectedApprovalToken(deletionPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(deleted.actualDiff).toEqual([
      expect.objectContaining({
        operation: 'delete',
        path: expect.stringContaining(record.path),
        before: expect.objectContaining({ sha256: record.revision }),
        after: null,
      }),
    ]);
    expect(existsSync(recordPath)).toBe(false);
    expect(index.getById(record.id)).toBeNull();

    const preview = await engine.undo({ action: 'preview', undoToken: deleted.undoToken });
    expect(preview).toMatchObject({ canApply: true, conflicts: [] });
    const restored = await engine.undo({
      action: 'apply',
      undoToken: deleted.undoToken,
      idempotencyKey: 'record-delete-undo-0001',
      actor: { principalId: 'agent:codex', kind: 'agent' },
    });
    expect(restored).toMatchObject({ canApply: true, receipt: { status: 'applied' } });
    expect(readFileSync(recordPath, 'utf8')).toBe(originalMarkdown);
    expect(index.getById(record.id)).toMatchObject({
      id: record.id,
      revision: record.revision,
      body: record.body,
    });
  });

  test('atomically deletes a complete database and restores its manifest and records with undo', async () => {
    const { projectDir, contentDir, store, index, plans, draft, plan, engine, commitInput } =
      await fixture();
    await engine.commit(commitInput());
    const databaseId = draft.normalized.definition.id;
    const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    const recordPath = join(contentDir, plan.diff.records[0]?.path ?? 'missing-record-path');
    const manifestBefore = readFileSync(manifestPath, 'utf8');
    const recordBefore = readFileSync(recordPath, 'utf8');

    const deletionDraft = plans.createDatabaseDeletionDraft(databaseId, store.snapshot().revision);
    const deletionPlan = plans.createPlan(deletionDraft.id);
    expect(deletionPlan).toMatchObject({
      risk: { level: 'high' },
      conflicts: [],
      committable: true,
      approvals: expect.arrayContaining([
        expect.objectContaining({ code: 'delete_database', required: true }),
        expect.objectContaining({ code: 'delete_record', required: true }),
      ]),
      normalizedOperations: expect.arrayContaining([
        expect.objectContaining({ kind: 'delete_database', databaseId }),
      ]),
      diff: {
        manifests: [{ action: 'delete', before: manifestBefore, after: null }],
        records: [expect.objectContaining({ action: 'delete', after: null })],
      },
    });

    const deleted = await engine.commit({
      planId: deletionPlan.id,
      planHash: deletionPlan.hash,
      expectedSnapshotRevision: deletionPlan.snapshotRevision,
      idempotencyKey: 'database-delete-0001',
      approvalToken: engine.expectedApprovalToken(deletionPlan.hash),
      actor: { principalId: 'human:owner', kind: 'human' },
    });
    expect(deleted.actualDiff.map((delta) => delta.operation)).toEqual(['delete', 'delete']);
    expect(deleted.verification.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'database_absent', status: 'passed' }),
        expect.objectContaining({ code: 'records_absent', status: 'passed' }),
      ]),
    );
    expect(store.getById(databaseId)).toBeNull();
    expect(index.list(databaseId)).toEqual([]);
    expect(existsSync(manifestPath)).toBe(false);
    expect(existsSync(recordPath)).toBe(false);

    const restored = await engine.undo({
      action: 'apply',
      undoToken: deleted.undoToken,
      idempotencyKey: 'database-delete-undo-0001',
      actor: { principalId: 'human:owner', kind: 'human' },
    });
    expect(restored).toMatchObject({ canApply: true, receipt: { status: 'applied' } });
    expect(readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
    expect(readFileSync(recordPath, 'utf8')).toBe(recordBefore);
    expect(store.getById(databaseId)?.id).toBe(databaseId);
    expect(index.list(databaseId)).toHaveLength(1);
  });

  test('refuses deletion after an intervening edit and refuses undo after path recreation', async () => {
    const { contentDir, index, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());
    const record = index.list(draft.normalized.definition.id)[0];
    if (!record?.revision) throw new Error('expected committed deletion target');
    const recordPath = join(contentDir, record.path);
    const deletionState = stableDesiredState(draft);
    deletionState.sampleRecords = [];
    deletionState.recordDeletions = [
      { id: record.id, expectedRevision: record.revision, sourceKey: 'tasks' },
    ];
    const stalePlan = plans.createPlan(plans.createDraft(deletionState).id);
    writeFileSync(recordPath, `${readFileSync(recordPath, 'utf8')}intervening edit\n`);
    await expect(
      engine.commit({
        planId: stalePlan.id,
        planHash: stalePlan.hash,
        expectedSnapshotRevision: stalePlan.snapshotRevision,
        idempotencyKey: 'stale-record-delete-0001',
        approvalToken: engine.expectedApprovalToken(stalePlan.hash),
        actor: { principalId: 'agent:codex', kind: 'agent' },
        assertions: { databaseAbsent: false },
      }),
    ).rejects.toMatchObject({ code: 'target_changed' });
    expect(existsSync(recordPath)).toBe(true);

    await index.rebuild();
    const edited = index.getById(record.id);
    if (!edited?.revision) throw new Error('expected edited deletion target');
    deletionState.recordDeletions = [
      { id: edited.id, expectedRevision: edited.revision, sourceKey: 'tasks' },
    ];
    const exactPlan = plans.createPlan(plans.createDraft(deletionState).id);
    const deleted = await engine.commit({
      planId: exactPlan.id,
      planHash: exactPlan.hash,
      expectedSnapshotRevision: exactPlan.snapshotRevision,
      idempotencyKey: 'recreated-record-delete-0001',
      approvalToken: engine.expectedApprovalToken(exactPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    mkdirSync(recordPath);
    const preview = await engine.undo({ action: 'preview', undoToken: deleted.undoToken });
    expect(preview).toMatchObject({
      canApply: false,
      conflicts: [
        expect.objectContaining({
          path: expect.stringContaining(record.path),
          reason: 'path_recreated',
          observedSha256: null,
        }),
      ],
    });
  });

  test('duplicates an exact record revision and undoes only the new canonical file', async () => {
    const { contentDir, index, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());
    const sourceRecord = index.list(draft.normalized.definition.id)[0];
    if (!sourceRecord?.revision) throw new Error('expected copy source');
    const sourcePath = join(contentDir, sourceRecord.path);
    const sourceMarkdown = readFileSync(sourcePath, 'utf8');
    const state = stableDesiredState(draft);
    state.sampleRecords = [];
    state.recordCopies = [
      {
        id: sourceRecord.id,
        expectedRevision: sourceRecord.revision,
        sourceKey: 'tasks',
        newId: 'rec_atomic_copy',
        title: 'Atomic commit copy',
      },
    ];
    const copyPlan = plans.createPlan(plans.createDraft(state).id);
    const copied = await engine.commit({
      planId: copyPlan.id,
      planHash: copyPlan.hash,
      expectedSnapshotRevision: copyPlan.snapshotRevision,
      idempotencyKey: 'record-copy-0001',
      approvalToken: engine.expectedApprovalToken(copyPlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(copied.actualDiff).toEqual([
      expect.objectContaining({ operation: 'create', before: null }),
    ]);
    expect(readFileSync(sourcePath, 'utf8')).toBe(sourceMarkdown);
    const duplicate = index.getById('rec_atomic_copy');
    expect(duplicate).toMatchObject({ id: 'rec_atomic_copy', body: sourceRecord.body });
    expect(readFileSync(join(contentDir, duplicate?.path ?? 'missing-copy'), 'utf8')).toContain(
      'title: Atomic commit copy',
    );

    const undone = await engine.undo({
      action: 'apply',
      undoToken: copied.undoToken,
      idempotencyKey: 'record-copy-undo-0001',
      actor: { principalId: 'agent:codex', kind: 'agent' },
    });
    expect(undone).toMatchObject({ canApply: true, receipt: { status: 'applied' } });
    expect(index.getById('rec_atomic_copy')).toBeNull();
    expect(readFileSync(sourcePath, 'utf8')).toBe(sourceMarkdown);
  });

  test('refuses a copy when its source changes after exact planning', async () => {
    const { contentDir, index, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());
    const sourceRecord = index.list(draft.normalized.definition.id)[0];
    if (!sourceRecord?.revision) throw new Error('expected copy source');
    const state = stableDesiredState(draft);
    state.sampleRecords = [];
    state.recordCopies = [
      {
        id: sourceRecord.id,
        expectedRevision: sourceRecord.revision,
        sourceKey: 'tasks',
        newId: 'rec_stale_copy',
        title: 'Stale copy',
      },
    ];
    const copyPlan = plans.createPlan(plans.createDraft(state).id);
    const sourcePath = join(contentDir, sourceRecord.path);
    writeFileSync(sourcePath, `${readFileSync(sourcePath, 'utf8')}intervening edit\n`);
    await expect(
      engine.commit({
        planId: copyPlan.id,
        planHash: copyPlan.hash,
        expectedSnapshotRevision: copyPlan.snapshotRevision,
        idempotencyKey: 'stale-record-copy-0001',
        approvalToken: engine.expectedApprovalToken(copyPlan.hash),
        actor: { principalId: 'agent:codex', kind: 'agent' },
        assertions: { databaseAbsent: false },
      }),
    ).rejects.toMatchObject({ code: 'target_changed' });
    expect(index.getById('rec_stale_copy')).toBeNull();
  });

  test('archives and restores canonical record state without moving the Markdown file', async () => {
    const { contentDir, index, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());
    const record = index.list(draft.normalized.definition.id)[0];
    const source = draft.normalized.definition.sources[0];
    if (!record?.revision || !source) throw new Error('expected archive fixture');
    const recordPath = join(contentDir, record.path);
    const state = stableDesiredState(draft);
    state.sampleRecords = [];
    state.recordArchives = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        action: 'archive',
      },
    ];
    const archivePlan = plans.createPlan(plans.createDraft(state).id);
    expect(archivePlan.normalizedOperations).toContainEqual({
      kind: 'archive_records',
      sourceId: source.id,
      records: [
        {
          recordId: record.id,
          action: 'archive',
          archivedAt: '2026-07-19T10:00:00.000Z',
        },
      ],
    });
    const archived = await engine.commit({
      planId: archivePlan.id,
      planHash: archivePlan.hash,
      expectedSnapshotRevision: archivePlan.snapshotRevision,
      idempotencyKey: 'record-archive-0001',
      approvalToken: engine.expectedApprovalToken(archivePlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(archived.actualDiff).toEqual([expect.objectContaining({ operation: 'update' })]);
    expect(existsSync(recordPath)).toBe(true);
    expect(readFileSync(recordPath, 'utf8')).toContain('archived_at: 2026-07-19T10:00:00.000Z');
    const archivedRecord = index.getById(record.id);
    expect(archivedRecord?.archivedAt).toBe('2026-07-19T10:00:00.000Z');
    expect(
      queryDatabaseRecords({
        source,
        records: index.list(draft.normalized.definition.id, source.id),
        snapshotRevision: index.snapshot().revision,
      }).records,
    ).toEqual([]);
    expect(
      queryDatabaseRecords({
        source,
        records: index.list(draft.normalized.definition.id, source.id),
        snapshotRevision: index.snapshot().revision,
        query: { includeArchived: true },
      }).records[0]?.archivedAt,
    ).toBe('2026-07-19T10:00:00.000Z');

    if (!archivedRecord?.revision) throw new Error('expected archived revision');
    const restoreState = stableDesiredState(draft);
    restoreState.sampleRecords = [];
    restoreState.recordArchives = [
      {
        id: record.id,
        expectedRevision: archivedRecord.revision,
        sourceKey: 'tasks',
        action: 'restore',
      },
    ];
    const restorePlan = plans.createPlan(plans.createDraft(restoreState).id);
    const restored = await engine.commit({
      planId: restorePlan.id,
      planHash: restorePlan.hash,
      expectedSnapshotRevision: restorePlan.snapshotRevision,
      idempotencyKey: 'record-restore-0001',
      approvalToken: engine.expectedApprovalToken(restorePlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(restored.actualDiff).toEqual([expect.objectContaining({ operation: 'update' })]);
    expect(index.getById(record.id)?.archivedAt).toBeNull();
    expect(readFileSync(recordPath, 'utf8')).not.toContain('archived_at:');
  });

  test('moves a stable record between compatible sources atomically and undoes both paths', async () => {
    const initial = {
      ...desiredState(),
      sourceMappings: [
        {
          sourceKey: 'tasks',
          targetSourceKey: 'archive',
          propertyMappings: [
            { sourcePropertyKey: 'title', targetPropertyKey: 'name' },
            {
              sourcePropertyKey: 'status',
              targetPropertyKey: 'state',
              optionMappings: [
                { sourceOptionKey: 'todo', targetOptionKey: 'open' },
                { sourceOptionKey: 'done', targetOptionKey: 'closed' },
              ],
            },
          ],
        },
      ],
    };
    initial.sources.push({
      key: 'archive',
      name: 'Archive',
      recordMeaning: 'One archived task',
      folder: 'archive',
      properties: [
        { key: 'name', name: 'Name', type: 'title', required: true },
        {
          key: 'state',
          name: 'State',
          type: 'select',
          options: [
            { key: 'open', name: 'Open' },
            { key: 'closed', name: 'Closed' },
          ],
        },
      ],
    });
    const { contentDir, index, plans, draft, engine, commitInput } = await fixture({
      desiredState: initial,
    });
    await engine.commit(commitInput());
    const record = index.list(draft.normalized.definition.id)[0];
    const source = draft.normalized.definition.sources.find((item) => item.key === 'tasks');
    const target = draft.normalized.definition.sources.find((item) => item.key === 'archive');
    if (!record?.revision || !source || !target) throw new Error('expected move fixture');
    const sourcePath = join(contentDir, record.path);
    const original = readFileSync(sourcePath, 'utf8');
    const unmappedState = stableDesiredState(draft);
    unmappedState.sampleRecords = [];
    unmappedState.sourceMappings = [];
    unmappedState.recordMoves = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: source.key,
        targetSourceKey: target.key,
      },
    ];
    try {
      plans.createDraft(unmappedState);
      throw new Error('expected the unmapped move to fail');
    } catch (cause) {
      expect(cause).toBeInstanceOf(DatabasePlanError);
      expect(String((cause as DatabasePlanError).details.reason)).toContain(
        'explicit source mapping',
      );
    }
    const state = stableDesiredState(draft);
    state.sampleRecords = [];
    state.recordMoves = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: source.key,
        targetSourceKey: target.key,
      },
    ];
    const movePlan = plans.createPlan(plans.createDraft(state).id);
    expect(movePlan).toMatchObject({
      committable: true,
      conflicts: [],
      normalizedOperations: expect.arrayContaining([
        {
          kind: 'move_records',
          moves: [
            expect.objectContaining({
              recordId: record.id,
              sourceId: source.id,
              targetSourceId: target.id,
            }),
          ],
        },
      ]),
      diff: {
        records: [
          expect.objectContaining({
            recordId: record.id,
            action: 'move',
            path: record.path,
            targetPath: `archive/${record.id}.md`,
          }),
        ],
      },
    });
    const moved = await engine.commit({
      planId: movePlan.id,
      planHash: movePlan.hash,
      expectedSnapshotRevision: movePlan.snapshotRevision,
      idempotencyKey: 'record-move-0001',
      approvalToken: engine.expectedApprovalToken(movePlan.hash),
      actor: { principalId: 'agent:codex', kind: 'agent' },
      assertions: { databaseAbsent: false },
    });
    expect(moved.actualDiff.map((delta) => delta.operation)).toEqual(['delete', 'create']);
    expect(existsSync(sourcePath)).toBe(false);
    const movedRecord = index.getById(record.id);
    expect(movedRecord).toMatchObject({ sourceId: target.id, body: record.body });
    const targetPath = join(contentDir, movedRecord?.path ?? 'missing-move');
    expect(readFileSync(targetPath, 'utf8')).toContain(`source_id: ${target.id}`);
    expect(readFileSync(targetPath, 'utf8')).toContain('state: open');

    const undone = await engine.undo({
      action: 'apply',
      undoToken: moved.undoToken,
      idempotencyKey: 'record-move-undo-0001',
      actor: { principalId: 'agent:codex', kind: 'agent' },
    });
    expect(undone).toMatchObject({ canApply: true, receipt: { status: 'applied' } });
    expect(readFileSync(sourcePath, 'utf8')).toBe(original);
    expect(existsSync(targetPath)).toBe(false);
    expect(index.getById(record.id)?.sourceId).toBe(source.id);

    const replayState = stableDesiredState(draft);
    replayState.sampleRecords = [];
    replayState.recordMoves = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: source.key,
        targetSourceKey: target.key,
      },
    ];
    const occupiedPlan = plans.createPlan(plans.createDraft(replayState).id);
    mkdirSync(join(contentDir, 'archive'), { recursive: true });
    writeFileSync(targetPath, 'unmanaged target\n');
    await expect(
      engine.commit({
        planId: occupiedPlan.id,
        planHash: occupiedPlan.hash,
        expectedSnapshotRevision: occupiedPlan.snapshotRevision,
        idempotencyKey: 'record-move-occupied-0001',
        approvalToken: engine.expectedApprovalToken(occupiedPlan.hash),
        actor: { principalId: 'agent:codex', kind: 'agent' },
        assertions: { databaseAbsent: false },
      }),
    ).rejects.toMatchObject({ code: 'target_changed' });
    expect(readFileSync(sourcePath, 'utf8')).toBe(original);
    expect(readFileSync(targetPath, 'utf8')).toBe('unmanaged target\n');
  });

  test('commits a schema manifest and multiple records as one verified transaction', async () => {
    const state = desiredState();
    state.sampleRecords.push({
      sourceKey: 'tasks',
      values: { title: 'Second atomic commit', status: 'done' },
      body: 'Committed in the same transaction as the schema and first record.\n',
    });
    const { projectDir, contentDir, draft, plan, engine, commitInput, store, index } =
      await fixture({ desiredState: state });

    const result = await engine.commit(commitInput());

    expect(result.actualDiff).toHaveLength(3);
    expect(result.actualDiff.map((delta) => delta.operation)).toEqual([
      'create',
      'create',
      'create',
    ]);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'committed-tasks.yml'))).toBe(true);
    for (const recordDiff of plan.diff.records) {
      expect(existsSync(join(contentDir, recordDiff.path))).toBe(true);
    }
    expect(store.getById(draft.normalized.definition.id)?.sources).toHaveLength(1);
    expect(index.list(draft.normalized.definition.id)).toHaveLength(2);
    expect(result.verification.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'manifest_valid', status: 'passed' }),
        expect.objectContaining({ code: 'required_values', status: 'passed' }),
      ]),
    );
  });

  test('refuses hash, approval, snapshot, assertion, and idempotency mismatches before mutation', async () => {
    const { projectDir, engine, commitInput } = await fixture();
    const manifest = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    await expect(
      engine.commit({ ...commitInput(), planHash: `sha256:${'0'.repeat(64)}` }),
    ).rejects.toMatchObject({
      code: 'plan_hash_mismatch',
    });
    await expect(
      engine.commit({ ...commitInput(), approvalToken: 'approve:wrong' }),
    ).rejects.toMatchObject({
      code: 'approval_required',
    });
    await expect(
      engine.commit({ ...commitInput(), approvalCodes: ['create_database'] }),
    ).rejects.toMatchObject({
      code: 'approval_required',
      details: {
        atomic: true,
        requiredApprovalCodes: ['create_database', 'sample_record_write'],
        selectedApprovalCodes: ['create_database'],
      },
    });
    await expect(
      engine.commit({
        ...commitInput(),
        expectedSnapshotRevision: `sha256:${'1'.repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: 'snapshot_changed' });
    await expect(
      engine.commit({
        ...commitInput(),
        assertions: { databaseAbsent: true, createdRecords: 2 },
      }),
    ).rejects.toMatchObject({ code: 'assertion_failed' });
    expect(existsSync(manifest)).toBe(false);

    await engine.commit(commitInput());
    await expect(
      engine.commit({ ...commitInput(), planId: 'plan_different' }),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });

  test('fails closed without approval and permits only exact trusted autonomy scope', async () => {
    const review = await fixture();
    const unapproved = { ...review.commitInput(), approvalToken: undefined };
    await expect(review.engine.commit(unapproved)).rejects.toMatchObject({
      code: 'approval_required',
      details: {
        decisions: expect.arrayContaining([expect.objectContaining({ reasons: ['review_mode'] })]),
      },
    });
    expect(existsSync(join(review.projectDir, '.ok', 'databases', 'committed-tasks.yml'))).toBe(
      false,
    );

    let autonomousPropertyIds: string[] = [];
    const autonomous = await fixture({
      resolveAutonomyPolicy: ({ databaseId, sessionId, sessionToken, principalId }) => {
        expect(sessionId).toBe('session-1');
        expect(sessionToken).toBe('dbsession_test');
        expect(principalId).toBe('agent:codex');
        return {
          databaseMode: 'autonomous',
          sessionMode: 'autonomous',
          delegation: {
            databaseIds: [databaseId],
            actions: ['create_database', 'create_record'],
            propertyIds: autonomousPropertyIds,
            allowBody: true,
            maxRecordsPerAction: 1,
            maxRecordsTotal: 1,
            maxActionsTotal: 2,
            maxEgressBytesTotal: 0,
            expiresAt: '2026-07-19T11:00:00.000Z',
          },
          revision: `sha256:${'9'.repeat(64)}`,
        };
      },
      consumeAutonomyBudget: async () => undefined,
    });
    autonomousPropertyIds = autonomous.draft.normalized.definition.sources.flatMap((source) =>
      source.properties.map((property) => property.id),
    );
    const result = await autonomous.engine.commit({
      ...autonomous.commitInput(),
      approvalToken: undefined,
      autonomySessionToken: 'dbsession_test',
      idempotencyKey: 'autonomous-commit-0001',
    });
    expect(result).toMatchObject({
      idempotentReplay: false,
      verification: { status: 'passed' },
      auditReceipt: { actor: { principalId: 'agent:codex', kind: 'agent' } },
    });

    const unavailable = await fixture({
      resolveAutonomyPolicy: () => {
        throw new Error('private policy path must not escape');
      },
    });
    await expect(
      unavailable.engine.commit({ ...unavailable.commitInput(), approvalToken: undefined }),
    ).rejects.toMatchObject({ code: 'autonomy_policy_unavailable', details: {} });
  });

  test('serializes autonomy revocation behind an in-flight automatic commit', async () => {
    let releaseSnapshot!: () => void;
    let enteredSnapshot!: () => void;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      enteredSnapshot = resolve;
    });
    let autonomyStore!: ReturnType<typeof createDatabaseAutonomyStore>;
    const subject = await fixture({
      snapshotGate,
      onSnapshot: enteredSnapshot,
      createResolveAutonomyPolicy: (projectDir) => {
        autonomyStore = createDatabaseAutonomyStore({
          projectDir,
          now: () => new Date('2026-07-19T10:05:00.000Z'),
        });
        return ({ databaseId, sessionId, sessionToken }) =>
          autonomyStore.resolve(databaseId, sessionId, sessionToken);
      },
      consumeAutonomyBudget: (input) => autonomyStore.consume(input),
    });
    const databaseId = subject.draft.normalized.definition.id;
    const databasePolicy = await autonomyStore.setDatabaseMode({
      databaseId,
      mode: 'autonomous',
      expectedRevision: 'sha256:empty',
    });
    const sessionPolicy = await autonomyStore.setSessionPolicy({
      sessionId: 'session-1',
      mode: 'autonomous',
      expectedRevision: databasePolicy.revision,
      delegation: {
        databaseIds: [databaseId],
        actions: ['create_database', 'create_record'],
        propertyIds: subject.draft.normalized.definition.sources.flatMap((source) =>
          source.properties.map((property) => property.id),
        ),
        allowBody: true,
        maxRecordsPerAction: 1,
        maxRecordsTotal: 1,
        maxActionsTotal: 2,
        maxEgressBytesTotal: 0,
        expiresAt: '2026-07-19T11:00:00.000Z',
      },
    });
    for (const [idempotencyKey, autonomySessionToken] of [
      ['autonomy-lock-missing-token-0001', undefined],
      ['autonomy-lock-wrong-token-0001', 'dbsession_wrong'],
    ] as const) {
      await expect(
        subject.engine.commit({
          ...subject.commitInput(),
          approvalToken: undefined,
          autonomySessionToken,
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ code: 'approval_required' });
    }
    const committing = subject.engine.commit({
      ...subject.commitInput(),
      approvalToken: undefined,
      autonomySessionToken: sessionPolicy.sessionToken ?? undefined,
      idempotencyKey: 'autonomy-lock-commit-0001',
    });
    await entered;
    let revoked = false;
    const revoking = autonomyStore
      .setSessionPolicy({
        sessionId: 'session-1',
        mode: 'review',
        expectedRevision: sessionPolicy.state.revision,
      })
      .then(() => {
        revoked = true;
      });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(revoked).toBe(false);
    releaseSnapshot();
    await committing;
    await revoking;
    expect(revoked).toBe(true);
    expect(await autonomyStore.resolve(databaseId, 'session-1')).toMatchObject({
      databaseMode: 'autonomous',
      sessionMode: 'review',
      delegation: undefined,
    });
  });

  test('records awaiting-approval and failed commit lifecycles for the Agent Runs panel', async () => {
    let awaitingStore!: DatabaseAgentRunStore;
    const awaiting = await fixture({
      createAgentRunStore: (projectDir) => {
        awaitingStore = createDatabaseAgentRunStore({ projectDir });
        return awaitingStore;
      },
    });
    await expect(
      awaiting.engine.commit({ ...awaiting.commitInput(), approvalToken: undefined }),
    ).rejects.toMatchObject({ code: 'approval_required' });
    expect((await awaitingStore.list()).runs).toMatchObject([
      {
        state: 'awaiting_approval',
        plan: { id: awaiting.plan.id, hash: awaiting.plan.hash },
      },
    ]);
    expect(await awaitingStore.getPlanBundle(awaiting.plan.id)).toMatchObject({
      plan: { id: awaiting.plan.id, hash: awaiting.plan.hash },
      draft: { id: awaiting.draft.id, revision: awaiting.draft.revision },
    });

    let failedStore!: DatabaseAgentRunStore;
    const failed = await fixture({
      createAgentRunStore: (projectDir) => {
        failedStore = createDatabaseAgentRunStore({ projectDir });
        return failedStore;
      },
    });
    await expect(
      failed.engine.commit({
        ...failed.commitInput(),
        expectedSnapshotRevision: `sha256:${'0'.repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: 'snapshot_changed' });
    expect((await failedStore.list()).runs).toMatchObject([
      {
        state: 'failed',
        failure: { code: 'snapshot_changed' },
        undo: { available: false, token: null },
      },
    ]);
    expect(await failedStore.getPlanBundle(failed.plan.id)).toMatchObject({
      plan: { id: failed.plan.id, hash: failed.plan.hash },
      draft: { id: failed.draft.id, revision: failed.draft.revision },
    });
  });

  test('fails closed before canonical mutation when Agent Runs history is unavailable', async () => {
    const subject = await fixture({
      createAgentRunStore: (projectDir) => {
        const root = join(projectDir, '.ok', 'local', 'database-agent-runs', 'v1');
        mkdirSync(root, { recursive: true, mode: 0o700 });
        writeFileSync(join(root, 'runs.json'), '{corrupt', { mode: 0o600 });
        return createDatabaseAgentRunStore({ projectDir });
      },
    });

    await expect(subject.engine.commit(subject.commitInput())).rejects.toMatchObject({
      code: 'agent_run_unavailable',
      details: { phase: 'proposal' },
    });
    expect(existsSync(join(subject.projectDir, '.ok', 'databases', 'committed-tasks.yml'))).toBe(
      false,
    );
    expect(readdirSync(subject.contentDir)).toEqual([]);
  });

  test('aborts before mutation when permission or query selection guards change', async () => {
    const revision = (value: string) => `sha256:${value.repeat(64)}`;
    let permissionGuards = {
      permissions: [
        {
          scopeId: 'db_write_scope',
          policyId: 'agent-write-policy',
          policyRevision: revision('a'),
        },
      ],
      querySnapshots: [{ queryId: 'query_target_set', snapshotRevision: revision('b') }],
    };
    const permissionFixture = await fixture({
      resolveWriteGuards: () => structuredClone(permissionGuards),
    });
    expect(permissionFixture.plan.writeGuards).toEqual(permissionGuards);
    const permission = permissionGuards.permissions[0];
    if (!permission) throw new Error('expected permission write guard');
    permissionGuards = {
      ...permissionGuards,
      permissions: [
        {
          ...permission,
          policyRevision: revision('c'),
        },
      ],
    };
    await expect(permissionFixture.engine.commit(permissionFixture.commitInput())).rejects.toEqual(
      expect.objectContaining({ code: 'permission_changed' }),
    );
    expect(
      existsSync(join(permissionFixture.projectDir, '.ok', 'databases', 'committed-tasks.yml')),
    ).toBe(false);

    let queryGuards = {
      permissions: [
        {
          scopeId: 'db_write_scope',
          policyId: 'agent-write-policy',
          policyRevision: revision('d'),
        },
      ],
      querySnapshots: [{ queryId: 'query_target_set', snapshotRevision: revision('e') }],
    };
    const queryFixture = await fixture({
      resolveWriteGuards: () => structuredClone(queryGuards),
    });
    queryGuards = {
      ...queryGuards,
      querySnapshots: [{ queryId: 'query_target_set', snapshotRevision: revision('f') }],
    };
    await expect(queryFixture.engine.commit(queryFixture.commitInput())).rejects.toEqual(
      expect.objectContaining({ code: 'query_snapshot_changed' }),
    );
    expect(
      existsSync(join(queryFixture.projectDir, '.ok', 'databases', 'committed-tasks.yml')),
    ).toBe(false);
  });

  test('fails closed for missing guards, guard resolution failure, and intervening schema state', async () => {
    await expect(
      fixture({ resolveWriteGuards: () => ({ permissions: [], querySnapshots: [] }) }),
    ).rejects.toMatchObject({ code: 'write_guard_unavailable' });

    let guardReads = 0;
    const unavailable = await fixture({
      resolveWriteGuards: ({ definition }) => {
        guardReads += 1;
        if (guardReads > 1) throw new Error('permission service unavailable');
        return {
          permissions: [
            {
              scopeId: definition.id,
              policyId: 'project-owner',
              policyRevision: `sha256:${'a'.repeat(64)}`,
            },
          ],
          querySnapshots: [],
        };
      },
    });
    await expect(unavailable.engine.commit(unavailable.commitInput())).rejects.toMatchObject({
      code: 'write_guard_unavailable',
    });
    expect(
      existsSync(join(unavailable.projectDir, '.ok', 'databases', 'committed-tasks.yml')),
    ).toBe(false);
    expect(readdirSync(unavailable.contentDir)).toEqual([]);

    const schemaChanged = await fixture();
    await schemaChanged.store.create(schemaChanged.draft.normalized.definition);
    await expect(schemaChanged.engine.commit(schemaChanged.commitInput())).rejects.toMatchObject({
      code: 'snapshot_changed',
    });
    expect(readdirSync(schemaChanged.contentDir)).toEqual([]);
  });

  test('rolls back every moved file when a multi-file transaction fails', async () => {
    const state = desiredState();
    state.sampleRecords.push({
      sourceKey: 'tasks',
      values: { title: 'Never partially committed', status: 'done' },
      body: 'This record must not survive a partial filesystem failure.\n',
    });
    const { projectDir, contentDir, draft, plan, engine, commitInput, store, index } =
      await fixture({ failRenameAt: 3, desiredState: state });
    await expect(engine.commit(commitInput())).rejects.toBeInstanceOf(DatabaseCommitError);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'committed-tasks.yml'))).toBe(false);
    for (const recordDiff of plan.diff.records) {
      expect(existsSync(join(contentDir, recordDiff.path))).toBe(false);
    }
    expect(store.getById(draft.normalized.definition.id)).toBeNull();
    expect(index.list(draft.normalized.definition.id)).toEqual([]);
  });

  test('refuses an unresolved relation target during planning before mutation', async () => {
    const state = desiredState();
    state.sources[0]?.properties.push({
      key: 'related',
      name: 'Related task',
      type: 'relation',
      targetSourceKey: 'tasks',
      cardinality: 'one',
    } as never);
    Object.assign(state.sampleRecords[0]?.values ?? {}, {
      related: 'rec_missing',
    });
    const { projectDir, contentDir, draft, plan, engine, commitInput, store, index } =
      await fixture({
        desiredState: state,
      });
    expect(plan.conflicts).toContainEqual(
      expect.objectContaining({ code: 'relation_target_missing', targetId: 'rec_missing' }),
    );
    await expect(engine.commit(commitInput())).rejects.toMatchObject({
      code: 'plan_not_committable',
    });
    expect(existsSync(join(projectDir, '.ok', 'databases', 'committed-tasks.yml'))).toBe(false);
    expect(existsSync(join(contentDir, plan.diff.records[0]?.path ?? 'missing-record-path'))).toBe(
      false,
    );
    expect(store.getById(draft.normalized.definition.id)).toBeNull();
    expect(index.list(draft.normalized.definition.id)).toEqual([]);
  });

  test('restores replaced schema and record bytes when an update postcondition fails', async () => {
    const { projectDir, contentDir, store, index, plans, draft, engine, commitInput } =
      await fixture();
    await engine.commit(commitInput());
    const record = index.list(draft.normalized.definition.id)[0];
    if (!record?.revision) throw new Error('expected initial record');
    const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    const recordPath = join(contentDir, record.path);
    const beforeManifest = readFileSync(manifestPath, 'utf8');
    const beforeRecord = readFileSync(recordPath, 'utf8');
    const relationTargetPath = join(contentDir, 'committed-tasks', 'relation-target.md');
    writeFileSync(
      relationTargetPath,
      `---\n_sn:\n  database_id: ${draft.normalized.definition.id}\n  source_id: ${draft.normalized.definition.sources[0]?.id}\n  record_id: rec_relation_target\ntitle: Relation target\nstatus: todo\n---\nTarget body.\n`,
    );
    await index.rebuild();
    const state = stableDesiredState(draft);
    state.sources[0]?.properties.push({
      id: 'prop_broken_relation',
      key: 'broken_relation',
      name: 'Broken relation',
      type: 'relation',
      targetSourceId: draft.normalized.definition.sources[0]?.id,
      cardinality: 'one',
    });
    state.sampleRecords = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        values: {
          title: 'Atomic commit',
          status: 'todo',
          broken_relation: 'rec_relation_target',
        },
        body: record.body,
      },
    ];
    const updateDraft = plans.createDraft(state);
    const updatePlan = plans.createPlan(updateDraft.id);
    expect(updatePlan.conflicts).toEqual([]);
    rmSync(relationTargetPath);
    await expect(
      engine.commit({
        planId: updatePlan.id,
        planHash: updatePlan.hash,
        expectedSnapshotRevision: updatePlan.snapshotRevision,
        idempotencyKey: 'failed-update-request-0001',
        approvalToken: engine.expectedApprovalToken(updatePlan.hash),
        actor: { principalId: 'agent:codex', kind: 'agent' },
        assertions: { databaseAbsent: false },
      }),
    ).rejects.toMatchObject({ code: 'transaction_failed' });
    expect(readFileSync(manifestPath, 'utf8')).toBe(beforeManifest);
    expect(readFileSync(recordPath, 'utf8')).toBe(beforeRecord);
    expect(store.getById(draft.normalized.definition.id)).toEqual(draft.normalized.definition);
    expect(index.getById(record.id)?.revision).toBe(record.revision);
  });

  test('refuses a record changed after an update plan without partially replacing files', async () => {
    const { contentDir, index, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());
    const record = index.list(draft.normalized.definition.id)[0];
    if (!record?.revision) throw new Error('expected initial record');
    const state = stableDesiredState(draft);
    state.sampleRecords = [
      {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: 'tasks',
        values: { title: 'Atomic commit', status: 'done' },
        body: 'Planned update.\n',
      },
    ];
    const updatePlan = plans.createPlan(plans.createDraft(state).id);
    const recordPath = join(contentDir, record.path);
    const intervening = `${readFileSync(recordPath, 'utf8')}Intervening edit.\n`;
    writeFileSync(recordPath, intervening);
    await expect(
      engine.commit({
        planId: updatePlan.id,
        planHash: updatePlan.hash,
        expectedSnapshotRevision: updatePlan.snapshotRevision,
        idempotencyKey: 'stale-record-update-0001',
        approvalToken: engine.expectedApprovalToken(updatePlan.hash),
        actor: { principalId: 'agent:codex', kind: 'agent' },
        assertions: { databaseAbsent: false },
      }),
    ).rejects.toMatchObject({ code: 'target_changed' });
    expect(readFileSync(recordPath, 'utf8')).toBe(intervening);
  });

  test('refuses a target created after planning instead of overwriting it', async () => {
    const { projectDir, engine, commitInput } = await fixture();
    const target = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
    writeFileSync(target, 'external change\n');
    await expect(engine.commit(commitInput())).rejects.toMatchObject({
      code: 'target_changed',
    });
    expect(readFileSync(target, 'utf8')).toBe('external change\n');
  });

  test('previews and atomically applies an exact create-transaction undo', async () => {
    const {
      projectDir,
      contentDir,
      store,
      index,
      draft,
      plan,
      engine,
      commitInput,
      snapshotCount,
    } = await fixture();
    const committed = await engine.commit(commitInput());
    const preview = await engine.undo({ action: 'preview', undoToken: committed.undoToken });
    expect(preview).toMatchObject({
      action: 'preview',
      mutationId: committed.mutationId,
      canApply: true,
      conflicts: [],
      receipt: null,
    });

    const applyInput = {
      action: 'apply' as const,
      undoToken: committed.undoToken,
      idempotencyKey: 'undo-request-0001',
      actor: { principalId: 'agent:codex', kind: 'agent' as const, sessionId: 'session-1' },
    };
    const undone = await engine.undo(applyInput);
    expect(DatabaseUndoReceiptSchema.parse(undone.receipt)).toBeDefined();
    expect(undone).toMatchObject({
      action: 'apply',
      mutationId: committed.mutationId,
      canApply: true,
      idempotentReplay: false,
      conflicts: [],
      receipt: {
        status: 'applied',
        resultSnapshotRevision: plan.snapshotRevision,
      },
    });
    expect(existsSync(join(projectDir, '.ok', 'databases', 'committed-tasks.yml'))).toBe(false);
    expect(existsSync(join(contentDir, plan.diff.records[0]?.path ?? 'missing-record-path'))).toBe(
      false,
    );
    expect(store.getById(draft.normalized.definition.id)).toBeNull();
    expect(index.list(draft.normalized.definition.id)).toEqual([]);
    expect(snapshotCount()).toBe(3);

    const replay = await engine.undo(applyInput);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.receipt).toEqual(undone.receipt);
    expect(snapshotCount()).toBe(3);

    const redoPreview = await engine.undo({
      action: 'redo_preview',
      undoToken: committed.undoToken,
    });
    expect(redoPreview).toMatchObject({
      action: 'redo_preview',
      mutationId: committed.mutationId,
      canApply: true,
      conflicts: [],
      receipt: null,
    });
    const redoInput = {
      action: 'redo_apply' as const,
      undoToken: committed.undoToken,
      idempotencyKey: 'redo-request-0001',
      actor: { principalId: 'agent:codex', kind: 'agent' as const, sessionId: 'session-1' },
    };
    const redone = await engine.undo(redoInput);
    expect(redone).toMatchObject({
      action: 'redo_apply',
      mutationId: committed.mutationId,
      canApply: true,
      conflicts: [],
      receipt: { status: 'applied', resultSnapshotRevision: committed.revisions.snapshotRevision },
    });
    expect(existsSync(join(projectDir, '.ok', 'databases', 'committed-tasks.yml'))).toBe(true);
    expect(existsSync(join(contentDir, plan.diff.records[0]?.path ?? 'missing-record-path'))).toBe(
      true,
    );
    expect(store.getById(draft.normalized.definition.id)).not.toBeNull();
    expect(index.list(draft.normalized.definition.id)).toHaveLength(1);
    const redoReplay = await engine.undo(redoInput);
    expect(redoReplay.idempotentReplay).toBe(true);
    expect(redoReplay.receipt).toEqual(redone.receipt);
  });

  test('commits and undoes generated create-database plans back to byte-identical state', async () => {
    const ITERATIONS = 16;
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const state = desiredState();
      const recordCount = 1 + (seed % 5);
      state.sampleRecords = Array.from({ length: recordCount }, (_, recordIndex) => ({
        sourceKey: 'tasks',
        values: {
          title: `Generated ${seed}-${recordIndex}`,
          status: recordIndex % 2 === 0 ? 'todo' : 'done',
        },
        body: `Body ${seed}-${recordIndex}\n`,
      }));
      const { projectDir, contentDir, store, index, draft, engine, commitInput } = await fixture({
        desiredState: state,
      });
      const databaseId = draft.normalized.definition.id;
      const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
      expect(existsSync(manifestPath), `seed ${seed}`).toBe(false);
      const listContentFiles = () =>
        readdirSync(contentDir, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
          .sort();
      const contentFilesBefore = listContentFiles();

      const committed = await engine.commit(commitInput());
      expect(committed.verification.status, `seed ${seed}`).toBe('passed');
      expect(existsSync(manifestPath), `seed ${seed}`).toBe(true);
      expect(index.list(databaseId), `seed ${seed}`).toHaveLength(recordCount);

      const undoInput = {
        action: 'apply' as const,
        undoToken: committed.undoToken,
        idempotencyKey: `undo-seed-${seed}`,
        actor: { principalId: 'agent:codex', kind: 'agent' as const, sessionId: 'session-1' },
      };
      const undone = await engine.undo(undoInput);
      expect(undone.receipt?.status, `seed ${seed}`).toBe('applied');
      expect(existsSync(manifestPath), `seed ${seed}`).toBe(false);
      expect(store.getById(databaseId), `seed ${seed}`).toBeNull();
      expect(index.list(databaseId), `seed ${seed}`).toEqual([]);
      expect(listContentFiles(), `seed ${seed}`).toEqual(contentFilesBefore);

      const replay = await engine.undo(undoInput);
      expect(replay.idempotentReplay, `seed ${seed}`).toBe(true);
      expect(replay.receipt, `seed ${seed}`).toEqual(undone.receipt);
    }
  });

  test('replays commit and undo idempotency and resolves undo tokens after engine restart', async () => {
    const { projectDir, contentDir, store, index, engine, commitInput } = await fixture();
    const exactInput = commitInput();
    const committed = await engine.commit(exactInput);
    const freshPlans = createDatabasePlanEngine({ databaseStore: store });
    let restartedSnapshots = 0;
    const restarted = createDatabaseCommitEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: freshPlans,
      git: {
        snapshot: async () =>
          String(++restartedSnapshots + 5)
            .repeat(40)
            .slice(0, 40),
        hashBlob: async () => `sha1:${'b'.repeat(40)}`,
      },
    });

    const commitReplay = await restarted.commit(exactInput);
    expect(commitReplay).toMatchObject({
      mutationId: committed.mutationId,
      idempotentReplay: true,
      undoToken: committed.undoToken,
    });
    expect(restartedSnapshots).toBe(0);
    await expect(
      restarted.commit({ ...exactInput, planId: 'plan_different_after_restart' }),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' });
    const preview = await restarted.undo({ action: 'preview', undoToken: committed.undoToken });
    expect(preview.canApply).toBe(true);
    const undoInput = {
      action: 'apply' as const,
      undoToken: committed.undoToken,
      idempotencyKey: 'restart-undo-request-0001',
      actor: { principalId: 'agent:restart-test', kind: 'agent' as const },
    };
    const applied = await restarted.undo(undoInput);
    expect(applied.receipt).toMatchObject({ status: 'applied' });
    expect(restartedSnapshots).toBe(1);

    const secondRestart = createDatabaseCommitEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: createDatabasePlanEngine({ databaseStore: store }),
      git: {
        snapshot: async () =>
          String(++restartedSnapshots + 5)
            .repeat(40)
            .slice(0, 40),
        hashBlob: async () => `sha1:${'c'.repeat(40)}`,
      },
    });
    const undoReplay = await secondRestart.undo(undoInput);
    expect(undoReplay).toMatchObject({
      mutationId: committed.mutationId,
      idempotentReplay: true,
      receipt: { status: 'applied' },
    });
    expect(restartedSnapshots).toBe(1);
    const redoPreview = await secondRestart.undo({
      action: 'redo_preview',
      undoToken: committed.undoToken,
    });
    expect(redoPreview).toMatchObject({
      action: 'redo_preview',
      mutationId: committed.mutationId,
      canApply: true,
      conflicts: [],
      receipt: null,
    });
    const redoInput = {
      action: 'redo_apply' as const,
      undoToken: committed.undoToken,
      idempotencyKey: 'restart-redo-request-0001',
      actor: { principalId: 'agent:restart-test', kind: 'agent' as const },
    };
    const redone = await secondRestart.undo(redoInput);
    expect(redone).toMatchObject({
      action: 'redo_apply',
      mutationId: committed.mutationId,
      canApply: true,
      idempotentReplay: false,
      receipt: { status: 'applied' },
    });
    expect(restartedSnapshots).toBe(2);
    const thirdRestart = createDatabaseCommitEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: createDatabasePlanEngine({ databaseStore: store }),
      git: {
        snapshot: async () =>
          String(++restartedSnapshots + 5)
            .repeat(40)
            .slice(0, 40),
        hashBlob: async () => `sha1:${'d'.repeat(40)}`,
      },
    });
    const redoReplay = await thirdRestart.undo(redoInput);
    expect(redoReplay).toMatchObject({
      mutationId: committed.mutationId,
      idempotentReplay: true,
      receipt: { status: 'applied' },
    });
    expect(restartedSnapshots).toBe(2);
    await expect(
      secondRestart.undo({
        ...undoInput,
        undoToken: `${committed.undoToken}-different`,
      }),
    ).rejects.toMatchObject({ code: 'undo_not_found' });

    const commitFiles = readdirSync(
      join(projectDir, '.ok', 'local', 'database-transactions', 'commits'),
    );
    const durableJson = readFileSync(
      join(projectDir, '.ok', 'local', 'database-transactions', 'commits', commitFiles[0] ?? ''),
      'utf8',
    );
    expect(durableJson).not.toContain('Created only after the exact plan is approved.');
    expect(durableJson).not.toContain('Atomic commit');
    expect(durableJson).toContain(committed.mutationId);
  });

  test('restores manifests, records, rebuilt indexes, and transaction journals from a backup', async () => {
    const { projectDir, engine, commitInput } = await fixture();
    const exactInput = commitInput();
    const committed = await engine.commit(exactInput);
    const restoredProjectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-restore-'));
    tempDirs.push(restoredProjectDir);
    cpSync(projectDir, restoredProjectDir, { recursive: true });
    const restoredContentDir = join(restoredProjectDir, 'content');
    const restoredStore = createDatabaseStore({
      projectDir: restoredProjectDir,
      contentDir: restoredContentDir,
    });
    await restoredStore.reload();
    const restoredIndex = createDatabaseRecordIndex({
      contentDir: restoredContentDir,
      databaseStore: restoredStore,
    });
    await restoredIndex.rebuild();
    expect(restoredStore.getByKey('committed-tasks')).not.toBeNull();
    const databaseId = restoredStore.getByKey('committed-tasks')?.id ?? 'missing-database';
    expect(restoredIndex.list(databaseId)).toHaveLength(1);

    let snapshots = 0;
    const restoredEngine = createDatabaseCommitEngine({
      projectDir: restoredProjectDir,
      contentDir: restoredContentDir,
      databaseStore: restoredStore,
      databaseRecordIndex: restoredIndex,
      databasePlanEngine: createDatabasePlanEngine({ databaseStore: restoredStore }),
      git: {
        snapshot: async () =>
          String(++snapshots + 7)
            .repeat(40)
            .slice(0, 40),
        hashBlob: async () => `sha1:${'d'.repeat(40)}`,
      },
    });
    const replay = await restoredEngine.commit(exactInput);
    expect(replay).toMatchObject({
      mutationId: committed.mutationId,
      idempotentReplay: true,
      undoToken: committed.undoToken,
    });
    expect(snapshots).toBe(0);
    expect(
      await restoredEngine.undo({ action: 'preview', undoToken: committed.undoToken }),
    ).toMatchObject({ canApply: true, conflicts: [] });
    const undone = await restoredEngine.undo({
      action: 'apply',
      undoToken: committed.undoToken,
      idempotencyKey: 'restored-backup-undo-0001',
      actor: { principalId: 'agent:restore-test', kind: 'agent' },
    });
    expect(undone.receipt).toMatchObject({ status: 'applied' });
    expect(restoredStore.getByKey('committed-tasks')).toBeNull();
    expect(restoredIndex.list(databaseId)).toEqual([]);
  });

  test('refuses undo with an explicit conflict preview after an intervening file edit', async () => {
    const { contentDir, plan, engine, commitInput } = await fixture();
    const committed = await engine.commit(commitInput());
    const recordPath = join(contentDir, plan.diff.records[0]?.path ?? 'missing-record-path');
    writeFileSync(recordPath, `${readFileSync(recordPath, 'utf8')}intervening edit\n`);

    const preview = await engine.undo({ action: 'preview', undoToken: committed.undoToken });
    expect(preview).toMatchObject({
      canApply: false,
      conflicts: [
        expect.objectContaining({
          path: expect.stringContaining('committed-tasks/'),
          reason: 'path_changed',
        }),
      ],
    });
    const refused = await engine.undo({
      action: 'apply',
      undoToken: committed.undoToken,
      idempotencyKey: 'undo-request-refused-0001',
      actor: { principalId: 'agent:codex', kind: 'agent' },
    });
    expect(DatabaseUndoReceiptSchema.parse(refused.receipt)).toMatchObject({ status: 'refused' });
    expect(refused.canApply).toBe(false);
    expect(existsSync(recordPath)).toBe(true);
    expect(readFileSync(recordPath, 'utf8')).toContain('intervening edit');
  });

  test('refuses undo when an intervening parent directory becomes a symbolic link', async () => {
    const { contentDir, plan, engine, commitInput } = await fixture();
    const committed = await engine.commit(commitInput());
    const sourceDir = join(contentDir, 'committed-tasks');
    const movedDir = join(contentDir, 'committed-tasks-external');
    renameSync(sourceDir, movedDir);
    symlinkSync(movedDir, sourceDir, 'dir');

    const preview = await engine.undo({ action: 'preview', undoToken: committed.undoToken });
    expect(preview).toMatchObject({
      canApply: false,
      conflicts: [
        expect.objectContaining({
          path: expect.stringContaining('committed-tasks/'),
          reason: 'path_changed',
          observedSha256: null,
        }),
      ],
    });
    const recordName = plan.diff.records[0]?.path.split('/').at(-1) ?? 'missing-record.md';
    expect(existsSync(join(movedDir, recordName))).toBe(true);
  });

  test('restores every file when undo fails partway through', async () => {
    const { projectDir, contentDir, plan, engine, commitInput, store, index, draft } =
      await fixture({ failRenameAt: 4 });
    const committed = await engine.commit(commitInput());
    const manifestPath = join(projectDir, '.ok', 'databases', 'committed-tasks.yml');
    const recordPath = join(contentDir, plan.diff.records[0]?.path ?? 'missing-record-path');
    await expect(
      engine.undo({
        action: 'apply',
        undoToken: committed.undoToken,
        idempotencyKey: 'undo-request-failure-0001',
        actor: { principalId: 'agent:codex', kind: 'agent' },
      }),
    ).rejects.toMatchObject({ code: 'transaction_failed' });
    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(recordPath)).toBe(true);
    expect(store.getById(draft.normalized.definition.id)).not.toBeNull();
    expect(index.list(draft.normalized.definition.id)).toHaveLength(1);
  });

  test('serializes two concurrent commits racing the same record instead of both succeeding or hanging', async () => {
    // R-008 gap: two agents (or two UI actions) can legitimately plan
    // against the same base snapshot and then race to commit. Both
    // plans share `expectedRevision`/`expectedSnapshotRevision`, so at
    // most one may win; the loser must fail fast with a typed,
    // retryable conflict — never hang and never both apply. Each
    // commit is wrapped in an explicit timeout so a regression here
    // fails this test in seconds instead of hanging the suite.
    const { contentDir, index, plans, draft, engine, commitInput } = await fixture();
    await engine.commit(commitInput());
    const originalRecord = index.list(draft.normalized.definition.id)[0];
    if (!originalRecord?.revision) throw new Error('expected committed record');

    const buildCompetingCommit = (label: string) => {
      const state = stableDesiredState(draft);
      state.sampleRecords = [
        {
          id: originalRecord.id,
          expectedRevision: originalRecord.revision as string,
          sourceKey: 'tasks',
          values: { title: `Race ${label}`, status: 'todo' },
          body: `Race ${label}\n`,
        },
      ];
      const racingDraft = plans.createDraft(state);
      const racingPlan = plans.createPlan(racingDraft.id);
      return () =>
        engine.commit({
          planId: racingPlan.id,
          planHash: racingPlan.hash,
          expectedSnapshotRevision: racingPlan.snapshotRevision,
          idempotencyKey: `race-${label}-0001`,
          approvalToken: engine.expectedApprovalToken(racingPlan.hash),
          actor: { principalId: 'agent:codex', kind: 'agent' },
          assertions: { databaseAbsent: false },
        });
    };
    const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`${label} did not settle within ${ms}ms`)), ms);
        }),
      ]);

    const commitA = buildCompetingCommit('A');
    const commitB = buildCompetingCommit('B');
    const settled = await Promise.allSettled([
      withTimeout(commitA(), 10_000, 'commit A'),
      withTimeout(commitB(), 10_000, 'commit B'),
    ]);

    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        expect(String(outcome.reason), JSON.stringify(settled)).not.toContain('did not settle');
      }
    }
    const fulfilled = settled.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = settled.filter((outcome) => outcome.status === 'rejected');
    expect(fulfilled.length, JSON.stringify(settled)).toBe(1);
    expect(rejected.length, JSON.stringify(settled)).toBe(1);
    expect(existsSync(join(contentDir, originalRecord.path))).toBe(true);
  }, 15_000);

  describe('agent mutation plan fuzz corpus', () => {
    // Bounded, seeded fuzz corpus for agent-authored desired-state input
    // (R-007). `plans.createDraft` is the entry point every agent commit
    // request compiles through; it is pure (no filesystem I/O) and
    // documented to reject invalid input with a typed `DatabasePlanError`
    // rather than throwing an untyped error or silently normalizing
    // garbage. This corpus is reproducible evidence for both properties,
    // plus confirms a rejected draft never touches disk (no partial
    // mutation from input that never should have compiled).
    const ITERATIONS = 200;

    function unit(seed: number, salt: number): number {
      let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
      value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
      value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
      return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
    }

    function integer(seed: number, salt: number, maximum: number): number {
      return Math.floor(unit(seed, salt) * maximum);
    }

    const ADVERSARIAL_VALUES: unknown[] = [
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -1,
      0,
      1.5,
      '',
      'x'.repeat(10_000),
      [],
      {},
      [1, 2, 3],
      { __proto__: { polluted: true } },
      true,
      false,
      { toString: () => 'evil' },
      Array.from({ length: 5_000 }, (_, index) => index),
      '행 😀 مرحبا',
    ];

    const MUTATORS: Array<(state: ReturnType<typeof desiredState>, seed: number) => void> = [
      (state, seed) => {
        (state as Record<string, unknown>).database =
          ADVERSARIAL_VALUES[integer(seed, 1, ADVERSARIAL_VALUES.length)];
      },
      (state, seed) => {
        (state as Record<string, unknown>).sources =
          ADVERSARIAL_VALUES[integer(seed, 2, ADVERSARIAL_VALUES.length)];
      },
      (state, seed) => {
        const property: unknown = state.sources[0]?.properties[0];
        if (property !== null && typeof property === 'object') {
          (property as Record<string, unknown>).type =
            ADVERSARIAL_VALUES[integer(seed, 3, ADVERSARIAL_VALUES.length)];
        }
      },
      (state, seed) => {
        const property: unknown = state.sources[0]?.properties[0];
        if (property !== null && typeof property === 'object') {
          (property as Record<string, unknown>).key =
            ADVERSARIAL_VALUES[integer(seed, 4, ADVERSARIAL_VALUES.length)];
        }
      },
      (state, seed) => {
        (state as Record<string, unknown>).sampleRecords =
          ADVERSARIAL_VALUES[integer(seed, 5, ADVERSARIAL_VALUES.length)];
      },
      (state, seed) => {
        const record: unknown = state.sampleRecords[0];
        if (record !== null && typeof record === 'object') {
          (record as Record<string, unknown>).values =
            ADVERSARIAL_VALUES[integer(seed, 6, ADVERSARIAL_VALUES.length)];
        }
      },
      (state, seed) => {
        (state as Record<string, unknown>).policy =
          ADVERSARIAL_VALUES[integer(seed, 7, ADVERSARIAL_VALUES.length)];
      },
      (state, seed) => {
        (state as Record<string, unknown>).unknownField =
          ADVERSARIAL_VALUES[integer(seed, 8, ADVERSARIAL_VALUES.length)];
      },
      (state, seed) => {
        if (state.sources[0]) {
          (state.sources[0] as Record<string, unknown>).folder =
            ADVERSARIAL_VALUES[integer(seed, 9, ADVERSARIAL_VALUES.length)];
        }
      },
      (state, seed) => {
        if (state.sources[0]) {
          (state.sources[0] as Record<string, unknown>).properties =
            ADVERSARIAL_VALUES[integer(seed, 10, ADVERSARIAL_VALUES.length)];
        }
      },
    ];

    function mutatedState(seed: number): ReturnType<typeof desiredState> {
      // Exactly one mutator per seed: chaining several against the same
      // clone lets an earlier mutator replace a whole subtree (e.g.
      // `sampleRecords`) with a non-object adversarial value, so a later
      // mutator indexing back into that subtree hits an engine-specific
      // primitive-property-assignment error unrelated to the parser under
      // test. One mutator per seed keeps every case attributable and the
      // 200-seed sweep still exercises each of the 10 mutators ~20 times
      // with a different adversarial value per seed.
      const state = structuredClone(desiredState());
      const mutator = MUTATORS[integer(seed, 20, MUTATORS.length)];
      mutator?.(state, seed);
      return state;
    }

    test('never throws anything other than DatabasePlanError for generated adversarial desired states', async () => {
      const { projectDir, contentDir, plans } = await fixture();
      for (let seed = 1; seed <= ITERATIONS; seed += 1) {
        const state = mutatedState(seed);
        try {
          plans.createDraft(state);
        } catch (cause) {
          if (cause instanceof DatabasePlanError) continue;
          throw new Error(
            `seed ${seed} threw an untyped error instead of DatabasePlanError: ${String(cause)}`,
            { cause },
          );
        }
      }
      // A rejected (or even an accepted-but-unplanned) draft never touches
      // disk: createDraft only inspects and normalizes, it does not write.
      expect(existsSync(join(projectDir, '.ok', 'databases'))).toBe(false);
      expect(readdirSync(contentDir)).toEqual([]);
    });

    test('rejects a prototype-pollution attempt in a record value without crashing or polluting', async () => {
      const { plans } = await fixture();
      const state = structuredClone(desiredState());
      const record = state.sampleRecords[0];
      if (!record) throw new Error('expected a sample record');
      record.values = JSON.parse('{"__proto__": {"polluted": true}, "title": "x"}');
      expect(() => plans.createDraft(state)).not.toThrow(TypeError);
      // biome-ignore lint/suspicious/noExplicitAny: verifying no global prototype pollution occurred
      expect(({} as any).polluted).toBeUndefined();
    });
  });
});
