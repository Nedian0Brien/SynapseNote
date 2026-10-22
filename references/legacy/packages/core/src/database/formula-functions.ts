import { canonicalDatabaseTimeZone, isDatabaseDatePoint } from './date.ts';
import type {
  FormulaFunctionParameterType,
  FormulaFunctionSignature,
  FormulaStaticType,
} from './formula-language.ts';

export const FORMULA_FUNCTION_MAX_TEXT_LENGTH = 100_000;
export const FORMULA_FUNCTION_MAX_LIST_LENGTH = 10_000;

export interface FormulaDateRuntimeValue {
  kind: 'date';
  value: string;
}

export interface FormulaPersonRuntimeValue {
  kind: 'person';
  id: string;
  name?: string;
}

export interface FormulaPageRuntimeValue {
  kind: 'page';
  id: string;
  sourceId: string;
  title?: string;
}

export interface FormulaLambdaRuntimeValue {
  kind: 'lambda';
  arity: number;
  invoke: (arguments_: readonly FormulaRuntimeValue[]) => FormulaFunctionResult;
}

export type FormulaRuntimeValue =
  | null
  | string
  | number
  | boolean
  | FormulaDateRuntimeValue
  | FormulaPersonRuntimeValue
  | FormulaPageRuntimeValue
  | FormulaLambdaRuntimeValue
  | readonly FormulaRuntimeValue[];

export interface FormulaFunctionContext {
  now: string;
  timeZone: string;
  locale: string;
}

export interface FormulaFunctionProblem {
  code:
    | 'unknown_function'
    | 'argument_count'
    | 'argument_type'
    | 'domain_error'
    | 'missing_projection'
    | 'resource_limit';
  function: string;
  message: string;
  argumentIndex?: number;
}

export type FormulaFunctionResult =
  | { ok: true; value: FormulaRuntimeValue }
  | { ok: false; problem: FormulaFunctionProblem };

export type FormulaFunctionCategory = 'text' | 'number' | 'date' | 'boolean' | 'list' | 'identity';

export interface FormulaFunctionDefinition {
  category: FormulaFunctionCategory;
  signature: FormulaFunctionSignature;
  evaluate: (
    arguments_: readonly FormulaRuntimeValue[],
    context: FormulaFunctionContext,
  ) => FormulaRuntimeValue;
}

class FormulaFunctionFailure extends Error {
  readonly code: FormulaFunctionProblem['code'];
  readonly argumentIndex?: number;

  constructor(code: FormulaFunctionProblem['code'], message: string, argumentIndex?: number) {
    super(message);
    this.code = code;
    this.argumentIndex = argumentIndex;
  }
}

function isFormulaList(value: FormulaRuntimeValue): value is readonly FormulaRuntimeValue[] {
  return Array.isArray(value);
}

function isTaggedFormulaValue(
  value: FormulaRuntimeValue,
): value is FormulaDateRuntimeValue | FormulaPersonRuntimeValue | FormulaPageRuntimeValue {
  return (
    value !== null && typeof value === 'object' && !isFormulaList(value) && value.kind !== 'lambda'
  );
}

function lambda(value: FormulaRuntimeValue, index: number): FormulaLambdaRuntimeValue {
  if (
    !value ||
    typeof value !== 'object' ||
    isFormulaList(value) ||
    value.kind !== 'lambda' ||
    !Number.isInteger(value.arity) ||
    value.arity < 1 ||
    value.arity > 2
  ) {
    throw new FormulaFunctionFailure(
      'argument_type',
      'expected a one- or two-parameter lambda',
      index,
    );
  }
  return value;
}

function invokeLambda(
  value: FormulaLambdaRuntimeValue,
  entry: FormulaRuntimeValue,
  index: number,
): FormulaRuntimeValue {
  const result = value.invoke(value.arity === 1 ? [entry] : [entry, index]);
  if (!result.ok) {
    throw new FormulaFunctionFailure(
      result.problem.code === 'resource_limit' ? 'resource_limit' : 'domain_error',
      `lambda failed: ${result.problem.message}`,
    );
  }
  return result.value;
}

