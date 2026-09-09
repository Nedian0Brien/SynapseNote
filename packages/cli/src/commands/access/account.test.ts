/**
 * `synapsenote access account` — driven through the real Commander tree
 * against a temp project, the way `token.test.ts` does, so what gets exercised
 * is the wiring between the command, `process.cwd()` and the on-disk store.
 *
 * The password reader is the one injected seam. Everything else is real,
 * including the scrypt hashing, which is why these tests are slower than the
 * rest of the file's neighbours.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  accessStorePath,
  accountStorePath,
  getLocalDir,
  openAccessStore,
  openAccountStore,
  verifyPassword,
} from '@nedian0brien/synapsenote-server';
import type { PasswordReader } from '../../ui/read-password.ts';
import { NoTerminalError, PasswordPromptCancelled } from '../../ui/read-password.ts';
import { accountCommand } from './account.ts';

const PASSWORD = 'correct horse battery staple';
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

/** Answer every prompt with the same string. */
function alwaysAnswer(...answers: string[]): PasswordReader {
  const queue = [...answers];
  return async () => queue.shift() ?? answers[answers.length - 1] ?? '';
}

async function run(dir: string, argv: string[], readPassword?: PasswordReader): Promise<RunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const realOut = process.stdout.write.bind(process.stdout);
  const realErr = process.stderr.write.bind(process.stderr);
  const priorExit = process.exitCode;
  process.chdir(dir);
  // Reset to 0 rather than undefined — see the same note in token.test.ts.
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
    await accountCommand({ readPassword }).parseAsync(['node', 'synapsenote', ...argv]);
  } finally {
    (process.stdout as { write: unknown }).write = realOut;
    (process.stderr as { write: unknown }).write = realErr;
  }
  const exitCode = process.exitCode ?? 0;
  process.exitCode = priorExit;
  return { stdout: stdout.join(''), stderr: stderr.join(''), exitCode };
}

function freshProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-account-cli-'));
  dirs.push(dir);
  return dir;
}

function accountIn(dir: string) {
  return openAccountStore(accountStorePath(getLocalDir(dir))).get();
}

