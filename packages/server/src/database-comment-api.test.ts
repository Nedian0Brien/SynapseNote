import { describe, expect, test } from 'bun:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { createDatabaseCommentApiHandler } from './database-comment-api.ts';
import type { DatabaseCommentStore } from './database-comment-store.ts';
import { DatabaseDataPlaneError } from './database-data-plane.ts';

function request(body: unknown): IncomingMessage {
  const serialized = JSON.stringify(body);
  const stream = Readable.from(Buffer.from(serialized)) as unknown as IncomingMessage;
  stream.method = 'POST';
  stream.url = '/api/databases/comments';
  stream.headers = {
    host: 'localhost',
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(serialized)),
  };
  return stream;
}

function response(): {
  value: ServerResponse;
  captured: { status: number; body: string };
} {
  const captured = { status: 0, body: '' };
  return {
    captured,
    value: {
      writeHead(status: number) {
        captured.status = status;
      },
      end(body?: string) {
        captured.body = body ?? '';
      },
    } as unknown as ServerResponse,
  };
}

describe('database comment HTTP authorization', () => {
  test('replaces caller attribution with the trusted transport actor', async () => {
    let observedActor: unknown;
    const store = {
      async read(input: { actor: unknown }) {
        observedActor = input.actor;
        return {
          revision: `sha256:${'a'.repeat(64)}`,
          document: { version: 1, databaseId: 'db_tasks', recordId: 'rec_first', threads: [] },
        };
      },
    } as unknown as DatabaseCommentStore;
    const handler = createDatabaseCommentApiHandler(store, undefined, () => ({
      kind: 'agent',
      principal_id: 'agent:trusted-session',
    }));
    const output = response();

    await handler(
      request({
        action: 'read',
        databaseId: 'db_tasks',
        recordId: 'rec_first',
        actor: { kind: 'human', principal_id: 'user:forged' },
      }),
      output.value,
    );

    expect(output.captured.status).toBe(200);
    expect(observedActor).toEqual({ kind: 'agent', principal_id: 'agent:trusted-session' });
  });

  test('returns an explicit permission denial before touching comment storage', async () => {
    let read = false;
    const store = {
      async read() {
        read = true;
        throw new Error('unreachable');
      },
    } as unknown as DatabaseCommentStore;
    const handler = createDatabaseCommentApiHandler(store, undefined, () => {
      throw new DatabaseDataPlaneError('permission_denied', 'Comment scope denied');
    });
    const output = response();

    await handler(
      request({
        action: 'read',
        databaseId: 'db_tasks',
        recordId: 'rec_first',
        actor: { kind: 'agent', principal_id: 'agent:forged' },
      }),
      output.value,
    );

    expect(output.captured.status).toBe(403);
    expect(JSON.parse(output.captured.body)).toMatchObject({ code: 'permission_denied' });
    expect(read).toBe(false);
  });
});
