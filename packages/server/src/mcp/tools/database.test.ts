import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import type { AgentIdentity } from '../agent-identity.ts';
import { DESCRIPTION, register } from './database.ts';
import type { ServerInstance } from './shared.ts';

const CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface RegisteredTool {
  name: string;
  options: {
    inputSchema: Record<string, unknown>;
    annotations?: Record<string, unknown>;
  };
  handler: (args: Record<string, unknown>, extra?: { signal?: AbortSignal }) => Promise<ToolResult>;
}

function capture(identityRef?: { current: AgentIdentity }): RegisteredTool {
  let tool: RegisteredTool | undefined;
  const server = {
    registerTool(
      name: string,
      options: RegisteredTool['options'],
      handler: RegisteredTool['handler'],
    ) {
      tool = { name, options, handler };
    },
  } as unknown as ServerInstance;
  register(server, {
    resolveCwd: async () => '/tmp/project',
    config: CONFIG,
    serverUrl: 'http://localhost:7777',
    ...(identityRef ? { identityRef } : {}),
  });
  if (!tool) throw new Error('data tool was not registered');
  return tool;
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('data MCP tool', () => {
  test('forwards the handshake-bound agent session on every database request', async () => {
    let requestedHeaders: Headers | undefined;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      requestedHeaders = new Headers(init?.headers);
      return Response.json({
        manifestRevision: 'sha256:manifest',
        catalogRevision: `sha256:${'c'.repeat(64)}`,
        complete: true,
        candidates: [],
      });
    }) as unknown as typeof fetch;

    const identityRef = {
      current: {
        connectionId: '11111111-1111-4111-8111-111111111111',
        displayName: 'Codex',
        colorSeed: 'codex',
        clientInfo: { name: 'codex', version: '1.0.0' },
      },
    };
    await capture(identityRef).handler({ kind: 'catalog' });

    expect(requestedHeaders?.get('x-synapsenote-agent-id')).toBe(identityRef.current.connectionId);
  });

  test('teaches the compact catalog → describe → query protocol and is read-only', () => {
    const tool = capture();
    expect(tool.name).toBe('data');
    expect(DESCRIPTION).toContain('catalog');
    expect(DESCRIPTION).toContain('describe');
    expect(DESCRIPTION).toContain('token efficiency');
    expect(tool.options.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    });
  });

  test('routes catalog search and preserves all ambiguous candidates', async () => {
    let requestedUrl = '';
    globalThis.fetch = mock(async (url: string) => {
      requestedUrl = String(url);
      return Response.json({
        query: 'customer',
        manifestRevision: 'sha256:manifest',
        catalogRevision: `sha256:${'c'.repeat(64)}`,
        complete: true,
        candidates: [
          { id: 'db_feedback', key: 'feedback', name: 'Feedback' },
          { id: 'db_research', key: 'research', name: 'Research' },
        ],
      });
    }) as unknown as typeof fetch;

    const result = await capture().handler({ kind: 'catalog', search: 'customer' });
    expect(requestedUrl).toBe('http://localhost:7777/api/databases/catalog?q=customer');
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain('2 candidates');
    expect(
      (result.structuredContent?.catalog as { candidates?: unknown[] })?.candidates ?? [],
    ).toHaveLength(2);
  });

  test('retrieves durable repeating-template history by stable scope', async () => {
    let requestedUrl = '';
    let body: unknown;
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      requestedUrl = String(url);
      body = JSON.parse(String(init?.body));
      return Response.json({ runs: [{ id: 'tplrun_one', state: 'succeeded' }] });
    }) as unknown as typeof fetch;

    const result = await capture().handler({
      kind: 'template_runs',
      databaseId: 'db_tasks',
      templateId: 'tpl_daily',
      limit: 20,
    });
    expect(requestedUrl).toBe('http://localhost:7777/api/databases/template-runs');
    expect(body).toEqual({ databaseId: 'db_tasks', templateId: 'tpl_daily', limit: 20 });
    expect(result.content[0]?.text).toContain('1 durable repeating-template run');
    expect(result.structuredContent?.templateRuns).toMatchObject({
      runs: [{ id: 'tplrun_one', state: 'succeeded' }],
    });
  });

  test('retrieves content-free automation history by stable scope', async () => {
    let requestedUrl = '';
    let body: unknown;
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      requestedUrl = String(url);
      body = JSON.parse(String(init?.body));
      return Response.json({ action: 'list', runs: [{ id: 'autorun_one', state: 'succeeded' }] });
    }) as unknown as typeof fetch;

    const result = await capture().handler({
      kind: 'automation_runs',
      databaseId: 'db_tasks',
      automationId: 'auto_daily',
      limit: 20,
    });
    expect(requestedUrl).toBe('http://localhost:7777/api/databases/automations');
    expect(body).toEqual({
      action: 'list',
      databaseId: 'db_tasks',
      automationId: 'auto_daily',
      limit: 20,
    });
    expect(result.content[0]?.text).toContain('1 durable automation run');
    expect(result.structuredContent?.automationRuns).toMatchObject({
      runs: [{ id: 'autorun_one', state: 'succeeded' }],
    });
  });

  test('retrieves a bounded unread automation notification inbox', async () => {
    let body: unknown;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        action: 'notifications',
        notifications: [{ id: 'autonote_one', title: 'Needs review', readAt: null }],
      });
    }) as unknown as typeof fetch;

    const result = await capture().handler({
      kind: 'automation_notifications',
      recipientId: 'person_agent',
      limit: 10,
    });
    expect(body).toEqual({
      action: 'notifications',
      recipientId: 'person_agent',
      unreadOnly: true,
      limit: 10,
    });
    expect(result.content[0]?.text).toContain('1 automation notification');
    expect(result.structuredContent?.automationNotifications).toMatchObject({
      notifications: [{ id: 'autonote_one', title: 'Needs review' }],
    });
  });

  test('reuses an identical cached catalog by representation revision', async () => {
    let requestedUrl = '';
    globalThis.fetch = mock(async (url: string) => {
      requestedUrl = String(url);
      return Response.json({
        notModified: true,
        query: 'customer',
        manifestRevision: 'sha256:manifest',
        catalogRevision: `sha256:${'c'.repeat(64)}`,
      });
    }) as unknown as typeof fetch;

    const result = await capture().handler({
      kind: 'catalog',
      search: 'customer',
      ifCatalogRevision: `sha256:${'c'.repeat(64)}`,
    });
    expect(requestedUrl).toBe(
      `http://localhost:7777/api/databases/catalog?q=customer&ifCatalogRevision=sha256%3A${'c'.repeat(64)}`,
    );
    expect(result.content[0]?.text).toContain('not modified');
    expect(result.structuredContent?.catalog).toEqual({
      notModified: true,
      query: 'customer',
      manifestRevision: 'sha256:manifest',
      catalogRevision: `sha256:${'c'.repeat(64)}`,
    });
  });

  test('routes exact describe and projected query requests', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ url: String(url), body });
      if (String(url).endsWith('/describe')) {
        return Response.json({
          manifestRevision: 'sha256:manifest',
          database: { id: 'db_tasks', name: 'Tasks' },
          source: { id: 'ds_tasks' },
        });
      }
      return Response.json({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        matched: 3,
        returned: 1,
        derivedRevision: `sha256:${'d'.repeat(64)}`,
        isComplete: false,
        nextCursor: 'cursor:next',
        records: [{ id: 'rec_1', values: { prop_title: 'First' } }],
      });
    }) as unknown as typeof fetch;

    const tool = capture();
    const described = await tool.handler({
      kind: 'describe',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
    });
    expect(described.content[0]?.text).toContain('Described Tasks');

    const queried = await tool.handler({
      kind: 'query',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      viewId: 'view_tasks_table',
      query: {
        select: ['prop_title'],
        page: { limit: 1 },
        aggregate: {
          groupBy: [{ propertyId: 'prop_status', arrayMode: 'set' }],
          calculations: [
            { id: 'records', function: 'count_all' },
            { id: 'score_sum', function: 'sum', propertyId: 'prop_score' },
          ],
          groupLimit: 20,
        },
      },
    });
    expect(queried.content[0]?.text).toContain('1 of 3');
    expect(queried.content[0]?.text).toContain('nextCursor');
    expect(queried.structuredContent?.queryResult).toMatchObject({
      derivedRevision: `sha256:${'d'.repeat(64)}`,
    });
    expect(requests).toEqual([
      {
        url: 'http://localhost:7777/api/databases/describe',
        body: { databaseId: 'db_tasks', sourceId: 'ds_tasks' },
      },
      {
        url: 'http://localhost:7777/api/databases/query',
        body: {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          viewId: 'view_tasks_table',
          query: {
            select: ['prop_title'],
            page: { limit: 1 },
            aggregate: {
              groupBy: [{ propertyId: 'prop_status', arrayMode: 'set' }],
              calculations: [
                { id: 'records', function: 'count_all' },
                { id: 'score_sum', function: 'sum', propertyId: 'prop_score' },
              ],
              groupLimit: 20,
            },
          },
        },
      },
    ]);
  });

  test('forwards MCP cancellation to database query and pack HTTP requests', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      signals.push(init?.signal);
      return Response.json({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        matched: 0,
        returned: 0,
        records: [],
        snapshot: { indexRevision: `sha256:${'a'.repeat(64)}` },
      });
    }) as unknown as typeof fetch;

    const controller = new AbortController();
    const tool = capture();
    await tool.handler(
      { kind: 'query', databaseId: 'db_tasks', sourceId: 'ds_tasks' },
      { signal: controller.signal },
    );
    await tool.handler(
      {
        kind: 'pack',
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        goal: 'Summarize tasks',
        maxTokens: 256,
      },
      { signal: controller.signal },
    );

    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal?.aborted === false)).toBe(true);
    controller.abort();
    expect(signals.every((signal) => signal?.aborted === true)).toBe(true);
  });

  test('routes explicit hybrid retrieval and preserves visible degradation diagnostics', async () => {
    let request: { url: string; body: Record<string, unknown> } | null = null;
    globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
      request = {
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      };
      return Response.json({
        requestedMode: 'hybrid',
        appliedMode: 'lexical',
        degradedReason: 'semantic_not_ready',
        ranking: { matched: 2, returned: 1 },
      });
    }) as unknown as typeof fetch;
    const result = await capture().handler({
      kind: 'retrieve',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      text: 'checkout latency',
      retrievalMode: 'hybrid',
      propertyIds: ['prop_title'],
      includeBody: false,
      lexicalWeight: 1,
      semanticWeight: 2,
      requireSemantic: false,
      limit: 10,
    });
    expect(request).toEqual({
      url: 'http://localhost:7777/api/databases/retrieve',
      body: {
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'checkout latency',
        mode: 'hybrid',
        propertyIds: ['prop_title'],
        includeBody: false,
        lexicalWeight: 1,
        semanticWeight: 2,
        requireSemantic: false,
        limit: 10,
      },
    });
    expect(result.content[0]?.text).toContain('degraded explicitly: semantic_not_ready');
    expect(result.structuredContent?.retrieval).toMatchObject({
      appliedMode: 'lexical',
      degradedReason: 'semantic_not_ready',
    });
  });

  test('rejects missing stable IDs before making a request and preserves API error codes', async () => {
    const noId = await capture().handler({ kind: 'query' });
    expect(noId.isError).toBe(true);
    expect(noId.content[0]?.text).toContain('databaseId');

    globalThis.fetch = mock(async () => {
      return Response.json(
        {
          type: 'urn:ok:error:stale-target',
          title: 'Database record index is not current',
          status: 503,
          code: 'stale_index',
          retryable: true,
          recovery: {
            action: 'rebuild_index',
            instruction: 'Wait for index rebuild.',
            retryAfterMs: 500,
          },
        },
        { status: 503, headers: { 'content-type': 'application/problem+json' } },
      );
    }) as unknown as typeof fetch;
    const stale = await capture().handler({
      kind: 'query',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
    });
    expect(stale.isError).toBe(true);
    expect(stale.content[0]?.text).toContain('(stale_index)');
    expect(stale.structuredContent?.problem).toMatchObject({
      type: 'urn:ok:error:stale-target',
      status: 503,
      code: 'stale_index',
      retryable: true,
      recovery: { action: 'rebuild_index', retryAfterMs: 500 },
      title: 'Database record index is not current',
    });

    globalThis.fetch = mock(async () => {
      return Response.json(
        {
          type: 'urn:ok:error:permission-denied',
          title: 'Property is outside the effective read scope',
          status: 403,
          code: 'permission_denied',
          retryable: false,
          deniedPropertyIds: ['prop_private'],
          allowedPropertyIds: ['prop_title'],
          recovery: {
            action: 'request_access',
            instruction: 'Request access or remove the denied property.',
            endpoint: '/api/databases/describe',
          },
        },
        { status: 403, headers: { 'content-type': 'application/problem+json' } },
      );
    }) as unknown as typeof fetch;
    const denied = await capture().handler({
      kind: 'query',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
    });
    expect(denied.isError).toBe(true);
    expect(denied.structuredContent?.problem).toMatchObject({
      type: 'urn:ok:error:permission-denied',
      status: 403,
      code: 'permission_denied',
      deniedPropertyIds: ['prop_private'],
      allowedPropertyIds: ['prop_title'],
      recovery: { action: 'request_access', endpoint: '/api/databases/describe' },
    });
  });

  test('requests a token-budgeted pack with explicit encoding and estimator', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        id: 'pack_123',
        returned: 2,
        isComplete: false,
        nextCursor: 'next-pack',
      });
    }) as unknown as typeof fetch;
    const result = await capture().handler({
      kind: 'pack',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      goal: 'Prepare a concise task brief',
      propertyIds: ['prop_title'],
      maxTokens: 1_000,
      reserveTokens: 200,
      tokenizer: 'utf8_bytes_div2',
      encoding: 'columnar_dictionary',
      disclosure: { level: 'evidence', searchText: 'urgent customer' },
      relationExpansion: {
        maxDepth: 2,
        maxRecords: 25,
        maxRecordsPerRelation: 5,
        projections: [{ sourceId: 'ds_projects', propertyIds: ['prop_project_title'] }],
      },
      query: {
        select: ['prop_title'],
        page: { limit: 10 },
        aggregate: { calculations: [{ id: 'records', function: 'count_all' }] },
      },
    });
    expect(body).toEqual({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      goal: 'Prepare a concise task brief',
      propertyIds: ['prop_title'],
      maxTokens: 1_000,
      reserveTokens: 200,
      tokenizer: 'utf8_bytes_div2',
      encoding: 'columnar_dictionary',
      disclosure: { level: 'evidence', searchText: 'urgent customer' },
      relationExpansion: {
        maxDepth: 2,
        maxRecords: 25,
        maxRecordsPerRelation: 5,
        projections: [{ sourceId: 'ds_projects', propertyIds: ['prop_project_title'] }],
      },
      query: { select: ['prop_title'] },
    });
    expect(result.content[0]?.text).toContain('2 records (partial)');
    expect(result.content[0]?.text).toContain('cursor');
  });

  test('uses a saved Agent View pack contract without resending its token settings', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        id: 'pack_agent',
        returned: 1,
        isComplete: true,
        nextCursor: null,
        agentView: { id: 'view_tasks_agent' },
      });
    }) as unknown as typeof fetch;
    const result = await capture().handler({
      kind: 'pack',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      agentViewId: 'view_tasks_agent',
      goal: 'Use the saved context contract',
    });
    expect(body).toEqual({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      agentViewId: 'view_tasks_agent',
      goal: 'Use the saved context contract',
    });
    expect(result.content[0]?.text).toContain('1 record (complete)');
  });

  test('surfaces the inspectable find plan and unresolved requests', async () => {
    const bodies: Record<string, unknown>[] = [];
    let unresolved = false;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return Response.json({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        plan: {
          query: unresolved
            ? null
            : { where: { propertyId: 'prop_score', operator: 'gte', value: 5 } },
          interpretation: {
            requiresResolution: unresolved,
            warnings: unresolved ? [{ code: 'invalid_property_value' }] : [],
          },
        },
        retrieval: unresolved ? null : { matched: 1, returned: 1, hits: [] },
        result: unresolved ? null : { matched: 2, returned: 2 },
      });
    }) as unknown as typeof fetch;

    const tool = capture();
    const found = await tool.handler({
      kind: 'find',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      text: 'score at least 5',
      limit: 10,
    });
    expect(found.content[0]?.text).toContain('1 of 1 lexical matches');
    expect(found.content[0]?.text).toContain('source evidence');
    expect(bodies[0]).toEqual({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      text: 'score at least 5',
      limit: 10,
    });

    unresolved = true;
    const refused = await tool.handler({
      kind: 'find',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      text: 'score at least urgent',
    });
    expect(refused.isError).toBeFalsy();
    expect(refused.content[0]?.text).toContain('needs resolution');
    expect((refused.structuredContent?.find as { result?: unknown }).result).toBeNull();
  });

  test('sends schema cache revisions and handles notModified without repeating schema', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        notModified: true,
        manifestRevision: 'sha256:manifest',
        schemaRevision: 'sha256:schema',
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
      });
    }) as unknown as typeof fetch;
    const result = await capture().handler({
      kind: 'describe',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      ifSchemaRevision: 'sha256:schema',
    });
    expect(body).toEqual({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      ifSchemaRevision: 'sha256:schema',
    });
    expect(result.content[0]?.text).toContain('not modified');
    expect(
      (result.structuredContent?.description as { database?: unknown }).database,
    ).toBeUndefined();
  });

  test('forwards a query revision receipt for delta delivery', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        queryId: 'qry_same',
        matched: 1,
        returned: 1,
        isComplete: true,
        nextCursor: null,
        delta: {
          sinceQueryId: 'qry_same',
          addedOrChangedRecordIds: [],
          unchangedRecordIds: ['rec_1'],
        },
      });
    }) as unknown as typeof fetch;
    const receipt = {
      queryId: 'qry_same',
      recordRevisions: { rec_1: 'sha256:one' },
      isComplete: true,
    };
    const result = await capture().handler({
      kind: 'query',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      deltaSince: receipt,
    });
    expect(body).toEqual({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      deltaSince: receipt,
    });
    expect((result.structuredContent?.queryResult as { delta?: unknown }).delta).toBeDefined();
  });
});
