import { describe, expect, test } from 'bun:test';
import {
  FORMULA_FUNCTION_MAX_TEXT_LENGTH,
  type FormulaFunctionContext,
  type FormulaRuntimeValue,
  invokeFormulaFunction,
  SYNAPSE_FORMULA_FUNCTION_SIGNATURES,
  SYNAPSE_FORMULA_FUNCTIONS,
} from './formula-functions.ts';
import { compileFormulaSource, FormulaTypeError } from './formula-language.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

const context: FormulaFunctionContext = {
  now: '2026-07-20T03:04:05.000Z',
  timeZone: 'Asia/Seoul',
  locale: 'en-US',
};

function call(name: string, arguments_: readonly FormulaRuntimeValue[]) {
  const result = invokeFormulaFunction(name, arguments_, context);
  if (!result.ok) throw new Error(`${name}: ${result.problem.code}: ${result.problem.message}`);
  return result.value;
}

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_functions',
    key: 'functions',
    name: 'Function fixtures',
    contract: {
      purpose: 'Type-check standard functions',
      canonicality: 'canonical',
      vocabulary: ['formula'],
      freshness: { expectation: 'realtime' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_tasks',
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        folder: 'tasks',
        properties: [
          { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
          {
            id: 'prop_tags',
            key: 'tags',
            name: 'Tags',
            type: 'multi_select',
            options: [{ id: 'opt_core', key: 'core', name: 'Core' }],
          },
          {
            id: 'prop_project',
            key: 'project',
            name: 'Project',
            type: 'relation',
            targetSourceId: 'ds_projects',
            cardinality: 'one',
          },
        ],
      },
      {
        id: 'ds_projects',
        key: 'projects',
        name: 'Projects',
        recordMeaning: 'One project',
        folder: 'projects',
        properties: [{ id: 'prop_project_title', key: 'title', name: 'Title', type: 'title' }],
      },
    ],
  });
}