function text(value: FormulaRuntimeValue, index: number): string {
  if (typeof value !== 'string') {
    throw new FormulaFunctionFailure('argument_type', 'expected text', index);
  }
  if (value.length > FORMULA_FUNCTION_MAX_TEXT_LENGTH) {
    throw new FormulaFunctionFailure(
      'resource_limit',
      `text input exceeds ${FORMULA_FUNCTION_MAX_TEXT_LENGTH} characters`,
      index,
    );
  }
  return value;
}

function numberValue(value: FormulaRuntimeValue, index: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new FormulaFunctionFailure('argument_type', 'expected a finite number', index);
  }
  return value;
}

function integer(value: FormulaRuntimeValue, index: number): number {
  const parsed = numberValue(value, index);
  if (!Number.isInteger(parsed)) {
    throw new FormulaFunctionFailure('argument_type', 'expected an integer', index);
  }
  return parsed;
}

function list(value: FormulaRuntimeValue, index: number): readonly FormulaRuntimeValue[] {
  if (!isFormulaList(value)) {
    throw new FormulaFunctionFailure('argument_type', 'expected a list', index);
  }
  if (value.length > FORMULA_FUNCTION_MAX_LIST_LENGTH) {
    throw new FormulaFunctionFailure(
      'resource_limit',
      `list input exceeds ${FORMULA_FUNCTION_MAX_LIST_LENGTH} items`,
      index,
    );
  }
  return value;
}

function dateValue(value: FormulaRuntimeValue, index: number): FormulaDateRuntimeValue {
  if (!isTaggedFormulaValue(value) || value.kind !== 'date' || !isDatabaseDatePoint(value.value)) {
    throw new FormulaFunctionFailure(
      'argument_type',
      'expected an offset-bearing date value',
      index,
    );
  }
  return value;
}

function boundedText(value: string): string {
  if (value.length > FORMULA_FUNCTION_MAX_TEXT_LENGTH) {
    throw new FormulaFunctionFailure(
      'resource_limit',
      `text result exceeds ${FORMULA_FUNCTION_MAX_TEXT_LENGTH} characters`,
    );
  }
  return value;
}

function boundedList(value: readonly FormulaRuntimeValue[]): readonly FormulaRuntimeValue[] {
  if (value.length > FORMULA_FUNCTION_MAX_LIST_LENGTH) {
    throw new FormulaFunctionFailure(
      'resource_limit',
      `list result exceeds ${FORMULA_FUNCTION_MAX_LIST_LENGTH} items`,
    );
  }
  return value;
}

function finiteResult(value: number): number {
  if (!Number.isFinite(value)) {
    throw new FormulaFunctionFailure('domain_error', 'numeric result is not finite');
  }
  return value;
}

