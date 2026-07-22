import { z } from 'zod';
import { isDatabaseDatePoint } from './date.ts';
import { type FormulaValueType, FormulaValueTypeSchema } from './formula.ts';
import type { FormulaFunctionProblem } from './formula-functions.ts';
import { DatabasePersonIdSchema } from './person.ts';
import { DatabasePropertyIdSchema, DatabaseRecordIdSchema, DataSourceIdSchema } from './schema.ts';

export const FORMULA_RESULT_MAX_DEPTH = 64;
export const FORMULA_RESULT_MAX_NODES = 100_000;
export const FORMULA_PROBLEM_MAX_CAUSE_DEPTH = 16;

export const FORMULA_RUNTIME_PROBLEM_CODES = [
  'unsupported_language',
  'unsupported_version',
  'missing_property',
  'missing_record',
  'permission_denied',
  'dependency_error',
  'unknown_variable',
  'unknown_function',
  'argument_count',
  'argument_type',
  'invalid_operand',
  'divide_by_zero',
  'domain_error',
  'missing_projection',
  'result_type_mismatch',
  'resource_limit',
  'dependency_cycle',
  'internal_error',
] as const;

export const FormulaRuntimeProblemCodeSchema = z.enum(FORMULA_RUNTIME_PROBLEM_CODES);
export type FormulaRuntimeProblemCode = z.infer<typeof FormulaRuntimeProblemCodeSchema>;

export interface FormulaRuntimeProblem {
  code: FormulaRuntimeProblemCode;
  message: string;
  path?: Array<string | number>;
  propertyId?: string;
  function?: string;
  argumentIndex?: number;
  cause?: FormulaRuntimeProblem;
}

export const FormulaRuntimeProblemSchema: z.ZodType<FormulaRuntimeProblem> = z.lazy(() =>
  z
    .object({
      code: FormulaRuntimeProblemCodeSchema,
      message: z.string().min(1).max(1_000),
      path: z
        .array(z.union([z.string().max(128), z.number().int().nonnegative()]))
        .max(128)
        .optional(),
      propertyId: DatabasePropertyIdSchema.optional(),
      function: z
        .string()
        .regex(/^[a-z][A-Za-z0-9_]{0,63}$/)
        .optional(),
      argumentIndex: z.number().int().nonnegative().max(99).optional(),
      cause: FormulaRuntimeProblemSchema.optional(),
    })
    .strict(),
);

export interface FormulaPersistedDateValue {
  kind: 'date';
  value: string;
}

export interface FormulaPersistedPersonValue {
  kind: 'person';
  id: string;
  name?: string;
}

export interface FormulaPersistedPageValue {
  kind: 'page';
  id: string;
  sourceId: string;
  title?: string;
}

export type FormulaPersistedRuntimeValue =
  | null
  | string
  | number
  | boolean
  | FormulaPersistedDateValue
  | FormulaPersistedPersonValue
  | FormulaPersistedPageValue
  | FormulaPersistedRuntimeValue[];

export const FormulaPersistedRuntimeValueSchema: z.ZodType<FormulaPersistedRuntimeValue> = z.lazy(
  () =>
    z.union([
      z.null(),
      z.string().max(100_000),
      z.number().finite(),
      z.boolean(),
      z
        .object({
          kind: z.literal('date'),
          value: z.string().refine(isDatabaseDatePoint, 'Expected a canonical date point'),
        })
        .strict(),
      z
        .object({
          kind: z.literal('person'),
          id: DatabasePersonIdSchema,
          name: z.string().max(200).optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('page'),
          id: DatabaseRecordIdSchema,
          sourceId: DataSourceIdSchema,
          title: z.string().max(10_000).optional(),
        })
        .strict(),
      z.array(FormulaPersistedRuntimeValueSchema).max(10_000),
    ]),
);

export type FormulaComputedResult =
  | {
      kind: 'value';
      valueType: FormulaValueType;
      value: FormulaPersistedRuntimeValue;
    }
  | { kind: 'error'; problem: FormulaRuntimeProblem };

function runtimeValueType(value: FormulaPersistedRuntimeValue): FormulaValueType {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'list';
  return value.kind;
}

export const FormulaComputedResultSchema: z.ZodType<FormulaComputedResult> = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('value'),
        valueType: FormulaValueTypeSchema,
        value: FormulaPersistedRuntimeValueSchema,
      })
      .strict(),
    z.object({ kind: z.literal('error'), problem: FormulaRuntimeProblemSchema }).strict(),
  ])
  .superRefine((result, context) => {
    if (result.kind !== 'value') return;
    const actual = runtimeValueType(result.value);
    if (actual !== result.valueType) {
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: `Declared Formula result type ${result.valueType} does not match ${actual}`,
      });
    }
  });

