import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  type DatabaseAccessPrincipal,
  DatabaseDefinitionSchema,
} from '@nedian0brien/synapsenote-core';
import { createDefaultDatabaseQueryAccessResolver } from './database-access-policy.ts';
import { createDatabaseAgentPromptRetentionStore } from './database-agent-prompt-retention.ts';
import { createDatabaseAgentRunStore } from './database-agent-run-store.ts';
import { createDatabaseAutomationService } from './database-automation.ts';
import { createDatabaseAutomationNotificationStore } from './database-automation-notification-store.ts';
import { createDatabaseAutonomyStore } from './database-autonomy-store.ts';
import { createDatabaseButtonPlanner } from './database-button.ts';
import { createDatabaseButtonExecutor } from './database-button-executor.ts';
import { createDatabaseCommitEngine, type DatabaseCommitEngine } from './database-commit.ts';
import {
  createDatabaseDataPlane,
  type DatabaseDataPlane,
  type ResolveDatabaseQueryAccess,
} from './database-data-plane.ts';
import { createDatabaseDataPlaneApiHandlers } from './database-data-plane-api.ts';
import { createDatabasePermissionStore } from './database-permission-store.ts';
import { createDatabasePlaceSearchService } from './database-place-search.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseRepairEngine } from './database-repair.ts';
import { DatabaseSemanticIndex } from './database-semantic-index.ts';
import { createDatabaseStore } from './database-store.ts';
import { createDatabaseTaskService } from './database-task-service.ts';
import { createDatabaseTaskStore } from './database-task-store.ts';
import { createDatabaseTemplateScheduler } from './database-template-scheduler.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function request(
  method: string,
  url: string,
  body = '',
  headers: Record<string, string> = {},
): IncomingMessage {
  const readable = Readable.from(Buffer.from(body)) as unknown as IncomingMessage;
  readable.method = method;
  readable.url = url;
  readable.headers = { host: 'localhost', ...headers };
  return readable;
}

function response(): { response: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' };
  const serverResponse = {
    statusCode: 0,
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status;
      if (headers) {
        for (const [key, value] of Object.entries(headers)) {
          captured.headers[key.toLowerCase()] = value;
        }
      }
    },
    end(body?: string) {
      captured.body = body ?? '';
    },
  } as unknown as ServerResponse;
  return { response: serverResponse, captured };
}

async function fixture(
  resolveQueryAccess?: ResolveDatabaseQueryAccess,
  semanticIndex?: DatabaseSemanticIndex,
  resolveAccessPrincipal?: (request: IncomingMessage) => DatabaseAccessPrincipal,
) {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-data-plane-api-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  const definition = DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    people: [
      {
        id: 'person_automation',
        key: 'automation',
        name: 'Automation owner',
        kind: 'agent',
        subjectId: 'agent:automation',
        active: true,
      },
    ],
    contract: {
      purpose: 'Track work that needs to be completed',
      canonicality: 'canonical',
      vocabulary: ['task', 'work'],
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
          {
            id: 'prop_tasks_title',
            key: 'title',
            name: 'Title',
            type: 'title',
          },
          {
            id: 'prop_tasks_score',
            key: 'score',
            name: 'Score',
            type: 'number',
          },
          {
            id: 'prop_tasks_code',
            key: 'code',
            name: 'Code',
            type: 'text',
          },
          {
            id: 'prop_tasks_related',
            key: 'related',
            name: 'Related tasks',
            type: 'relation',
            targetSourceId: 'ds_tasks',
            cardinality: 'many',
          },
        ],
      },
    ],
    buttons: [
      {
        id: 'dbbtn_pair',
        key: 'create-pair',
        name: 'Create task pair',
        description: 'Create the review and follow-up tasks together',
        placement: { kind: 'source', sourceId: 'ds_tasks' },
        confirmation: { title: 'Create both tasks?' },
        actions: [
          {
            id: 'create_review',
            kind: 'create_record',
            sourceId: 'ds_tasks',
            values: { prop_tasks_title: 'Review', prop_tasks_score: 5 },
            body: '',
          },
          {
            id: 'create_follow_up',
            kind: 'create_record',
            sourceId: 'ds_tasks',
            values: { prop_tasks_title: 'Follow up', prop_tasks_score: 3 },
            body: '',
          },
        ],
      },
    ],
    automations: [
      {
        id: 'auto_new_task',
        key: 'new-task',
        name: 'Notify on new task',
        version: 1,
        enabled: true,
        ownerId: 'person_automation',
        trigger: { kind: 'record_added', sourceId: 'ds_tasks' },
        actions: [
          {
            id: 'notify_owner',
            kind: 'notification',
            recipientIds: ['person_automation'],
            title: 'New task',
          },
        ],
      },
    ],
    views: [
      {
        id: 'view_tasks_agent',
        key: 'task-agent',
        name: 'Task agent',
        sourceId: 'ds_tasks',
        layout: { type: 'agent' },
        where: { propertyId: 'prop_tasks_score', operator: 'gte', value: 5 },
        sort: [{ propertyId: 'prop_tasks_score', direction: 'desc' }],
        projection: {
          propertyIds: ['prop_tasks_title', 'prop_tasks_score'],
          body: 'preview',
        },
        agent: {
          semanticContract: {
            purpose: 'Prepare a grounded task brief',
            evidence: 'preferred',
            freshness: 'require_current',
          },
          tokenBudget: {
            maxTokens: 1_000,
            reserveTokens: 100,
            tokenizer: 'utf8_bytes_div3',
            encoding: 'object_rows',
          },
          scope: {
            maxRecords: 1,
            relationDepth: 0,
            relationMaxRecords: 10,
            relationFanOut: 5,
          },
          writePolicy: {
            mode: 'read_only',
            allowedActions: [],
            allowedPropertyIds: [],
            maxRecordsPerCommit: 0,
          },
        },
      },
    ],
  });
  await store.create(definition);
  mkdirSync(join(contentDir, 'tasks'), { recursive: true });
  writeFileSync(
    join(contentDir, 'tasks', 'first.md'),
    '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_first\ntitle: First\nscore: 8\ncode: "8"\nrelated:\n  - rec_first\n---\nCheckout latency evidence\n',
  );
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  const planEngine = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
  });
  const buttonPlanner = createDatabaseButtonPlanner({
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: planEngine,
    generateUuid: () => 'bbbbbbbb-0000-4000-8000-000000000000',
    resolvePermission: () => ({
      allowed: true,
      policyId: 'policy_api_test',
      policyRevision: `sha256:${'b'.repeat(64)}`,
    }),
  });
  const automationEvents = new Map<string, { kind: string; buttonId?: string | null }>();
  const dataPlane = createDatabaseDataPlane({
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: planEngine,
    databaseButtonPlanner: buttonPlanner,
    publishAutomationEvent: async (event) => {
      automationEvents.set(event.deduplicationKey, event);
    },
    ...(resolveQueryAccess ? { resolveQueryAccess } : {}),
    ...(semanticIndex ? { semanticIndex } : {}),
  });
  const autonomyStore = createDatabaseAutonomyStore({
    projectDir,
    now: () => new Date('2026-07-20T00:00:00.000Z'),
  });
  const permissionStore = createDatabasePermissionStore({
    projectDir,
    now: () => new Date('2026-07-21T00:00:00.000Z'),
  });
  const agentRunStore = createDatabaseAgentRunStore({ projectDir });
  const promptRetentionStore = createDatabaseAgentPromptRetentionStore({
    now: () => new Date('2026-07-20T00:00:00.000Z'),
  });
  let snapshotCount = 0;
  const commitEngine = createDatabaseCommitEngine({
    projectDir,
    contentDir,
    now: () => new Date('2026-07-20T00:00:00.000Z'),
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: planEngine,
    git: {
      snapshot: async () => String(++snapshotCount).repeat(40).slice(0, 40),
      hashBlob: async () => `sha1:${'a'.repeat(40)}`,
    },
    resolveAutonomyPolicy: ({ databaseId, sessionId, sessionToken }) =>
      autonomyStore.resolve(databaseId, sessionId, sessionToken),
    consumeAutonomyBudget: (input) => autonomyStore.consume(input),
    agentRunStore,
  });
  dataPlane.configureCommitEngine(commitEngine);
  const buttonDeliveries: Array<{
    connectionId: string;
    idempotencyKey: string;
  }> = [];
  dataPlane.configureButtonExecutor(
    createDatabaseButtonExecutor({
      projectDir,
      commit: (input) => dataPlane.commit(input),
      getIdempotentCommit: (idempotencyKey) => commitEngine.getIdempotentResult(idempotencyKey),
      resolvePermission: () => ({
        allowed: true,
        policyId: 'policy_api_test',
        policyRevision: `sha256:${'b'.repeat(64)}`,
      }),
      resolveExternalPolicy: () => ({
        allowed: true,
        policyId: 'connection:conn_tracker',
        policyRevision: 'connection_revision_1',
        maxEgressBytes: 10_000,
      }),
      deliverExternal: async ({ connectionId, idempotencyKey }) => {
        buttonDeliveries.push({ connectionId, idempotencyKey });
        return { receiptId: 'delivery_button_test' };
      },
      publishInvocation: async ({ executionReceiptId, buttonId, propertyId }) => {
        automationEvents.set(`button:${executionReceiptId}`, {
          kind: 'button_invoked',
          buttonId: buttonId ?? propertyId,
        });
      },
      now: () => new Date('2026-07-20T00:00:00.000Z'),
      generateUuid: () => 'cccccccc-0000-4000-8000-000000000000',
    }),
  );
  const repairEngine = createDatabaseRepairEngine({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
  });
  dataPlane.configureRepairEngine(repairEngine);
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
  const templateScheduler = createDatabaseTemplateScheduler({
    projectDir,
    databaseStore: store,
    execute: async () => ({ recordIds: [] }),
  });
  const automationNotificationStore = createDatabaseAutomationNotificationStore({ projectDir });
  const automationService = createDatabaseAutomationService({
    projectDir,
    databaseStore: store,
    databaseRecordIndex: index,
    databasePlanEngine: planEngine,
    databaseCommitEngine: commitEngine,
    resolvePermission: () => ({
      allowed: true,
      policyId: 'policy_api_automation',
      policyRevision: 'rev_1',
    }),
    deliverNotification: (input) => automationNotificationStore.deliver(input),
  });
  return {
    handlers: createDatabaseDataPlaneApiHandlers(
      dataPlane,
      taskStore,
      taskService,
      autonomyStore,
      agentRunStore,
      undefined,
      templateScheduler,
      automationService,
      automationNotificationStore,
      resolveAccessPrincipal,
      permissionStore,
      promptRetentionStore,
    ),
    store,
    taskStore,
    projectDir,
    contentDir,
    index,
    dataPlane,
    taskService,
    autonomyStore,
    permissionStore,
    agentRunStore,
    promptRetentionStore,
    templateScheduler,
    automationService,
    automationNotificationStore,
    automationEvents,
    buttonDeliveries,
    snapshotCount: () => snapshotCount,
  };
}

async function call(
  handler: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  method: string,
  url: string,
  body = '',
  headers: Record<string, string> = {},
): Promise<CapturedResponse> {
  const result = response();
  await handler(request(method, url, body, headers), result.response);
  return result.captured;
}

