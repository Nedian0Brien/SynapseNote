import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planDatabaseMarkdownIdentityRepair } from '@nedian0brien/synapsenote-core';
import { createDatabaseMigrationJournal } from './database-migration-journal.ts';

describe('v2 recovery runbook rehearsal', () => {
  test('follows inspect → rollback → cleanup on a seeded mixed migration', async () => {
    const runbook = await readFile(join(import.meta.dir, '../../../docs/content/reference/database-recovery.mdx'), 'utf8');
    expect(runbook).toContain('preview-cleanup');
    expect(runbook).toContain('recovery_required');
    const projectDir = await mkdtemp(join(tmpdir(), 'synapsenote-v2-runbook-'));
    try {
      const target = 'content/tasks.md';
      const before = 'v1 owner bytes\n';
      const after = 'v2 owner bytes\n';
      await mkdir(join(projectDir, 'content'), { recursive: true });
      await writeFile(join(projectDir, target), after);
      const journal = createDatabaseMigrationJournal(projectDir);
      await journal.prepare({ taskId: 'task_runbook', files: [{ path: target, before, after }] });
      await journal.checkpoint('task_runbook', 'activated');

      const inspected = await journal.get('task_runbook');
      expect(inspected.state).toBe('activated');
      expect(inspected.files).toMatchObject([{ path: target, beforeSha256: expect.stringMatching(/^sha256:/) }]);
      await expect(journal.rollback('task_runbook')).resolves.toMatchObject({ status: 'applied', restored: 1 });
      expect(await readFile(join(projectDir, target), 'utf8')).toBe(before);
      await expect(journal.cleanup('task_runbook')).resolves.toEqual({ taskId: 'task_runbook', removed: true });
      expect(await journal.hasTaskMaterial('task_runbook')).toBe(false);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });

  test('keeps identity/parser procedures read-only and explicit', () => {
    const owner = '<!-- synapsenote:database\nversion=2\ndatabase=db_tasks\nsource=ds_tasks\nblock=dbb_tasks\ncolumns=prop_title\n-->\n\n| Document |\n| --- |\n| [[missing]] |\n';
    const plan = planDatabaseMarkdownIdentityRepair({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      owners: [
        { path: 'tasks-a.md', markdown: owner },
        { path: 'tasks-b.md', markdown: owner },
      ],
      documents: [{ path: 'tasks/alpha.md', markdown: '# Alpha\n' }],
    });
    expect(plan.actions).toEqual([]);
    expect(plan.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['duplicate_owner', 'missing_document_id']),
    );
  });
});
