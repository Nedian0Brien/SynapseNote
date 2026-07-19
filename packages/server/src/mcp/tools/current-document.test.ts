import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Config, ConfigSchema } from '../../config/schema';
import { register } from './current-document.ts';
import type { ServerInstance } from './shared.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});
const cwd = mkdtempSync(join(tmpdir(), 'ok-current-document-test-'));

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type Handler = (args: { cwd?: string }) => Promise<ToolResult>;

function capture(serverUrl: string | undefined): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool(_name: string, _config: unknown, next: Handler) {
      handler = next;
    },
  } as unknown as ServerInstance;
  register(server, { serverUrl, config: BASE_CONFIG, resolveCwd: async () => cwd });
  if (!handler) throw new Error('not registered');
  return handler;
}

let testServer: ReturnType<typeof Bun.serve>;
let baseUrl: string;
let responseMode: 'document' | 'empty' | 'non-document' = 'document';

beforeAll(() => {
  testServer = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(req) {
      if (new URL(req.url).pathname !== '/api/current-document') {
        return new Response('Not found', { status: 404 });
      }
      if (responseMode === 'empty') return Response.json({ current: null, viewers: [] });
      const current = {
        clientId: 7,
        document:
          responseMode === 'non-document' ? null : 'note/summary/Generate Rather Than Retrieve',
        focused: true,
        visible: true,
        updatedAt: 123,
      };
      return Response.json({ current, viewers: [current] });
    },
  });
  baseUrl = `http://127.0.0.1:${testServer.port}`;
});

afterAll(() => testServer.stop());

describe('current_document tool', () => {
  test('returns the focused document and all viewers', async () => {
    responseMode = 'document';
    const result = await capture(baseUrl)({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain('note/summary/Generate Rather Than Retrieve');
    expect((result.structuredContent?.current as { clientId?: number })?.clientId).toBe(7);
    expect(result.structuredContent?.cwd).toBe(cwd);
  });

  test('distinguishes no connected editor from a focused non-document view', async () => {
    responseMode = 'empty';
    const empty = await capture(baseUrl)({});
    expect(empty.content[0]?.text).toContain('No live SynapseNote editor window');

    responseMode = 'non-document';
    const nonDocument = await capture(baseUrl)({});
    expect(nonDocument.content[0]?.text).toContain('not currently displaying a document');
  });

  test('returns a tool error when the project server is unavailable', async () => {
    const result = await capture(undefined)({});
    expect(result.isError).toBe(true);
  });
});
