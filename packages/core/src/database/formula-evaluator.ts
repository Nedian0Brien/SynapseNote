import { databaseDatePointEpoch } from './date.ts';
import {
  FORMULA_AST_MAX_NODES,
  type FormulaAst,
  type FormulaExpression,
  parseFormulaAst,
  SYNAPSE_FORMULA_AST_VERSION,
  SYNAPSE_FORMULA_LANGUAGE,
} from './formula.ts';
import {
  type FormulaFunctionContext,
  type FormulaFunctionProblem,
  type FormulaLambdaRuntimeValue,
  type FormulaPageRuntimeValue,
  type FormulaRuntimeValue,
  invokeFormulaFunction,
} from './formula-functions.ts';
import {
  type FormulaComputedResult,
  type FormulaPersistedRuntimeValue,
  FormulaResultError,
  type FormulaRuntimeProblem,
  formulaErrorResult,
  formulaValueResult,
  parseFormulaComputedResult,
} from './formula-result.ts';

export const FORMULA_EVALUATION_MAX_STEPS = 100_000;

export interface ResolveFormulaPropertyInput {
  propertyId: string;
  record?: FormulaPageRuntimeValue;
}

export type ResolveFormulaProperty = (input: ResolveFormulaPropertyInput) => FormulaComputedResult;

export interface EvaluateFormulaInput {
  ast: unknown;
  context: FormulaFunctionContext;
  resolveProperty: ResolveFormulaProperty;
  variables?: Readonly<Record<string, FormulaPersistedRuntimeValue>>;
  maxSteps?: number;
}

type EvaluationResult =
  | { ok: true; value: FormulaRuntimeValue }
  | { ok: false; problem: FormulaRuntimeProblem };

interface EvaluationState {
  context: FormulaFunctionContext;
  resolveProperty: ResolveFormulaProperty;
  steps: number;
  maxSteps: number;
  lastLambdaProblem?: FormulaRuntimeProblem;
}

function isFormulaList(value: FormulaRuntimeValue): value is readonly FormulaRuntimeValue[] {
  return Array.isArray(value);
}

function failure(
  code: FormulaRuntimeProblem['code'],
  message: string,
  path: readonly (string | number)[],
  extra: Partial<FormulaRuntimeProblem> = {},
): EvaluationResult {
  return { ok: false, problem: { code, message, path: [...path], ...extra } };
}

function runtimeType(value: FormulaRuntimeValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (isFormulaList(value)) return 'list';
  return value.kind;
}

function isLambda(value: FormulaRuntimeValue): value is FormulaLambdaRuntimeValue {
  return Boolean(
    value && typeof value === 'object' && !isFormulaList(value) && value.kind === 'lambda',
  );
}

function persistedValue(value: FormulaRuntimeValue): FormulaPersistedRuntimeValue | null {
  if (isLambda(value)) return null;
  if (isFormulaList(value)) {
    const items: FormulaPersistedRuntimeValue[] = [];
    for (const item of value) {
      const persisted = persistedValue(item);
      if (persisted === null && item !== null) return null;
      items.push(persisted);
    }
    return items;
  }
  return value;
}

function sameValue(left: FormulaRuntimeValue, right: FormulaRuntimeValue): boolean {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== typeof right) return false;
  if (isFormulaList(left) || isFormulaList(right)) {
    if (!isFormulaList(left) || !isFormulaList(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameValue(value, right[index] ?? null));
  }
  if (typeof left !== 'object' || typeof right !== 'object' || isLambda(left) || isLambda(right)) {
    return false;
  }
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'date':
      return right.kind === 'date' && left.value === right.value;
    case 'person':
      return right.kind === 'person' && left.id === right.id;
    case 'page':
      return right.kind === 'page' && left.id === right.id && left.sourceId === right.sourceId;
  }
  return false;
}

function finiteNumber(
  value: FormulaRuntimeValue,
  path: readonly (string | number)[],
): EvaluationResult | number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : failure('invalid_operand', `Expected number, received ${runtimeType(value)}`, path);
}

function booleanValue(
  value: FormulaRuntimeValue,
  path: readonly (string | number)[],
): EvaluationResult | boolean {
  return typeof value === 'boolean'
    ? value
    : failure('invalid_operand', `Expected boolean, received ${runtimeType(value)}`, path);
}

