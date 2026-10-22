import { describe, expect, test } from 'bun:test';
import {
  DatabasePublicSharesClientError,
  fetchDatabasePublicShares,
  revokeDatabasePublicShare,
  saveDatabasePublicShare,
} from './database-public-shares-client';

const share = {
  version: 1,
  id: 'dbshare_11111111-1111-4111-8111-111111111111',
  target: { kind: 'database', databaseId: 'db_tasks', sourceId: 'ds_tasks' },
  access: 'link',
  propertyIds: ['prop_tasks_title'],
  allowBody: false,
  allowFormSubmission: false,
  expiresAt: null,
  revokedAt: null,
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

describe('database public shares client', () => {
  test('lists, saves, and revokes revision-bound public shares', async () => {
    const bodies: unknown[] = [];
    const responses = [
      json({ action: 'list', shares: [share], revision: `sha256:${'1'.repeat(64)}` }),
      json({
        action: 'upsert',
        share,
        token: 'dbsharetoken_once',
        revision: `sha256:${'2'.repeat(64)}`,
      }),
      json({ action: 'revoke', shareId: share.id, revision: `sha256:${'3'.repeat(64)}` }),
    ];
    const fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      const response = responses.shift();
      if (!response) throw new Error('Unexpected request');
      return response;
    };
    expect(await fetchDatabasePublicShares('db_tasks', { fetch })).toMatchObject({
      shares: [{ id: share.id }],
    });
    expect(
      await saveDatabasePublicShare(
        {
          target: share.target as typeof share.target & { kind: 'database' },
          access: 'link',
          propertyIds: ['prop_tasks_title'],
          allowBody: false,
          allowFormSubmission: false,
          expiresAt: null,
          expectedRevision: `sha256:${'1'.repeat(64)}`,
        },
        { fetch },
      ),
    ).toMatchObject({ token: 'dbsharetoken_once', revision: `sha256:${'2'.repeat(64)}` });
    expect(
      await revokeDatabasePublicShare(
        { shareId: share.id, expectedRevision: `sha256:${'2'.repeat(64)}` },
        { fetch },
      ),
    ).toEqual({ shareId: share.id, revision: `sha256:${'3'.repeat(64)}` });
    expect(bodies).toHaveLength(3);
  });

  test('rejects any success response containing a persisted token hash', async () => {
    await expect(
      fetchDatabasePublicShares('db_tasks', {
        fetch: async () =>
          json({
            action: 'list',
            shares: [{ ...share, tokenHash: `sha256:${'a'.repeat(64)}` }],
            revision: 'sha256:empty',
          }),
      }),
    ).rejects.toBeInstanceOf(DatabasePublicSharesClientError);
  });
});
