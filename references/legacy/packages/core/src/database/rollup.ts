import { z } from 'zod';
import { databaseDatePointEpoch } from './date.ts';
import { type FormulaValueType, FormulaValueTypeSchema } from './formula.ts';
import {
  type FormulaComputedResult,
  FormulaComputedResultSchema,
  type FormulaPersistedRuntimeValue,
  formulaDependencyErrorResult,
  formulaErrorResult,
  formulaValueResult,
  serializeFormulaComputedResult,
} from './formula-result.ts';
import {
  DatabasePropertyIdSchema,
  DatabaseRecordIdSchema,
  type DatabaseRollupFunction,
  DatabaseRollupFunctionSchema,
  DataSourceIdSchema,
} from './schema.ts';

export const ROLLUP_MAX_TARGETS = 10_000;
export const ROLLUP_MAX_PROJECTED_VALUES = 10_000;

export type { DatabaseRollupFunction } from './schema.ts';
export { DATABASE_ROLLUP_FUNCTIONS, DatabaseRollupFunctionSchema } from './schema.ts';

export const RollupAggregationInputSchema = z
  .object({
    sourceId: DataSourceIdSchema,
    relationPropertyId: DatabasePropertyIdSchema,
    targetSourceId: DataSourceIdSchema,
    targetPropertyId: DatabasePropertyIdSchema,
    function: DatabaseRollupFunctionSchema,
    targetValueType: FormulaValueTypeSchema,
    targetItemType: FormulaValueTypeSchema.optional(),
    permission: z
      .object({
        applied: z.literal(true),
        revision: z.string().min(1).max(256),
      })
      .strict(),
    snapshot: z
      .object({
        complete: z.boolean(),
        truncatedBy: z.enum(['relation_limit', 'unavailable_target']).nullable(),
      })
      .strict()
      .superRefine((snapshot, context) => {
        if (snapshot.complete !== (snapshot.truncatedBy === null)) {
          context.addIssue({
            code: 'custom',
            path: ['truncatedBy'],
            message: 'Complete Rollup snapshots cannot be truncated',
          });
        }
      }),
    targets: z
      .array(
        z
          .object({
            recordId: DatabaseRecordIdSchema,
            value: FormulaComputedResultSchema.optional(),
          })
          .strict(),
      )
      .max(ROLLUP_MAX_TARGETS),
  })
  .strict();

export type RollupAggregationInput = z.infer<typeof RollupAggregationInputSchema>;

export interface RollupAggregationResult {
  function: DatabaseRollupFunction;
  sourceId: string;
  relationPropertyId: string;
  targetSourceId: string;
  targetPropertyId: string;
  result: FormulaComputedResult;
  visibleTargetCount: number;
  populatedTargetCount: number;
  projectedValueCount: number;
  complete: boolean;
  truncatedBy: 'relation_limit' | 'unavailable_target' | null;
  permission: { applied: true; revision: string };
}

export class RollupAggregationError extends Error {
  readonly code:
    | 'invalid_aggregation'
    | 'permission_not_applied'
    | 'duplicate_target'
    | 'incompatible_function'
    | 'resource_limit';
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: RollupAggregationError['code'],
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'RollupAggregationError';
    this.code = code;
    this.details = details;
  }
}

const UNIVERSAL_FUNCTIONS = new Set<DatabaseRollupFunction>([
  'count_all',
  'count_values',
  'count_unique',
  'percent_empty',
  'percent_not_empty',
  'show_original',
]);
const NUMBER_FUNCTIONS = new Set<DatabaseRollupFunction>(['sum', 'average', 'min', 'max']);
const DATE_FUNCTIONS = new Set<DatabaseRollupFunction>(['earliest', 'latest']);

function effectiveItemType(input: RollupAggregationInput): FormulaValueType {
  return input.targetValueType === 'list'
    ? (input.targetItemType ?? 'null')
    : input.targetValueType;
}

