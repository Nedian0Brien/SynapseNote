import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import { register } from './database-run.ts';
import type { ServerInstance } from './shared.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function capture(identityRef?: { current: AgentIdentity }) {
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
    ...(identityRef ? { identityRef } : {}),
  });
  return { handler, config };
}

describe('data_run MCP tool', () => {
  test('describes independent, idempotent Agent Run recovery', () => {
    const { config } = capture();
    expect(String(config.description)).toContain('independent attempt');
    expect(String(config.description)).toContain('idempotencyKey');
    expect(config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  test('lists compact runs through the public HTTP contract', async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        action: 'list',
        runs: [{ id: 'run_failed', state: 'failed' }],
        revision: 'sha256:empty',
      });
    }) as unknown as typeof fetch;
    const { handler } = capture();
    const result = await handler({ action: 'list' });
    expect(requestBody).toEqual({ action: 'list' });
    expect(result.structuredContent).toMatchObject({
      cwd: '/project',
      action: 'list',
      runs: [{ id: 'run_failed', state: 'failed' }],
    });
  });

  test('forwards an exact revision-bound retry and returns its receipt', async () => {
    const planHash = `sha256:${'a'.repeat(64)}`;
    const revision = `sha256:${'b'.repeat(64)}`;
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        action: 'retry',
        sourceRunId: 'run_failed',
        run: {
          id: 'run_retry',
          state: 'succeeded',
          recovery: { attempt: 2, action: 'retry', sourceRunId: 'run_failed' },
        },
        receipt: {
          planHash,
          idempotentReplay: false,
          verification: { status: 'passed' },
        },
      });
    }) as unknown as typeof fetch;
    const identityRef = {
      current: {
        connectionId: '11111111-1111-4111-8111-111111111111',
        displayName: 'Codex',
        colorSeed: 'codex',
      },
    };
    const { handler } = capture(identityRef);
    const result = await handler({
      action: 'retry',
      runId: 'run_failed',
      expectedRevision: revision,
      idempotencyKey: 'mcp-agent-run-retry-0001',
      approvalToken: `approve:${planHash}`,
    });
    expect(requestBody).toEqual({
      action: 'retry',
      runId: 'run_failed',
      expectedRevision: revision,
      idempotencyKey: 'mcp-agent-run-retry-0001',
      approvalToken: `approve:${planHash}`,
    });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('independent attempt') }),
    ]);
    expect(result.structuredContent).toMatchObject({
      cwd: '/project',
      sourceRunId: 'run_failed',
      run: { id: 'run_retry', recovery: { action: 'retry', attempt: 2 } },
      receipt: { planHash, idempotentReplay: false },
    });
  });

  test('fails closed when recovery has no approval or autonomy capability', async () => {
    const { handler } = capture();
    const result = await handler({
      action: 'resume',
      runId: 'run_failed',
      expectedRevision: `sha256:${'b'.repeat(64)}`,
      idempotencyKey: 'mcp-agent-run-resume-0001',
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      problem: { code: 'approval_required' },
    });
  });
});