describe('database data plane HTTP handlers', () => {
  test('binds a trusted transport principal to the whole asynchronous handler call', async () => {
    let observedPrincipal: DatabaseAccessPrincipal | undefined;
    const resolveQueryAccess: ResolveDatabaseQueryAccess = (input) => {
      observedPrincipal = input.principal;
      return {
        policyId: 'policy_agent_session',
        policyRevision: `sha256:${'a'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: null,
      };
    };
    const principal: DatabaseAccessPrincipal = {
      kind: 'agent',
      id: 'agent:11111111-1111-4111-8111-111111111111',
      invokingUserId: 'user:owner',
      sessionId: '11111111-1111-4111-8111-111111111111',
    };
    const { handlers } = await fixture(resolveQueryAccess, undefined, () => principal);

    const result = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        query: {},
      }),
    );

    expect(result.status).toBe(200);
    expect(observedPrincipal).toEqual(principal);
  });

  test('fails closed for unscoped agent audit, permission-management, and egress routes', async () => {
    const principal: DatabaseAccessPrincipal = {
      kind: 'agent',
      id: 'agent:11111111-1111-4111-8111-111111111111',
      invokingUserId: 'user:owner',
      sessionId: '11111111-1111-4111-8111-111111111111',
    };
    const { handlers } = await fixture(
      createDefaultDatabaseQueryAccessResolver(),
      undefined,
      () => principal,
    );

    const attempts = await Promise.all([
      call(
        handlers.autonomy,
        'POST',
        '/api/databases/autonomy',
        JSON.stringify({
          action: 'set_database',
          databaseId: 'db_tasks',
          mode: 'review',
          expectedRevision: 'sha256:empty',
        }),
      ),
      call(handlers.runs, 'POST', '/api/databases/runs', JSON.stringify({ action: 'list' })),
      call(
        handlers.task,
        'POST',
        '/api/databases/task',
        JSON.stringify({ action: 'list', limit: 20 }),
      ),
      call(
        handlers.placeSearch,
        'POST',
        '/api/databases/place/search',
        JSON.stringify({ query: 'Seoul', consent: true }),
      ),
      call(
        handlers.permissions,
        'POST',
        '/api/databases/permissions',
        JSON.stringify({ action: 'list', databaseId: 'db_tasks' }),
      ),
    ]);

    expect(attempts.map(({ status }) => status)).toEqual([403, 403, 403, 403, 403]);
    for (const attempt of attempts) {
      expect(JSON.parse(attempt.body)).toMatchObject({
        code: 'permission_denied',
      });
    }
  });

  test('serves explicit hybrid retrieval with semantic model, privacy, freshness, and RRF diagnostics', async () => {
    const semanticIndex = new DatabaseSemanticIndex({
      configuration: {
        enabled: true,
        providerId: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        privacy: 'local_only',
        propertyIds: ['prop_tasks_title'],
        includeBody: false,
      },
      provider: {
        id: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        location: 'local',
        async embed(texts) {
          return texts.map((text) =>
            text.includes('First') || text === 'first' ? [1, 0] : [0, 1],
          );
        },
      },
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });
    const { handlers, dataPlane } = await fixture(undefined, semanticIndex);
    await dataPlane.rebuildSemanticIndex({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
    });
    const retrieved = await call(
      handlers.retrieve,
      'POST',
      '/api/databases/retrieve',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'first',
        mode: 'hybrid',
        propertyIds: ['prop_tasks_title'],
        limit: 10,
      }),
    );
    expect(retrieved.status).toBe(200);
    expect(JSON.parse(retrieved.body)).toMatchObject({
      requestedMode: 'hybrid',
      appliedMode: 'hybrid',
      degradedReason: null,
      semanticIndex: {
        state: 'ready',
        providerId: 'provider_local',
        model: 'embed-v1',
        privacy: 'local_only',
      },
      ranking: {
        hits: [
          {
            recordId: 'rec_first',
            ranking: { lexicalRank: 1, semanticRank: 1 },
          },
        ],
        trace: { strategy: 'reciprocal_rank_fusion', constant: 60 },
      },
    });
  });

  test('returns a strict exact property-conversion preview and plan', async () => {
    const { handlers } = await fixture();
    const converted = await call(
      handlers.propertyConversion,
      'POST',
      '/api/databases/property-conversion',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        propertyId: 'prop_tasks_code',
        targetProperty: {
          id: 'prop_tasks_code',
          key: 'code',
          name: 'Code',
          type: 'number',
        },
      }),
    );
    expect(converted.status).toBe(200);
    expect(JSON.parse(converted.body)).toMatchObject({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      propertyId: 'prop_tasks_code',
      preview: {
        committable: true,
        requiresLossyApproval: false,
        summary: { total: 1, converted: 1, blocked: 0 },
      },
      plan: { committable: true, conflicts: [] },
    });
  });

  test('searches Place only after explicit consent and returns an offline-safe fallback', async () => {
    const unavailable = createDatabaseDataPlaneApiHandlers();
    const offline = await call(
      unavailable.placeSearch,
      'POST',
      '/api/databases/place/search',
      JSON.stringify({ query: 'Seoul', consent: true }),
    );
    expect(offline.status).toBe(200);
    expect(JSON.parse(offline.body)).toEqual({
      status: 'unavailable',
      providerId: null,
      candidates: [],
      attribution: null,
      offlineFallback: true,
    });

    let calls = 0;
    const service = createDatabasePlaceSearchService({
      provider: {
        id: 'test-geocoder',
        attribution: 'Test map data',
        async search() {
          calls += 1;
          return [
            {
              displayName: 'Seoul',
              value: {
                label: 'Seoul',
                address: 'Seoul, Republic of Korea',
                lat: 37.5665,
                lon: 126.978,
                precision: 'exact',
                source: 'search',
                provider: { id: 'test-geocoder', placeId: '7' },
              },
            },
          ];
        },
      },
    });
    const handlers = createDatabaseDataPlaneApiHandlers(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      service,
    );
    const refused = await call(
      handlers.placeSearch,
      'POST',
      '/api/databases/place/search',
      JSON.stringify({ query: 'Seoul', consent: false }),
    );
    expect(refused.status).toBe(400);
    expect(calls).toBe(0);
    const found = await call(
      handlers.placeSearch,
      'POST',
      '/api/databases/place/search',
      JSON.stringify({ query: 'Seoul', consent: true }),
    );
    expect(found.status).toBe(200);
    expect(JSON.parse(found.body)).toMatchObject({
      status: 'ok',
      providerId: 'test-geocoder',
      offlineFallback: true,
      candidates: [{ value: { label: 'Seoul', source: 'search' } }],
    });
    expect(calls).toBe(1);
  });

  test('creates, edits, lists, and revokes database sharing grants with revisions', async () => {
    const { handlers } = await fixture();
    const initial = await call(
      handlers.permissions,
      'POST',
      '/api/databases/permissions',
      JSON.stringify({ action: 'list', databaseId: 'db_tasks' }),
    );
    expect(initial.status).toBe(200);
    expect(JSON.parse(initial.body)).toEqual({
      action: 'list',
      grants: [],
      revision: 'sha256:empty',
    });

    const invalidRole = await call(
      handlers.permissions,
      'POST',
      '/api/databases/permissions',
      JSON.stringify({
        action: 'upsert',
        databaseId: 'db_tasks',
        principalId: 'user:collaborator',
        role: 'content_editor',
        actions: ['query', 'alter_schema'],
        expectedRevision: 'sha256:empty',
      }),
    );
    expect(invalidRole.status).toBe(400);

    const created = await call(
      handlers.permissions,
      'POST',
      '/api/databases/permissions',
      JSON.stringify({
        action: 'upsert',
        databaseId: 'db_tasks',
        principalId: 'user:collaborator',
        actions: ['query', 'describe'],
        expectedRevision: 'sha256:empty',
      }),
    );
    expect(created.status).toBe(200);
    const createdBody = JSON.parse(created.body) as {
      grant: { id: string; actions: string[]; createdBy: string };
      revision: string;
    };
    expect(createdBody.grant).toMatchObject({
      actions: ['describe', 'query'],
      createdBy: 'user:local-owner',
    });

    const stale = await call(
      handlers.permissions,
      'POST',
      '/api/databases/permissions',
      JSON.stringify({
        action: 'remove',
        grantId: createdBody.grant.id,
        expectedRevision: 'sha256:empty',
      }),
    );
    expect(stale.status).toBe(409);
    expect(JSON.parse(stale.body)).toMatchObject({
      code: 'permission_changed',
    });

    const removed = await call(
      handlers.permissions,
      'POST',
      '/api/databases/permissions',
      JSON.stringify({
        action: 'remove',
        grantId: createdBody.grant.id,
        expectedRevision: createdBody.revision,
      }),
    );
    expect(removed.status).toBe(200);
    expect(JSON.parse(removed.body)).toMatchObject({
      action: 'remove',
      grantId: createdBody.grant.id,
    });
  });

  test('manages token-safe public shares and enforces them on anonymous reads', async () => {
    const { handlers } = await fixture();
    const created = await call(
      handlers.publicShares,
      'POST',
      '/api/databases/public-shares',
      JSON.stringify({
        action: 'upsert',
        target: { kind: 'database', databaseId: 'db_tasks', sourceId: 'ds_tasks' },
        access: 'link',
        propertyIds: ['prop_tasks_title'],
        allowBody: false,
        allowFormSubmission: false,
        expiresAt: null,
        expectedRevision: 'sha256:empty',
      }),
    );
    expect(created.status).toBe(200);
    expect(created.body).not.toContain('tokenHash');
    expect(created.body).not.toContain('createdBy');
    const createdBody = JSON.parse(created.body) as {
      share: { id: string };
      token: string;
      revision: string;
    };
    expect(createdBody.token).toStartWith('dbsharetoken_');

    const wrong = await call(
      handlers.publicShares,
      'POST',
      '/api/databases/public-shares',
      JSON.stringify({
        action: 'resolve',
        shareId: createdBody.share.id,
        token: 'dbsharetoken_wrong',
      }),
    );
    const missing = await call(
      handlers.publicShares,
      'POST',
      '/api/databases/public-shares',
      JSON.stringify({
        action: 'resolve',
        shareId: 'dbshare_00000000-0000-4000-8000-000000000099',
        token: 'dbsharetoken_wrong',
      }),
    );
    expect(wrong.status).toBe(404);
    expect(missing.status).toBe(404);
    const { instance: _wrongInstance, ...wrongProblem } = JSON.parse(wrong.body);
    const { instance: _missingInstance, ...missingProblem } = JSON.parse(missing.body);
    expect(wrongProblem).toEqual(missingProblem);

    const queried = await call(
      handlers.publicShares,
      'POST',
      '/api/databases/public-shares',
      JSON.stringify({
        action: 'query',
        shareId: createdBody.share.id,
        token: createdBody.token,
        query: { select: ['prop_tasks_title'] },
      }),
    );
    expect(queried.status).toBe(200);
    expect(queried.body).not.toContain('tokenHash');
    expect(JSON.parse(queried.body)).toMatchObject({
      action: 'query',
      result: {
        records: [{ id: 'rec_first', values: { prop_tasks_title: 'First' } }],
      },
    });
    expect(queried.body).not.toContain('prop_tasks_code');
    expect(queried.body).not.toContain('Checkout latency evidence');

    const revoked = await call(
      handlers.publicShares,
      'POST',
      '/api/databases/public-shares',
      JSON.stringify({
        action: 'revoke',
        shareId: createdBody.share.id,
        expectedRevision: createdBody.revision,
      }),
    );
    expect(revoked.status).toBe(200);
    const afterRevoke = await call(
      handlers.publicShares,
      'POST',
      '/api/databases/public-shares',
      JSON.stringify({
        action: 'query',
        shareId: createdBody.share.id,
        token: createdBody.token,
        query: { select: ['prop_tasks_title'] },
      }),
    );
    expect(afterRevoke.status).toBe(404);
  });

  test('configures fail-closed database and token-bound session autonomy with revisions', async () => {
    const { handlers } = await fixture();
    const initial = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'get',
        databaseId: 'db_tasks',
        sessionId: 'session-1',
      }),
    );
    expect(initial.status).toBe(200);
    expect(JSON.parse(initial.body)).toEqual({
      action: 'get',
      databaseId: 'db_tasks',
      sessionId: 'session-1',
      databaseMode: null,
      sessionMode: null,
      effectiveMode: 'review',
      delegation: null,
      usage: { records: 0, actions: 0, egressBytes: 0 },
      revision: 'sha256:empty',
      usageRevision: 'sha256:empty',
    });

    const database = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'set_database',
        databaseId: 'db_tasks',
        mode: 'autonomous',
        expectedRevision: 'sha256:empty',
      }),
    );
    expect(database.status).toBe(200);
    const databaseBody = JSON.parse(database.body) as { revision: string };

    const session = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'set_session',
        sessionId: 'session-1',
        mode: 'autonomous',
        expectedRevision: databaseBody.revision,
        delegation: {
          databaseIds: ['db_tasks'],
          actions: ['update_record'],
          propertyIds: ['prop_tasks_title'],
          allowBody: false,
          maxRecordsPerAction: 10,
          maxRecordsTotal: 10,
          maxActionsTotal: 1,
          maxEgressBytesTotal: 0,
          expiresAt: '2026-07-20T01:00:00.000Z',
        },
      }),
    );
    expect(session.status).toBe(200);
    const sessionBody = JSON.parse(session.body) as {
      revision: string;
      sessionToken: string;
    };
    expect(sessionBody.sessionToken).toMatch(/^dbsession_/);

    const configured = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'get',
        databaseId: 'db_tasks',
        sessionId: 'session-1',
      }),
    );
    expect(JSON.parse(configured.body)).toMatchObject({
      databaseMode: 'autonomous',
      sessionMode: 'autonomous',
      effectiveMode: 'autonomous',
      delegation: { actions: ['update_record'], maxRecordsPerAction: 10 },
      revision: sessionBody.revision,
    });
    expect(configured.body).not.toContain(sessionBody.sessionToken);

    const stale = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'clear_session',
        sessionId: 'session-1',
        expectedRevision: databaseBody.revision,
      }),
    );
    expect(stale.status).toBe(409);
    expect(JSON.parse(stale.body)).toMatchObject({
      code: 'autonomy_revision_changed',
      retryable: false,
      recovery: { action: 'request_approval' },
    });

    const cleared = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'clear_session',
        sessionId: 'session-1',
        expectedRevision: sessionBody.revision,
      }),
    );
    expect(cleared.status).toBe(200);
    expect(JSON.parse(cleared.body)).toMatchObject({
      action: 'clear_session',
      mode: null,
      delegation: null,
    });
  });

  test('rejects invalid delegation/mode combinations and reports unavailable policy storage', async () => {
    const { handlers } = await fixture();
    const invalid = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'set_session',
        sessionId: 'session-1',
        mode: 'balanced',
        expectedRevision: 'sha256:empty',
        delegation: {
          databaseIds: ['db_tasks'],
          actions: ['update_record'],
          propertyIds: ['prop_tasks_title'],
          allowBody: false,
          maxRecordsPerAction: 10,
          maxRecordsTotal: 10,
          maxActionsTotal: 1,
          maxEgressBytesTotal: 0,
          expiresAt: '2026-07-20T01:00:00.000Z',
        },
      }),
    );
    expect(invalid.status).toBe(400);
    expect(JSON.parse(invalid.body)).toMatchObject({ code: 'invalid_request' });

    const unavailable = createDatabaseDataPlaneApiHandlers();
    const missing = await call(
      unavailable.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({ action: 'get', databaseId: 'db_tasks' }),
    );
    expect(missing.status).toBe(503);
    expect(JSON.parse(missing.body)).toMatchObject({
      code: 'data_plane_unavailable',
    });
  });

  test('plans revision-bound Button actions without exposing connection secrets', async () => {
    const { handlers, store, index, buttonDeliveries } = await fixture();
    const current = store.getById('db_tasks');
    if (!current) throw new Error('database fixture missing');
    await store.update('db_tasks', {
      ...current,
      sources: current.sources.map((source) =>
        source.id === 'ds_tasks'
          ? {
              ...source,
              properties: [
                ...source.properties,
                {
                  id: 'prop_tasks_button',
                  key: 'raise_score',
                  name: 'Raise score',
                  type: 'button',
                  label: 'Raise score',
                  actions: [
                    {
                      id: 'increment_score',
                      kind: 'update_record',
                      operations: [
                        {
                          op: 'increment',
                          propertyId: 'prop_tasks_score',
                          by: 1,
                        },
                      ],
                    },
                    {
                      id: 'notify',
                      kind: 'external_webhook',
                      connectionId: 'conn_tracker',
                      eventName: 'score_raised',
                      propertyIds: ['prop_tasks_title'],
                    },
                  ],
                },
              ],
            }
          : source,
      ),
    });
    await index.rebuild();
    const record = index.getById('rec_first');
    if (!record?.revision) throw new Error('record fixture missing');

    const response = await call(
      handlers.button,
      'POST',
      '/api/databases/button',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_first',
        propertyId: 'prop_tasks_button',
        expectedRecordRevision: record.revision,
      }),
    );
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.plan).toMatchObject({
      id: 'buttonplan_bbbbbbbb000040008000000000000000',
      requiresApproval: true,
      externalSteps: [
        {
          connectionId: 'conn_tracker',
          payload: { properties: { prop_tasks_title: 'First' } },
        },
      ],
      internalPlan: {
        diff: {
          records: [
            {
              recordId: 'rec_first',
              after: { values: { prop_tasks_score: 9 } },
            },
          ],
        },
      },
    });
    expect(response.body).not.toContain('https://');
    expect(response.body).not.toContain('secret');

    const unapproved = await call(
      handlers.button,
      'POST',
      '/api/databases/button',
      JSON.stringify({
        action: 'execute',
        buttonPlanId: body.plan.id,
        buttonPlanHash: body.plan.hash,
        idempotencyKey: 'api-button-unapproved',
        approvalToken: `approve:sha256:${'0'.repeat(64)}`,
        actor: { principalId: 'user:local', kind: 'human' },
      }),
    );
    expect(unapproved.status).toBe(409);
    expect(JSON.parse(unapproved.body)).toMatchObject({
      code: 'button_approval_required',
      recovery: { action: 'request_approval' },
    });

    const executed = await call(
      handlers.button,
      'POST',
      '/api/databases/button',
      JSON.stringify({
        action: 'execute',
        buttonPlanId: body.plan.id,
        buttonPlanHash: body.plan.hash,
        idempotencyKey: 'api-button-execution-one',
        approvalToken: `approve:${body.plan.hash}`,
        actor: { principalId: 'user:local', kind: 'human' },
      }),
    );
    expect(executed.status).toBe(200);
    expect(JSON.parse(executed.body)).toMatchObject({
      action: 'execute',
      run: {
        state: 'succeeded',
        internalMutationId: expect.stringMatching(/^mut_/),
        actions: [
          { kind: 'internal_commit', state: 'succeeded' },
          { actionId: 'notify', receiptId: 'delivery_button_test' },
        ],
      },
      undoToken: expect.stringMatching(/^undo_/),
    });
    expect(buttonDeliveries).toEqual([
      {
        connectionId: 'conn_tracker',
        idempotencyKey: expect.stringMatching(/^button-run:buttonrun_.*:action:notify$/),
      },
    ]);
    const runs = await call(
      handlers.button,
      'POST',
      '/api/databases/button',
      JSON.stringify({ action: 'list_runs', limit: 10 }),
    );
    expect(JSON.parse(runs.body)).toMatchObject({
      action: 'list_runs',
      runs: [{ buttonPlanId: body.plan.id, state: 'succeeded' }],
    });

    const stale = await call(
      handlers.button,
      'POST',
      '/api/databases/button',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_first',
        propertyId: 'prop_tasks_button',
        expectedRecordRevision: `sha256:${'0'.repeat(64)}`,
      }),
    );
    expect(stale.status).toBe(409);
    expect(JSON.parse(stale.body)).toMatchObject({
      code: 'record_revision_changed',
      recovery: { action: 'restart_query' },
    });
  });

  test('plans a database Button as one exact multi-record action without record context', async () => {
    const { handlers } = await fixture();
    const response = await call(
      handlers.button,
      'POST',
      '/api/databases/button',
      JSON.stringify({ databaseId: 'db_tasks', buttonId: 'dbbtn_pair' }),
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).plan).toMatchObject({
      buttonId: 'dbbtn_pair',
      sourceId: 'ds_tasks',
      recordId: null,
      propertyId: null,
      expectedRecordRevision: null,
      requiresApproval: true,
      confirmation: { title: 'Create both tasks?' },
      permissionGuards: [
        { actionId: 'create_review', policyId: 'policy_api_test' },
        { actionId: 'create_follow_up', policyId: 'policy_api_test' },
      ],
      internalPlan: {
        diff: {
          records: [
            {
              after: {
                values: { prop_tasks_title: 'Review', prop_tasks_score: 5 },
              },
            },
            {
              after: {
                values: { prop_tasks_title: 'Follow up', prop_tasks_score: 3 },
              },
            },
          ],
        },
      },
      externalSteps: [],
    });
  });

  test('publishes deduplicated record and Button invocation events after exact commit', async () => {
    const { handlers, automationEvents } = await fixture();
    const planned = await call(
      handlers.button,
      'POST',
      '/api/databases/button',
      JSON.stringify({ databaseId: 'db_tasks', buttonId: 'dbbtn_pair' }),
    );
    const internalPlan = JSON.parse(planned.body).plan.internalPlan;
    const committed = await call(
      handlers.commit,
      'POST',
      '/api/databases/commit',
      JSON.stringify({
        planId: internalPlan.id,
        planHash: internalPlan.hash,
        expectedSnapshotRevision: internalPlan.snapshotRevision,
        idempotencyKey: 'button-event-test-1',
        approvalToken: `approve:${internalPlan.hash}`,
        actor: { principalId: 'user:test', kind: 'human' },
      }),
    );
    expect(committed.status).toBe(200);
    expect([...automationEvents.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'record_added' }),
        expect.objectContaining({
          kind: 'button_invoked',
          buttonId: 'dbbtn_pair',
        }),
      ]),
    );
  });

  test('returns bounded durable repeating-template run history', async () => {
    const { handlers } = await fixture();
    const response = await call(
      handlers.templateRuns,
      'POST',
      '/api/databases/template-runs',
      JSON.stringify({ databaseId: 'db_tasks', limit: 20 }),
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ runs: [] });
  });

  test('returns bounded content-free automation run history', async () => {
    const { handlers } = await fixture();
    const response = await call(
      handlers.automations,
      'POST',
      '/api/databases/automations',
      JSON.stringify({ action: 'list', databaseId: 'db_tasks', limit: 20 }),
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ action: 'list', runs: [] });
  });

  test('dry-runs and executes an explicit automation test event through the public contract', async () => {
    const { handlers, index } = await fixture();
    const record = index.getById('rec_first');
    if (!record?.revision) throw new Error('missing exact automation record fixture');
    const event = {
      deduplicationKey: 'api-test-new-task',
      databaseId: 'db_tasks',
      kind: 'record_added',
      sourceId: 'ds_tasks',
      recordId: record.id,
      recordRevision: record.revision,
    };
    const dryRun = await call(
      handlers.automations,
      'POST',
      '/api/databases/automations',
      JSON.stringify({
        action: 'dry_run',
        databaseId: 'db_tasks',
        automationId: 'auto_new_task',
        event,
      }),
    );
    expect(dryRun.status).toBe(200);
    expect(JSON.parse(dryRun.body)).toMatchObject({
      action: 'dry_run',
      plan: {
        automationId: 'auto_new_task',
        automationVersion: 1,
        internalPlan: null,
        notifications: [{ actionId: 'notify_owner', recipientIds: ['person_automation'] }],
        external: [],
      },
    });
    const tested = await call(
      handlers.automations,
      'POST',
      '/api/databases/automations',
      JSON.stringify({
        action: 'test_event',
        databaseId: 'db_tasks',
        automationId: 'auto_new_task',
        event,
      }),
    );
    expect(tested.status).toBe(200);
    expect(JSON.parse(tested.body)).toMatchObject({
      action: 'test_event',
      runs: [
        {
          automationId: 'auto_new_task',
          state: 'succeeded',
          actions: [
            {
              actionId: 'notify_owner',
              receiptId: expect.stringMatching(/^autonote_/),
            },
          ],
        },
      ],
    });
    const notifications = await call(
      handlers.automations,
      'POST',
      '/api/databases/automations',
      JSON.stringify({
        action: 'notifications',
        recipientId: 'person_automation',
        unreadOnly: true,
      }),
    );
    expect(JSON.parse(notifications.body)).toMatchObject({
      action: 'notifications',
      notifications: [
        {
          recipientIds: ['person_automation'],
          title: 'New task',
          readAt: null,
        },
      ],
    });
    const notificationId = (
      JSON.parse(notifications.body) as { notifications: Array<{ id: string }> }
    ).notifications[0]?.id;
    const marked = await call(
      handlers.automations,
      'POST',
      '/api/databases/automations',
      JSON.stringify({ action: 'mark_notification_read', notificationId }),
    );
    expect(JSON.parse(marked.body)).toEqual({
      action: 'mark_notification_read',
      notificationId,
    });
    const emptyInbox = await call(
      handlers.automations,
      'POST',
      '/api/databases/automations',
      JSON.stringify({
        action: 'notifications',
        recipientId: 'person_automation',
        unreadOnly: true,
      }),
    );
    expect(JSON.parse(emptyInbox.body)).toMatchObject({ notifications: [] });
  });

  test('lists, gets, and revision-safely cancels durable database tasks', async () => {
    const { handlers, taskStore } = await fixture();
    const created = await taskStore.create({
      operation: 'import',
      progress: { unit: 'files', total: 12, message: 'Waiting to import' },
    });

    const listed = await call(
      handlers.task,
      'POST',
      '/api/databases/task',
      JSON.stringify({ action: 'list', state: 'queued', limit: 10 }),
    );
    expect(listed.status).toBe(200);
    expect(listed.headers['x-synapsenote-database-schema-version']).toBe('1');
    expect(JSON.parse(listed.body)).toMatchObject({
      action: 'list',
      tasks: [{ id: created.id, operation: 'import', state: 'queued' }],
      nextCursor: null,
    });

    const fetched = await call(
      handlers.task,
      'POST',
      '/api/databases/task',
      JSON.stringify({ action: 'get', taskId: created.id }),
    );
    expect(JSON.parse(fetched.body)).toMatchObject({
      action: 'get',
      task: created,
    });

    const stale = await call(
      handlers.task,
      'POST',
      '/api/databases/task',
      JSON.stringify({
        action: 'cancel',
        taskId: created.id,
        expectedRevision: `sha256:${'0'.repeat(64)}`,
      }),
    );
    expect({
      status: stale.status,
      body: JSON.parse(stale.body),
    }).toMatchObject({
      status: 409,
      body: {
        code: 'task_revision_changed',
        retryable: false,
        observedRevision: created.revision,
        recovery: { action: 'retry', endpoint: '/api/databases/task' },
      },
    });

    const cancelled = await call(
      handlers.task,
      'POST',
      '/api/databases/task',
      JSON.stringify({
        action: 'cancel',
        taskId: created.id,
        expectedRevision: created.revision,
      }),
    );
    expect(JSON.parse(cancelled.body)).toMatchObject({
      action: 'cancel',
      task: { id: created.id, state: 'cancelled', cancellable: false },
    });
  });

  test('previews source onboarding through the public task contract without writes', async () => {
    const { handlers, store, contentDir } = await fixture();
    const path = join(contentDir, 'tasks', 'external.md');
    const before = '---\ntitle: External\nscore: 5\n---\nExternal body\n';
    writeFileSync(path, before);

    const response = await call(
      handlers.task,
      'POST',
      '/api/databases/task',
      JSON.stringify({
        action: 'preview_import',
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        expectedManifestRevision: store.snapshot().revision,
      }),
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      action: 'preview_import',
      preview: {
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        complete: true,
        items: expect.arrayContaining([
          expect.objectContaining({
            path: 'tasks/external.md',
            action: 'modify',
            plannedChanges: [{ type: 'assign_record_id' }],
          }),
        ]),
      },
    });
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  test('previews manifest migration through the public task contract without writes', async () => {
    const { handlers, store, projectDir } = await fixture();
    const path = join(projectDir, '.ok', 'databases', 'tasks.yml');
    const before = readFileSync(path, 'utf8');
    const response = await call(
      handlers.task,
      'POST',
      '/api/databases/task',
      JSON.stringify({
        action: 'preview_migration',
        databaseIds: ['db_tasks'],
        expectedManifestRevision: store.snapshot().revision,
        targetVersion: 1,
      }),
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      action: 'preview_migration',
      preview: {
        targetVersion: 1,
        summary: { notNeeded: 1, blocked: 0 },
        complete: true,
        committable: true,
        items: [
          {
            databaseId: 'db_tasks',
            manifestPath: '.ok/databases/tasks.yml',
            sourceVersion: 1,
            action: 'not_needed',
            migrationIds: ['database-manifest-v1-identity'],
          },
        ],
      },
    });
    expect(readFileSync(path, 'utf8')).toBe(before);
  });

  test('launches a durable migration task and exposes terminal checkpoint progress', async () => {
    const { handlers, store, taskService } = await fixture();
    const started = await call(
      handlers.task,
      'POST',
      '/api/databases/task',
      JSON.stringify({
        action: 'start',
        task: {
          operation: 'migration',
          expectedManifestRevision: store.snapshot().revision,
          targetVersion: 1,
          databaseIds: ['db_tasks'],
        },
      }),
    );
    expect(started.status).toBe(200);
    const queued = JSON.parse(started.body) as { task: { id: string } };
    expect(queued).toMatchObject({
      action: 'start',
      task: { operation: 'migration', state: 'queued', progress: { total: 1 } },
    });
    await taskService.wait(queued.task.id);
    const fetched = await call(
      handlers.task,
      'POST',
      '/api/databases/task',
      JSON.stringify({ action: 'get', taskId: queued.task.id }),
    );
    expect(JSON.parse(fetched.body)).toMatchObject({
      action: 'get',
      task: {
        state: 'succeeded',
        attempt: 1,
        checkpoint: { sequence: 1, completed: 1 },
        result: { checked: 1, alreadyCurrent: 1, migrated: 0 },
      },
    });
  });

  test('returns a typed retryable conflict instead of a partial transaction read', async () => {
    const { handlers, dataPlane } = await fixture();
    dataPlane.configureCommitEngine({
      isTransactionActive: () => true,
    } as unknown as DatabaseCommitEngine);
    const blocked = await call(handlers.catalog, 'GET', '/api/databases/catalog');
    expect(blocked.status).toBe(409);
    expect(JSON.parse(blocked.body)).toMatchObject({
      type: 'urn:ok:error:stale-target',
      code: 'transaction_in_progress',
      retryable: true,
      recovery: { action: 'wait_and_retry', retryAfterMs: 250 },
    });
  });

  test('serves compact catalog, exact description, and typed query contracts', async () => {
    const { handlers } = await fixture();
    const catalog = await call(handlers.catalog, 'GET', '/api/databases/catalog?q=work');
    expect(catalog.status).toBe(200);
    expect(catalog.headers['cache-control']).toBe('no-store');
    expect(catalog.headers.etag).toMatch(/^"sha256:/);
    const catalogBody = JSON.parse(catalog.body) as {
      manifestRevision: string;
      catalogRevision: string;
      complete: boolean;
      candidates: Array<{ id: string; score: number; matchedBy: string[] }>;
    };
    expect(catalogBody.complete).toBe(true);
    expect(catalogBody.candidates).toHaveLength(1);
    expect(catalogBody.candidates[0]).toMatchObject({
      id: 'db_tasks',
      score: 145,
      matchedBy: ['purpose', 'vocabulary'],
    });
    const unchangedCatalog = await call(
      handlers.catalog,
      'GET',
      '/api/databases/catalog?q=work',
      '',
      { 'if-none-match': catalog.headers.etag ?? '' },
    );
    expect(JSON.parse(unchangedCatalog.body)).toEqual({
      notModified: true,
      query: 'work',
      manifestRevision: catalogBody.manifestRevision,
      catalogRevision: catalogBody.catalogRevision,
    });

    const described = await call(
      handlers.describe,
      'POST',
      '/api/databases/describe',
      JSON.stringify({ databaseId: 'db_tasks', sourceId: 'ds_tasks' }),
    );
    expect(described.status).toBe(200);
    expect(described.headers.etag).toMatch(/^"sha256:/);
    const describedBody = JSON.parse(described.body) as Record<string, unknown>;
    expect(describedBody).toMatchObject({
      database: { id: 'db_tasks' },
      source: { id: 'ds_tasks' },
      index: { recordCount: 1 },
    });
    expect(describedBody.schemaRevision).toMatch(/^sha256:/);
    const unchanged = await call(
      handlers.describe,
      'POST',
      '/api/databases/describe',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        ifSchemaRevision: describedBody.schemaRevision,
      }),
    );
    expect(JSON.parse(unchanged.body)).toEqual({
      notModified: true,
      manifestRevision: describedBody.manifestRevision,
      schemaRevision: describedBody.schemaRevision,
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
    });
    const unchangedByHeader = await call(
      handlers.describe,
      'POST',
      '/api/databases/describe',
      JSON.stringify({ databaseId: 'db_tasks', sourceId: 'ds_tasks' }),
      { 'if-none-match': described.headers.etag ?? '' },
    );
    expect(JSON.parse(unchangedByHeader.body)).toEqual(JSON.parse(unchanged.body));

    const lookedUp = await call(
      handlers.record,
      'POST',
      '/api/databases/record',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_first',
      }),
    );
    expect(lookedUp.status).toBe(200);
    expect(lookedUp.headers.etag).toMatch(/^"sha256:/);
    expect(JSON.parse(lookedUp.body)).toMatchObject({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      record: {
        id: 'rec_first',
        path: 'tasks/first.md',
        values: { prop_tasks_title: 'First', prop_tasks_score: 8 },
      },
    });

    const missingRecord = await call(
      handlers.record,
      'POST',
      '/api/databases/record',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_missing',
      }),
    );
    expect(missingRecord.status).toBe(404);
    expect(JSON.parse(missingRecord.body)).toMatchObject({
      code: 'record_not_found',
      recovery: { action: 'restart_query', endpoint: '/api/databases/query' },
    });

    const queried = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        query: {
          select: ['prop_tasks_title'],
          page: { limit: 10 },
          aggregate: {
            groupBy: [{ propertyId: 'prop_tasks_score' }],
            calculations: [
              { id: 'records', function: 'count_all' },
              {
                id: 'score_sum',
                function: 'sum',
                propertyId: 'prop_tasks_score',
              },
            ],
          },
        },
      }),
    );
    expect(queried.status).toBe(200);
    expect(queried.headers.etag).toMatch(/^"sha256:/);
    const queriedBody = JSON.parse(queried.body) as {
      queryId: string;
      recordRevisions: Record<string, string | null>;
      isComplete: boolean;
    } & Record<string, unknown>;
    expect(queriedBody).toMatchObject({
      matched: 1,
      returned: 1,
      permissionExclusions: {
        evaluated: true,
        policyId: 'project-owner',
        records: 0,
        properties: 0,
      },
      resultState: {
        empty: false,
        emptyReason: null,
        permissionFiltered: false,
        partialIndex: false,
        truncated: false,
      },
      trace: {
        source: { databaseId: 'db_tasks', sourceId: 'ds_tasks' },
        filter: { expression: null, propertyIds: [] },
        projection: {
          requestedPropertyIds: ['prop_tasks_title'],
          returnedPropertyIds: ['prop_tasks_title'],
          excludedPropertyIds: [],
        },
        aggregation: {
          appliedAfterPermissionScope: true,
          matched: 1,
          totalGroups: 1,
          returnedGroups: 1,
          truncatedBy: null,
        },
        index: { freshness: 'snapshot', issueCount: 0 },
        truncation: {
          cause: null,
          limit: 10,
          cursorProvided: false,
          nextCursor: null,
        },
      },
      aggregation: {
        matched: 1,
        calculations: [
          { id: 'records', value: 1, unit: 'count' },
          { id: 'score_sum', value: 8, unit: 'number' },
        ],
        totalGroups: 1,
        groups: [{ matched: 1, key: [{ value: 8 }] }],
      },
      records: [{ id: 'rec_first', values: { prop_tasks_title: 'First' } }],
    });
    expect(queriedBody.queryId).toMatch(/^qry_/);
    const savedViewQuery = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        viewId: 'view_tasks_agent',
      }),
    );
    expect(savedViewQuery.status).toBe(200);
    expect(JSON.parse(savedViewQuery.body)).toMatchObject({
      savedQuery: {
        id: 'view_tasks_agent',
        key: 'task-agent',
        sourceId: 'ds_tasks',
        layout: 'agent',
        revision: expect.stringMatching(/^sha256:/),
      },
      trace: { savedQuery: { id: 'view_tasks_agent' } },
    });
    const agentQuery = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        agentViewId: 'view_tasks_agent',
      }),
    );
    expect(agentQuery.status).toBe(200);
    expect(JSON.parse(agentQuery.body)).toMatchObject({
      matched: 1,
      returned: 1,
      agentView: {
        id: 'view_tasks_agent',
        semanticContract: { purpose: 'Prepare a grounded task brief' },
        scope: { maxRecords: 1 },
        writePolicy: { mode: 'read_only' },
      },
      trace: {
        agentView: { id: 'view_tasks_agent' },
        filter: { propertyIds: ['prop_tasks_score'] },
        truncation: { limit: 1 },
      },
    });
    const delta = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        query: {
          select: ['prop_tasks_title'],
          page: { limit: 10 },
          aggregate: {
            groupBy: [{ propertyId: 'prop_tasks_score' }],
            calculations: [
              { id: 'records', function: 'count_all' },
              {
                id: 'score_sum',
                function: 'sum',
                propertyId: 'prop_tasks_score',
              },
            ],
          },
        },
        deltaSince: {
          queryId: queriedBody.queryId,
          recordRevisions: queriedBody.recordRevisions,
          isComplete: queriedBody.isComplete,
        },
      }),
    );
    expect(JSON.parse(delta.body)).toMatchObject({
      delta: {
        addedOrChangedRecordIds: [],
        unchangedRecordIds: ['rec_first'],
        isComplete: true,
      },
    });

    const found = await call(
      handlers.find,
      'POST',
      '/api/databases/find',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'score at least 5 top 1',
      }),
    );
    expect(found.status).toBe(200);
    expect(found.headers.etag).toMatch(/^"sha256:/);
    expect(JSON.parse(found.body)).toMatchObject({
      plan: {
        interpretation: { requiresResolution: false, limit: 1 },
      },
      result: { matched: 1, returned: 1 },
    });
    const lexical = await call(
      handlers.find,
      'POST',
      '/api/databases/find',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'checkout latency',
      }),
    );
    expect({ status: lexical.status, body: lexical.body }).toMatchObject({
      status: 200,
    });
    const lexicalBody = JSON.parse(lexical.body) as {
      retrieval: {
        matched: number;
        hits: Array<{
          recordId: string;
          matchedBy: string[];
          evidence: Array<Record<string, unknown>>;
        }>;
      };
    };
    expect(lexicalBody).toMatchObject({
      retrieval: {
        matched: 1,
        hits: [
          {
            recordId: 'rec_first',
            matchedBy: ['body'],
          },
        ],
      },
    });
    expect(lexicalBody.retrieval.hits[0]?.evidence).toHaveLength(2);
    expect(lexicalBody.retrieval.hits[0]?.evidence[0]).toMatchObject({
      field: 'body',
      start: 0,
      offsetEncoding: 'utf16_code_units',
    });
    expect(lexicalBody.retrieval.hits[0]?.evidence[0]?.id).toMatch(/^ev_/);

    const packed = await call(
      handlers.pack,
      'POST',
      '/api/databases/pack',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        goal: 'Summarize the task list',
        propertyIds: ['prop_tasks_title'],
        maxTokens: 2_000,
        reserveTokens: 100,
        tokenizer: 'utf8_bytes_div3',
        encoding: 'object_rows',
      }),
    );
    expect(packed.status).toBe(200);
    expect(packed.headers.etag).toMatch(/^"sha256:/);
    expect(JSON.parse(packed.body)).toMatchObject({
      encoding: 'object_rows',
      returned: 1,
      disclosure: { level: 'records' },
      relationExpansion: null,
      budget: { maxTokens: 2_000, reserveTokens: 100 },
    });

    const agentPack = await call(
      handlers.pack,
      'POST',
      '/api/databases/pack',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        agentViewId: 'view_tasks_agent',
        goal: 'Use the saved task context contract',
      }),
    );
    expect(agentPack.status).toBe(200);
    expect(JSON.parse(agentPack.body)).toMatchObject({
      agentView: {
        id: 'view_tasks_agent',
        semanticContract: { evidence: 'preferred' },
        writePolicy: { mode: 'read_only' },
      },
      schema: {
        properties: [{ id: 'prop_tasks_title' }, { id: 'prop_tasks_score' }],
      },
      returned: 1,
      budget: {
        maxTokens: 1_000,
        reserveTokens: 100,
        tokenizer: 'utf8_bytes_div3',
      },
    });
    const agentPackBody = JSON.parse(agentPack.body) as { id: string };
    const inspectionList = await call(handlers.inspect, 'GET', '/api/databases/inspect');
    expect(inspectionList.status).toBe(200);
    expect(inspectionList.headers['cache-control']).toBe('no-store');
    const inspectionListBody = JSON.parse(inspectionList.body) as {
      kind: string;
      inspections: Array<Record<string, unknown>>;
    };
    expect(inspectionListBody.kind).toBe('list');
    expect(inspectionListBody.inspections[0]).toMatchObject({
      packId: agentPackBody.id,
      database: { id: 'db_tasks', name: 'Tasks' },
      sourceId: 'ds_tasks',
      tokenCount: { estimated: expect.any(Number), max: 1_000, reserve: 100 },
      redactions: { evaluated: true },
      freshness: { indexState: 'idle', indexFreshness: 'snapshot' },
      truncation: {
        truncated: false,
        cause: null,
        continuationAvailable: false,
      },
    });
    const inspectionDetail = await call(
      handlers.inspect,
      'GET',
      `/api/databases/inspect?packId=${agentPackBody.id}`,
    );
    expect(inspectionDetail.status).toBe(200);
    expect(JSON.parse(inspectionDetail.body)).toMatchObject({
      kind: 'detail',
      inspection: {
        packId: agentPackBody.id,
        exactPack: {
          id: agentPackBody.id,
          agentView: { id: 'view_tasks_agent' },
        },
      },
    });
    const scopedInspectionList = await call(
      handlers.inspect,
      'GET',
      '/api/databases/inspect?databaseId=db_tasks&sourceId=ds_tasks',
    );
    expect(scopedInspectionList.status).toBe(200);
    const scopedInspectionBody = JSON.parse(scopedInspectionList.body) as {
      kind: string;
      inspections: Array<{ database: { id: string }; sourceId: string }>;
    };
    expect(scopedInspectionBody.kind).toBe('list');
    expect(scopedInspectionBody.inspections.length).toBeGreaterThan(0);
    expect(
      scopedInspectionBody.inspections.every(
        (inspection) => inspection.database.id === 'db_tasks' && inspection.sourceId === 'ds_tasks',
      ),
    ).toBe(true);
    const scopedViewInspection = await call(
      handlers.inspect,
      'GET',
      '/api/databases/inspect?viewId=view_tasks_agent',
    );
    expect(scopedViewInspection.status).toBe(200);
    const scopedViewBody = JSON.parse(scopedViewInspection.body) as {
      kind: string;
      inspections: Array<{ agentView: { id: string } | null }>;
    };
    expect(scopedViewBody.kind).toBe('list');
    expect(scopedViewBody.inspections.length).toBeGreaterThan(0);
    expect(
      scopedViewBody.inspections.every(
        (inspection) => inspection.agentView?.id === 'view_tasks_agent',
      ),
    ).toBe(true);
    const scopedRecordInspection = await call(
      handlers.inspect,
      'GET',
      '/api/databases/inspect?recordId=rec_first',
    );
    expect(scopedRecordInspection.status).toBe(200);
    expect(JSON.parse(scopedRecordInspection.body).kind).toBe('list');
    const scopedSelectionInspection = await call(
      handlers.inspect,
      'GET',
      '/api/databases/inspect?recordIds=rec_first',
    );
    expect(scopedSelectionInspection.status).toBe(200);
    expect(JSON.parse(scopedSelectionInspection.body).kind).toBe('list');
    const missingInspection = await call(
      handlers.inspect,
      'GET',
      '/api/databases/inspect?packId=pack_missing',
    );
    expect(missingInspection.status).toBe(404);
    expect(JSON.parse(missingInspection.body)).toMatchObject({
      code: 'context_inspection_not_found',
      recovery: { action: 'restart_query', endpoint: '/api/databases/pack' },
    });

    const relationPack = await call(
      handlers.pack,
      'POST',
      '/api/databases/pack',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        goal: 'Follow related tasks safely',
        propertyIds: ['prop_tasks_title'],
        maxTokens: 2_000,
        tokenizer: 'utf8_bytes_div3',
        encoding: 'object_rows',
        relationExpansion: {
          maxDepth: 2,
          maxRecords: 10,
          maxRecordsPerRelation: 5,
        },
      }),
    );
    expect(relationPack.status).toBe(200);
    expect(JSON.parse(relationPack.body)).toMatchObject({
      returned: 1,
      relationExpansion: {
        complete: true,
        records: [],
        edges: [
          {
            fromRecordId: 'rec_first',
            propertyId: 'prop_tasks_related',
            toRecordId: 'rec_first',
            depth: 1,
          },
        ],
        omitted: { cycles: 1, deduplicatedRecords: 0 },
      },
    });

    const evidencePack = await call(
      handlers.pack,
      'POST',
      '/api/databases/pack',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        goal: 'Ground the latency finding',
        propertyIds: ['prop_tasks_title'],
        maxTokens: 2_000,
        tokenizer: 'utf8_bytes_div3',
        encoding: 'object_rows',
        disclosure: { level: 'evidence', searchText: 'checkout latency' },
      }),
    );
    expect(evidencePack.status).toBe(200);
    const evidencePackBody = JSON.parse(evidencePack.body) as {
      disclosure: { evidence: Array<{ id: string; field: string }> };
    };
    expect(evidencePackBody.disclosure.evidence).toHaveLength(2);
    expect(evidencePackBody.disclosure.evidence[0]).toMatchObject({
      field: 'body',
    });
    expect(evidencePackBody.disclosure.evidence[0]?.id).toMatch(/^ev_/);

    const fullBodyPack = await call(
      handlers.pack,
      'POST',
      '/api/databases/pack',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        goal: 'Read the canonical source after reviewing evidence',
        propertyIds: ['prop_tasks_title'],
        maxTokens: 2_000,
        tokenizer: 'utf8_bytes_div3',
        encoding: 'object_rows',
        disclosure: { level: 'full_body' },
      }),
    );
    expect(fullBodyPack.status).toBe(200);
    expect(JSON.parse(fullBodyPack.body)).toMatchObject({
      disclosure: {
        level: 'full_body',
        fullBodies: [
          {
            recordId: 'rec_first',
            path: 'tasks/first.md',
            body: 'Checkout latency evidence\n',
          },
        ],
      },
    });
  });

  test('previews an unsaved computed property without mutating the stored schema', async () => {
    const { handlers, index, store } = await fixture();
    const current = store.getById('db_tasks');
    if (!current) throw new Error('database fixture missing');
    const formula = {
      id: 'prop_tasks_double',
      key: 'double',
      name: 'Double',
      type: 'formula' as const,
      source: 'prop("score") * 2',
      ast: {
        language: 'synapse-formula-1' as const,
        version: 1 as const,
        resultType: 'number' as const,
        expression: {
          type: 'binary' as const,
          operator: 'multiply' as const,
          left: { type: 'property' as const, propertyId: 'prop_tasks_score' },
          right: {
            type: 'literal' as const,
            valueType: 'number' as const,
            value: 2,
          },
        },
      },
    };
    await store.update(current.id, {
      ...current,
      sources: current.sources.map((source) =>
        source.id === 'ds_tasks'
          ? { ...source, properties: [...source.properties, formula] }
          : source,
      ),
    });
    await index.rebuild();

    const previewed = await call(
      handlers.computedPropertyPreview,
      'POST',
      '/api/databases/computed-preview',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_first',
        property: {
          ...formula,
          source: 'prop("score") * 3',
          ast: {
            ...formula.ast,
            expression: {
              ...formula.ast.expression,
              right: { type: 'literal', valueType: 'number', value: 3 },
            },
          },
        },
      }),
    );
    expect(previewed.status).toBe(200);
    expect(JSON.parse(previewed.body)).toMatchObject({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      recordId: 'rec_first',
      propertyId: 'prop_tasks_double',
      result: { kind: 'value', valueType: 'number', value: 24 },
    });
    expect(
      store
        .getById('db_tasks')
        ?.sources[0]?.properties.find((property) => property.id === 'prop_tasks_double'),
    ).toMatchObject({ source: 'prop("score") * 2' });
  });

  test('returns validated problem details for malformed, missing, and stale requests', async () => {
    const { handlers, store } = await fixture();
    const malformed = await call(handlers.describe, 'POST', '/api/databases/describe', '{}');
    expect(malformed.status).toBe(400);
    expect(malformed.headers['content-type']).toBe('application/problem+json');
    expect(JSON.parse(malformed.body)).toMatchObject({
      code: 'invalid_request',
      retryable: false,
      recovery: { action: 'fix_request' },
    });
    const unknownField = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        mystery: true,
      }),
    );
    expect(unknownField.status).toBe(400);
    expect(JSON.parse(unknownField.body)).toMatchObject({
      code: 'invalid_request',
      unknownFields: ['mystery'],
      validationIssues: [
        {
          code: 'unrecognized_keys',
          path: [],
          message: expect.stringContaining('mystery'),
        },
      ],
      recovery: { action: 'fix_request' },
    });
    const malformedCatalogRevision = await call(
      handlers.catalog,
      'GET',
      '/api/databases/catalog?ifCatalogRevision=stale',
    );
    expect(malformedCatalogRevision.status).toBe(400);
    expect(JSON.parse(malformedCatalogRevision.body)).toMatchObject({
      code: 'invalid_query',
      retryable: false,
      recovery: { action: 'fix_request' },
    });
    const oversizedLexicalQuery = await call(
      handlers.find,
      'POST',
      '/api/databases/find',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: Array.from({ length: 17 }, (_, index) => `term-${index}`).join(' '),
      }),
    );
    expect(oversizedLexicalQuery.status).toBe(413);
    expect(JSON.parse(oversizedLexicalQuery.body)).toMatchObject({
      type: 'urn:ok:error:payload-too-large',
      code: 'resource_limit',
      observedTerms: 17,
      maximumTerms: 16,
      recovery: { action: 'reduce_request' },
    });

    const missing = await call(
      handlers.describe,
      'POST',
      '/api/databases/describe',
      JSON.stringify({ databaseId: 'db_missing' }),
    );
    expect(missing.status).toBe(404);
    expect(JSON.parse(missing.body)).toMatchObject({
      type: 'urn:ok:error:not-found',
      code: 'database_not_found',
      retryable: false,
      recovery: {
        action: 'refresh_catalog',
        endpoint: '/api/databases/catalog',
      },
      candidates: [{ id: 'db_tasks' }],
    });

    const unknownProperty = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        query: {
          where: { propertyId: 'prop_unknown', operator: 'eq', value: 'x' },
        },
      }),
    );
    expect(unknownProperty.status).toBe(400);
    expect(JSON.parse(unknownProperty.body)).toMatchObject({
      code: 'unknown_property',
      recovery: {
        action: 'refresh_schema',
        endpoint: '/api/databases/describe',
      },
      propertyId: 'prop_unknown',
      candidates: [
        { id: 'prop_tasks_title', key: 'title', name: 'Title' },
        { id: 'prop_tasks_score', key: 'score', name: 'Score' },
        { id: 'prop_tasks_code', key: 'code', name: 'Code' },
        { id: 'prop_tasks_related', key: 'related', name: 'Related tasks' },
      ],
    });

    const invalidFilter = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        query: {
          where: {
            propertyId: 'prop_tasks_score',
            operator: 'contains',
            value: 8,
          },
        },
      }),
    );
    expect(invalidFilter.status).toBe(400);
    expect(JSON.parse(invalidFilter.body)).toMatchObject({
      code: 'invalid_operator',
      recovery: { action: 'fix_request' },
      propertyId: 'prop_tasks_score',
      propertyType: 'number',
      allowedOperators: expect.arrayContaining(['eq', 'gte', 'lte']),
    });

    const invalidRelationProjection = await call(
      handlers.pack,
      'POST',
      '/api/databases/pack',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        goal: 'Follow relations',
        maxTokens: 2_000,
        tokenizer: 'utf8_bytes_div3',
        encoding: 'object_rows',
        relationExpansion: {
          maxDepth: 1,
          maxRecords: 10,
          maxRecordsPerRelation: 5,
          projections: [{ sourceId: 'ds_tasks', propertyIds: ['prop_missing'] }],
        },
      }),
    );
    expect(invalidRelationProjection.status).toBe(400);
    const invalidRelationProblem = JSON.parse(invalidRelationProjection.body);
    expect(invalidRelationProblem).toMatchObject({
      code: 'unknown_relation_projection_property',
      recovery: {
        action: 'refresh_schema',
        endpoint: '/api/databases/describe',
      },
      sourceId: 'ds_tasks',
      unknownPropertyIds: ['prop_missing'],
    });
    expect(invalidRelationProblem.candidates).toEqual(
      expect.arrayContaining([{ id: 'prop_tasks_title', key: 'title', name: 'Title' }]),
    );

    const missingAgentView = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        agentViewId: 'view_missing',
      }),
    );
    expect(missingAgentView.status).toBe(404);
    expect(JSON.parse(missingAgentView.body)).toMatchObject({
      code: 'agent_view_not_found',
      recovery: { action: 'refresh_schema' },
      candidates: [{ id: 'view_tasks_agent' }],
    });

    const outsideAgentView = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        agentViewId: 'view_tasks_agent',
        query: { select: ['prop_tasks_related'] },
      }),
    );
    expect(outsideAgentView.status).toBe(400);
    expect(JSON.parse(outsideAgentView.body)).toMatchObject({
      code: 'agent_view_scope_violation',
      deniedPropertyIds: ['prop_tasks_related'],
      allowedPropertyIds: ['prop_tasks_title', 'prop_tasks_score'],
      recovery: { action: 'fix_request' },
    });

    const agentBudget = await call(
      handlers.pack,
      'POST',
      '/api/databases/pack',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        agentViewId: 'view_tasks_agent',
        goal: 'Exceed the saved budget',
        maxTokens: 2_000,
      }),
    );
    expect(agentBudget.status).toBe(400);
    expect(JSON.parse(agentBudget.body)).toMatchObject({
      code: 'agent_view_budget_exceeded',
      requestedMaxTokens: 2_000,
      maxTokens: 1_000,
      recovery: { action: 'fix_request' },
    });

    const database = store.getById('db_tasks');
    if (!database) throw new Error('fixture database missing');
    await store.update('db_tasks', { ...database, name: 'Renamed tasks' });
    const stale = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({ databaseId: 'db_tasks', sourceId: 'ds_tasks' }),
    );
    expect(stale.status).toBe(503);
    expect(JSON.parse(stale.body)).toMatchObject({
      type: 'urn:ok:error:stale-target',
      code: 'stale_index',
      retryable: true,
      recovery: { action: 'rebuild_index', retryAfterMs: 500 },
      indexRevision: expect.any(String),
      indexManifestRevision: expect.any(String),
      manifestRevision: expect.any(String),
    });
  });

  test('returns exact permission denial scope and access recovery', async () => {
    const { handlers } = await fixture(() => ({
      policyId: 'agent-view-public',
      policyRevision: `sha256:${'e'.repeat(64)}`,
      allowedRecordIds: null,
      allowedPropertyIds: ['prop_tasks_title'],
    }));
    const scoped = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        query: {
          select: ['prop_tasks_title'],
          aggregate: {
            calculations: [{ id: 'records', function: 'count_all' }],
          },
        },
      }),
    );
    expect(scoped.status).toBe(200);
    expect(JSON.parse(scoped.body)).toMatchObject({
      resultState: { permissionFiltered: true, partialIndex: false },
      trace: {
        projection: {
          requestedPropertyIds: ['prop_tasks_title'],
          returnedPropertyIds: ['prop_tasks_title'],
          excludedPropertyIds: [],
        },
        permission: { properties: 3 },
        aggregation: { appliedAfterPermissionScope: true, matched: 1 },
      },
      aggregation: { matched: 1, calculations: [{ id: 'records', value: 1 }] },
    });
    const scopedRecord = await call(
      handlers.record,
      'POST',
      '/api/databases/record',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_first',
      }),
    );
    expect(scopedRecord.status).toBe(200);
    expect(JSON.parse(scopedRecord.body)).toMatchObject({
      record: { id: 'rec_first', values: { prop_tasks_title: 'First' } },
    });
    expect(Object.keys(JSON.parse(scopedRecord.body).record.values)).toEqual(['prop_tasks_title']);
    const denied = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        query: {
          sort: [{ propertyId: 'prop_tasks_score', direction: 'desc' }],
        },
      }),
    );
    expect(denied.status).toBe(403);
    expect(JSON.parse(denied.body)).toMatchObject({
      type: 'urn:ok:error:permission-denied',
      code: 'permission_denied',
      retryable: false,
      policyId: 'agent-view-public',
      policyRevision: `sha256:${'e'.repeat(64)}`,
      deniedPropertyIds: ['prop_tasks_score'],
      allowedPropertyIds: ['prop_tasks_title'],
      recovery: {
        action: 'request_access',
        endpoint: '/api/databases/describe',
      },
    });
    const deniedAggregation = await call(
      handlers.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        query: {
          aggregate: {
            calculations: [
              {
                id: 'score_sum',
                function: 'sum',
                propertyId: 'prop_tasks_score',
              },
            ],
          },
        },
      }),
    );
    expect(deniedAggregation.status).toBe(403);
    expect(JSON.parse(deniedAggregation.body)).toMatchObject({
      code: 'permission_denied',
      deniedPropertyIds: ['prop_tasks_score'],
      recovery: {
        action: 'request_access',
        instruction: expect.stringContaining('calculation'),
      },
    });

    const scopedRelationPack = await call(
      handlers.pack,
      'POST',
      '/api/databases/pack',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        goal: 'Follow readable relations',
        propertyIds: ['prop_tasks_title'],
        maxTokens: 2_000,
        tokenizer: 'utf8_bytes_div3',
        encoding: 'object_rows',
        relationExpansion: {
          maxDepth: 2,
          maxRecords: 10,
          maxRecordsPerRelation: 5,
        },
      }),
    );
    expect(scopedRelationPack.status).toBe(200);
    expect(JSON.parse(scopedRelationPack.body)).toMatchObject({
      returned: 1,
      relationExpansion: {
        complete: false,
        records: [],
        edges: [],
        omitted: { permissionRecords: 0, permissionProperties: 1 },
      },
    });

    const { handlers: rowScopedHandlers } = await fixture(() => ({
      policyId: 'agent-empty-row-scope',
      policyRevision: `sha256:${'f'.repeat(64)}`,
      allowedRecordIds: [],
      allowedPropertyIds: ['prop_tasks_title'],
    }));
    const scopedFind = await call(
      rowScopedHandlers.find,
      'POST',
      '/api/databases/find',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'checkout latency',
      }),
    );
    expect(scopedFind.status).toBe(200);
    expect(JSON.parse(scopedFind.body)).toMatchObject({
      retrieval: {
        matched: 0,
        returned: 0,
        hits: [],
        permissionExclusions: {
          policyId: 'agent-empty-row-scope',
          records: 1,
          properties: 3,
        },
        resultState: {
          empty: true,
          emptyReason: 'permission_filtered',
          permissionFiltered: true,
          truncated: false,
        },
        trace: {
          termStats: [
            { term: 'checkout', indexedRecords: 0, scopedRecords: 0 },
            { term: 'latency', indexedRecords: 0, scopedRecords: 0 },
          ],
        },
      },
    });
    const deniedRecord = await call(
      rowScopedHandlers.record,
      'POST',
      '/api/databases/record',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_first',
      }),
    );
    expect(deniedRecord.status).toBe(403);
    expect(JSON.parse(deniedRecord.body)).toMatchObject({
      code: 'permission_denied',
      recordId: 'rec_first',
      recovery: { action: 'request_access' },
    });
  });

  test('adds recovery metadata to method and availability failures', async () => {
    const unavailable = createDatabaseDataPlaneApiHandlers();
    const missingService = await call(
      unavailable.query,
      'POST',
      '/api/databases/query',
      JSON.stringify({ databaseId: 'db_tasks', sourceId: 'ds_tasks' }),
    );
    expect(missingService.status).toBe(503);
    expect(JSON.parse(missingService.body)).toMatchObject({
      code: 'data_plane_unavailable',
      retryable: true,
      recovery: { action: 'retry', retryAfterMs: 1_000 },
    });
    const missingTaskStore = await call(
      unavailable.task,
      'POST',
      '/api/databases/task',
      JSON.stringify({ action: 'list' }),
    );
    expect(missingTaskStore.status).toBe(503);
    expect(JSON.parse(missingTaskStore.body)).toMatchObject({
      code: 'data_plane_unavailable',
      retryable: true,
    });

    const { handlers } = await fixture();
    const wrongMethod = await call(handlers.query, 'GET', '/api/databases/query');
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.allow).toBe('POST');
    expect(JSON.parse(wrongMethod.body)).toMatchObject({
      code: 'method_not_allowed',
      retryable: false,
      recovery: { action: 'use_allowed_method' },
    });

    const malformedSuccess = createDatabaseDataPlaneApiHandlers({
      catalog: () => ({ broken: true }),
    } as unknown as DatabaseDataPlane);
    const contractFailure = await call(malformedSuccess.catalog, 'GET', '/api/databases/catalog');
    expect(contractFailure.status).toBe(500);
    expect(JSON.parse(contractFailure.body)).toMatchObject({
      code: 'internal_error',
      retryable: true,
      recovery: { action: 'retry' },
    });
  });

  test('creates ephemeral desired-state drafts and immutable plans without Git noise', async () => {
    const { handlers, projectDir } = await fixture();
    const desiredState = {
      database: {
        key: 'proposed-tasks',
        name: 'Proposed tasks',
        contract: {
          purpose: 'Preview a database before commit',
          canonicality: 'canonical',
          vocabulary: ['task'],
          freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
          sensitivity: 'internal',
        },
      },
      sources: [
        {
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One proposed task',
          folder: 'proposed-tasks',
          properties: [{ key: 'title', name: 'Title', type: 'title', required: true }],
        },
      ],
      views: [],
      sampleRecords: [
        {
          sourceKey: 'tasks',
          values: { title: 'Preview only' },
          body: 'Not written yet.',
        },
      ],
    };
    const drafted = await call(
      handlers.plan,
      'POST',
      '/api/databases/plan',
      JSON.stringify({ action: 'create_draft', desiredState, ttlSeconds: 600 }),
    );
    expect(drafted.status).toBe(200);
    const draftedBody = JSON.parse(drafted.body) as {
      draft: { id: string; revision: string };
    };
    expect(draftedBody.draft.id).toMatch(/^draft_/);
    expect(draftedBody.draft.revision).toMatch(/^sha256:/);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'proposed-tasks.yml'))).toBe(false);

    const planned = await call(
      handlers.plan,
      'POST',
      '/api/databases/plan',
      JSON.stringify({
        action: 'create_plan',
        draftId: draftedBody.draft.id,
        ttlSeconds: 300,
      }),
    );
    expect(planned.status).toBe(200);
    const plannedBody = JSON.parse(planned.body) as {
      plan: {
        id: string;
        hash: string;
        snapshotRevision: string;
        immutableTargetSet: string[];
        committable: boolean;
      };
    };
    expect(plannedBody.plan).toMatchObject({
      id: expect.stringMatching(/^plan_/),
      hash: expect.stringMatching(/^sha256:/),
      snapshotRevision: expect.stringMatching(/^sha256:/),
      committable: true,
    });
    expect(plannedBody.plan.immutableTargetSet.length).toBeGreaterThan(2);
    expect(existsSync(join(projectDir, '.ok', 'databases', 'proposed-tasks.yml'))).toBe(false);

    const discarded = await call(
      handlers.plan,
      'POST',
      '/api/databases/plan',
      JSON.stringify({ action: 'discard_draft', draftId: draftedBody.draft.id }),
    );
    expect(JSON.parse(discarded.body)).toEqual({
      action: 'discard_draft',
      discarded: true,
      draftId: draftedBody.draft.id,
    });
  });

  test('plans, commits, and undoes complete database deletion through versioned endpoints', async () => {
    const { handlers, store, projectDir, contentDir, index } = await fixture();
    const manifestPath = join(projectDir, '.ok', 'databases', 'tasks.yml');
    const recordPath = join(contentDir, 'tasks', 'first.md');
    const manifestBefore = readFileSync(manifestPath, 'utf8');
    const recordBefore = readFileSync(recordPath, 'utf8');

    const drafted = await call(
      handlers.plan,
      'POST',
      '/api/databases/plan',
      JSON.stringify({
        action: 'create_database_deletion_draft',
        databaseId: 'db_tasks',
        expectedSnapshotRevision: store.snapshot().revision,
      }),
    );
    expect(drafted.status, drafted.body).toBe(200);
    const draftId = (JSON.parse(drafted.body) as { draft: { id: string } }).draft.id;
    const planned = await call(
      handlers.plan,
      'POST',
      '/api/databases/plan',
      JSON.stringify({ action: 'create_plan', draftId }),
    );
    expect(planned.status, planned.body).toBe(200);
    const plan = (
      JSON.parse(planned.body) as {
        plan: { id: string; hash: string; snapshotRevision: string; committable: boolean };
      }
    ).plan;
    expect(plan.committable).toBe(true);

    const committed = await call(
      handlers.commit,
      'POST',
      '/api/databases/commit',
      JSON.stringify({
        planId: plan.id,
        planHash: plan.hash,
        expectedSnapshotRevision: plan.snapshotRevision,
        idempotencyKey: 'api-database-delete-0001',
        approvalToken: `approve:${plan.hash}`,
        actor: { principalId: 'human:owner', kind: 'human' },
      }),
    );
    expect(committed.status, committed.body).toBe(200);
    const undoToken = (JSON.parse(committed.body) as { undoToken: string }).undoToken;
    expect(store.getById('db_tasks')).toBeNull();
    expect(index.list('db_tasks')).toEqual([]);
    expect(existsSync(manifestPath)).toBe(false);
    expect(existsSync(recordPath)).toBe(false);

    const undone = await call(
      handlers.undo,
      'POST',
      '/api/databases/undo',
      JSON.stringify({
        action: 'apply',
        undoToken,
        idempotencyKey: 'api-database-delete-undo-0001',
        actor: { principalId: 'human:owner', kind: 'human' },
      }),
    );
    expect(undone.status, undone.body).toBe(200);
    expect(readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
    expect(readFileSync(recordPath, 'utf8')).toBe(recordBefore);
    expect(store.getById('db_tasks')?.id).toBe('db_tasks');
    expect(index.list('db_tasks')).toHaveLength(1);
  });

  test('automatically commits only within a token-bound cumulative delegation budget', async () => {
    const { handlers, projectDir } = await fixture();
    const drafted = await call(
      handlers.plan,
      'POST',
      '/api/databases/plan',
      JSON.stringify({
        action: 'create_draft',
        desiredState: {
          database: {
            id: 'db_autonomy_tasks',
            key: 'autonomy-tasks',
            name: 'Autonomy tasks',
            contract: {
              purpose: 'Exercise delegated automatic commits',
              canonicality: 'canonical',
              vocabulary: ['task'],
              freshness: { expectation: 'realtime' },
              sensitivity: 'internal',
            },
          },
          sources: [
            {
              id: 'ds_autonomy_tasks',
              key: 'tasks',
              name: 'Tasks',
              recordMeaning: 'One delegated task',
              folder: 'autonomy-tasks',
              properties: [
                {
                  id: 'prop_autonomy_title',
                  key: 'title',
                  name: 'Title',
                  type: 'title',
                  required: true,
                },
              ],
            },
          ],
          views: [],
          sampleRecords: [
            {
              id: 'rec_autonomy_first',
              sourceKey: 'tasks',
              values: { title: 'Delegated' },
              body: 'Within the explicit body scope.\n',
            },
          ],
        },
      }),
    );
    const draftId = (JSON.parse(drafted.body) as { draft: { id: string } }).draft.id;
    const planned = await call(
      handlers.plan,
      'POST',
      '/api/databases/plan',
      JSON.stringify({ action: 'create_plan', draftId }),
    );
    const plan = (
      JSON.parse(planned.body) as {
        plan: { id: string; hash: string; snapshotRevision: string };
      }
    ).plan;
    const databasePolicy = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'set_database',
        databaseId: 'db_autonomy_tasks',
        mode: 'autonomous',
        expectedRevision: 'sha256:empty',
      }),
    );
    const databaseRevision = (JSON.parse(databasePolicy.body) as { revision: string }).revision;
    const sessionPolicy = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'set_session',
        sessionId: 'session-autonomy-http',
        mode: 'autonomous',
        expectedRevision: databaseRevision,
        delegation: {
          databaseIds: ['db_autonomy_tasks'],
          actions: ['create_database', 'create_record'],
          propertyIds: ['prop_autonomy_title'],
          allowBody: true,
          maxRecordsPerAction: 1,
          maxRecordsTotal: 1,
          maxActionsTotal: 2,
          maxEgressBytesTotal: 0,
          expiresAt: '2026-07-20T01:00:00.000Z',
        },
      }),
    );
    const session = JSON.parse(sessionPolicy.body) as {
      sessionToken: string;
      revision: string;
    };
    const commitInput = {
      planId: plan.id,
      planHash: plan.hash,
      expectedSnapshotRevision: plan.snapshotRevision,
      idempotencyKey: 'autonomy-http-commit-0001',
      actor: {
        principalId: 'agent:http-autonomy',
        kind: 'agent',
        sessionId: 'session-autonomy-http',
      },
      assertions: { databaseAbsent: true, createdRecords: 1 },
    };
    const missingToken = await call(
      handlers.commit,
      'POST',
      '/api/databases/commit',
      JSON.stringify(commitInput),
    );
    expect(missingToken.status).toBe(403);
    expect(JSON.parse(missingToken.body)).toMatchObject({
      code: 'approval_required',
      recovery: { action: 'request_approval' },
    });

    const committed = await call(
      handlers.commit,
      'POST',
      '/api/databases/commit',
      JSON.stringify({
        ...commitInput,
        autonomySessionToken: session.sessionToken,
      }),
    );
    expect(committed.status, committed.body).toBe(200);
    expect(JSON.parse(committed.body)).toMatchObject({
      idempotentReplay: false,
      verification: { status: 'passed' },
    });
    expect(existsSync(join(projectDir, '.ok', 'databases', 'autonomy-tasks.yml'))).toBe(true);

    const inspected = await call(
      handlers.autonomy,
      'POST',
      '/api/databases/autonomy',
      JSON.stringify({
        action: 'get',
        databaseId: 'db_autonomy_tasks',
        sessionId: 'session-autonomy-http',
      }),
    );
    expect(JSON.parse(inspected.body)).toMatchObject({
      revision: session.revision,
      usage: { records: 1, actions: 2, egressBytes: 0 },
    });

    const listedRuns = await call(
      handlers.runs,
      'POST',
      '/api/databases/runs',
      JSON.stringify({ action: 'list' }),
    );
    expect(listedRuns.status).toBe(200);
    const runSummary = (
      JSON.parse(listedRuns.body) as {
        runs: Array<{
          id: string;
          state: string;
          undo: { available: boolean };
        }>;
      }
    ).runs[0];
    expect(runSummary).toMatchObject({
      state: 'succeeded',
      undo: { available: true },
    });
    expect(listedRuns.body).not.toContain('undo_');
    const runDetail = await call(
      handlers.runs,
      'POST',
      '/api/databases/runs',
      JSON.stringify({ action: 'get', runId: runSummary?.id }),
    );
    expect(JSON.parse(runDetail.body)).toMatchObject({
      action: 'get',
      run: {
        state: 'succeeded',
        intent: { rawPromptStored: false },
        proposedDiff: { complete: true },
        execution: {
          mutationId: expect.stringMatching(/^mut_/),
          actualDiff: expect.any(Array),
        },
        verification: { status: 'passed' },
        undo: { available: true, token: expect.stringMatching(/^undo_/) },
      },
    });
    expect(runDetail.body).not.toContain('Private planning prompt');

    const implicitRetention = await call(
      handlers.runs,
      'POST',
      '/api/databases/runs',
      JSON.stringify({
        action: 'retain_prompt',
        runId: runSummary?.id,
        prompt: 'Private planning prompt',
        ttlSeconds: 60,
      }),
    );
    expect(implicitRetention.status).toBe(400);

    const retained = await call(
      handlers.runs,
      'POST',
      '/api/databases/runs',
      JSON.stringify({
        action: 'retain_prompt',
        runId: runSummary?.id,
        prompt: 'Private planning prompt',
        consent: true,
        ttlSeconds: 60,
      }),
    );
    expect(retained.status).toBe(200);
    expect(JSON.parse(retained.body)).toMatchObject({
      action: 'retain_prompt',
      retention: {
        runId: runSummary?.id,
        storage: 'process_memory',
        expiresAt: '2026-07-20T00:01:00.000Z',
      },
    });
    expect(retained.body).not.toContain('Private planning prompt');

    const retrievedPrompt = await call(
      handlers.runs,
      'POST',
      '/api/databases/runs',
      JSON.stringify({ action: 'get_prompt', runId: runSummary?.id }),
    );
    expect(JSON.parse(retrievedPrompt.body)).toMatchObject({
      action: 'get_prompt',
      retention: { prompt: 'Private planning prompt' },
    });
    const deletedPrompt = await call(
      handlers.runs,
      'POST',
      '/api/databases/runs',
      JSON.stringify({ action: 'delete_prompt', runId: runSummary?.id }),
    );
    expect(JSON.parse(deletedPrompt.body)).toEqual({
      action: 'delete_prompt',
      runId: runSummary?.id,
      deleted: true,
    });
  });

  test('previews and applies an exact approved repair over the HTTP contract', async () => {
    const { handlers, contentDir, index } = await fixture();
    const recordPath = join(contentDir, 'tasks', 'first.md');
    writeFileSync(
      recordPath,
      '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_first\ntitle: First\nscore: invalid\n---\nCheckout latency evidence\n',
    );
    await index.rebuild();

    const previewed = await call(
      handlers.repair,
      'POST',
      '/api/databases/repair',
      JSON.stringify({ action: 'preview' }),
    );
    expect(previewed.status).toBe(200);
    const plan = (
      JSON.parse(previewed.body) as {
        action: 'preview';
        plan: {
          id: string;
          hash: string;
          committable: boolean;
          summary: unknown;
        };
      }
    ).plan;
    expect(plan).toMatchObject({
      committable: true,
      summary: { invalidValues: 1, recordRewrites: 1, blocked: 0 },
    });

    const apply = {
      action: 'apply',
      planId: plan.id,
      planHash: plan.hash,
      approvalToken: `approve:${plan.hash}`,
      idempotencyKey: 'http-repair-request-0001',
      principalId: 'agent:repair-test',
    };
    const applied = await call(
      handlers.repair,
      'POST',
      '/api/databases/repair',
      JSON.stringify(apply),
    );
    expect({
      status: applied.status,
      body: JSON.parse(applied.body),
    }).toMatchObject({
      status: 200,
      body: {
        action: 'apply',
        result: {
          idempotentReplay: false,
          receipt: {
            planId: plan.id,
            principalId: 'agent:repair-test',
            rewrittenPaths: ['tasks/first.md'],
          },
        },
      },
    });
    expect(index.getById('rec_first')?.values).toEqual({
      prop_tasks_title: 'First',
    });

    const replay = await call(
      handlers.repair,
      'POST',
      '/api/databases/repair',
      JSON.stringify(apply),
    );
    expect(JSON.parse(replay.body)).toMatchObject({
      action: 'apply',
      result: { idempotentReplay: true },
    });
  });

  test('commits only an exactly approved plan and replays an idempotent HTTP request', async () => {
    const { handlers, projectDir, snapshotCount } = await fixture();
    const desiredState = {
      database: {
        key: 'approved-tasks',
        name: 'Approved tasks',
        contract: {
          purpose: 'Commit a reviewed database plan',
          canonicality: 'canonical',
          vocabulary: ['task'],
          freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
          sensitivity: 'internal',
        },
      },
      sources: [
        {
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One approved task',
          folder: 'approved-tasks',
          properties: [{ key: 'title', name: 'Title', type: 'title', required: true }],
        },
      ],
      views: [],
      templates: [],
      sampleRecords: [
        {
          sourceKey: 'tasks',
          values: { title: 'Approved' },
          body: 'Exact plan only.\n',
        },
      ],
    };
    const drafted = await call(
      handlers.plan,
      'POST',
      '/api/databases/plan',
      JSON.stringify({ action: 'create_draft', desiredState }),
    );
    const draft = JSON.parse(drafted.body) as { draft: { id: string } };
    const planned = await call(
      handlers.plan,
      'POST',
      '/api/databases/plan',
      JSON.stringify({ action: 'create_plan', draftId: draft.draft.id }),
    );
    const plan = (
      JSON.parse(planned.body) as {
        plan: { id: string; hash: string; snapshotRevision: string };
      }
    ).plan;
    const input = {
      planId: plan.id,
      planHash: plan.hash,
      expectedSnapshotRevision: plan.snapshotRevision,
      idempotencyKey: 'http-commit-request-0001',
      approvalToken: `approve:${plan.hash}`,
      actor: {
        principalId: 'agent:api-test',
        kind: 'agent',
        sessionId: 'session-http',
      },
      assertions: { databaseAbsent: true, createdRecords: 1 },
    };

    const committed = await call(
      handlers.commit,
      'POST',
      '/api/databases/commit',
      JSON.stringify(input),
    );
    expect(committed.status).toBe(200);
    const result = JSON.parse(committed.body) as {
      mutationId: string;
      idempotentReplay: boolean;
      verification: { status: string };
      undoToken: string;
    };
    const mutationId = result.mutationId;
    const undoToken = result.undoToken;
    expect(result).toMatchObject({
      mutationId: expect.stringMatching(/^mut_/),
      idempotentReplay: false,
      verification: { status: 'passed' },
      undoToken: expect.stringMatching(/^undo_/),
    });
    expect(existsSync(join(projectDir, '.ok', 'databases', 'approved-tasks.yml'))).toBe(true);
    expect(snapshotCount()).toBe(2);

    const replayed = await call(
      handlers.commit,
      'POST',
      '/api/databases/commit',
      JSON.stringify(input),
    );
    expect(replayed.status).toBe(200);
    expect(JSON.parse(replayed.body)).toMatchObject({
      mutationId,
      idempotentReplay: true,
    });
    expect(snapshotCount()).toBe(2);

    const rejected = await call(
      handlers.commit,
      'POST',
      '/api/databases/commit',
      JSON.stringify({
        ...input,
        idempotencyKey: 'http-commit-request-0002',
        approvalToken: `approve:sha256:${'0'.repeat(64)}`,
      }),
    );
    expect({
      status: rejected.status,
      body: JSON.parse(rejected.body),
    }).toMatchObject({
      status: 403,
      body: {
        type: 'urn:ok:error:invalid-request',
        code: 'approval_required',
      },
    });

    const previewedUndo = await call(
      handlers.undo,
      'POST',
      '/api/databases/undo',
      JSON.stringify({ action: 'preview', undoToken }),
    );
    expect({
      status: previewedUndo.status,
      body: JSON.parse(previewedUndo.body),
    }).toMatchObject({
      status: 200,
      body: {
        action: 'preview',
        mutationId,
        canApply: true,
        conflicts: [],
        receipt: null,
      },
    });
    const undoInput = {
      action: 'apply',
      undoToken,
      idempotencyKey: 'http-undo-request-0001',
      actor: {
        principalId: 'agent:api-test',
        kind: 'agent',
        sessionId: 'session-http',
      },
    };
    const appliedUndo = await call(
      handlers.undo,
      'POST',
      '/api/databases/undo',
      JSON.stringify(undoInput),
    );
    expect(appliedUndo.status).toBe(200);
    expect(JSON.parse(appliedUndo.body)).toMatchObject({
      action: 'apply',
      mutationId,
      canApply: true,
      idempotentReplay: false,
      receipt: { status: 'applied' },
    });
    expect(existsSync(join(projectDir, '.ok', 'databases', 'approved-tasks.yml'))).toBe(false);
    expect(snapshotCount()).toBe(3);

    const replayedUndo = await call(
      handlers.undo,
      'POST',
      '/api/databases/undo',
      JSON.stringify(undoInput),
    );
    expect(JSON.parse(replayedUndo.body)).toMatchObject({
      mutationId,
      idempotentReplay: true,
    });
    expect(snapshotCount()).toBe(3);

    const previewedRedo = await call(
      handlers.undo,
      'POST',
      '/api/databases/undo',
      JSON.stringify({ action: 'redo_preview', undoToken }),
    );
    expect({
      status: previewedRedo.status,
      body: JSON.parse(previewedRedo.body),
    }).toMatchObject({
      status: 200,
      body: {
        action: 'redo_preview',
        mutationId,
        canApply: true,
        conflicts: [],
        receipt: null,
      },
    });
    const redoInput = {
      action: 'redo_apply',
      undoToken,
      idempotencyKey: 'http-redo-request-0001',
      actor: {
        principalId: 'agent:api-test',
        kind: 'agent',
        sessionId: 'session-http',
      },
    };
    const appliedRedo = await call(
      handlers.undo,
      'POST',
      '/api/databases/undo',
      JSON.stringify(redoInput),
    );
    expect(appliedRedo.status).toBe(200);
    expect(JSON.parse(appliedRedo.body)).toMatchObject({
      action: 'redo_apply',
      mutationId,
      canApply: true,
      idempotentReplay: false,
      receipt: { status: 'applied' },
    });
    expect(existsSync(join(projectDir, '.ok', 'databases', 'approved-tasks.yml'))).toBe(true);
    expect(snapshotCount()).toBe(4);

    const replayedRedo = await call(
      handlers.undo,
      'POST',
      '/api/databases/undo',
      JSON.stringify(redoInput),
    );
    expect(JSON.parse(replayedRedo.body)).toMatchObject({
      mutationId,
      idempotentReplay: true,
      receipt: { status: 'applied' },
    });
    expect(snapshotCount()).toBe(4);
  });

  test('R-010: diagnostics aggregates index state, issues, schema revisions, tasks, and telemetry without leaking record content', async () => {
    const { handlers } = await fixture();

    // Exercise a context-pack capture so the telemetry section reflects a
    // real event, not just zeros.
    const pack = await call(
      handlers.pack,
      'POST',
      '/api/databases/pack',
      JSON.stringify({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        agentViewId: 'view_tasks_agent',
        goal: 'Use the saved task context contract',
      }),
    );
    expect(pack.status).toBe(200);

    const result = await call(handlers.diagnostics, 'GET', '/api/databases/diagnostics');
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');

    const body = JSON.parse(result.body) as {
      index: { state: string; recordCount: number; issueCount: number };
      issues: { total: number; byCode: Record<string, number>; sample: unknown[] };
      schemas: Array<{ databaseId: string; key: string; name: string; schemaRevision: string }>;
      tasks: unknown[];
      telemetry: Record<string, number>;
    };

    expect(body.index).toMatchObject({ state: 'idle', recordCount: 1, issueCount: 0 });
    expect(body.issues).toEqual({ total: 0, byCode: {}, sample: [] });
    expect(body.schemas).toEqual([
      {
        databaseId: 'db_tasks',
        key: 'tasks',
        name: 'Tasks',
        schemaRevision: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    ]);
    expect(body.tasks).toEqual([]);
    expect(body.telemetry.contextPackCaptureCount).toBeGreaterThanOrEqual(1);
    for (const value of Object.values(body.telemetry)) {
      expect(typeof value).toBe('number');
    }

    // Content-free contract: never the record title, its body text, or any
    // property value — only stable IDs, counts, revisions, and timestamps.
    expect(result.body).not.toContain('First');
    expect(result.body).not.toContain('Checkout latency evidence');
  });

  test('R-010: diagnostics is unavailable when the data plane is not configured', async () => {
    const unavailable = createDatabaseDataPlaneApiHandlers();
    const result = await call(unavailable.diagnostics, 'GET', '/api/databases/diagnostics');
    expect(result.status).toBe(503);
  });
});
