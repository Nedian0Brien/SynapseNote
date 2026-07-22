import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseAgentRunStore } from './database-agent-run-store.ts';
import { createDatabaseCommitEngine } from './database-commit.ts';
import { createDatabaseDataPlane } from './database-data-plane.ts';
import { evaluateDatabaseFinalState } from './database-final-eval.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function desiredState() {
  return {
    database: {
      key: 'agent-eval-tasks',
      name: 'Agent evaluation tasks',
      contract: {
        purpose: 'Evaluate final database state and evidence',
        canonicality: 'canonical' as const,
        vocabulary: ['task', 'evidence'],
        freshness: { expectation: 'realtime' as const, maxAgeSeconds: 60 },
        sensitivity: 'internal' as const,
      },
    },
    sources: [
      {
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One evaluation task',
        folder: 'agent-eval-tasks',
        properties: [
          { key: 'title', name: 'Title', type: 'title' as const, required: true },
          { key: 'topic', name: 'Topic', type: 'text' as const },
        ],
      },
    ],
    views: [],
    uniqueKey: { sourceKey: 'tasks', propertyKey: 'title' },
    templates: [],
    policy: { mode: 'review' as const, allowedOperations: [], maxRecordsPerCommit: 10 },
    sampleRecords: [
      {
        sourceKey: 'tasks',
        values: { title: 'Evidence task', topic: 'recovery' },
        body: 'Validate evidence citations and recovery behavior.',
      },
    ],
  };
}

async function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-final-eval-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);

  const store = createDatabaseStore({ projectDir, contentDir });
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
    generateUuid,
    now: () => new Date('2026-07-22T10:00:00.000Z'),
  });
  const runStore = createDatabaseAgentRunStore({
    projectDir,
    now: () => new Date('2026-07-22T10:00:01.000Z'),
    generateId: () => 'run_database_final_eval',
  });
  let snapshotCounter = 0;
  const commits = createDatabaseCommitEngine({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
    agentRunStore: runStore,
    now: () => new Date('2026-07-22T10:00:02.000Z'),
    generateUuid,
    git: {
      snapshot: async () => `${String(++snapshotCounter).repeat(40).slice(0, 40)}`,
      hashBlob: async () => `sha1:${'a'.repeat(40)}`,
    },
  });
  const dataPlane = createDatabaseDataPlane({
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: plans,
  });
  return { projectDir, contentDir, store, index, plans, commits, dataPlane, runStore };
}

