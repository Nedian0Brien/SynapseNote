import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import {
  compileFormulaSource,
  DatabaseDefinitionSchema,
  pruneDatabasePropertyReferences,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';

import { databaseDraftBase } from './database-desired-state-base';
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
const EMPTY_FORMULA_SOURCE = '""';

/** Title the seeded Button writes, so its one click produces something visible. */
const SEEDED_BUTTON_RECORD_TITLE = 'New record';

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

/** Adds a new schema property. The server mints its stable ID on commit. */
export function createDatabaseAddPropertyDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: { key: string; name: string; type: DatabasePropertyType } & Record<string, unknown>;
  viewId?: string;
  insertBeforePropertyId?: string;
  insertAfterPropertyId?: string;
}): DatabaseDesiredStateDraftInput {
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  if (!currentSource) throw new Error('The selected source is unavailable');
  if (currentSource.properties.some((property) => property.key === input.property.key)) {
    throw new Error(`A property with the key "${input.property.key}" already exists`);
  }
  const base = databaseDraftBase(input.database);
  const propertyKeyById = new Map(
    currentSource.properties.map((property) => [property.id, property.key] as const),
  );
  const baseViews = base.views ?? [];
  const sourcePropertyIndex = currentSource.properties.findIndex((candidate) =>
    input.insertBeforePropertyId
      ? candidate.id === input.insertBeforePropertyId
      : input.insertAfterPropertyId
        ? candidate.id === input.insertAfterPropertyId
        : false,
  );
  const sourceInsertIndex =
    sourcePropertyIndex < 0
      ? currentSource.properties.length
      : sourcePropertyIndex + (input.insertAfterPropertyId ? 1 : 0);
  const views = input.viewId
    ? baseViews.map((view) => {
        if (view.id !== input.viewId || view.sourceKey !== currentSource.key) return view;
        const rawProjection =
          view.projection && typeof view.projection === 'object'
            ? (view.projection as Record<string, unknown>)
            : null;
        if (!rawProjection) return view;
        const existingIds = Array.isArray(rawProjection.propertyIds)
          ? rawProjection.propertyIds.map(String)
          : null;
        const existingKeys = Array.isArray(rawProjection.propertyKeys)
          ? rawProjection.propertyKeys.map(String)
          : (existingIds
              ?.map((propertyId) => propertyKeyById.get(propertyId))
              .filter((key): key is string => key !== undefined) ?? null);
        // A view without an explicit projection already renders every property;
        // leave that compact/default representation untouched.
        if (!existingKeys || existingKeys.includes(input.property.key)) return view;
        const { propertyIds: _propertyIds, propertyKeys: _propertyKeys, ...rest } = rawProjection;
        const targetProperty = currentSource.properties.find((candidate) =>
          input.insertBeforePropertyId
            ? candidate.id === input.insertBeforePropertyId
            : input.insertAfterPropertyId
              ? candidate.id === input.insertAfterPropertyId
              : false,
        );
        const targetKeyIndex = targetProperty ? existingKeys.indexOf(targetProperty.key) : -1;
        const projectionInsertIndex =
          targetKeyIndex < 0
            ? existingKeys.length
            : targetKeyIndex + (input.insertAfterPropertyId ? 1 : 0);
        const nextPropertyKeys = [...existingKeys];
        nextPropertyKeys.splice(projectionInsertIndex, 0, input.property.key);
        return {
          ...view,
          projection: {
            ...rest,
            propertyKeys: nextPropertyKeys,
          },
        };
      })
    : baseViews;
  return {
    ...base,
    views,
    sources: base.sources.map((source) =>
      source.key === currentSource.key
        ? {
            ...source,
            properties: [
              ...source.properties.slice(0, sourceInsertIndex),
              input.property,
              ...source.properties.slice(sourceInsertIndex),
            ],
          }
        : source,
    ),
    sampleRecords: [],
    recordMutations: [],
  };
}

/** Duplicate a non-Title property's configuration under a new stable key. */
export function createDatabaseDuplicatePropertyDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: DatabaseProperty;
  name?: string;
  viewId?: string;
}): DatabaseDesiredStateDraftInput {
  if (input.property.type === 'title') {
    throw new Error('The Title property cannot be duplicated');
  }
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (!currentSource || !currentProperty) {
    throw new Error('The property is outside the selected source');
  }
  const name = (input.name?.trim() || `${currentProperty.name} copy`).trim();
  if (!name) throw new Error('A duplicated property name is required');
  const { id: _id, key: _key, name: _name, ...configuration } = currentProperty;
  return createDatabaseAddPropertyDesiredState({
    database: input.database,
    source: currentSource,
    ...(input.viewId ? { viewId: input.viewId } : {}),
    property: {
      ...configuration,
      key: databasePropertyKeyFromName(
        name,
        currentSource.properties.map((property) => property.key),
      ),
      name,
      type: currentProperty.type,
    },
  });
}

