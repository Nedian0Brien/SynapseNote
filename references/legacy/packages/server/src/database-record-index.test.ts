import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import {
  applyDatabaseRecordDiskEvent,
  createDatabaseRecordIndex,
  DATABASE_LEXICAL_MAX_EVIDENCE_PER_HIT,
  DATABASE_LEXICAL_MAX_HITS,
  DATABASE_LEXICAL_MAX_TERMS,
  DatabaseLexicalSearchLimitError,
} from './database-record-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

function tempProject(): { projectDir: string; contentDir: string } {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-database-index-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(join(contentDir, 'tasks'), { recursive: true });
  tempDirs.push(projectDir);
  return { projectDir, contentDir };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_tasks',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Track tasks',
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
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
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
        ],
      },
    ],
  });
}

function record(recordId: string, title: string, status: 'todo' | 'done'): string {
  return `---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: ${recordId}\ntitle: ${title}\nstatus: ${status}\n---\nBody for ${title}\n`;
}

describe('DatabaseRecordIndex rebuild', () => {
  test('projects property-only records without cloning canonical Markdown bodies', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    writeFileSync(join(contentDir, 'tasks', 'alpha.md'), record('rec_alpha', 'Alpha', 'todo'));

    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();

    expect(index.list('db_tasks', 'ds_tasks')[0]?.body).toBe('Body for Alpha\n');
    expect(index.list('db_tasks', 'ds_tasks', { includeBody: false })[0]).toMatchObject({
      id: 'rec_alpha',
      values: { prop_title: 'Alpha', prop_status: 'opt_todo' },
      body: '',
    });
    expect(index.getById('rec_alpha')?.body).toBe('Body for Alpha\n');
  });

  test('indexes externally invalid property values as visible untyped diagnostics', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    writeFileSync(
      join(contentDir, 'tasks', 'invalid-value.md'),
      record('rec_invalid_value', 'Invalid value', 'todo').replace(
        'status: todo',
        'status: unknown',
      ),
    );

    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    const rebuilt = await index.rebuild();
    expect(rebuilt).toMatchObject({ indexed: 1, invalid: 1 });
    expect(index.getById('rec_invalid_value')).toMatchObject({
      values: { prop_title: 'Invalid value' },
      invalidValues: { prop_status: 'unknown' },
      issues: [{ propertyId: 'prop_status', code: 'unknown_select_option' }],
    });
    expect(index.findByProperty('prop_status', 'unknown')).toEqual([]);
    expect(index.snapshot().issues).toEqual([
      expect.objectContaining({
        code: 'invalid_record',
        recordId: 'rec_invalid_value',
        recordIssues: [expect.objectContaining({ propertyId: 'prop_status' })],
      }),
    ]);
  });

  test('derives metadata time properties from canonical identity and external file times', async () => {
    const { projectDir, contentDir } = tempProject();
    const temporal = definition();
    temporal.sources[0]?.properties.push(
      {
        id: 'prop_created_time',
        key: 'created_time',
        name: 'Created time',
        type: 'created_time',
        required: false,
        aliases: [],
        semantics: {
          constraints: { unique: false },
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      },
      {
        id: 'prop_last_edited_time',
        key: 'last_edited_time',
        name: 'Last edited time',
        type: 'last_edited_time',
        required: false,
        aliases: [],
        semantics: {
          constraints: { unique: false },
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      },
      {
        id: 'prop_created_by',
        key: 'created_by',
        name: 'Created by',
        type: 'created_by',
        required: false,
        aliases: [],
        semantics: {
          constraints: { unique: false },
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      },
      {
        id: 'prop_last_edited_by',
        key: 'last_edited_by',
        name: 'Last edited by',
        type: 'last_edited_by',
        required: false,
        aliases: [],
        semantics: {
          constraints: { unique: false },
          inferencePolicy: 'explicit_only',
          sensitivity: 'inherit',
        },
      },
    );
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(temporal);
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    index.upsertPath(
      'tasks/timed.md',
      record('rec_timed', 'Timed', 'todo').replace(
        '  record_id: rec_timed',
        '  record_id: rec_timed\n  created_at: 2026-07-18T08:00:00.000Z\n  last_edited_at: 2026-07-19T08:00:00.000Z\n  created_by: { kind: agent, principal_id: agent:indexer }\n  last_edited_by: { kind: sync, principal_id: sync:remote }',
      ),
      {
        createdAt: '2026-07-17T08:00:00.000Z',
        lastEditedAt: '2026-07-19T08:00:00.500Z',
      },
    );
    expect(index.getById('rec_timed')?.values).toMatchObject({
      prop_created_time: '2026-07-18T08:00:00.000Z',
      prop_last_edited_time: '2026-07-19T08:00:00.500Z',
      prop_created_by: 'agent|agent:indexer',
      prop_last_edited_by: 'sync|sync:remote',
    });
    const externallyEdited = record('rec_timed', 'Edited outside SynapseNote', 'todo').replace(
      '  record_id: rec_timed',
      '  record_id: rec_timed\n  created_at: 2026-07-18T08:00:00.000Z\n  last_edited_at: 2026-07-19T08:00:00.000Z\n  created_by: { kind: agent, principal_id: agent:indexer }\n  last_edited_by: { kind: sync, principal_id: sync:remote }',
    );
    applyDatabaseRecordDiskEvent(index, contentDir, {
      kind: 'update',
      path: join(contentDir, 'tasks', 'timed.md'),
      docName: 'tasks/timed',
      content: externallyEdited,
    });
    expect(index.getById('rec_timed')?.values.prop_last_edited_by).toBe('filesystem|local');
  });

  test('diagnoses externally introduced duplicate values for every unique property', async () => {
    const { projectDir, contentDir } = tempProject();
    const constrained = definition();
    const title = constrained.sources[0]?.properties.find((property) => property.type === 'title');
    if (!title) throw new Error('title property missing');
    title.semantics = {
      ...title.semantics,
      constraints: { ...title.semantics.constraints, unique: true },
    };
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(constrained);
    writeFileSync(join(contentDir, 'tasks', 'one.md'), record('rec_one', 'Same', 'todo'));
    writeFileSync(join(contentDir, 'tasks', 'two.md'), record('rec_two', 'Same', 'done'));

    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    expect(index.snapshot().issues).toEqual([
      expect.objectContaining({
        code: 'duplicate_unique_value',
        path: 'tasks/one.md',
        propertyId: title.id,
      }),
      expect.objectContaining({
        code: 'duplicate_unique_value',
        path: 'tasks/two.md',
        propertyId: title.id,
      }),
    ]);

    index.upsertPath('tasks/two.md', record('rec_two', 'Different', 'done'));
    expect(index.snapshot().issues).toEqual([]);
  });

  test('builds deterministic typed lookups from canonical files only', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    writeFileSync(join(contentDir, 'tasks', 'alpha.md'), record('rec_alpha', 'Alpha', 'todo'));
    writeFileSync(join(contentDir, 'tasks', 'beta.mdx'), record('rec_beta', 'Beta', 'done'));
    writeFileSync(join(contentDir, 'tasks', 'invalid.md'), '---\ntitle: Missing ID\n---\n');
    writeFileSync(join(contentDir, 'tasks', 'asset.txt'), 'ignored');
    const outside = join(projectDir, 'outside.md');
    writeFileSync(outside, record('rec_outside', 'Outside', 'todo'));
    symlinkSync(outside, join(contentDir, 'tasks', 'linked.md'));

    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    expect(index.status()).toMatchObject({
      state: 'idle',
      progress: null,
      lastRebuiltAt: null,
      lastIncrementalAt: null,
      lastError: null,
    });
    const rebuilt = await index.rebuild();
    expect(rebuilt).toMatchObject({ indexed: 2, invalid: 2 });
    expect(index.list().map((item) => item.id)).toEqual(['rec_alpha', 'rec_beta']);
    expect(index.findByProperty('prop_status', 'opt_todo').map((item) => item.id)).toEqual([
      'rec_alpha',
    ]);
    expect(index.findByProperty('prop_status', 'opt_done').map((item) => item.id)).toEqual([
      'rec_beta',
    ]);
    expect(index.snapshot().issues.map((issue) => issue.code)).toEqual([
      'invalid_record',
      'record_symlink',
    ]);
    expect(JSON.stringify(index.snapshot())).not.toContain(projectDir);
    expect(index.status()).toMatchObject({
      state: 'idle',
      recordCount: 2,
      issueCount: 2,
      progress: null,
      lastError: null,
    });
    expect(index.status().lastRebuiltAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const canonicalSnapshot = index.snapshot();
    index.upsertPath('tasks/ghost.md', record('rec_ghost', 'Ghost cache entry', 'todo'));
    expect(index.getById('rec_ghost')).not.toBeNull();
    await index.rebuild();
    expect(index.getById('rec_ghost')).toBeNull();
    expect(index.snapshot()).toEqual(canonicalSnapshot);

    const restarted = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await restarted.rebuild();
    expect(restarted.snapshot()).toEqual(index.snapshot());
  });

  test('surfaces a sanitized last error when rebuild fails', async () => {
    const { projectDir, contentDir } = tempProject();
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    const outside = mkdtempSync(join(tmpdir(), 'synapsenote-database-index-outside-'));
    tempDirs.push(outside);
    symlinkSync(outside, join(projectDir, '.ok', 'databases'));
    const store = createDatabaseStore({ projectDir, contentDir });
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });

    await expect(index.rebuild()).rejects.toBeDefined();
    expect(index.status()).toMatchObject({
      state: 'error',
      progress: null,
      lastError: {
        code: 'rebuild_failed',
        message: 'Database record index rebuild failed',
      },
    });
    expect(JSON.stringify(index.status())).not.toContain(projectDir);
  });

  test('audits missing, stale, and changed rows against canonical files', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    writeFileSync(join(contentDir, 'tasks', 'alpha.md'), record('rec_alpha', 'Alpha', 'todo'));
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    expect(await index.checkConsistency()).toMatchObject({ consistent: true });

    index.upsertPath('tasks/alpha.md', record('rec_alpha', 'Stale memory', 'done'));
    index.upsertPath('tasks/ghost.md', record('rec_ghost', 'Ghost', 'todo'));
    writeFileSync(join(contentDir, 'tasks', 'beta.md'), record('rec_beta', 'Beta', 'done'));
    const report = await index.checkConsistency();
    expect(report).toMatchObject({
      consistent: false,
      missingRecordIds: ['rec_beta'],
      staleRecordIds: ['rec_ghost'],
      changedRecordIds: ['rec_alpha'],
      diagnosticsDiffer: false,
    });
    expect(report.currentRevision).not.toBe(report.canonicalRevision);
  });
});

