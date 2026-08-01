import { describe, expect, test } from 'bun:test';
import { parseDatabaseDocumentIdentity } from './document-identity.ts';
import { resolveDatabaseDocumentTitle } from './markdown-table-document.ts';
import { planDatabaseMarkdownV2Migration } from './markdown-table-migration.ts';
import { compareDatabaseMigrationLogicalSnapshots } from './markdown-table-migration-equivalence.ts';
import { materializeDatabaseMarkdownOwner } from './markdown-table-record.ts';
import { queryDatabaseRecords } from './query.ts';
import { type DatabaseValue, materializeDatabaseRecord } from './record.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

describe('v1 to v2 migration logical equivalence', () => {
  test('ignores storage paths but compares stable IDs, typed values, invalid raw, and derived results', () => {
    const expected = [
      {
        canonicalRecordId: 'rec_alpha',
        sourceId: 'ds_tasks',
        values: { prop_title: 'Alpha', prop_score: 2 },
        invalidValues: { prop_date: 'not-a-date' },
        computedResults: { prop_formula: { kind: 'value', valueType: 'number', value: 4 } },
      },
    ] as const;
    const equivalent = compareDatabaseMigrationLogicalSnapshots({
      expected,
      actual: [
        {
          id: 'rec_alpha',
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          path: 'new/alpha.md',
          revision: 'sha256:storage-only',
          values: { prop_score: 2, prop_title: 'Alpha' },
          invalidValues: { prop_date: 'not-a-date' },
          computedResults: { prop_formula: { kind: 'value', valueType: 'number', value: 4 } },
          body: 'body',
        },
      ],
    });
    expect(equivalent.passed).toBe(true);
    expect(equivalent.expectedRevision).toBe(equivalent.actualRevision);
  });

  test('surfaces missing rows and Formula/Rollup error changes instead of coercing them', () => {
    const report = compareDatabaseMigrationLogicalSnapshots({
      expected: [
        {
          canonicalRecordId: 'rec_alpha',
          sourceId: 'ds_tasks',
          values: { prop_score: 2 },
          computedResults: { prop_formula: { kind: 'error', problem: { code: '#REF!' } } },
        },
      ],
      actual: [],
    });
    expect(report.passed).toBe(false);
    expect(report.mismatches).toEqual([
      expect.objectContaining({ recordId: 'rec_alpha', field: 'missing' }),
    ]);
  });

  test('runs a real v1 corpus through the v2 owner materializer before comparing logical records', () => {
    const definition = DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_tasks',
      key: 'tasks',
      name: 'Tasks',
      contract: {
        purpose: 'Track tasks',
        canonicality: 'canonical',
        vocabulary: ['task'],
        freshness: { expectation: 'manual' },
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
            { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
          ],
        },
      ],
    });
    const records = [
      {
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        path: 'tasks/alpha.md',
        markdown:
          '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_alpha\ntitle: Alpha\nnotes: Keep this\nscore: 2.5\n---\nAlpha body\n',
      },
      {
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        path: 'tasks/beta.md',
        markdown:
          '---\n_sn:\n  database_id: db_tasks\n  source_id: ds_tasks\n  record_id: rec_beta\ntitle: Beta\nnotes: Review this\nscore: 4\n---\nBeta body\n',
      },
    ] as const;
    const v1 = records.map((record) =>
      materializeDatabaseRecord({
        definition,
        sourceId: 'ds_tasks',
        path: record.path,
        markdown: record.markdown,
      }),
    );
    expect(v1.every((result) => result.ok)).toBe(true);
    const plan = planDatabaseMarkdownV2Migration({
      definition,
      owners: [{ sourceId: 'ds_tasks', path: 'tasks.md', blockId: 'dbb_tasks_primary' }],
      records,
      migrationCommittedAt: '2026-07-27T00:00:00.000Z',
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready' || !plan.definition) return;
    const ownerMarkdown = plan.ownerDocuments['tasks.md'];
    if (!ownerMarkdown) throw new Error('Migration fixture owner document is missing');
    const v1Source = definition.sources[0];
    const v2Source = plan.definition.sources[0];
    if (!v1Source || !v2Source) throw new Error('Migration fixture source is missing');
    const linked = Object.entries(plan.linkedDocuments).map(([path, markdown]) => {
      const identity = parseDatabaseDocumentIdentity(markdown);
      if (!identity.ok) throw new Error(`Migration fixture lost document identity for ${path}`);
      return { path, markdown, documentId: identity.documentId };
    });
    const materialized = materializeDatabaseMarkdownOwner({
      databaseId: 'db_tasks',
      source: v2Source,
      markdown: ownerMarkdown,
      resolveDocument: (link) => {
        const target = link.target.replace(/\.(?:md|mdx)$/iu, '');
        const document = linked.find(
          (candidate) => candidate.path.replace(/\.(?:md|mdx)$/iu, '') === target,
        );
        return document ? { path: document.path, documentId: document.documentId } : null;
      },
    });
    expect(materialized.errors).toEqual([]);
    if (!('rows' in materialized)) return;
    const expected = v1.map((result, index) => {
      if (!result.ok) throw new Error('v1 fixture did not materialize');
      const record = records[index];
      if (!record) throw new Error('v1 fixture record unexpectedly missing');
      const legacyId = record.markdown.match(/record_id:\s*(\S+)/u)?.[1];
      const alias = plan.aliases.find((candidate) => candidate.legacyRecordId === legacyId);
      if (!alias) throw new Error(`Migration fixture lost alias for ${legacyId}`);
      return {
        canonicalRecordId: alias.canonicalRecordId,
        sourceId: 'ds_tasks',
        values: result.record.values,
      };
    });
    const actual = materialized.rows.map((row) => {
      if (!row.recordId) throw new Error('materialized row record ID is missing');
      const values = { ...row.values } as Record<string, unknown>;
      const document = linked.find((candidate) => candidate.documentId === row.documentId);
      if (
        document &&
        values.prop_title &&
        typeof values.prop_title === 'object' &&
        !Array.isArray(values.prop_title) &&
        'kind' in values.prop_title
      ) {
        values.prop_title = resolveDatabaseDocumentTitle(document.markdown, document.path).value;
      }
      return {
        canonicalRecordId: row.recordId,
        sourceId: 'ds_tasks',
        values,
      };
    });
    const report = compareDatabaseMigrationLogicalSnapshots({ expected, actual });
    expect(report).toMatchObject({ passed: true, expectedCount: 2, actualCount: 2 });
    expect(report.expectedRevision).toBe(report.actualRevision);

    const v1Records = v1.flatMap((result) => (result.ok ? [result.record] : []));
    const v2Records = materialized.rows.map((row) => {
      if (!row.recordId || !row.documentPath) {
        throw new Error('materialized row identity is missing');
      }
      const values = { ...row.values } as Record<string, DatabaseValue>;
      const document = linked.find((candidate) => candidate.documentId === row.documentId);
      if (
        document &&
        values.prop_title &&
        typeof values.prop_title === 'object' &&
        !Array.isArray(values.prop_title) &&
        'kind' in values.prop_title
      ) {
        values.prop_title = resolveDatabaseDocumentTitle(document.markdown, document.path).value;
      }
      return {
        id: row.recordId,
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        path: row.documentPath,
        revision: null,
        values,
        body: document?.markdown ?? '',
      };
    });
    const differentialQuery = {
      where: { propertyId: 'prop_score', operator: 'gte', value: 3 },
      sort: [{ propertyId: 'prop_score', direction: 'desc' as const }],
      select: ['prop_title', 'prop_score'],
      page: { limit: 1 },
    };
    const v1Query = queryDatabaseRecords({
      source: v1Source,
      records: v1Records,
      query: differentialQuery,
      snapshotRevision: 'migration-differential-fixture',
    });
    const v2Query = queryDatabaseRecords({
      source: v2Source,
      records: v2Records,
      query: differentialQuery,
      snapshotRevision: 'migration-differential-fixture',
    });
    expect({
      matched: v2Query.matched,
      returned: v2Query.returned,
      isComplete: v2Query.isComplete,
      nextCursor: v2Query.nextCursor?.split(':').at(-1) ?? null,
      rows: v2Query.records.map((record) => record.values),
    }).toEqual({
      matched: v1Query.matched,
      returned: v1Query.returned,
      isComplete: v1Query.isComplete,
      nextCursor: v1Query.nextCursor?.split(':').at(-1) ?? null,
      rows: v1Query.records.map((record) => record.values),
    });
  });
});
