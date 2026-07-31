import type {
  DatabaseDefinition,
  DatabasePropertyType,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { compileFormulaSource } from '@nedian0brien/synapsenote-core';

export function databasePropertyKeyFromName(name: string, existingKeys: readonly string[]): string {
  const base =
    name
      .trim()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+/, '')
      .replace(/_+$/, '')
      .slice(0, 100) || 'property';
  const normalized = /^[a-z]/.test(base) ? base : `property_${base}`;
  const taken = new Set(existingKeys);
  if (!taken.has(normalized)) return normalized;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${normalized}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Property types the human "add property" pickers offer, grouped in Notion's
 * menu order. This is the single source the three pickers render — the table
 * header popover, the Manage properties dialog, and the inline block popover —
 * which previously each carried their own copy of the same eleven entries.
 *
 * Every entry must be one `createDatabasePropertyDefinitionForAdd` can seed
 * into a valid draft with no further input; that pairing is the whole contract
 * of this list, and `database-property-commands.test.ts` asserts it per entry
 * rather than trusting the two to stay in step.
 *
 * `title` is absent on purpose: every source already has exactly one and it is
 * frozen. A type must arrive here with both a seed AND a way to reconfigure
 * what was seeded, or the user gets a column they can create and cannot fix.
 */
export const DATABASE_ADDABLE_PROPERTY_GROUPS = [
  {
    id: 'basic',
    label: 'Basic',
    types: [
      'text',
      'number',
      'select',
      'status',
      'multi_select',
      'date',
      'person',
      'files',
      'checkbox',
      'url',
      'email',
      'phone',
      'place',
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    types: ['relation', 'rollup', 'formula', 'button', 'unique_id', 'verification'],
  },
  {
    id: 'metadata',
    label: 'Record metadata',
    types: ['created_time', 'created_by', 'last_edited_time', 'last_edited_by'],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  types: readonly DatabasePropertyType[];
}[];

/**
 * The addable groups for one source, with the types it cannot support yet
 * removed.
 *
 * Only `rollup` is conditional: it summarises values reached THROUGH a
 * relation, so with no relation property in the source there is nothing for it
 * to point at and no default that would mean anything. Offering it anyway would
 * hand back a column the user cannot complete.
 */
export function databaseAddablePropertyGroups(
  properties: readonly { type: DatabasePropertyType }[],
): readonly { id: string; label: string; types: readonly DatabasePropertyType[] }[] {
  const hasRelation = properties.some((property) => property.type === 'relation');
  if (hasRelation) return DATABASE_ADDABLE_PROPERTY_GROUPS;
  return DATABASE_ADDABLE_PROPERTY_GROUPS.map((group) => ({
    ...group,
    types: group.types.filter((type) => type !== 'rollup'),
  }));
}

/** Flattened {@link databaseAddablePropertyGroups}, for the flat dropdown pickers. */
export function databaseAddablePropertyTypes(
  properties: readonly { type: DatabasePropertyType }[],
): readonly DatabasePropertyType[] {
  return databaseAddablePropertyGroups(properties).flatMap((group) => group.types);
}

/** Every type the pickers can ever offer, ignoring per-source availability. */
export const DATABASE_ADDABLE_PROPERTY_TYPES: readonly DatabasePropertyType[] =
  DATABASE_ADDABLE_PROPERTY_GROUPS.flatMap((group) => group.types);

/** Seeded formula body: an empty text literal, which compiles and evaluates. */
export const EMPTY_FORMULA_SOURCE = '""';

/** Title the seeded Button writes, so its one click produces something visible. */
export const SEEDED_BUTTON_RECORD_TITLE = 'New record';

/**
 * Action ids are stable keys scoped to one Button, so the first step can carry
 * a fixed one. {@link nextDatabaseButtonActionId} continues the series.
 */
export const DATABASE_BUTTON_FIRST_ACTION_ID = 'step_1';

/** Lowest `step_N` not already taken, so ids stay stable across reorders. */
export function nextDatabaseButtonActionId(takenIds: readonly string[]): string {
  const taken = new Set(takenIds);
  for (let index = 1; ; index += 1) {
    const candidate = `step_${index}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Builds the schema fragment used by the human Notion-style property picker.
 * Select-like properties need one option in the canonical manifest even when
 * the user has not entered any cell values yet, so seed an inert first option
 * that remains editable through the normal property configuration surface.
 *
 * The configurable types seed a valid, inert starting point and rely on their
 * editor to refine it, which is how Notion behaves: picking Formula gives you
 * an empty formula and opens the editor, not a modal that blocks creation.
 */
export function createDatabasePropertyDefinitionForAdd(input: {
  name: string;
  type: DatabasePropertyType;
  existingKeys: readonly string[];
  database: DatabaseDefinition;
  source: DatabaseSource;
  /** Relation only: where the new relation points. Defaults to this source. */
  relationTarget?: { databaseId: string; sourceId: string };
}): { key: string; name: string; type: DatabasePropertyType } & Record<string, unknown> {
  const key = databasePropertyKeyFromName(input.name, input.existingKeys);
  if (input.type === 'relation') {
    // Defaults to a self-relation — the one target guaranteed to exist, and the
    // shape Notion's sub-items use — unless the picker chose another database.
    // `targetDatabaseId` is omitted for a same-database target so the manifest
    // keeps the form every relation had before cross-database ones existed.
    const target = input.relationTarget;
    const targetDatabaseId = target?.databaseId ?? input.database.id;
    return {
      key,
      name: input.name,
      type: input.type,
      targetSourceId: target?.sourceId ?? input.source.id,
      ...(targetDatabaseId === input.database.id ? {} : { targetDatabaseId }),
      cardinality: 'many',
    };
  }
  if (input.type === 'formula') {
    return {
      key,
      name: input.name,
      type: input.type,
      source: EMPTY_FORMULA_SOURCE,
      ast: compileFormulaSource(EMPTY_FORMULA_SOURCE, {
        definition: input.database,
        sourceId: input.source.id,
      }),
    };
  }
  if (input.type === 'rollup') {
    const relation = input.source.properties.find((property) => property.type === 'relation');
    if (!relation || relation.type !== 'relation') {
      throw new Error('A Rollup needs a Relation property to summarise through');
    }
    const target = input.database.sources.find(
      (candidate) => candidate.id === relation.targetSourceId,
    );
    const targetProperty = target?.properties.find((property) => property.type === 'title');
    if (!targetProperty) {
      throw new Error(`Relation "${relation.name}" points at a source without a Title`);
    }
    // `count_all` ignores the target value entirely, so it is the one default
    // that is meaningful for any relation before the user has chosen anything.
    return {
      key,
      name: input.name,
      type: input.type,
      relationPropertyId: relation.id,
      targetPropertyId: targetProperty.id,
      function: 'count_all',
      targetValueType: 'text',
    };
  }
  if (input.type === 'button') {
    // A Button is a control, not a value, so the manifest requires at least one
    // action up front. Creating a record in this same source is Notion's own
    // archetype ("Add a task"), it touches nothing that already exists, and its
    // effect is visible the moment it is clicked — which is what makes the
    // seeded default explainable before `DatabaseButtonPropertyDialog` refines
    // it.
    const title = input.source.properties.find((property) => property.type === 'title');
    if (!title) throw new Error('A Button needs a Title property to seed its first action');
    // `create_record` must supply every required property that has no default.
    // Nothing in the app marks a property required except Title, so this only
    // fires on a hand-authored manifest — but seeding an action the manifest
    // will reject is worse than saying why it cannot be seeded.
    const blocking = input.source.properties.find(
      (property) =>
        property.required &&
        property.type !== 'title' &&
        property.semantics.defaultValue === undefined,
    );
    if (blocking) {
      throw new Error(
        `A Button cannot create records here until "${blocking.name}" has a default value`,
      );
    }
    return {
      key,
      name: input.name,
      type: input.type,
      label: input.name,
      actions: [
        {
          id: DATABASE_BUTTON_FIRST_ACTION_ID,
          kind: 'create_record',
          sourceId: input.source.id,
          values: { [title.id]: SEEDED_BUTTON_RECORD_TITLE },
          body: '',
        },
      ],
    };
  }
  if (input.type === 'select' || input.type === 'multi_select') {
    return {
      key,
      name: input.name,
      type: input.type,
      options: [{ key: 'option_1', name: 'Option 1' }],
    };
  }
  if (input.type === 'place') {
    return {
      key,
      name: input.name,
      type: input.type,
      externalSearch: 'disabled',
      externalMap: 'disabled',
    };
  }
  if (input.type === 'unique_id') {
    // Both fields are required by the manifest and neither has a schema
    // default. An empty prefix renders the bare counter (Notion's own default);
    // `DatabaseUniqueIdPropertyDialog` edits it afterwards.
    return { key, name: input.name, type: input.type, prefix: '', nextNumber: 1 };
  }
  return { key, name: input.name, type: input.type };
}
