import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { DatabaseAgentRun } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabaseAgentRunsDialog } from './DatabaseAgentRunsDialog';

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function detail(): DatabaseAgentRun {
  return {
    version: 1,
    id: 'run_dom',
    state: 'succeeded',
    revision: `sha256:${'1'.repeat(64)}`,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:01:00.000Z',
    actor: { principalId: 'agent:test', kind: 'agent', sessionId: 'session-1' },
    intent: { summary: 'Update the incident status', rawPromptStored: false },
    scope: {
      databaseIds: ['db_incidents'],
      sourceIds: ['ds_incidents'],
      propertyIds: ['prop_status'],
      viewIds: [],
      recordIds: ['rec_incident'],
    },
    plan: {
      id: 'plan_dom',
      hash: `sha256:${'2'.repeat(64)}`,
      snapshotRevision: `sha256:${'3'.repeat(64)}`,
      expiresAt: '2026-07-20T01:00:00.000Z',
      risk: { level: 'low', reasons: [] },
      approvals: [],
    },
    proposedDiff: {
      complete: true,
      omittedReason: null,
      originalBytes: 50,
      value: { recordId: 'rec_incident', status: 'resolved' },
    },
    execution: {
      startedAt: '2026-07-20T00:00:30.000Z',
      finishedAt: '2026-07-20T00:01:00.000Z',
      mutationId: 'mut_dom',
      actualDiff: [],
    },
    verification: { status: 'passed', checks: [] },
    failure: null,
    undo: { available: true, token: 'undo_dom.secret' },
  };
}

function failedDetail(): DatabaseAgentRun {
  const run = detail();
  return {
    ...run,
    state: 'failed',
    revision: `sha256:${'4'.repeat(64)}`,
    updatedAt: '2026-07-20T00:02:00.000Z',
    execution: {
      ...run.execution,
      finishedAt: '2026-07-20T00:02:00.000Z',
      mutationId: null,
    },
    verification: { status: 'failed', checks: [] },
    failure: { code: 'transaction_failed', message: 'The first attempt failed.' },
    undo: { available: false, token: null },
    recovery: {
      attempt: 1,
      action: 'initial',
      sourceRunId: null,
      idempotencyKeyHash: null,
    },
  };
}

function summaryFor(run: DatabaseAgentRun) {
  return {
    id: run.id,
    state: run.state,
    revision: run.revision,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    intent: run.intent,
    scope: {
      databaseIds: run.scope.databaseIds,
      sourceCount: run.scope.sourceIds.length,
      propertyCount: run.scope.propertyIds.length,
      viewCount: run.scope.viewIds.length,
      recordCount: run.scope.recordIds.length,
    },
    plan: { id: run.plan.id, riskLevel: run.plan.risk.level },
    execution: { mutationId: run.execution.mutationId, actualDiffCount: 0 },
    verification: {
      status: run.verification.status,
      checkCount: 0,
      failedCheckCount: run.verification.status === 'failed' ? 1 : 0,
    },
    failureCode: run.failure?.code ?? null,
    undo: { available: run.undo.available },
    recovery: run.recovery
      ? {
          attempt: run.recovery.attempt,
          action: run.recovery.action,
          sourceRunId: run.recovery.sourceRunId,
        }
      : null,
  };
}

