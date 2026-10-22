import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseGitRecoveryService } from './database-git-recovery.ts';

const tempDirs: string[] = [];

function git(cwd: string, ...args: string[]) {
  return spawnSync('git', args, { cwd, encoding: 'utf-8', windowsHide: true });
}

function writeRecord(path: string, title: string, status: string): void {
  writeFileSync(
    path,
    `---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_one\ntitle: ${title}\nstatus: ${status}\n---\nBody\n`,
  );
}

function conflictFixture(databaseConflict = true) {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-git-recovery-'));
  tempDirs.push(projectDir);
  expect(git(projectDir, 'init', '-b', 'main').status).toBe(0);
  git(projectDir, 'config', 'user.name', 'Test User');
  git(projectDir, 'config', 'user.email', 'test@example.com');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  const manifest = join(projectDir, '.ok', 'databases', 'tasks.yml');
  const record = join(projectDir, 'record.md');
  const ordinary = join(projectDir, 'README.md');
  writeFileSync(manifest, 'name: Base\n');
  writeRecord(record, 'Base', 'todo');
  writeFileSync(ordinary, 'Base\n');
  git(projectDir, 'add', '.');
  git(projectDir, 'commit', '-m', 'base');

  git(projectDir, 'switch', '-c', 'topic');
  writeFileSync(databaseConflict ? manifest : ordinary, 'name: Topic\n');
  if (databaseConflict) writeRecord(record, 'Base', 'done');
  git(projectDir, 'add', '.');
  git(projectDir, 'commit', '-m', 'topic');

  git(projectDir, 'switch', 'main');
  writeFileSync(databaseConflict ? manifest : ordinary, 'name: Main\n');
  git(projectDir, 'add', '.');
  git(projectDir, 'commit', '-m', 'main');
  expect(git(projectDir, 'merge', 'topic').status).toBe(1);
  return { projectDir, manifest, record };
}

function rebaseConflictFixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-git-recovery-rebase-'));
  tempDirs.push(projectDir);
  expect(git(projectDir, 'init', '-b', 'main').status).toBe(0);
  git(projectDir, 'config', 'user.name', 'Test User');
  git(projectDir, 'config', 'user.email', 'test@example.com');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  const manifest = join(projectDir, '.ok', 'databases', 'tasks.yml');
  const record = join(projectDir, 'record.md');
  writeFileSync(manifest, 'name: Base\n');
  writeRecord(record, 'Base', 'todo');
  git(projectDir, 'add', '.');
  git(projectDir, 'commit', '-m', 'base');

  git(projectDir, 'switch', '-c', 'topic');
  writeRecord(record, 'Base', 'done');
  git(projectDir, 'add', '.');
  git(projectDir, 'commit', '-m', 'topic changes status');

  git(projectDir, 'switch', 'main');
  writeRecord(record, 'Base', 'archived');
  git(projectDir, 'add', '.');
  git(projectDir, 'commit', '-m', 'main also changes status');

  // Rebase topic onto main: topic's "status: done" commit replays on top of
  // main's "status: archived" commit and conflicts on the same line. Capture
  // topic's own pre-rebase content now — once the rebase starts, HEAD moves
  // to main's tip for the replay, so `git show HEAD:...` after that point
  // would read main's content, not the value abort should restore.
  git(projectDir, 'switch', 'topic');
  const beforeRecord = git(projectDir, 'show', 'HEAD:record.md').stdout;
  expect(git(projectDir, 'rebase', 'main').status).toBe(1);
  return { projectDir, manifest, record, beforeRecord };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('DatabaseGitRecoveryService', () => {
  test('detects a partially applied multi-file merge and restores exact pre-merge bytes', async () => {
    const { projectDir, manifest, record } = conflictFixture();
    const beforeManifest = git(projectDir, 'show', 'HEAD:.ok/databases/tasks.yml').stdout;
    const beforeRecord = git(projectDir, 'show', 'HEAD:record.md').stdout;
    let afterAbortCalls = 0;
    const recovery = createDatabaseGitRecoveryService({
      projectDir,
      contentDir: projectDir,
      isKnownRecordPath: (path) => path === 'record.md',
      afterAbort: () => {
        afterAbortCalls += 1;
      },
    });

    expect(recovery.status()).toMatchObject({
      state: 'partial',
      operation: 'merge',
      databasePaths: ['.ok/databases/tasks.yml', 'record.md'],
      unmergedPaths: ['.ok/databases/tasks.yml'],
      canAbort: true,
    });
    const revision = recovery.status().revision;
    await expect(recovery.abort('sha256:stale')).rejects.toThrow('state changed');
    expect(existsSync(join(projectDir, '.git', 'MERGE_HEAD'))).toBe(true);

    expect(await recovery.abort(revision)).toMatchObject({ state: 'clean', canAbort: false });
    expect(afterAbortCalls).toBe(1);
    expect(readFileSync(manifest, 'utf-8')).toBe(beforeManifest);
    expect(readFileSync(record, 'utf-8')).toBe(beforeRecord);
  });

  test('fails closed for an unmerged database path without a recognized abort operation', () => {
    const { projectDir } = conflictFixture();
    unlinkSync(join(projectDir, '.git', 'MERGE_HEAD'));
    const recovery = createDatabaseGitRecoveryService({
      projectDir,
      contentDir: projectDir,
      isKnownRecordPath: (path) => path === '.ok/databases/tasks.yml',
    });
    expect(recovery.status()).toMatchObject({
      state: 'unresolved',
      operation: 'unknown',
      canAbort: false,
      unmergedPaths: ['.ok/databases/tasks.yml'],
    });
  });

  test('does not block database reads for an ordinary Markdown-only conflict', () => {
    const { projectDir } = conflictFixture(false);
    const recovery = createDatabaseGitRecoveryService({
      projectDir,
      contentDir: projectDir,
    });
    expect(recovery.status()).toMatchObject({ state: 'clean', operation: null });
    expect(recovery.isBlocked()).toBe(false);
  });

  test('detects a live git rebase conflict on a database record and restores exact pre-rebase bytes', async () => {
    // R-008 gap: `#operation()` and `#abortArgs` already branch on
    // `rebase-merge`/`rebase-apply` (see database-git-recovery.ts), but only
    // `git merge` was ever exercised by a test. A real `git rebase --abort`
    // has different on-disk state (rebase-merge dir, no MERGE_HEAD) than a
    // merge abort, so this is not redundant with the merge test above.
    const { projectDir, record, beforeRecord } = rebaseConflictFixture();
    let afterAbortCalls = 0;
    const recovery = createDatabaseGitRecoveryService({
      projectDir,
      contentDir: projectDir,
      isKnownRecordPath: (path) => path === 'record.md',
      afterAbort: () => {
        afterAbortCalls += 1;
      },
    });

    expect(recovery.status()).toMatchObject({
      state: 'partial',
      operation: 'rebase',
      databasePaths: ['record.md'],
      unmergedPaths: ['record.md'],
      canAbort: true,
    });
    expect(existsSync(join(projectDir, '.git', 'rebase-merge'))).toBe(true);
    expect(existsSync(join(projectDir, '.git', 'MERGE_HEAD'))).toBe(false);

    const revision = recovery.status().revision;
    expect(await recovery.abort(revision)).toMatchObject({ state: 'clean', canAbort: false });
    expect(afterAbortCalls).toBe(1);
    expect(existsSync(join(projectDir, '.git', 'rebase-merge'))).toBe(false);
    expect(readFileSync(record, 'utf-8')).toBe(beforeRecord);
  });
});
