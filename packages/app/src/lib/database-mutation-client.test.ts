import { describe, expect, mock, test } from 'bun:test';
import {
  applyDatabaseUiRedo,
  applyDatabaseUiUndo,
  createDatabaseButtonPlan,
  createDatabaseVerificationPlan,
  DatabaseMutationClientError,
  DatabasePlanExecutionError,
  executeDatabaseButtonPlan,
  executeDatabaseUiMutation,
  executeReviewedDatabasePlan,
  previewDatabaseUiRedo,
  previewDatabaseUiUndo,
} from './database-mutation-client.ts';

const hash = `sha256:${'a'.repeat(64)}`;
const snapshotRevision = `sha256:${'b'.repeat(64)}`;
const desiredState = {
  database: {
    key: 'projects',
    name: 'Projects',
    contract: {
      purpose: 'Track projects',
      canonicality: 'canonical' as const,
      vocabulary: ['project'],
      freshness: { expectation: 'realtime' as const, maxAgeSeconds: 60 },
      sensitivity: 'internal' as const,
    },
  },
  sources: [
    {
      key: 'projects',
      name: 'Projects',
      recordMeaning: 'One project',
      folder: 'projects',
      properties: [{ key: 'title', name: 'Title', type: 'title' as const }],
    },
  ],
  views: [],
};

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    id: 'plan_1',
    hash,
    draftId: 'draft_1',
    draftRevision: hash,
    snapshotRevision,
    createdAt: '2026-07-20T00:00:00.000Z',
    expiresAt: '2026-07-20T00:10:00.000Z',
    immutableTargetSet: ['db_projects'],
    writeGuards: { permissions: [], querySnapshots: [] },
    targetResolutions: [],
    normalizedOperations: [],
    affectedObjects: {
      databaseIds: ['db_projects'],
      sourceIds: [],
      propertyIds: [],
      viewIds: [],
      recordIds: [],
    },
    diff: { mode: 'exact', manifests: [], records: [], templates: [], policy: null },
    risk: { level: 'low', reasons: [] },
    conflicts: [],
    approvals: [],
    postconditions: [],
    committable: true,
    requiresCommit: true,
    ...overrides,
  };
}

