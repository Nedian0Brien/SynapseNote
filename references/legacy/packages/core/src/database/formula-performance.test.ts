import { describe, expect, test } from 'bun:test';
import {
  buildFormulaDependencyGraph,
  FORMULA_DEPENDENCY_MAX_EDGES,
  FORMULA_DEPENDENCY_MAX_NODES,
  type FormulaComputedPropertyInput,
} from './formula-dependencies.ts';
import { executeFormulaRecomputation, planFormulaRecomputation } from './formula-recompute.ts';

const PERFORMANCE_BUDGET_MS = 5_000;

function propertyId(index: number): string {
  return `prop_perf_${index.toString().padStart(5, '0')}`;
}

function rollup(
  propertyId_: string,
  dependencies: readonly string[],
): FormulaComputedPropertyInput {
  return {
    propertyId: propertyId_,
    sourceId: 'ds_performance',
    kind: 'rollup',
    dependencies,
  };
}

describe('Formula dependency and recomputation scale boundaries', () => {
  test('builds and incrementally executes the maximum-depth acyclic chain without recursion', async () => {
    const inputs = Array.from({ length: FORMULA_DEPENDENCY_MAX_NODES }, (_, index) =>
      rollup(propertyId(index), [index === 0 ? 'prop_raw' : propertyId(index - 1)]),
    );
    const started = performance.now();
    const graph = buildFormulaDependencyGraph(inputs);
    const plan = planFormulaRecomputation(graph, { changedPropertyIds: ['prop_raw'] });
    const report = await executeFormulaRecomputation(plan, () => ({ changed: true }));
    const elapsed = performance.now() - started;

    expect(graph.cycles).toEqual([]);
    expect(graph.evaluationOrder).toHaveLength(FORMULA_DEPENDENCY_MAX_NODES);
    expect(graph.evaluationOrder[0]).toBe(propertyId(0));
    expect(graph.evaluationOrder.at(-1)).toBe(propertyId(FORMULA_DEPENDENCY_MAX_NODES - 1));
    expect(report.evaluated).toHaveLength(FORMULA_DEPENDENCY_MAX_NODES);
    expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  test('handles maximum-node fan-out and prunes every unchanged downstream branch', async () => {
    const root = propertyId(0);
    const inputs = [
      rollup(root, ['prop_raw']),
      ...Array.from({ length: FORMULA_DEPENDENCY_MAX_NODES - 1 }, (_, offset) =>
        rollup(propertyId(offset + 1), [root]),
      ),
    ];
    const started = performance.now();
    const graph = buildFormulaDependencyGraph(inputs);
    const plan = planFormulaRecomputation(graph, { changedPropertyIds: ['prop_raw'] });
    const report = await executeFormulaRecomputation(plan, () => ({ changed: false }));
    const elapsed = performance.now() - started;

    expect(graph.nodes.find((node) => node.propertyId === root)?.dependents).toHaveLength(
      FORMULA_DEPENDENCY_MAX_NODES - 1,
    );
    expect(report.evaluated.map((entry) => entry.propertyId)).toEqual([root]);
    expect(report.prunedPropertyIds).toHaveLength(FORMULA_DEPENDENCY_MAX_NODES - 1);
    expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  test('surfaces one maximum-size cycle with a concrete path and no stack overflow', () => {
    const inputs = Array.from({ length: FORMULA_DEPENDENCY_MAX_NODES }, (_, index) =>
      rollup(propertyId(index), [
        index === 0 ? propertyId(FORMULA_DEPENDENCY_MAX_NODES - 1) : propertyId(index - 1),
      ]),
    );
    const started = performance.now();
    const graph = buildFormulaDependencyGraph(inputs, { cyclePolicy: 'surface' });
    const elapsed = performance.now() - started;

    expect(graph.cycles).toHaveLength(1);
    expect(graph.cycles[0]?.propertyIds).toHaveLength(FORMULA_DEPENDENCY_MAX_NODES);
    expect(graph.cycles[0]?.path).toHaveLength(FORMULA_DEPENDENCY_MAX_NODES + 1);
    expect(graph.cycles[0]?.path[0]).toBe(graph.cycles[0]?.path.at(-1));
    expect(graph.blockedPropertyIds).toHaveLength(FORMULA_DEPENDENCY_MAX_NODES);
    expect(graph.evaluationOrder).toEqual([]);
    expect(elapsed).toBeLessThan(PERFORMANCE_BUDGET_MS);
  });

  test('rejects the first edge beyond the documented graph budget', () => {
    const edgesPerNode = 11;
    const nodeCount = Math.floor(FORMULA_DEPENDENCY_MAX_EDGES / edgesPerNode) + 1;
    const dependencies = Array.from({ length: edgesPerNode }, (_, index) => `prop_raw_${index}`);
    const inputs = Array.from({ length: nodeCount }, (_, index) =>
      rollup(propertyId(index), dependencies),
    );

    expect(() => buildFormulaDependencyGraph(inputs)).toThrow(
      expect.objectContaining({
        code: 'resource_limit',
        details: {
          observed: FORMULA_DEPENDENCY_MAX_EDGES + 1,
          maximum: FORMULA_DEPENDENCY_MAX_EDGES,
        },
      }),
    );
  });
});
