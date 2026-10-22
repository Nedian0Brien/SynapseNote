import type {
  DatabaseDefinition,
  DatabaseNumberVisualization,
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';

import { databaseDraftBase } from './database-desired-state-base';

function databasePropertyKeyFromName(name: string, existingKeys: readonly string[]): string {
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
 * Builds the schema fragment used by the human Notion-style property picker.
 * Select-like properties need one option in the canonical manifest even when
 * the user has not entered any cell values yet, so seed an inert first option
 * that remains editable through the normal property configuration surface.
 */
export function createDatabasePropertyDefinitionForAdd(input: {
  name: string;
  type: DatabasePropertyType;
  existingKeys: readonly string[];
}): { key: string; name: string; type: DatabasePropertyType } & Record<string, unknown> {
  const key = databasePropertyKeyFromName(input.name, input.existingKeys);
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

/** Updates presentation-only settings for one Number property. */
export function createDatabaseNumberVisualizationDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: Extract<DatabaseProperty, { type: 'number' }>;
  visualization: DatabaseNumberVisualization;
}): DatabaseDesiredStateDraftInput {
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property): property is Extract<DatabaseProperty, { type: 'number' }> =>
      property.id === input.property.id && property.type === 'number',
  );
  if (!currentSource || !currentProperty) {
    throw new Error('The Number property is outside the selected source');
  }
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((source) =>
      source.id === currentSource.id
        ? {
            ...source,
            properties: source.properties.map((property) =>
              property.id === currentProperty.id
                ? { ...property, visualization: input.visualization }
                : property,
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
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((source) =>
      source.id === currentSource.id
        ? {
            ...source,
            properties: source.properties.filter((property) => property.id !== currentProperty.id),
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
