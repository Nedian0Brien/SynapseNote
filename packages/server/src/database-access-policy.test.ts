import { describe, expect, test } from 'bun:test';
import type { IncomingMessage } from 'node:http';
import { DatabaseDefinitionSchema, DatabaseQuerySchema } from '@nedian0brien/synapsenote-core';
import {
  createDefaultDatabaseGlobalAccessResolver,
  createDefaultDatabaseQueryAccessResolver,
  DATABASE_AGENT_ID_HEADER,
  resolveDatabaseAccessPrincipal,
} from './database-access-policy.ts';

const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  contract: {
    purpose: 'Track tasks',
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
        { id: 'prop_secret', key: 'secret', name: 'Secret', type: 'text' },
      ],
    },
  ],
  views: [
    {
      id: 'view_agent',
      key: 'agent',
      name: 'Agent view',
      sourceId: 'ds_tasks',
      layout: { type: 'agent' },
      projection: { propertyIds: ['prop_title'], body: 'hidden' },
      agent: {
        semanticContract: { purpose: 'Read task titles' },
        tokenBudget: {
          maxTokens: 1000,
          tokenizer: 'utf8_bytes_div3',
          encoding: 'object_rows',
        },
        scope: { maxRecords: 20 },
        writePolicy: { mode: 'read_only' },
      },
    },
  ],
});
const source = database.sources[0];
const view = database.views[0];
if (!source || !view) throw new Error('Database access fixture is incomplete');
const query = DatabaseQuerySchema.parse({});

describe('default database access policy', () => {
  test('accepts only a validated transport agent id and otherwise remains the user', () => {
    const request = {
      headers: {
        [DATABASE_AGENT_ID_HEADER]: '11111111-1111-4111-8111-111111111111',
      },
    } as unknown as IncomingMessage;
    expect(resolveDatabaseAccessPrincipal(request, 'user:owner')).toEqual({
      kind: 'agent',
      id: 'agent:11111111-1111-4111-8111-111111111111',
      invokingUserId: 'user:owner',
      sessionId: '11111111-1111-4111-8111-111111111111',
    });
    request.headers[DATABASE_AGENT_ID_HEADER] = 'invalid header\nvalue';
    expect(resolveDatabaseAccessPrincipal(request, 'user:owner')).toEqual({
      kind: 'user',
      id: 'user:owner',
    });
  });

  test('preserves local user ownership and denies agent schema writes', () => {
    const resolve = createDefaultDatabaseQueryAccessResolver();
    const user = resolve({
      action: 'alter_schema',
      database,
      source,
      query,
      view: null,
      principal: { kind: 'user', id: 'user:owner' },
    });
    const agent = resolve({
      action: 'alter_schema',
      database,
      source,
      query,
      view: null,
      principal: {
        kind: 'agent',
        id: 'agent:codex',
        invokingUserId: 'user:owner',
        sessionId: 'session-1',
      },
    });

    expect(user.allowedRecordIds).toBeNull();
    expect(user.allowedPropertyIds).toBeNull();
    expect(agent.allowedRecordIds).toEqual([]);
    expect(agent.allowedPropertyIds).toEqual([]);
  });

  test('intersects an agent read with the selected view projection', () => {
    const decision = createDefaultDatabaseQueryAccessResolver()({
      action: 'query',
      database,
      source,
      query,
      view,
      principal: {
        kind: 'agent',
        id: 'agent:codex',
        invokingUserId: 'user:owner',
        sessionId: 'session-1',
      },
    });

    expect(decision.allowedRecordIds).toBeNull();
    expect(decision.allowedPropertyIds).toEqual(['prop_title']);
    expect(decision.policyId).toMatch(/^dbpolicy_/);
    expect(decision.policyRevision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('uses persisted workspace and database grants for non-owner user access', () => {
    const resolve = createDefaultDatabaseQueryAccessResolver({
      ownerPrincipalId: () => 'user:owner',
      permissionState: () => ({
        version: 1,
        revision: `sha256:${'9'.repeat(64)}`,
        publicShares: {},
        grants: {
          'dbgrant_11111111-1111-4111-8111-111111111111': {
            id: 'dbgrant_11111111-1111-4111-8111-111111111111',
            databaseId: 'db_tasks',
            principalId: 'user:collaborator',
            role: 'custom',
            actions: ['describe', 'query'],
            createdBy: 'user:owner',
            createdAt: '2026-07-21T00:00:00.000Z',
            updatedAt: '2026-07-21T00:00:00.000Z',
          },
        },
      }),
    });
    const input = {
      database,
      source,
      query,
      view: null,
      principal: { kind: 'user' as const, id: 'user:collaborator' },
    };
    expect(resolve({ ...input, action: 'query' })).toMatchObject({
      allowed: true,
    });
    expect(resolve({ ...input, action: 'alter_schema' })).toMatchObject({
      allowed: false,
      allowedRecordIds: [],
      allowedPropertyIds: [],
    });
    expect(
      resolve({
        ...input,
        action: 'manage_permissions',
        principal: { kind: 'user', id: 'user:owner' },
      }),
    ).toMatchObject({ allowed: true });
  });

  test('enforces workspace grants for database creation without widening agents', () => {
    const resolve = createDefaultDatabaseGlobalAccessResolver({
      ownerPrincipalId: () => 'user:owner',
      permissionState: () => ({
        version: 1,
        revision: `sha256:${'8'.repeat(64)}`,
        publicShares: {},
        grants: {
          'dbgrant_22222222-2222-4222-8222-222222222222': {
            id: 'dbgrant_22222222-2222-4222-8222-222222222222',
            databaseId: null,
            principalId: 'user:builder',
            role: 'custom',
            actions: ['create_database'],
            createdBy: 'user:owner',
            createdAt: '2026-07-21T00:00:00.000Z',
            updatedAt: '2026-07-21T00:00:00.000Z',
          },
        },
      }),
    });
    expect(
      resolve({
        action: 'create_database',
        principal: { kind: 'user', id: 'user:builder' },
      }),
    ).toMatchObject({ allowed: true });
    expect(
      resolve({
        action: 'manage_permissions',
        principal: { kind: 'user', id: 'user:builder' },
      }),
    ).toMatchObject({ allowed: false });
    expect(
      resolve({
        action: 'create_database',
        principal: {
          kind: 'agent',
          id: 'agent:builder',
          invokingUserId: 'user:builder',
          sessionId: 'session-builder',
        },
      }),
    ).toMatchObject({ allowed: false });
  });
});
