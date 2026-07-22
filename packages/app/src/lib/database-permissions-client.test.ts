import { describe, expect, test } from 'bun:test';
import {
  DatabasePermissionsClientError,
  fetchDatabasePermissions,
  removeDatabasePermission,
  saveDatabasePermission,
} from './database-permissions-client';

const grant = {
  id: 'dbgrant_11111111-1111-4111-8111-111111111111',
  databaseId: 'db_tasks',
  principalId: 'user:collaborator',
  role: 'custom',
  actions: ['describe', 'query'],
  createdBy: 'user:owner',
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('database permissions client', () => {
  test('lists, saves, and removes strict revision-bound grants', async () => {
    const bodies: unknown[] = [];
    const responses = [
      json({ action: 'list', grants: [grant], revision: `sha256:${'1'.repeat(64)}` }),
      json({ action: 'upsert', grant, revision: `sha256:${'2'.repeat(64)}` }),
      json({
        action: 'remove',
        grantId: grant.id,
        revision: `sha256:${'3'.repeat(64)}`,
      }),
    ];
    const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      const response = responses.shift();
      if (!response) throw new Error('Unexpected request');
      return response;
    };

    expect(await fetchDatabasePermissions('db_tasks', { fetch })).toMatchObject({
      grants: [{ principalId: 'user:collaborator' }],
      revision: `sha256:${'1'.repeat(64)}`,
    });
    expect(
      await saveDatabasePermission(
        {
          databaseId: 'db_tasks',
          principalId: 'user:collaborator',
          role: 'custom',
          actions: ['describe', 'query'],
          expectedRevision: `sha256:${'1'.repeat(64)}`,
        },
        { fetch },
      ),
    ).toMatchObject({ grant: { id: grant.id }, revision: `sha256:${'2'.repeat(64)}` });
    expect(
      await removeDatabasePermission(
        { grantId: grant.id, expectedRevision: `sha256:${'2'.repeat(64)}` },
        { fetch },
      ),
    ).toEqual({ grantId: grant.id, revision: `sha256:${'3'.repeat(64)}` });
    expect(bodies).toEqual([
      { action: 'list', databaseId: 'db_tasks' },
      {
        action: 'upsert',
        databaseId: 'db_tasks',
        principalId: 'user:collaborator',
        role: 'custom',
        actions: ['describe', 'query'],
        expectedRevision: `sha256:${'1'.repeat(64)}`,
      },
      {
        action: 'remove',
        grantId: grant.id,
        expectedRevision: `sha256:${'2'.repeat(64)}`,
      },
    ]);
  });

  test('preserves stale-policy problem details and rejects malformed success data', async () => {
    await expect(
      fetchDatabasePermissions('db_tasks', {
        fetch: async () => json({ detail: 'Permissions changed', code: 'permission_changed' }, 409),
      }),
    ).rejects.toMatchObject({
      name: 'DatabasePermissionsClientError',
      status: 409,
      problem: { code: 'permission_changed' },
    });
    await expect(
      fetchDatabasePermissions('db_tasks', {
        fetch: async () =>
          json({ action: 'list', grants: [{ ...grant, actions: ['invented'] }], revision: 'bad' }),
      }),
    ).rejects.toBeInstanceOf(DatabasePermissionsClientError);
  });
});
