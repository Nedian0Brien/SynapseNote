import {
  type FormulaAst,
  FormulaAstSchema,
  type FormulaExpression,
  FormulaExpressionSchema,
  type FormulaValueType,
} from './formula.ts';
import { SYNAPSE_FORMULA_FUNCTION_SIGNATURES } from './formula-functions.ts';
import type { DatabaseDefinition, DatabaseProperty } from './schema.ts';
import { DatabasePropertyIdSchema } from './schema.ts';

const FORMULA_SOURCE_MAX_LENGTH = 100_000;
/**
 * Ceiling on recursive-descent nesting (parens, unary, lambda bodies,
 * ternary branches). Without it, a source like `(((((...)))))` recurses
 * through `#parsePrefix` once per level and throws an untyped
 * `RangeError: Maximum call stack size exceeded` well before
 * `FORMULA_SOURCE_MAX_LENGTH` is reached (~20,000 levels was enough in
 * this engine) instead of the documented typed `FormulaSyntaxError`.
 */
const FORMULA_MAX_EXPRESSION_DEPTH = 256;

type TokenKind = 'number' | 'string' | 'identifier' | 'symbol' | 'eof';

interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

export class FormulaSyntaxError extends Error {
  readonly offset: number;
  readonly length: number;

  constructor(message: string, offset: number, length = 1) {
    super(message);
    this.name = 'FormulaSyntaxError';
    this.offset = offset;
    this.length = length;
  }
}

export interface FormulaPropertyResolutionContext {
  record?: FormulaExpression;
}

export interface ParseFormulaSourceOptions {
  resolveProperty?: (reference: string, context: FormulaPropertyResolutionContext) => string | null;
}

function tokenizeFormulaSource(source: string): Token[] {
  if (source.length > FORMULA_SOURCE_MAX_LENGTH) {
    throw new FormulaSyntaxError(
      `Formula source exceeds ${FORMULA_SOURCE_MAX_LENGTH} characters`,
      FORMULA_SOURCE_MAX_LENGTH,
    );
  }
  const tokens: Token[] = [];
  let offset = 0;
  const push = (kind: TokenKind, value: string, start: number, end: number) => {
    tokens.push({ kind, value, start, end });
  };
  while (offset < source.length) {
    const character = source[offset];
    if (!character) break;
    if (/\s/u.test(character)) {
      offset += 1;
      continue;
    }
    if (source.startsWith('//', offset)) {
      const newline = source.indexOf('\n', offset + 2);
      offset = newline < 0 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith('/*', offset)) {
      const end = source.indexOf('*/', offset + 2);
      if (end < 0) throw new FormulaSyntaxError('Unterminated block comment', offset, 2);
      offset = end + 2;
      continue;
    }
    if (character === '"') {
      const start = offset;
      offset += 1;
      let escaped = false;
      while (offset < source.length) {
        const next = source[offset];
        if (!next) break;
        if (!escaped && next === '"') {
          offset += 1;
          const raw = source.slice(start, offset);
          try {
            push('string', JSON.parse(raw) as string, start, offset);
          } catch {
            throw new FormulaSyntaxError('Invalid string escape', start, offset - start);
          }
          break;
        }
        if (!escaped && (next === '\n' || next === '\r')) {
          throw new FormulaSyntaxError('String literals cannot contain raw newlines', start);
        }
        escaped = !escaped && next === '\\';
        if (next !== '\\') escaped = false;
        offset += 1;
      }
      if (tokens.at(-1)?.start !== start) {
        throw new FormulaSyntaxError('Unterminated string literal', start);
      }
      continue;
    }
    if (/\d/u.test(character) || (character === '.' && /\d/u.test(source[offset + 1] ?? ''))) {
      const start = offset;
      const match = source.slice(offset).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u)?.[0];
      if (!match) throw new FormulaSyntaxError('Invalid number literal', start);
      offset += match.length;
      const number = Number(match);
      if (!Number.isFinite(number)) {
        throw new FormulaSyntaxError('Number literal must be finite', start, match.length);
      }
      push('number', match, start, offset);
      continue;
    }
    if (/[A-Za-z_]/u.test(character)) {
      const start = offset;
      offset += 1;
      while (/[A-Za-z0-9_]/u.test(source[offset] ?? '')) offset += 1;
      push('identifier', source.slice(start, offset), start, offset);
      continue;
    }
    const compound = ['=>', '==', '!=', '>=', '<=', '&&', '||'].find((operator) =>
      source.startsWith(operator, offset),
    );
    if (compound) {
      push('symbol', compound, offset, offset + compound.length);
      offset += compound.length;
      continue;
    }
    if ('()[],.?:+-*/%^!<>'.includes(character)) {
      push('symbol', character, offset, offset + 1);
      offset += 1;
      continue;
    }
    throw new FormulaSyntaxError(`Unexpected character ${JSON.stringify(character)}`, offset);
  }
  tokens.push({ kind: 'eof', value: '', start: source.length, end: source.length });
  return tokens;
}

