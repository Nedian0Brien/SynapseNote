import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabaseAgentRunStore,
  DatabaseAgentRunStoreError,
} from './database-agent-run-store.ts';
import type { DatabaseCommitResult } from './database-commit.ts';
import type { DatabaseDraftArtifact, DatabasePlanArtifact } from './database-plan.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-agent-runs-'));
  tempDirs.push(projectDir);
  let tick = 0;
  let id = 0;
  const store = createDatabaseAgentRunStore({
    projectDir,
    now: () => new Date(Date.UTC(2026, 6, 20, 0, 0, tick++)),
    generateId: () => `run_test_${++id}`,
  });
  return { projectDir, store };
}

function plan(): DatabasePlanArtifact {
  return {
    id: 'plan_test',
    hash: `sha256:${'1'.repeat(64)}`,
    draftId: 'draft_test',
    draftRevision: `sha256:${'2'.repeat(64)}`,
    snapshotRevision: 'sha256:empty',
    createdAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T01:00:00.000Z',
    immutableTargetSet: ['db_tasks', 'rec_first'],
    writeGuards: { permissions: [], querySnapshots: [] },
    targetResolutions: [],
    normalizedOperations: [],
    affectedObjects: {
      databaseIds: ['db_tasks'],
      sourceIds: ['ds_tasks'],
      propertyIds: ['prop_title'],
      viewIds: [],
      recordIds: ['rec_first'],
    },
    diff: {
      mode: 'exact',
      manifests: [],
      records: [
        {
          recordId: 'rec_first',
          sourceId: 'ds_tasks',
          path: 'tasks/first.md',
          action: 'create',
          before: null,
          after: { values: { prop_title: 'First' }, body: 'Body\n' },
        },
      ],
      templates: [],
      policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 10 },
    },
    risk: { level: 'medium', reasons: ['Creates 1 canonical record'] },
    conflicts: [],
    approvals: [
      { code: 'sample_record_write', required: true, reason: 'Record write requires approval' },
    ],
    postconditions: [],
    committable: true,
    requiresCommit: true,
  };
}

function draft(): DatabaseDraftArtifact {
  return {
    id: 'draft_test',
    revision: `sha256:${'2'.repeat(64)}`,
    createdAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T01:00:00.000Z',
    desiredState: {} as DatabaseDraftArtifact['desiredState'],
    normalized: {} as DatabaseDraftArtifact['normalized'],
  };
}

