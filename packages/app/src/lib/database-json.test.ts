import { describe, expect, test } from 'bun:test';
import type {
  DatabaseDefinition,
  DatabaseQueryResult,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { databaseDocumentReferenceMarkup } from '@nedian0brien/synapsenote-core';
import {
  DATABASE_JSON_EXPORT_SCHEMA,
  DATABASE_JSON_EXPORT_VERSION,
  databaseSnapshotToJson,
} from './database-json.ts';

const hash = `sha256:${'a'.repeat(64)}`;
const source = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'opt_open', key: 'open', name: 'Open' }],
    },
  ],
} as DatabaseSource;
const database = {
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
  sources: [source],
} as DatabaseDefinition;
const result: DatabaseQueryResult = {
  sourceId: source.id,
  snapshotRevision: hash,
  matched: 1,
  returned: 1,
  isComplete: true,
  nextCursor: null,
  truncatedBy: null,
  indexFreshness: 'snapshot',
  aggregation: null,
  records: [
    {
      id: 'rec_first',
      path: 'tasks/first.md',
      revision: hash,
      values: { prop_title: 'First', prop_status: 'opt_open' },
    },
  ],
};

describe('database JSON export', () => {
  test('keeps schema version, stable IDs, revisions, and canonical values', () => {
    const json = databaseSnapshotToJson({
      database,
      source,
      manifestRevision: hash,
      schemaRevision: hash,
      indexRevision: hash,
      result,
      scope: 'all',
    });
    expect(json.endsWith('\n')).toBe(true);
    expect(JSON.parse(json)).toEqual({
      schema: DATABASE_JSON_EXPORT_SCHEMA,
      version: DATABASE_JSON_EXPORT_VERSION,
      scope: 'all',
      database: { id: 'db_tasks', key: 'tasks', name: 'Tasks' },
      source: {
        id: 'ds_tasks',
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        properties: source.properties,
      },
      revisions: { manifest: hash, schema: hash, index: hash, snapshot: hash },
      result: {
        matched: 1,
        returned: 1,
        complete: true,
        indexFreshness: 'snapshot',
      },
      records: result.records,
    });
  });

  test('keeps canonical multiline Text markup and reference projections losslessly', () => {
    const textProperty = {
      id: 'prop_notes',
      key: 'notes',
      name: 'Notes',
      type: 'text',
    } as const;
    const markup = `See ${databaseDocumentReferenceMarkup('plans/Launch.md', 'Launch plan')}\nNext`;
    const firstRecord = result.records[0];
    if (!firstRecord) throw new Error('fixture must include a record');
    const json = databaseSnapshotToJson({
      database: {
        ...database,
        sources: [{ ...source, properties: [...source.properties, textProperty] }],
      },
      source: { ...source, properties: [...source.properties, textProperty] },
      manifestRevision: hash,
      schemaRevision: hash,
      indexRevision: hash,
      result: {
        ...result,
        records: [
          {
            ...firstRecord,
            values: { ...firstRecord.values, prop_notes: markup },
            textProjections: {
              prop_notes: {
                plainText: 'See Launch plan\nNext',
                references: [
                  {
                    kind: 'document',
                    target: 'plans/Launch.md',
                    label: 'Launch plan',
                    start: 4,
                    end: 76,
                  },
                ],
              },
            },
          },
        ],
      },
      scope: 'all',
    });
    const exported = JSON.parse(json) as { records: typeof result.records };
    expect(exported.records[0]?.values.prop_notes).toBe(markup);
    expect(exported.records[0]?.textProjections?.prop_notes?.plainText).toBe(
      'See Launch plan\nNext',
    );
  });

  test('rejects cross-source, partial, and inconsistent snapshots', () => {
    const serialize = (candidate: DatabaseQueryResult) =>
      databaseSnapshotToJson({
        database,
        source,
        manifestRevision: hash,
        schemaRevision: hash,
        indexRevision: hash,
        result: candidate,
        scope: 'current',
      });
    expect(() => serialize({ ...result, sourceId: 'ds_other' })).toThrow('different source');
    expect(() => serialize({ ...result, isComplete: false, nextCursor: 'cursor_next' })).toThrow(
      'complete query snapshot',
    );
    expect(() => serialize({ ...result, returned: 2 })).toThrow('record count');
  });
});
