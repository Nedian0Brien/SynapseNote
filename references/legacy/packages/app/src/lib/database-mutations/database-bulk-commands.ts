import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseSource,
  DatabaseValue,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { databaseDraftBase } from './database-desired-state-base';
import { databasePropertyPrecondition } from './database-record-commands';

export function createDatabaseBulkCellMutationDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  records: readonly ProjectedDatabaseRecord[];
  property: DatabaseProperty;
  value: DatabaseValue | undefined;
}): DatabaseDesiredStateDraftInput {
  if (input.records.length === 0) throw new Error('Select at least one database record');
  if (input.records.length > 100) throw new Error('A bulk edit can target at most 100 records');
  if (!input.source.properties.some((property) => property.id === input.property.id)) {
    throw new Error('The edited property is not part of the selected source');
  }
  const recordIds = new Set<string>();
  const recordMutations = input.records.map((record) => {
    if (recordIds.has(record.id)) throw new Error(`Record ${record.id} is selected more than once`);
    recordIds.add(record.id);
    if (record.revision === null) {
      throw new Error(`Record ${record.id} cannot be edited without an exact revision`);
    }
    return {
      id: record.id,
      expectedRevision: record.revision,
      sourceKey: input.source.key,
      preconditions: [databasePropertyPrecondition(record, input.property)],
      operations: [
        input.value === undefined
          ? ({ op: 'unset', propertyKey: input.property.key } as const)
          : ({ op: 'set', propertyKey: input.property.key, value: input.value } as const),
      ],
    };
  });
  return {
    ...databaseDraftBase(input.database),
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: input.records.length },
    sampleRecords: [],
    recordMutations,
  };
}

export function createDatabaseBulkCheckboxToggleDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  records: readonly ProjectedDatabaseRecord[];
  property: DatabaseProperty;
}): DatabaseDesiredStateDraftInput {
  if (input.property.type !== 'checkbox') {
    throw new Error('Bulk toggle requires a Checkbox property');
  }
  if (input.records.length === 0) throw new Error('Select at least one database record');
  if (input.records.length > 100) throw new Error('A bulk toggle can target at most 100 records');
  if (!input.source.properties.some((property) => property.id === input.property.id)) {
    throw new Error('The toggled property is not part of the selected source');
  }
  const recordIds = new Set<string>();
  const recordMutations = input.records.map((record) => {
    if (recordIds.has(record.id)) throw new Error(`Record ${record.id} is selected more than once`);
    recordIds.add(record.id);
    if (record.revision === null) {
      throw new Error(`Record ${record.id} cannot be toggled without an exact revision`);
    }
    return {
      id: record.id,
      expectedRevision: record.revision,
      sourceKey: input.source.key,
      preconditions: [databasePropertyPrecondition(record, input.property)],
      operations: [
        {
          op: 'set' as const,
          propertyKey: input.property.key,
          value: record.values[input.property.id] !== true,
        },
      ],
    };
  });
  return {
    ...databaseDraftBase(input.database),
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: input.records.length },
    sampleRecords: [],
    recordMutations,
  };
}

export function createDatabaseTablePasteDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  changes: readonly {
    record: ProjectedDatabaseRecord;
    property: DatabaseProperty;
    value: DatabaseValue | undefined;
  }[];
}): DatabaseDesiredStateDraftInput {
  if (input.changes.length === 0) throw new Error('Paste contains no database cells');
  const sourcePropertyIds = new Set(input.source.properties.map((property) => property.id));
  type PasteOperation =
    | { op: 'set'; propertyKey: string; value: DatabaseValue }
    | { op: 'unset'; propertyKey: string };
  const byRecord = new Map<
    string,
    {
      recordId: string;
      expectedRevision: string;
      operations: PasteOperation[];
      preconditions: ReturnType<typeof databasePropertyPrecondition>[];
      cells: Set<string>;
    }
  >();
  for (const change of input.changes) {
    if (!sourcePropertyIds.has(change.property.id)) {
      throw new Error(`Property ${change.property.id} is outside the selected source`);
    }
    if (change.record.revision === null) {
      throw new Error(`Record ${change.record.id} cannot be pasted without an exact revision`);
    }
    let target = byRecord.get(change.record.id);
    if (!target) {
      target = {
        recordId: change.record.id,
        expectedRevision: change.record.revision,
        operations: [],
        preconditions: [],
        cells: new Set(),
      };
      byRecord.set(change.record.id, target);
    } else if (target.expectedRevision !== change.record.revision) {
      throw new Error(`Record ${change.record.id} has conflicting revisions in one paste`);
    }
    if (target.cells.has(change.property.id)) {
      throw new Error(`Paste targets ${change.record.id}/${change.property.id} more than once`);
    }
    target.cells.add(change.property.id);
    target.preconditions.push(databasePropertyPrecondition(change.record, change.property));
    target.operations.push(
      change.value === undefined
        ? { op: 'unset', propertyKey: change.property.key }
        : { op: 'set', propertyKey: change.property.key, value: change.value },
    );
  }
  if (byRecord.size > 100) throw new Error('A table paste can target at most 100 records');
  return {
    ...databaseDraftBase(input.database),
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: byRecord.size },
    sampleRecords: [],
    recordMutations: [...byRecord.values()].map(
      ({ recordId, expectedRevision, operations, preconditions }) => ({
        id: recordId,
        expectedRevision,
        sourceKey: input.source.key,
        preconditions,
        operations,
      }),
    ),
  };
}
