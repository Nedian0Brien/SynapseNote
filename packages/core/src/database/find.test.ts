import { describe, expect, test } from 'bun:test';
import { compileDatabaseFind } from './find.ts';
import { DatabaseSourceSchema } from './schema.ts';

const source = DatabaseSourceSchema.parse({
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', aliases: ['task'], type: 'title' },
    { id: 'prop_score', key: 'score', name: 'Priority score', type: 'number' },
    {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'opt_todo', key: 'todo', name: 'Todo' },
        { id: 'opt_done', key: 'done', name: 'Done' },
      ],
    },
    { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
  ],
});

describe('compileDatabaseFind', () => {
  test('compiles typed filters, canonical option IDs, sort, and limit visibly', () => {
    const plan = compileDatabaseFind(source, {
      text: 'find status is Done and priority score at least 5 sort by score descending top 10',
    });
    expect(plan.interpretation).toMatchObject({
      requiresResolution: false,
      confidence: 'high',
      limit: 10,
      filters: [
        { propertyId: 'prop_status', operator: 'eq', value: 'opt_done' },
        { propertyId: 'prop_score', operator: 'gte', value: 5 },
      ],
      sorts: [{ propertyId: 'prop_score', direction: 'desc' }],
    });
    expect(plan.query).toMatchObject({
      where: {
        and: [
          { propertyId: 'prop_status', operator: 'eq', value: 'opt_done' },
          { propertyId: 'prop_score', operator: 'gte', value: 5 },
        ],
      },
      page: { limit: 10 },
    });
  });

  test('turns residual prose into an inspectable OR across searchable properties', () => {
    const plan = compileDatabaseFind(source, { text: 'customer escalation' });
    expect(plan.interpretation).toMatchObject({
      confidence: 'medium',
      freeText: {
        text: 'customer escalation',
        searchedPropertyIds: ['prop_title', 'prop_notes'],
      },
    });
    expect(plan.query?.where).toEqual({
      or: [
        { propertyId: 'prop_title', operator: 'contains', value: 'customer escalation' },
        { propertyId: 'prop_notes', operator: 'contains', value: 'customer escalation' },
      ],
    });
  });

  test('refuses invalid coercion instead of silently guessing', () => {
    const plan = compileDatabaseFind(source, { text: 'priority score at least urgent' });
    expect(plan.query).toBeNull();
    expect(plan.interpretation).toMatchObject({
      requiresResolution: true,
      confidence: 'low',
      warnings: [
        {
          code: 'invalid_property_value',
          candidates: [{ id: 'prop_score', key: 'score' }],
        },
      ],
    });
  });

  test('returns all property candidates when an alias is ambiguous', () => {
    const ambiguous = DatabaseSourceSchema.parse({
      ...source,
      properties: source.properties.map((property) =>
        property.id === 'prop_notes' ? { ...property, aliases: ['task'] } : property,
      ),
    });
    const plan = compileDatabaseFind(ambiguous, { text: 'task contains alpha' });
    expect(plan.query).toBeNull();
    expect(plan.interpretation.warnings[0]).toMatchObject({
      code: 'ambiguous_property',
      candidates: [{ id: 'prop_title' }, { id: 'prop_notes' }],
    });
  });
});