const BINARY_OPERATORS = {
  '||': { precedence: 1, operator: 'or' },
  or: { precedence: 1, operator: 'or' },
  '&&': { precedence: 2, operator: 'and' },
  and: { precedence: 2, operator: 'and' },
  '==': { precedence: 3, operator: 'equal' },
  '!=': { precedence: 3, operator: 'not_equal' },
  '>': { precedence: 4, operator: 'greater' },
  '>=': { precedence: 4, operator: 'greater_equal' },
  '<': { precedence: 4, operator: 'less' },
  '<=': { precedence: 4, operator: 'less_equal' },
  '+': { precedence: 5, operator: 'add' },
  '-': { precedence: 5, operator: 'subtract' },
  '*': { precedence: 6, operator: 'multiply' },
  '/': { precedence: 6, operator: 'divide' },
  '%': { precedence: 6, operator: 'modulo' },
  '^': { precedence: 7, operator: 'power', rightAssociative: true },
} as const;

class FormulaParser {
  readonly #tokens: readonly Token[];
  readonly #options: ParseFormulaSourceOptions;
  #index = 0;
  #prefixDepth = 0;

  constructor(tokens: readonly Token[], options: ParseFormulaSourceOptions) {
    this.#tokens = tokens;
    this.#options = options;
  }

  parse(): FormulaExpression {
    const expression = this.#parseExpression(0);
    const trailing = this.#current();
    if (trailing.kind !== 'eof') {
      throw new FormulaSyntaxError(`Unexpected token "${trailing.value}"`, trailing.start);
    }
    return expression;
  }

