import { afterEach, describe, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { readGitDirKind } from './read-git-dir-kind.ts';

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, {
    cwd,
    env: { ...process.env, LANG: 'C', LC_ALL: 'C', GIT_CONFIG_GLOBAL: '/dev/null' },
  });
}

describe('readGitDirKind', () => {
  let testRoot: string | null = null;
  afterEach(() => {
    if (testRoot !== null) rmSync(testRoot, { recursive: true, force: true });
    testRoot = null;
  });

  test('returns "absent" when path has no .git', () => {
    testRoot = realpathSync(mkdtempSync(join(tmpdir(), 'gitdir-kind-')));
    expect(readGitDirKind(testRoot)).toBe('absent');
  });

  test('returns "absent" for a non-absolute path (defensive)', () => {
    expect(readGitDirKind('relative/path')).toBe('absent');
  });

  test('returns "directory" for a main checkout (.git is a directory)', async () => {
    testRoot = realpathSync(mkdtempSync(join(tmpdir(), 'gitdir-kind-')));
    await git(testRoot, 'init', '--initial-branch=main', '.');
    expect(readGitDirKind(testRoot)).toBe('directory');
  });

  test('returns "linked" for a linked-worktree root (.git is a pointer file)', async () => {
    testRoot = realpathSync(mkdtempSync(join(tmpdir(), 'gitdir-kind-')));
    const mainRepo = join(testRoot, 'main');
    mkdirSync(mainRepo);
    await git(mainRepo, 'init', '--initial-branch=main', '.');
    await git(mainRepo, 'config', 'user.email', 'test@example.com');
    await git(mainRepo, 'config', 'user.name', 'Test');
    writeFileSync(join(mainRepo, 'README.md'), '# main\n');
    await git(mainRepo, 'add', 'README.md');
    await git(mainRepo, 'commit', '-m', 'initial');
    const wt = join(testRoot, 'wt-feat');
    await git(mainRepo, 'worktree', 'add', '-b', 'feat', wt);
    expect(readGitDirKind(wt)).toBe('linked');
  });
});