describe('account create', () => {
  test('writes an account whose password verifies', async () => {
    const dir = freshProject();
    const result = await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Created account "libera3920"');
    const account = accountIn(dir);
    expect(account?.username).toBe('libera3920');
    expect(await verifyPassword(PASSWORD, account!.password)).toBe(true);
  });

  test('never prints the password', async () => {
    const dir = freshProject();
    const result = await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    expect(result.stdout).not.toContain(PASSWORD);
    expect(result.stderr).not.toContain(PASSWORD);
  });

  test('stores it next to the tokens', async () => {
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    expect(accountStorePath(getLocalDir(dir))).toBe(join(dir, '.ok', 'local', 'accounts.json'));
  });

  test('gives the account a WebAuthn handle', async () => {
    // Credentials are bound to it, so it has to exist before the first passkey
    // registration and survive every password change.
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    expect(accountIn(dir)?.webauthnUserId).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test('refuses a second account', async () => {
    // One server, one account. A second one would need sharing and permissions
    // that nothing here implements.
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    const result = await run(dir, ['create', 'someone-else'], alwaysAnswer(PASSWORD, PASSWORD));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('already exists');
    expect(accountIn(dir)?.username).toBe('libera3920');
  });

  test('refuses a mismatched confirmation and writes nothing', async () => {
    const dir = freshProject();
    const result = await run(
      dir,
      ['create', 'libera3920'],
      alwaysAnswer(PASSWORD, 'typo typo typo'),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('did not match');
    expect(accountIn(dir)).toBeUndefined();
  });

  test('refuses a short password without asking twice', async () => {
    const dir = freshProject();
    const asked: string[] = [];
    const result = await run(dir, ['create', 'libera3920'], async (label) => {
      asked.push(label);
      return 'short';
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('at least 12 characters');
    expect(asked).toHaveLength(1);
    expect(accountIn(dir)).toBeUndefined();
  });

  test('explains what to do when there is no terminal', async () => {
    // `docker compose exec -T` is how an operator lands here, and the fix is
    // to drop the -T rather than to look for a flag that does not exist.
    const dir = freshProject();
    const result = await run(dir, ['create', 'libera3920'], () =>
      Promise.reject(new NoTerminalError()),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('without -T');
    expect(result.stderr).toContain('no --password flag');
    expect(accountIn(dir)).toBeUndefined();
  });

  test('a cancelled prompt writes nothing', async () => {
    const dir = freshProject();
    const result = await run(dir, ['create', 'libera3920'], () =>
      Promise.reject(new PasswordPromptCancelled()),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Cancelled');
    expect(accountIn(dir)).toBeUndefined();
  });
});

describe('account passwd', () => {
  const NEW_PASSWORD = 'a different long password';

  test('replaces the password', async () => {
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    const result = await run(dir, ['passwd'], alwaysAnswer(NEW_PASSWORD, NEW_PASSWORD));
    expect(result.exitCode).toBe(0);
    const account = accountIn(dir);
    expect(await verifyPassword(NEW_PASSWORD, account!.password)).toBe(true);
    expect(await verifyPassword(PASSWORD, account!.password)).toBe(false);
  });

  test('signs out the browser sessions the old password opened', async () => {
    // Changing a password is what an operator does when they think someone
    // else has it. Leaving the sessions live would make the change cosmetic.
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    const accountId = accountIn(dir)!.id;
    const access = openAccessStore(accessStorePath(getLocalDir(dir)));
    const session = access.createAccountSession(accountId, 'libera3920');

    const result = await run(dir, ['passwd'], alwaysAnswer(NEW_PASSWORD, NEW_PASSWORD));
    expect(result.stderr).toContain('Signed out 1 browser session');
    expect(
      openAccessStore(accessStorePath(getLocalDir(dir))).verify({
        scheme: 'session',
        value: session.secret,
      }),
    ).toBeNull();
  });

  test('keeps the WebAuthn handle so registered passkeys keep working', async () => {
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    const before = accountIn(dir)!.webauthnUserId;
    await run(dir, ['passwd'], alwaysAnswer(NEW_PASSWORD, NEW_PASSWORD));
    expect(accountIn(dir)?.webauthnUserId).toBe(before);
  });

  test('refuses when there is no account', async () => {
    const dir = freshProject();
    const result = await run(dir, ['passwd'], alwaysAnswer(NEW_PASSWORD, NEW_PASSWORD));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No account on this server');
  });

  test('a mismatch leaves the old password working', async () => {
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    const result = await run(dir, ['passwd'], alwaysAnswer(NEW_PASSWORD, 'something else long'));
    expect(result.exitCode).toBe(1);
    expect(await verifyPassword(PASSWORD, accountIn(dir)!.password)).toBe(true);
  });
});

describe('account show', () => {
  test('reports the account and its passkey count', async () => {
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    const result = await run(dir, ['show']);
    expect(result.stdout).toContain('libera3920');
    expect(result.stdout).toContain('passkeys  0');
  });

  test('never prints the hash', async () => {
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    const hash = accountIn(dir)!.password.hash;
    const result = await run(dir, ['show']);
    expect(result.stdout).not.toContain(hash);
  });

  test('lists registered passkeys', async () => {
    const dir = freshProject();
    await run(dir, ['create', 'libera3920'], alwaysAnswer(PASSWORD, PASSWORD));
    const store = openAccountStore(accountStorePath(getLocalDir(dir)));
    store.addPasskey(store.get()!.id, {
      id: 'cred-1',
      publicKey: 'AAAA',
      counter: 0,
      label: 'MacBook',
      deviceType: 'multiDevice',
      backedUp: true,
      createdAt: new Date().toISOString(),
    });
    const result = await run(dir, ['show']);
    expect(result.stdout).toContain('passkeys  1');
    expect(result.stdout).toContain('MacBook');
  });

  test('says so when there is no account, without failing', async () => {
    // `show` is what someone runs to find out, so "nothing here" is an answer,
    // not an error.
    const dir = freshProject();
    const result = await run(dir, ['show']);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('No account on this server');
  });
});