  #current(offset = 0): Token {
    return (
      this.#tokens[this.#index + offset] ?? {
        kind: 'eof',
        value: '',
        start: 0,
        end: 0,
      }
    );
  }

  #consume(value?: string): Token {
    const token = this.#current();
    if (value !== undefined && token.value !== value) {
      throw new FormulaSyntaxError(`Expected "${value}"`, token.start, token.end - token.start);
    }
    this.#index += 1;
    return token;
  }

  #parseExpression(minimumPrecedence: number): FormulaExpression {
    let left = this.#parsePrefix();
    left = this.#parsePostfix(left);
    while (true) {
      const token = this.#current();
      const binary = BINARY_OPERATORS[token.value as keyof typeof BINARY_OPERATORS];
      if (!binary || binary.precedence < minimumPrecedence) break;
      this.#consume();
      const right = this.#parseExpression(
        'rightAssociative' in binary && binary.rightAssociative
          ? binary.precedence
          : binary.precedence + 1,
      );
      left = {
        type: 'binary',
        operator: binary.operator,
        left,
        right,
      };
    }
    if (minimumPrecedence === 0 && this.#current().value === '?') {
      this.#consume('?');
      const whenTrue = this.#parseExpression(0);
      this.#consume(':');
      const whenFalse = this.#parseExpression(0);
      left = { type: 'conditional', condition: left, whenTrue, whenFalse };
    }
    return left;
  }

  #parsePrefix(): FormulaExpression {
    this.#prefixDepth += 1;
    if (this.#prefixDepth > FORMULA_MAX_EXPRESSION_DEPTH) {
      throw new FormulaSyntaxError(
        `Formula expression nesting exceeds ${FORMULA_MAX_EXPRESSION_DEPTH} levels`,
        this.#current().start,
      );
    }
    try {
      const token = this.#current();
      if (token.kind === 'number') {
        this.#consume();
        return { type: 'literal', valueType: 'number', value: Number(token.value) };
      }
      if (token.kind === 'string') {
        this.#consume();
        return { type: 'literal', valueType: 'text', value: token.value };
      }
      if (token.kind === 'identifier') {
        this.#consume();
        if (token.value === 'not') {
          return {
            type: 'unary',
            operator: 'not',
            operand: this.#parseExpression(8),
          };
        }
        if (token.value === 'true' || token.value === 'false') {
          return { type: 'literal', valueType: 'boolean', value: token.value === 'true' };
        }
        if (token.value === 'null') return { type: 'literal', valueType: 'null', value: null };
        if (this.#current().value === '=>') {
          this.#consume('=>');
          return {
            type: 'lambda',
            parameters: [token.value],
            body: this.#parseExpression(0),
          };
        }
        return { type: 'variable', name: token.value };
      }
      if (token.value === '!' || token.value === '-' || token.value === '+') {
        this.#consume();
        return {
          type: 'unary',
          operator: token.value === '!' ? 'not' : token.value === '-' ? 'negate' : 'positive',
          operand: this.#parseExpression(8),
        };
      }
      if (token.value === '[') {
        this.#consume('[');
        const items = this.#parseArguments(']');
        return { type: 'list', items };
      }
      if (token.value === '(') {
        if (this.#isParenthesizedLambda()) return this.#parseParenthesizedLambda();
        this.#consume('(');
        const grouped = this.#parseExpression(0);
        this.#consume(')');
        return grouped;
      }
      throw new FormulaSyntaxError(
        token.kind === 'eof' ? 'Expected an expression' : `Unexpected token "${token.value}"`,
        token.start,
      );
    } finally {
      this.#prefixDepth -= 1;
    }
  }

  #parsePostfix(initial: FormulaExpression): FormulaExpression {
    let expression = initial;
    while (true) {
      if (this.#current().value === '(') {
        if (expression.type !== 'variable') {
          throw new FormulaSyntaxError('Only named functions can be called', this.#current().start);
        }
        const callOffset = this.#current().start;
        this.#consume('(');
        const arguments_ = this.#parseArguments(')');
        expression = this.#normalizeCall(expression.name, arguments_, undefined, callOffset);
        continue;
      }
      if (this.#current().value === '.') {
        this.#consume('.');
        const method = this.#consume();
        if (method.kind !== 'identifier') {
          throw new FormulaSyntaxError('Expected a method name after "."', method.start);
        }
        this.#consume('(');
        const arguments_ = this.#parseArguments(')');
        expression = this.#normalizeCall(method.value, arguments_, expression, method.start);
        continue;
      }
      return expression;
    }
  }

  #parseArguments(closing: ']' | ')'): FormulaExpression[] {
    const expressions: FormulaExpression[] = [];
    if (this.#current().value === closing) {
      this.#consume(closing);
      return expressions;
    }
    while (true) {
      expressions.push(this.#parseExpression(0));
      if (this.#current().value === closing) {
        this.#consume(closing);
        return expressions;
      }
      this.#consume(',');
      if (this.#current().value === closing) {
        throw new FormulaSyntaxError('Trailing commas are not allowed', this.#current().start);
      }
    }
  }

  #normalizeCall(
    name: string,
    arguments_: FormulaExpression[],
    receiver: FormulaExpression | undefined,
    offset: number,
  ): FormulaExpression {
    if (name === 'prop') {
      if (
        arguments_.length !== 1 ||
        arguments_[0]?.type !== 'literal' ||
        arguments_[0].valueType !== 'text'
      ) {
        throw new FormulaSyntaxError('prop() requires one string property reference', offset);
      }
      const reference = arguments_[0].value;
      const propertyId =
        this.#options.resolveProperty?.(reference, { record: receiver }) ??
        (DatabasePropertyIdSchema.safeParse(reference).success ? reference : null);
      if (!propertyId || !DatabasePropertyIdSchema.safeParse(propertyId).success) {
        throw new FormulaSyntaxError(`Property reference "${reference}" did not resolve`, offset);
      }
      return {
        type: 'property',
        propertyId,
        ...(receiver ? { record: receiver } : {}),
      };
    }
    if (name === 'date' && receiver === undefined) {
      const argument = arguments_[0];
      if (
        arguments_.length !== 1 ||
        argument?.type !== 'literal' ||
        argument.valueType !== 'text' ||
        !zonedIsoDateTime(argument.value)
      ) {
        throw new FormulaSyntaxError(
          'date() requires one offset-bearing ISO datetime string',
          offset,
        );
      }
      return { type: 'literal', valueType: 'date', value: argument.value };
    }
    const normalizedArguments = receiver ? [receiver, ...arguments_] : arguments_;
    if (name === 'let' && receiver === undefined) {
      if (normalizedArguments.length < 3 || normalizedArguments.length % 2 === 0) {
        throw new FormulaSyntaxError(
          'let() requires one or more variable/value pairs followed by a body',
          offset,
        );
      }
      const bindings: Array<{ name: string; value: FormulaExpression }> = [];
      for (let index = 0; index < normalizedArguments.length - 1; index += 2) {
        const variable = normalizedArguments[index];
        const value = normalizedArguments[index + 1];
        if (variable?.type !== 'variable' || !value) {
          throw new FormulaSyntaxError('let() binding names must be identifiers', offset);
        }
        if (bindings.some((binding) => binding.name === variable.name)) {
          throw new FormulaSyntaxError(`Duplicate let binding "${variable.name}"`, offset);
        }
        bindings.push({ name: variable.name, value });
      }
      const body = normalizedArguments.at(-1);
      if (!body) throw new FormulaSyntaxError('let() is incomplete', offset);
      return {
        type: 'let',
        bindings,
        body,
      };
    }
    return { type: 'call', function: name, arguments: normalizedArguments };
  }

  #isParenthesizedLambda(): boolean {
    let cursor = this.#index + 1;
    if (this.#tokens[cursor]?.value === ')') return this.#tokens[cursor + 1]?.value === '=>';
    while (true) {
      if (this.#tokens[cursor]?.kind !== 'identifier') return false;
      cursor += 1;
      const separator = this.#tokens[cursor]?.value;
      if (separator === ')') return this.#tokens[cursor + 1]?.value === '=>';
      if (separator !== ',') return false;
      cursor += 1;
    }
  }

  #parseParenthesizedLambda(): FormulaExpression {
    this.#consume('(');
    const parameters: string[] = [];
    if (this.#current().value !== ')') {
      while (true) {
        const parameter = this.#consume();
        if (parameter.kind !== 'identifier') {
          throw new FormulaSyntaxError('Lambda parameters must be identifiers', parameter.start);
        }
        if (parameters.includes(parameter.value)) {
          throw new FormulaSyntaxError(
            `Duplicate lambda parameter "${parameter.value}"`,
            parameter.start,
          );
        }
        parameters.push(parameter.value);
        if (this.#current().value === ')') break;
        this.#consume(',');
      }
    }
    this.#consume(')');
    this.#consume('=>');
    return { type: 'lambda', parameters, body: this.#parseExpression(0) };
  }
}

function zonedIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
    value,
  );
}

