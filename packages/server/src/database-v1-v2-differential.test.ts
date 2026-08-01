import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  compareDatabaseMigrationLogicalSnapshots,
  DatabaseDefinitionSchema,
  DatabaseQuerySchema,
  planDatabaseMarkdownV2Migration,
  queryDatabaseRecords,
  serializeDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

function v1Definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Differential v1/v2 reader corpus',
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
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title', required: true },
          { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
          {
            id: 'prop_status',
            key: 'status',
            name: 'Status',
            type: 'select',
            options: [
              { id: 'opt_todo', key: 'todo', name: 'Todo' },
              { id: 'opt_done', key: 'done', name: 'Done' },
            ],
          },
          { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
        ],
      },
    ],
  });
}

const RECORDS = [
  {
    path: 'tasks/alpha.md',
    documentId: 'doc_alpha',
    legacyId: 'rec_alpha',
    title: 'Alpha',
    notes: 'First task body',
    status: 'todo',
    score: 2,
    body: 'Alpha body with searchable phrase',
  },
  {
    path: 'tasks/beta.md',
    documentId: 'doc_beta',
    legacyId: 'rec_beta',
    title: 'Beta',
    notes: 'Second task body',
    status: 'done',
    score: 8,
    body: 'Beta body with searchable phrase',
  },
] as const;

function recordMarkdown(record: (typeof RECORDS)[number]): string {
  return [
    '---',
    '_sn:',
    '  database_id: db_tasks',
    '  source_id: ds_tasks',
    `  record_id: ${record.legacyId}`,
    `title: ${record.title}`,
    `notes: ${record.notes}`,
    `status: ${record.status}`,
    `score: ${record.score}`,
    '---',
    record.body,
    '',
  ].join('\n');
}

function seedV1Workspace(): {
  projectDir: string;
  contentDir: string;
  definition: ReturnType<typeof v1Definition>;
} {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-differential-v1-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(projectDir, '.ok', 'databases'), { recursive: true });
  mkdirSync(join(contentDir, 'tasks'), { recursive: true });
  const definition = v1Definition();
  writeFileSync(
    join(projectDir, '.ok', 'databases', 'tasks.yml'),
    serializeDatabaseManifestYaml(definition),
  );
  for (const record of RECORDS)
    writeFileSync(join(contentDir, record.path), recordMarkdown(record));
  tempDirs.push(projectDir);
  return { projectDir, contentDir, definition };
}

async function readIndex(projectDir: string, contentDir: string) {
  const store = createDatabaseStore({ projectDir, contentDir });
  await store.reload();
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  return { store, index };
}

function querySnapshot(value: ReturnType<typeof queryDatabaseRecords>) {
  return {
    sourceId: value.sourceId,
    matched: value.matched,
    returned: value.returned,
    isComplete: value.isComplete,
    truncatedBy: value.truncatedBy,
    records: value.records.map((record) => ({ id: record.id, values: record.values })),
    aggregation: value.aggregation,
  };
}