describe('DatabaseAgentRunStore', () => {
  test('persists a bounded proposal, execution, verification, and undo lifecycle', async () => {
    const { projectDir, store } = fixture();
    const actor = { principalId: 'agent:test', kind: 'agent' as const, sessionId: 'session-1' };
    const proposed = await store.propose(plan(), actor);
    expect(proposed).toMatchObject({
      id: 'run_test_1',
      state: 'awaiting_approval',
      actor,
      intent: { rawPromptStored: false },
      scope: { databaseIds: ['db_tasks'], recordIds: ['rec_first'] },
      proposedDiff: { complete: true, omittedReason: null },
      verification: { status: 'pending' },
      undo: { available: false, token: null },
    });
    expect((await store.propose(plan(), actor)).id).toBe(proposed.id);
    expect(await store.markExecuting(proposed.id)).toMatchObject({ state: 'executing' });
    const succeeded = await store.markSucceeded(proposed.id, {
      mutationId: 'mut_test',
      actualDiff: [
        {
          operation: 'create',
          path: 'content/tasks/first.md',
          before: null,
          after: {
            sha256: `sha256:${'3'.repeat(64)}`,
            gitBlob: `sha1:${'4'.repeat(40)}`,
            bytes: 10,
          },
        },
      ],
      verification: {
        status: 'passed',
        checks: [{ code: 'manifest_valid', status: 'passed', message: 'Manifest valid' }],
      },
      undoToken: 'undo_test.secret',
    } as DatabaseCommitResult);
    expect(succeeded).toMatchObject({
      state: 'succeeded',
      execution: { mutationId: 'mut_test' },
      verification: { status: 'passed' },
      undo: { available: true, token: 'undo_test.secret' },
    });
    const restarted = createDatabaseAgentRunStore({ projectDir });
    expect((await restarted.list()).runs).toEqual([succeeded]);
    const path = join(projectDir, '.ok', 'local', 'database-agent-runs', 'v1', 'runs.json');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, 'utf8')).not.toContain('"rawPrompt":');
  });

  test('records content-free failure and detects tampering', async () => {
    const { projectDir, store } = fixture();
    const proposed = await store.propose(plan(), {
      principalId: 'agent:test',
      kind: 'agent',
      sessionId: 'session-2',
    });
    const failed = await store.markFailed(proposed.id, {
      code: 'snapshot_changed',
      message: 'Database snapshot changed after planning',
    });
    expect(failed).toMatchObject({
      state: 'failed',
      failure: { code: 'snapshot_changed' },
      verification: { status: 'failed' },
      undo: { available: false },
    });
    const path = join(projectDir, '.ok', 'local', 'database-agent-runs', 'v1', 'runs.json');
    const state = JSON.parse(readFileSync(path, 'utf8')) as { runs: Array<{ state: string }> };
    if (state.runs[0]) state.runs[0].state = 'succeeded';
    writeFileSync(path, JSON.stringify(state), { mode: 0o600 });
    await expect(store.list()).rejects.toBeInstanceOf(DatabaseAgentRunStoreError);
  });

  test('omits an oversized proposed diff explicitly instead of bloating local history', async () => {
    const { projectDir, store } = fixture();
    const oversized = plan();
    const record = oversized.diff.records[0];
    if (!record) throw new Error('Expected a record diff fixture');
    record.after.body = 'x'.repeat(129 * 1024);

    const proposed = await store.propose(oversized, {
      principalId: 'agent:test',
      kind: 'agent',
      sessionId: 'session-large-diff',
    });

    expect(proposed.proposedDiff).toMatchObject({
      complete: false,
      omittedReason: 'size_limit',
      value: null,
    });
    expect(proposed.proposedDiff.originalBytes).toBeGreaterThan(128 * 1024);
    const path = join(projectDir, '.ok', 'local', 'database-agent-runs', 'v1', 'runs.json');
    expect(statSync(path).size).toBeLessThan(32 * 1024);
  });

  test('creates revision-bound idempotent retry and resume handoffs', async () => {
    const { projectDir, store } = fixture();
    const actor = {
      principalId: 'agent:test',
      kind: 'agent' as const,
      sessionId: 'session-recovery',
    };
    const original = await store.propose(plan(), actor);
    const failed = await store.markFailed(original.id, {
      code: 'transaction_failed',
      message: 'The atomic commit stopped before verification',
    });
    const retrySource = await store.prepareRecovery(failed.id, failed.revision);
    expect(retrySource).toMatchObject({ state: 'failed', recovery: { attempt: 1 } });
    const unrelatedPending = await store.propose(plan(), actor);

    const retried = await store.propose(plan(), actor, {
      action: 'retry',
      sourceRunId: failed.id,
      idempotencyKey: 'agent-run-retry-request-0001',
    });
    expect(retried).toMatchObject({
      state: 'awaiting_approval',
      recovery: { attempt: 2, action: 'retry', sourceRunId: failed.id },
    });
    expect(retried.id).not.toBe(unrelatedPending.id);
    expect(
      await store.propose(plan(), actor, {
        action: 'retry',
        sourceRunId: failed.id,
        idempotencyKey: 'agent-run-retry-request-0001',
      }),
    ).toEqual(retried);
    const resumeFailed = await store.markFailed(unrelatedPending.id, {
      code: 'transaction_failed',
      message: 'The independent attempt also failed before verification',
    });
    const resumed = await store.propose(plan(), actor, {
      action: 'resume',
      sourceRunId: resumeFailed.id,
      idempotencyKey: 'agent-run-resume-request-0001',
    });
    expect(resumed).toMatchObject({
      state: 'awaiting_approval',
      recovery: { attempt: 2, action: 'resume', sourceRunId: resumeFailed.id },
    });
    await expect(store.prepareRecovery(failed.id, 'sha256:changed')).rejects.toMatchObject({
      code: 'agent_run_revision_changed',
    });
    await expect(store.prepareRecovery(retried.id, retried.revision)).rejects.toMatchObject({
      code: 'agent_run_not_retryable',
    });
    const stored = readFileSync(
      join(projectDir, '.ok', 'local', 'database-agent-runs', 'v1', 'runs.json'),
      'utf8',
    );
    expect(stored).not.toContain('agent-run-retry-request-0001');
  });

  test('persists an exact plan bundle across a store restart and rejects tampering', async () => {
    const { projectDir, store } = fixture();
    const persisted = await store.persistPlanBundle(plan(), draft());
    expect(persisted).toMatchObject({
      version: 1,
      plan: { id: 'plan_test', draftId: 'draft_test' },
      draft: { id: 'draft_test', revision: `sha256:${'2'.repeat(64)}` },
    });
    const restarted = createDatabaseAgentRunStore({ projectDir });
    expect(await restarted.getPlanBundle('plan_test')).toEqual(persisted);
    const path = join(
      projectDir,
      '.ok',
      'local',
      'database-agent-runs',
      'v1',
      'plans',
      'plan_test.json',
    );
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const tampered = JSON.parse(readFileSync(path, 'utf8')) as {
      plan: { hash: string };
    };
    tampered.plan.hash = `sha256:${'9'.repeat(64)}`;
    writeFileSync(path, JSON.stringify(tampered), { mode: 0o600 });
    await expect(restarted.getPlanBundle('plan_test')).rejects.toMatchObject({
      code: 'agent_run_store_corrupt',
    });
  });

  test('reports a typed recovery when no immutable plan survived restart', async () => {
    const { store } = fixture();
    await expect(store.getPlanBundle('plan_missing')).rejects.toMatchObject({
      code: 'agent_run_plan_unavailable',
    });
  });
});