export function parseFormulaSource(
  source: string,
  options: ParseFormulaSourceOptions = {},
): FormulaExpression {
  const expression = new FormulaParser(tokenizeFormulaSource(source), options).parse();
  const validated = FormulaAstSchema.safeParse({
    language: 'synapse-formula-1',
    version: 1,
    resultType: 'null',
    expression,
  });
  if (!validated.success) {
    throw new FormulaSyntaxError(
      validated.error.issues[0]?.message ?? 'Formula expression is invalid',
      0,
    );
  }
  return validated.data.expression;
}

const BINARY_SYMBOLS: Record<Extract<FormulaExpression, { type: 'binary' }>['operator'], string> = {
  add: '+',
  subtract: '-',
  multiply: '*',
  divide: '/',
  modulo: '%',
  power: '^',
  equal: '==',
  not_equal: '!=',
  greater: '>',
  greater_equal: '>=',
  less: '<',
  less_equal: '<=',
  and: '&&',
  or: '||',
};

const BINARY_PRECEDENCE = new Map(
  Object.entries(BINARY_OPERATORS).map(([symbol, details]) => [
    details.operator,
    { symbol, ...details },
  ]),
);

export interface FormatFormulaSourceOptions {
  propertyReference?: (propertyId: string) => string | null;
}

