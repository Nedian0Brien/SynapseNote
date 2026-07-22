import { describe, expect, test } from 'bun:test';
import { formulaErrorResult, formulaValueResult } from './formula-result.ts';
import {
  aggregateDatabaseRollup,
  DATABASE_ROLLUP_FUNCTIONS,
  RollupAggregationError,
  type RollupAggregationInput,
} from './rollup.ts';

function input(
  function_: RollupAggregationInput['function'],
  targets: RollupAggregationInput['targets'],
  overrides: Partial<RollupAggregationInput> = {},
): RollupAggregationInput {
  return {
    sourceId: 'ds_orders',
    relationPropertyId: 'prop_items',
    targetSourceId: 'ds_items',
    targetPropertyId: 'prop_amount',
    function: function_,
    targetValueType: 'number',
    permission: { applied: true, revision: 'perm-7' },
    snapshot: { complete: true, truncatedBy: null },
    targets,
    ...overrides,
  };
}

describe('permission-filtered database Rollups', () => {
  test('implements the complete agreed aggregation function surface', () => {
    expect(DATABASE_ROLLUP_FUNCTIONS).toEqual([
      'count_all',
      'count_values',
      'count_unique',
      'percent_empty',
      'percent_not_empty',
      'sum',
      'average',
      'min',
      'max',
      'earliest',
      'latest',
      'show_original',
    ]);
  });

  test('counts only visible targets and distinguishes empty values from zero', () => {
    const targets = [
      { recordId: 'rec_item_1', value: formulaValueResult('number', 0) },
      { recordId: 'rec_item_2' },
      { recordId: 'rec_item_3', value: formulaValueResult('number', 0) },
    ];
    const countAll = aggregateDatabaseRollup(input('count_all', targets));
    const countValues = aggregateDatabaseRollup(input('count_values', targets));
    const countUnique = aggregateDatabaseRollup(input('count_unique', targets));
    const percentEmpty = aggregateDatabaseRollup(input('percent_empty', targets));

    expect(countAll.result).toEqual(formulaValueResult('number', 3));
    expect(countValues.result).toEqual(formulaValueResult('number', 2));
    expect(countUnique.result).toEqual(formulaValueResult('number', 1));
    expect(percentEmpty.result).toEqual(formulaValueResult('number', (1 / 3) * 100));
    expect(countValues).toMatchObject({
      visibleTargetCount: 3,
      populatedTargetCount: 2,
      projectedValueCount: 2,
      complete: true,
      permission: { applied: true, revision: 'perm-7' },
    });
    expect(countValues).not.toHaveProperty('deniedTargetCount');
  });

  test('flattens one list level for numeric aggregates and show-original', () => {
    const targets = [
      { recordId: 'rec_item_1', value: formulaValueResult('list', [1, 2]) },
      { recordId: 'rec_item_2', value: formulaValueResult('list', [3]) },
      { recordId: 'rec_item_3', value: formulaValueResult('list', []) },
    ];
    const overrides = { targetValueType: 'list' as const, targetItemType: 'number' as const };

    expect(aggregateDatabaseRollup(input('sum', targets, overrides)).result).toEqual(
      formulaValueResult('number', 6),
    );
    expect(aggregateDatabaseRollup(input('average', targets, overrides)).result).toEqual(
      formulaValueResult('number', 2),
    );
    expect(aggregateDatabaseRollup(input('min', targets, overrides)).result).toEqual(
      formulaValueResult('number', 1),
    );
    expect(aggregateDatabaseRollup(input('max', targets, overrides)).result).toEqual(
      formulaValueResult('number', 3),
    );
    expect(aggregateDatabaseRollup(input('show_original', targets, overrides)).result).toEqual(
      formulaValueResult('list', [1, 2, 3]),
    );
  });

  test('returns explicit nulls for empty averages and percentages', () => {
    expect(aggregateDatabaseRollup(input('sum', [])).result).toEqual(
      formulaValueResult('number', 0),
    );
    expect(aggregateDatabaseRollup(input('average', [])).result).toEqual(
      formulaValueResult('null', null),
    );
    expect(aggregateDatabaseRollup(input('percent_not_empty', [])).result).toEqual(
      formulaValueResult('null', null),
    );
    expect(aggregateDatabaseRollup(input('show_original', [])).result).toEqual(
      formulaValueResult('list', []),
    );
  });

  test('selects earliest and latest canonical date points deterministically', () => {
    const targets = [
      {
        recordId: 'rec_item_1',
        value: formulaValueResult('date', { kind: 'date', value: '2026-07-20T09:00:00+09:00' }),
      },
      {
        recordId: 'rec_item_2',
        value: formulaValueResult('date', { kind: 'date', value: '2026-07-19' }),
      },
    ];
    const overrides = {
      targetValueType: 'date' as const,
      targetPropertyId: 'prop_due',
    };

    expect(aggregateDatabaseRollup(input('earliest', targets, overrides)).result).toEqual(
      formulaValueResult('date', { kind: 'date', value: '2026-07-19' }),
    );
    expect(aggregateDatabaseRollup(input('latest', targets, overrides)).result).toEqual(
      formulaValueResult('date', { kind: 'date', value: '2026-07-20T09:00:00+09:00' }),
    );
  });

  test('preserves visible target errors while relation-only count remains usable', () => {
    const targets = [
      {
        recordId: 'rec_item_1',
        value: formulaErrorResult({ code: 'divide_by_zero', message: 'Division by zero' }),
      },
      { recordId: 'rec_item_2', value: formulaValueResult('number', 2) },
    ];
    const sum = aggregateDatabaseRollup(input('sum', targets));

    expect(sum.result).toEqual({
      kind: 'error',
      problem: {
        code: 'dependency_error',
        message: 'Dependency "prop_amount" failed',
        propertyId: 'prop_amount',
        path: ['targets', 'rec_item_1'],
        cause: { code: 'divide_by_zero', message: 'Division by zero' },
      },
    });
    expect(aggregateDatabaseRollup(input('count_all', targets)).result).toEqual(
      formulaValueResult('number', 2),
    );
  });

  test('marks truncated relation snapshots without fabricating completeness', () => {
    const result = aggregateDatabaseRollup(
      input('sum', [{ recordId: 'rec_item_1', value: formulaValueResult('number', 4) }], {
        snapshot: { complete: false, truncatedBy: 'relation_limit' },
      }),
    );

    expect(result).toMatchObject({
      result: formulaValueResult('number', 4),
      complete: false,
      truncatedBy: 'relation_limit',
    });
  });

  test('fails closed without a permission receipt or with duplicate and incompatible targets', () => {
    expect(() =>
      aggregateDatabaseRollup({
        ...input('sum', []),
        permission: { applied: false, revision: 'perm-7' },
      }),
    ).toThrow(expect.objectContaining({ code: 'permission_not_applied' }));
    expect(() =>
      aggregateDatabaseRollup({
        ...input('sum', []),
        deniedRecordIds: ['rec_secret'],
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_aggregation' }));
    expect(() =>
      aggregateDatabaseRollup(
        input('count_all', [{ recordId: 'rec_item_1' }, { recordId: 'rec_item_1' }]),
      ),
    ).toThrow(expect.objectContaining({ code: 'duplicate_target' }));
    expect(() =>
      aggregateDatabaseRollup(input('earliest', [], { targetValueType: 'number' })),
    ).toThrow(expect.objectContaining({ code: 'incompatible_function' }));

    const largeList = formulaValueResult(
      'list',
      Array.from({ length: 5_001 }, (_, index) => index),
    );
    expect(() =>
      aggregateDatabaseRollup(
        input(
          'show_original',
          [
            { recordId: 'rec_item_1', value: largeList },
            { recordId: 'rec_item_2', value: largeList },
          ],
          { targetValueType: 'list', targetItemType: 'number' },
        ),
      ),
    ).toThrow(expect.objectContaining({ code: 'resource_limit' }));
  });

  test('returns a typed value error when a visible target violates its declared projection', () => {
    const result = aggregateDatabaseRollup(
      input('count_unique', [
        { recordId: 'rec_item_1', value: formulaValueResult('text', 'not a number') },
      ]),
    );

    expect(result.result).toEqual({
      kind: 'error',
      problem: {
        code: 'argument_type',
        message: 'Rollup target "rec_item_1" produced text; expected number',
        propertyId: 'prop_amount',
        path: ['targets', 'rec_item_1'],
      },
    });
    expect(result.projectedValueCount).toBe(0);
    expect(result).not.toBeInstanceOf(RollupAggregationError);
  });
});
