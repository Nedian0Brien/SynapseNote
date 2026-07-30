import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DatabaseDefinitionSchema,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseMarkdownTableWriter } from './database-markdown-table-writer.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'row create identity fixture',
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
        folder: 'orders',
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'orders.md', blockId: 'dbb_orders_primary' },
          titlePropertyId: 'prop_title',
          storedPropertyIds: ['prop_title'],
        },
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
        ],
      },
    ],
  });
}

async function fixture(rowCount: number) {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-v2-row-identity-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  mkdirSync(join(contentDir, 'orders'), { recursive: true });
  writeFileSync(
    join(projectDir, '.ok', 'databases', 'tasks.yml'),
    serializeDatabaseManifestYaml(definition()),
  );
  const rows: string[] = [];
  for (let index = 0; index < rowCount; index += 1) {
    rows.push(`| [[orders/row-${index}]] |`);
    writeFileSync(
      join(contentDir, 'orders', `row-${index}.md`),
      `---\n_sn:\n  document_id: doc_row_${index}\n---\n# Row ${index}\n`,
    );
  }
  const owner = [
    '<!-- synapsenote:database',
    'version=2',
    'database=db_tasks',
    'source=ds_tasks',
    'block=dbb_orders_primary',
    'columns=prop_title',
    '-->',
    '',
    '| Document |',
    '| --- |',
    ...rows,
    '',
  ].join('\n');
  writeFileSync(join(contentDir, 'orders.md'), owner);
  tempDirs.push(projectDir);

  const databaseStore = createDatabaseStore({ projectDir, contentDir });
  await databaseStore.reload();
  const databaseRecordIndex = createDatabaseRecordIndex({ contentDir, databaseStore });
  await databaseRecordIndex.rebuild();
  let documentReads = 0;
  const writer = createDatabaseMarkdownTableWriter({
    projectDir,
    contentDir,
    databaseStore,
    databaseRecordIndex,
    fs: {
      readFile: async (path: string) => {
        if (/orders[/\\]row-\d+\.md$/.test(path)) documentReads += 1;
        return readFileSync(path, 'utf8');
      },
    },
  } as Parameters<typeof createDatabaseMarkdownTableWriter>[0]);
  const ownerRevision = `sha256:${createHash('sha256').update(owner).digest('hex')}`;
  return { writer, ownerRevision, contentDir, reads: () => documentReads };
}

/**
 * Creating a row used to resolve and READ every existing row's linked document
 * to prove the new identity was not already taken — O(rows) file reads on an
 * insert, 28ms of a 54ms create at ~35 rows and growing from there. It can only
 * ever find something when the identity came from outside the writer, so the
 * scan now runs only in that case.
 */
describe('v2 row create identity check', () => {
  test('does not read the existing rows when it mints the identity itself', async () => {
    const { writer, ownerRevision, reads } = await fixture(12);
    const before = reads();
    const result = await writer.createRow({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      documentPath: 'orders/fresh.md',
      documentMarkdown: '# Fresh\n',
      expectedOwnerRevision: ownerRevision,
    });
    expect(result.changed).toBe(true);
    expect(reads() - before).toBe(0);
  });

  test('still refuses an identity that already belongs to a row', async () => {
    const { writer, ownerRevision } = await fixture(3);
    await expect(
      writer.createRow({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        documentPath: 'orders/clash.md',
        // Same identity the seeded `row-1` document carries.
        documentMarkdown: '---\n_sn:\n  document_id: doc_row_1\n---\n# Clash\n',
        expectedOwnerRevision: ownerRevision,
      }),
    ).rejects.toThrow(/already belongs to record/);
  });

  test('still refuses an explicitly supplied identity that is taken', async () => {
    const { writer, ownerRevision } = await fixture(3);
    await expect(
      writer.createRow({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        documentPath: 'orders/clash.md',
        documentMarkdown: '# Clash\n',
        documentId: 'doc_row_2',
        expectedOwnerRevision: ownerRevision,
      }),
    ).rejects.toThrow(/already belongs to record/);
  });

  test('a minted identity still produces a readable row', async () => {
    const { writer, ownerRevision, contentDir } = await fixture(2);
    const result = await writer.createRow({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      documentPath: 'orders/fresh.md',
      documentMarkdown: '# Fresh\n',
      expectedOwnerRevision: ownerRevision,
    });
    expect(result.receipt.recordId).toMatch(/^rec_/);
    const owner = readFileSync(join(contentDir, 'orders.md'), 'utf8');
    expect(owner).toContain('[[orders/fresh]]');
    expect(readFileSync(join(contentDir, 'orders', 'fresh.md'), 'utf8')).toContain('document_id:');
  });
});
