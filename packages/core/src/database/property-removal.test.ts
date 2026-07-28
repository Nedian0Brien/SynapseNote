import { describe, expect, test } from 'bun:test';
import { pruneDatabasePropertyReferences } from './property-removal.ts';
import { type DatabaseDefinition, DatabaseDefinitionSchema } from './schema.ts';

const TITLE = 'prop_11111111111111111111111111111111';
const NOTES = 'prop_22222222222222222222222222222222';
const SOURCE = 'ds_11111111111111111111111111111111';

function definition(overrides?: { withFilter?: boolean }): DatabaseDefinition {
  return DatabaseDefinitionSchema.parse({
    version: 2,
    id: 'db_11111111111111111111111111111111',
    key: 'tasks',
    name: 'Tasks',
    contract: {
      purpose: 'Track tasks',
      canonicality: 'canonical',
      vocabulary: ['task'],
      freshness: { expectation: 'realtime' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: SOURCE,
        key: 'tasks',
        name: 'Tasks',
        recordMeaning: 'One task',
        folder: '.',
        storage: {
          kind: 'markdown_table',
          formatVersion: 2,
          owner: { path: 'tasks.md', blockId: 'dbb_11111111111111111111111111111111_primary' },
          titlePropertyId: TITLE,
          storedPropertyIds: [TITLE, NOTES],
        },
        properties: [
          { id: TITLE, key: 'title', name: 'Title', type: 'title' },
          { id: NOTES, key: 'notes', name: 'Notes', type: 'text' },
        ],
      },
    ],
    views: [
      {
        id: 'view_11111111111111111111111111111111',
        key: 'table',
        name: 'Table',
        sourceId: SOURCE,
        layout: {
          type: 'table',
          configuration: { propertyWidths: { [TITLE]: 200, [NOTES]: 160 } },
        },
        sort: [{ propertyId: NOTES, direction: 'asc' }],
        projection: { propertyIds: [TITLE, NOTES], body: 'hidden' },
        ...(overrides?.withFilter
          ? {
              where: { propertyId: NOTES, operator: 'is_not_empty' },
            }
          : {}),
      },
    ],
  });
}

describe('pruneDatabasePropertyReferences', () => {
  test('produces a definition the manifest schema still accepts', () => {
    const pruned = pruneDatabasePropertyReferences(definition(), SOURCE, NOTES);
    // The whole point: removing a property leaves dangling references that make
    // the definition invalid, and this is what the caller posts.
    expect(() => DatabaseDefinitionSchema.parse(pruned)).not.toThrow();
  });

  test('drops the column, the projection, the sort, and the stored width', () => {
    const pruned = pruneDatabasePropertyReferences(definition(), SOURCE, NOTES);
    const source = pruned.sources[0];
    const view = pruned.views[0];
    expect(source?.properties.map((property) => property.id)).toEqual([TITLE]);
    expect(source?.storage?.kind === 'markdown_table' && source.storage.storedPropertyIds).toEqual([
      TITLE,
    ]);
    expect(view?.projection.propertyIds).toEqual([TITLE]);
    expect(view?.sort).toEqual([]);
    expect(
      view?.layout.type === 'table' ? view.layout.configuration.propertyWidths : undefined,
    ).toEqual({ [TITLE]: 200 });
  });

  test('leaves a filter alone, so the schema refuses instead of silently changing the view', () => {
    const pruned = pruneDatabasePropertyReferences(definition({ withFilter: true }), SOURCE, NOTES);
    // Dropping a filter would change which rows the view shows. That is the
    // user's call, so this must surface as a refusal rather than an edit.
    expect(() => DatabaseDefinitionSchema.parse(pruned)).toThrow(/outside source/);
  });

  test('leaves other sources and their views untouched', () => {
    const base = definition();
    const pruned = pruneDatabasePropertyReferences(base, 'ds_other', NOTES);
    expect(pruned.sources[0]?.properties).toHaveLength(2);
    expect(pruned.views[0]?.projection.propertyIds).toEqual([TITLE, NOTES]);
  });
});
