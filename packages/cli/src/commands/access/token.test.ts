/**
 * `synapsenote access token` — driven through the real Commander tree against
 * a temp project, so the wiring between the command, `process.cwd()`, and the
 * on-disk store is what gets exercised rather than a re-implementation of it.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  accessStorePath,
  getLocalDir,
  oauthStorePath,
  openAccessStore,
  openOAuthStore,
} from '@nedian0brien/synapsenote-server';
import { accessCommand } from './index.ts';

const dirs: string[] = [];
const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run one `access …` invocation inside `dir`, capturing both streams.
 *
 * `cli.ts` chdir's to the anchored project root before any action runs, so
 * doing the same here reproduces what the command actually sees.
 */
async function run(dir: string, argv: string[]): Promise<RunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  const priorExit = process.exitCode;
  process.chdir(dir);
  // Reset to 0 rather than undefined: assigning `undefined` does not clear
  // a previously-set exit code in this runtime, so a failing case earlier in
  // the file would otherwise leak its 1 into every later assertion.
  process.exitCode = 0;
  (process.stdout as { write: unknown }).write = (chunk: string) => {
    stdout.push(String(chunk));
    return true;
  };
  (process.stderr as { write: unknown }).write = (chunk: string) => {
    stderr.push(String(chunk));
    return true;
  };
  try {
    await accessCommand().parseAsync(['node', 'synapsenote', ...argv]);
  } finally {
    (process.stdout as { write: unknown }).write = realOut;
    (process.stderr as { write: unknown }).write = realErr;
  }
  const exitCode = process.exitCode ?? 0;
  process.exitCode = priorExit;
  return { stdout: stdout.join(''), stderr: stderr.join(''), exitCode };
}

function freshProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-access-cli-'));
  dirs.push(dir);
  return dir;
}

function storeFor(dir: string) {
  return openAccessStore(accessStorePath(getLocalDir(dir)));
}

describe('access token create', () => {
  test('prints the secret on stdout and nothing else', async () => {
    // `TOKEN=$(synapsenote access token create ci)` has to capture exactly the
    // credential, so guidance belongs on stderr.
    const dir = freshProject();
    const result = await run(dir, ['token', 'create', 'chatgpt']);
    expect(result.stdout.trim()).toMatch(/^snote_[\w-]+$/);
    expect(result.stderr).toContain('Created access token "chatgpt"');
    expect(result.stderr).toContain('only time the token is shown');
  });

  test('the printed secret verifies against the store it wrote', async () => {
    const dir = freshProject();
    const secret = (await run(dir, ['token', 'create', 'chatgpt'])).stdout.trim();
    expect(storeFor(dir).verify({ scheme: 'bearer', value: secret })).toMatchObject({
      kind: 'bearer',
      label: 'chatgpt',
    });
  });

  test('writes the store under the project’s .ok/local', async () => {
    const dir = freshProject();
    await run(dir, ['token', 'create', 'chatgpt']);
    expect((await run(dir, ['token', 'list'])).stdout).toContain('chatgpt');
    expect(accessStorePath(getLocalDir(dir))).toBe(join(dir, '.ok', 'local', 'access.json'));
  });

  test('two mints coexist', async () => {
    const dir = freshProject();
    await run(dir, ['token', 'create', 'chatgpt']);
    await run(dir, ['token', 'create', 'iphone']);
    expect(storeFor(dir).tokenCount()).toBe(2);
  });
});

describe('access token list', () => {
  test('points at the create command when there are none', async () => {
    const dir = freshProject();
    const result = await run(dir, ['token', 'list']);
    expect(result.stderr).toContain('No access tokens for this project');
    expect(result.stderr).toContain('synapsenote access token create <name>');
    expect(result.stdout).toBe('');
  });

  test('lists name, id, and last use', async () => {
    const dir = freshProject();
    await run(dir, ['token', 'create', 'chatgpt']);
    const result = await run(dir, ['token', 'list']);
    expect(result.stdout).toContain('NAME');
    expect(result.stdout).toContain('chatgpt');
    expect(result.stdout).toContain('never');
  });

  test('never prints a secret', async () => {
    const dir = freshProject();
    const secret = (await run(dir, ['token', 'create', 'chatgpt'])).stdout.trim();
    const listed = await run(dir, ['token', 'list']);
    expect(listed.stdout).not.toContain(secret);
    expect(listed.stderr).not.toContain(secret);
  });
});

describe('access token revoke', () => {
  test('revokes a live token and stops its secret working', async () => {
    const dir = freshProject();
    const secret = (await run(dir, ['token', 'create', 'chatgpt'])).stdout.trim();
    const id = storeFor(dir).listTokens()[0]?.id ?? '';
    const result = await run(dir, ['token', 'revoke', id]);
    expect(result.stderr).toContain(`Revoked ${id}`);
    expect(storeFor(dir).verify({ scheme: 'bearer', value: secret })).toBeNull();
  });

  test('an unknown id fails with a non-zero exit', async () => {
    const dir = freshProject();
    const result = await run(dir, ['token', 'revoke', 'not-an-id']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No access token with id not-an-id');
  });

  test('a successful revoke exits zero', async () => {
    const dir = freshProject();
    await run(dir, ['token', 'create', 'chatgpt']);
    const id = storeFor(dir).listTokens()[0]?.id ?? '';
    expect((await run(dir, ['token', 'revoke', id])).exitCode).toBe(0);
  });
});

describe('access client', () => {
  test('reports nothing when no application has been approved', async () => {
    const dir = freshProject();
    const result = await run(dir, ['client', 'list']);
    expect(result.stderr).toContain('No OAuth clients have been approved');
    expect(result.stdout).toBe('');
  });

  test('lists an approved client with its live token count', async () => {
    const dir = freshProject();
    const store = openOAuthStore(oauthStorePath(getLocalDir(dir)));
    store.upsertClient({
      clientId: 'dcr-1',
      clientName: 'ChatGPT',
      redirectUris: ['https://chatgpt.example/cb'],
      source: 'dcr',
    });
    store.issueGrant({
      clientId: 'dcr-1',
      scope: 'synapsenote:workspace',
      resource: 'https://notes.example.com/mcp',
      principalId: 'tok-1',
      principalLabel: 'owner',
    });
    const result = await run(dir, ['client', 'list']);
    expect(result.stdout).toContain('ChatGPT');
    expect(result.stdout).toContain('dcr-1');
    // One live access token; the refresh token is not a connection.
    expect(result.stdout).toMatch(/\bdcr\b.*\b1\b/);
  });

  test('revoking a client drops its tokens and forgets it', async () => {
    const dir = freshProject();
    const store = openOAuthStore(oauthStorePath(getLocalDir(dir)));
    store.upsertClient({
      clientId: 'dcr-1',
      clientName: 'ChatGPT',
      redirectUris: ['https://chatgpt.example/cb'],
      source: 'dcr',
    });
    const grant = store.issueGrant({
      clientId: 'dcr-1',
      scope: 's',
      resource: 'r',
      principalId: 'p',
      principalLabel: 'l',
    });
    const result = await run(dir, ['client', 'revoke', 'dcr-1']);
    expect(result.stderr).toContain('Revoked dcr-1');
    const after = openOAuthStore(oauthStorePath(getLocalDir(dir)));
    expect(after.verifyAccessToken(grant.accessToken)).toBeNull();
    expect(after.getClient('dcr-1')).toBeUndefined();
  });

  test('revoking an unknown client fails with a non-zero exit', async () => {
    const dir = freshProject();
    const result = await run(dir, ['client', 'revoke', 'nope']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No OAuth client with id nope');
  });
});
