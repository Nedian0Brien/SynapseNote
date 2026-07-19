import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hocuspocus } from '@hocuspocus/server';
import { SYSTEM_DOC_NAME } from '@nedian0brien/synapsenote-core';
import { AgentSessionManager } from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';
import { listenOnLoopback } from './loopback-rig-test-helpers.ts';

let server: Server | null = null;

afterEach(async () => {
  if (!server) return;
  const active = server;
  server = null;
  await new Promise<void>((resolve) => active.close(() => resolve()));
});

describe('GET /api/current-document', () => {
  test('returns the focused editor view with no-store caching', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });
    const states = new Map<number, unknown>([
      [
        9,
        {
          currentView: {
            document: 'note/summary/Active Paper',
            focused: true,
            visible: true,
            updatedAt: 123,
          },
        },
      ],
    ]);
    hocuspocus.documents.set(SYSTEM_DOC_NAME, {
      awareness: { getStates: () => states },
    } as never);
    hocuspocus.configuration.extensions.push(
      createApiExtension({
        hocuspocus,
        sessionManager: new AgentSessionManager(hocuspocus),
        contentDir: mkdtempSync(join(tmpdir(), 'ok-current-document-api-')),
        getFileIndex: () => new Map(),
      }),
    );

    server = createServer((request, response) => {
      hocuspocus.hooks('onRequest', { request, response } as never).catch(() => response.end());
    });
    const { port } = await listenOnLoopback(server);
    const response = await fetch(`http://127.0.0.1:${port}/api/current-document`);
    const body = (await response.json()) as {
      current: { document: string } | null;
      viewers: unknown[];
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.current?.document).toBe('note/summary/Active Paper');
    expect(body.viewers).toHaveLength(1);
  });
});
