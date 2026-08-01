/**
 * Process-kill fixture for the generic v2 owner-table writer.
 *
 * The title mutation touches the linked document and owner table. Killing the
 * child after each atomic-write boundary must never be mistaken for a clean
 * commit: the journal reports `recovery_required` for a mixed pair and
 * `committed` only when both after hashes are present.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  DatabaseDefinitionSchema,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseMarkdownTableJournal } from './database-markdown-table-journal.ts';
import { createDatabaseMarkdownTableWriter } from './database-markdown-table-writer.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];
const SERVER_PACKAGE_ROOT = resolve(import.meta.dir, '..');

const CHILD_DRIVER = `
  const { join } = await import('node:path');
  const { writeFile } = await import('node:fs/promises');
  const { createDatabaseRecordIndex } = await import('./src/database-record-index.ts');
  const { createDatabaseStore } = await import('./src/database-store.ts');
  const { createDatabaseMarkdownTableWriter } = await import('./src/database-markdown-table-writer.ts');
  const projectDir = process.env.SYNAPSENOTE_WRITER_CRASH_PROJECT;
  const crashIndex = Number(process.env.SYNAPSENOTE_WRITER_CRASH_INDEX);
  if (!projectDir || !Number.isInteger(crashIndex) || crashIndex < 0) process.exit(91);
  const contentDir = join(projectDir, 'content');
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  let writes = 0;
  const writer = createDatabaseMarkdownTableWriter({
    projectDir,
    contentDir,
    databaseStore: store,
    databaseRecordIndex: index,
    atomicWrite: async (path, content) => {
      await writeFile(path, content, 'utf8');
      if (writes++ === crashIndex) process.kill(process.pid, 'SIGKILL');
    },
  });
  const owner = await import('node:fs/promises').then(({ readFile }) => readFile(join(contentDir, 'orders.md'), 'utf8'));
  const record = index.list()[0];
  if (!record) process.exit(92);
  const ownerRevision = 'sha256:' + (await import('node:crypto')).createHash('sha256').update(owner).digest('hex');
  await writer.updateTitle({
    databaseId: 'db_tasks',
    sourceId: 'ds_tasks',
    recordId: record.id,
    title: 'Renamed order',
    expectedOwnerRevision: ownerRevision,
  });
`;

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'writer crash fixture',
      canonicality: 'canonical',
      vocabulary: ['task'],
      freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_tasks',
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        folder: 'tasks',
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'orders.md', blockId: 'dbb_orders_primary' },
          titlePropertyId: 'prop_title',
          storedPropertyIds: ['prop_title', 'prop_notes', 'prop_status'],
        },
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
          { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
          { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
        ],
      },
    ],
  });
}

function seedProject(): {
  projectDir: string;
  contentDir: string;
  owner: string;
  document: string;
} {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-v2-writer-crash-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  mkdirSync(join(contentDir, 'orders'), { recursive: true });
  writeFileSync(
    join(projectDir, '.ok', 'databases', 'tasks.yml'),
    serializeDatabaseManifestYaml(definition()),
  );
  const owner = [
    '<!-- synapsenote:database',
    'version=2',
    'database=db_tasks',
    'source=ds_tasks',
    'block=dbb_orders_primary',
    'columns=prop_title,prop_notes,prop_status',
    '-->',
    '',
    '| Document | Notes | Status |',
    '| --- | --- | --- |',
    '| [[orders/alpha]] | First order | todo |',
    '',
  ].join('\n');
  const document = '---\n_sn:\n  document_id: doc_alpha\n---\n# Alpha order\n\nAlpha body\n';
  writeFileSync(join(contentDir, 'orders.md'), owner);
  writeFileSync(join(contentDir, 'orders/alpha.md'), document);
  tempDirs.push(projectDir);
  return { projectDir, contentDir, owner, document };
}

function runKilledChild(projectDir: string, crashIndex: number) {
  return Bun.spawnSync({
    cmd: ['bun', '--conditions=development', '-e', CHILD_DRIVER],
    cwd: SERVER_PACKAGE_ROOT,
    env: {
      ...process.env,
      NO_COLOR: '1',
      OTEL_SDK_DISABLED: 'true',
      SYNAPSENOTE_WRITER_CRASH_PROJECT: projectDir,
      SYNAPSENOTE_WRITER_CRASH_INDEX: String(crashIndex),
    },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('v2 owner-table writer process-kill recovery', () => {
  test('reports mixed files as recovery-required and only commits when both after hashes exist', async () => {
    for (const crashIndex of [0, 1]) {
      const { projectDir, contentDir, owner, document } = seedProject();
      const child = runKilledChild(projectDir, crashIndex);
      expect(child.exitCode).not.toBe(0);
      const store = createDatabaseStore({ projectDir, contentDir });
      await store.reload();
      const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
      await index.rebuild();
      const writer = createDatabaseMarkdownTableWriter({
        projectDir,
        contentDir,
        databaseStore: store,
        databaseRecordIndex: index,
      });
      const recovered = await writer.recover();
      expect(recovered).toHaveLength(1);
      const state = recovered[0]?.state;
      const record = index.list()[0];
      if (!record) throw new Error('writer crash fixture record is missing');
      if (crashIndex === 0) {
        expect(state).toBe('recovery_required');
        expect(readFileSync(join(contentDir, 'orders.md'), 'utf8')).toBe(owner);
        expect(readFileSync(join(contentDir, 'orders/alpha.md'), 'utf8')).toContain(
          'Renamed order',
        );
      } else {
        expect(state).toBe('committed');
        expect(readFileSync(join(contentDir, 'orders.md'), 'utf8')).toContain('Renamed order');
        expect(readFileSync(join(contentDir, 'orders/alpha.md'), 'utf8')).toContain(
          'Renamed order',
        );
      }
      const journal = await createDatabaseMarkdownTableJournal(projectDir).listInflight();
      expect(journal).toHaveLength(crashIndex === 0 ? 1 : 0);
      if (crashIndex === 0) {
        // The killed holder cannot release the advisory lock. Recovery tooling
        // clears that stale lock before surfacing the durable journal state.
        rmSync(join(projectDir, '.ok', 'databases', '.commit.lock'), { force: true });
        await expect(
          writer.updateCell({
            databaseId: 'db_tasks',
            sourceId: 'ds_tasks',
            recordId: record.id,
            propertyId: 'prop_notes',
            value: 'blocked',
            expectedOwnerRevision: `sha256:${createHash('sha256').update(owner).digest('hex')}`,
          }),
        ).rejects.toMatchObject({ code: 'recovery_required' });
      }
      expect(document).toContain('Alpha body');
    }
  }, 30_000);

  test('survives repeated edit/reload/undo cycles without lock or snapshot drift', async () => {
    const { projectDir, contentDir, owner } = seedProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.reload();
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    const writer = createDatabaseMarkdownTableWriter({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
    });
    let lastReceipt: Awaited<ReturnType<typeof writer.updateCell>>['receipt'] | null = null;
    for (let iteration = 0; iteration < 25; iteration += 1) {
      const currentOwner = readFileSync(join(contentDir, 'orders.md'), 'utf8');
      const currentRecord = index.list()[0];
      if (!currentRecord) throw new Error('soak record is missing');
      const result = await writer.updateCell({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: currentRecord.id,
        propertyId: 'prop_notes',
        value: `iteration-${iteration}`,
        expectedOwnerRevision: `sha256:${createHash('sha256').update(currentOwner).digest('hex')}`,
      });
      lastReceipt = result.receipt;
      expect(index.getById(currentRecord.id)?.values.prop_notes).toBe(`iteration-${iteration}`);
      if (iteration % 5 === 4) {
        const coldStore = createDatabaseStore({ projectDir, contentDir });
        await coldStore.reload();
        const coldIndex = createDatabaseRecordIndex({ contentDir, databaseStore: coldStore });
        await coldIndex.rebuild();
        expect(coldIndex.getById(currentRecord.id)?.values.prop_notes).toBe(
          `iteration-${iteration}`,
        );
      }
    }
    if (!lastReceipt) throw new Error('soak produced no receipt');
    await writer.undo({ receipt: lastReceipt });
    expect(readFileSync(join(contentDir, 'orders.md'), 'utf8')).toContain('iteration-23');
    expect(await writer.recover()).toEqual([]);
    expect(readFileSync(join(contentDir, 'orders.md'), 'utf8')).not.toBe(owner);
  }, 30_000);

  test('requires an explicit independent identity for copy and undoes the new row atomically', async () => {
    const { projectDir, contentDir, owner, document } = seedProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.reload();
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    const writer = createDatabaseMarkdownTableWriter({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      generateUuid: () => '00000000-0000-0000-0000-0000000000cc',
    });
    const source = index.list()[0];
    if (!source) throw new Error('copy source is missing');
    const currentOwner = readFileSync(join(contentDir, 'orders.md'), 'utf8');
    const ownerRevision = `sha256:${createHash('sha256').update(currentOwner).digest('hex')}`;
    await expect(
      writer.copyRow({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: source.id,
        mode: 'linked_view',
        documentPath: 'orders/reference.md',
        expectedOwnerRevision: ownerRevision,
      }),
    ).rejects.toMatchObject({ code: 'reference_only' });

    const copied = await writer.copyRow({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      recordId: source.id,
      mode: 'duplicate_document',
      documentPath: 'orders/copy.md',
      documentId: 'doc_copy',
      expectedOwnerRevision: ownerRevision,
    });
    expect(copied.receipt.operation).toBe('copy_row');
    expect(copied.receipt.recordId).not.toBe(source.id);
    expect(readFileSync(join(contentDir, 'orders/alpha.md'), 'utf8')).toBe(document);
    expect(readFileSync(join(contentDir, 'orders/copy.md'), 'utf8')).toContain(
      'document_id: doc_copy',
    );
    expect(readFileSync(join(contentDir, 'orders.md'), 'utf8')).toContain('[[orders/copy]]');
    await writer.undo({ receipt: copied.receipt });
    expect(readFileSync(join(contentDir, 'orders/alpha.md'), 'utf8')).toBe(document);
    expect(readFileSync(join(contentDir, 'orders.md'), 'utf8')).toBe(owner);
    expect(() => readFileSync(join(contentDir, 'orders/copy.md'))).toThrow();
  });
});
