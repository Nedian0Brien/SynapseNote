import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import { register } from './database-markdown-table.ts';
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

describe('data_markdown_table MCP tool', () => {
  test('documents revision-bound v2 mutation and forwards a receipt', async () => {
    const revision = `sha256:${'a'.repeat(64)}`;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ operation: 'update_cell' });
      return Response.json({
        operation: 'update_cell',
        changed: true,
        receipt: { version: 1, mutationId: 'mut_1', afterOwnerRevision: revision },
      });
    }) as unknown as typeof fetch;
    const { handler, config } = capture();
    expect(String(config.description)).toContain('exact owner, row, and cell revisions');
    expect(config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
    const result = await handler({
      operation: 'update_cell',
      input: {
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_task',
        propertyId: 'prop_status',
        value: 'done',
        expectedOwnerRevision: revision,
      },
    });
    expect(result).toMatchObject({
      structuredContent: {
        operation: 'update_cell',
        changed: true,
        receipt: { mutationId: 'mut_1' },
      },
    });
  });

  test('rejects malformed input before making an HTTP request', async () => {
    const fetchMock = mock(async () => Response.json({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { handler } = capture();
    const result = await handler({ operation: 'update_cell', input: { databaseId: 'db_tasks' } });
    expect(result).toMatchObject({ isError: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
