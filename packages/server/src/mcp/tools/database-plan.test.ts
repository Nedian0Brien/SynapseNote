import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import { register } from './database-plan.ts';
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

describe('data_plan MCP tool', () => {
  test('is explicitly ephemeral and non-destructive', () => {
    const { config } = capture();
    expect(String(config.description)).toContain('without writing project files');
    expect(config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
  });

  test('creates drafts and forwards snapshot-bound plan requests', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return Response.json(
        body.action === 'create_draft'
          ? { action: 'create_draft', draft: { id: 'draft_1', revision: 'sha256:draft' } }
          : {
              action: 'create_plan',
              plan: {
                id: 'plan_1',
                hash: 'sha256:plan',
                snapshotRevision: 'sha256:snapshot',
                committable: true,
                conflicts: [],
              },
            },
      );
    }) as unknown as typeof fetch;
    const { handler } = capture();
    const drafted = await handler({
      action: 'create_draft',
      desiredState: { database: { key: 'tasks' }, sources: [] },
      ttlSeconds: 600,
    });
    expect(drafted.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('without writing project files') }),
    ]);
    const planned = await handler({ action: 'create_plan', draftId: 'draft_1', ttlSeconds: 300 });
    expect(planned.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('committable') }),
    ]);
    expect(bodies).toEqual([
      {
        action: 'create_draft',
        desiredState: { database: { key: 'tasks' }, sources: [] },
        ttlSeconds: 600,
      },
      { action: 'create_plan', draftId: 'draft_1', ttlSeconds: 300 },
    ]);
  });

  test('creates a revision-bound complete database deletion draft', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        action: 'create_database_deletion_draft',
        draft: { id: 'draft_delete', revision: 'sha256:draft' },
      });
    }) as unknown as typeof fetch;
    const { handler } = capture();
    const expectedSnapshotRevision = `sha256:${'a'.repeat(64)}`;
    const result = await handler({
      action: 'create_database_deletion_draft',
      databaseId: 'db_tasks',
      expectedSnapshotRevision,
      ttlSeconds: 600,
    });
    expect(body).toEqual({
      action: 'create_database_deletion_draft',
      databaseId: 'db_tasks',
      expectedSnapshotRevision,
      ttlSeconds: 600,
    });
    expect(result).toMatchObject({
      structuredContent: {
        action: 'create_database_deletion_draft',
        draft: { id: 'draft_delete' },
      },
    });
  });

  test('creates an attributed Verification lifecycle draft without accepting a verifier field', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        action: 'create_verification_draft',
        draft: { id: 'draft_verification', revision: 'sha256:draft' },
        review: {
          action: 'verify',
          recordId: 'rec_one',
          propertyId: 'prop_verification',
          actor: { kind: 'agent', principal_id: 'agent:reviewer' },
        },
      });
    }) as unknown as typeof fetch;
    const { handler } = capture();
    const lifecycle = {
      action: 'verify',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      recordId: 'rec_one',
      propertyId: 'prop_verification',
      expectedRevision: `sha256:${'a'.repeat(64)}`,
      evidenceRevision: `sha256:${'b'.repeat(64)}`,
    };
    const result = await handler({
      action: 'create_verification_draft',
      lifecycle,
      principalId: 'agent:reviewer',
    });
    expect(body).toEqual({
      action: 'create_verification_draft',
      lifecycle,
      actor: { principalId: 'agent:reviewer', kind: 'agent' },
    });
    expect(result).toMatchObject({
      structuredContent: {
        action: 'create_verification_draft',
        review: { actor: { kind: 'agent', principal_id: 'agent:reviewer' } },
      },
    });
  });

  test('rejects missing action identifiers before HTTP', async () => {
    const fetchMock = mock(async () => Response.json({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { handler } = capture();
    const missingDraft = await handler({ action: 'create_plan' });
    const missingPlan = await handler({ action: 'get_plan' });
    const missingDeletion = await handler({ action: 'create_database_deletion_draft' });
    const missingConversion = await handler({ action: 'preview_property_conversion' });
    expect(missingDraft).toMatchObject({
      isError: true,
      structuredContent: {
        action: 'create_plan',
        problem: { code: 'invalid_request', recovery: { action: 'fix_request' } },
      },
    });
    expect(missingPlan).toMatchObject({
      isError: true,
      structuredContent: {
        action: 'get_plan',
        problem: { code: 'invalid_request', recovery: { action: 'fix_request' } },
      },
    });
    expect(missingConversion).toMatchObject({ isError: true });
    expect(missingDeletion).toMatchObject({ isError: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('previews property conversion with explicit lossy consent semantics', async () => {
    const bodies: unknown[] = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      bodies.push({ url, body: JSON.parse(String(init?.body)) });
      return Response.json({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        propertyId: 'prop_code',
        manifestRevision: `sha256:${'a'.repeat(64)}`,
        indexRevision: `sha256:${'b'.repeat(64)}`,
        preview: {
          rule: { from: 'place', to: 'text', kind: 'lossy', reason: 'flattens semantics' },
          committable: false,
          requiresLossyApproval: true,
          summary: { total: 1, empty: 0, converted: 0, lossy: 1, blocked: 0 },
          changes: [],
          rollbackValues: {},
        },
        draft: null,
        plan: null,
      });
    }) as unknown as typeof fetch;
    const result = await capture().handler({
      action: 'preview_property_conversion',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      propertyId: 'prop_code',
      targetProperty: { id: 'prop_code', key: 'code', name: 'Code', type: 'text' },
    });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('allowLossy=true') }),
    ]);
    expect(bodies).toEqual([
      {
        url: 'http://localhost:7777/api/databases/property-conversion',
        body: {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          propertyId: 'prop_code',
          targetProperty: { id: 'prop_code', key: 'code', name: 'Code', type: 'text' },
          allowLossy: false,
        },
      },
    ]);
  });

  test('reports a conflict-free no-op plan as already converged', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        action: 'get_plan',
        plan: {
          id: 'plan_converged',
          requiresCommit: false,
          committable: false,
          conflicts: [],
          diff: { manifests: [], records: [] },
        },
      }),
    ) as unknown as typeof fetch;
    const { handler } = capture();
    const result = await handler({ action: 'get_plan', planId: 'plan_converged' });
    expect(result.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('already converged') }),
    ]);
    expect(result.isError).not.toBe(true);
  });
});