describe('DatabaseRecordIndex incremental rematerialization', () => {
  test('routes raw watcher edit, conflict, rename, and delete events by canonical path', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    const firstPath = join(contentDir, 'tasks', 'watched.md');
    const movedPath = join(contentDir, 'tasks', 'moved.md');

    applyDatabaseRecordDiskEvent(index, contentDir, {
      kind: 'create',
      path: firstPath,
      docName: 'tasks/watched',
      content: record('rec_watched', 'Before', 'todo'),
    });
    applyDatabaseRecordDiskEvent(index, contentDir, {
      kind: 'update',
      path: firstPath,
      docName: 'tasks/watched',
      content: record('rec_watched', 'After', 'done'),
    });
    expect(index.getById('rec_watched')).toMatchObject({
      path: 'tasks/watched.md',
      values: { prop_title: 'After', prop_status: 'opt_done' },
    });

    applyDatabaseRecordDiskEvent(index, contentDir, {
      kind: 'conflict',
      path: firstPath,
      docName: 'tasks/watched',
      content: '<<<<<<< ours\n=======\n>>>>>>> theirs\n',
    });
    expect(index.getById('rec_watched')).toBeNull();
    expect(index.snapshot().issues).toMatchObject([
      { code: 'external_conflict', path: 'tasks/watched.md' },
    ]);

    applyDatabaseRecordDiskEvent(index, contentDir, {
      kind: 'rename',
      oldPath: firstPath,
      newPath: movedPath,
      oldDocName: 'tasks/watched',
      newDocName: 'tasks/moved',
      content: record('rec_watched', 'Repaired', 'todo'),
    });
    expect(index.getById('rec_watched')).toMatchObject({ path: 'tasks/moved.md' });

    applyDatabaseRecordDiskEvent(index, contentDir, {
      kind: 'delete',
      path: movedPath,
      docName: 'tasks/moved',
    });
    expect(index.getById('rec_watched')).toBeNull();
  });

  test('updates only the affected path across edit, invalidation, repair, rename, and delete', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();

    index.upsertPath('tasks/alpha.md', record('rec_alpha', 'Alpha', 'todo'));
    expect(index.status().lastIncrementalAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(index.findByProperty('prop_status', 'opt_todo')).toHaveLength(1);

    index.upsertPath('tasks/alpha.md', record('rec_alpha', 'Renamed title', 'done'));
    expect(index.findByProperty('prop_status', 'opt_todo')).toEqual([]);
    expect(index.findByProperty('prop_status', 'opt_done')[0]).toMatchObject({
      id: 'rec_alpha',
      path: 'tasks/alpha.md',
      values: { prop_title: 'Renamed title' },
      body: 'Body for Renamed title\n',
    });

    index.upsertPath('tasks/alpha.md', '---\ntitle: Broken\n---\n');
    expect(index.getById('rec_alpha')).toBeNull();
    expect(index.snapshot().issues).toMatchObject([
      { path: 'tasks/alpha.md', materializationCode: 'missing_record_metadata' },
    ]);

    index.upsertPath('tasks/alpha.md', record('rec_alpha', 'Repaired', 'todo'));
    index.renamePath('tasks/alpha.md', 'tasks/moved.md', record('rec_alpha', 'Repaired', 'todo'));
    expect(index.getById('rec_alpha')).toMatchObject({ path: 'tasks/moved.md' });
    expect(index.snapshot().issues).toEqual([]);

    index.deletePath('tasks/moved.md');
    expect(index.list()).toEqual([]);
  });

  test('indexes selected text properties and Markdown body with stable evidence offsets', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();

    index.upsertPath(
      'tasks/searchable.md',
      record('rec_searchable', 'Login latency', 'todo').replace(
        'Body for Login latency',
        'Customer evidence says login latency blocks checkout.',
      ),
    );
    const first = index.searchText({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      text: 'login latency',
      propertyIds: ['prop_title'],
      titlePropertyId: 'prop_title',
      includeBody: true,
      limit: 10,
    });
    const firstEvidenceIds = first.hits[0]?.evidence.map((entry) => entry.id);
    expect(first).toMatchObject({
      terms: ['login', 'latency'],
      matched: 1,
      returned: 1,
      isComplete: true,
      offsetEncoding: 'utf16_code_units',
      hits: [
        {
          recordId: 'rec_searchable',
          scoreBreakdown: { title: 80, property: 0, body: 20 },
          matchedBy: ['title', 'body'],
          evidence: expect.arrayContaining([
            expect.objectContaining({
              field: 'property',
              propertyId: 'prop_title',
              snippet: 'Login latency',
              start: 0,
              end: 5,
            }),
            expect.objectContaining({ field: 'body', matchedTerms: ['login'] }),
          ]),
        },
      ],
      trace: {
        strategy: 'lexical_and',
        termStats: [
          { term: 'login', scopedRecords: 1 },
          { term: 'latency', scopedRecords: 1 },
        ],
        ranking: { titleWeight: 40, propertyWeight: 20, bodyWeight: 10 },
        noMatchReason: null,
      },
    });
    expect(firstEvidenceIds?.every((id) => /^ev_[a-f0-9]{24}$/.test(id))).toBe(true);
    index.upsertPath(
      'tasks/rich.md',
      record('rec_rich', 'Rich notes', 'todo').replace(
        'status: todo',
        'status: todo\nnotes: "Owner: [@Alice](synapsenote://person/person_alice)"',
      ),
    );
    expect(
      index.searchText({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'owner alice',
        propertyIds: ['prop_notes'],
        limit: 10,
      }),
    ).toMatchObject({
      matched: 1,
      hits: [
        {
          recordId: 'rec_rich',
          evidence: expect.arrayContaining([expect.objectContaining({ snippet: 'Owner: @Alice' })]),
        },
      ],
    });
    expect(
      index.searchText({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'login latency',
        propertyIds: ['prop_title'],
        titlePropertyId: 'prop_title',
        allowedRecordIds: [],
      }),
    ).toMatchObject({
      matched: 0,
      returned: 0,
      hits: [],
      trace: {
        termStats: [
          { term: 'login', indexedRecords: 0, scopedRecords: 0 },
          { term: 'latency', indexedRecords: 0, scopedRecords: 0 },
        ],
      },
    });
    expect(
      index.searchText({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'checkout',
        propertyIds: ['prop_title'],
        titlePropertyId: 'prop_title',
        includeBody: false,
      }).hits,
    ).toEqual([]);
    expect(
      index.searchText({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'checkout absent-term',
        propertyIds: ['prop_title'],
        titlePropertyId: 'prop_title',
      }).trace,
    ).toMatchObject({
      noMatchReason: 'term_absent_in_scope',
      termStats: [
        { term: 'checkout', scopedRecords: 1 },
        { term: 'absent-term', scopedRecords: 0 },
      ],
    });

    index.upsertPath(
      'tasks/searchable.md',
      record('rec_searchable', 'Login repaired', 'done').replace(
        'Body for Login repaired',
        'Checkout is healthy.',
      ),
    );
    expect(
      index.searchText({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'latency',
        propertyIds: ['prop_title'],
        titlePropertyId: 'prop_title',
      }).hits,
    ).toEqual([]);
    expect(
      index.searchText({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'healthy',
        propertyIds: ['prop_title'],
        titlePropertyId: 'prop_title',
      }).hits[0],
    ).toMatchObject({ recordId: 'rec_searchable', matchedBy: ['body'] });

    index.upsertPath(
      'tasks/searchable.md',
      record('rec_searchable', 'Login repaired', 'done')
        .replace(
          '  record_id: rec_searchable',
          '  record_id: rec_searchable\n  archived_at: 2026-07-20T01:02:03.000Z',
        )
        .replace('Body for Login repaired', 'Checkout is healthy.'),
    );
    const archiveSearch = {
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      text: 'healthy',
      propertyIds: ['prop_title'],
      titlePropertyId: 'prop_title',
    };
    expect(index.searchText(archiveSearch).hits).toEqual([]);
    expect(index.searchText({ ...archiveSearch, includeArchived: true }).hits[0]).toMatchObject({
      recordId: 'rec_searchable',
    });

    index.deletePath('tasks/searchable.md');
    expect(
      index.searchText({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: 'healthy',
        propertyIds: ['prop_title'],
        titlePropertyId: 'prop_title',
      }).hits,
    ).toEqual([]);
  });

  test('bounds lexical terms, retained hits, and per-hit evidence without changing top-K rank', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    for (let offset = 0; offset < DATABASE_LEXICAL_MAX_HITS + 10; offset += 1) {
      const suffix = String(offset).padStart(4, '0');
      index.upsertPath(
        `tasks/${suffix}.md`,
        record(
          `rec_${suffix}`,
          'common common common common common common common common common',
          'todo',
        ),
      );
    }
    const boostedId = `rec_${String(DATABASE_LEXICAL_MAX_HITS + 9).padStart(4, '0')}`;
    const result = index.searchText({
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      text: 'common',
      propertyIds: ['prop_title'],
      titlePropertyId: 'prop_title',
      limit: Number.MAX_SAFE_INTEGER,
      rankBoost: (candidate) => (candidate.id === boostedId ? 1 : 0),
    });
    expect(result).toMatchObject({
      matched: DATABASE_LEXICAL_MAX_HITS + 10,
      returned: DATABASE_LEXICAL_MAX_HITS,
      isComplete: false,
    });
    expect(result.hits[0]?.recordId).toBe(boostedId);
    expect(
      result.hits.every((hit) => hit.evidence.length <= DATABASE_LEXICAL_MAX_EVIDENCE_PER_HIT),
    ).toBe(true);

    const tooManyTerms = Array.from(
      { length: DATABASE_LEXICAL_MAX_TERMS + 1 },
      (_, index) => `term-${index}`,
    ).join(' ');
    expect(() =>
      index.searchText({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        text: tooManyTerms,
        propertyIds: ['prop_title'],
        titlePropertyId: 'prop_title',
      }),
    ).toThrow(DatabaseLexicalSearchLimitError);
  });

  test('indexes canonical Date range metadata with evidence offsets', async () => {
    const { projectDir, contentDir } = tempProject();
    const database = definition();
    database.sources[0]?.properties.push({
      id: 'prop_due',
      key: 'due',
      name: 'Due',
      type: 'date',
    } as never);
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(database);
    writeFileSync(
      join(contentDir, 'tasks', 'dated.md'),
      `${record('rec_dated', 'Dated task', 'todo').replace(
        'status: todo',
        'status: todo\ndue:\n  start: 2026-07-20\n  end: 2026-07-22\n  timeZone: Asia/Seoul',
      )}`,
    );
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();
    expect(
      index.findByProperty('prop_due', {
        timeZone: 'Asia/Seoul',
        end: '2026-07-22',
        start: '2026-07-20',
      }),
    ).toHaveLength(1);
    const result = index.searchText({
      databaseId: database.id,
      sourceId: 'ds_tasks',
      text: 'Asia Seoul',
      propertyIds: ['prop_due'],
      titlePropertyId: 'prop_title',
      limit: 10,
    });
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({
      recordId: 'rec_dated',
      matchedBy: ['property'],
      evidence: expect.arrayContaining([
        expect.objectContaining({
          field: 'property',
          propertyId: 'prop_due',
          snippet: expect.stringContaining('"timeZone":"Asia/Seoul"'),
        }),
      ]),
    });
  });

  test('excludes every duplicate record ID and restores the survivor after delete', async () => {
    const { projectDir, contentDir } = tempProject();
    const store = createDatabaseStore({ projectDir, contentDir });
    await store.create(definition());
    const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
    await index.rebuild();

    index.upsertPath('tasks/one.md', record('rec_shared', 'One', 'todo'));
    index.upsertPath('tasks/two.md', record('rec_shared', 'Two', 'done'));
    expect(index.getById('rec_shared')).toBeNull();
    expect(index.snapshot().issues).toMatchObject([
      { code: 'duplicate_record_id', path: 'tasks/one.md', recordId: 'rec_shared' },
      { code: 'duplicate_record_id', path: 'tasks/two.md', recordId: 'rec_shared' },
    ]);

    index.deletePath('tasks/two.md');
    expect(index.getById('rec_shared')).toMatchObject({ path: 'tasks/one.md' });
    expect(index.snapshot().issues).toEqual([]);
  });
});
