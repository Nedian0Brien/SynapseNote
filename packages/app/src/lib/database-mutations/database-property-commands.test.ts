import { describe, expect, it } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { DatabaseDesiredStateDraftSchema } from '@nedian0brien/synapsenote-server';

import {
  createDatabaseAddPropertyDesiredState,
  createDatabasePropertyDefinitionForAdd,
  DATABASE_ADDABLE_PROPERTY_TYPES,
  databasePropertyKeyFromName,
} from './database-property-commands';

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

/**
 * The pickers render `DATABASE_ADDABLE_PROPERTY_TYPES` directly, so a type
 * listed there but not seedable would ship as a column the user can choose and
 * the server then refuses. Validating against the draft schema the command
 * actually posts is what catches that here instead of at commit time — and it
 * is the right target rather than `DatabasePropertySchema`, because the server
 * mints property and option IDs that the draft deliberately omits.
 */
describe('DATABASE_ADDABLE_PROPERTY_TYPES', () => {
  it('seeds every offered type into a valid desired-state draft', () => {
    for (const type of DATABASE_ADDABLE_PROPERTY_TYPES) {
      const property = createDatabasePropertyDefinitionForAdd({
        name: 'Example',
        type,
        existingKeys: source.properties.map((candidate) => candidate.key),
      });
      const draft = createDatabaseAddPropertyDesiredState({
        database: definition,
        source,
        property,
      });
      const parsed = DatabaseDesiredStateDraftSchema.safeParse(draft);
      expect(parsed.success ? null : { type, issues: parsed.error.issues }).toBeNull();
    }
  });

  it('carries the type through to the seeded property', () => {
    for (const type of DATABASE_ADDABLE_PROPERTY_TYPES) {
      const property = createDatabasePropertyDefinitionForAdd({
        name: 'Example',
        type,
        existingKeys: [],
      });
      expect(property.type).toBe(type);
      expect(property.key).toBe('example');
    }
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