function validateFunction(input: RollupAggregationInput): void {
  if (input.targetValueType !== 'list' && input.targetItemType !== undefined) {
    throw new RollupAggregationError(
      'invalid_aggregation',
      'targetItemType is valid only for list-valued Rollup targets',
    );
  }
  if (input.targetValueType === 'list' && input.targetItemType === undefined) {
    throw new RollupAggregationError(
      'invalid_aggregation',
      'List-valued Rollup targets require targetItemType',
    );
  }
  const itemType = effectiveItemType(input);
  if (
    UNIVERSAL_FUNCTIONS.has(input.function) ||
    (NUMBER_FUNCTIONS.has(input.function) && itemType === 'number') ||
    (DATE_FUNCTIONS.has(input.function) && itemType === 'date')
  ) {
    return;
  }
  throw new RollupAggregationError(
    'incompatible_function',
    `Rollup function "${input.function}" is incompatible with ${input.targetValueType}`,
    {
      function: input.function,
      targetValueType: input.targetValueType,
      targetItemType: input.targetItemType,
    },
  );
}

function isEmptyValue(value: FormulaPersistedRuntimeValue): boolean {
  return value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function projectedValues(value: FormulaPersistedRuntimeValue): FormulaPersistedRuntimeValue[] {
  if (isEmptyValue(value)) return [];
  if (!Array.isArray(value)) return [value];
  return value.filter((entry) => !isEmptyValue(entry));
}

function valueType(value: FormulaPersistedRuntimeValue): FormulaValueType {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'list';
  return value.kind;
}

function typedProjectionError(
  input: RollupAggregationInput,
  recordId: string,
  expected: FormulaValueType,
  actual: FormulaValueType,
): FormulaComputedResult {
  return formulaErrorResult({
    code: 'argument_type',
    message: `Rollup target "${recordId}" produced ${actual}; expected ${expected}`,
    propertyId: input.targetPropertyId,
    path: ['targets', recordId],
  });
}

function percentage(numerator: number, denominator: number): FormulaComputedResult {
  return denominator === 0
    ? formulaValueResult('null', null)
    : formulaValueResult('number', (numerator / denominator) * 100);
}

/**
 * Aggregates an already permission-filtered relation snapshot. The input cannot
 * carry denied target IDs or counts; only the permission revision crosses this
 * pure core boundary.
 */
export function aggregateDatabaseRollup(input: unknown): RollupAggregationResult {
  if (
    input &&
    typeof input === 'object' &&
    Array.isArray((input as { targets?: unknown }).targets)
  ) {
    const rawTargets = (input as { targets: unknown[] }).targets;
    if (rawTargets.length > ROLLUP_MAX_TARGETS) {
      throw new RollupAggregationError(
        'resource_limit',
        `Rollup target count exceeds ${ROLLUP_MAX_TARGETS}`,
        { observed: rawTargets.length, maximum: ROLLUP_MAX_TARGETS },
      );
    }
    let projected = 0;
    for (const target of rawTargets) {
      if (!target || typeof target !== 'object') continue;
      const value = (target as { value?: { kind?: unknown; value?: unknown } }).value;
      if (value?.kind !== 'value' || value.value === null || value.value === '') continue;
      projected += Array.isArray(value.value) ? value.value.length : 1;
      if (projected > ROLLUP_MAX_PROJECTED_VALUES) {
        throw new RollupAggregationError(
          'resource_limit',
          `Rollup projection exceeds ${ROLLUP_MAX_PROJECTED_VALUES} values`,
          { observed: projected, maximum: ROLLUP_MAX_PROJECTED_VALUES },
        );
      }
    }
  }
  const parsed = RollupAggregationInputSchema.safeParse(input);
  if (!parsed.success) {
    const permissionIssue = parsed.error.issues.some((issue) => issue.path[0] === 'permission');
    throw new RollupAggregationError(
      permissionIssue ? 'permission_not_applied' : 'invalid_aggregation',
      parsed.error.issues[0]?.message ?? 'Invalid Rollup aggregation input',
      { issues: parsed.error.issues },
    );
  }
  const normalized = parsed.data;
  validateFunction(normalized);
  const recordIds = new Set<string>();
  for (const target of normalized.targets) {
    if (recordIds.has(target.recordId)) {
      throw new RollupAggregationError(
        'duplicate_target',
        `Rollup target "${target.recordId}" appears more than once`,
        { recordId: target.recordId },
      );
    }
    recordIds.add(target.recordId);
  }

  const visibleTargetCount = normalized.targets.length;
  let populatedTargetCount = 0;
  const values: FormulaPersistedRuntimeValue[] = [];
  let result: FormulaComputedResult | undefined;
  if (normalized.function !== 'count_all') {
    for (const target of normalized.targets) {
      if (!target.value) continue;
      if (target.value.kind === 'error') {
        result = formulaDependencyErrorResult(normalized.targetPropertyId, target.value.problem, [
          'targets',
          target.recordId,
        ]);
        break;
      }
      const containerType = valueType(target.value.value);
      if (containerType !== 'null' && containerType !== normalized.targetValueType) {
        result = typedProjectionError(
          normalized,
          target.recordId,
          normalized.targetValueType,
          containerType,
        );
        break;
      }
      const projected = projectedValues(target.value.value);
      if (projected.length === 0) continue;
      const expectedItemType = effectiveItemType(normalized);
      const mismatchedItem = projected.find((value) => valueType(value) !== expectedItemType);
      if (mismatchedItem !== undefined) {
        result = typedProjectionError(
          normalized,
          target.recordId,
          expectedItemType,
          valueType(mismatchedItem),
        );
        break;
      }
      populatedTargetCount += 1;
      values.push(...projected);
    }
  } else {
    populatedTargetCount = normalized.targets.filter(
      (target) => target.value?.kind === 'value' && projectedValues(target.value.value).length > 0,
    ).length;
  }

  if (!result) {
    switch (normalized.function) {
      case 'count_all':
        result = formulaValueResult('number', visibleTargetCount);
        break;
      case 'count_values':
        result = formulaValueResult('number', values.length);
        break;
      case 'count_unique':
        result = formulaValueResult(
          'number',
          new Set(
            values.map((value) =>
              serializeFormulaComputedResult(formulaValueResult(valueType(value), value)),
            ),
          ).size,
        );
        break;
      case 'percent_empty':
        result = percentage(visibleTargetCount - populatedTargetCount, visibleTargetCount);
        break;
      case 'percent_not_empty':
        result = percentage(populatedTargetCount, visibleTargetCount);
        break;
      case 'sum': {
        const sum = (values as number[]).reduce((total, value) => total + value, 0);
        result = Number.isFinite(sum)
          ? formulaValueResult('number', sum)
          : formulaErrorResult({ code: 'domain_error', message: 'Rollup sum is not finite' });
        break;
      }
      case 'average': {
        const sum = (values as number[]).reduce((total, value) => total + value, 0);
        result =
          values.length === 0
            ? formulaValueResult('null', null)
            : Number.isFinite(sum / values.length)
              ? formulaValueResult('number', sum / values.length)
              : formulaErrorResult({
                  code: 'domain_error',
                  message: 'Rollup average is not finite',
                });
        break;
      }
      case 'min':
      case 'max': {
        const numbers = values as number[];
        result =
          numbers.length === 0
            ? formulaValueResult('null', null)
            : formulaValueResult(
                'number',
                normalized.function === 'min' ? Math.min(...numbers) : Math.max(...numbers),
              );
        break;
      }
      case 'earliest':
      case 'latest': {
        const dates = values as Array<{ kind: 'date'; value: string }>;
        const selected = dates.reduce<(typeof dates)[number] | undefined>((candidate, date) => {
          if (!candidate) return date;
          const comparison =
            databaseDatePointEpoch(date.value) - databaseDatePointEpoch(candidate.value);
          return normalized.function === 'earliest'
            ? comparison < 0
              ? date
              : candidate
            : comparison > 0
              ? date
              : candidate;
        }, undefined);
        result = selected ? formulaValueResult('date', selected) : formulaValueResult('null', null);
        break;
      }
      case 'show_original':
        result = formulaValueResult('list', values);
        break;
    }
  }

  return {
    function: normalized.function,
    sourceId: normalized.sourceId,
    relationPropertyId: normalized.relationPropertyId,
    targetSourceId: normalized.targetSourceId,
    targetPropertyId: normalized.targetPropertyId,
    result,
    visibleTargetCount,
    populatedTargetCount,
    projectedValueCount: values.length,
    complete: normalized.snapshot.complete,
    truncatedBy: normalized.snapshot.truncatedBy,
    permission: normalized.permission,
  };
}
