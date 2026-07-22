import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import { register } from './database-automation.ts';
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

describe('data_automation MCP tool', () => {
  test('forwards a stable dry-run event and returns only the reviewed summary', async () => {
    let request: unknown;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      request = JSON.parse(String(init?.body));
      return Response.json({
        action: 'dry_run',
        plan: {
          automationId: 'auto_triage',
          automationVersion: 2,
          internalPlan: { id: 'plan_one', committable: true, records: { creates: 1, updates: 0 } },
          notifications: [],
          external: [{ actionId: 'publish', connectionId: 'conn_tasks', egressBytes: 120 }],
        },
      });
    }) as unknown as typeof fetch;
    const { config, handler } = capture();
    expect(config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
    const event = {
      deduplicationKey: 'dry-run-one',
      databaseId: 'db_tasks',
      kind: 'record_added',
      sourceId: 'ds_tasks',
      recordId: 'rec_one',
      recordRevision: `sha256:${'a'.repeat(64)}`,
    };
    const result = await handler({
      action: 'dry_run',
      databaseId: 'db_tasks',
      automationId: 'auto_triage',
      event,
    });
    expect(request).toEqual({
      action: 'dry_run',
      databaseId: 'db_tasks',
      automationId: 'auto_triage',
      event,
    });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('non-executed plan summary') }),
    ]);
  });

  test('marks a durable automation notification as read without record context', async () => {
    let request: unknown;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      request = JSON.parse(String(init?.body));
      return Response.json({
        action: 'mark_notification_read',
        notificationId: 'autonote_one',
      });
    }) as unknown as typeof fetch;

    const result = await capture().handler({
      action: 'mark_notification_read',
      notificationId: 'autonote_one',
    });
    expect(request).toEqual({
      action: 'mark_notification_read',
      notificationId: 'autonote_one',
    });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('Marked notification') }),
    ]);
  });
});
