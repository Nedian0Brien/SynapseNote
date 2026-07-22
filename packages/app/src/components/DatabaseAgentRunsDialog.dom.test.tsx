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
});
