import { afterEach, describe, expect, test } from 'bun:test';
import type { DatabaseAgentRun } from '@nedian0brien/synapsenote-core';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DatabaseAgentRunDetail,
  type DatabaseAgentRunSummary,
  fetchDatabaseAgentRun,
  fetchDatabaseAgentRuns,
} from './DatabaseAgentRunsDialog';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function run(): DatabaseAgentRun {
  return {
    version: 1,
    id: 'run_test',
    state: 'succeeded',
    revision: `sha256:${'1'.repeat(64)}`,
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:01:00.000Z',
    actor: { principalId: 'agent:test', kind: 'agent', sessionId: 'session-1' },
    intent: { summary: 'Update one task', rawPromptStored: false },
    scope: {
      databaseIds: ['db_tasks'],
      sourceIds: ['ds_tasks'],
      propertyIds: ['prop_status'],
      viewIds: [],
      recordIds: ['rec_first'],
    },
    plan: {
      id: 'plan_test',
      hash: `sha256:${'2'.repeat(64)}`,
      snapshotRevision: `sha256:${'3'.repeat(64)}`,
      expiresAt: '2026-07-20T01:00:00.000Z',
      risk: { level: 'low', reasons: ['Updates one record'] },
      approvals: [{ code: 'sample_record_write', required: true, reason: 'Review record' }],
    },
    proposedDiff: {
      complete: true,
      omittedReason: null,
      originalBytes: 100,
      value: { records: [{ recordId: 'rec_first', after: { status: 'done' } }] },
    },
    execution: {
      startedAt: '2026-07-20T00:00:30.000Z',
      finishedAt: '2026-07-20T00:01:00.000Z',
      mutationId: 'mut_test',
      actualDiff: [{ operation: 'update', path: 'tasks/first.md' }],
    },
    verification: {
      status: 'passed',
      checks: [{ code: 'required_values', status: 'passed', message: 'Required values pass' }],
    },
    failure: null,
    undo: { available: true, token: 'undo_test.secret' },
  };
}

describe('DatabaseAgentRunsDialog', () => {
  test('renders intent, scope, proposed diff, execution, verification, and undo', () => {
    const html = renderToStaticMarkup(<DatabaseAgentRunDetail run={run()} />);
    expect(html).toContain('Update one task');
    expect(html).toContain('prop_status');
    expect(html).toContain('rec_first');
    expect(html).toContain('mut_test');
    expect(html).toContain('passed');
    expect(html).toContain('undo_test.secret');
    expect(html).toContain('Raw prompts are not stored');
  });

  test('fetches compact history and exact detail through the runs endpoint', async () => {
    const detail = run();
    const summary: DatabaseAgentRunSummary = {
      id: detail.id,
      state: detail.state,
      revision: detail.revision,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
      intent: detail.intent,
      scope: {
        databaseIds: detail.scope.databaseIds,
        sourceCount: detail.scope.sourceIds.length,
        propertyCount: detail.scope.propertyIds.length,
        viewCount: detail.scope.viewIds.length,
        recordCount: detail.scope.recordIds.length,
      },
      plan: { id: detail.plan.id, riskLevel: detail.plan.risk.level },
      execution: { mutationId: detail.execution.mutationId, actualDiffCount: 1 },
      verification: { status: 'passed', checkCount: 1, failedCheckCount: 0 },
      failureCode: null,
      undo: { available: true },
    };
    const bodies: unknown[] = [];
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action: string };
      bodies.push(body);
      return Response.json(
        body.action === 'list'
          ? { action: 'list', runs: [summary], revision: detail.revision }
          : { action: 'get', run: detail },
      );
    }) as typeof fetch;
    await expect(fetchDatabaseAgentRuns()).resolves.toEqual([summary]);
    await expect(fetchDatabaseAgentRun(detail.id)).resolves.toEqual(detail);
    expect(bodies).toEqual([{ action: 'list' }, { action: 'get', runId: detail.id }]);
  });

  test('rejects a mismatched detail response', async () => {
    globalThis.fetch = (async () => Response.json({ action: 'get', run: run() })) as typeof fetch;
    await expect(fetchDatabaseAgentRun('run_other')).rejects.toThrow(/does not match/);
  });
});