function stableRuntimeValue(value: FormulaRuntimeValue): string {
  if (isFormulaList(value)) return `[${value.map(stableRuntimeValue).join(',')}]`;
  if (value && typeof value === 'object') {
    if (value.kind === 'lambda') {
      throw new FormulaFunctionFailure('argument_type', 'lambda values cannot be compared');
    }
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${JSON.stringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function typeIs(
  actual: FormulaStaticType | undefined,
  ...expected: FormulaStaticType['valueType'][]
): boolean {
  return Boolean(actual && (actual.valueType === 'unknown' || expected.includes(actual.valueType)));
}

function booleanLambdaValidation(argumentTypes: readonly FormulaStaticType[]): string | null {
  const callback = argumentTypes[1];
  return callback?.valueType === 'lambda' &&
    callback.lambdaResultType &&
    !typeIs(callback.lambdaResultType, 'boolean')
    ? 'predicate lambda must return boolean'
    : null;
}

function signature(
  parameters: readonly FormulaFunctionParameterType[],
  resultType: FormulaFunctionSignature['resultType'],
  options: Pick<
    FormulaFunctionSignature,
    'variadic' | 'minimumArguments' | 'maximumArguments' | 'validateArguments'
  > = {},
): FormulaFunctionSignature {
  return { parameters, resultType, ...options };
}

function definition(
  category: FormulaFunctionCategory,
  functionSignature: FormulaFunctionSignature,
  evaluate: FormulaFunctionDefinition['evaluate'],
): FormulaFunctionDefinition {
  return { category, signature: functionSignature, evaluate };
}

function numericVariadic(
  category: FormulaFunctionCategory,
  evaluate: (values: readonly number[]) => number,
): FormulaFunctionDefinition {
  return definition(
    category,
    signature(['number'], 'number', { variadic: 'number' }),
    (arguments_) => finiteResult(evaluate(arguments_.map(numberValue))),
  );
}

const elapsedUnits: Readonly<Record<string, number>> = {
  milliseconds: 1,
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

function elapsedUnit(value: FormulaRuntimeValue, index: number): number {
  const unit = text(value, index);
  const milliseconds = elapsedUnits[unit];
  if (!milliseconds) {
    throw new FormulaFunctionFailure(
      'domain_error',
      `unsupported elapsed-time unit "${unit}"`,
      index,
    );
  }
  return milliseconds;
}

function instant(value: FormulaDateRuntimeValue): number {
  const epoch = Date.parse(value.value);
  if (!Number.isFinite(epoch)) throw new FormulaFunctionFailure('domain_error', 'invalid date');
  return epoch;
}

function isoInstant(epoch: number): FormulaDateRuntimeValue {
  if (!Number.isFinite(epoch)) throw new FormulaFunctionFailure('domain_error', 'invalid date');
  return { kind: 'date', value: new Date(epoch).toISOString() };
}

function civilDate(epoch: number, timeZone: string): string {
  const canonical = canonicalDatabaseTimeZone(timeZone);
  if (!canonical) throw new FormulaFunctionFailure('domain_error', 'invalid IANA timezone');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: canonical,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epoch));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function datePart(
  value: FormulaRuntimeValue,
  index: number,
  part: Intl.DateTimeFormatPartTypes,
  timeZone: string,
): number {
  const date = dateValue(value, index);
  const canonicalTimeZone = canonicalDatabaseTimeZone(timeZone);
  if (!canonicalTimeZone) {
    throw new FormulaFunctionFailure('domain_error', 'invalid IANA timezone');
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: date.value.includes('T') ? canonicalTimeZone : 'UTC',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant(date)));
  return Number(parts.find((candidate) => candidate.type === part)?.value ?? '0');
}

function sortableValue(value: FormulaRuntimeValue): string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return numberValue(value, 0);
  if (isFormulaList(value)) {
    throw new FormulaFunctionFailure('argument_type', 'nested lists cannot be sorted');
  }
  if (value.kind === 'date') return instant(value);
  if (value.kind === 'person') return value.name ?? value.id;
  if (value.kind === 'page') return value.title ?? value.id;
  throw new FormulaFunctionFailure('argument_type', 'lambda values cannot be sorted');
}

function compareRuntimeValues(
  left: FormulaRuntimeValue,
  right: FormulaRuntimeValue,
  locale: string,
): number {
  const a = sortableValue(left);
  const b = sortableValue(right);
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a !== typeof b) {
    throw new FormulaFunctionFailure('argument_type', 'sort() requires one comparable value type');
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, locale, { numeric: true, sensitivity: 'variant' });
  }
  return a < b ? -1 : 1;
}

