import { describe, expect, test } from 'bun:test';
import { queryDatabaseRecords } from './query.ts';
import {
  DATABASE_QUERY_CONFORMANCE_RECORDS,
  DATABASE_QUERY_CONFORMANCE_SNAPSHOT_REVISION,
  DATABASE_QUERY_CONFORMANCE_SOURCE,
  DATABASE_QUERY_CONFORMANCE_VERSION,
  runDatabaseQueryConformance,
} from './query-conformance.ts';

describe('database query conformance vectors', () => {
  test('certifies the core query engine with the public reusable runner', async () => {
    const report = await runDatabaseQueryConformance(({ query }) =>
      queryDatabaseRecords({
        source: DATABASE_QUERY_CONFORMANCE_SOURCE,
        records: DATABASE_QUERY_CONFORMANCE_RECORDS,
        snapshotRevision: DATABASE_QUERY_CONFORMANCE_SNAPSHOT_REVISION,
        query,
      }),
    );

    expect(report).toEqual({
      version: DATABASE_QUERY_CONFORMANCE_VERSION,
      passed: true,
      cases: [
        {
          id: 'nested-filter-sort-projection-aggregate-pagination-v1',
          passed: true,
          failures: [],
        },
        {
          id: 'definitive-no-match-empty-aggregation-v1',
          passed: true,
          failures: [],
        },
      ],
    });
  });

  test('reports portable diagnostics instead of depending on a test framework', async () => {
    const report = await runDatabaseQueryConformance(() => ({ invalid: true }));
    expect(report.passed).toBe(false);
    expect(report.cases[0]?.failures[0]).toContain('page 1 threw');
  });
});
