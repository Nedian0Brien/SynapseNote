import { describe, expect, test } from 'bun:test';
import {
  materializeDatabaseDerivedRecords,
  runDatabaseFormulaConformance,
} from '@nedian0brien/synapsenote-core';

describe('server database Formula determinism', () => {
  test('matches the shared golden outputs used by every product runtime', async () => {
    const report = await runDatabaseFormulaConformance((input) =>
      materializeDatabaseDerivedRecords(input),
    );

    expect(report).toMatchObject({ passed: true, failures: [] });
  });
});
