import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { databaseDraftBase } from './database-desired-state-base';

export function createDatabaseComputedPropertyChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: Extract<DatabaseProperty, { type: 'formula' | 'rollup' }>;
}): DatabaseDesiredStateDraftInput {
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (!currentSource || currentProperty?.type !== input.property.type) {
    throw new Error('The computed property is outside the selected source');
  }
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((source) =>
      source.id === currentSource.id
        ? {
            ...source,
            properties: source.properties.map((property) =>
              property.id === input.property.id ? structuredClone(input.property) : property,
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

export function createDatabaseUniqueIdPrefixChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: Extract<DatabaseProperty, { type: 'unique_id' }>;
  prefix: string;
}): DatabaseDesiredStateDraftInput {
  const prefix = input.prefix.trim();
  if (prefix !== '' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(prefix)) {
    throw new Error('Unique ID prefix must use letters, numbers, underscores, or hyphens');
  }
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (!currentSource || currentProperty?.type !== 'unique_id') {
    throw new Error('The Unique ID property is outside the selected source');
  }
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((source) =>
      source.id === currentSource.id
        ? {
            ...source,
            properties: source.properties.map((property) =>
              property.id === input.property.id ? { ...property, prefix } : property,
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

export function createDatabasePlacePrivacyChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: Extract<DatabaseProperty, { type: 'place' }>;
  externalSearch: 'disabled' | 'explicit';
  externalMap: 'disabled' | 'explicit';
}): DatabaseDesiredStateDraftInput {
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (!currentSource || currentProperty?.type !== 'place') {
    throw new Error('The Place property is outside the selected source');
  }
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((source) =>
      source.id === currentSource.id
        ? {
            ...source,
            properties: source.properties.map((property) =>
              property.id === input.property.id
                ? {
                    ...property,
                    externalSearch: input.externalSearch,
                    externalMap: input.externalMap,
                  }
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
 * Replaces a Button's label, confirmation, and action list in one manifest
 * update. The whole property is swapped rather than patched field by field
 * because `actions` is a discriminated union whose members share no shape —
 * a partial merge would leave operands from the previous kind behind, and
 * `.strict()` would reject the result at commit with nothing to point at.
 */
export function createDatabaseButtonPropertyChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: Extract<DatabaseProperty, { type: 'button' }>;
}): DatabaseDesiredStateDraftInput {
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (!currentSource || currentProperty?.type !== 'button') {
    throw new Error('The Button property is outside the selected source');
  }
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((source) =>
      source.id === currentSource.id
        ? {
            ...source,
            properties: source.properties.map((property) =>
              property.id === input.property.id ? structuredClone(input.property) : property,
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

export * from './database-property-option-commands';