/** Renames one property without changing its stable ID, key, type, or values. */
export function createDatabaseRenamePropertyDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: DatabaseProperty;
  name: string;
}): DatabaseDesiredStateDraftInput {
  const name = input.name.trim();
  if (!name) throw new Error('A property name is required');
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (!currentSource || !currentProperty) {
    throw new Error('The property is outside the selected source');
  }
  if (
    currentSource.properties.some(
      (property) => property.id !== currentProperty.id && property.name === name,
    )
  ) {
    throw new Error(`A property named "${name}" already exists`);
  }
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((source) =>
      source.id === currentSource.id
        ? {
            ...source,
            properties: source.properties.map((property) =>
              property.id === currentProperty.id ? { ...property, name } : property,
            ),
          }
        : source,
    ),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

/**
 * Removing a schema property is split into two desired states committed in
 * sequence, never one:
 *
 * 1. `createDatabaseUnsetPropertyValuesDesiredState` patches every affected
 *    record via `recordMutations`/`unset` WHILE the property still exists in
 *    the schema. A `recordMutations` patch preserves the record body.
 * 2. `createDatabaseRemovePropertyDesiredState` then drops the now-unused
 *    property from the schema with no record changes at all.
 *
 * A single combined desired state cannot do this safely: `recordMutations`
 * validates `propertyKey` against the FINAL schema, so it cannot reference a
 * property removed in the same submission, and the alternative — an
 * `unset` via a `sampleRecords` full-record upsert — requires `body`, which
 * `ProjectedDatabaseRecord` never carries; omitting it silently truncates
 * the record to an empty body. Both failure modes are exercised in
 * `database-commit.test.ts`.
 */
export function createDatabaseUnsetPropertyValuesDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: DatabaseProperty;
  records: readonly ProjectedDatabaseRecord[];
  recordsComplete: boolean;
}): DatabaseDesiredStateDraftInput | null {
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (!currentSource || !currentProperty) {
    throw new Error('The property is outside the selected source');
  }
  if (!input.recordsComplete) {
    throw new Error('Removing a property requires a complete source snapshot');
  }
  const recordMutations = input.records
    .filter((record) => record.values[currentProperty.id] !== undefined)
    .map((record) => {
      if (!record.revision) {
        throw new Error(`Record ${record.id} cannot be migrated without an exact revision`);
      }
      return {
        id: record.id,
        expectedRevision: record.revision,
        sourceKey: currentSource.key,
        operations: [{ op: 'unset' as const, propertyKey: currentProperty.key }],
      };
    });
  if (recordMutations.length === 0) return null;
  return {
    ...databaseDraftBase(input.database),
    policy: {
      mode: 'review',
      allowedOperations: [],
      maxRecordsPerCommit: Math.max(1, recordMutations.length),
    },
    sampleRecords: [],
    recordMutations,
  };
}

/**
 * Drops a schema property. Callers must first commit
 * `createDatabaseUnsetPropertyValuesDesiredState` (if it returned non-null)
 * so no record still holds a value under this property — otherwise the
 * server refuses the plan with `source_record_migration_required`.
 */
export function createDatabaseRemovePropertyDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: DatabaseProperty;
}): DatabaseDesiredStateDraftInput {
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (!currentSource || !currentProperty) {
    throw new Error('The property is outside the selected source');
  }
  if (currentProperty.type === 'title') throw new Error('The Title property cannot be removed');
  if (currentSource.properties.length <= 1) {
    throw new Error('A source requires at least one property');
  }
  // Dropping the property from `properties` alone leaves the definition
  // referring to something that no longer exists — the owner-table column set
  // and the view projection both still name it, and the manifest schema refuses
  // that. Pruning lives in core, next to the schema that defines the reference
  // surface, so the two cannot drift.
  const definition = DatabaseDefinitionSchema.parse(
    pruneDatabasePropertyReferences(input.database, currentSource.id, currentProperty.id),
  );
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

/** Reorders every property of one source. `orderedPropertyIds` must be a permutation of the current IDs. */
export function createDatabaseReorderPropertiesDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  orderedPropertyIds: readonly string[];
}): DatabaseDesiredStateDraftInput {
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  if (!currentSource) throw new Error('The selected source is unavailable');
  const byId = new Map(
    currentSource.properties.map((property) => [property.id, property] as const),
  );
  if (
    input.orderedPropertyIds.length !== currentSource.properties.length ||
    new Set(input.orderedPropertyIds).size !== currentSource.properties.length ||
    !input.orderedPropertyIds.every((id) => byId.has(id))
  ) {
    throw new Error('Reordering must include every existing property exactly once');
  }
  const titleProperty = currentSource.properties.find((property) => property.type === 'title');
  if (titleProperty && input.orderedPropertyIds[0] !== titleProperty.id) {
    throw new Error('The Title property must remain first');
  }
  const reordered = input.orderedPropertyIds.map((id) => {
    const property = byId.get(id);
    if (!property) throw new Error('Reordering references an unknown property');
    return property;
  });
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((source) =>
      source.id === currentSource.id ? { ...source, properties: reordered } : source,
    ),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}
