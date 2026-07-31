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
import {
  applyDatabaseRecordDiskEvent,
  createDatabaseRecordIndex,
  type DatabaseRecordIndex,
} from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Seeded so a failure names a sequence that can be replayed exactly. */
function randomSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'incremental equivalence fixture',
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
        folder: 'rows',
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'owner.md', blockId: 'dbb_owner_primary' },
          titlePropertyId: 'prop_title',
          storedPropertyIds: ['prop_title', 'prop_note'],
        },
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
          { id: 'prop_note', key: 'note', name: 'Note', type: 'text' },
        ],
      },
    ],
  });
}

const OWNER_PATH = 'owner.md';

function seedProject() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-v2-equivalence-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  mkdirSync(join(contentDir, 'rows'), { recursive: true });
  writeFileSync(
    join(projectDir, '.ok', 'databases', 'tasks.yml'),
    serializeDatabaseManifestYaml(definition()),
  );
  writeFileSync(
    join(contentDir, OWNER_PATH),
    [
      '<!-- synapsenote:database',
      'version=2',
      'database=db_tasks',
      'source=ds_tasks',
      'block=dbb_owner_primary',
      'columns=prop_title,prop_note',
      '-->',
      '',
      '| Document | Note |',
      '| --- | --- |',
      '',
    ].join('\n'),
  );
  tempDirs.push(projectDir);
  return { projectDir, contentDir };
}

function ownerRevision(contentDir: string): string {
  return `sha256:${createHash('sha256')
    .update(readFileSync(join(contentDir, OWNER_PATH), 'utf8'))
    .digest('hex')}`;
}

async function freshRebuildRevision(projectDir: string, contentDir: string): Promise<string> {
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  return index.snapshot().revision;
}

/**
 * The incremental path must land the index in exactly the state a full rebuild
 * of the same files would.
 *
 * `snapshot().revision` hashes every record and every issue, so one comparison
 * covers the three ways an incremental apply goes wrong quietly: a removed row
 * left behind as a record nobody can reach, a cross-row invariant computed
 * against a stale set, and an issue that stays attached to a row that has since
 * been fixed. None of those are visible as a crash — they are visible as the
 * user reading a table that does not match the file.
 *
 * This exists before the projection is made incremental per row, so that the
 * change lands against a net rather than a hope.
 */
describe('v2 incremental index equals a full rebuild', () => {
  async function harness() {
    const { projectDir, contentDir } = seedProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.reload();
    const index: DatabaseRecordIndex = createDatabaseRecordIndex({
      contentDir,
      databaseStore: store,
    });
    await index.rebuild();
    const writer = createDatabaseMarkdownTableWriter({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      // Route the writer's own writes through the incremental path, which is
      // what the server does.
      refreshDatabaseIndex: async (writes?: readonly { path: string; markdown: string }[]) => {
        if (!writes || writes.length === 0) {
          await index.rebuild();
          return;
        }
        for (const write of writes) {
          applyDatabaseRecordDiskEvent(index, contentDir, {
            kind: 'update',
            path: join(contentDir, write.path),
            docName: write.path.replace(/\.mdx?$/i, ''),
            content: write.markdown,
          });
        }
      },
    } as Parameters<typeof createDatabaseMarkdownTableWriter>[0]);
    return { projectDir, contentDir, index, writer };
  }

  async function expectEquivalent(
    projectDir: string,
    contentDir: string,
    index: DatabaseRecordIndex,
    step: string,
  ) {
    const rebuilt = await freshRebuildRevision(projectDir, contentDir);
    expect(`${step}: ${index.snapshot().revision}`).toBe(`${step}: ${rebuilt}`);
  }

  test('a single create leaves the same index a rebuild would', async () => {
    const { projectDir, contentDir, index, writer } = await harness();
    await writer.createRow({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      documentPath: 'rows/first.md',
      documentMarkdown: '# First\n',
      values: { prop_note: 'one' },
      expectedOwnerRevision: ownerRevision(contentDir),
    });
    await expectEquivalent(projectDir, contentDir, index, 'create');
  });

  test('a delete removes the record rather than leaving it unreachable', async () => {
    const { projectDir, contentDir, index, writer } = await harness();
    const created = await writer.createRow({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      documentPath: 'rows/doomed.md',
      documentMarkdown: '# Doomed\n',
      expectedOwnerRevision: ownerRevision(contentDir),
    });
    await expectEquivalent(projectDir, contentDir, index, 'before delete');
    await writer.deleteRow({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      recordId: created.receipt.recordId,
      expectedOwnerRevision: ownerRevision(contentDir),
    });
    await expectEquivalent(projectDir, contentDir, index, 'after delete');
  });

  /**
   * The sequence matters more than any single operation: a delta is wrong in
   * the states it fails to reach, not in the ones a hand-written case happens
   * to visit.
   */
  test('a random sequence of writes never diverges from a rebuild', async () => {
    const { projectDir, contentDir, index, writer } = await harness();
    const random = randomSource(20260731);
    const live: string[] = [];
    let created = 0;

    for (let step = 0; step < 24; step += 1) {
      const roll = random();
      const label = `step ${step}`;
      if (live.length === 0 || roll < 0.55) {
        created += 1;
        const name = `rows/row-${created}.md`;
        const result = await writer.createRow({
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          documentPath: name,
          documentMarkdown: `# Row ${created}\n`,
          values: { prop_note: `note ${created}` },
          expectedOwnerRevision: ownerRevision(contentDir),
        });
        live.push(result.receipt.recordId);
      } else if (roll < 0.8) {
        const recordId = live[Math.floor(random() * live.length)] as string;
        await writer.updateCell({
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          recordId,
          propertyId: 'prop_note',
          value: `edited at ${step}`,
          expectedOwnerRevision: ownerRevision(contentDir),
        });
      } else {
        const at = Math.floor(random() * live.length);
        const recordId = live[at] as string;
        await writer.deleteRow({
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          recordId,
          expectedOwnerRevision: ownerRevision(contentDir),
        });
        live.splice(at, 1);
      }
      await expectEquivalent(projectDir, contentDir, index, label);
    }
    expect(live.length).toBeGreaterThan(0);
  });
});