function formatExpression(
  expression: FormulaExpression,
  options: FormatFormulaSourceOptions,
  parentPrecedence = 0,
): string {
  switch (expression.type) {
    case 'literal':
      if (expression.valueType === 'null') return 'null';
      if (expression.valueType === 'date') return `date(${JSON.stringify(expression.value)})`;
      return expression.valueType === 'text'
        ? JSON.stringify(expression.value)
        : String(expression.value);
    case 'property': {
      const reference = options.propertyReference?.(expression.propertyId) ?? expression.propertyId;
      const property = `prop(${JSON.stringify(reference)})`;
      return expression.record
        ? `${formatExpression(expression.record, options, 9)}.${property}`
        : property;
    }
    case 'variable':
      return expression.name;
    case 'list':
      return `[${expression.items.map((item) => formatExpression(item, options)).join(', ')}]`;
    case 'unary': {
      const operator =
        expression.operator === 'not' ? '!' : expression.operator === 'negate' ? '-' : '+';
      const formatted = `${operator}${formatExpression(expression.operand, options, 8)}`;
      return parentPrecedence > 8 ? `(${formatted})` : formatted;
    }
    case 'binary': {
      const details = BINARY_PRECEDENCE.get(expression.operator);
      if (!details) throw new Error(`Unknown formula operator "${expression.operator}"`);
      const left = formatExpression(expression.left, options, details.precedence);
      const right = formatExpression(
        expression.right,
        options,
        'rightAssociative' in details && details.rightAssociative
          ? details.precedence
          : details.precedence + 1,
      );
      const formatted = `${left} ${BINARY_SYMBOLS[expression.operator]} ${right}`;
      return parentPrecedence > details.precedence ? `(${formatted})` : formatted;
    }
    case 'conditional': {
      const formatted = `${formatExpression(expression.condition, options, 1)} ? ${formatExpression(expression.whenTrue, options)} : ${formatExpression(expression.whenFalse, options)}`;
      return parentPrecedence > 0 ? `(${formatted})` : formatted;
    }
    case 'call':
      return `${expression.function}(${expression.arguments.map((argument) => formatExpression(argument, options)).join(', ')})`;
    case 'let':
      return `let(${[
        ...expression.bindings.flatMap((binding) => [
          binding.name,
          formatExpression(binding.value, options),
        ]),
        formatExpression(expression.body, options),
      ].join(', ')})`;
    case 'lambda':
      return `(${expression.parameters.join(', ')}) => ${formatExpression(expression.body, options)}`;
  }
}

export function formatFormulaSource(
  input: FormulaAst | FormulaExpression,
  options: FormatFormulaSourceOptions = {},
): string {
  const expression =
    'language' in input
      ? FormulaAstSchema.parse(input).expression
      : FormulaExpressionSchema.parse(input);
  return formatExpression(expression, options);
}

export type FormulaFunctionParameterType = FormulaValueType | 'any' | 'lambda';

export interface FormulaStaticType {
  valueType: FormulaValueType | 'unknown' | 'lambda';
  itemType?: FormulaStaticType;
  lambdaResultType?: FormulaStaticType;
  pageSourceId?: string;
}

export interface FormulaFunctionSignature {
  parameters: readonly FormulaFunctionParameterType[];
  variadic?: FormulaFunctionParameterType;
  minimumArguments?: number;
  maximumArguments?: number;
  validateArguments?: (argumentTypes: readonly FormulaStaticType[]) => string | null;
  resultType:
    | FormulaValueType
    | FormulaStaticType
    | ((
        argumentTypes: readonly FormulaStaticType[],
      ) => FormulaValueType | FormulaStaticType | null);
}

export interface FormulaTypeContext {
  definition: DatabaseDefinition;
  sourceId: string;
  variables?: Readonly<Record<string, FormulaValueType>>;
  functions?: Readonly<Record<string, FormulaFunctionSignature>>;
}

export interface FormulaTypeIssue {
  code:
    | 'unknown_property'
    | 'property_scope_mismatch'
    | 'unknown_variable'
    | 'unknown_function'
    | 'argument_count'
    | 'type_mismatch'
    | 'result_type_mismatch';
  message: string;
  path: readonly (string | number)[];
}

export interface FormulaTypeCheckResult {
  ok: boolean;
  resultType: FormulaStaticType;
  issues: readonly FormulaTypeIssue[];
}

