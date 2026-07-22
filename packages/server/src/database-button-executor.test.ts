import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseButtonPlan } from './database-button.ts';
import { createDatabaseButtonExecutor } from './database-button-executor.ts';
import type { DatabaseCommitResult } from './database-commit.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function plan(internal = false): DatabaseButtonPlan {
  return {
    id: 'buttonplan_one',
    hash: `sha256:${'a'.repeat(64)}`,
    createdAt: '2026-07-21T00:00:00.000Z',
    databaseId: 'db_tasks',
    sourceId: 'ds_tasks',
    recordId: 'rec_one',
    propertyId: 'prop_run',
    buttonId: null,
    label: 'Run',
    confirmation: null,
    expectedRecordRevision: `sha256:${'b'.repeat(64)}`,
    databaseSnapshotRevision: `sha256:${'c'.repeat(64)}`,
    permissionGuards: [{ actionId: 'publish', policyId: 'button-owner', policyRevision: 'rev_1' }],
    internalPlan: internal
      ? ({
          id: 'plan_internal',
          hash: `sha256:${'d'.repeat(64)}`,
          snapshotRevision: `sha256:${'c'.repeat(64)}`,
          committable: true,
        } as DatabaseButtonPlan['internalPlan'])
      : null,
    externalSteps: [
      {
        actionId: 'publish',
        kind: 'external_webhook',
        connectionId: 'conn_tasks',
        eventName: 'task_changed',
        payload: {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          recordId: 'rec_one',
          recordRevision: `sha256:${'b'.repeat(64)}`,
          properties: { prop_title: 'Task' },
        },
        egressBytes: 100,
      },
    ],
    risk: { level: 'high', reasons: ['external_side_effect'] },
    requiresApproval: true,
  };
}

function commitResult(): DatabaseCommitResult {
  return {
    mutationId: 'mut_one',
    planId: 'plan_internal',
    planHash: `sha256:${'d'.repeat(64)}`,
    idempotentReplay: false,
    actualDiff: [],
    verification: { status: 'passed', postconditions: [] },
    revisions: { gitHead: `sha1:${'e'.repeat(40)}`, snapshotRevision: `sha256:${'f'.repeat(64)}` },
    auditReceipt: {} as DatabaseCommitResult['auditReceipt'],
    undoToken: 'undo_one.token',
  };
}