function preflightResultResources(input: unknown): void {
  const pending: Array<{ value: unknown; depth: number; problemCauseDepth: number }> = [
    { value: input, depth: 1, problemCauseDepth: 0 },
  ];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > FORMULA_RESULT_MAX_NODES) {
      throw new FormulaResultError(
        'resource_limit',
        `Formula result exceeds ${FORMULA_RESULT_MAX_NODES} nodes`,
      );
    }
    if (current.depth > FORMULA_RESULT_MAX_DEPTH) {
      throw new FormulaResultError(
        'resource_limit',
        `Formula result exceeds depth ${FORMULA_RESULT_MAX_DEPTH}`,
      );
    }
    if (Array.isArray(current.value)) {
      for (const entry of current.value) {
        pending.push({
          value: entry,
          depth: current.depth + 1,
          problemCauseDepth: current.problemCauseDepth,
        });
      }
      continue;
    }
    if (!current.value || typeof current.value !== 'object') continue;
    const object = current.value as Record<string, unknown>;
    if (object.kind === 'value') {
      pending.push({ value: object.value, depth: current.depth + 1, problemCauseDepth: 0 });
    } else if (object.kind === 'error') {
      pending.push({ value: object.problem, depth: current.depth + 1, problemCauseDepth: 1 });
    } else if (typeof object.code === 'string' && object.cause !== undefined) {
      const causeDepth = current.problemCauseDepth + 1;
      if (causeDepth > FORMULA_PROBLEM_MAX_CAUSE_DEPTH) {
        throw new FormulaResultError(
          'resource_limit',
          `Formula problem cause exceeds depth ${FORMULA_PROBLEM_MAX_CAUSE_DEPTH}`,
        );
      }
      pending.push({
        value: object.cause,
        depth: current.depth + 1,
        problemCauseDepth: causeDepth,
      });
    }
  }
}

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

export class FormulaResultError extends Error {
  readonly code: 'invalid_result' | 'resource_limit';

  constructor(code: FormulaResultError['code'], message: string) {
    super(message);
    this.name = 'FormulaResultError';
    this.code = code;
  }
}

export class FormulaRuntimeFailure extends Error {
  readonly problem: FormulaRuntimeProblem;

  constructor(problem: FormulaRuntimeProblem) {
    const parsed = formulaErrorResult(problem);
    if (parsed.kind !== 'error') throw new Error('Expected a Formula error result');
    super(parsed.problem.message);
    this.name = 'FormulaRuntimeFailure';
    this.problem = parsed.problem;
  }
}

export function parseFormulaComputedResult(input: unknown): FormulaComputedResult {
  preflightResultResources(input);
  const parsed = FormulaComputedResultSchema.safeParse(input);
  if (!parsed.success) {
    throw new FormulaResultError(
      'invalid_result',
      parsed.error.issues[0]?.message ?? 'Invalid result',
    );
  }
  return parsed.data;
}

export function formulaValueResult(
  valueType: FormulaValueType,
  value: FormulaPersistedRuntimeValue,
): FormulaComputedResult {
  return parseFormulaComputedResult({ kind: 'value', valueType, value });
}

export function formulaErrorResult(problem: FormulaRuntimeProblem): FormulaComputedResult {
  return parseFormulaComputedResult({ kind: 'error', problem });
}

export function formulaFunctionErrorResult(
  problem: FormulaFunctionProblem,
  path?: readonly (string | number)[],
): FormulaComputedResult {
  return formulaErrorResult({
    code: problem.code,
    message: problem.message,
    function: problem.function,
    ...(problem.argumentIndex === undefined ? {} : { argumentIndex: problem.argumentIndex }),
    ...(path ? { path: [...path] } : {}),
  });
}

export function formulaDependencyErrorResult(
  propertyId: string,
  cause: FormulaRuntimeProblem,
  path?: readonly (string | number)[],
): FormulaComputedResult {
  return formulaErrorResult({
    code: 'dependency_error',
    message: `Dependency "${propertyId}" failed`,
    propertyId,
    cause,
    ...(path ? { path: [...path] } : {}),
  });
}

/** Canonical JSON for derived-cache persistence, hashing, and exact agent inspection. */
export function serializeFormulaComputedResult(input: unknown): string {
  return `${stableJson(parseFormulaComputedResult(input))}\n`;
}

export function formulaComputedResultChanged(previous: unknown, next: unknown): boolean {
  return serializeFormulaComputedResult(previous) !== serializeFormulaComputedResult(next);
}

/**
 * Converts the evaluator boundary to the explicit result union. Typed failures
 * retain their problem; unexpected exceptions become a non-content-bearing
 * internal error and are never replaced with an empty value.
 */
export async function captureFormulaComputation(
  evaluate: () => FormulaComputedResult | Promise<FormulaComputedResult>,
): Promise<FormulaComputedResult> {
  try {
    return parseFormulaComputedResult(await evaluate());
  } catch (error) {
    if (error instanceof FormulaRuntimeFailure) return formulaErrorResult(error.problem);
    if (error instanceof FormulaResultError) {
      return formulaErrorResult({
        code: error.code === 'resource_limit' ? 'resource_limit' : 'result_type_mismatch',
        message:
          error.code === 'resource_limit'
            ? error.message
            : 'Formula evaluator returned an invalid typed result',
      });
    }
    return formulaErrorResult({
      code: 'internal_error',
      message: 'Formula evaluation failed unexpectedly',
    });
  }
}
