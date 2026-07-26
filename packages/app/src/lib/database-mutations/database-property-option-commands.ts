import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseSelectOptionChange,
  DatabaseSelectOptionPreview,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { previewDatabaseSelectOptionChange } from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';

import { databaseDraftBase } from './database-desired-state-base';

export function createDatabaseSelectOptionChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: Extract<DatabaseProperty, { type: 'select' | 'multi_select' }>;
  records: readonly ProjectedDatabaseRecord[];
  recordsComplete: boolean;
  change: DatabaseSelectOptionChange;
}): {
  preview: DatabaseSelectOptionPreview;
  desiredState: DatabaseDesiredStateDraftInput;
} {
  if (input.property.type !== 'select' && input.property.type !== 'multi_select') {
    throw new Error('Option lifecycle changes require a Select or Multi-select property');
  }
  if (
    !input.source.properties.some(
      (property) => property.id === input.property.id && property.type === input.property.type,
    )
  ) {
    throw new Error('The option property is outside the selected source');
  }
  if ((input.change.kind === 'merge' || input.change.kind === 'delete') && !input.recordsComplete) {
    throw new Error('Merge and delete require a complete source snapshot');
  }
  const preview = previewDatabaseSelectOptionChange({
    definition: input.database,
    sourceId: input.source.id,
    propertyId: input.property.id,
    records: input.records,
    change: input.change,
  });
  if (!preview.canApply) {
    throw new Error(preview.conflicts.map((conflict) => conflict.message).join('; '));
  }
  const recordMutations = preview.recordChanges.map((change) => {
    if (!change.expectedRevision) {
      throw new Error(`Record ${change.recordId} cannot be migrated without an exact revision`);
    }
    const nextValue =
      change.afterOptionIds !== undefined ? [...change.afterOptionIds] : change.afterOptionId;
    if (nextValue === undefined) {
      throw new Error(`Record ${change.recordId} has no option migration value`);
    }
    return {
      id: change.recordId,
      expectedRevision: change.expectedRevision,
      sourceKey: input.source.key,
      operations: [
        {
          op: 'set' as const,
          propertyKey: input.property.key,
          value: nextValue,
        },
      ],
    };
  });
  return {
    preview,
    desiredState: {
      ...databaseDraftBase(preview.definition),
      policy: {
        mode: 'review',
        allowedOperations: [],
        maxRecordsPerCommit: Math.max(1, recordMutations.length),
      },
      sampleRecords: [],
      recordMutations,
    },
  };
}

const DATABASE_SELECT_OPTION_CREATION_COLORS = [
  'gray',
  'purple',
  'yellow',
  'brown',
  'orange',
  'green',
  'blue',
  'pink',
  'red',
] as const;

function databaseSelectOptionKeyFromName(name: string, existingKeys: readonly string[]): string {
  const base =
    name
      .trim()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 100) || 'option';
  const normalized = /^[a-z]/.test(base) ? base : `option_${base}`;
  const taken = new Set(existingKeys);
  if (!taken.has(normalized)) return normalized;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${normalized}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Adds one Select/Multi-select option and assigns it to one record atomically.
 * The option intentionally omits an ID in the desired state so the canonical
 * planner mints the stable identity and resolves the record value by key.
 */
export function createDatabaseSelectOptionCreateDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: Extract<DatabaseProperty, { type: 'select' | 'multi_select' }>;
  record: ProjectedDatabaseRecord;
  selectedOptionIds: readonly string[];
  name: string;
  color?: string;
}): { desiredState: DatabaseDesiredStateDraftInput; optionKey: string } {
  const name = input.name.trim();
  if (!name) throw new Error('Select option name cannot be empty');
  if (name.length > 200) throw new Error('Select option name cannot exceed 200 characters');
  if (!input.record.revision) {
    throw new Error('The record needs an exact revision before a Select option can be created');
  }
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  const currentProperty = currentSource?.properties.find(
    (property) => property.id === input.property.id,
  );
  if (
    !currentSource ||
    !currentProperty ||
    (currentProperty.type !== 'select' && currentProperty.type !== 'multi_select')
  ) {
    throw new Error('The Select option property is outside the selected source');
  }
  if (
    currentProperty.options.some(
      (option) =>
        option.archived !== true &&
        option.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0,
    )
  ) {
    throw new Error(`Select option "${name}" already exists`);
  }
  const optionKey = databaseSelectOptionKeyFromName(
    name,
    currentProperty.options.map((option) => option.key),
  );
  const color =
    input.color?.trim() ||
    DATABASE_SELECT_OPTION_CREATION_COLORS[
      currentProperty.options.filter((option) => option.archived !== true).length %
        DATABASE_SELECT_OPTION_CREATION_COLORS.length
    ];
  const base = databaseDraftBase(input.database);
  const sources = base.sources.map((source) =>
    source.id === currentSource.id
      ? {
          ...source,
          properties: source.properties.map((property) =>
            property.id === currentProperty.id
              ? {
                  ...property,
                  options: [...currentProperty.options, { key: optionKey, name, color }],
                }
              : property,
          ),
        }
      : source,
  );
  const selectedOptionKeys = input.selectedOptionIds.flatMap((optionId) => {
    const option = currentProperty.options.find((candidate) => candidate.id === optionId);
    return option && option.archived !== true ? [option.key] : [];
  });
  const value =
    currentProperty.type === 'select'
      ? optionKey
      : [...new Set([...selectedOptionKeys, optionKey])];
  return {
    optionKey,
    desiredState: {
      ...base,
      sources,
      policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 1 },
      sampleRecords: [],
      recordMutations: [
        {
          id: input.record.id,
          expectedRevision: input.record.revision,
          sourceKey: currentSource.key,
          operations: [{ op: 'set', propertyKey: currentProperty.key, value }],
        },
      ],
    },
  };
}