describe('DatabaseAgentRunsDialog DOM behavior', () => {
  test('loads compact history and then the selected exact run', async () => {
    const run = detail();
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { action: string };
      return Response.json(
        request.action === 'list'
          ? {
              action: 'list',
              revision: run.revision,
              runs: [
                {
                  id: run.id,
                  state: run.state,
                  revision: run.revision,
                  createdAt: run.createdAt,
                  updatedAt: run.updatedAt,
                  intent: run.intent,
                  scope: {
                    databaseIds: run.scope.databaseIds,
                    sourceCount: run.scope.sourceIds.length,
                    propertyCount: run.scope.propertyIds.length,
                    viewCount: run.scope.viewIds.length,
                    recordCount: run.scope.recordIds.length,
                  },
                  plan: { id: run.plan.id, riskLevel: run.plan.risk.level },
                  execution: { mutationId: run.execution.mutationId, actualDiffCount: 0 },
                  verification: { status: 'passed', checkCount: 0, failedCheckCount: 0 },
                  failureCode: null,
                  undo: { available: true },
                },
              ],
            }
          : { action: 'get', run },
      );
    }) as typeof fetch;

    render(<DatabaseAgentRunsDialog open={true} onOpenChange={() => {}} />);

    expect(await screen.findByText('Update the incident status')).not.toBeNull();
    expect(await screen.findByText('undo_dom.secret')).not.toBeNull();
    expect(screen.getByTestId('database-agent-run-scope-summary').textContent).toContain(
      '1 database · 1 source · 1 property · 0 views · 1 record',
    );
    expect(screen.getByTestId('database-agent-run-diff-summary').textContent).toContain(
      'Exact diff captured · 50 bytes',
    );
    expect(screen.getByText('Show exact scope')).not.toBeNull();
    expect(screen.getByText('Show proposed diff')).not.toBeNull();
    expect(screen.getAllByText(/rec_incident/).length).toBeGreaterThan(0);
    expect(screen.getByText(/mut_dom/)).not.toBeNull();
  });

  test('shows an explicit empty state and recoverable load error', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ action: 'list', runs: [], revision: 'sha256:empty' }),
    ) as typeof fetch;
    render(<DatabaseAgentRunsDialog open={true} onOpenChange={() => {}} />);
    expect(await screen.findByText('No database agent runs yet.')).not.toBeNull();

    cleanup();
    globalThis.fetch = mock(async () =>
      Response.json({ detail: 'Agent Runs storage is unavailable' }, { status: 503 }),
    ) as typeof fetch;
    render(<DatabaseAgentRunsDialog open={true} onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText('Agent Runs storage is unavailable')).not.toBeNull(),
    );
  });

  test('previews and applies undo without leaving the Agent Runs surface', async () => {
    const run = detail();
    const actions: string[] = [];
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { action: string };
      actions.push(request.action);
      if (request.action === 'list') {
        return Response.json({
          action: 'list',
          revision: run.revision,
          runs: [
            {
              id: run.id,
              state: run.state,
              revision: run.revision,
              createdAt: run.createdAt,
              updatedAt: run.updatedAt,
              intent: run.intent,
              scope: {
                databaseIds: run.scope.databaseIds,
                sourceCount: run.scope.sourceIds.length,
                propertyCount: run.scope.propertyIds.length,
                viewCount: run.scope.viewIds.length,
                recordCount: run.scope.recordIds.length,
              },
              plan: { id: run.plan.id, riskLevel: run.plan.risk.level },
              execution: { mutationId: run.execution.mutationId, actualDiffCount: 0 },
              verification: { status: 'passed', checkCount: 0, failedCheckCount: 0 },
              failureCode: null,
              undo: { available: true },
            },
          ],
        });
      }
      if (request.action === 'get') return Response.json({ action: 'get', run });
      if (request.action === 'preview') {
        return Response.json({
          action: 'preview',
          undoId: run.undo.token,
          mutationId: run.execution.mutationId,
          canApply: true,
          idempotentReplay: false,
          expectedSnapshotRevision: run.revision,
          observedSnapshotRevision: run.revision,
          conflicts: [],
          receipt: null,
        });
      }
      return Response.json({
        action: 'apply',
        undoId: run.undo.token,
        mutationId: run.execution.mutationId,
        canApply: true,
        idempotentReplay: false,
        expectedSnapshotRevision: run.revision,
        observedSnapshotRevision: run.revision,
        conflicts: [],
        receipt: { status: 'applied' },
      });
    }) as typeof fetch;

    render(<DatabaseAgentRunsDialog open={true} onOpenChange={() => {}} />);
    expect(await screen.findByTestId('database-agent-run-undo')).not.toBeNull();
    fireEvent.click(screen.getByTestId('database-agent-run-undo'));
    await waitFor(() =>
      expect(actions).toEqual(['list', 'get', 'preview', 'apply', 'list', 'get']),
    );
    expect(screen.getAllByText('Update the incident status').length).toBeGreaterThan(0);
  });

  test('retries a failed run as a new exact-plan attempt', async () => {
    const failed = failedDetail();
    const recovered: DatabaseAgentRun = {
      ...detail(),
      id: 'run_dom_retry',
      state: 'succeeded',
      revision: `sha256:${'5'.repeat(64)}`,
      updatedAt: '2026-07-20T00:03:00.000Z',
      recovery: {
        attempt: 2,
        action: 'retry',
        sourceRunId: failed.id,
        idempotencyKeyHash: `sha256:${'6'.repeat(64)}`,
      },
    };
    let currentRuns = [failed];
    const actions: string[] = [];
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { action: string };
      actions.push(request.action);
      if (request.action === 'list') {
        return Response.json({
          action: 'list',
          revision: failed.revision,
          runs: currentRuns.map(summaryFor),
        });
      }
      if (request.action === 'get') {
        const runId = (request as { action: string; runId: string }).runId;
        const run = currentRuns.find((candidate) => candidate.id === runId) ?? failed;
        return Response.json({ action: 'get', run });
      }
      expect(request).toMatchObject({
        action: 'retry',
        runId: failed.id,
        expectedRevision: failed.revision,
        approvalToken: `approve:${failed.plan.hash}`,
      });
      currentRuns = [recovered, failed];
      return Response.json({
        action: 'retry',
        sourceRunId: failed.id,
        run: recovered,
        receipt: {
          mutationId: 'mut_dom_retry',
          planHash: failed.plan.hash,
          idempotentReplay: false,
          verification: { status: 'passed', checks: [] },
        },
      });
    }) as typeof fetch;

    render(<DatabaseAgentRunsDialog open={true} onOpenChange={() => {}} />);
    expect(await screen.findByTestId('database-agent-run-retry')).not.toBeNull();
    fireEvent.click(screen.getByTestId('database-agent-run-retry'));
    await waitFor(() => expect(actions).toEqual(['list', 'get', 'retry', 'list', 'get']));
    expect(screen.getAllByText('Update the incident status').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('database-agent-run-retry')).toBeNull();
    expect(screen.getByText(/succeeded ·/)).not.toBeNull();
    expect(screen.getByTestId('database-agent-run-recovery-receipt').textContent).toContain(
      'Attempt 2',
    );
    expect(screen.getByTestId('database-agent-run-recovery-receipt').textContent).toContain(
      'mut_dom',
    );
  });
});
