import { describe, expect, test } from 'bun:test';
import {
  DatabaseFilesValueSchema,
  databaseFileDisplayName,
  isSafeDatabaseAssetPath,
  isSafeDatabaseExternalFileUrl,
} from './files.ts';
import { compileDatabaseFind } from './find.ts';
import { DatabaseQueryResultSchema, queryDatabaseRecords } from './query.ts';
import { materializeDatabaseRecord } from './record.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_assets',
    key: 'assets',
    name: 'Assets',
    contract: {
      purpose: 'Track deliverables',
      canonicality: 'canonical',
      vocabulary: ['asset'],
      freshness: { expectation: 'realtime' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_deliverables',
        key: 'deliverables',
        name: 'Deliverables',
        recordMeaning: 'One deliverable',
        folder: 'deliverables',
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_files', key: 'files', name: 'Files', type: 'files', required: true },
        ],
      },
    ],
  });
}

function markdown(recordId: string, title: string, files: string) {
  return `---
_sn:
  database_id: db_assets
  source_id: ds_deliverables
  record_id: ${recordId}
title: ${title}
files:
${files}
---
Body`;
}

describe('database Files & media contract', () => {
  test('accepts only safe content-relative assets and credential-free HTTP(S) URLs', () => {
    expect(isSafeDatabaseAssetPath('assets/report.pdf')).toBe(true);
    for (const path of ['../report.pdf', '/assets/report.pdf', 'assets\\report.pdf', 'a//b']) {
      expect(isSafeDatabaseAssetPath(path)).toBe(false);
    }
    expect(isSafeDatabaseExternalFileUrl('https://cdn.example.com/report.pdf?version=2')).toBe(
      true,
    );
    for (const url of [
      'file:///tmp/report.pdf',
      'javascript:alert(1)',
      'https://user:secret@example.com/report.pdf',
    ]) {
      expect(isSafeDatabaseExternalFileUrl(url)).toBe(false);
    }
  });

  test('preserves local/URL order, names, and captions through Markdown materialization', () => {
    const database = definition();
    const result = materializeDatabaseRecord({
      definition: database,
      sourceId: 'ds_deliverables',
      path: 'deliverables/launch.md',
      markdown: markdown(
        'rec_launch',
        'Launch',
        `  - kind: external
    url: https://cdn.example.com/launch.mp4
    name: Launch video
    caption: Final cut
  - kind: local
    path: assets/launch-poster.png
    caption: Approved poster`,
      ),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.values.prop_files).toEqual([
      {
        kind: 'external',
        url: 'https://cdn.example.com/launch.mp4',
        name: 'Launch video',
        caption: 'Final cut',
      },
      { kind: 'local', path: 'assets/launch-poster.png', caption: 'Approved poster' },
    ]);
    expect(databaseFileDisplayName(result.record.values.prop_files?.[1] as never)).toBe(
      'launch-poster.png',
    );
  });

  test('rejects duplicate sources, unsafe local paths, and empty required lists', () => {
    expect(
      DatabaseFilesValueSchema.safeParse([
        { kind: 'local', path: 'assets/a.png' },
        { kind: 'local', path: 'assets/a.png', caption: 'duplicate' },
      ]).success,
    ).toBe(false);
    for (const files of ['  - kind: local\n    path: ../escape.png', '  []']) {
      const result = materializeDatabaseRecord({
        definition: definition(),
        sourceId: 'ds_deliverables',
        path: 'deliverables/invalid.md',
        markdown: markdown('rec_invalid', 'Invalid', files),
      });
      expect(result.ok).toBe(false);
    }
  });

  test('filters by source identity, keeps equality order-sensitive, sorts by display name, and groups each file', () => {
    const database = definition();
    const source = database.sources[0];
    if (!source) throw new Error('expected Files source');
    const first = materializeDatabaseRecord({
      definition: database,
      sourceId: source.id,
      path: 'deliverables/zulu.md',
      markdown: markdown(
        'rec_zulu',
        'Zulu',
        '  - kind: local\n    path: assets/z.png\n    name: Alpha\n  - kind: local\n    path: assets/b.png',
      ),
    });
    const second = materializeDatabaseRecord({
      definition: database,
      sourceId: source.id,
      path: 'deliverables/alpha.md',
      markdown: markdown(
        'rec_alpha',
        'Alpha',
        '  - kind: external\n    url: https://cdn.example.com/zeta.pdf\n    name: Zeta',
      ),
    });
    if (!first.ok || !second.ok) throw new Error('expected valid Files records');

    const contains = queryDatabaseRecords({
      source,
      records: [second.record, first.record],
      snapshotRevision: 'sha256:files',
      resolveFileAvailability: (path) => (path.endsWith('z.png') ? 'available' : 'missing'),
      query: {
        where: { propertyId: 'prop_files', operator: 'contains', value: 'assets/z.png' },
      },
    });
    expect(contains.records.map((record) => record.id)).toEqual(['rec_zulu']);
    expect(contains.fileStates).toEqual({
      'assets/b.png': 'missing',
      'assets/z.png': 'available',
    });

    const ordered = queryDatabaseRecords({
      source,
      records: [first.record],
      snapshotRevision: 'sha256:files',
      query: {
        where: {
          propertyId: 'prop_files',
          operator: 'eq',
          value: ['assets/z.png', 'assets/b.png'],
        },
      },
    });
    expect(ordered.matched).toBe(1);
    expect(
      queryDatabaseRecords({
        source,
        records: [first.record],
        snapshotRevision: 'sha256:files',
        query: {
          where: {
            propertyId: 'prop_files',
            operator: 'eq',
            value: ['assets/b.png', 'assets/z.png'],
          },
        },
      }).matched,
    ).toBe(0);

    const sorted = queryDatabaseRecords({
      source,
      records: [second.record, first.record],
      snapshotRevision: 'sha256:files',
      query: { sort: [{ propertyId: 'prop_files', direction: 'asc' }] },
    });
    expect(sorted.records.map((record) => record.id)).toEqual(['rec_zulu', 'rec_alpha']);

    const grouped = queryDatabaseRecords({
      source,
      records: [first.record],
      snapshotRevision: 'sha256:files',
      query: {
        aggregate: {
          groupBy: [{ propertyId: 'prop_files', arrayMode: 'each' }],
          calculations: [],
        },
      },
    });
    expect(grouped.aggregation?.groups.map((group) => group.key[0]?.value)).toEqual([
      'assets/b.png',
      'assets/z.png',
    ]);
    expect(DatabaseQueryResultSchema.safeParse(grouped).success).toBe(true);
  });

  test('compiles natural find against a local path or URL without embedding file objects', () => {
    const source = definition().sources[0];
    if (!source) throw new Error('expected Files source');
    const plan = compileDatabaseFind(source, {
      text: 'files contains assets/launch-poster.png',
    });
    expect(plan.query?.where).toEqual({
      propertyId: 'prop_files',
      operator: 'contains',
      value: 'assets/launch-poster.png',
    });
  });
});