function typeForProperty(property: DatabaseProperty): FormulaStaticType {
  switch (property.type) {
    case 'title':
    case 'text':
    case 'select':
    case 'status':
    case 'url':
    case 'email':
    case 'phone':
    case 'created_by':
    case 'last_edited_by':
    case 'verification':
    case 'unique_id':
    case 'place':
      return { valueType: 'text' };
    case 'button':
      return { valueType: 'null' };
    case 'number':
      return { valueType: 'number' };
    case 'checkbox':
      return { valueType: 'boolean' };
    case 'date':
    case 'created_time':
    case 'last_edited_time':
      return { valueType: 'date' };
    case 'person':
      return property.multiple
        ? { valueType: 'list', itemType: { valueType: 'person' } }
        : { valueType: 'person' };
    case 'files':
      return { valueType: 'list', itemType: { valueType: 'text' } };
    case 'multi_select':
      return { valueType: 'list', itemType: { valueType: 'text' } };
    case 'relation': {
      const page = { valueType: 'page' as const, pageSourceId: property.targetSourceId };
      return property.cardinality === 'many' ? { valueType: 'list', itemType: page } : page;
    }
    case 'formula':
      return { valueType: property.ast.resultType };
    case 'rollup':
      if (property.function === 'earliest' || property.function === 'latest') {
        return { valueType: 'date' };
      }
      if (property.function === 'show_original') {
        return {
          valueType: 'list',
          itemType: {
            valueType:
              property.targetValueType === 'list'
                ? (property.targetItemType ?? 'unknown')
                : property.targetValueType,
          },
        };
      }
      return { valueType: 'number' };
  }
}

function compatible(actual: FormulaStaticType, expected: FormulaFunctionParameterType): boolean {
  return (
    expected === 'any' ||
    actual.valueType === 'unknown' ||
    actual.valueType === expected ||
    (actual.valueType === 'null' && expected !== 'lambda')
  );
}

function commonType(left: FormulaStaticType, right: FormulaStaticType): FormulaStaticType | null {
  if (left.valueType === 'unknown') return right;
  if (right.valueType === 'unknown') return left;
  if (left.valueType === 'null') return right;
  if (right.valueType === 'null') return left;
  if (left.valueType !== right.valueType) return null;
  if (left.valueType === 'list') {
    const item =
      left.itemType && right.itemType ? commonType(left.itemType, right.itemType) : undefined;
    if (left.itemType && right.itemType && !item) return null;
    return { valueType: 'list', ...(item ? { itemType: item } : {}) };
  }
  return left;
}