describe('v1/v2 database reader differential', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  test('keeps logical records, query semantics, and search provenance equal across storage readers', async () => {
    const v1 = seedV1Workspace();
    const v1Runtime = await readIndex(v1.projectDir, v1.contentDir);
    const v1Records = v1Runtime.index.list('db_tasks', 'ds_tasks');
    expect(v1Records).toHaveLength(RECORDS.length);

    const migration = planDatabaseMarkdownV2Migration({
      definition: v1.definition,
      owners: [{ sourceId: 'ds_tasks', path: 'tasks.md', blockId: 'dbb_tasks_primary' }],
      records: RECORDS.map((record) => ({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        path: record.path,
        markdown: recordMarkdown(record),
      })),
      migrationCommittedAt: '2026-07-27T00:00:00.000Z',
    });
    expect(migration.status).toBe('ready');
    if (migration.status !== 'ready' || !migration.definition) return;

    const v2ProjectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-differential-v2-'));
    const v2ContentDir = join(v2ProjectDir, 'content');
    mkdirSync(join(v2ProjectDir, '.ok', 'databases'), { recursive: true });
    const v2Manifest = serializeDatabaseManifestYaml(migration.definition);
    writeFileSync(join(v2ProjectDir, '.ok', 'databases', 'tasks.yml'), v2Manifest);
    for (const [path, markdown] of Object.entries(migration.ownerDocuments)) {
      mkdirSync(dirname(join(v2ContentDir, path)), { recursive: true });
      writeFileSync(join(v2ContentDir, path), markdown);
    }
    for (const [path, markdown] of Object.entries(migration.linkedDocuments)) {
      mkdirSync(dirname(join(v2ContentDir, path)), { recursive: true });
      writeFileSync(join(v2ContentDir, path), markdown);
    }
    tempDirs.push(v2ProjectDir);

    const v2Runtime = await readIndex(v2ProjectDir, v2ContentDir);
    const v2Records = v2Runtime.index.list('db_tasks', 'ds_tasks');
    const aliases = new Map(
      migration.aliases.map((alias) => [alias.legacyRecordId, alias.canonicalRecordId]),
    );
    const canonicalId = (legacyId: string): string => aliases.get(legacyId) ?? legacyId;
    const logical = compareDatabaseMigrationLogicalSnapshots({
      expected: v1Records.map((record) => ({
        canonicalRecordId: canonicalId(record.id),
        sourceId: record.sourceId,
        values: record.values,
        invalidValues: record.invalidValues,
      })),
      actual: v2Records,
    });
    expect(logical).toMatchObject({
      passed: true,
      expectedCount: RECORDS.length,
      actualCount: RECORDS.length,
    });
    expect(v2Records.map((record) => record.id).sort()).toEqual(
      v1Records.map((record) => canonicalId(record.id)).sort(),
    );

    const query = DatabaseQuerySchema.parse({
      where: { propertyId: 'prop_score', operator: 'gte', value: 2 },
      sort: [{ propertyId: 'prop_score', direction: 'desc' }],
      select: ['prop_title', 'prop_status', 'prop_score'],
      aggregate: {
        calculations: [
          { id: 'records', function: 'count_all' },
          { id: 'score_sum', function: 'sum', propertyId: 'prop_score' },
        ],
      },
      page: { limit: 10 },
    });
    const v1Source = v1Runtime.store.getById('db_tasks')?.sources[0];
    const v2Source = v2Runtime.store.getById('db_tasks')?.sources[0];
    if (!v1Source || !v2Source) throw new Error('differential fixture source is missing');
    const v1Query = queryDatabaseRecords({
      source: v1Source,
      records: v1Records,
      snapshotRevision: 'snapshot:differential-v1-v2',
      query,
    });
    const v2Query = queryDatabaseRecords({
      source: v2Source,
      records: v2Records,
      snapshotRevision: 'snapshot:differential-v1-v2',
      query,
    });
    expect(querySnapshot(v2Query)).toEqual({
      ...querySnapshot(v1Query),
      records: querySnapshot(v1Query).records.map((record) => ({
        ...record,
        id: canonicalId(record.id),
      })),
    });

    const searchInput = {
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      text: 'searchable phrase',
      propertyIds: ['prop_title', 'prop_notes', 'prop_status', 'prop_score'],
      titlePropertyId: 'prop_title',
      includeBody: true,
      limit: 10,
    } as const;
    const normalizeSearch = (result: ReturnType<typeof v1Runtime.index.searchText>) => ({
      matched: result.matched,
      returned: result.returned,
      hits: result.hits.map((hit) => ({
        recordId: canonicalId(hit.recordId),
        field: hit.field,
        propertyId: hit.propertyId,
        score: hit.score,
        matchedBy: hit.matchedBy,
        evidence: hit.evidence.map((entry) => ({
          recordId: canonicalId(entry.recordId),
          field: entry.field,
          propertyId: entry.propertyId,
          matchedTerms: entry.matchedTerms,
          snippet: entry.snippet,
        })),
      })),
    });
    expect(normalizeSearch(v2Runtime.index.searchText(searchInput))).toEqual(
      normalizeSearch(v1Runtime.index.searchText(searchInput)),
    );
    expect(readFileSync(join(v2ContentDir, 'tasks.md'), 'utf8')).toContain('synapsenote:database');
  });
});