export const SYNAPSE_FORMULA_FUNCTIONS: Readonly<Record<string, FormulaFunctionDefinition>> = {
  length: definition(
    'text',
    signature(['any'], 'number', {
      validateArguments: ([value]) =>
        typeIs(value, 'text', 'list') ? null : 'length() expects text or a list',
    }),
    ([value]) =>
      typeof value === 'string' ? text(value, 0).length : list(value ?? null, 0).length,
  ),
  concat: definition(
    'text',
    signature(
      ['any'],
      ([first]) => (first?.valueType === 'text' || first?.valueType === 'list' ? first : null),
      {
        variadic: 'any',
        validateArguments: (values) => {
          const concrete = values.filter((value) => value.valueType !== 'unknown');
          return concrete.every((value) => value.valueType === 'text') ||
            concrete.every((value) => value.valueType === 'list')
            ? null
            : 'concat() requires all text values or all lists';
        },
      },
    ),
    (arguments_) => {
      if (arguments_.every((value) => typeof value === 'string')) {
        return boundedText(arguments_.map((value, index) => text(value, index)).join(''));
      }
      return boundedList(arguments_.flatMap((value, index) => [...list(value, index)]));
    },
  ),
  contains: definition(
    'text',
    signature(['any', 'any'], 'boolean', {
      validateArguments: ([container, needle]) => {
        if (typeIs(container, 'text') && typeIs(needle, 'text')) return null;
        if (typeIs(container, 'list')) return null;
        return 'contains() expects text/text or list/value';
      },
    }),
    ([container, needle]) =>
      typeof container === 'string'
        ? text(container, 0).includes(text(needle ?? null, 1))
        : list(container ?? null, 0).some(
            (candidate) => stableRuntimeValue(candidate) === stableRuntimeValue(needle ?? null),
          ),
  ),
  startsWith: definition('text', signature(['text', 'text'], 'boolean'), ([value, prefix]) =>
    text(value ?? null, 0).startsWith(text(prefix ?? null, 1)),
  ),
  endsWith: definition('text', signature(['text', 'text'], 'boolean'), ([value, suffix]) =>
    text(value ?? null, 0).endsWith(text(suffix ?? null, 1)),
  ),
  lower: definition('text', signature(['text'], 'text'), ([value], context) =>
    text(value ?? null, 0).toLocaleLowerCase(context.locale),
  ),
  upper: definition('text', signature(['text'], 'text'), ([value], context) =>
    text(value ?? null, 0).toLocaleUpperCase(context.locale),
  ),
  trim: definition('text', signature(['text'], 'text'), ([value]) => text(value ?? null, 0).trim()),
  substring: definition(
    'text',
    signature(['text', 'number', 'number'], 'text', { minimumArguments: 2 }),
    ([value, start, end]) =>
      text(value ?? null, 0).slice(
        integer(start ?? null, 1),
        end === undefined ? undefined : integer(end, 2),
      ),
  ),
  replace: definition(
    'text',
    signature(['text', 'text', 'text'], 'text'),
    ([value, search, replacement]) =>
      boundedText(
        text(value ?? null, 0).replace(text(search ?? null, 1), text(replacement ?? null, 2)),
      ),
  ),
  replaceAll: definition(
    'text',
    signature(['text', 'text', 'text'], 'text'),
    ([value, search, replacement]) => {
      const needle = text(search ?? null, 1);
      if (needle.length === 0) {
        throw new FormulaFunctionFailure('domain_error', 'replaceAll() search cannot be empty', 1);
      }
      return boundedText(text(value ?? null, 0).replaceAll(needle, text(replacement ?? null, 2)));
    },
  ),
  split: definition('text', signature(['text', 'text'], 'list'), ([value, separator]) =>
    boundedList(text(value ?? null, 0).split(text(separator ?? null, 1))),
  ),
  repeat: definition('text', signature(['text', 'number'], 'text'), ([value, count]) => {
    const repetitions = integer(count ?? null, 1);
    if (repetitions < 0) {
      throw new FormulaFunctionFailure('domain_error', 'repeat() count cannot be negative', 1);
    }
    return boundedText(text(value ?? null, 0).repeat(repetitions));
  }),
  abs: definition('number', signature(['number'], 'number'), ([value]) =>
    Math.abs(numberValue(value ?? null, 0)),
  ),
  ceil: definition('number', signature(['number'], 'number'), ([value]) =>
    Math.ceil(numberValue(value ?? null, 0)),
  ),
  floor: definition('number', signature(['number'], 'number'), ([value]) =>
    Math.floor(numberValue(value ?? null, 0)),
  ),
  round: definition('number', signature(['number'], 'number'), ([value]) =>
    Math.round(numberValue(value ?? null, 0)),
  ),
  sqrt: definition('number', signature(['number'], 'number'), ([value]) => {
    const number = numberValue(value ?? null, 0);
    if (number < 0) throw new FormulaFunctionFailure('domain_error', 'sqrt() requires number >= 0');
    return Math.sqrt(number);
  }),
  pow: definition('number', signature(['number', 'number'], 'number'), ([base, exponent]) =>
    finiteResult(numberValue(base ?? null, 0) ** numberValue(exponent ?? null, 1)),
  ),
  min: numericVariadic('number', (values) => Math.min(...values)),
  max: numericVariadic('number', (values) => Math.max(...values)),
  sum: definition('number', signature(['list'], 'number'), ([values]) =>
    finiteResult(
      list(values ?? null, 0).reduce<number>(
        (total, value, index) => total + numberValue(value, index),
        0,
      ),
    ),
  ),
  average: definition('number', signature(['list'], 'number'), ([values]) => {
    const entries = list(values ?? null, 0);
    if (entries.length === 0)
      throw new FormulaFunctionFailure('domain_error', 'average() requires a non-empty list');
    return finiteResult(
      entries.reduce<number>((total, value, index) => total + numberValue(value, index), 0) /
        entries.length,
    );
  }),
  empty: definition('boolean', signature(['any'], 'boolean'), ([value]) => {
    const candidate = value ?? null;
    return (
      candidate === null || candidate === '' || (isFormulaList(candidate) && candidate.length === 0)
    );
  }),
  toNumber: definition(
    'boolean',
    signature(['any'], 'number', {
      validateArguments: ([value]) =>
        typeIs(value, 'number', 'boolean') ? null : 'toNumber() expects number or boolean',
    }),
    ([value]) => {
      if (typeof value === 'number') return numberValue(value, 0);
      if (typeof value === 'boolean') return value ? 1 : 0;
      throw new FormulaFunctionFailure('argument_type', 'expected number or boolean', 0);
    },
  ),
  now: definition('date', signature([], 'date'), (_arguments, context) =>
    dateValue({ kind: 'date', value: context.now }, 0),
  ),
  today: definition('date', signature([], 'date'), (_arguments, context) => ({
    kind: 'date',
    value: civilDate(Date.parse(context.now), context.timeZone),
  })),
  dateAdd: definition(
    'date',
    signature(['date', 'number', 'text'], 'date'),
    ([value, amount, unit]) =>
      isoInstant(
        instant(dateValue(value ?? null, 0)) +
          numberValue(amount ?? null, 1) * elapsedUnit(unit ?? null, 2),
      ),
  ),
  dateSubtract: definition(
    'date',
    signature(['date', 'number', 'text'], 'date'),
    ([value, amount, unit]) =>
      isoInstant(
        instant(dateValue(value ?? null, 0)) -
          numberValue(amount ?? null, 1) * elapsedUnit(unit ?? null, 2),
      ),
  ),
  dateBetween: definition(
    'date',
    signature(['date', 'date', 'text'], 'number'),
    ([left, right, unit]) =>
      Math.trunc(
        (instant(dateValue(left ?? null, 0)) - instant(dateValue(right ?? null, 1))) /
          elapsedUnit(unit ?? null, 2),
      ),
  ),
  year: definition('date', signature(['date'], 'number'), ([value], context) =>
    datePart(value ?? null, 0, 'year', context.timeZone),
  ),
  month: definition('date', signature(['date'], 'number'), ([value], context) =>
    datePart(value ?? null, 0, 'month', context.timeZone),
  ),
  day: definition('date', signature(['date'], 'number'), ([value], context) =>
    datePart(value ?? null, 0, 'day', context.timeZone),
  ),
  hour: definition('date', signature(['date'], 'number'), ([value], context) =>
    datePart(value ?? null, 0, 'hour', context.timeZone),
  ),
  minute: definition('date', signature(['date'], 'number'), ([value], context) =>
    datePart(value ?? null, 0, 'minute', context.timeZone),
  ),
  at: definition(
    'list',
    signature(['list', 'number'], ([values]) => values?.itemType ?? { valueType: 'unknown' }),
    ([values, index]) => list(values ?? null, 0).at(integer(index ?? null, 1)) ?? null,
  ),
  first: definition(
    'list',
    signature(['list'], ([values]) => values?.itemType ?? { valueType: 'unknown' }),
    ([values]) => list(values ?? null, 0)[0] ?? null,
  ),
  last: definition(
    'list',
    signature(['list'], ([values]) => values?.itemType ?? { valueType: 'unknown' }),
    ([values]) => list(values ?? null, 0).at(-1) ?? null,
  ),
  slice: definition(
    'list',
    signature(['list', 'number', 'number'], 'list', { minimumArguments: 2 }),
    ([values, start, end]) =>
      list(values ?? null, 0).slice(
        integer(start ?? null, 1),
        end === undefined ? undefined : integer(end, 2),
      ),
  ),
  reverse: definition('list', signature(['list'], 'list'), ([values]) =>
    [...list(values ?? null, 0)].reverse(),
  ),
  unique: definition('list', signature(['list'], 'list'), ([values]) => {
    const seen = new Set<string>();
    return list(values ?? null, 0).filter((value) => {
      const key = stableRuntimeValue(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }),
  join: definition('list', signature(['list', 'text'], 'text'), ([values, separator]) =>
    boundedText(
      list(values ?? null, 0)
        .map((value, index) => text(value, index))
        .join(text(separator ?? null, 1)),
    ),
  ),
  flat: definition('list', signature(['list'], 'list'), ([values]) =>
    boundedList(
      list(values ?? null, 0).flatMap((value) => (isFormulaList(value) ? value : [value])),
    ),
  ),
  map: definition(
    'list',
    signature(['list', 'lambda'], ([, callback]) => ({
      valueType: 'list',
      itemType: callback?.lambdaResultType ?? { valueType: 'unknown' },
    })),
    ([values, callback]) => {
      const entries = list(values ?? null, 0);
      const mapper = lambda(callback ?? null, 1);
      return boundedList(entries.map((entry, index) => invokeLambda(mapper, entry, index)));
    },
  ),
  filter: definition(
    'list',
    signature(['list', 'lambda'], ([values]) => values ?? { valueType: 'list' }, {
      validateArguments: booleanLambdaValidation,
    }),
    ([values, callback]) => {
      const entries = list(values ?? null, 0);
      const predicate = lambda(callback ?? null, 1);
      return entries.filter((entry, index) => {
        const result = invokeLambda(predicate, entry, index);
        if (typeof result !== 'boolean') {
          throw new FormulaFunctionFailure('argument_type', 'filter() lambda must return boolean');
        }
        return result;
      });
    },
  ),
  some: definition(
    'list',
    signature(['list', 'lambda'], 'boolean', {
      validateArguments: booleanLambdaValidation,
    }),
    ([values, callback]) => {
      const entries = list(values ?? null, 0);
      const predicate = lambda(callback ?? null, 1);
      return entries.some((entry, index) => {
        const result = invokeLambda(predicate, entry, index);
        if (typeof result !== 'boolean') {
          throw new FormulaFunctionFailure('argument_type', 'some() lambda must return boolean');
        }
        return result;
      });
    },
  ),
  every: definition(
    'list',
    signature(['list', 'lambda'], 'boolean', {
      validateArguments: booleanLambdaValidation,
    }),
    ([values, callback]) => {
      const entries = list(values ?? null, 0);
      const predicate = lambda(callback ?? null, 1);
      return entries.every((entry, index) => {
        const result = invokeLambda(predicate, entry, index);
        if (typeof result !== 'boolean') {
          throw new FormulaFunctionFailure('argument_type', 'every() lambda must return boolean');
        }
        return result;
      });
    },
  ),
  find: definition(
    'list',
    signature(['list', 'lambda'], ([values]) => values?.itemType ?? { valueType: 'unknown' }, {
      validateArguments: booleanLambdaValidation,
    }),
    ([values, callback]) => {
      const entries = list(values ?? null, 0);
      const predicate = lambda(callback ?? null, 1);
      return (
        entries.find((entry, index) => {
          const result = invokeLambda(predicate, entry, index);
          if (typeof result !== 'boolean') {
            throw new FormulaFunctionFailure('argument_type', 'find() lambda must return boolean');
          }
          return result;
        }) ?? null
      );
    },
  ),
  findIndex: definition(
    'list',
    signature(['list', 'lambda'], 'number', {
      validateArguments: booleanLambdaValidation,
    }),
    ([values, callback]) => {
      const entries = list(values ?? null, 0);
      const predicate = lambda(callback ?? null, 1);
      return entries.findIndex((entry, index) => {
        const result = invokeLambda(predicate, entry, index);
        if (typeof result !== 'boolean') {
          throw new FormulaFunctionFailure(
            'argument_type',
            'findIndex() lambda must return boolean',
          );
        }
        return result;
      });
    },
  ),
  sort: definition(
    'list',
    signature(['list'], ([values]) => values ?? { valueType: 'list' }),
    ([values], context) =>
      [...list(values ?? null, 0)].sort((left, right) =>
        compareRuntimeValues(left, right, context.locale),
      ),
  ),
  id: definition(
    'identity',
    signature(['any'], 'text', {
      validateArguments: ([value]) =>
        typeIs(value, 'person', 'page') ? null : 'id() expects a person or page',
    }),
    ([value]) => {
      const candidate = value ?? null;
      if (
        isTaggedFormulaValue(candidate) &&
        (candidate.kind === 'person' || candidate.kind === 'page')
      ) {
        return candidate.id;
      }
      throw new FormulaFunctionFailure('argument_type', 'expected a person or page', 0);
    },
  ),
  name: definition(
    'identity',
    signature(['any'], 'text', {
      validateArguments: ([value]) =>
        typeIs(value, 'person', 'page') ? null : 'name() expects a person or page',
    }),
    ([value]) => {
      const candidate = value ?? null;
      if (!isTaggedFormulaValue(candidate)) {
        throw new FormulaFunctionFailure('argument_type', 'expected a person or page', 0);
      }
      const projected =
        candidate.kind === 'person'
          ? candidate.name
          : candidate.kind === 'page'
            ? candidate.title
            : undefined;
      if (projected === undefined) {
        throw new FormulaFunctionFailure('missing_projection', 'display identity is unavailable');
      }
      return projected;
    },
  ),
  sourceId: definition('identity', signature(['page'], 'text'), ([value]) => {
    const candidate = value ?? null;
    if (isTaggedFormulaValue(candidate) && candidate.kind === 'page') {
      return candidate.sourceId;
    }
    throw new FormulaFunctionFailure('argument_type', 'expected a page', 0);
  }),
};

export const SYNAPSE_FORMULA_FUNCTION_SIGNATURES: Readonly<
  Record<string, FormulaFunctionSignature>
> = Object.fromEntries(
  Object.entries(SYNAPSE_FORMULA_FUNCTIONS).map(([name, entry]) => [name, entry.signature]),
);

export function invokeFormulaFunction(
  name: string,
  arguments_: readonly FormulaRuntimeValue[],
  context: FormulaFunctionContext,
): FormulaFunctionResult {
  const entry = SYNAPSE_FORMULA_FUNCTIONS[name];
  if (!entry) {
    return {
      ok: false,
      problem: { code: 'unknown_function', function: name, message: `Unknown function "${name}"` },
    };
  }
  const minimum = entry.signature.minimumArguments ?? entry.signature.parameters.length;
  const maximum =
    entry.signature.maximumArguments ??
    (entry.signature.variadic ? Number.POSITIVE_INFINITY : entry.signature.parameters.length);
  if (arguments_.length < minimum || arguments_.length > maximum) {
    return {
      ok: false,
      problem: {
        code: 'argument_count',
        function: name,
        message:
          maximum === Number.POSITIVE_INFINITY
            ? `Expected at least ${minimum} argument(s)`
            : minimum === maximum
              ? `Expected ${minimum} argument(s)`
              : `Expected ${minimum} to ${maximum} argument(s)`,
      },
    };
  }
  try {
    return { ok: true, value: entry.evaluate(arguments_, context) };
  } catch (error) {
    if (error instanceof FormulaFunctionFailure) {
      return {
        ok: false,
        problem: {
          code: error.code,
          function: name,
          message: error.message,
          ...(error.argumentIndex === undefined ? {} : { argumentIndex: error.argumentIndex }),
        },
      };
    }
    return {
      ok: false,
      problem: { code: 'domain_error', function: name, message: 'Function evaluation failed' },
    };
  }
}
