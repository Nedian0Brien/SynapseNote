import { afterEach, describe, expect, mock, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  DatabaseDefinitionSchema,
  runDatabaseQueryConformance,
} from '@nedian0brien/synapsenote-core';
import { executeDatabaseUiMutation } from '../../app/src/lib/database-mutation-client.ts';
import { ConfigSchema } from './config/schema.ts';
import { createDatabaseAgentRunStore } from './database-agent-run-store.ts';
import { createDatabaseAutonomyStore } from './database-autonomy-store.ts';
import { createDatabaseCommitEngine } from './database-commit.ts';
import {
  createDatabaseDataPlane,
  type DatabaseDataPlane,
  DatabaseDataPlaneError,
} from './database-data-plane.ts';
import {
  createDatabaseDataPlaneApiHandlers,
  DATABASE_API_SCHEMA_VERSION,
  DATABASE_API_SCHEMA_VERSION_HEADER,
  type DatabaseDataPlaneApiHandlers,
  DatabaseQueryResponseSchema,
} from './database-data-plane-api.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseRepairEngine } from './database-repair.ts';
import { createDatabaseStore } from './database-store.ts';
import { createDatabaseTaskService } from './database-task-service.ts';
import { createDatabaseTaskStore, type DatabaseTaskStore } from './database-task-store.ts';
import { register as registerData } from './mcp/tools/database.ts';
import { register as registerDataCommit } from './mcp/tools/database-commit.ts';
import { register as registerDataPlan } from './mcp/tools/database-plan.ts';
import { register as registerDataRepair } from './mcp/tools/database-repair.ts';
import { register as registerDataTask } from './mcp/tools/database-task.ts';
import { register as registerDataUndo } from './mcp/tools/database-undo.ts';
import type { ServerInstance } from './mcp/tools/shared.ts';

const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

function incoming(method: string, url: string, body = ''): IncomingMessage {
  const request = Readable.from(Buffer.from(body)) as unknown as IncomingMessage;
  request.method = method;
  request.url = url;
  request.headers = { host: 'localhost' };
  return request;
}

function outgoing(): { response: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' };
  const response = {
    statusCode: 0,
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status;
      for (const [key, value] of Object.entries(headers ?? {})) {
        captured.headers[key.toLowerCase()] = value;
      }
    },
    end(body?: string) {
      captured.body = body ?? '';
    },
  } as unknown as ServerResponse;
  return { response, captured };
}

async function call(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<CapturedResponse> {
  const target = outgoing();
  await handler(
    incoming(method, path, body === undefined ? '' : JSON.stringify(body)),
    target.response,
  );
  return target.captured;
}

function installFetchBridge(handlers: DatabaseDataPlaneApiHandlers): void {
  const routes: Record<string, keyof DatabaseDataPlaneApiHandlers> = {
    '/api/databases/catalog': 'catalog',
    '/api/databases/describe': 'describe',
    '/api/databases/find': 'find',
    '/api/databases/retrieve': 'retrieve',
    '/api/databases/query': 'query',
    '/api/databases/pack': 'pack',
    '/api/databases/plan': 'plan',
    '/api/databases/commit': 'commit',
    '/api/databases/autonomy': 'autonomy',
    '/api/databases/runs': 'runs',
    '/api/databases/undo': 'undo',
    '/api/databases/repair': 'repair',
    '/api/databases/task': 'task',
  };
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
      'http://localhost',
    );
    const route = routes[url.pathname];
    if (!route) return Response.json({ error: 'missing test route' }, { status: 404 });
    const result = await call(
      handlers[route],
      init?.method ?? 'GET',
      `${url.pathname}${url.search}`,
      init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined,
    );
    return new Response(result.body, { status: result.status, headers: result.headers });
  }) as unknown as typeof fetch;
}

