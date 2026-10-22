import { describe, expect, test } from 'bun:test';
import { buildFormulaDependencyGraph } from './formula-dependencies.ts';
import {
  executeFormulaRecomputation,
  executeScopedFormulaRecomputation,
  FormulaRecomputeError,
  planFormulaRecomputation,
} from './formula-recompute.ts';

function propertyAst(...propertyIds: string[]) {
  const expressions = propertyIds.map((propertyId) => ({
    type: 'property' as const,
    propertyId,
  }));
  const expression = expressions
    .slice(1)
    .reduce(
      (left, right) => ({ type: 'binary' as const, operator: 'add' as const, left, right }),
      expressions[0] ?? { type: 'literal' as const, valueType: 'number' as const, value: 0 },
    );
  return {
    language: 'synapse-formula-1' as const,
    version: 1 as const,
    resultType: 'number' as const,
    expression,
  };
}

function acyclicGraph() {
  return buildFormulaDependencyGraph([
    {
      propertyId: 'prop_subtotal',
      sourceId: 'ds_orders',
      kind: 'formula',
      ast: propertyAst('prop_price'),
    },
    {
      propertyId: 'prop_tax',
      sourceId: 'ds_orders',
      kind: 'formula',
      ast: propertyAst('prop_subtotal', 'prop_rate'),
    },
    {
      propertyId: 'prop_total',
      sourceId: 'ds_customers',
      kind: 'rollup',
      dependencies: ['prop_tax', 'prop_orders_relation'],
    },
    {
      propertyId: 'prop_unrelated',
      sourceId: 'ds_orders',
      kind: 'formula',
      ast: propertyAst('prop_note'),
    },
  ]);
}

