import { describe, expect, test } from 'bun:test';
import type { FormulaAst, FormulaExpression, FormulaValueType } from './formula.ts';
import { evaluateFormula } from './formula-evaluator.ts';
import { formulaErrorResult, formulaValueResult } from './formula-result.ts';

const context = {
  now: '2026-07-20T03:04:05.000Z',
  timeZone: 'Asia/Seoul',
  locale: 'en-US',
};

function ast(resultType: FormulaValueType, expression: FormulaExpression): FormulaAst {
  return { language: 'synapse-formula-1', version: 1, resultType, expression };
}

const literal = (value: number): FormulaExpression => ({
  type: 'literal',
  valueType: 'number',
  value,
});

describe('Synapse Formula 1 evaluator', () => {
  test('evaluates properties, sequential lets, arithmetic, and standard functions', () => {
    const formula = ast('number', {
      type: 'let',
      bindings: [
        {
          name: 'subtotal',
          value: { type: 'property', propertyId: 'prop_price' },
        },
      ],
      body: {
        type: 'call',
        function: 'round',
        arguments: [
          {
            type: 'binary',
            operator: 'multiply',
            left: { type: 'variable', name: 'subtotal' },
            right: literal(1.5),
          },
        ],
      },
    });

    expect(
      evaluateFormula({
        ast: formula,
        context,
        resolveProperty: ({ propertyId }) =>
          propertyId === 'prop_price'
            ? formulaValueResult('number', 3)
            : formulaErrorResult({ code: 'missing_property', message: 'Missing' }),
      }),
    ).toEqual(formulaValueResult('number', 5));
  });

  test('short-circuits boolean and conditional branches', () => {
    let resolutions = 0;
    const resolveProperty = () => {
      resolutions += 1;
      return formulaErrorResult({ code: 'missing_property', message: 'Should not run' });
    };
    const andFormula = ast('boolean', {
      type: 'binary',
      operator: 'and',
      left: { type: 'literal', valueType: 'boolean', value: false },
      right: { type: 'property', propertyId: 'prop_unreachable' },
    });
    const conditional = ast('text', {
      type: 'conditional',
      condition: { type: 'literal', valueType: 'boolean', value: true },
      whenTrue: { type: 'literal', valueType: 'text', value: 'selected' },
      whenFalse: { type: 'property', propertyId: 'prop_unreachable' },
    });

    expect(evaluateFormula({ ast: andFormula, context, resolveProperty })).toEqual(
      formulaValueResult('boolean', false),
    );
    expect(evaluateFormula({ ast: conditional, context, resolveProperty })).toEqual(
      formulaValueResult('text', 'selected'),
    );
    expect(resolutions).toBe(0);
  });

  test('passes a stable related page to relation property traversal', () => {
    const calls: unknown[] = [];
    const formula = ast('text', {
      type: 'property',
      propertyId: 'prop_customer_name',
      record: { type: 'property', propertyId: 'prop_customer' },
    });
    const result = evaluateFormula({
      ast: formula,
      context,
      resolveProperty: (request) => {
        calls.push(request);
        return request.propertyId === 'prop_customer'
          ? formulaValueResult('page', {
              kind: 'page',
              id: 'rec_customer_1',
              sourceId: 'ds_customers',
              title: 'Acme',
            })
          : formulaValueResult('text', 'Acme');
      },
    });

    expect(result).toEqual(formulaValueResult('text', 'Acme'));
    expect(calls).toEqual([
      { propertyId: 'prop_customer' },
      {
        propertyId: 'prop_customer_name',
        record: {
          kind: 'page',
          id: 'rec_customer_1',
          sourceId: 'ds_customers',
          title: 'Acme',
        },
      },
    ]);
  });

  test('evaluates higher-order list lambdas inside the same step budget', () => {
    const formula = ast('list', {
      type: 'call',
      function: 'map',
      arguments: [
        { type: 'list', items: [literal(1), literal(2), literal(3)] },
        {
          type: 'lambda',
          parameters: ['value'],
          body: {
            type: 'binary',
            operator: 'multiply',
            left: { type: 'variable', name: 'value' },
            right: literal(2),
          },
        },
      ],
    });

    expect(
      evaluateFormula({
        ast: formula,
        context,
        resolveProperty: () => formulaValueResult('null', null),
      }),
    ).toEqual(formulaValueResult('list', [2, 4, 6]));
  });

  test('uses the frozen function context and explicit rounding semantics', () => {
    const today = ast('date', { type: 'call', function: 'today', arguments: [] });
    const round = ast('number', {
      type: 'call',
      function: 'round',
      arguments: [
        {
          type: 'unary',
          operator: 'negate',
          operand: { type: 'literal', valueType: 'number', value: 1.5 },
        },
      ],
    });

    expect(
      evaluateFormula({
        ast: today,
        context,
        resolveProperty: () => formulaValueResult('null', null),
      }),
    ).toEqual(formulaValueResult('date', { kind: 'date', value: '2026-07-20' }));
    expect(
      evaluateFormula({
        ast: round,
        context,
        resolveProperty: () => formulaValueResult('null', null),
      }),
    ).toEqual(formulaValueResult('number', -1));
  });

  test('preserves dependency, operand, division, function, and result errors', () => {
    const property = ast('number', { type: 'property', propertyId: 'prop_failed' });
    expect(
      evaluateFormula({
        ast: property,
        context,
        resolveProperty: () =>
          formulaErrorResult({ code: 'permission_denied', message: 'Not visible' }),
      }),
    ).toEqual({
      kind: 'error',
      problem: {
        code: 'dependency_error',
        message: 'Dependency "prop_failed" failed',
        propertyId: 'prop_failed',
        path: ['expression'],
        cause: { code: 'permission_denied', message: 'Not visible' },
      },
    });

    const divide = ast('number', {
      type: 'binary',
      operator: 'divide',
      left: literal(1),
      right: literal(0),
    });
    expect(
      evaluateFormula({
        ast: divide,
        context,
        resolveProperty: () => formulaValueResult('null', null),
      }),
    ).toMatchObject({
      kind: 'error',
      problem: { code: 'divide_by_zero', path: ['expression'] },
    });

    const unknown = ast('number', { type: 'call', function: 'missing', arguments: [] });
    expect(
      evaluateFormula({
        ast: unknown,
        context,
        resolveProperty: () => formulaValueResult('null', null),
      }),
    ).toMatchObject({
      kind: 'error',
      problem: { code: 'unknown_function', function: 'missing' },
    });

    const mismatch = ast('number', { type: 'literal', valueType: 'text', value: 'wrong' });
    expect(
      evaluateFormula({
        ast: mismatch,
        context,
        resolveProperty: () => formulaValueResult('null', null),
      }),
    ).toMatchObject({
      kind: 'error',
      problem: { code: 'result_type_mismatch', path: ['resultType'] },
    });
  });

  test('retains typed null and rejects unsupported or resource-exhausting evaluation', () => {
    const nullable = ast('number', { type: 'property', propertyId: 'prop_optional' });
    expect(
      evaluateFormula({
        ast: nullable,
        context,
        resolveProperty: () => formulaValueResult('null', null),
      }),
    ).toEqual(formulaValueResult('null', null));

    expect(
      evaluateFormula({
        ast: { ...nullable, version: 2 },
        context,
        resolveProperty: () => formulaValueResult('null', null),
      }),
    ).toMatchObject({ kind: 'error', problem: { code: 'unsupported_version' } });

    const mapMany = ast('list', {
      type: 'call',
      function: 'map',
      arguments: [
        { type: 'property', propertyId: 'prop_many' },
        { type: 'lambda', parameters: ['value'], body: { type: 'variable', name: 'value' } },
      ],
    });
    expect(
      evaluateFormula({
        ast: mapMany,
        context,
        maxSteps: 2_048,
        resolveProperty: () =>
          formulaValueResult(
            'list',
            Array.from({ length: 2_100 }, (_, index) => index),
          ),
      }),
    ).toMatchObject({ kind: 'error', problem: { code: 'resource_limit' } });
  });
});