function captureTools(): Record<string, ToolHandler> {
  const tools: Record<string, ToolHandler> = {};
  const server = {
    registerTool(name: string, _options: Record<string, unknown>, handler: ToolHandler) {
      tools[name] = handler;
    },
  } as unknown as ServerInstance;
  const deps = {
    resolveCwd: async () => '/project',
    config: ConfigSchema.parse({}),
    serverUrl: 'http://localhost:7777',
  };
  registerData(server, deps);
  registerDataPlan(server, deps);
  registerDataCommit(server, deps);
  registerDataUndo(server, deps);
  registerDataRepair(server, deps);
  registerDataTask(server, deps);
  return tools;
}

async function fixture(): Promise<{
  dataPlane: DatabaseDataPlane;
  handlers: DatabaseDataPlaneApiHandlers;
  contentDir: string;
  index: ReturnType<typeof createDatabaseRecordIndex>;
  taskStore: DatabaseTaskStore;
}> {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-contract-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(contentDir, 'tasks'), { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.create(
    DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_tasks',
      key: 'tasks',
      name: 'Tasks',
      contract: {
        purpose: 'Track contract test tasks',
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          folder: 'tasks',
          properties: [
            { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
            { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
            {
              id: 'prop_status',
              key: 'status',
              name: 'Status',
              type: 'select',
              options: [
                { id: 'opt_todo', key: 'todo', name: 'Todo' },
                { id: 'opt_done', key: 'done', name: 'Done' },
              ],
            },
          ],
        },
      ],
    }),
  );
  for (const [name, id, title, score, status] of [
    ['a.md', 'rec_a', 'Alpha', 2, 'todo'],
    ['b.md', 'rec_b', 'Beta', 8, 'done'],
  ] as const) {
    writeFileSync(
      join(contentDir, 'tasks', name),
      `---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: ${id}\ntitle: ${title}\nscore: ${score}\nstatus: ${status}\n---\n${title} body\n`,
    );
  }
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  const planEngine = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
  });
  const dataPlane = createDatabaseDataPlane({
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: planEngine,
  });
  const autonomyStore = createDatabaseAutonomyStore({
    projectDir,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  const agentRunStore = createDatabaseAgentRunStore({ projectDir });
  let checkpoint = 0;
  const commitEngine = createDatabaseCommitEngine({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: planEngine,
    git: {
      snapshot: async () => String(++checkpoint).repeat(40).slice(0, 40),
      hashBlob: async () => `sha1:${'a'.repeat(40)}`,
    },
    resolveAutonomyPolicy: ({ databaseId, sessionId, sessionToken }) =>
      autonomyStore.resolve(databaseId, sessionId, sessionToken),
    consumeAutonomyBudget: (input) => autonomyStore.consume(input),
    agentRunStore,
  });
  dataPlane.configureCommitEngine(commitEngine);
  dataPlane.configureRepairEngine(
    createDatabaseRepairEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    }),
  );
  const taskStore = createDatabaseTaskStore({ projectDir });
  const taskService = createDatabaseTaskService({
    projectDir,
    contentDir,
    taskStore,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: planEngine,
    databaseCommitEngine: commitEngine,
  });
  return {
    dataPlane,
    handlers: createDatabaseDataPlaneApiHandlers(
      dataPlane,
      taskStore,
      taskService,
      autonomyStore,
      agentRunStore,
    ),
    contentDir,
    index,
    store,
    taskStore,
    taskService,
  };
}

function withoutReplay(value: Record<string, unknown>): Record<string, unknown> {
  const { idempotentReplay: _replay, cwd: _cwd, text: _text, ...rest } = value;
  return rest;
}

function repairPlanShape(value: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, hash: _hash, createdAt: _createdAt, expiresAt: _expiresAt, ...shape } = value;
  return shape;
}

function ephemeralDraftShape(value: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, createdAt: _createdAt, expiresAt: _expiresAt, ...shape } = value;
  return shape;
}

