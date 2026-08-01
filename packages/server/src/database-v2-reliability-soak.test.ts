import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createDatabaseMarkdownRecordId,
  DatabaseDefinitionSchema,
  parseDatabaseMarkdownOwner,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseMarkdownTableWriter } from './database-markdown-table-writer.ts';
import { createDatabaseMigrationJournal } from './database-migration-journal.ts';
import { createDatabaseStore } from './database-store.ts';

const SUPPORTED_SOAK_ROWS = 50_000;
// Keep the owner at the supported row bound while limiting the number of
// linked Markdown files so Git checkout remains a practical local rehearsal.
// The remaining owner links intentionally stay unmaterialized while the source
// parser verifies that all 50k rows remain intact.
const LINKED_SOAK_ROWS = 5_000;
const SOAK_ITERATIONS = 10;

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_soak',
    key: 'soak',
    name: 'V2 reliability soak',
    contract: {
      purpose: 'Bounded v2 edit/reload/Git/migration recovery fixture',
      canonicality: 'canonical',
      vocabulary: ['soak'],
      freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_soak',
        key: 'soak',
        name: 'Soak rows',
        recordMeaning: 'One soak row',
        folder: 'soak',
        includeSubfolders: true,
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'soak.md', blockId: 'dbb_soak_primary' },
          titlePropertyId: 'prop_title',
          storedPropertyIds: ['prop_title', 'prop_notes'],
        },
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
          { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
        ],
      },
    ],
  });
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function seed(): Promise<{ projectDir: string; contentDir: string; remoteDir: string }> {
  const projectDir = await mkdtemp(join(tmpdir(), 'synapsenote-v2-soak-'));
  const remoteDir = await mkdtemp(join(tmpdir(), 'synapsenote-v2-soak-remote-'));
  const contentDir = join(projectDir, 'content');
  await mkdir(join(projectDir, '.ok', 'databases'), { recursive: true });
  await mkdir(join(contentDir, 'soak'), { recursive: true });
  await writeFile(
    join(projectDir, '.ok', 'databases', 'soak.yml'),
    serializeDatabaseManifestYaml(definition()),
    'utf8',
  );
  const rows = Array.from({ length: SUPPORTED_SOAK_ROWS }, (_, index) => {
    const id = String(index).padStart(5, '0');
    const shard = String(Math.floor(index / 500)).padStart(3, '0');
    return `| [[soak/${shard}/item-${id}]] | initial |`;
  });
  await writeFile(
    join(contentDir, 'soak.md'),
    [
      '<!-- synapsenote:database',
      'version=2',
      'database=db_soak',
      'source=ds_soak',
      'block=dbb_soak_primary',
      'columns=prop_title,prop_notes',
      '-->',
      '',
      '| Title | Notes |',
      '| --- | --- |',
      ...rows,
      '',
    ].join('\n'),
    'utf8',
  );
  for (let start = 0; start < LINKED_SOAK_ROWS; start += 500) {
    const end = Math.min(start + 500, LINKED_SOAK_ROWS);
    await mkdir(join(contentDir, 'soak', String(Math.floor(start / 500)).padStart(3, '0')), {
      recursive: true,
    });
    const writes = Array.from({ length: end - start }, (_, offset) => {
      const index = start + offset;
      const id = String(index).padStart(5, '0');
      const shard = String(Math.floor(index / 500)).padStart(3, '0');
      return writeFile(
        join(contentDir, 'soak', shard, `item-${id}.md`),
        `---\n_sn:\n  document_id: doc_soak_${id}\n---\n# Item ${id}\n\nSoak fixture ${id}\n`,
        'utf8',
      );
    });
    await Promise.all(writes);
  }
  git(projectDir, ['init', '-q', '-b', 'main']);
  git(projectDir, ['config', 'user.email', 'soak@example.invalid']);
  git(projectDir, ['config', 'user.name', 'SynapseNote soak']);
  git(projectDir, ['add', '.']);
  git(projectDir, ['commit', '-qm', 'seed v2 soak fixture']);
  git(remoteDir, ['init', '-q', '--bare']);
  git(projectDir, ['remote', 'add', 'origin', remoteDir]);
  git(projectDir, ['push', '-q', '-u', 'origin', 'main']);
  return { projectDir, contentDir, remoteDir };
}

