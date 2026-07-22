import { describe, expect, test } from 'bun:test';
import {
  captureFormulaComputation,
  FormulaResultError,
  FormulaRuntimeFailure,
  type FormulaRuntimeProblem,
  formulaComputedResultChanged,
  formulaDependencyErrorResult,
  formulaErrorResult,
  formulaFunctionErrorResult,
  formulaValueResult,
  parseFormulaComputedResult,
  serializeFormulaComputedResult,
} from './formula-result.ts';

describe('typed Formula computation results', () => {
  test('round-trips canonical typed values without host coercion', () => {
    const result = formulaValueResult('list', [
      { kind: 'date', value: '2026-07-20' },
      { kind: 'person', id: 'person_agent', name: 'Research agent' },
      {
        kind: 'page',
        id: 'rec_customer_1',
        sourceId: 'ds_customers',
        title: 'Acme',
      },
    ]);
    const serialized = serializeFormulaComputedResult(result);

    expect(serialized).toBe(
      '{"kind":"value","value":[{"kind":"date","value":"2026-07-20"},{"id":"person_agent","kind":"person","name":"Research agent"},{"id":"rec_customer_1","kind":"page","sourceId":"ds_customers","title":"Acme"}],"valueType":"list"}\n',
    );
    expect(parseFormulaComputedResult(JSON.parse(serialized))).toEqual(result);
  });

  test('preserves standard-function failures as errors, never empty values', () => {
    const result = formulaFunctionErrorResult(
      {
        code: 'argument_type',
        function: 'sqrt',
        message: 'expected a finite number',
        argumentIndex: 0,
      },
      ['expression', 'arguments', 0],
    );

    expect(result).toEqual({
      kind: 'error',
      problem: {
        code: 'argument_type',
        function: 'sqrt',
        message: 'expected a finite number',
        argumentIndex: 0,
        path: ['expression', 'arguments', 0],
      },
    });
    expect(result).not.toHaveProperty('value');
    expect(serializeFormulaComputedResult(result)).toContain('"kind":"error"');
  });

  test('retains stable dependency identity and the complete typed cause', () => {
    const cause: FormulaRuntimeProblem = {
      code: 'divide_by_zero',
      message: 'Division by zero',
      path: ['expression', 'right'],
    };
    const result = formulaDependencyErrorResult('prop_ratio', cause, ['expression', 'left']);

    expect(result).toEqual({
      kind: 'error',
      problem: {
        code: 'dependency_error',
        message: 'Dependency "prop_ratio" failed',
        propertyId: 'prop_ratio',
        path: ['expression', 'left'],
        cause,
      },
    });
  });

  test('uses exact value-or-error fingerprints for incremental propagation', () => {
    const first = formulaErrorResult({ code: 'domain_error', message: 'Invalid date' });
    const same = formulaErrorResult({ code: 'domain_error', message: 'Invalid date' });
    const changed = formulaErrorResult({ code: 'domain_error', message: 'Out of range' });

    expect(formulaComputedResultChanged(first, same)).toBe(false);
    expect(formulaComputedResultChanged(first, changed)).toBe(true);
    expect(formulaComputedResultChanged(first, formulaValueResult('text', ''))).toBe(true);
  });

  test('rejects mismatched types, lambdas, non-finite numbers, and oversized causes', () => {
    expect(() => formulaValueResult('number', '12')).toThrow(
      expect.objectContaining({ code: 'invalid_result' }),
    );
    expect(() => formulaValueResult('number', Number.POSITIVE_INFINITY)).toThrow(
      expect.objectContaining({ code: 'invalid_result' }),
    );
    expect(() =>
      parseFormulaComputedResult({
        kind: 'value',
        valueType: 'list',
        value: [{ kind: 'lambda', arity: 1 }],
      }),
    ).toThrow(expect.objectContaining({ code: 'invalid_result' }));

    let problem: FormulaRuntimeProblem = { code: 'domain_error', message: 'root' };
    for (let index = 0; index < 18; index += 1) {
      problem = { code: 'dependency_error', message: `cause ${index}`, cause: problem };
    }
    expect(() => formulaErrorResult(problem)).toThrow(
      expect.objectContaining({ code: 'resource_limit' }),
    );
  });

  test('captures typed failures and redacts unexpected exceptions', async () => {
    const typed = await captureFormulaComputation(() => {
      throw new FormulaRuntimeFailure({
        code: 'permission_denied',
        message: 'Related page is not visible',
        propertyId: 'prop_customer',
      });
    });
    expect(typed).toEqual({
      kind: 'error',
      problem: {
        code: 'permission_denied',
        message: 'Related page is not visible',
        propertyId: 'prop_customer',
      },
    });

    const unexpected = await captureFormulaComputation(() => {
      throw new Error('secret adapter detail');
    });
    expect(unexpected).toEqual({
      kind: 'error',
      problem: {
        code: 'internal_error',
        message: 'Formula evaluation failed unexpectedly',
      },
    });
    expect(serializeFormulaComputedResult(unexpected)).not.toContain('secret adapter detail');
    expect(unexpected).not.toBeInstanceOf(FormulaResultError);

    const invalid = await captureFormulaComputation(
      () => ({ kind: 'value', valueType: 'boolean', value: 'yes' }) as never,
    );
    expect(invalid).toEqual({
      kind: 'error',
      problem: {
        code: 'result_type_mismatch',
        message: 'Formula evaluator returned an invalid typed result',
      },
    });
  });
});
