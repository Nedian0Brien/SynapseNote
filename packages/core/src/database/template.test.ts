import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from './schema.ts';
import {
  applyDatabaseTemplate,
  orderedDatabaseTemplates,
  resolveDatabaseTemplate,
} from './template.ts';

function definition() {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: 'db_work',
    key: 'work',
    name: 'Work',
    contract: {
      purpose: 'Track work',
      canonicality: 'canonical',
      vocabulary: ['work'],
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
          {
            id: 'prop_priority',
            key: 'priority',
            name: 'Priority',
            type: 'select',
            semantics: {
              inferencePolicy: 'explicit_only',
              sensitivity: 'inherit',
              defaultValue: 'normal',
            },
            options: [
              { id: 'opt_normal', key: 'normal', name: 'Normal' },
              { id: 'opt_high', key: 'high', name: 'High' },
            ],
          },
        ],
      },
    ],
    views: [
      {
        id: 'view_inbox',
        key: 'inbox',
        name: 'Inbox',
        sourceId: 'ds_tasks',
        layout: {
          type: 'table',
          configuration: { rowHeight: 'standard', wrap: false, propertyWidths: {} },
        },
        projection: { propertyIds: ['prop_title', 'prop_priority'], body: 'hidden' },
      },
    ],
    templates: [
      {
        id: 'tpl_default',
        key: 'default-task',
        name: 'Default task',
        sourceId: 'ds_tasks',
        propertyValues: { prop_priority: 'opt_high' },
        body: '## Steps\n',
        order: 1,
        defaultFor: { source: true },
      },
      {
        id: 'tpl_capture',
        key: 'quick-capture',
        name: 'Quick capture',
        sourceId: 'ds_tasks',
        body: '- [ ] Triage\n',
        order: 0,
        defaultFor: { entryPoints: ['quick_capture'] },
      },
      {
        id: 'tpl_inbox',
        key: 'inbox-task',
        name: 'Inbox task',
        sourceId: 'ds_tasks',
        body: 'Inbox',
        order: 2,
        defaultFor: { viewIds: ['view_inbox'] },
      },
    ],
  });
}

describe('database record templates', () => {
  test('resolves explicit, entry-point, view, then source defaults', () => {
    const database = definition();
    expect(
      resolveDatabaseTemplate(database, { sourceId: 'ds_tasks', entryPoint: 'quick_capture' })?.id,
    ).toBe('tpl_capture');
    expect(
      resolveDatabaseTemplate(database, { sourceId: 'ds_tasks', viewId: 'view_inbox' })?.id,
    ).toBe('tpl_inbox');
    expect(resolveDatabaseTemplate(database, { sourceId: 'ds_tasks' })?.id).toBe('tpl_default');
    expect(
      resolveDatabaseTemplate(database, { sourceId: 'ds_tasks', templateId: 'tpl_capture' })?.id,
    ).toBe('tpl_capture');
  });

  test('merges property, template, and caller defaults without replacing an explicit body', () => {
    const applied = applyDatabaseTemplate(definition(), {
      sourceId: 'ds_tasks',
      values: { prop_title: 'Ship it' },
    });
    expect(applied).toEqual({
      templateId: 'tpl_default',
      values: { prop_priority: 'opt_high', prop_title: 'Ship it' },
      body: '## Steps\n',
    });
    expect(applyDatabaseTemplate(definition(), { sourceId: 'ds_tasks', body: '' }).body).toBe('');
  });

  test('orders active templates and rejects competing defaults or archived defaults', () => {
    const database = definition();
    expect(orderedDatabaseTemplates(database, 'ds_tasks').map((template) => template.id)).toEqual([
      'tpl_capture',
      'tpl_default',
      'tpl_inbox',
    ]);
    expect(
      DatabaseDefinitionSchema.safeParse({
        ...database,
        templates: [
          ...database.templates,
          { ...database.templates[0], id: 'tpl_other', key: 'other' },
        ],
      }).success,
    ).toBe(false);
    expect(
      DatabaseDefinitionSchema.safeParse({
        ...database,
        templates: database.templates.map((template) =>
          template.id === 'tpl_default'
            ? { ...template, archivedAt: '2026-07-21T01:00:00.000Z' }
            : template,
        ),
      }).success,
    ).toBe(false);
  });
});