describe('database server/API/MCP contract conformance', () => {
  test('preserves durable task list/get/cancel semantics across direct, HTTP, and MCP adapters', async () => {
    const { handlers, taskStore } = await fixture();
    installFetchBridge(handlers);
    const tools = captureTools();
    const created = await taskStore.create({
      operation: 'bulk',
      progress: { unit: 'records', total: 25 },
    });

    const direct = await taskStore.list({ state: 'queued', limit: 10 });
    const apiResponse = await call(handlers.task, 'POST', '/api/databases/task', {
      action: 'list',
      state: 'queued',
      limit: 10,
    });
    const api = JSON.parse(apiResponse.body) as Record<string, unknown>;
    const mcp = await tools.data_task?.({ action: 'list', state: 'queued', limit: 10 });
    expect(apiResponse.headers[DATABASE_API_SCHEMA_VERSION_HEADER.toLowerCase()]).toBe('1');
    expect(api).toEqual({ action: 'list', ...direct });
    expect(mcp?.structuredContent).toMatchObject({ action: 'list', ...direct });

    const cancelled = await tools.data_task?.({
      action: 'cancel',
      taskId: created.id,
      expectedRevision: created.revision,
    });
    const directCancelled = await taskStore.get(created.id);
    expect(cancelled?.structuredContent?.task).toEqual(directCancelled);
    const fetched = await call(handlers.task, 'POST', '/api/databases/task', {
      action: 'get',
      taskId: created.id,
    });
    expect(JSON.parse(fetched.body)).toEqual({ action: 'get', task: directCancelled });
  });

  test('launches durable migration tasks consistently through direct, HTTP, and MCP adapters', async () => {
    const { handlers, store, taskService } = await fixture();
    installFetchBridge(handlers);
    const tools = captureTools();
    const task = {
      operation: 'migration' as const,
      expectedManifestRevision: store.snapshot().revision,
      targetVersion: 1,
      databaseIds: ['db_tasks'],
    };
    const directPreview = await taskService.previewMigration(task);
    const previewApiResponse = await call(handlers.task, 'POST', '/api/databases/task', {
      action: 'preview_migration',
      databaseIds: task.databaseIds,
      expectedManifestRevision: task.expectedManifestRevision,
      targetVersion: task.targetVersion,
    });
    const previewApi = JSON.parse(previewApiResponse.body) as Record<string, unknown>;
    const previewMcp = await tools.data_task?.({
      action: 'preview_migration',
      databaseIds: task.databaseIds,
      expectedManifestRevision: task.expectedManifestRevision,
      targetVersion: task.targetVersion,
    });
    expect(previewApi).toEqual({ action: 'preview_migration', preview: directPreview });
    expect(previewMcp?.structuredContent).toMatchObject({
      action: 'preview_migration',
      preview: directPreview,
    });

    const direct = await taskService.start(task);
    const apiResponse = await call(handlers.task, 'POST', '/api/databases/task', {
      action: 'start',
      task,
    });
    const api = JSON.parse(apiResponse.body) as { task: { id: string } };
    const mcp = await tools.data_task?.({
      action: 'start',
      operation: 'migration',
      expectedManifestRevision: task.expectedManifestRevision,
      targetVersion: 1,
      databaseIds: ['db_tasks'],
    });
    const mcpTask = mcp?.structuredContent?.task as { id: string };
    expect(direct).toMatchObject({ operation: 'migration', state: 'queued' });
    expect(api).toMatchObject({
      action: 'start',
      task: { operation: 'migration', state: 'queued' },
    });
    expect(mcpTask).toMatchObject({ operation: 'migration', state: 'queued' });
    const completed = await Promise.all([
      taskService.wait(direct.id),
      taskService.wait(api.task.id),
      taskService.wait(mcpTask.id),
    ]);
    expect(completed).toEqual([
      expect.objectContaining({
        state: 'succeeded',
        result: expect.objectContaining({ checked: 1 }),
      }),
      expect.objectContaining({
        state: 'succeeded',
        result: expect.objectContaining({ checked: 1 }),
      }),
      expect.objectContaining({
        state: 'succeeded',
        result: expect.objectContaining({ checked: 1 }),
      }),
    ]);
  });

  test('runs the public query vectors unchanged through direct, HTTP, and MCP adapters', async () => {
    const { dataPlane, handlers } = await fixture();
    installFetchBridge(handlers);
    const tools = captureTools();

    const direct = await runDatabaseQueryConformance((input) => dataPlane.query(input));
    const http = await runDatabaseQueryConformance(async (input) => {
      const response = await call(handlers.query, 'POST', '/api/databases/query', input);
      if (response.status !== 200) {
        throw new Error(`HTTP query returned ${response.status}: ${response.body}`);
      }
      return JSON.parse(response.body);
    });
    const mcp = await runDatabaseQueryConformance(async (input) => {
      const result = await tools.data?.({ kind: 'query', ...input });
      if (!result?.structuredContent?.queryResult) throw new Error('MCP query result is missing');
      return result.structuredContent.queryResult;
    });

    expect(direct).toMatchObject({ passed: true });
    expect(http).toEqual(direct);
    expect(mcp).toEqual(direct);
  });

  test('preserves exact query, pagination, and recovery semantics across transports', async () => {
    const { dataPlane, handlers } = await fixture();
    installFetchBridge(handlers);
    const tools = captureTools();
    const query = {
      select: ['prop_title', 'prop_score'],
      sort: [{ propertyId: 'prop_title', direction: 'asc' as const }],
      aggregate: {
        groupBy: [{ propertyId: 'prop_score', direction: 'desc' as const }],
        calculations: [
          { id: 'records', function: 'count_all' as const },
          { id: 'score_sum', function: 'sum' as const, propertyId: 'prop_score' },
        ],
        groupLimit: 10,
      },
      page: { limit: 1 },
    };
    const input = { databaseId: 'db_tasks', sourceId: 'ds_tasks', query };

    const direct = dataPlane.query(input);
    const parsedDirect = DatabaseQueryResponseSchema.safeParse(direct);
    if (!parsedDirect.success) throw new Error(parsedDirect.error.message);
    const apiResponse = await call(handlers.query, 'POST', '/api/databases/query', input);
    if (apiResponse.status !== 200) {
      throw new Error(`HTTP query returned ${apiResponse.status}: ${apiResponse.body}`);
    }
    const api = JSON.parse(apiResponse.body) as Record<string, unknown>;
    const mcp = await tools.data?.({ kind: 'query', ...input });
    if (!mcp?.structuredContent) throw new Error('data MCP result missing structured content');
    const mcpQuery = mcp.structuredContent.queryResult as Record<string, unknown>;

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.headers[DATABASE_API_SCHEMA_VERSION_HEADER.toLowerCase()]).toBe(
      String(DATABASE_API_SCHEMA_VERSION),
    );
    expect(api).toEqual(direct);
    expect(mcpQuery).toEqual(direct);
    const continuationCursor = direct.nextCursor;
    if (typeof continuationCursor !== 'string') {
      throw new Error('transport pagination fixture must return a string cursor');
    }
    const expectedAggregation = structuredClone(direct.aggregation);
    expect(direct).toMatchObject({
      matched: 2,
      returned: 1,
      isComplete: false,
      truncatedBy: 'page_limit',
      nextCursor: expect.any(String),
      records: [{ id: 'rec_a' }],
      aggregation: {
        matched: 2,
        calculations: [
          { id: 'records', value: 2 },
          { id: 'score_sum', value: 10 },
        ],
        totalGroups: 2,
        groupsComplete: true,
      },
    });

    const continuationInput = {
      databaseId: input.databaseId,
      sourceId: input.sourceId,
      query: {
        ...query,
        page: { limit: 1, cursor: continuationCursor },
      },
    };
    const directContinuation = dataPlane.query(continuationInput);
    const apiContinuationResponse = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      continuationInput,
    );
    const mcpContinuation = await tools.data?.({ kind: 'query', ...continuationInput });
    expect(apiContinuationResponse.status).toBe(200);
    expect(JSON.parse(apiContinuationResponse.body)).toEqual(directContinuation);
    expect(mcpContinuation?.structuredContent?.queryResult).toEqual(directContinuation);
    expect(directContinuation).toMatchObject({
      matched: 2,
      returned: 1,
      isComplete: true,
      nextCursor: null,
      records: [{ id: 'rec_b' }],
      aggregation: expectedAggregation,
    });

    const operatorInput = {
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      query: {
        where: { propertyId: 'prop_title', operator: 'starts_with' as const, value: 'Al' },
      },
    };
    const directOperator = dataPlane.query(operatorInput);
    const apiOperatorResponse = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      operatorInput,
    );
    const mcpOperator = await tools.data?.({ kind: 'query', ...operatorInput });
    expect(JSON.parse(apiOperatorResponse.body)).toEqual(directOperator);
    expect(mcpOperator?.structuredContent?.queryResult).toEqual(directOperator);
    expect(directOperator).toMatchObject({ matched: 1, records: [{ id: 'rec_a' }] });

    let directCode = '';
    try {
      dataPlane.query({ ...input, databaseId: 'db_missing' });
    } catch (error) {
      if (error instanceof DatabaseDataPlaneError) directCode = error.code;
    }
    const apiErrorResponse = await call(handlers.query, 'POST', '/api/databases/query', {
      ...input,
      databaseId: 'db_missing',
    });
    const apiProblem = JSON.parse(apiErrorResponse.body) as Record<string, unknown>;
    const mcpError = await tools.data?.({ kind: 'query', ...input, databaseId: 'db_missing' });
    const mcpProblem = mcpError?.structuredContent?.problem as Record<string, unknown>;
    expect(directCode).toBe('database_not_found');
    expect(mcpError?.isError).toBe(true);
    expect(mcpProblem).toMatchObject({
      type: apiProblem.type,
      status: apiProblem.status,
      code: apiProblem.code,
      retryable: apiProblem.retryable,
      recovery: apiProblem.recovery,
    });
  });

  test('preserves plan, commit receipt, and undo semantics across transports', async () => {
    const { dataPlane, handlers } = await fixture();
    installFetchBridge(handlers);
    const tools = captureTools();
    const desiredState = {
      database: {
        key: 'projects',
        name: 'Projects',
        contract: {
          purpose: 'Track projects created through the contract test',
          canonicality: 'canonical' as const,
          vocabulary: ['project'],
          freshness: { expectation: 'realtime' as const, maxAgeSeconds: 60 },
          sensitivity: 'internal' as const,
        },
      },
      sources: [
        {
          key: 'projects',
          name: 'Projects',
          recordMeaning: 'One project',
          folder: 'projects',
          properties: [{ key: 'title', name: 'Title', type: 'title' as const, required: true }],
        },
      ],
      views: [],
      sampleRecords: [
        { sourceKey: 'projects', values: { title: 'First project' }, body: 'Contract body.\n' },
      ],
    };
    const draft = dataPlane.createDraft(desiredState);
    const plan = dataPlane.createPlan(draft.id);
    const apiPlanResponse = await call(handlers.plan, 'POST', '/api/databases/plan', {
      action: 'get_plan',
      planId: plan.id,
    });
    const apiPlan = (JSON.parse(apiPlanResponse.body) as { plan: Record<string, unknown> }).plan;
    const mcpPlan = await tools.data_plan?.({ action: 'get_plan', planId: plan.id });
    expect(apiPlan).toEqual(plan);
    expect(mcpPlan?.structuredContent?.plan).toEqual(plan);

    const commitInput = {
      planId: plan.id,
      planHash: plan.hash,
      expectedSnapshotRevision: plan.snapshotRevision,
      idempotencyKey: 'contract-commit-request-0001',
      approvalToken: `approve:${plan.hash}`,
      actor: { principalId: 'agent:contract', kind: 'agent' as const, sessionId: 'contract' },
      assertions: { databaseAbsent: true, createdRecords: 1 },
    };
    const directCommit = await dataPlane.commit(commitInput);
    const apiCommitResponse = await call(
      handlers.commit,
      'POST',
      '/api/databases/commit',
      commitInput,
    );
    const apiCommit = JSON.parse(apiCommitResponse.body) as Record<string, unknown>;
    const mcpCommit = await tools.data_commit?.(commitInput);
    if (!mcpCommit?.structuredContent) throw new Error('commit MCP result missing content');
    expect(apiCommit.idempotentReplay).toBe(true);
    expect(mcpCommit.structuredContent.idempotentReplay).toBe(true);
    expect(withoutReplay(apiCommit)).toEqual(withoutReplay(directCommit));
    expect(withoutReplay(mcpCommit.structuredContent)).toEqual(withoutReplay(directCommit));

    const directPreview = await dataPlane.undo({
      action: 'preview',
      undoToken: directCommit.undoToken,
    });
    const apiPreviewResponse = await call(handlers.undo, 'POST', '/api/databases/undo', {
      action: 'preview',
      undoToken: directCommit.undoToken,
    });
    const apiPreview = JSON.parse(apiPreviewResponse.body) as Record<string, unknown>;
    const mcpPreview = await tools.data_undo?.({
      action: 'preview',
      undoToken: directCommit.undoToken,
    });
    expect(apiPreview).toEqual(directPreview);
    expect(withoutReplay(mcpPreview?.structuredContent ?? {})).toEqual(
      withoutReplay(directPreview),
    );

    const undoInput = {
      action: 'apply' as const,
      undoToken: directCommit.undoToken,
      idempotencyKey: 'contract-undo-request-0001',
      actor: { principalId: 'agent:contract', kind: 'agent' as const, sessionId: 'contract' },
    };
    const directUndo = await dataPlane.undo(undoInput);
    const apiUndoResponse = await call(handlers.undo, 'POST', '/api/databases/undo', undoInput);
    const apiUndo = JSON.parse(apiUndoResponse.body) as Record<string, unknown>;
    const mcpUndo = await tools.data_undo?.(undoInput);
    expect(apiUndo.idempotentReplay).toBe(true);
    expect(mcpUndo?.structuredContent?.idempotentReplay).toBe(true);
    expect(withoutReplay(apiUndo)).toEqual(withoutReplay(directUndo));
    expect(withoutReplay(mcpUndo?.structuredContent ?? {})).toEqual(withoutReplay(directUndo));
  });

  test('routes reviewed UI mutations through the same HTTP plan and commit engine', async () => {
    const { handlers, index } = await fixture();
    installFetchBridge(handlers);
    const outcome = await executeDatabaseUiMutation({
      desiredState: {
        database: {
          key: 'ui-projects',
          name: 'UI projects',
          contract: {
            purpose: 'Verify the browser mutation command boundary',
            canonicality: 'canonical',
            vocabulary: ['project'],
            freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
            sensitivity: 'internal',
          },
        },
        sources: [
          {
            key: 'ui-projects',
            name: 'UI projects',
            recordMeaning: 'One UI project',
            folder: 'ui-projects',
            properties: [{ key: 'title', name: 'Title', type: 'title', required: true }],
          },
        ],
        views: [],
        sampleRecords: [
          {
            sourceKey: 'ui-projects',
            values: { title: 'Created from the UI command' },
            body: '',
          },
        ],
      },
      actor: { principalId: 'user:contract', sessionId: 'ui-contract' },
      idempotencyKey: 'ui-contract-commit-0001',
      assertions: { databaseAbsent: true, createdRecords: 1 },
      review: (plan) => {
        expect(plan.committable).toBe(true);
        expect(plan.diff.mode).toBe('exact');
        return true;
      },
    });
    expect(outcome).toMatchObject({
      status: 'committed',
      result: {
        planId: outcome.plan.id,
        planHash: outcome.plan.hash,
        verification: { status: 'passed' },
      },
    });
    expect(index.list()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ values: expect.objectContaining({ prop_title: 'Alpha' }) }),
        expect.objectContaining({ values: expect.objectContaining({ prop_title: 'Beta' }) }),
      ]),
    );
    expect(index.list()).toHaveLength(3);
  });

  test('preserves stable-ID schema ensure and fine-grained mutation semantics across transports', async () => {
    const { dataPlane, handlers, index } = await fixture();
    installFetchBridge(handlers);
    const tools = captureTools();
    const record = index.getById('rec_a');
    if (!record?.revision) throw new Error('expected revision-bound record');
    const desiredState = {
      database: {
        id: 'db_tasks',
        key: 'tasks',
        name: 'Contract tasks',
        contract: {
          purpose: 'Track contract test tasks',
          canonicality: 'canonical' as const,
          vocabulary: ['task'],
          freshness: { expectation: 'realtime' as const, maxAgeSeconds: 60 },
          sensitivity: 'internal' as const,
        },
      },
      sources: [
        {
          id: 'ds_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          folder: 'tasks',
          properties: [
            { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
            { id: 'prop_score', key: 'score', name: 'Priority score', type: 'number' },
            {
              id: 'prop_status',
              key: 'status',
              name: 'Status',
              type: 'select',
              options: [
                { id: 'opt_todo', key: 'todo', name: 'Todo' },
                { id: 'opt_done', key: 'done', name: 'Done' },
              ],
            },
            {
              id: 'prop_related',
              key: 'related',
              name: 'Related tasks',
              type: 'relation',
              targetSourceId: 'ds_tasks',
              cardinality: 'many',
            },
          ],
        },
      ],
      views: [],
      sampleRecords: [],
      recordMutations: [
        {
          id: 'rec_a',
          expectedRevision: record.revision,
          sourceKey: 'tasks',
          operations: [
            { op: 'set' as const, propertyKey: 'status', value: 'done' },
            { op: 'increment' as const, propertyKey: 'score', by: 1 },
            { op: 'append' as const, value: 'Agent update\n' },
            { op: 'link' as const, propertyKey: 'related', recordId: 'rec_b' },
          ],
        },
      ],
    };
    const draft = dataPlane.createDraft(desiredState);
    const apiDraftResponse = await call(handlers.plan, 'POST', '/api/databases/plan', {
      action: 'create_draft',
      desiredState,
    });
    const apiDraft = (JSON.parse(apiDraftResponse.body) as { draft: Record<string, unknown> })
      .draft;
    const mcpDraftResult = await tools.data_plan?.({
      action: 'create_draft',
      desiredState,
    });
    const mcpDraft = mcpDraftResult?.structuredContent?.draft as Record<string, unknown>;
    expect(ephemeralDraftShape(apiDraft)).toEqual(
      ephemeralDraftShape(draft as unknown as Record<string, unknown>),
    );
    expect(ephemeralDraftShape(mcpDraft)).toEqual(
      ephemeralDraftShape(draft as unknown as Record<string, unknown>),
    );
    expect(draft.normalized.targetResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'database', targetId: 'db_tasks', via: 'explicit_id' }),
        expect.objectContaining({
          kind: 'record',
          selector: 'recordMutations.0.id',
          targetId: 'rec_a',
          via: 'explicit_id',
        }),
        expect.objectContaining({
          kind: 'record',
          selector: 'recordMutations.0.operations.3.recordId',
          targetId: 'rec_b',
          via: 'explicit_id',
        }),
      ]),
    );
    const plan = dataPlane.createPlan(draft.id);
    const apiResponse = await call(handlers.plan, 'POST', '/api/databases/plan', {
      action: 'get_plan',
      planId: plan.id,
    });
    const apiPlan = (JSON.parse(apiResponse.body) as { plan: Record<string, unknown> }).plan;
    const mcp = await tools.data_plan?.({ action: 'get_plan', planId: plan.id });
    expect(apiPlan).toEqual(plan);
    expect(mcp?.structuredContent?.plan).toEqual(plan);
    expect(plan.normalizedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'ensure_relation', action: 'create' }),
        expect.objectContaining({ kind: 'alter_schema', action: 'update' }),
        expect.objectContaining({
          kind: 'mutate_record',
          recordId: 'rec_a',
          operations: [
            expect.objectContaining({ kind: 'set', propertyId: 'prop_status' }),
            expect.objectContaining({ kind: 'increment', propertyId: 'prop_score', by: 1 }),
            expect.objectContaining({ kind: 'append', propertyId: null }),
            expect.objectContaining({ kind: 'link', propertyId: 'prop_related' }),
          ],
        }),
        expect.objectContaining({ kind: 'upsert_records', updated: 1 }),
      ]),
    );

    const commitInput = {
      planId: plan.id,
      planHash: plan.hash,
      expectedSnapshotRevision: plan.snapshotRevision,
      idempotencyKey: 'contract-update-request-0001',
      approvalToken: `approve:${plan.hash}`,
      actor: { principalId: 'agent:contract', kind: 'agent' as const },
      assertions: { databaseAbsent: false },
    };
    const direct = await dataPlane.commit(commitInput);
    const apiCommitResponse = await call(
      handlers.commit,
      'POST',
      '/api/databases/commit',
      commitInput,
    );
    const apiCommit = JSON.parse(apiCommitResponse.body) as Record<string, unknown>;
    const mcpCommit = await tools.data_commit?.(commitInput);
    expect(withoutReplay(apiCommit)).toEqual(withoutReplay(direct));
    expect(withoutReplay(mcpCommit?.structuredContent ?? {})).toEqual(withoutReplay(direct));
    expect(index.getById('rec_a')).toMatchObject({ body: 'Alpha body\nAgent update\n' });
    expect(index.getById('rec_a')?.values).toMatchObject({
      prop_score: 3,
      prop_status: 'opt_done',
      prop_related: ['rec_b'],
    });
  });

  test('preserves repair preview and idempotent apply semantics across transports', async () => {
    const { dataPlane, handlers, contentDir, index } = await fixture();
    installFetchBridge(handlers);
    const tools = captureTools();
    writeFileSync(
      join(contentDir, 'tasks', 'a.md'),
      '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_a\ntitle: Alpha\nscore: invalid\n---\nAlpha body\n',
    );
    await index.rebuild();

    const directPlan = await dataPlane.previewRepair();
    const apiPreviewResponse = await call(handlers.repair, 'POST', '/api/databases/repair', {
      action: 'preview',
    });
    const apiPlan = (JSON.parse(apiPreviewResponse.body) as { plan: Record<string, unknown> }).plan;
    const mcpPreview = await tools.data_repair?.({ action: 'preview' });
    const mcpPlan = mcpPreview?.structuredContent?.plan as Record<string, unknown>;
    expect(repairPlanShape(apiPlan)).toEqual(
      repairPlanShape(directPlan as unknown as Record<string, unknown>),
    );
    expect(repairPlanShape(mcpPlan)).toEqual(
      repairPlanShape(directPlan as unknown as Record<string, unknown>),
    );

    const apply = {
      planId: directPlan.id,
      planHash: directPlan.hash,
      approvalToken: `approve:${directPlan.hash}`,
      idempotencyKey: 'contract-repair-request-0001',
      principalId: 'agent:contract',
    };
    const direct = await dataPlane.applyRepair(apply);
    const apiResponse = await call(handlers.repair, 'POST', '/api/databases/repair', {
      action: 'apply',
      ...apply,
    });
    const api = (JSON.parse(apiResponse.body) as { result: Record<string, unknown> }).result;
    const mcp = await tools.data_repair?.({ action: 'apply', ...apply });
    const mcpResult = mcp?.structuredContent?.result as Record<string, unknown>;
    expect(api.idempotentReplay).toBe(true);
    expect(mcpResult.idempotentReplay).toBe(true);
    expect(withoutReplay(api)).toEqual(withoutReplay(direct as unknown as Record<string, unknown>));
    expect(withoutReplay(mcpResult)).toEqual(
      withoutReplay(direct as unknown as Record<string, unknown>),
    );
  });
});