describe('DatabaseButtonExecutor', () => {
  test('binds exact approval and persists a composite internal/external receipt locally', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-button-executor-'));
    tempDirs.push(projectDir);
    const commits: string[] = [];
    const deliveries: string[] = [];
    const invocations: string[] = [];
    const executor = createDatabaseButtonExecutor({
      projectDir,
      commit: async (input) => {
        commits.push(input.idempotencyKey);
        return commitResult();
      },
      getIdempotentCommit: async () => null,
      resolvePermission: () => ({
        allowed: true,
        policyId: 'button-owner',
        policyRevision: 'rev_1',
      }),
      resolveExternalPolicy: () => ({
        allowed: true,
        policyId: 'connection:conn_tasks',
        policyRevision: 'conn_rev_1',
        maxEgressBytes: 1_000,
      }),
      deliverExternal: async ({ idempotencyKey }) => {
        deliveries.push(idempotencyKey);
        return { receiptId: 'delivery_one' };
      },
      publishInvocation: async ({ executionReceiptId }) => {
        invocations.push(executionReceiptId);
      },
      now: () => new Date('2026-07-21T00:00:00.000Z'),
      generateUuid: () => 'aaaaaaaa-0000-4000-8000-000000000000',
    });
    const buttonPlan = plan(true);
    const input = {
      buttonPlanId: buttonPlan.id,
      buttonPlanHash: buttonPlan.hash,
      idempotencyKey: 'button-request-one',
      approvalToken: `approve:${buttonPlan.hash}`,
      actor: { principalId: 'user:local', kind: 'human' as const },
    };
    const result = await executor.execute(buttonPlan, input);
    expect(result).toMatchObject({
      run: {
        state: 'succeeded',
        internalMutationId: 'mut_one',
        actions: [
          { kind: 'internal_commit', receiptId: 'mut_one' },
          { actionId: 'publish', receiptId: 'delivery_one' },
        ],
      },
      undoToken: 'undo_one.token',
    });
    expect(commits).toEqual([
      'button:sha256:af7d5ffeeab8dad6c4b7f6355bb1ea482f4e4c74be1aeec38638298f27f8c507:internal',
    ]);
    expect(deliveries).toEqual([
      'button-run:buttonrun_aaaaaaaa000040008000000000000000:action:publish',
    ]);
    expect(await executor.execute(buttonPlan, input)).toEqual(result);
    expect(commits).toHaveLength(1);
    expect(deliveries).toHaveLength(1);
    expect(invocations).toEqual(['mut_one']);
    expect(existsSync(join(projectDir, '.ok', 'local', 'database-button-runs.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'button-runs.json'))).toBe(false);
  });

  test('recovers a failed external delivery after restart without replaying a durable commit', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-button-recovery-'));
    tempDirs.push(projectDir);
    let now = new Date('2026-07-21T00:00:00.000Z');
    let deliveryAttempts = 0;
    const options = {
      projectDir,
      commit: async () => commitResult(),
      getIdempotentCommit: async () => commitResult(),
      resolvePermission: () => ({
        allowed: true,
        policyId: 'button-owner',
        policyRevision: 'rev_1',
      }),
      resolveExternalPolicy: () => ({
        allowed: true,
        policyId: 'connection:conn_tasks',
        policyRevision: 'conn_rev_1',
        maxEgressBytes: 1_000,
      }),
      deliverExternal: async () => {
        deliveryAttempts += 1;
        if (deliveryAttempts === 1) throw new Error('temporary delivery failure');
        return { receiptId: 'delivery_recovered' };
      },
      publishInvocation: async () => undefined,
      now: () => now,
      generateUuid: () => 'bbbbbbbb-0000-4000-8000-000000000000',
    };
    const buttonPlan = plan(true);
    expect(
      (
        await createDatabaseButtonExecutor(options).execute(buttonPlan, {
          buttonPlanId: buttonPlan.id,
          buttonPlanHash: buttonPlan.hash,
          idempotencyKey: 'button-request-recovery',
          approvalToken: `approve:${buttonPlan.hash}`,
          actor: { principalId: 'user:local', kind: 'human' },
        })
      ).run,
    ).toMatchObject({ state: 'retry_wait', attempt: 1, internalMutationId: 'mut_one' });
    now = new Date('2026-07-21T00:01:00.000Z');
    expect((await createDatabaseButtonExecutor(options).tick())[0]).toMatchObject({
      state: 'succeeded',
      attempt: 2,
      internalMutationId: 'mut_one',
      actions: [{ kind: 'internal_commit' }, { receiptId: 'delivery_recovered' }],
    });
    expect(deliveryAttempts).toBe(2);
  });

  test('fails closed when permission revision changes before a retry', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-button-policy-'));
    tempDirs.push(projectDir);
    let now = new Date('2026-07-21T00:00:00.000Z');
    let policyRevision = 'rev_1';
    let deliveries = 0;
    const options = {
      projectDir,
      commit: async () => commitResult(),
      getIdempotentCommit: async () => null,
      resolvePermission: () => ({
        allowed: true,
        policyId: 'button-owner',
        policyRevision,
      }),
      resolveExternalPolicy: () => ({
        allowed: true,
        policyId: 'connection:conn_tasks',
        policyRevision: 'conn_rev_1',
        maxEgressBytes: 1_000,
      }),
      deliverExternal: async () => {
        deliveries += 1;
        throw new Error('temporary delivery failure');
      },
      publishInvocation: async () => undefined,
      now: () => now,
    };
    const buttonPlan = plan(false);
    expect(
      (
        await createDatabaseButtonExecutor(options).execute(buttonPlan, {
          buttonPlanId: buttonPlan.id,
          buttonPlanHash: buttonPlan.hash,
          idempotencyKey: 'button-policy-change',
          approvalToken: `approve:${buttonPlan.hash}`,
          actor: { principalId: 'user:local', kind: 'human' },
        })
      ).run,
    ).toMatchObject({ state: 'retry_wait', errorCode: 'delivery_failed' });
    policyRevision = 'rev_2';
    now = new Date('2026-07-21T00:01:00.000Z');
    expect((await createDatabaseButtonExecutor(options).tick())[0]).toMatchObject({
      state: 'failed',
      errorCode: 'permission_changed',
    });
    expect(deliveries).toBe(1);
  });
});
