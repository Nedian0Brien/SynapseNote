import { afterEach, describe, expect, test } from 'bun:test';
import type {
  DatabaseDiagnosticsResult,
  DatabaseRepairPlan,
} from '@nedian0brien/synapsenote-server';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applyDatabaseRepair,
  createDatabaseDiagnosticsExport,
  DatabaseDiagnosticsBody,
  fetchDatabaseDiagnostics,
  previewDatabaseRepair,
} from './DatabaseDiagnosticsDialog';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function diagnostics(): DatabaseDiagnosticsResult {
  return {
    index: {
      state: 'idle',
      revision: `sha256:${'a'.repeat(64)}`,
      manifestRevision: `sha256:${'b'.repeat(64)}`,
      recordCount: 12,
      issueCount: 1,
      progress: null,
      lastRebuiltAt: '2026-07-19T12:00:00.000Z',
      lastIncrementalAt: null,
      lastError: null,
    },
    issues: {
      total: 1,
      byCode: { invalid_record: 1 },
      sample: [{ code: 'invalid_record', path: 'tasks/broken.md', recordId: 'rec_broken' }],
    },
    schemas: [
      {
        databaseId: 'db_tasks',
        key: 'tasks',
        name: 'Tasks',
        schemaRevision: `sha256:${'c'.repeat(64)}`,
      },
    ],
    tasks: [
      {
        id: 'task_import_1',
        operation: 'import',
        state: 'succeeded',
        createdAt: '2026-07-19T11:00:00.000Z',
        finishedAt: '2026-07-19T11:05:00.000Z',
      },
    ],
    telemetry: {
      commitCount: 4,
      commitSuccessCount: 3,
      commitConflictCount: 1,
      commitRollbackCount: 0,
      commitFailureCount: 0,
      commitLatencyMsSum: 120,
      commitLatencyMsCount: 4,
      commitLatencyMsMax: 60,
      indexRebuildCount: 2,
      indexRebuildFailureCount: 0,
      indexRebuildDurationMsSum: 200,
      indexRebuildDurationMsCount: 2,
      indexRebuildDurationMsMax: 150,
      contextPackCaptureCount: 5,
      contextPackTokensEstimatedSum: 1_000,
      contextPackTruncatedCount: 1,
      automationRunFailureCount: 2,
      taskRollbackAppliedCount: 0,
    },
  };
}

function repairPlan(): DatabaseRepairPlan {
  return {
    version: 1,
    id: 'repair_plan_abc',
    hash: `sha256:${'d'.repeat(64)}`,
    createdAt: '2026-07-19T12:00:00.000Z',
    expiresAt: '2026-07-19T12:10:00.000Z',
    snapshot: {
      manifestRevision: `sha256:${'b'.repeat(64)}`,
      indexRevision: `sha256:${'a'.repeat(64)}`,
    },
    committable: true,
    actions: [],
    blockers: [],
    summary: {
      staleIdentities: 0,
      invalidValues: 1,
      missingRecords: 0,
      orphanedIndexEntries: 0,
      recordRewrites: 1,
      uniqueIdAllocations: 0,
      blocked: 0,
    },
  };
}