describe('v2 reliability soak', () => {
  test('repeats edit, reload, Git branch checkout, migration rollback, and lock checks', async () => {
    const { projectDir, contentDir, remoteDir } = await seed();
    const heapStart = process.memoryUsage().heapUsed;
    let peakHeap = heapStart;
    try {
      const store = createDatabaseStore({ projectDir, contentDir });
      await store.reload();
      const writer = createDatabaseMarkdownTableWriter({
        projectDir,
        contentDir,
        databaseStore: store,
      });
      const recordId = createDatabaseMarkdownRecordId('ds_soak', 'doc_soak_00000');
      const initialOwner = parseDatabaseMarkdownOwner(
        await readFile(join(contentDir, 'soak.md'), 'utf8'),
      );
      expect(initialOwner.ok).toBe(true);
      if (!initialOwner.ok) throw new Error(initialOwner.message);
      expect(initialOwner.owner.rows).toHaveLength(SUPPORTED_SOAK_ROWS);
      const migrationJournal = createDatabaseMigrationJournal(projectDir);

      for (let iteration = 0; iteration < SOAK_ITERATIONS; iteration += 1) {
        const ownerPath = join(contentDir, 'soak.md');
        const owner = await readFile(ownerPath, 'utf8');
        const ownerRevision = `sha256:${createHash('sha256').update(owner).digest('hex')}`;
        await writer.updateCell({
          databaseId: 'db_soak',
          sourceId: 'ds_soak',
          recordId,
          propertyId: 'prop_notes',
          value: `iteration-${iteration}`,
          expectedOwnerRevision: ownerRevision,
        });

        git(projectDir, ['add', 'content/soak.md']);
        git(projectDir, ['commit', '-qm', `soak iteration ${iteration}`]);
        git(projectDir, ['push', '-q', 'origin', 'main']);
        git(projectDir, ['fetch', '-q', 'origin']);
        const branch = `soak-${iteration}`;
        git(projectDir, ['branch', branch]);
        git(projectDir, ['checkout', '-q', branch]);
        git(projectDir, ['checkout', '-q', 'main']);

        const before = await readFile(ownerPath, 'utf8');
        const after = `${before}\n<!-- migration-rehearsal-${iteration} -->\n`;
        const taskId = `task_soak_${iteration}`;
        await migrationJournal.prepare({
          taskId,
          files: [{ path: 'content/soak.md', before, after }],
        });
        await writeFile(ownerPath, after, 'utf8');
        await migrationJournal.checkpoint(taskId, 'activated');
        await expect(migrationJournal.rollback(taskId)).resolves.toMatchObject({
          status: 'applied',
        });
        await expect(migrationJournal.cleanup(taskId)).resolves.toMatchObject({ removed: true });
        expect(await readFile(ownerPath, 'utf8')).toBe(before);

        if (iteration % 2 === 1) {
          const coldStore = createDatabaseStore({ projectDir, contentDir });
          await coldStore.reload();
          expect(coldStore.snapshot().databases).toHaveLength(1);
          const coldOwner = parseDatabaseMarkdownOwner(await readFile(ownerPath, 'utf8'));
          expect(coldOwner.ok).toBe(true);
          if (!coldOwner.ok) throw new Error(coldOwner.message);
          expect(coldOwner.owner.rows).toHaveLength(SUPPORTED_SOAK_ROWS);
          expect(coldOwner.owner.rows[0]?.cells[1]?.value).toBe(`iteration-${iteration}`);
        }
        peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
      }

      expect(peakHeap - heapStart).toBeLessThan(768 * 1024 * 1024);
      expect(await createDatabaseMigrationJournal(projectDir).listInflight()).toEqual([]);
      expect(await readFile(join(contentDir, 'soak.md'), 'utf8')).toContain('iteration-9');
      await expect(
        readFile(join(projectDir, '.ok', 'databases', '.commit.lock'), 'utf8'),
      ).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(projectDir, { recursive: true, force: true });
      await rm(remoteDir, { recursive: true, force: true });
    }
  }, 180_000);
});
