import { describe, expect, test } from 'bun:test';
import { serializeFormulaAst } from './formula.ts';
import {
  compileFormulaSource,
  FormulaSyntaxError,
  FormulaTypeError,
  formatFormulaSource,
  parseFormulaSource,
  typeCheckFormulaExpression,
} from './formula-language.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_formula',
    key: 'formula',
    name: 'Formula fixtures',
    contract: {
      purpose: 'Type-check formulas',
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
          { id: 'prop_done', key: 'done', name: 'Done', type: 'checkbox' },
          { id: 'prop_progress', key: 'progress', name: 'Progress', type: 'number' },
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
        properties: [
          { id: 'prop_project_title', key: 'title', name: 'Title', type: 'title' },
          { id: 'prop_budget', key: 'budget', name: 'Budget', type: 'number' },
        ],
      },
    ],
  });
}

const functions = {
  round: { parameters: ['number'], resultType: 'number' },
  length: { parameters: ['list'], resultType: 'number' },
  map: { parameters: ['list', 'lambda'], resultType: 'list' },
} as const;

describe('Synapse Formula 1 source language', () => {
  test('parses precedence and comments, resolves properties, type-checks, and formats canonically', () => {
    const ast = compileFormulaSource(
      `// score in percent\nprop("done") ? 100 : round(prop("progress") * 100)`,
      {
        definition: definition(),
        sourceId: 'ds_tasks',
        resultType: 'number',
        functions,
      },
    );
    expect(ast).toMatchObject({
      resultType: 'number',
      expression: {
        type: 'conditional',
        condition: { type: 'property', propertyId: 'prop_done' },
        whenFalse: {
          type: 'call',
          function: 'round',
          arguments: [
            {
              type: 'binary',
              operator: 'multiply',
              left: { type: 'property', propertyId: 'prop_progress' },
            },
          ],
        },
      },
    });

    const formatted = formatFormulaSource(ast, {
      propertyReference: (propertyId) =>
        definition()
          .sources.flatMap((source) => source.properties)
          .find((property) => property.id === propertyId)?.key ?? null,
    });
    expect(formatted).toBe('prop("done") ? 100 : round(prop("progress") * 100)');
    expect(
      compileFormulaSource(formatted, {
        definition: definition(),
        sourceId: 'ds_tasks',
        functions,
      }),
    ).toEqual(ast);
    expect(serializeFormulaAst(ast)).toContain('"version":1');
  });

  test('normalizes relation traversal and method calls to stable property and call nodes', () => {
    const traversal = compileFormulaSource('prop("project").prop("budget") + 1', {
      definition: definition(),
      sourceId: 'ds_tasks',
      functions,
    });
    expect(traversal).toMatchObject({
      resultType: 'number',
      expression: {
        type: 'binary',
        left: {
          type: 'property',
          propertyId: 'prop_budget',
          record: { type: 'property', propertyId: 'prop_project' },
        },
      },
    });

    const method = compileFormulaSource('prop("tags").length()', {
      definition: definition(),
      sourceId: 'ds_tasks',
      functions,
    });
    expect(method.expression).toEqual({
      type: 'call',
      function: 'length',
      arguments: [{ type: 'property', propertyId: 'prop_tags' }],
    });
  });

  test('round-trips let, lambda, lists, dates, and right-associative power', () => {
    const source = 'let(scale, 2, offset, scale + 1, map([1, 2], x => x * offset))';
    const ast = compileFormulaSource(source, {
      definition: definition(),
      sourceId: 'ds_tasks',
      functions,
    });
    expect(ast.resultType).toBe('list');
    const formatted = formatFormulaSource(ast);
    expect(formatted).toBe('let(scale, 2, offset, scale + 1, map([1, 2], (x) => x * offset))');
    expect(
      compileFormulaSource(formatted, {
        definition: definition(),
        sourceId: 'ds_tasks',
        functions,
      }).expression,
    ).toEqual(ast.expression);

    expect(parseFormulaSource('2 ^ 3 ^ 2')).toMatchObject({
      type: 'binary',
      operator: 'power',
      right: { type: 'binary', operator: 'power' },
    });
    expect(parseFormulaSource('date("2026-07-20T12:00:00+09:00")')).toEqual({
      type: 'literal',
      valueType: 'date',
      value: '2026-07-20T12:00:00+09:00',
    });
    expect(formatFormulaSource(parseFormulaSource('not false or true and false'))).toBe(
      '!false || true && false',
    );
  });

  test('returns stable syntax and type failures instead of guessing', () => {
    expect(() => parseFormulaSource('1 +')).toThrow(FormulaSyntaxError);
    expect(() => parseFormulaSource('prop("missing")')).toThrow(FormulaSyntaxError);
    try {
      parseFormulaSource('1 + prop("missing")');
      throw new Error('expected unresolved property failure');
    } catch (error) {
      expect(error).toBeInstanceOf(FormulaSyntaxError);
      expect((error as FormulaSyntaxError).offset).toBeGreaterThan(0);
    }
    expect(() => parseFormulaSource('"unterminated')).toThrow(FormulaSyntaxError);
    expect(() => parseFormulaSource(`${'+'.repeat(65)}1`)).toThrow(FormulaSyntaxError);

    expect(() =>
      compileFormulaSource('prop("done") + 1', {
        definition: definition(),
        sourceId: 'ds_tasks',
        functions,
      }),
    ).toThrow(FormulaTypeError);
    expect(() =>
      compileFormulaSource('mystery(prop("progress"))', {
        definition: definition(),
        sourceId: 'ds_tasks',
      }),
    ).toThrow(FormulaTypeError);
    expect(() =>
      compileFormulaSource('prop("progress")', {
        definition: definition(),
        sourceId: 'ds_tasks',
        resultType: 'text',
      }),
    ).toThrow(FormulaTypeError);
  });

  test('reports property traversal scope and declared-result diagnostics structurally', () => {
    const wrongSource = typeCheckFormulaExpression(
      { type: 'property', propertyId: 'prop_budget' },
      { definition: definition(), sourceId: 'ds_tasks' },
      'text',
    );
    expect(wrongSource.ok).toBe(false);
    expect(wrongSource.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'property_scope_mismatch' }),
        expect.objectContaining({ code: 'result_type_mismatch' }),
      ]),
    );
  });
});
