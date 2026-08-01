import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseMigrationJournal } from './database-migration-journal.ts';

describe('DatabaseMigrationJournal', () => {
  test('persists staged files and restores exact before bytes', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'synapsenote-migration-journal-'));
    const target = join(projectDir, 'notes.md');
    await writeFile(target, 'before\n');
    const journal = createDatabaseMigrationJournal(projectDir);
    await journal.prepare({
      taskId: 'task_migration',
      files: [{ path: 'notes.md', before: 'before\n', after: 'after\n' }],
    });
    await journal.checkpoint('task_migration', 'staged');
    await writeFile(target, 'after\n');
    const result = await journal.rollback('task_migration');
    expect(result).toEqual({ taskId: 'task_migration', restored: 1, status: 'applied' });
    expect(await readFile(target, 'utf8')).toBe('before\n');
    expect((await journal.get('task_migration')).state).toBe('rolled_back');
  });

  test('marks rollback as recovery-required when an unknown edit is present', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'synapsenote-migration-journal-'));
    const target = join(projectDir, 'notes.md');
    await writeFile(target, 'before\n');
    const journal = createDatabaseMigrationJournal(projectDir);
    await journal.prepare({
      taskId: 'task_conflict',
      files: [{ path: 'notes.md', before: 'before\n', after: 'after\n' }],
    });
    await writeFile(target, 'external\n');
    await expect(journal.rollback('task_conflict')).rejects.toThrow('external edits');
    expect((await journal.get('task_conflict')).state).toBe('recovery_required');
  });

  test('allows an exact retry after a clean rollback', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'synapsenote-migration-journal-'));
    const target = join(projectDir, 'notes.md');
    await writeFile(target, 'before\n');
    const journal = createDatabaseMigrationJournal(projectDir);
    await journal.prepare({
      taskId: 'task_retry',
      files: [{ path: 'notes.md', before: 'before\n', after: 'after\n' }],
    });
    await journal.checkpoint('task_retry', 'staged');
    await writeFile(target, 'after\n');
    await journal.rollback('task_retry');
    const retried = await journal.prepare({
      taskId: 'task_retry',
      files: [{ path: 'notes.md', before: 'before\n', after: 'after\n' }],
    });
    expect(retried.state).toBe('prepared');
  });

  test('cleans task-scoped recovery material only at an activated terminal boundary', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'synapsenote-migration-journal-'));
    const journal = createDatabaseMigrationJournal(projectDir);
    await journal.prepare({
      taskId: 'task_cleanup',
      files: [{ path: 'notes.md', before: 'before\n', after: 'after\n' }],
    });
    await expect(journal.cleanup('task_cleanup')).rejects.toThrow('cleanup boundary');
    await journal.checkpoint('task_cleanup', 'activated');
    await mkdir(join(projectDir, '.ok', 'local', 'database-migrations', 'task_cleanup'), {
      recursive: true,
    });
    await writeFile(
      join(projectDir, '.ok', 'local', 'database-migrations', 'task_cleanup', 'backup.json'),
      '{}',
    );
    expect(await journal.hasTaskMaterial('task_cleanup')).toBe(true);
    await expect(journal.cleanup('task_cleanup')).resolves.toEqual({
      taskId: 'task_cleanup',
      removed: true,
    });
    expect(await journal.hasTaskMaterial('task_cleanup')).toBe(false);
    expect((await journal.get('task_cleanup')).state).toBe('activated');
  });
});
