import { z } from 'zod';
import { DatabasePropertyIdSchema } from './stable-ids.ts';

export const SYNAPSE_FORMULA_LANGUAGE = 'synapse-formula-1' as const;
export const SYNAPSE_FORMULA_AST_VERSION = 1 as const;
export const FORMULA_AST_MAX_DEPTH = 64;
export const FORMULA_AST_MAX_NODES = 2_048;

export const FormulaValueTypeSchema = z.enum([
  'null',
  'text',
  'number',
  'boolean',
  'date',
  'person',
  'page',
  'list',
]);
export type FormulaValueType = z.infer<typeof FormulaValueTypeSchema>;

export type FormulaLiteral =
  | { type: 'literal'; valueType: 'null'; value: null }
  | { type: 'literal'; valueType: 'text' | 'date'; value: string }
  | { type: 'literal'; valueType: 'number'; value: number }
  | { type: 'literal'; valueType: 'boolean'; value: boolean };

export type FormulaExpression =
  | FormulaLiteral
  | { type: 'property'; propertyId: string; record?: FormulaExpression }
  | { type: 'variable'; name: string }
  | { type: 'list'; items: FormulaExpression[] }
  | { type: 'unary'; operator: 'not' | 'negate' | 'positive'; operand: FormulaExpression }
  | {
      type: 'binary';
      operator:
        | 'add'
        | 'subtract'
        | 'multiply'
        | 'divide'
        | 'modulo'
        | 'power'
        | 'equal'
        | 'not_equal'
        | 'greater'
        | 'greater_equal'
        | 'less'
        | 'less_equal'
        | 'and'
        | 'or';
      left: FormulaExpression;
      right: FormulaExpression;
    }
  | {
      type: 'conditional';
      condition: FormulaExpression;
      whenTrue: FormulaExpression;
      whenFalse: FormulaExpression;
    }
  | { type: 'call'; function: string; arguments: FormulaExpression[] }
  | {
      type: 'let';
      bindings: Array<{ name: string; value: FormulaExpression }>;
      body: FormulaExpression;
    }
  | { type: 'lambda'; parameters: string[]; body: FormulaExpression };

const variableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
const functionName = z.string().regex(/^[a-z][A-Za-z0-9_]{0,63}$/);

export const FormulaExpressionSchema: z.ZodType<FormulaExpression> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.discriminatedUnion('valueType', [
      z
        .object({ type: z.literal('literal'), valueType: z.literal('null'), value: z.null() })
        .strict(),
      z
        .object({ type: z.literal('literal'), valueType: z.literal('text'), value: z.string() })
        .strict(),
      z
        .object({
          type: z.literal('literal'),
          valueType: z.literal('number'),
          value: z.number(),
        })
        .strict(),
      z
        .object({
          type: z.literal('literal'),
          valueType: z.literal('boolean'),
          value: z.boolean(),
        })
        .strict(),
      z
        .object({
          type: z.literal('literal'),
          valueType: z.literal('date'),
          value: z.iso.datetime({ offset: true }),
        })
        .strict(),
    ]),
    z
      .object({
        type: z.literal('property'),
        propertyId: DatabasePropertyIdSchema,
        record: FormulaExpressionSchema.optional(),
      })
      .strict(),
    z.object({ type: z.literal('variable'), name: variableName }).strict(),
    z
      .object({ type: z.literal('list'), items: z.array(FormulaExpressionSchema).max(500) })
      .strict(),
    z
      .object({
        type: z.literal('unary'),
        operator: z.enum(['not', 'negate', 'positive']),
        operand: FormulaExpressionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('binary'),
        operator: z.enum([
          'add',
          'subtract',
          'multiply',
          'divide',
          'modulo',
          'power',
          'equal',
          'not_equal',
          'greater',
          'greater_equal',
          'less',
          'less_equal',
          'and',
          'or',
        ]),
        left: FormulaExpressionSchema,
        right: FormulaExpressionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('conditional'),
        condition: FormulaExpressionSchema,
        whenTrue: FormulaExpressionSchema,
        whenFalse: FormulaExpressionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('call'),
        function: functionName,
        arguments: z.array(FormulaExpressionSchema).max(100),
      })
      .strict(),
    z
      .object({
        type: z.literal('let'),
        bindings: z
          .array(z.object({ name: variableName, value: FormulaExpressionSchema }).strict())
          .min(1)
          .max(100),
        body: FormulaExpressionSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('lambda'),
        parameters: z.array(variableName).max(10),
        body: FormulaExpressionSchema,
      })
      .strict(),
  ]),
);

export interface FormulaAst {
  language: typeof SYNAPSE_FORMULA_LANGUAGE;
  version: typeof SYNAPSE_FORMULA_AST_VERSION;
  resultType: FormulaValueType;
  expression: FormulaExpression;
}

function expressionChildren(expression: FormulaExpression): readonly FormulaExpression[] {
  switch (expression.type) {
    case 'literal':
    case 'variable':
      return [];
    case 'property':
      return expression.record ? [expression.record] : [];
    case 'list':
      return expression.items;
    case 'unary':
      return [expression.operand];
    case 'binary':
      return [expression.left, expression.right];
    case 'conditional':
      return [expression.condition, expression.whenTrue, expression.whenFalse];
    case 'call':
      return expression.arguments;
    case 'let':
      return [...expression.bindings.map((binding) => binding.value), expression.body];
    case 'lambda':
      return [expression.body];
  }
}

function expressionSize(root: FormulaExpression): { nodes: number; depth: number } {
  let nodes = 0;
  let depth = 0;
  const pending: Array<{ expression: FormulaExpression; depth: number }> = [
    { expression: root, depth: 1 },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    depth = Math.max(depth, current.depth);
    for (const child of expressionChildren(current.expression)) {
      pending.push({ expression: child, depth: current.depth + 1 });
    }
  }
  return { nodes, depth };
}

export const FormulaAstSchema: z.ZodType<FormulaAst> = z
  .object({
    language: z.literal(SYNAPSE_FORMULA_LANGUAGE),
    version: z.literal(SYNAPSE_FORMULA_AST_VERSION),
    resultType: FormulaValueTypeSchema,
    expression: FormulaExpressionSchema,
  })
  .strict()
  .superRefine((ast, context) => {
    const size = expressionSize(ast.expression);
    if (size.depth > FORMULA_AST_MAX_DEPTH) {
      context.addIssue({
        code: 'custom',
        path: ['expression'],
        message: `Formula AST depth ${size.depth} exceeds ${FORMULA_AST_MAX_DEPTH}`,
      });
    }
    if (size.nodes > FORMULA_AST_MAX_NODES) {
      context.addIssue({
        code: 'custom',
        path: ['expression'],
        message: `Formula AST node count ${size.nodes} exceeds ${FORMULA_AST_MAX_NODES}`,
      });
    }
  });

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function parseFormulaAst(input: unknown): FormulaAst {
  return FormulaAstSchema.parse(input);
}

/** Canonical, whitespace-free, key-sorted JSON suitable for hashing and Git diffs. */
export function serializeFormulaAst(input: unknown): string {
  return `${stableJson(parseFormulaAst(input))}\n`;
}
