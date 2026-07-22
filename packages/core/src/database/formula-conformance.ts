import type { FormulaFunctionContext } from './formula-functions.ts';
import type { FormulaComputedResult } from './formula-result.ts';
import type { DatabaseRecord } from './record.ts';
import { type DatabaseDefinition, DatabaseDefinitionSchema } from './schema.ts';

export const DATABASE_FORMULA_CONFORMANCE_VERSION = 1 as const;
export const DATABASE_FORMULA_CONFORMANCE_PERMISSION_REVISION =
  'sha256:formula-conformance-permission-v1';

export const DATABASE_FORMULA_CONFORMANCE_CONTEXT: FormulaFunctionContext = {
  now: '2026-07-21T03:04:05.000Z',
  timeZone: 'UTC',
  locale: 'en',
};

export const DATABASE_FORMULA_CONFORMANCE_DEFINITION: DatabaseDefinition =
  DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_formula_conformance',
    key: 'formula_conformance',
    name: 'Formula conformance',
    contract: {
      purpose: 'Cross-runtime Formula determinism vectors',
      canonicality: 'canonical',
      vocabulary: ['record'],
      freshness: { expectation: 'realtime' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_formula_records',
        key: 'records',
        name: 'Records',
        recordMeaning: 'One Formula conformance record',
        folder: 'records',
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
          {
            id: 'prop_double_score',
            key: 'double_score',
            name: 'Double score',
            type: 'formula',
            source: 'prop("score") * 2',
            ast: {
              language: 'synapse-formula-1',
              version: 1,
              resultType: 'number',
              expression: {
                type: 'binary',
                operator: 'multiply',
                left: { type: 'property', propertyId: 'prop_score' },
                right: { type: 'literal', valueType: 'number', value: 2 },
              },
            },
          },
          {
            id: 'prop_broken',
            key: 'broken',
            name: 'Broken',
            type: 'formula',
            source: 'prop("score") / 0',
            ast: {
              language: 'synapse-formula-1',
              version: 1,
              resultType: 'number',
              expression: {
                type: 'binary',
                operator: 'divide',
                left: { type: 'property', propertyId: 'prop_score' },
                right: { type: 'literal', valueType: 'number', value: 0 },
              },
            },
          },
        ],
      },
    ],
  });

export const DATABASE_FORMULA_CONFORMANCE_RECORDS: readonly DatabaseRecord[] = [
  {
    id: 'rec_alpha',
    databaseId: DATABASE_FORMULA_CONFORMANCE_DEFINITION.id,
    sourceId: 'ds_formula_records',
    path: 'records/alpha.md',
    revision: 'sha256:formula-conformance-alpha',
    values: { prop_title: 'Alpha', prop_score: 4 },
    body: '',
  },
  {
    id: 'rec_beta',
    databaseId: DATABASE_FORMULA_CONFORMANCE_DEFINITION.id,
    sourceId: 'ds_formula_records',
    path: 'records/beta.md',
    revision: 'sha256:formula-conformance-beta',
    values: { prop_title: 'Beta', prop_score: 1.5 },
    body: '',
  },
];

export interface DatabaseFormulaConformanceObservation {
  id: string;
  doubleScore: number | null;
  doubleResult: FormulaComputedResult | null;
  brokenCode: string | null;
}

export const DATABASE_FORMULA_CONFORMANCE_EXPECTED: readonly DatabaseFormulaConformanceObservation[] =
  [
    {
      id: 'rec_alpha',
      doubleScore: 8,
      doubleResult: { kind: 'value', valueType: 'number', value: 8 },
      brokenCode: 'divide_by_zero',
    },
    {
      id: 'rec_beta',
      doubleScore: 3,
      doubleResult: { kind: 'value', valueType: 'number', value: 3 },
      brokenCode: 'divide_by_zero',
    },
  ];

export interface DatabaseFormulaConformanceInput {
  definition: DatabaseDefinition;
  records: readonly DatabaseRecord[];
  context: FormulaFunctionContext;
  permissionRevision: string;
}

export type DatabaseFormulaConformanceAdapter = (
  input: DatabaseFormulaConformanceInput,
) => readonly DatabaseRecord[] | Promise<readonly DatabaseRecord[]>;

export interface DatabaseFormulaConformanceReport {
  version: typeof DATABASE_FORMULA_CONFORMANCE_VERSION;
  passed: boolean;
  failures: string[];
  observation: DatabaseFormulaConformanceObservation[];
}

function observe(records: readonly DatabaseRecord[]): DatabaseFormulaConformanceObservation[] {
  return [...records]
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((record) => {
      const doubleResult = record.computedResults?.prop_double_score ?? null;
      const brokenResult = record.computedResults?.prop_broken;
      return {
        id: record.id,
        doubleScore:
          typeof record.values.prop_double_score === 'number'
            ? record.values.prop_double_score
            : null,
        doubleResult,
        brokenCode: brokenResult?.kind === 'error' ? brokenResult.problem.code : null,
      };
    });
}

/** Run the public Formula v1 golden vectors through a product runtime adapter. */
export async function runDatabaseFormulaConformance(
  adapter: DatabaseFormulaConformanceAdapter,
): Promise<DatabaseFormulaConformanceReport> {
  const failures: string[] = [];
  let observation: DatabaseFormulaConformanceObservation[] = [];
  try {
    observation = observe(
      await adapter({
        definition: DATABASE_FORMULA_CONFORMANCE_DEFINITION,
        records: DATABASE_FORMULA_CONFORMANCE_RECORDS,
        context: DATABASE_FORMULA_CONFORMANCE_CONTEXT,
        permissionRevision: DATABASE_FORMULA_CONFORMANCE_PERMISSION_REVISION,
      }),
    );
    if (JSON.stringify(observation) !== JSON.stringify(DATABASE_FORMULA_CONFORMANCE_EXPECTED)) {
      failures.push(
        `Formula observation mismatch: expected ${JSON.stringify(DATABASE_FORMULA_CONFORMANCE_EXPECTED)}, received ${JSON.stringify(observation)}`,
      );
    }
  } catch (error) {
    failures.push(
      `Formula adapter threw ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    version: DATABASE_FORMULA_CONFORMANCE_VERSION,
    passed: failures.length === 0,
    failures,
    observation,
  };
}
