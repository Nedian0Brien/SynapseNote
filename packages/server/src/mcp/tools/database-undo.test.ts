import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import { register } from './database-undo.ts';
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

describe('data_undo MCP tool', () => {
  test('is idempotent, destructive, and explicitly approval-gated', () => {
    const { config } = capture();
    expect(String(config.description)).toContain('apply requires user approval');
    expect(config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  test('previews before forwarding an attributed apply request', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return Response.json({
        action: body.action,
        undoId: 'undo_1',
        mutationId: 'mut_1',
        canApply: true,
        idempotentReplay: false,
        expectedSnapshotRevision: 'sha256:empty',
        observedSnapshotRevision: 'sha256:empty',
        conflicts: [],
        receipt: body.action === 'apply' ? { version: 1, status: 'applied' } : null,
      });
    }) as unknown as typeof fetch;
    const { handler } = capture();
    const preview = await handler({ action: 'preview', undoToken: 'undo_1.secret' });
    expect(preview.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('can be applied safely') }),
    ]);
    const applied = await handler({
      action: 'apply',
      undoToken: 'undo_1.secret',
      idempotencyKey: 'mcp-undo-request-0001',
      actor: { principalId: 'agent:codex', kind: 'agent' },
    });
    expect(applied.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('applied and verified') }),
    ]);
    expect(bodies).toEqual([
      { action: 'preview', undoToken: 'undo_1.secret' },
      {
        action: 'apply',
        undoToken: 'undo_1.secret',
        idempotencyKey: 'mcp-undo-request-0001',
        actor: { principalId: 'agent:codex', kind: 'agent' },
      },
    ]);
  });

  test('rejects apply without idempotency and actor before HTTP', async () => {
    const fetchMock = mock(async () => Response.json({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { handler } = capture();
    const result = await handler({ action: 'apply', undoToken: 'undo_1.secret' });
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
