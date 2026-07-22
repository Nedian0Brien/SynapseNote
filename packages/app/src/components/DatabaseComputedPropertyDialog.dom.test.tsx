import { afterEach, describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DatabaseComputedPropertyDialog } from './DatabaseComputedPropertyDialog';

const definition = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_computed_editor',
  key: 'computed_editor',
  name: 'Computed editor',
  contract: {
    purpose: 'Edit computed properties',
    canonicality: 'canonical',
    vocabulary: ['computed'],
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
          id: 'prop_double',
          key: 'double',
          name: 'Double',
          type: 'formula',
          source: 'prop("score") * 2',
          ast: {
            language: 'synapse-formula-1',
            version: 1,
            resultType: 'number',
            expression: {
              type: 'binary',
              operator: 'multiply',
              left: { type: 'property', propertyId: 'prop_score' },
              right: { type: 'literal', valueType: 'number', value: 2 },
            },
          },
        },
        {
          id: 'prop_project',
          key: 'project',
          name: 'Project',
          type: 'relation',
          targetSourceId: 'ds_projects',
          cardinality: 'many',
        },
        {
          id: 'prop_budget_sum',
          key: 'budget_sum',
          name: 'Budget sum',
          type: 'rollup',
          relationPropertyId: 'prop_project',
          targetPropertyId: 'prop_budget',
          function: 'sum',
          targetValueType: 'number',
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

afterEach(cleanup);

describe('DatabaseComputedPropertyDialog', () => {
  test('provides Formula references, validation, frozen-record preview, and canonical save', () => {
    const source = definition.sources[0];
    const property = source?.properties.find((candidate) => candidate.id === 'prop_double');
    if (!source || property?.type !== 'formula') throw new Error('invalid Formula fixture');
    const saved: unknown[] = [];
    render(
      <DatabaseComputedPropertyDialog
        open
        onOpenChange={() => {}}
        definition={definition}
        source={source}
        property={property}
        previewRecord={{
          id: 'rec_task',
          path: 'tasks/task.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'Task', prop_score: 3 },
        }}
        people={[]}
        relationRecords={[]}
        evaluationNow="2026-07-20T00:00:00.000Z"
        onSave={(next) => saved.push(next)}
      />,
    );

    expect(screen.getByText('Formula is valid')).not.toBeNull();
    expect(screen.getByText('Score · number')).not.toBeNull();
    expect(screen.getByText('number: 6')).not.toBeNull();

    const editor = screen.getByLabelText('Formula source');
    fireEvent.change(editor, { target: { value: 'prop("title") * 2' } });
    expect(screen.getByRole('alert').textContent).toContain('multiply requires number operands');
    expect(screen.getByRole('button', { name: 'Review change' }).hasAttribute('disabled')).toBe(
      true,
    );

    fireEvent.change(editor, { target: { value: 'prop("score")*3' } });
    expect(screen.getByText('number: 9')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(saved).toEqual([
      expect.objectContaining({
        id: property.id,
        source: 'prop("score") * 3',
        ast: expect.objectContaining({ resultType: 'number' }),
      }),
    ]);
  });

  test('validates a stable-ID Rollup configuration and previews the unsaved candidate', async () => {
    const source = definition.sources[0];
    const property = source?.properties.find((candidate) => candidate.id === 'prop_budget_sum');
    if (!source || property?.type !== 'rollup') throw new Error('invalid Rollup fixture');
    const saved: unknown[] = [];
    render(
      <DatabaseComputedPropertyDialog
        open
        onOpenChange={() => {}}
        definition={definition}
        source={source}
        property={property}
        previewRecord={{
          id: 'rec_task',
          path: 'tasks/task.md',
          revision: `sha256:${'a'.repeat(64)}`,
          values: { prop_title: 'Task', prop_budget_sum: 10 },
          computedResults: {
            prop_budget_sum: { kind: 'value', valueType: 'number', value: 10 },
          },
        }}
        people={[]}
        relationRecords={[]}
        evaluationNow="2026-07-20T00:00:00.000Z"
        loadComputedPreview={async (input) => ({
          databaseId: input.databaseId,
          sourceId: input.sourceId,
          recordId: input.recordId,
          propertyId: input.property.id,
          manifestRevision: `sha256:${'b'.repeat(64)}`,
          indexRevision: `sha256:${'c'.repeat(64)}`,
          evaluatedAt: '2026-07-20T00:00:00.000Z',
          permissionRevision: `sha256:${'d'.repeat(64)}`,
          result: { kind: 'value', valueType: 'number', value: 12 },
        })}
        onSave={(next) => saved.push(next)}
      />,
    );

    await waitFor(() => expect(screen.getByText('number: 12')).not.toBeNull());
    expect(screen.getByText(/Unsaved Rollup preview/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }));
    expect(saved).toEqual([
      expect.objectContaining({
        relationPropertyId: 'prop_project',
        targetPropertyId: 'prop_budget',
        function: 'sum',
        targetValueType: 'number',
      }),
    ]);
  });
});
