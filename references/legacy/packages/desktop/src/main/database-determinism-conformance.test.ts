import { describe, expect, test } from 'bun:test';
import {
  DATABASE_QUERY_CONFORMANCE_RECORDS,
  DATABASE_QUERY_CONFORMANCE_SNAPSHOT_REVISION,
  DATABASE_QUERY_CONFORMANCE_SOURCE,
  materializeDatabaseDerivedRecords,
  queryDatabaseRecords,
  runDatabaseFormulaConformance,
  runDatabaseQueryConformance,
} from '@nedian0brien/synapsenote-core';

describe('desktop database determinism', () => {
  test('matches the shared query and Formula golden vectors', async () => {
    const query = await runDatabaseQueryConformance(({ query: request }) =>
      queryDatabaseRecords({
        source: DATABASE_QUERY_CONFORMANCE_SOURCE,
        records: DATABASE_QUERY_CONFORMANCE_RECORDS,
        snapshotRevision: DATABASE_QUERY_CONFORMANCE_SNAPSHOT_REVISION,
        query: request,
      }),
    );
    const formula = await runDatabaseFormulaConformance((input) =>
      materializeDatabaseDerivedRecords(input),
    );

    expect(query).toMatchObject({ passed: true });
    expect(formula).toMatchObject({ passed: true, failures: [] });
  });
});