describe('incremental Formula and Rollup recomputation', () => {
  test('plans only the transitive dependency slice in stable evaluation order', () => {
    const plan = planFormulaRecomputation(acyclicGraph(), {
      changedPropertyIds: ['prop_price', 'prop_price'],
    });

    expect(plan).toMatchObject({
      changedPropertyIds: ['prop_price'],
      directlyAffectedPropertyIds: ['prop_subtotal'],
      potentiallyAffectedPropertyIds: ['prop_subtotal', 'prop_tax', 'prop_total'],
      blockedPropertyIds: [],
    });
    expect(plan.steps.map((step) => step.propertyId)).toEqual([
      'prop_subtotal',
      'prop_tax',
      'prop_total',
    ]);
    expect(plan.steps.some((step) => step.propertyId === 'prop_unrelated')).toBe(false);
  });

  test('prunes downstream work when an evaluated result did not change', async () => {
    const plan = planFormulaRecomputation(acyclicGraph(), {
      changedPropertyIds: ['prop_price'],
    });
    const calls: string[] = [];
    const report = await executeFormulaRecomputation(plan, ({ propertyId }) => {
      calls.push(propertyId);
      return { changed: false };
    });

    expect(calls).toEqual(['prop_subtotal']);
    expect(report).toEqual({
      evaluated: [
        {
          propertyId: 'prop_subtotal',
          triggerPropertyIds: ['prop_price'],
          changed: false,
        },
      ],
      prunedPropertyIds: ['prop_tax', 'prop_total'],
      blockedPropertyIds: [],
    });
  });

  test('keeps independent direct causes dirty while propagating only actual changes', async () => {
    const plan = planFormulaRecomputation(acyclicGraph(), {
      changedPropertyIds: ['prop_rate', 'prop_price'],
    });
    const report = await executeFormulaRecomputation(plan, ({ propertyId }) => ({
      changed: propertyId !== 'prop_subtotal',
    }));

    expect(report.evaluated).toEqual([
      {
        propertyId: 'prop_subtotal',
        triggerPropertyIds: ['prop_price'],
        changed: false,
      },
      { propertyId: 'prop_tax', triggerPropertyIds: ['prop_rate'], changed: true },
      { propertyId: 'prop_total', triggerPropertyIds: ['prop_tax'], changed: true },
    ]);
    expect(report.prunedPropertyIds).toEqual([]);
  });

  test('distinguishes a changed cached value from a definition invalidation', async () => {
    const changedValuePlan = planFormulaRecomputation(acyclicGraph(), {
      changedPropertyIds: ['prop_subtotal'],
    });
    expect(changedValuePlan.steps.map((step) => step.propertyId)).toEqual([
      'prop_tax',
      'prop_total',
    ]);

    const invalidatedPlan = planFormulaRecomputation(acyclicGraph(), {
      invalidatedComputedPropertyIds: ['prop_subtotal'],
    });
    const report = await executeFormulaRecomputation(invalidatedPlan, () => ({ changed: true }));
    expect(report.evaluated.map((entry) => entry.propertyId)).toEqual([
      'prop_subtotal',
      'prop_tax',
      'prop_total',
    ]);
    expect(report.evaluated[0]?.triggerPropertyIds).toEqual(['prop_subtotal']);
  });

  test('surfaces affected cycle members and their downstream nodes without running them', () => {
    const graph = buildFormulaDependencyGraph(
      [
        {
          propertyId: 'prop_cycle_a',
          sourceId: 'ds_orders',
          kind: 'formula',
          ast: propertyAst('prop_cycle_b', 'prop_raw'),
        },
        {
          propertyId: 'prop_cycle_b',
          sourceId: 'ds_orders',
          kind: 'formula',
          ast: propertyAst('prop_cycle_a'),
        },
        {
          propertyId: 'prop_downstream',
          sourceId: 'ds_orders',
          kind: 'rollup',
          dependencies: ['prop_cycle_b'],
        },
        {
          propertyId: 'prop_safe',
          sourceId: 'ds_orders',
          kind: 'formula',
          ast: propertyAst('prop_other'),
        },
      ],
      { cyclePolicy: 'surface' },
    );
    const plan = planFormulaRecomputation(graph, { changedPropertyIds: ['prop_raw'] });

    expect(plan.directlyAffectedPropertyIds).toEqual(['prop_cycle_a']);
    expect(plan.potentiallyAffectedPropertyIds).toEqual([
      'prop_cycle_a',
      'prop_cycle_b',
      'prop_downstream',
    ]);
    expect(plan.blockedPropertyIds).toEqual(['prop_cycle_a', 'prop_cycle_b', 'prop_downstream']);
    expect(plan.steps).toEqual([]);
  });

  test('rejects malformed changes, unknown invalidations, and evaluator failures structurally', async () => {
    const graph = acyclicGraph();
    expect(() => planFormulaRecomputation(graph, { changedPropertyIds: ['not an id'] })).toThrow(
      expect.objectContaining({ code: 'invalid_change_set' }),
    );
    expect(() =>
      planFormulaRecomputation(graph, {
        invalidatedComputedPropertyIds: ['prop_missing'],
      }),
    ).toThrow(expect.objectContaining({ code: 'unknown_computed_property' }));

    const plan = planFormulaRecomputation(graph, { changedPropertyIds: ['prop_price'] });
    try {
      await executeFormulaRecomputation(plan, () => {
        throw new Error('adapter offline');
      });
      throw new Error('expected evaluation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(FormulaRecomputeError);
      expect(error).toMatchObject({
        code: 'evaluation_failed',
        details: {
          propertyId: 'prop_subtotal',
          evaluatedPropertyIds: [],
          cause: 'adapter offline',
        },
      });
    }
  });

  test('recomputes only changed records and reverse-related Rollup owners', async () => {
    const report = await executeScopedFormulaRecomputation({
      graph: acyclicGraph(),
      changes: [
        { sourceId: 'ds_orders', recordId: 'rec_order_2', propertyId: 'prop_price' },
        { sourceId: 'ds_orders', recordId: 'rec_order_1', propertyId: 'prop_price' },
      ],
      resolveDependentRecords: ({ change, dependent }) => {
        if (dependent.propertyId !== 'prop_total') return [];
        return change.recordId === 'rec_order_1' ? ['rec_customer_1'] : ['rec_customer_2'];
      },
      evaluate: ({ propertyId, recordId }) => ({
        changed: propertyId !== 'prop_subtotal' || recordId === 'rec_order_1',
      }),
    });

    expect(
      report.evaluated.map(({ sourceId, recordId, propertyId, changed }) => ({
        sourceId,
        recordId,
        propertyId,
        changed,
      })),
    ).toEqual([
      {
        sourceId: 'ds_orders',
        recordId: 'rec_order_1',
        propertyId: 'prop_subtotal',
        changed: true,
      },
      {
        sourceId: 'ds_orders',
        recordId: 'rec_order_2',
        propertyId: 'prop_subtotal',
        changed: false,
      },
      {
        sourceId: 'ds_orders',
        recordId: 'rec_order_1',
        propertyId: 'prop_tax',
        changed: true,
      },
      {
        sourceId: 'ds_customers',
        recordId: 'rec_customer_1',
        propertyId: 'prop_total',
        changed: true,
      },
    ]);
    expect(report.blockedTargets).toEqual([]);
  });

  test('validates scoped targets and wraps reverse-relation resolution failures', async () => {
    await expect(
      executeScopedFormulaRecomputation({
        graph: acyclicGraph(),
        changes: [{ sourceId: 'bad', recordId: 'rec_order_1', propertyId: 'prop_price' }],
        evaluate: () => ({ changed: true }),
      }),
    ).rejects.toMatchObject({ code: 'invalid_change_set' });

    await expect(
      executeScopedFormulaRecomputation({
        graph: acyclicGraph(),
        changes: [{ sourceId: 'ds_orders', recordId: 'rec_order_1', propertyId: 'prop_price' }],
        resolveDependentRecords: () => {
          throw new Error('relation index unavailable');
        },
        evaluate: () => ({ changed: true }),
      }),
    ).rejects.toMatchObject({
      code: 'target_resolution_failed',
      details: { cause: 'relation index unavailable' },
    });
  });

  test('invalidates only the explicitly named computed record target', async () => {
    const report = await executeScopedFormulaRecomputation({
      graph: acyclicGraph(),
      invalidatedTargets: [
        {
          sourceId: 'ds_orders',
          recordId: 'rec_order_3',
          propertyId: 'prop_subtotal',
        },
      ],
      evaluate: () => ({ changed: false }),
    });

    expect(report.evaluated).toEqual([
      {
        sourceId: 'ds_orders',
        recordId: 'rec_order_3',
        propertyId: 'prop_subtotal',
        kind: 'formula',
        triggers: [
          {
            sourceId: 'ds_orders',
            recordId: 'rec_order_3',
            propertyId: 'prop_subtotal',
          },
        ],
        changed: false,
      },
    ]);
  });
});
