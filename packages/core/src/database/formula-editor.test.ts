import { describe, expect, test } from 'bun:test';
import { analyzeFormulaEditor, buildFormulaEditorSuggestions } from './formula-editor.ts';
import { formulaValueResult } from './formula-result.ts';
import { DatabaseDefinitionSchema } from './schema.ts';

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_formula_editor',
    key: 'formula_editor',
    name: 'Formula editor',
    contract: {
      purpose: 'Edit formulas',
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
          { id: 'prop_progress', key: 'progress', name: 'Progress', type: 'number' },
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

describe('Formula editor assistance', () => {
  test('returns stable property/function completions with insertion text', () => {
    const suggestions = buildFormulaEditorSuggestions(definition(), 'ds_tasks', 'prog');
    expect(suggestions).toEqual([
      {
        kind: 'property',
        label: 'Progress',
        insertText: 'prop("progress")',
        detail: 'number · prop_progress',
        propertyId: 'prop_progress',
      },
    ]);
    expect(
      buildFormulaEditorSuggestions(definition(), 'ds_tasks').some(
        (entry) => entry.label === 'map',
      ),
    ).toBe(true);
  });

  test('compiles, lists references, formats canonically, and previews one snapshot', () => {
    const analysis = analyzeFormulaEditor({
      source: 'round(prop("progress") * 1.5)',
      definition: definition(),
      sourceId: 'ds_tasks',
      resultType: 'number',
      preview: {
        context: {
          now: '2026-07-20T00:00:00.000Z',
          timeZone: 'Asia/Seoul',
          locale: 'en-US',
        },
        resolveProperty: () => formulaValueResult('number', 3),
      },
    });

    expect(analysis.valid).toBe(true);
    expect(analysis.canonicalSource).toBe('round(prop("progress") * 1.5)');
    expect(analysis.references).toEqual([
      {
        propertyId: 'prop_progress',
        sourceId: 'ds_tasks',
        key: 'progress',
        name: 'Progress',
        propertyType: 'number',
      },
    ]);
    expect(analysis.preview).toEqual(formulaValueResult('number', 5));
    expect(analysis.diagnostics).toEqual([]);
  });

  test('resolves relation references and returns source-located syntax/type diagnostics', () => {
    const related = analyzeFormulaEditor({
      source: 'prop("project").prop("budget")',
      definition: definition(),
      sourceId: 'ds_tasks',
    });
    expect(related.references.map((reference) => reference.propertyId)).toEqual([
      'prop_budget',
      'prop_project',
    ]);

    const syntax = analyzeFormulaEditor({
      source: '1 +\n)',
      definition: definition(),
      sourceId: 'ds_tasks',
    });
    expect(syntax).toMatchObject({
      valid: false,
      diagnostics: [{ phase: 'syntax', code: 'syntax_error', line: 2, column: 1 }],
    });

    const type = analyzeFormulaEditor({
      source: 'prop("title") * 2',
      definition: definition(),
      sourceId: 'ds_tasks',
    });
    expect(type.valid).toBe(false);
    expect(type.diagnostics).toEqual([
      expect.objectContaining({ phase: 'type', code: 'type_mismatch', path: ['expression'] }),
    ]);
  });
});
