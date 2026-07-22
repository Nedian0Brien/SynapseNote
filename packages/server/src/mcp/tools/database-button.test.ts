import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import { register } from './database-button.ts';
import type { ServerInstance } from './shared.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function capture() {
  let handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>> =
    async () => ({});
  let config: Record<string, unknown> = {};
  const server = {
    registerTool(_name: string, nextConfig: Record<string, unknown>, nextHandler: typeof handler) {
      config = nextConfig;
      handler = nextHandler;
    },
  } as unknown as ServerInstance;
  register(server, {
    resolveCwd: async () => '/project',
    config: {} as Config,
    serverUrl: 'http://localhost:7777',
  });
  return { handler, config };
}

describe('data_button MCP tool', () => {
  test('supports reviewed execution and forwards the exact observed record revision for planning', async () => {
    const requests: unknown[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        plan: {
          id: 'buttonplan_1',
          internalPlan: { id: 'plan_1', committable: true },
          externalSteps: [],
        },
      });
    }) as unknown as typeof fetch;
    const { config, handler } = capture();
    expect(config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    const result = await handler({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      recordId: 'rec_one',
      propertyId: 'prop_finish',
      expectedRecordRevision: `sha256:${'a'.repeat(64)}`,
    });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('internal-only exact plan') }),
    ]);
    expect(requests).toEqual([
      {
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_one',
        propertyId: 'prop_finish',
        expectedRecordRevision: `sha256:${'a'.repeat(64)}`,
      },
    ]);
  });

  test('keeps an external Button as one reviewed composite plan', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        plan: {
          id: 'buttonplan_external',
          internalPlan: { id: 'plan_internal', committable: true },
          externalSteps: [{ actionId: 'notify' }],
        },
      }),
    ) as unknown as typeof fetch;
    const result = await capture().handler({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      recordId: 'rec_one',
      propertyId: 'prop_finish',
      expectedRecordRevision: `sha256:${'a'.repeat(64)}`,
    });
    expect(result.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining('Execute only the composite plan'),
      }),
    ]);
  });

  test('forwards a database-level stable Button without record-shaped placeholders', async () => {
    const requests: unknown[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        plan: {
          id: 'buttonplan_database',
          internalPlan: { id: 'plan_database', committable: true },
          externalSteps: [],
        },
      });
    }) as unknown as typeof fetch;
    await capture().handler({ databaseId: 'db_tasks', buttonId: 'dbbtn_pair' });
    expect(requests).toEqual([{ databaseId: 'db_tasks', buttonId: 'dbbtn_pair' }]);
  });

  test('executes an exact approved composite plan and lists durable runs', async () => {
    const requests: unknown[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      requests.push(request);
      return request.action === 'execute'
        ? Response.json({
            action: 'execute',
            run: { id: 'buttonrun_one', state: 'succeeded' },
            undoToken: 'undo_one.token',
          })
        : Response.json({
            action: 'list_runs',
            runs: [{ id: 'buttonrun_one', state: 'succeeded' }],
          });
    }) as unknown as typeof fetch;
    const tool = capture();
    const executed = await tool.handler({
      action: 'execute',
      buttonPlanId: 'buttonplan_one',
      buttonPlanHash: `sha256:${'a'.repeat(64)}`,
      idempotencyKey: 'agent-button-one',
      principalId: 'agent:codex',
    });
    expect(executed.content[0]?.text).toContain('one composite internal/external receipt');
    const listed = await tool.handler({ action: 'list_runs', limit: 10 });
    expect(listed.content[0]?.text).toContain('1 durable Button run');
    expect(requests).toEqual([
      {
        action: 'execute',
        buttonPlanId: 'buttonplan_one',
        buttonPlanHash: `sha256:${'a'.repeat(64)}`,
        idempotencyKey: 'agent-button-one',
        approvalToken: `approve:sha256:${'a'.repeat(64)}`,
        actor: { principalId: 'agent:codex', kind: 'agent' },
      },
      { action: 'list_runs', limit: 10 },
    ]);
  });
});
