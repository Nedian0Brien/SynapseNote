import { describe, expect, test } from 'bun:test';
import { materializeDatabaseDerivedRecords } from './derived-records.ts';
import {
  DATABASE_FORMULA_CONFORMANCE_EXPECTED,
  DATABASE_FORMULA_CONFORMANCE_VERSION,
  runDatabaseFormulaConformance,
} from './formula-conformance.ts';

describe('database Formula conformance vectors', () => {
  test('certifies the core derived-value engine against exact golden outputs', async () => {
    const report = await runDatabaseFormulaConformance((input) =>
      materializeDatabaseDerivedRecords(input),
    );

    expect(report).toEqual({
      version: DATABASE_FORMULA_CONFORMANCE_VERSION,
      passed: true,
      failures: [],
      observation: DATABASE_FORMULA_CONFORMANCE_EXPECTED,
    });
  });
});