describe('DatabaseDiagnosticsDialog', () => {
  test('builds a content-free export without record paths or body/title text', () => {
    const exported = createDatabaseDiagnosticsExport(
      diagnostics(),
      new Date('2026-07-19T12:30:00.000Z'),
    );
    expect(exported).toMatchObject({
      schemaVersion: 1,
      exportedAt: '2026-07-19T12:30:00.000Z',
      scope: 'database-diagnostics',
      issues: { sample: [{ code: 'invalid_record', recordId: 'rec_broken' }] },
    });
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain('tasks/broken.md');
    expect(serialized).not.toContain('rec_broken_title');
  });

  test('renders index state, issues, schema revisions, tasks, and telemetry', () => {
    const html = renderToStaticMarkup(
      <DatabaseDiagnosticsBody
        data={diagnostics()}
        status="success"
        error={null}
        onRetry={() => {}}
        repairPlan={null}
        repairStatus="idle"
        repairError={null}
        onPreviewRepair={() => {}}
        onApplyRepair={() => {}}
      />,
    );

    expect(html).toContain('idle');
    expect(html).toContain('invalid_record');
    expect(html).toContain('tasks/broken.md');
    expect(html).toContain('Tasks');
    expect(html).toContain('task_import_1');
    expect(html).toContain('Preview repair');
    expect(html).toContain('Export diagnostics');
    // Content-free contract: never a record title or body text.
    expect(html).not.toContain('rec_broken_title');
  });

  test('renders repair plan summary once previewed and gates apply on committable', () => {
    const html = renderToStaticMarkup(
      <DatabaseDiagnosticsBody
        data={diagnostics()}
        status="success"
        error={null}
        onRetry={() => {}}
        repairPlan={repairPlan()}
        repairStatus="idle"
        repairError={null}
        onPreviewRepair={() => {}}
        onApplyRepair={() => {}}
      />,
    );

    expect(html).toContain('Apply repair');
    const applyButtonTag = html.match(
      /<button\b[^>]*>(?=(?:(?!<button\b)[\s\S])*Apply repair)/,
    )?.[0];
    expect(applyButtonTag).toBeDefined();
    expect(applyButtonTag).not.toContain('disabled=""');
  });

  test('disables apply repair when the plan is not committable', () => {
    const blockedPlan: DatabaseRepairPlan = { ...repairPlan(), committable: false };
    const html = renderToStaticMarkup(
      <DatabaseDiagnosticsBody
        data={diagnostics()}
        status="success"
        error={null}
        onRetry={() => {}}
        repairPlan={blockedPlan}
        repairStatus="idle"
        repairError={null}
        onPreviewRepair={() => {}}
        onApplyRepair={() => {}}
      />,
    );

    const applyButtonTag = html.match(
      /<button\b[^>]*>(?=(?:(?!<button\b)[\s\S])*Apply repair)/,
    )?.[0];
    expect(applyButtonTag).toBeDefined();
    expect(applyButtonTag).toContain('disabled=""');
  });

  test('surfaces a repair error message instead of silently failing', () => {
    const html = renderToStaticMarkup(
      <DatabaseDiagnosticsBody
        data={diagnostics()}
        status="success"
        error={null}
        onRetry={() => {}}
        repairPlan={repairPlan()}
        repairStatus="error"
        repairError="Rollback refused because imported files changed after the task"
        onPreviewRepair={() => {}}
        onApplyRepair={() => {}}
      />,
    );

    expect(html).toContain('Rollback refused because imported files changed after the task');
  });

  test('confirms a completed repair and clears the stale plan summary', () => {
    const html = renderToStaticMarkup(
      <DatabaseDiagnosticsBody
        data={diagnostics()}
        status="success"
        error={null}
        onRetry={() => {}}
        repairPlan={null}
        repairStatus="applied"
        repairError={null}
        onPreviewRepair={() => {}}
        onApplyRepair={() => {}}
      />,
    );

    expect(html).toContain('Repair applied');
    // The stale plan summary must not linger once applied and cleared.
    expect(html).not.toContain('Stale identities');
  });

  test('fetches diagnostics from the content-free endpoint', async () => {
    const requests: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return Response.json(diagnostics());
    }) as typeof fetch;

    await expect(fetchDatabaseDiagnostics()).resolves.toEqual(diagnostics());
    expect(requests).toEqual(['/api/databases/diagnostics']);
  });

  test('rejects a malformed diagnostics response instead of displaying it', async () => {
    globalThis.fetch = (async () => Response.json({ nope: true })) as typeof fetch;
    await expect(fetchDatabaseDiagnostics()).rejects.toThrow(/Invalid database diagnostics/);
  });

  test('previews a repair plan through the existing repair endpoint', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return Response.json({ action: 'preview', plan: repairPlan() });
    }) as typeof fetch;

    await expect(previewDatabaseRepair()).resolves.toEqual(repairPlan());
    expect(requests).toEqual([{ url: '/api/databases/repair', body: { action: 'preview' } }]);
  });

  test('applies a repair plan with an approval token bound to the exact plan hash', async () => {
    const plan = repairPlan();
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : {},
      });
      return Response.json({
        action: 'apply',
        result: {
          idempotentReplay: false,
          receipt: {
            version: 1,
            repairId: 'repair_1',
            planId: plan.id,
            planHash: plan.hash,
            principalId: 'user:local',
            appliedAt: '2026-07-19T12:05:00.000Z',
            before: { manifestRevision: 'a', indexRevision: 'b' },
            after: { manifestRevision: 'c', indexRevision: 'd' },
            rewrittenPaths: [],
            rebuiltIndex: false,
            rewrittenDatabaseIds: [],
          },
        },
      });
    }) as typeof fetch;

    const result = await applyDatabaseRepair(plan);
    expect(result.receipt.planId).toBe(plan.id);
    expect(requests[0]?.body).toMatchObject({
      action: 'apply',
      planId: plan.id,
      planHash: plan.hash,
      approvalToken: `approve:${plan.hash}`,
      principalId: 'user:local',
    });
    expect(requests[0]?.body.idempotencyKey).toMatch(/^ui-repair-/);
  });
});
