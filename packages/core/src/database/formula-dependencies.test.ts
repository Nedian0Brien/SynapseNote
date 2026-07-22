import { describe, expect, test } from 'bun:test';
import {
  buildFormulaDependencyGraph,
  collectFormulaPropertyDependencies,
  FormulaDependencyError,
} from './formula-dependencies.ts';

function ast(expression: unknown, resultType: 'number' | 'text' = 'number') {
  return {
    language: 'synapse-formula-1' as const,
    version: 1 as const,
    resultType,
    expression,
  };
}

function property(propertyId: string) {
  return { type: 'property' as const, propertyId };
}

describe('formula and rollup dependency graph', () => {
  test('extracts stable dependencies through relation traversal, calls, lets, and lambdas', () => {
    const dependencies = collectFormulaPropertyDependencies(
      ast({
        type: 'let',
        bindings: [
          {
            name: 'pages',
            value: property('prop_projects'),
          },
        ],
        body: {
          type: 'call',
          function: 'map',
          arguments: [
            { type: 'variable', name: 'pages' },
            {
              type: 'lambda',
              parameters: ['page'],
              body: {
                type: 'property',
                propertyId: 'prop_budget',
                record: { type: 'variable', name: 'page' },
              },
            },
            property('prop_projects'),
          ],
        },
      }),
    );
    expect(dependencies).toEqual(['prop_budget', 'prop_projects']);
  });

  test('builds deterministic dependency-first order and reverse dependents', () => {
    const graph = buildFormulaDependencyGraph([
      {
        propertyId: 'prop_total',
        sourceId: 'ds_tasks',
        kind: 'formula',
        ast: ast({
          type: 'binary',
          operator: 'add',
          left: property('prop_tax'),
          right: property('prop_raw'),
        }),
      },
      {
        propertyId: 'prop_tax',
        sourceId: 'ds_tasks',
        kind: 'formula',
        ast: ast({
          type: 'binary',
          operator: 'multiply',
          left: property('prop_subtotal'),
          right: { type: 'literal', valueType: 'number', value: 0.1 },
        }),
      },
      {
        propertyId: 'prop_subtotal',
        sourceId: 'ds_tasks',
        kind: 'rollup',
        dependencies: ['prop_line_items', 'prop_line_amount'],
      },
      {
        propertyId: 'prop_independent',
        sourceId: 'ds_tasks',
        kind: 'formula',
        ast: ast({ type: 'literal', valueType: 'number', value: 1 }),
      },
    ]);

    expect(graph.cycles).toEqual([]);
    expect(graph.blockedPropertyIds).toEqual([]);
    expect(graph.evaluationOrder).toEqual([
      'prop_independent',
      'prop_subtotal',
      'prop_tax',
      'prop_total',
    ]);
    expect(graph.nodes.find((node) => node.propertyId === 'prop_tax')).toMatchObject({
      computedDependencies: ['prop_subtotal'],
      dependents: ['prop_total'],
    });
    expect(graph.nodes.find((node) => node.propertyId === 'prop_subtotal')).toMatchObject({
      dependencies: ['prop_line_amount', 'prop_line_items'],
      dependents: ['prop_tax'],
    });
  });

  test('surfaces canonical direct and indirect cycles and blocks only their downstream nodes', () => {
    const graph = buildFormulaDependencyGraph(
      [
        {
          propertyId: 'prop_a',
          sourceId: 'ds_tasks',
          kind: 'formula',
          ast: ast(property('prop_b')),
        },
        {
          propertyId: 'prop_b',
          sourceId: 'ds_tasks',
          kind: 'formula',
          ast: ast(property('prop_a')),
        },
        {
          propertyId: 'prop_self',
          sourceId: 'ds_tasks',
          kind: 'rollup',
          dependencies: ['prop_self'],
        },
        {
          propertyId: 'prop_downstream',
          sourceId: 'ds_tasks',
          kind: 'formula',
          ast: ast(property('prop_a')),
        },
        {
          propertyId: 'prop_safe',
          sourceId: 'ds_tasks',
          kind: 'formula',
          ast: ast({ type: 'literal', valueType: 'number', value: 1 }),
        },
      ],
      { cyclePolicy: 'surface' },
    );

    expect(graph.cycles).toEqual([
      {
        propertyIds: ['prop_a', 'prop_b'],
        path: ['prop_a', 'prop_b', 'prop_a'],
      },
      {
        propertyIds: ['prop_self'],
        path: ['prop_self', 'prop_self'],
      },
    ]);
    expect(graph.blockedPropertyIds).toEqual(['prop_a', 'prop_b', 'prop_downstream', 'prop_self']);
    expect(graph.evaluationOrder).toEqual(['prop_safe']);
  });

  test('rejects cycles by default with the complete surfaced graph attached', () => {
    try {
      buildFormulaDependencyGraph([
        {
          propertyId: 'prop_a',
          sourceId: 'ds_tasks',
          kind: 'formula',
          ast: ast(property('prop_b')),
        },
        {
          propertyId: 'prop_b',
          sourceId: 'ds_tasks',
          kind: 'rollup',
          dependencies: ['prop_a'],
        },
      ]);
      throw new Error('expected dependency cycle');
    } catch (error) {
      expect(error).toBeInstanceOf(FormulaDependencyError);
      expect(error).toMatchObject({
        code: 'dependency_cycle',
        details: {
          cycles: [{ propertyIds: ['prop_a', 'prop_b'] }],
          graph: { blockedPropertyIds: ['prop_a', 'prop_b'] },
        },
      });
    }
  });

  test('rejects duplicate nodes, malformed IDs, missing formula ASTs, and invalid rollup edges', () => {
    const formula = {
      propertyId: 'prop_a',
      sourceId: 'ds_tasks',
      kind: 'formula' as const,
      ast: ast({ type: 'literal', valueType: 'number', value: 1 }),
    };
    expect(() => buildFormulaDependencyGraph([formula, formula])).toThrow(
      expect.objectContaining({ code: 'duplicate_computed_property' }),
    );
    expect(() => buildFormulaDependencyGraph([{ ...formula, propertyId: 'A' }])).toThrow(
      expect.objectContaining({ code: 'invalid_computed_property' }),
    );
    expect(() =>
      buildFormulaDependencyGraph([
        { propertyId: 'prop_missing', sourceId: 'ds_tasks', kind: 'formula' },
      ]),
    ).toThrow(expect.objectContaining({ code: 'invalid_computed_property' }));
    expect(() =>
      buildFormulaDependencyGraph([
        {
          propertyId: 'prop_rollup',
          sourceId: 'ds_tasks',
          kind: 'rollup',
          dependencies: ['not-an-id'],
        },
      ]),
    ).toThrow(expect.objectContaining({ code: 'invalid_computed_property' }));
  });
});
