import { describe, expect, test } from 'bun:test';
import {
  FORMULA_AST_MAX_DEPTH,
  FormulaAstSchema,
  type FormulaExpression,
  parseFormulaAst,
  serializeFormulaAst,
} from './formula.ts';

function sample() {
  return {
    language: 'synapse-formula-1' as const,
    version: 1 as const,
    resultType: 'number' as const,
    expression: {
      type: 'conditional' as const,
      condition: {
        type: 'property' as const,
        propertyId: 'prop_done',
      },
      whenTrue: { type: 'literal' as const, valueType: 'number' as const, value: 100 },
      whenFalse: {
        type: 'call' as const,
        function: 'round',
        arguments: [
          {
            type: 'binary' as const,
            operator: 'multiply' as const,
            left: { type: 'property' as const, propertyId: 'prop_progress' },
            right: { type: 'literal' as const, valueType: 'number' as const, value: 100 },
          },
        ],
      },
    },
  };
}

describe('canonical formula AST', () => {
  test('round-trips typed expressions with stable property IDs', () => {
    const parsed = parseFormulaAst(sample());
    expect(parsed).toMatchObject({
      language: 'synapse-formula-1',
      version: 1,
      resultType: 'number',
      expression: {
        type: 'conditional',
        condition: { type: 'property', propertyId: 'prop_done' },
      },
    });
  });

  test('serializes deterministically regardless of input key order', () => {
    const normal = serializeFormulaAst(sample());
    const reordered = serializeFormulaAst({
      expression: sample().expression,
      resultType: 'number',
      version: 1,
      language: 'synapse-formula-1',
    });
    expect(reordered).toBe(normal);
    expect(normal.endsWith('\n')).toBe(true);
    expect(normal).toContain('"propertyId":"prop_progress"');
  });

  test('supports relation traversal without persisting display names', () => {
    const ast = parseFormulaAst({
      language: 'synapse-formula-1',
      version: 1,
      resultType: 'text',
      expression: {
        type: 'property',
        propertyId: 'prop_related_status',
        record: { type: 'variable', name: 'current' },
      },
    });
    expect(JSON.stringify(ast)).not.toContain('Status');
    expect(ast.expression).toMatchObject({
      type: 'property',
      propertyId: 'prop_related_status',
      record: { type: 'variable', name: 'current' },
    });
  });

  test('rejects unknown nodes, invalid IDs, and resource-exhausting depth', () => {
    expect(
      FormulaAstSchema.safeParse({
        ...sample(),
        expression: { type: 'execute', command: 'curl example.com' },
      }).success,
    ).toBe(false);
    expect(
      FormulaAstSchema.safeParse({
        ...sample(),
        expression: { type: 'property', propertyId: 'Done' },
      }).success,
    ).toBe(false);
    expect(
      FormulaAstSchema.safeParse({
        ...sample(),
        expression: { type: 'literal', valueType: 'number', value: Number.POSITIVE_INFINITY },
      }).success,
    ).toBe(false);
    expect(
      FormulaAstSchema.safeParse({
        ...sample(),
        language: 'javascript',
        version: 2,
      }).success,
    ).toBe(false);

    let expression: FormulaExpression = {
      type: 'literal',
      valueType: 'number',
      value: 1,
    };
    for (let index = 0; index < FORMULA_AST_MAX_DEPTH; index += 1) {
      expression = { type: 'unary', operator: 'positive', operand: expression };
    }
    const result = FormulaAstSchema.safeParse({
      language: 'synapse-formula-1',
      version: 1,
      resultType: 'number',
      expression,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('depth');
  });
});
