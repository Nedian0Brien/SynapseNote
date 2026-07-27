import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import { register } from './database-repair.ts';
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

describe('data_repair MCP tool', () => {
  test('teaches preview-first approval and exact idempotent apply', () => {
    const { config } = capture();
    expect(String(config.description)).toContain('Always call action=preview first');
    expect(String(config.description)).toContain('apply requires user approval');
    expect(config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  test('forwards preview and exact approved apply without expanding the plan', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return Response.json(
        body.action === 'preview'
          ? {
              action: 'preview',
              plan: {
                id: 'repair_plan_1',
                hash: `sha256:${'a'.repeat(64)}`,
                committable: true,
                summary: { blocked: 0 },
              },
            }
          : body.action === 'apply'
            ? {
                action: 'apply',
                result: {
                  idempotentReplay: false,
                  receipt: { repairId: 'repair_1', undoToken: 'repair_undo_1' },
                },
              }
            : {
                action: 'undo',
                result: {
                  idempotentReplay: false,
                  receipt: { undoId: 'repair_undo_result_1', repairId: 'repair_1' },
                },
              },
      );
    }) as unknown as typeof fetch;
    const { handler } = capture();

    const preview = await handler({ action: 'preview', ttlSeconds: 300 });
    expect(preview.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('is committable') }),
    ]);
    const applied = await handler({
      action: 'apply',
      planId: 'repair_plan_1',
      planHash: `sha256:${'a'.repeat(64)}`,
      approvalToken: `approve:sha256:${'a'.repeat(64)}`,
      idempotencyKey: 'repair-mcp-request-0001',
      principalId: 'agent:codex',
    });
    expect(applied.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('applied, rebuilt, and verified') }),
    ]);
    const undone = await handler({
      action: 'undo',
      repairId: 'repair_1',
      planHash: `sha256:${'a'.repeat(64)}`,
      undoToken: 'repair_undo_1',
      idempotencyKey: 'repair-mcp-undo-0001',
      principalId: 'agent:codex',
    });
    expect(undone.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining('restored the exact pre-repair bytes'),
      }),
    ]);
    expect(bodies).toEqual([
      { action: 'preview', ttlSeconds: 300 },
      {
        action: 'apply',
        planId: 'repair_plan_1',
        planHash: `sha256:${'a'.repeat(64)}`,
        approvalToken: `approve:sha256:${'a'.repeat(64)}`,
        idempotencyKey: 'repair-mcp-request-0001',
        principalId: 'agent:codex',
      },
      {
        action: 'undo',
        repairId: 'repair_1',
        planHash: `sha256:${'a'.repeat(64)}`,
        undoToken: 'repair_undo_1',
        idempotencyKey: 'repair-mcp-undo-0001',
        principalId: 'agent:codex',
      },
    ]);
  });

  test('rejects incomplete apply before HTTP and preserves typed recovery', async () => {
    const fetchMock = mock(async () => Response.json({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { handler } = capture();
    const result = await handler({ action: 'apply', planId: 'repair_plan_1' });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        action: 'apply',
        problem: { code: 'invalid_request', recovery: { action: 'fix_request' } },
      },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
