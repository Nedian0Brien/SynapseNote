import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DatabaseDefinitionSchema,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ROWS = 400;
const SAMPLES = 7;

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_bench',
    key: 'bench',
    name: 'Bench',
    contract: {
      purpose: 'incremental cost fixture',
      canonicality: 'canonical',
      vocabulary: ['task'],
      freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_bench',
        key: 'bench',
        name: 'Bench',
        recordMeaning: 'One row',
        folder: 'rows',
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'owner.md', blockId: 'dbb_bench_primary' },
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

/** Enough prose that tokenizing it is a measurable share of one row's cost. */
const BODY = Array.from(
  { length: 12 },
  (_, line) => `Paragraph ${line} of the linked note body, with several searchable words in it.`,
).join('\n\n');

function ownerMarkdown(note: (row: number) => string): string {
  return [
    '<!-- synapsenote:database',
    'version=2',
    'database=db_bench',
    'source=ds_bench',
    'block=dbb_bench_primary',
    'columns=prop_title,prop_note',
    '-->',
    '',
    '| Document | Note |',
    '| --- | --- |',
    ...Array.from({ length: ROWS }, (_, row) => `| [[rows/row-${row}]] | ${note(row)} |`),
    '',
  ].join('\n');
}

async function seed() {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-v2-cost-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  mkdirSync(join(contentDir, 'rows'), { recursive: true });
  writeFileSync(
    join(projectDir, '.ok', 'databases', 'bench.yml'),
    serializeDatabaseManifestYaml(definition()),
  );
  for (let row = 0; row < ROWS; row += 1) {
    writeFileSync(
      join(contentDir, 'rows', `row-${row}.md`),
      `---\n_sn:\n  document_id: doc_row_${row}\n---\n# Row ${row}\n\n${BODY}\n`,
    );
  }
  writeFileSync(
    join(contentDir, 'owner.md'),
    ownerMarkdown((row) => `note ${row}`),
  );
  tempDirs.push(projectDir);
  const databaseStore = createDatabaseStore({ projectDir, contentDir });
  await databaseStore.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore });
  await index.rebuild();
  return { contentDir, index };
}

function medianCost(apply: (sample: number) => void): number {
  const timings: number[] = [];
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const start = performance.now();
    apply(sample);
    timings.push(performance.now() - start);
  }
  timings.sort((left, right) => left - right);
  return timings[Math.floor(timings.length / 2)] as number;
}

/**
 * An owner-table write reprojects every row, because the two owner-scoped
 * revisions every record carries are hashes over the whole table. Reprojecting
 * is cheap; refiling each row in the typed and lexical indexes is not, and
 * doing it for rows whose content did not move is the difference between a
 * write that costs what it changed and one that costs the table.
 *
 * Stated as a ratio rather than a duration so the guard means the same thing on
 * a slow machine as on a fast one: editing one row of a 400-row table must come
 * in well under editing all 400. Before the reconcile both cost the same, since
 * the projection was cleared and rebuilt either way — the ratio sat at ~1.0
 * against the ~8x headroom measured here.
 */
test('editing one row of a table costs far less than editing every row', async () => {
  const { contentDir, index } = await seed();

  const oneRow = medianCost((sample) => {
    const markdown = ownerMarkdown((row) => (row === 0 ? `note 0 rev ${sample}` : `note ${row}`));
    writeFileSync(join(contentDir, 'owner.md'), markdown);
    index.upsertPath('owner.md', markdown);
  });

  const everyRow = medianCost((sample) => {
    const markdown = ownerMarkdown((row) => `note ${row} rev ${sample}`);
    writeFileSync(join(contentDir, 'owner.md'), markdown);
    index.upsertPath('owner.md', markdown);
  });

  expect(index.snapshot().records).toHaveLength(ROWS);
  expect(oneRow).toBeLessThan(everyRow * 0.4);
});
