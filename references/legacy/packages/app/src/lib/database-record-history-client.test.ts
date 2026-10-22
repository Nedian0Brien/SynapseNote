import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import {
  databaseRecordVersionChanges,
  fetchDatabaseRecordHistory,
} from './database-record-history-client';

const database = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  contract: {
    purpose: 'Track tasks',
    canonicality: 'canonical',
    vocabulary: ['task'],
    freshness: { expectation: 'realtime' },
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
        { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
      ],
    },
  ],
});
const source = database.sources[0];
if (!source) throw new Error('expected source');
const shaNew = 'a'.repeat(40);
const shaOld = 'b'.repeat(40);
const shaBase = 'c'.repeat(40);
const oldContent =
  '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_first\ntitle: First\nscore: 1\n---\nOld body\n';
const newContent =
  '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_first\ntitle: First\nscore: 2\n---\nNew body\n';

describe('database record property history', () => {
  test('diffs canonical properties by stable ID and tracks body separately', () => {
    expect(databaseRecordVersionChanges(source, newContent, oldContent)).toEqual([
      { kind: 'property', propertyId: 'prop_score', label: 'Score' },
      { kind: 'body', label: 'Page body' },
    ]);
  });

  test('derives filesystem and upstream Git attribution from durable history entries', async () => {
    const fetchMock: typeof fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('/api/history?')) {
        return Response.json({
          entries: [
            {
              sha: shaNew,
              timestamp: '2026-07-21T10:00:00.000Z',
              author: 'File system',
              authorEmail: 'filesystem@local',
              type: 'wip',
              message: 'External edit',
              contributors: [{ id: 'file-system', name: 'File system', docs: ['tasks/first'] }],
              checkpoint: null,
            },
            {
              sha: shaBase,
              timestamp: '2026-07-21T09:59:59.000Z',
              author: 'Database agent',
              authorEmail: 'database@example.com',
              type: 'checkpoint',
              message: 'checkpoint: database transaction base',
              contributors: [],
              checkpoint: null,
            },
            {
              sha: shaOld,
              timestamp: '2026-07-20T10:00:00.000Z',
              author: 'Remote',
              authorEmail: 'remote@example.com',
              type: 'upstream',
              message: 'Pulled change',
              contributors: [],
              checkpoint: null,
            },
          ],
        });
      }
      if (url.includes(shaBase)) {
        return Response.json({ detail: 'Document did not exist at this version' }, { status: 404 });
      }
      const content = url.includes(shaNew) ? newContent : oldContent;
      return Response.json({
        sha: url.includes(shaNew) ? shaNew : shaOld,
        content,
        timestamp: '2026-07-21T10:00:00.000Z',
        author: 'Test',
      });
    }) as typeof fetch;
    const events = await fetchDatabaseRecordHistory({
      docName: 'tasks/first',
      source,
      fetch: fetchMock,
    });
    expect(events[0]).toMatchObject({
      actor: { kind: 'filesystem', principal_id: 'local' },
      origin: 'filesystem',
      changes: [
        { kind: 'property', propertyId: 'prop_title', label: 'Title' },
        { kind: 'property', propertyId: 'prop_score', label: 'Score' },
        { kind: 'body', label: 'Page body' },
      ],
    });
    expect(events[1]).toMatchObject({
      actor: { kind: 'sync', principal_id: 'remote@example.com' },
      origin: 'git',
    });
    expect(events).toHaveLength(2);
  });
});