function isFailure(value: EvaluationResult | number | boolean): value is EvaluationResult {
  return typeof value === 'object';
}

function functionProblem(
  problem: FormulaFunctionProblem,
  path: readonly (string | number)[],
  cause?: FormulaRuntimeProblem,
): EvaluationResult {
  return failure(problem.code, problem.message, path, {
    function: problem.function,
    ...(problem.argumentIndex === undefined ? {} : { argumentIndex: problem.argumentIndex }),
    ...(cause ? { cause } : {}),
  });
}

function evaluateExpression(
  expression: FormulaExpression,
  state: EvaluationState,
  variables: ReadonlyMap<string, FormulaRuntimeValue>,
  path: readonly (string | number)[],
): EvaluationResult {
  state.steps += 1;
  if (state.steps > state.maxSteps) {
    return failure('resource_limit', `Formula evaluation exceeds ${state.maxSteps} steps`, path);
  }
  switch (expression.type) {
    case 'literal':
      return {
        ok: true,
        value:
          expression.valueType === 'date'
            ? { kind: 'date', value: expression.value }
            : expression.value,
      };
    case 'property': {
      let record: FormulaPageRuntimeValue | undefined;
      if (expression.record) {
        const evaluatedRecord = evaluateExpression(expression.record, state, variables, [
          ...path,
          'record',
        ]);
        if (!evaluatedRecord.ok) return evaluatedRecord;
        if (
          !evaluatedRecord.value ||
          typeof evaluatedRecord.value !== 'object' ||
          isFormulaList(evaluatedRecord.value) ||
          evaluatedRecord.value.kind !== 'page'
        ) {
          return failure(
            'invalid_operand',
            `Property traversal requires page, received ${runtimeType(evaluatedRecord.value)}`,
            [...path, 'record'],
          );
        }
        record = evaluatedRecord.value;
      }
      let resolved: FormulaComputedResult;
      try {
        resolved = parseFormulaComputedResult(
          state.resolveProperty({
            propertyId: expression.propertyId,
            ...(record ? { record } : {}),
          }),
        );
      } catch {
        return failure(
          'internal_error',
          'Formula property resolver returned an invalid result',
          path,
          { propertyId: expression.propertyId },
        );
      }
      if (resolved.kind === 'error') {
        return failure('dependency_error', `Dependency "${expression.propertyId}" failed`, path, {
          propertyId: expression.propertyId,
          cause: resolved.problem,
        });
      }
      return { ok: true, value: resolved.value };
    }
    case 'variable': {
      if (!variables.has(expression.name)) {
        return failure('unknown_variable', `Variable "${expression.name}" is not bound`, path);
      }
      return { ok: true, value: variables.get(expression.name) ?? null };
    }
    case 'list': {
      const items: FormulaRuntimeValue[] = [];
      for (const [index, item] of expression.items.entries()) {
        const result = evaluateExpression(item, state, variables, [...path, 'items', index]);
        if (!result.ok) return result;
        items.push(result.value);
      }
      return { ok: true, value: items };
    }
    case 'unary': {
      const operand = evaluateExpression(expression.operand, state, variables, [
        ...path,
        'operand',
      ]);
      if (!operand.ok) return operand;
      if (expression.operator === 'not') {
        const value = booleanValue(operand.value, [...path, 'operand']);
        return isFailure(value) ? value : { ok: true, value: !value };
      }
      const value = finiteNumber(operand.value, [...path, 'operand']);
      if (isFailure(value)) return value;
      return { ok: true, value: expression.operator === 'negate' ? -value : value };
    }
    case 'binary': {
      const left = evaluateExpression(expression.left, state, variables, [...path, 'left']);
      if (!left.ok) return left;
      if (expression.operator === 'and' || expression.operator === 'or') {
        const leftBoolean = booleanValue(left.value, [...path, 'left']);
        if (isFailure(leftBoolean)) return leftBoolean;
        if (expression.operator === 'and' && !leftBoolean) return { ok: true, value: false };
        if (expression.operator === 'or' && leftBoolean) return { ok: true, value: true };
        const right = evaluateExpression(expression.right, state, variables, [...path, 'right']);
        if (!right.ok) return right;
        const rightBoolean = booleanValue(right.value, [...path, 'right']);
        return isFailure(rightBoolean) ? rightBoolean : { ok: true, value: rightBoolean };
      }
      const right = evaluateExpression(expression.right, state, variables, [...path, 'right']);
      if (!right.ok) return right;
      if (expression.operator === 'equal' || expression.operator === 'not_equal') {
        const equal = sameValue(left.value, right.value);
        return { ok: true, value: expression.operator === 'equal' ? equal : !equal };
      }
      if (
        expression.operator === 'greater' ||
        expression.operator === 'greater_equal' ||
        expression.operator === 'less' ||
        expression.operator === 'less_equal'
      ) {
        let compared: number | undefined;
        if (typeof left.value === 'number' && typeof right.value === 'number') {
          compared = left.value - right.value;
        } else if (typeof left.value === 'string' && typeof right.value === 'string') {
          compared = left.value.localeCompare(right.value, state.context.locale);
        } else if (
          left.value &&
          right.value &&
          typeof left.value === 'object' &&
          typeof right.value === 'object' &&
          !isFormulaList(left.value) &&
          !isFormulaList(right.value) &&
          left.value.kind === 'date' &&
          right.value.kind === 'date'
        ) {
          compared =
            databaseDatePointEpoch(left.value.value) - databaseDatePointEpoch(right.value.value);
        }
        if (compared === undefined || !Number.isFinite(compared)) {
          return failure(
            'invalid_operand',
            `Cannot compare ${runtimeType(left.value)} and ${runtimeType(right.value)}`,
            path,
          );
        }
        return {
          ok: true,
          value:
            expression.operator === 'greater'
              ? compared > 0
              : expression.operator === 'greater_equal'
                ? compared >= 0
                : expression.operator === 'less'
                  ? compared < 0
                  : compared <= 0,
        };
      }
      if (
        expression.operator === 'add' &&
        typeof left.value === 'string' &&
        typeof right.value === 'string'
      ) {
        return { ok: true, value: left.value + right.value };
      }
      const leftNumber = finiteNumber(left.value, [...path, 'left']);
      if (isFailure(leftNumber)) return leftNumber;
      const rightNumber = finiteNumber(right.value, [...path, 'right']);
      if (isFailure(rightNumber)) return rightNumber;
      if (
        (expression.operator === 'divide' || expression.operator === 'modulo') &&
        rightNumber === 0
      ) {
        return failure('divide_by_zero', 'Division by zero', path);
      }
      const value =
        expression.operator === 'add'
          ? leftNumber + rightNumber
          : expression.operator === 'subtract'
            ? leftNumber - rightNumber
            : expression.operator === 'multiply'
              ? leftNumber * rightNumber
              : expression.operator === 'divide'
                ? leftNumber / rightNumber
                : expression.operator === 'modulo'
                  ? leftNumber % rightNumber
                  : leftNumber ** rightNumber;
      return Number.isFinite(value)
        ? { ok: true, value }
        : failure('domain_error', 'Numeric result is not finite', path);
    }
    case 'conditional': {
      const condition = evaluateExpression(expression.condition, state, variables, [
        ...path,
        'condition',
      ]);
      if (!condition.ok) return condition;
      const boolean = booleanValue(condition.value, [...path, 'condition']);
      if (isFailure(boolean)) return boolean;
      return evaluateExpression(
        boolean ? expression.whenTrue : expression.whenFalse,
        state,
        variables,
        [...path, boolean ? 'whenTrue' : 'whenFalse'],
      );
    }
    case 'call': {
      const arguments_: FormulaRuntimeValue[] = [];
      state.lastLambdaProblem = undefined;
      for (const [index, argument] of expression.arguments.entries()) {
        const result = evaluateExpression(argument, state, variables, [
          ...path,
          'arguments',
          index,
        ]);
        if (!result.ok) return result;
        arguments_.push(result.value);
      }
      const result = invokeFormulaFunction(expression.function, arguments_, state.context);
      if (!result.ok) {
        return functionProblem(result.problem, path, state.lastLambdaProblem);
      }
      return { ok: true, value: result.value };
    }
    case 'let': {
      const local = new Map(variables);
      for (const [index, binding] of expression.bindings.entries()) {
        const value = evaluateExpression(binding.value, state, local, [
          ...path,
          'bindings',
          index,
          'value',
        ]);
        if (!value.ok) return value;
        local.set(binding.name, value.value);
      }
      return evaluateExpression(expression.body, state, local, [...path, 'body']);
    }
    case 'lambda': {
      const closure = new Map(variables);
      const lambda: FormulaLambdaRuntimeValue = {
        kind: 'lambda',
        arity: expression.parameters.length,
        invoke: (arguments_) => {
          if (arguments_.length !== expression.parameters.length) {
            return {
              ok: false,
              problem: {
                code: 'argument_count',
                function: 'lambda',
                message: `Expected ${expression.parameters.length} lambda argument(s)`,
              },
            };
          }
          const local = new Map(closure);
          expression.parameters.forEach((parameter, index) => {
            local.set(parameter, arguments_[index] ?? null);
          });
          const result = evaluateExpression(expression.body, state, local, [...path, 'body']);
          if (!result.ok) {
            state.lastLambdaProblem = result.problem;
            return {
              ok: false,
              problem: {
                code: result.problem.code === 'resource_limit' ? 'resource_limit' : 'domain_error',
                function: 'lambda',
                message: result.problem.message,
              },
            };
          }
          return { ok: true, value: result.value };
        },
      };
      return { ok: true, value: lambda };
    }
  }
}

