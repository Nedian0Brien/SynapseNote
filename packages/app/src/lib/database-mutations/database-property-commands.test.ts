import { describe, expect, it } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { DatabaseDesiredStateDraftSchema } from '@nedian0brien/synapsenote-server';
import {
  createDatabasePropertyDefinitionForAdd,
  DATABASE_ADDABLE_PROPERTY_TYPES,
  databaseAddablePropertyTypes,
  databasePropertyKeyFromName,
} from './database-property-catalog';
import { createDatabaseAddPropertyDesiredState } from './database-property-commands';

const definition = DatabaseDefinitionSchema.parse({
  version: 1,
  id: 'db_property_picker',
  key: 'property_picker',
  name: 'Property picker',
  contract: {
    purpose: 'Exercise the property picker seeds',
    canonicality: 'canonical',
    vocabulary: ['picker'],
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
      properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
    },
  ],
});

const source = definition.sources.find((candidate) => candidate.id === 'ds_tasks');
if (!source) throw new Error('fixture source missing');

/** Same fixture, plus a self-relation, so rollup has something to point at. */
function relationDefinition() {
  return DatabaseDefinitionSchema.parse({
    ...structuredClone(definition),
    sources: [
      {
        ...structuredClone(source),
        properties: [
          ...structuredClone(source.properties),
          {
            id: 'prop_parent',
            key: 'parent',
            name: 'Parent',
            type: 'relation',
            targetSourceId: 'ds_tasks',
            cardinality: 'many',
          },
        ],
      },
    ],
  });
}

function seedsValidDraft(
  db: typeof definition,
  src: typeof source,
  type: Parameters<typeof createDatabasePropertyDefinitionForAdd>[0]['type'],
) {
  const property = createDatabasePropertyDefinitionForAdd({
    name: 'Example',
    type,
    existingKeys: src.properties.map((candidate) => candidate.key),
    database: db,
    source: src,
  });
  expect(property.type).toBe(type);
  expect(property.key).toBe('example');
  const draft = createDatabaseAddPropertyDesiredState({ database: db, source: src, property });
  const parsed = DatabaseDesiredStateDraftSchema.safeParse(draft);
  expect(parsed.success ? null : { type, issues: parsed.error.issues }).toBeNull();
}

/**
 * The pickers render this list directly, so a type listed there but not
 * seedable would ship as a column the user can choose and the server then
 * refuses. Validating against the draft schema the command actually posts is
 * what catches that here instead of at commit time — and it is the right
 * target rather than `DatabasePropertySchema`, because the server mints
 * property and option IDs that the draft deliberately omits.
 */
describe('DATABASE_ADDABLE_PROPERTY_TYPES', () => {
  it('seeds every type offered for a source without a relation', () => {
    for (const type of databaseAddablePropertyTypes(source.properties)) {
      seedsValidDraft(definition, source, type);
    }
  });

  it('seeds rollup once the source has a relation to summarise through', () => {
    const withRelation = relationDefinition();
    const relationSource = withRelation.sources.find((candidate) => candidate.id === 'ds_tasks');
    if (!relationSource) throw new Error('fixture source missing');
    const offered = databaseAddablePropertyTypes(relationSource.properties);
    expect(offered).toContain('rollup');
    seedsValidDraft(withRelation, relationSource, 'rollup');
  });

  it('hides rollup while no relation exists, rather than offering a dead end', () => {
    expect(databaseAddablePropertyTypes(source.properties)).not.toContain('rollup');
    expect(() =>
      createDatabasePropertyDefinitionForAdd({
        name: 'Example',
        type: 'rollup',
        existingKeys: [],
        database: definition,
        source,
      }),
    ).toThrow(/needs a Relation/);
  });

  it('seeds a relation pointing at its own source, which is always valid', () => {
    const property = createDatabasePropertyDefinitionForAdd({
      name: 'Parent',
      type: 'relation',
      existingKeys: [],
      database: definition,
      source,
    });
    expect(property.targetSourceId).toBe(source.id);
  });

  it('never offers title, which every source already owns and freezes', () => {
    expect(DATABASE_ADDABLE_PROPERTY_TYPES).not.toContain('title');
  });

  it('lists each type once', () => {
    expect(new Set(DATABASE_ADDABLE_PROPERTY_TYPES).size).toBe(
      DATABASE_ADDABLE_PROPERTY_TYPES.length,
    );
  });
});

describe('databasePropertyKeyFromName', () => {
  it('derives a stable key and disambiguates against existing keys', () => {
    expect(databasePropertyKeyFromName('Due date', [])).toBe('due_date');
    expect(databasePropertyKeyFromName('Due date', ['due_date'])).toBe('due_date_2');
  });

  it('prefixes keys that would not start with a letter', () => {
    expect(databasePropertyKeyFromName('2024 target', [])).toBe('property_2024_target');
  });
});