export function typeCheckFormulaExpression(
  expression: FormulaExpression,
  context: FormulaTypeContext,
  declaredResultType?: FormulaValueType,
): FormulaTypeCheckResult {
  const issues: FormulaTypeIssue[] = [];
  const functions = { ...SYNAPSE_FORMULA_FUNCTION_SIGNATURES, ...context.functions };
  const properties = new Map(
    context.definition.sources.flatMap((source) =>
      source.properties.map(
        (property) => [property.id, { property, sourceId: source.id }] as const,
      ),
    ),
  );
  const rootVariables = new Map(
    Object.entries(context.variables ?? {}).map(
      ([name, valueType]) => [name, { valueType }] as const,
    ),
  );
  const issue = (
    code: FormulaTypeIssue['code'],
    message: string,
    path: readonly (string | number)[],
  ) => issues.push({ code, message, path });

  const visit = (
    node: FormulaExpression,
    path: readonly (string | number)[],
    variables: ReadonlyMap<string, FormulaStaticType>,
  ): FormulaStaticType => {
    switch (node.type) {
      case 'literal':
        return { valueType: node.valueType };
      case 'property': {
        const found = properties.get(node.propertyId);
        if (!found) {
          issue('unknown_property', `Property "${node.propertyId}" is not declared`, path);
          return { valueType: 'unknown' };
        }
        if (!node.record && found.sourceId !== context.sourceId) {
          issue(
            'property_scope_mismatch',
            `Property "${node.propertyId}" requires a record from source "${found.sourceId}"`,
            path,
          );
        }
        if (node.record) {
          const recordType = visit(node.record, [...path, 'record'], variables);
          if (recordType.valueType !== 'unknown' && recordType.valueType !== 'page') {
            issue('type_mismatch', 'Relation traversal requires a page value', [...path, 'record']);
          } else if (recordType.pageSourceId && recordType.pageSourceId !== found.sourceId) {
            issue(
              'property_scope_mismatch',
              `Page source "${recordType.pageSourceId}" does not own property "${node.propertyId}"`,
              path,
            );
          }
        }
        return typeForProperty(found.property);
      }
      case 'variable': {
        const variable = variables.get(node.name);
        if (!variable) {
          issue('unknown_variable', `Variable "${node.name}" is not bound`, path);
          return { valueType: 'unknown' };
        }
        return variable;
      }
      case 'list': {
        let itemType: FormulaStaticType | undefined;
        node.items.forEach((item, index) => {
          const next = visit(item, [...path, 'items', index], variables);
          const common = itemType ? commonType(itemType, next) : next;
          if (!common) {
            issue('type_mismatch', 'List items must have one compatible type', [
              ...path,
              'items',
              index,
            ]);
          } else {
            itemType = common;
          }
        });
        return { valueType: 'list', ...(itemType ? { itemType } : {}) };
      }
      case 'unary': {
        const operand = visit(node.operand, [...path, 'operand'], variables);
        const expected = node.operator === 'not' ? 'boolean' : 'number';
        if (!compatible(operand, expected)) {
          issue('type_mismatch', `${node.operator} requires ${expected}`, path);
        }
        return { valueType: expected };
      }
      case 'binary': {
        const left = visit(node.left, [...path, 'left'], variables);
        const right = visit(node.right, [...path, 'right'], variables);
        if (node.operator === 'and' || node.operator === 'or') {
          if (!compatible(left, 'boolean') || !compatible(right, 'boolean')) {
            issue('type_mismatch', `${node.operator} requires boolean operands`, path);
          }
          return { valueType: 'boolean' };
        }
        if (node.operator === 'equal' || node.operator === 'not_equal') {
          if (!commonType(left, right)) {
            issue('type_mismatch', `${node.operator} operands are incompatible`, path);
          }
          return { valueType: 'boolean' };
        }
        if (
          node.operator === 'greater' ||
          node.operator === 'greater_equal' ||
          node.operator === 'less' ||
          node.operator === 'less_equal'
        ) {
          const comparable = commonType(left, right);
          if (
            !comparable ||
            !['number', 'text', 'date', 'unknown'].includes(comparable.valueType)
          ) {
            issue('type_mismatch', `${node.operator} operands are not comparable`, path);
          }
          return { valueType: 'boolean' };
        }
        if (node.operator === 'add' && left.valueType === 'text' && right.valueType === 'text') {
          return { valueType: 'text' };
        }
        if (!compatible(left, 'number') || !compatible(right, 'number')) {
          issue('type_mismatch', `${node.operator} requires number operands`, path);
        }
        return { valueType: 'number' };
      }
      case 'conditional': {
        const condition = visit(node.condition, [...path, 'condition'], variables);
        if (!compatible(condition, 'boolean')) {
          issue('type_mismatch', 'Conditional condition must be boolean', [...path, 'condition']);
        }
        const whenTrue = visit(node.whenTrue, [...path, 'whenTrue'], variables);
        const whenFalse = visit(node.whenFalse, [...path, 'whenFalse'], variables);
        const result = commonType(whenTrue, whenFalse);
        if (!result) {
          issue('type_mismatch', 'Conditional branches must have compatible types', path);
          return { valueType: 'unknown' };
        }
        return result;
      }
      case 'call': {
        const argumentTypes = node.arguments.map((argument, index) =>
          visit(argument, [...path, 'arguments', index], variables),
        );
        const signature = functions[node.function];
        if (!signature) {
          issue('unknown_function', `Function "${node.function}" is not declared`, path);
          return { valueType: 'unknown' };
        }
        const minimum = signature.minimumArguments ?? signature.parameters.length;
        const maximum =
          signature.maximumArguments ??
          (signature.variadic ? Number.POSITIVE_INFINITY : signature.parameters.length);
        if (argumentTypes.length < minimum || argumentTypes.length > maximum) {
          const expectation =
            maximum === Number.POSITIVE_INFINITY
              ? `at least ${minimum}`
              : minimum === maximum
                ? String(minimum)
                : `${minimum} to ${maximum}`;
          issue(
            'argument_count',
            `Function "${node.function}" expects ${expectation} argument(s)`,
            path,
          );
        }
        argumentTypes.forEach((argumentType, index) => {
          const expected = signature.parameters[index] ?? signature.variadic;
          if (expected && !compatible(argumentType, expected)) {
            issue(
              'type_mismatch',
              `Function "${node.function}" argument ${index + 1} must be ${expected}`,
              [...path, 'arguments', index],
            );
          }
        });
        const validationIssue = signature.validateArguments?.(argumentTypes);
        if (validationIssue) {
          issue('type_mismatch', `Function "${node.function}": ${validationIssue}`, path);
        }
        const resolvedResult =
          typeof signature.resultType === 'function'
            ? signature.resultType(argumentTypes)
            : signature.resultType;
        if (!resolvedResult) {
          issue('type_mismatch', `Function "${node.function}" cannot type these arguments`, path);
          return { valueType: 'unknown' };
        }
        return typeof resolvedResult === 'string' ? { valueType: resolvedResult } : resolvedResult;
      }
      case 'let': {
        const local = new Map(variables);
        node.bindings.forEach((binding, index) => {
          local.set(
            binding.name,
            visit(binding.value, [...path, 'bindings', index, 'value'], local),
          );
        });
        return visit(node.body, [...path, 'body'], local);
      }
      case 'lambda': {
        const local = new Map(variables);
        node.parameters.forEach((parameter) => {
          local.set(parameter, { valueType: 'unknown' });
        });
        const lambdaResultType = visit(node.body, [...path, 'body'], local);
        return { valueType: 'lambda', lambdaResultType };
      }
    }
  };

  const resultType = visit(expression, ['expression'], rootVariables);
  if (
    declaredResultType &&
    resultType.valueType !== 'unknown' &&
    resultType.valueType !== declaredResultType
  ) {
    issue(
      'result_type_mismatch',
      `Declared result ${declaredResultType} does not match inferred ${resultType.valueType}`,
      ['resultType'],
    );
  }
  return { ok: issues.length === 0, resultType, issues };
}