describe('R-018 final database evaluation', () => {
  test('passes only from canonical state, evidence, budget, trace, latency, and recovery', async () => {
    const { projectDir, contentDir, store, index, plans, commits, dataPlane, runStore } =
      await fixture();
    const startedAt = performance.now();
    const toolCalls: string[] = [];
    toolCalls.push('data_plan.create_draft');
    const draft = plans.createDraft(desiredState());
    toolCalls.push('data_plan.create_plan');
    const plan = plans.createPlan(draft.id);
    const actor = {
      principalId: 'agent:database-eval',
      kind: 'agent' as const,
      sessionId: 'session-database-eval',
    };
    const run = await runStore.propose(plan, actor);
    await runStore.markExecuting(run.id);
    toolCalls.push('data_commit');
    const commit = await commits.commit({
      planId: plan.id,
      planHash: plan.hash,
      expectedSnapshotRevision: plan.snapshotRevision,
      idempotencyKey: 'database-final-eval-commit',
      approvalToken: commits.expectedApprovalToken(plan.hash),
      actor,
      assertions: { databaseAbsent: true, createdRecords: 1 },
    });
    await runStore.markSucceeded(run.id, commit);

    const definition = store.getById(draft.normalized.definition.id);
    const source = definition?.sources[0];
    const records = index.list(draft.normalized.definition.id, source?.id);
    if (!definition || !source || records.length !== 1) {
      throw new Error('R-018 fixture did not materialize its canonical database');
    }
    const record = records[0];
    if (!record) throw new Error('R-018 fixture record is missing');
    toolCalls.push('data.pack');
    const pack = dataPlane.pack({
      databaseId: definition.id,
      sourceId: source.id,
      goal: 'Find the recovery evidence task',
      maxTokens: 4_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      disclosure: { level: 'evidence', searchText: 'recovery' },
    });
    if (pack.disclosure.level !== 'evidence') {
      throw new Error('R-018 fixture did not return evidence disclosure');
    }
    const evidence = pack.disclosure.evidence;
    const manifestPresent = existsSync(
      join(projectDir, '.ok', 'databases', 'agent-eval-tasks.yml'),
    );
    const recordPath = join(contentDir, record.path);
    const recordsPresent = existsSync(recordPath);
    toolCalls.push('data_undo.preview');
    const undoPreview = await commits.undo({ action: 'preview', undoToken: commit.undoToken });
    toolCalls.push('data_undo.apply');
    const undo = await commits.undo({
      action: 'apply',
      undoToken: commit.undoToken,
      idempotencyKey: 'database-final-eval-undo',
      actor,
    });
    const totalMs = performance.now() - startedAt;
    const restored =
      store.getById(definition.id) === null && index.list(definition.id, source.id).length === 0;
    const report = evaluateDatabaseFinalState({
      finalState: {
        databaseId: definition.id,
        sourceId: source.id,
        expectedDatabaseId: definition.id,
        expectedSourceId: source.id,
        canonicalRecordIds: [record.id],
        expectedRecordIds: [record.id],
        manifestPresent,
        recordsPresent,
        valid: true,
      },
      evidence: {
        expectedRecordIds: [record.id],
        returnedRecordIds: [record.id],
        citations: evidence.map(({ recordId, path }) => ({ recordId, path })),
        expectedPathsByRecordId: { [record.id]: record.path },
        complete: pack.isComplete,
      },
      tokens: {
        estimated: pack.budget.estimatedTokens,
        budget: pack.budget.maxTokens,
        input: pack.budget.estimatedTokens,
        output: 0,
      },
      toolTrace: {
        calls: toolCalls,
        maxCalls: 8,
      },
      latency: { totalMs, maxMs: 10_000 },
      recovery: {
        previewCanApply: undoPreview.canApply,
        applied: undo.action === 'apply' && undo.receipt !== null,
        restored,
      },
    });

    expect(report.passes).toBe(true);
    expect(report.finalState.pass).toBe(true);
    expect(report.evidence).toMatchObject({ recall: 1, precision: 1, citationPrecision: 1 });
    expect(report.tokens.pass).toBe(true);
    expect(report.toolTrace.calls).toBe(6);
    expect(report.recovery.pass).toBe(true);
  });

  test('rejects transcript-looking results with missing citations or partial recovery', () => {
    const report = evaluateDatabaseFinalState({
      finalState: {
        databaseId: 'db_expected',
        sourceId: 'ds_expected',
        expectedDatabaseId: 'db_expected',
        expectedSourceId: 'ds_expected',
        canonicalRecordIds: ['rec_expected'],
        expectedRecordIds: ['rec_expected'],
        manifestPresent: true,
        recordsPresent: true,
        valid: true,
      },
      evidence: {
        expectedRecordIds: ['rec_expected'],
        returnedRecordIds: ['rec_expected'],
        citations: [{ recordId: 'rec_expected', path: 'wrong.md' }],
        expectedPathsByRecordId: { rec_expected: 'right.md' },
        complete: true,
      },
      tokens: { estimated: 5, budget: 10, input: 5, output: 0 },
      toolTrace: { calls: ['data_plan.create_draft'], maxCalls: 8 },
      latency: { totalMs: 2, maxMs: 10 },
      recovery: { previewCanApply: true, applied: false, restored: false },
    });

    expect(report.passes).toBe(false);
    expect(report.evidence.citationPrecision).toBe(0);
    expect(report.recovery.pass).toBe(false);
  });
});
