import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabaseTaskRollbackJournal,
  DatabaseTaskRollbackError,
} from './database-task-rollback.ts';

const tempDirs: string[] = [];

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-task-rollback-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(contentDir, 'tasks'), { recursive: true });
  tempDirs.push(projectDir);
  return {
    projectDir,
    contentDir,
    journal: createDatabaseTaskRollbackJournal(projectDir, contentDir),
  };
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('DatabaseTaskRollbackJournal', () => {
  test('durably restores every prepared file and replays idempotently', async () => {
    const { projectDir, contentDir, journal } = fixture();
    const taskId = 'task_import_one';
    const paths = ['tasks/one.md', 'tasks/two.md'];
    for (const [index, path] of paths.entries()) {
      const before = `Before ${index}\n`;
      const after = `After ${index}\n`;
      writeFileSync(join(contentDir, path), after);
      await journal.prepare({ taskId, path, before, afterSha256: sha256(after) });
    }

    expect(await journal.rollback(taskId)).toEqual({ taskId, status: 'applied', restored: 2 });
    expect(paths.map((path) => readFileSync(join(contentDir, path), 'utf8'))).toEqual([
      'Before 0\n',
      'Before 1\n',
    ]);
    expect(await journal.rollback(taskId)).toEqual({
      taskId,
      status: 'already_applied',
      restored: 2,
    });
    expect(
      readFileSync(
        join(projectDir, '.ok', 'local', 'database-task-rollbacks', `${taskId}.json`),
        'utf8',
      ),
    ).not.toContain('After 0');
    expect(await journal.isRolledBack(taskId)).toBe(true);
    await journal.resetRolledBack(taskId);
    expect(await journal.isRolledBack(taskId)).toBe(false);
  });

  test('preflights every path and refuses without partial restoration after an edit', async () => {
    const { contentDir, journal } = fixture();
    const taskId = 'task_import_conflict';
    for (const path of ['tasks/one.md', 'tasks/two.md']) {
      writeFileSync(join(contentDir, path), 'After\n');
      await journal.prepare({ taskId, path, before: 'Before\n', afterSha256: sha256('After\n') });
    }
    writeFileSync(join(contentDir, 'tasks/two.md'), 'External edit\n');

    await expect(journal.rollback(taskId)).rejects.toMatchObject({
      code: 'rollback_conflict',
      details: { conflicts: [expect.objectContaining({ path: 'tasks/two.md' })] },
    });
    expect(readFileSync(join(contentDir, 'tasks/one.md'), 'utf8')).toBe('After\n');
  });

  test('refuses a symlinked journal root and a content target escaping through a symlink', async () => {
    const { projectDir, contentDir, journal } = fixture();
    const outside = join(projectDir, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(contentDir, 'linked'));
    writeFileSync(join(outside, 'record.md'), 'After\n');
    await journal.prepare({
      taskId: 'task_escape',
      path: 'linked/record.md',
      before: 'Before\n',
      afterSha256: sha256('After\n'),
    });
    await expect(journal.rollback('task_escape')).rejects.toBeInstanceOf(DatabaseTaskRollbackError);

    const second = fixture();
    const externalRoot = join(second.projectDir, 'external-journal');
    mkdirSync(join(second.projectDir, '.ok'), { recursive: true });
    mkdirSync(externalRoot);
    symlinkSync(externalRoot, join(second.projectDir, '.ok', 'local'));
    await expect(
      second.journal.prepare({
        taskId: 'task_symlink',
        path: 'tasks/one.md',
        before: 'Before\n',
        afterSha256: sha256('After\n'),
      }),
    ).rejects.toMatchObject({ code: 'rollback_conflict' });
  });

  test('fails closed with a typed error for a torn/truncated journal file, never an untyped SyntaxError', async () => {
    // R-008 gap: a crash can leave the journal file corrupt for reasons
    // outside this class's own write path (write-temp-then-rename already
    // makes the class's own writes crash-safe — see `#write`), e.g. an
    // out-of-process writer or filesystem-level corruption. Every other
    // failure mode in this class throws `DatabaseTaskRollbackError`; a raw
    // `JSON.parse`/schema SyntaxError leaking past that contract would slip
    // past any caller that only checks `instanceof DatabaseTaskRollbackError`
    // (the pattern used everywhere else in this file).
    const { projectDir, contentDir, journal } = fixture();
    const taskId = 'task_torn';
    const path = 'tasks/one.md';
    writeFileSync(join(contentDir, path), 'After\n');
    await journal.prepare({ taskId, path, before: 'Before\n', afterSha256: sha256('After\n') });
    const journalPath = join(
      projectDir,
      '.ok',
      'local',
      'database-task-rollbacks',
      `${taskId}.json`,
    );
    const full = readFileSync(journalPath, 'utf8');
    writeFileSync(journalPath, full.slice(0, Math.floor(full.length / 2)));
    await expect(journal.rollback(taskId)).rejects.toBeInstanceOf(DatabaseTaskRollbackError);
    await expect(journal.rollback(taskId)).rejects.toMatchObject({
      code: 'rollback_conflict',
      message: expect.stringContaining('is corrupt'),
    });
    // The content file itself must be untouched — a corrupt journal must
    // never partially restore or otherwise mutate content.
    expect(readFileSync(join(contentDir, path), 'utf8')).toBe('After\n');
  });
});