export class FormulaTypeError extends Error {
  readonly issues: readonly FormulaTypeIssue[];

  constructor(issues: readonly FormulaTypeIssue[]) {
    super(issues.map((issue) => issue.message).join('; '));
    this.name = 'FormulaTypeError';
    this.issues = issues;
  }
}

export interface CompileFormulaSourceOptions extends Omit<FormulaTypeContext, 'variables'> {
  resultType?: FormulaValueType;
  variables?: Readonly<Record<string, FormulaValueType>>;
}

function propertyCandidates(
  definition: DatabaseDefinition,
  sourceId: string,
  reference: string,
): DatabaseProperty[] {
  const source = definition.sources.find((candidate) => candidate.id === sourceId);
  if (!source) return [];
  const exactId = source.properties.filter((property) => property.id === reference);
  if (exactId.length > 0) return exactId;
  const exactKey = source.properties.filter((property) => property.key === reference);
  if (exactKey.length > 0) return exactKey;
  const normalized = reference.trim().toLocaleLowerCase('en-US');
  return source.properties.filter(
    (property) =>
      property.name.toLocaleLowerCase('en-US') === normalized ||
      property.aliases.some((alias) => alias.toLocaleLowerCase('en-US') === normalized),
  );
}

export function compileFormulaSource(
  source: string,
  options: CompileFormulaSourceOptions,
): FormulaAst {
  const expression = parseFormulaSource(source, {
    resolveProperty: (reference, resolution) => {
      let sourceId = options.sourceId;
      if (resolution.record) {
        const recordType = typeCheckFormulaExpression(resolution.record, options).resultType;
        if (recordType.valueType === 'page' && recordType.pageSourceId) {
          sourceId = recordType.pageSourceId;
        } else if (!DatabasePropertyIdSchema.safeParse(reference).success) {
          const global = options.definition.sources.flatMap((candidate) =>
            propertyCandidates(options.definition, candidate.id, reference),
          );
          return global.length === 1 ? (global[0]?.id ?? null) : null;
        }
      }
      const candidates = propertyCandidates(options.definition, sourceId, reference);
      return candidates.length === 1 ? (candidates[0]?.id ?? null) : null;
    },
  });
  const checked = typeCheckFormulaExpression(expression, options, options.resultType);
  if (!checked.ok) throw new FormulaTypeError(checked.issues);
  if (checked.resultType.valueType === 'unknown' || checked.resultType.valueType === 'lambda') {
    throw new FormulaTypeError([
      {
        code: 'result_type_mismatch',
        message: 'Formula result type cannot be inferred as a persisted value',
        path: ['resultType'],
      },
    ]);
  }
  return FormulaAstSchema.parse({
    language: 'synapse-formula-1',
    version: 1,
    resultType: options.resultType ?? checked.resultType.valueType,
    expression,
  });
}
