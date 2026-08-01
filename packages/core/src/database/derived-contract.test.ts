import { describe, expect, test } from 'bun:test';
import { compileDatabaseDerivedContract } from './derived-contract.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

function definition(overrides: Record<string, unknown> = {}) {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_derived_contract',
    key: 'derived_contract',
    name: 'Derived contract',
    contract: {
      purpose: 'derived contract test',
      canonicality: 'canonical',
      vocabulary: ['record'],
      freshness: { expectation: 'realtime' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_tasks',
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'task',
        folder: 'tasks',
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
          {
            id: 'prop_double',
            key: 'double',
            name: 'Double',
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
        ],
      },
    ],
    ...overrides,
  });
}

describe('database derived contract', () => {
  test('compiles source references into stable property IDs', () => {
    const contract = compileDatabaseDerivedContract(definition());
    expect(contract.diagnostics).toEqual([]);
    expect(contract.graph?.evaluationOrder).toEqual(['prop_double']);
    expect(contract.compiledFormulaAsts.prop_double).toBeDefined();
  });

  test('surfaces formula source/AST drift before commit', () => {
    const value = definition();
    const source = value.sources[0];
    if (!source) throw new Error('fixture source missing');
    const formula = source.properties.find((property) => property.type === 'formula');
    if (!formula || formula.type !== 'formula') throw new Error('fixture formula missing');
    formula.source = 'prop("score") + 1';
    const contract = compileDatabaseDerivedContract(value);
    expect(
      contract.diagnostics.some((diagnostic) => diagnostic.code === 'formula_ast_mismatch'),
    ).toBe(true);
  });

  test('surfaces cross-property cycles with an exact dependency path', () => {
    const value = definition();
    const source = value.sources[0];
    if (!source) throw new Error('fixture source missing');
    const formula = source.properties.find((property) => property.type === 'formula');
    if (!formula || formula.type !== 'formula') throw new Error('fixture formula missing');
    formula.source = 'prop("double") + 1';
    formula.ast = {
      language: 'synapse-formula-1',
      version: 1,
      resultType: 'number',
      expression: {
        type: 'binary',
        operator: 'add',
        left: { type: 'property', propertyId: 'prop_double' },
        right: { type: 'literal', valueType: 'number', value: 1 },
      },
    };
    const contract = compileDatabaseDerivedContract(value);
    expect(contract.diagnostics.some((diagnostic) => diagnostic.code === 'dependency_cycle')).toBe(
      true,
    );
    expect(
      contract.diagnostics.find((diagnostic) => diagnostic.code === 'dependency_cycle')
        ?.dependencyPath,
    ).toEqual(['prop_double', 'prop_double']);
  });
});