function unsupportedAstProblem(input: unknown): FormulaComputedResult | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as { language?: unknown; version?: unknown };
  if (candidate.language !== undefined && candidate.language !== SYNAPSE_FORMULA_LANGUAGE) {
    return formulaErrorResult({
      code: 'unsupported_language',
      message: `Unsupported Formula language "${String(candidate.language)}"`,
    });
  }
  if (candidate.version !== undefined && candidate.version !== SYNAPSE_FORMULA_AST_VERSION) {
    return formulaErrorResult({
      code: 'unsupported_version',
      message: `Unsupported Formula AST version "${String(candidate.version)}"`,
    });
  }
  return null;
}

/** Evaluates one canonical AST against a pre-authorized, transaction-frozen value snapshot. */
export function evaluateFormula(input: EvaluateFormulaInput): FormulaComputedResult {
  const unsupported = unsupportedAstProblem(input.ast);
  if (unsupported) return unsupported;
  let ast: FormulaAst;
  try {
    ast = parseFormulaAst(input.ast);
  } catch {
    return formulaErrorResult({
      code: 'result_type_mismatch',
      message: 'Formula AST is invalid',
    });
  }
  const maxSteps = input.maxSteps ?? FORMULA_EVALUATION_MAX_STEPS;
  if (!Number.isInteger(maxSteps) || maxSteps < FORMULA_AST_MAX_NODES || maxSteps > 1_000_000) {
    return formulaErrorResult({
      code: 'resource_limit',
      message: `Formula maxSteps must be ${FORMULA_AST_MAX_NODES} to 1000000`,
    });
  }
  const variables = new Map<string, FormulaRuntimeValue>(Object.entries(input.variables ?? {}));
  const state: EvaluationState = {
    context: input.context,
    resolveProperty: input.resolveProperty,
    steps: 0,
    maxSteps,
  };
  try {
    const evaluated = evaluateExpression(ast.expression, state, variables, ['expression']);
    if (!evaluated.ok) return formulaErrorResult(evaluated.problem);
    const persisted = persistedValue(evaluated.value);
    if (persisted === null && evaluated.value !== null) {
      return formulaErrorResult({
        code: 'result_type_mismatch',
        message: 'Formula result cannot persist a lambda',
        path: ['resultType'],
      });
    }
    const actualType = runtimeType(evaluated.value);
    if (actualType !== 'null' && actualType !== ast.resultType) {
      return formulaErrorResult({
        code: 'result_type_mismatch',
        message: `Formula declared ${ast.resultType} but evaluated to ${actualType}`,
        path: ['resultType'],
      });
    }
    return formulaValueResult(actualType === 'null' ? 'null' : ast.resultType, persisted);
  } catch (error) {
    if (error instanceof FormulaResultError) {
      return formulaErrorResult({
        code: error.code === 'resource_limit' ? 'resource_limit' : 'result_type_mismatch',
        message:
          error.code === 'resource_limit'
            ? error.message
            : 'Formula produced an invalid persistable result',
      });
    }
    return formulaErrorResult({
      code: 'internal_error',
      message: 'Formula evaluation failed unexpectedly',
    });
  }
}