describe('Synapse Formula 1 standard function library', () => {
  test('shares one complete typed registry across every value family', () => {
    expect(Object.keys(SYNAPSE_FORMULA_FUNCTIONS).sort()).toEqual(
      Object.keys(SYNAPSE_FORMULA_FUNCTION_SIGNATURES).sort(),
    );
    expect(
      new Set(Object.values(SYNAPSE_FORMULA_FUNCTIONS).map((entry) => entry.category)),
    ).toEqual(new Set(['text', 'number', 'date', 'boolean', 'list', 'identity']));
    expect(Object.keys(SYNAPSE_FORMULA_FUNCTIONS).length).toBeGreaterThanOrEqual(40);
  });

  test('evaluates text functions deterministically without regex or host coercion', () => {
    expect(call('length', ['A😀'])).toBe(3);
    expect(call('concat', ['Synapse', 'Note'])).toBe('SynapseNote');
    expect(call('contains', ['SynapseNote', 'Note'])).toBe(true);
    expect(call('startsWith', ['SynapseNote', 'Syn'])).toBe(true);
    expect(call('endsWith', ['SynapseNote', 'Note'])).toBe(true);
    expect(call('lower', ['İABC'])).toBe('i̇abc');
    expect(call('upper', ['agent'])).toBe('AGENT');
    expect(call('trim', ['  agent  '])).toBe('agent');
    expect(call('substring', ['abcdef', 1, 4])).toBe('bcd');
    expect(call('replace', ['a-a-a', 'a', 'b'])).toBe('b-a-a');
    expect(call('replaceAll', ['a-a-a', 'a', 'b'])).toBe('b-b-b');
    expect(call('split', ['a,b,c', ','])).toEqual(['a', 'b', 'c']);
    expect(call('repeat', ['ab', 3])).toBe('ababab');
  });

  test('evaluates finite numeric and explicit boolean conversions', () => {
    expect(call('abs', [-2])).toBe(2);
    expect(call('ceil', [1.2])).toBe(2);
    expect(call('floor', [1.8])).toBe(1);
    expect(call('round', [1.5])).toBe(2);
    expect(call('sqrt', [9])).toBe(3);
    expect(call('pow', [2, 8])).toBe(256);
    expect(call('min', [3, 1, 2])).toBe(1);
    expect(call('max', [3, 1, 2])).toBe(3);
    expect(call('sum', [[1, 2, 3]])).toBe(6);
    expect(call('average', [[2, 4]])).toBe(3);
    expect(call('empty', [null])).toBe(true);
    expect(call('empty', [[]])).toBe(true);
    expect(call('toNumber', [true])).toBe(1);
    expect(call('toNumber', [false])).toBe(0);
  });

  test('uses only the frozen clock and explicit timezone for date functions', () => {
    const now = { kind: 'date' as const, value: context.now };
    expect(call('now', [])).toEqual(now);
    expect(call('today', [])).toEqual({ kind: 'date', value: '2026-07-20' });
    expect(call('dateAdd', [now, 2, 'hours'])).toEqual({
      kind: 'date',
      value: '2026-07-20T05:04:05.000Z',
    });
    expect(call('dateSubtract', [now, 1, 'days'])).toEqual({
      kind: 'date',
      value: '2026-07-19T03:04:05.000Z',
    });
    expect(
      call('dateBetween', [now, { kind: 'date', value: '2026-07-20T01:04:05Z' }, 'hours']),
    ).toBe(2);
    expect(call('year', [now])).toBe(2026);
    expect(call('month', [now])).toBe(7);
    expect(call('day', [now])).toBe(20);
    expect(call('hour', [now])).toBe(12);
    expect(call('minute', [now])).toBe(4);
  });

  test('evaluates bounded list and permission-projected identity functions', () => {
    const page = {
      kind: 'page' as const,
      id: 'rec_project',
      sourceId: 'ds_projects',
      title: 'Project Alpha',
    };
    const person = { kind: 'person' as const, id: 'person_owner', name: 'Owner' };
    expect(call('concat', [[1, 2], [3]])).toEqual([1, 2, 3]);
    expect(call('contains', [[page], page])).toBe(true);
    expect(call('at', [['a', 'b'], 1])).toBe('b');
    expect(call('first', [['a', 'b']])).toBe('a');
    expect(call('last', [['a', 'b']])).toBe('b');
    expect(call('slice', [[1, 2, 3], 1])).toEqual([2, 3]);
    expect(call('reverse', [[1, 2, 3]])).toEqual([3, 2, 1]);
    expect(call('unique', [[1, 1, 2, page, page]])).toEqual([1, 2, page]);
    expect(call('join', [['a', 'b'], '/'])).toBe('a/b');
    expect(call('flat', [[[1, 2], [3], 4]])).toEqual([1, 2, 3, 4]);
    expect(call('id', [page])).toBe('rec_project');
    expect(call('id', [person])).toBe('person_owner');
    expect(call('name', [page])).toBe('Project Alpha');
    expect(call('name', [person])).toBe('Owner');
    expect(call('sourceId', [page])).toBe('ds_projects');
  });

  test('runs bounded higher-order list functions through explicit lambda closures', () => {
    const double = {
      kind: 'lambda' as const,
      arity: 2,
      invoke: ([value, index]: readonly FormulaRuntimeValue[]) => ({
        ok: true as const,
        value: Number(value) * 2 + Number(index),
      }),
    };
    const even = {
      kind: 'lambda' as const,
      arity: 1,
      invoke: ([value]: readonly FormulaRuntimeValue[]) => ({
        ok: true as const,
        value: Number(value) % 2 === 0,
      }),
    };
    expect(call('map', [[1, 2, 3], double])).toEqual([2, 5, 8]);
    expect(call('filter', [[1, 2, 3, 4], even])).toEqual([2, 4]);
    expect(call('some', [[1, 3, 4], even])).toBe(true);
    expect(call('every', [[2, 4], even])).toBe(true);
    expect(call('find', [[1, 3, 4], even])).toBe(4);
    expect(call('findIndex', [[1, 3, 4], even])).toBe(2);
    expect(call('sort', [['item10', 'item2', 'item1']])).toEqual(['item1', 'item2', 'item10']);
  });

  test('type-checks overloads, list item results, relation identities, and optional arity', () => {
    const options = {
      definition: definition(),
      sourceId: 'ds_tasks',
    };
    expect(compileFormulaSource('length(prop("tags"))', options).resultType).toBe('number');
    expect(compileFormulaSource('first(prop("tags"))', options).resultType).toBe('text');
    expect(compileFormulaSource('id(prop("project"))', options).resultType).toBe('text');
    expect(
      compileFormulaSource('map(prop("tags"), value => upper(value))', options).resultType,
    ).toBe('list');
    expect(
      compileFormulaSource('first(map(prop("tags"), value => upper(value)))', options).resultType,
    ).toBe('text');
    expect(compileFormulaSource('substring("abcd", 1)', options).resultType).toBe('text');
    expect(() => compileFormulaSource('length(prop("score"))', options)).toThrow(FormulaTypeError);
    expect(() => compileFormulaSource('substring("abcd", 1, 2, 3)', options)).toThrow(
      FormulaTypeError,
    );
    expect(() =>
      compileFormulaSource('filter(prop("tags"), value => upper(value))', options),
    ).toThrow(FormulaTypeError);
  });

  test('returns typed problems for domains, unavailable projections, arity, and resource limits', () => {
    expect(invokeFormulaFunction('missing', [], context)).toMatchObject({
      ok: false,
      problem: { code: 'unknown_function' },
    });
    expect(invokeFormulaFunction('sqrt', [-1], context)).toMatchObject({
      ok: false,
      problem: { code: 'domain_error' },
    });
    expect(invokeFormulaFunction('average', [[]], context)).toMatchObject({
      ok: false,
      problem: { code: 'domain_error' },
    });
    expect(invokeFormulaFunction('substring', ['abc'], context)).toMatchObject({
      ok: false,
      problem: { code: 'argument_count' },
    });
    expect(
      invokeFormulaFunction(
        'name',
        [{ kind: 'page', id: 'rec_hidden', sourceId: 'ds_projects' }],
        context,
      ),
    ).toMatchObject({ ok: false, problem: { code: 'missing_projection' } });
    expect(
      invokeFormulaFunction('repeat', ['x', FORMULA_FUNCTION_MAX_TEXT_LENGTH + 1], context),
    ).toMatchObject({ ok: false, problem: { code: 'resource_limit' } });
  });
});