describe('database UI mutation client', () => {
  test('creates a Verification draft with authenticated attribution and binds the returned plan review', async () => {
    const requests: Record<string, unknown>[] = [];
    const fetchImplementation = mock(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      if (body.action === 'create_verification_draft') {
        return response({
          action: body.action,
          draft: { id: 'draft_1', revision: hash },
          review: {
            action: 'verify',
            databaseId: 'db_projects',
            sourceId: 'ds_projects',
            recordId: 'rec_one',
            propertyId: 'prop_verification',
            actor: { kind: 'human', principal_id: 'user:local' },
          },
        });
      }
      return response({
        action: 'create_plan',
        plan: artifact({
          verificationReview: {
            action: 'verify',
            databaseId: 'db_projects',
            sourceId: 'ds_projects',
            recordId: 'rec_one',
            propertyId: 'prop_verification',
            actor: { kind: 'human', principal_id: 'user:local' },
            expectedRevision: hash,
            verifiedAt: '2026-07-20T00:00:00.000Z',
            expiresAt: null,
            evidenceRevision: hash,
            notePresent: false,
          },
        }),
      });
    });
    const result = await createDatabaseVerificationPlan(
      {
        lifecycle: {
          action: 'verify',
          databaseId: 'db_projects',
          sourceId: 'ds_projects',
          recordId: 'rec_one',
          propertyId: 'prop_verification',
          expectedRevision: hash,
          evidenceRevision: hash,
        },
        actor: { principalId: 'user:local' },
      },
      { fetch: fetchImplementation as unknown as typeof fetch },
    );
    expect(result.plan.verificationReview?.actor).toEqual({
      kind: 'human',
      principal_id: 'user:local',
    });
    expect(requests[0]).toEqual({
      action: 'create_verification_draft',
      lifecycle: {
        action: 'verify',
        databaseId: 'db_projects',
        sourceId: 'ds_projects',
        recordId: 'rec_one',
        propertyId: 'prop_verification',
        expectedRevision: hash,
        evidenceRevision: hash,
      },
      actor: { principalId: 'user:local', kind: 'human' },
    });
  });

  test('parses an exact Button plan and preserves the revision-bound request', async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetchImplementation = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ path: String(input), body });
      return response({
        plan: {
          id: 'buttonplan_1',
          hash,
          createdAt: '2026-07-20T00:00:00.000Z',
          databaseId: 'db_projects',
          sourceId: 'ds_projects',
          recordId: 'rec_one',
          propertyId: 'prop_finish',
          buttonId: null,
          label: 'Finish',
          confirmation: null,
          expectedRecordRevision: hash,
          databaseSnapshotRevision: snapshotRevision,
          permissionGuards: [],
          internalPlan: artifact(),
          externalSteps: [],
          risk: { level: 'low', reasons: [] },
          requiresApproval: false,
        },
      });
    });
    const plan = await createDatabaseButtonPlan(
      {
        databaseId: 'db_projects',
        sourceId: 'ds_projects',
        recordId: 'rec_one',
        propertyId: 'prop_finish',
        expectedRecordRevision: hash,
      },
      { fetch: fetchImplementation as unknown as typeof fetch },
    );
    expect(plan).toMatchObject({ id: 'buttonplan_1', internalPlan: { id: 'plan_1' } });
    expect(requests).toEqual([
      {
        path: '/api/databases/button',
        body: {
          databaseId: 'db_projects',
          sourceId: 'ds_projects',
          recordId: 'rec_one',
          propertyId: 'prop_finish',
          expectedRecordRevision: hash,
        },
      },
    ]);
  });

  test('parses a database-level Button plan without inventing record context', async () => {
    const fetchImplementation = mock(async () =>
      response({
        plan: {
          id: 'buttonplan_database',
          hash,
          createdAt: '2026-07-20T00:00:00.000Z',
          databaseId: 'db_projects',
          sourceId: 'ds_projects',
          recordId: null,
          propertyId: null,
          buttonId: 'dbbtn_create_pair',
          label: 'Create pair',
          confirmation: null,
          expectedRecordRevision: null,
          databaseSnapshotRevision: snapshotRevision,
          permissionGuards: [],
          internalPlan: artifact(),
          externalSteps: [],
          risk: { level: 'low', reasons: [] },
          requiresApproval: true,
        },
      }),
    );
    const plan = await createDatabaseButtonPlan(
      { databaseId: 'db_projects', buttonId: 'dbbtn_create_pair' },
      { fetch: fetchImplementation as unknown as typeof fetch },
    );
    expect(plan).toMatchObject({
      buttonId: 'dbbtn_create_pair',
      recordId: null,
      expectedRecordRevision: null,
    });
  });

  test('executes the exact reviewed composite Button plan through one durable receipt', async () => {
    let request: Record<string, unknown> = {};
    const fetchImplementation = mock(async (_input: unknown, init?: RequestInit) => {
      request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return response({
        action: 'execute',
        run: {
          version: 1,
          id: 'buttonrun_one',
          buttonPlanId: 'buttonplan_1',
          buttonPlanHash: hash,
          databaseId: 'db_projects',
          recordId: 'rec_one',
          buttonId: null,
          propertyId: 'prop_finish',
          state: 'succeeded',
          attempt: 1,
          createdAt: '2026-07-20T00:00:00.000Z',
          startedAt: '2026-07-20T00:00:00.000Z',
          finishedAt: '2026-07-20T00:00:01.000Z',
          nextAttemptAt: null,
          internalMutationId: 'mut_one',
          actions: [
            {
              actionId: 'publish',
              kind: 'external_webhook',
              state: 'succeeded',
              receiptId: 'delivery_one',
            },
          ],
          errorCode: null,
          error: null,
        },
        undoToken: 'undo_one.token',
      });
    });
    const buttonPlan = {
      id: 'buttonplan_1',
      hash,
    } as Parameters<typeof executeDatabaseButtonPlan>[0]['plan'];
    const result = await executeDatabaseButtonPlan(
      {
        plan: buttonPlan,
        actor: { principalId: 'user:local' },
        idempotencyKey: 'ui-button-execution-one',
      },
      { fetch: fetchImplementation as unknown as typeof fetch },
    );
    expect(result).toMatchObject({
      run: { id: 'buttonrun_one', state: 'succeeded' },
      undoToken: 'undo_one.token',
    });
    expect(request).toEqual({
      action: 'execute',
      buttonPlanId: 'buttonplan_1',
      buttonPlanHash: hash,
      idempotencyKey: 'ui-button-execution-one',
      approvalToken: `approve:${hash}`,
      actor: { principalId: 'user:local', kind: 'human' },
    });
  });

  test('reviews and commits the exact server plan with a human actor', async () => {
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const fetchImplementation = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const path = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ path, body });
      if (body.action === 'create_draft') {
        return response({
          action: 'create_draft',
          draft: { id: 'draft_1', revision: hash, desiredState },
        });
      }
      if (body.action === 'create_plan') {
        return response({ action: 'create_plan', plan: artifact() });
      }
      return response({
        mutationId: 'mut_1',
        planId: 'plan_1',
        planHash: hash,
        idempotentReplay: false,
        actualDiff: [],
        verification: { status: 'passed', checks: [] },
        revisions: { gitHead: `sha1:${'c'.repeat(40)}`, snapshotRevision },
        auditReceipt: {},
        undoToken: 'undo_1',
      });
    });
    const reviewed: string[] = [];
    const ghosts: Array<string | null> = [];
    const outcome = await executeDatabaseUiMutation(
      {
        desiredState,
        actor: { principalId: 'user:local', sessionId: 'session-1' },
        idempotencyKey: 'ui-project-create-0001',
        review: (plan) => {
          reviewed.push(plan.hash);
          return true;
        },
        onGhostStateChange: (ghost) =>
          ghosts.push(ghost ? `${ghost.phase}:${String(ghost.canonical)}` : null),
      },
      { fetch: fetchImplementation as unknown as typeof fetch },
    );
    expect(outcome).toMatchObject({ status: 'committed', result: { mutationId: 'mut_1' } });
    expect(reviewed).toEqual([hash]);
    expect(ghosts).toEqual(['review:false', 'committing:false', null]);
    expect(requests).toHaveLength(3);
    expect(requests[2]).toEqual({
      path: '/api/databases/commit',
      body: {
        planId: 'plan_1',
        planHash: hash,
        expectedSnapshotRevision: snapshotRevision,
        idempotencyKey: 'ui-project-create-0001',
        approvalToken: `approve:${hash}`,
        actor: { principalId: 'user:local', sessionId: 'session-1', kind: 'human' },
      },
    });
  });

  test('never commits blocked, converged, or declined plans', async () => {
    for (const [plan, expectedStatus, review] of [
      [artifact({ committable: false, conflicts: [{ code: 'blocked' }] }), 'blocked', true],
      [artifact({ requiresCommit: false }), 'converged', true],
      [artifact(), 'review_declined', false],
    ] as const) {
      const requests: Record<string, unknown>[] = [];
      const fetchImplementation = mock(async (_input: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requests.push(body);
        return body.action === 'create_draft'
          ? response({ action: 'create_draft', draft: { id: 'draft_1', revision: hash } })
          : response({ action: 'create_plan', plan });
      });
      const outcome = await executeDatabaseUiMutation(
        {
          desiredState,
          actor: { principalId: 'user:local' },
          idempotencyKey: 'ui-no-commit-0001',
          review: () => review,
        },
        { fetch: fetchImplementation as unknown as typeof fetch },
      );
      expect(outcome.status).toBe(expectedStatus);
      expect(requests).toHaveLength(2);
    }
  });

  test('treats an already converged but non-committable plan as converged', async () => {
    const plan = artifact({ committable: false, requiresCommit: false });
    const fetchImplementation = mock(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return body.action === 'create_draft'
        ? response({ action: 'create_draft', draft: { id: 'draft_1', revision: hash } })
        : response({ action: 'create_plan', plan });
    });

    const outcome = await executeDatabaseUiMutation(
      {
        desiredState,
        actor: { principalId: 'user:local' },
        idempotencyKey: 'ui-converged-0001',
        review: () => {
          throw new Error('A converged plan must not enter review');
        },
      },
      { fetch: fetchImplementation as unknown as typeof fetch },
    );

    expect(outcome.status).toBe('converged');
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  test('preserves the reviewed plan when a concurrent commit returns 409', async () => {
    const reviewedPlan = artifact({ conflictDomains: ['record_value', 'view'] });
    const fetchImplementation = mock(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.action === 'create_draft') {
        return response({ action: 'create_draft', draft: { id: 'draft_1', revision: hash } });
      }
      if (body.action === 'create_plan') {
        return response({ action: 'create_plan', plan: reviewedPlan });
      }
      return response(
        {
          code: 'snapshot_changed',
          detail: 'Database snapshot changed after planning',
          recovery: { action: 'recreate_plan' },
        },
        409,
      );
    });

    try {
      await executeDatabaseUiMutation(
        {
          desiredState,
          actor: { principalId: 'user:local' },
          idempotencyKey: 'ui-conflict-0001',
          review: () => true,
        },
        { fetch: fetchImplementation as unknown as typeof fetch },
      );
      throw new Error('expected concurrent change to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabasePlanExecutionError);
      expect(error).toMatchObject({
        status: 409,
        plan: { id: 'plan_1', conflictDomains: ['record_value', 'view'] },
      });
    }
  });

  test('routes a precompiled migration plan through the same human review and commit seam', async () => {
    const requests: Record<string, unknown>[] = [];
    const fetchImplementation = mock(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(body);
      return response({
        mutationId: 'mut_conversion',
        planId: 'plan_1',
        planHash: hash,
        idempotentReplay: false,
        actualDiff: [],
        verification: { status: 'passed', checks: [] },
        revisions: { gitHead: `sha1:${'c'.repeat(40)}`, snapshotRevision },
        auditReceipt: {},
        undoToken: 'undo_conversion',
      });
    });
    const phases: Array<string | null> = [];
    const outcome = await executeReviewedDatabasePlan(
      {
        plan: artifact(),
        actor: { principalId: 'user:local' },
        idempotencyKey: 'ui-conversion-0001',
        review: () => true,
        onGhostStateChange: (ghost) => phases.push(ghost?.phase ?? null),
      },
      { fetch: fetchImplementation as unknown as typeof fetch },
    );
    expect(outcome).toMatchObject({
      status: 'committed',
      result: { undoToken: 'undo_conversion' },
    });
    expect(phases).toEqual(['review', 'committing', null]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      planId: 'plan_1',
      approvalToken: `approve:${hash}`,
      actor: { principalId: 'user:local', kind: 'human' },
    });
  });

  test('previews and applies undo through the canonical endpoint', async () => {
    const actions: string[] = [];
    const fetchImplementation = mock(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      actions.push(String(body.action));
      return response({
        action: body.action,
        undoId: 'undo_1',
        mutationId: 'mut_1',
        canApply: true,
        idempotentReplay: false,
        expectedSnapshotRevision: snapshotRevision,
        observedSnapshotRevision: snapshotRevision,
        conflicts: [],
        receipt: body.action === 'apply' || body.action === 'redo_apply' ? {} : null,
      });
    });
    const options = { fetch: fetchImplementation as unknown as typeof fetch };
    expect(await previewDatabaseUiUndo('undo_1', options)).toMatchObject({ action: 'preview' });
    expect(
      await applyDatabaseUiUndo(
        {
          undoToken: 'undo_1',
          actor: { principalId: 'user:local' },
          idempotencyKey: 'ui-undo-0001',
        },
        options,
      ),
    ).toMatchObject({ action: 'apply' });
    expect(await previewDatabaseUiRedo('undo_1', options)).toMatchObject({
      action: 'redo_preview',
    });
    expect(
      await applyDatabaseUiRedo(
        {
          undoToken: 'undo_1',
          actor: { principalId: 'user:local' },
          idempotencyKey: 'ui-redo-0001',
        },
        options,
      ),
    ).toMatchObject({ action: 'redo_apply' });
    expect(actions).toEqual(['preview', 'apply', 'redo_preview', 'redo_apply']);
  });

  test('preserves machine-readable server problems and refuses mismatched receipts', async () => {
    const deniedFetch = mock(async () =>
      response({ code: 'permission_denied', detail: 'Write access is denied.' }, 403),
    );
    await expect(
      executeDatabaseUiMutation(
        {
          desiredState,
          actor: { principalId: 'user:local' },
          idempotencyKey: 'ui-denied-0001',
          review: () => true,
        },
        { fetch: deniedFetch as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      name: 'DatabaseMutationClientError',
      status: 403,
      problem: { code: 'permission_denied' },
    });

    const invalidFetch = mock(async () => response({ action: 'create_draft', draft: {} }));
    try {
      await executeDatabaseUiMutation(
        {
          desiredState,
          actor: { principalId: 'user:local' },
          idempotencyKey: 'ui-invalid-0001',
          review: () => true,
        },
        { fetch: invalidFetch as unknown as typeof fetch },
      );
      throw new Error('expected invalid response to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(DatabaseMutationClientError);
      expect(error).toMatchObject({ status: 502 });
    }
  });

  test('refuses a commit receipt unless server verification passed', async () => {
    const fetchImplementation = mock(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (body.action === 'create_draft') {
        return response({ action: 'create_draft', draft: { id: 'draft_1', revision: hash } });
      }
      if (body.action === 'create_plan') {
        return response({ action: 'create_plan', plan: artifact() });
      }
      return response({
        mutationId: 'mut_1',
        planId: 'plan_1',
        planHash: hash,
        idempotentReplay: false,
        actualDiff: [],
        verification: { status: 'failed', checks: [{ id: 'index', status: 'failed' }] },
        revisions: { gitHead: `sha1:${'c'.repeat(40)}`, snapshotRevision },
        auditReceipt: {},
        undoToken: 'undo_1',
      });
    });

    await expect(
      executeDatabaseUiMutation(
        {
          desiredState,
          actor: { principalId: 'user:local' },
          idempotencyKey: 'ui-failed-verification-0001',
          review: () => true,
        },
        { fetch: fetchImplementation as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      name: 'DatabaseMutationClientError',
      status: 502,
      message: 'Database commit did not return passed verification',
    });
  });
});
