import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import { register } from './database-commit.ts';
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

describe('data_commit MCP tool', () => {
  test('is mutating, idempotent, and explicitly approval-gated', () => {
    const { config } = capture();
    expect(String(config.description)).toContain('requires user approval');
    expect(String(config.description)).toContain('approvalToken');
    expect(config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  test('forwards the exact approved commit contract and returns a machine-readable receipt', async () => {
    const planHash = `sha256:${'a'.repeat(64)}`;
    const snapshotRevision = `sha256:${'b'.repeat(64)}`;
    let requestBody: Record<string, unknown> | undefined;
    let requestHeaders: Headers | undefined;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestHeaders = new Headers(init?.headers);
      return Response.json({
        mutationId: 'mut_1',
        planId: 'plan_1',
        planHash,
        idempotentReplay: false,
        actualDiff: [{ operation: 'create', path: '.ok/databases/tasks.yml' }],
        verification: { status: 'passed', checks: [] },
        revisions: { gitHead: `sha1:${'c'.repeat(40)}`, snapshotRevision },
        auditReceipt: { version: 1, mutationId: 'mut_1' },
        undoToken: 'undo_1.secret',
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
      planId: 'plan_1',
      planHash,
      expectedSnapshotRevision: snapshotRevision,
      idempotencyKey: 'mcp-commit-request-0001',
      approvalToken: `approve:${planHash}`,
      actor: { principalId: 'agent:codex', kind: 'agent', sessionId: 'session-1' },
      assertions: { databaseAbsent: true, createdRecords: 1 },
    });
    expect(requestBody).toEqual({
      planId: 'plan_1',
      planHash,
      expectedSnapshotRevision: snapshotRevision,
      idempotencyKey: 'mcp-commit-request-0001',
      approvalToken: `approve:${planHash}`,
      actor: { principalId: 'agent:codex', kind: 'agent', sessionId: 'session-1' },
      assertions: { databaseAbsent: true, createdRecords: 1 },
    });
    expect(requestHeaders?.get('x-synapsenote-agent-id')).toBe(
      identityRef.current.connectionId,
    );
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('completed') }),
    ]);
    expect(result.structuredContent).toMatchObject({
      cwd: '/project',
      mutationId: 'mut_1',
      verification: { status: 'passed' },
      undoToken: 'undo_1.secret',
    });
  });

  test('surfaces typed commit refusal codes without claiming success', async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        {
          type: 'urn:ok:error:stale-target',
          title: 'Database snapshot changed after planning',
          status: 409,
          instance: 'urn:uuid:00000000-0000-4000-8000-000000000000',
          code: 'snapshot_changed',
        },
        { status: 409 },
      ),
    ) as unknown as typeof fetch;
    const { handler } = capture();
    const result = await handler({
      planId: 'plan_1',
      planHash: `sha256:${'a'.repeat(64)}`,
      expectedSnapshotRevision: `sha256:${'b'.repeat(64)}`,
      idempotencyKey: 'mcp-commit-request-0001',
      approvalToken: `approve:sha256:${'a'.repeat(64)}`,
      actor: { principalId: 'agent:codex', kind: 'agent' },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('snapshot_changed') }),
    ]);
    expect(result.structuredContent).toMatchObject({
      problem: {
        code: 'snapshot_changed',
        retryable: false,
        recovery: { action: 'recreate_plan', endpoint: '/api/databases/plan' },
      },
    });
  });
});
