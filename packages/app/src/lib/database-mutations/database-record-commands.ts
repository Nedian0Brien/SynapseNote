import type {
  DatabaseDefinition,
  DatabaseProperty,
  DatabaseSource,
  DatabaseTemplate,
  DatabaseValue,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { applyDatabaseTemplate, DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';
import { databaseDraftBase } from './database-desired-state-base';

export function createDatabaseCellMutationDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  property: DatabaseProperty;
  value: DatabaseValue | undefined;
}): DatabaseDesiredStateDraftInput {
  if (input.record.revision === null) {
    throw new Error('A database cell cannot be edited without an exact record revision');
  }
  if (!input.source.properties.some((property) => property.id === input.property.id)) {
    throw new Error('The edited property is not part of the selected source');
  }
  return {
    ...databaseDraftBase(input.database),
    sampleRecords: [],
    recordMutations: [
      {
        id: input.record.id,
        expectedRevision: input.record.revision,
        sourceKey: input.source.key,
        preconditions: [databasePropertyPrecondition(input.record, input.property)],
        operations: [
          input.value === undefined
            ? { op: 'unset', propertyKey: input.property.key }
            : { op: 'set', propertyKey: input.property.key, value: input.value },
        ],
      },
    ],
  };
}

export function databasePropertyPrecondition(
  record: ProjectedDatabaseRecord,
  property: DatabaseProperty,
) {
  return Object.hasOwn(record.values, property.id)
    ? {
        propertyKey: property.key,
        present: true as const,
        value: structuredClone(record.values[property.id]),
      }
    : { propertyKey: property.key, present: false as const };
}

export function createDatabaseRecordDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  title: string;
  body?: string;
  templateId?: string;
  viewId?: string;
  entryPoint?: string;
  skipTemplate?: boolean;
}): DatabaseDesiredStateDraftInput {
  const titleProperty = input.source.properties.find((property) => property.type === 'title');
  if (!titleProperty) throw new Error('The selected source has no title property');
  const title = input.title.trim();
  const applied = applyDatabaseTemplate(input.database, {
    sourceId: input.source.id,
    ...(input.templateId ? { templateId: input.templateId } : {}),
    ...(input.viewId ? { viewId: input.viewId } : {}),
    ...(input.entryPoint ? { entryPoint: input.entryPoint } : {}),
    ...(input.skipTemplate ? { skipTemplate: true } : {}),
    values: { [titleProperty.id]: title },
    ...(input.body !== undefined ? { body: input.body } : {}),
  });
  return {
    ...databaseDraftBase(input.database),
    sampleRecords: [
      {
        sourceKey: input.source.key,
        values: Object.fromEntries(
          Object.entries(applied.values).map(([propertyId, value]) => {
            const property = input.source.properties.find(
              (candidate) => candidate.id === propertyId,
            );
            if (!property) throw new Error(`Template returned unknown property "${propertyId}"`);
            return [property.key, value];
          }),
        ),
        body: applied.body,
      },
    ],
    recordMutations: [],
  };
}

export type DatabaseTemplateLifecycleChange =
  | { kind: 'create'; template: DatabaseTemplate }
  | { kind: 'duplicate'; template: DatabaseTemplate }
  | { kind: 'update'; template: DatabaseTemplate }
  | { kind: 'reorder'; templateId: string; direction: -1 | 1 }
  | { kind: 'archive'; templateId: string; archivedAt: string }
  | { kind: 'restore'; templateId: string }
  | { kind: 'delete'; templateId: string };

export function createDatabaseTemplateLifecycleDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  change: DatabaseTemplateLifecycleChange;
}): DatabaseDesiredStateDraftInput {
  const change = input.change;
  let templates = [...input.database.templates];
  let changedTemplate: DatabaseTemplate | null = null;
  if (change.kind === 'create' || change.kind === 'duplicate') {
    if (change.template.sourceId !== input.source.id) throw new Error('Template source mismatch');
    templates.push(structuredClone(change.template));
    changedTemplate = change.template;
  } else if (change.kind === 'update') {
    if (change.template.sourceId !== input.source.id) throw new Error('Template source mismatch');
    const index = templates.findIndex((template) => template.id === change.template.id);
    if (index < 0) throw new Error('Template is not part of this database');
    templates[index] = structuredClone(change.template);
    changedTemplate = change.template;
  } else {
    const index = templates.findIndex(
      (template) => template.id === change.templateId && template.sourceId === input.source.id,
    );
    if (index < 0) throw new Error('Template is not part of this source');
    if (change.kind === 'delete') {
      templates.splice(index, 1);
    } else if (change.kind === 'reorder') {
      const activeIndexes = templates.flatMap((template, candidateIndex) =>
        template.sourceId === input.source.id && template.archivedAt === null
          ? [candidateIndex]
          : [],
      );
      const position = activeIndexes.indexOf(index);
      const target = activeIndexes[position + change.direction];
      if (target !== undefined) {
        const currentOrder = templates[index]?.order ?? index;
        const targetOrder = templates[target]?.order ?? target;
        templates[index] = { ...(templates[index] as DatabaseTemplate), order: targetOrder };
        templates[target] = { ...(templates[target] as DatabaseTemplate), order: currentOrder };
      }
    } else if (change.kind === 'archive') {
      const template = templates[index] as DatabaseTemplate;
      templates[index] = {
        ...template,
        archivedAt: change.archivedAt,
        defaultFor: { source: false, viewIds: [], entryPoints: [] },
        ...(template.repeat ? { repeat: { ...template.repeat, paused: true } } : {}),
      };
    } else {
      templates[index] = { ...(templates[index] as DatabaseTemplate), archivedAt: null };
    }
  }
  if (changedTemplate?.archivedAt === null) {
    const defaults = changedTemplate.defaultFor;
    templates = templates.map((template) => {
      if (template.id === changedTemplate?.id || template.sourceId !== changedTemplate?.sourceId) {
        return template;
      }
      return {
        ...template,
        defaultFor: {
          source: defaults.source ? false : template.defaultFor.source,
          viewIds: template.defaultFor.viewIds.filter(
            (viewId) => !defaults.viewIds.includes(viewId),
          ),
          entryPoints: template.defaultFor.entryPoints.filter(
            (entryPoint) => !defaults.entryPoints.includes(entryPoint),
          ),
        },
      };
    });
  }
  const definition = DatabaseDefinitionSchema.parse({ ...input.database, templates });
  return { ...databaseDraftBase(definition), sampleRecords: [], recordMutations: [] };
}

export function createDatabaseRecordDeletionDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
}): DatabaseDesiredStateDraftInput {
  if (input.record.revision === null) {
    throw new Error('A database record cannot be deleted without an exact record revision');
  }
  if (!input.database.sources.some((source) => source.id === input.source.id)) {
    throw new Error('The deletion source is not part of the selected database');
  }
  return {
    ...databaseDraftBase(input.database),
    sampleRecords: [],
    recordMutations: [],
    recordDeletions: [
      {
        id: input.record.id,
        expectedRevision: input.record.revision,
        sourceKey: input.source.key,
      },
    ],
  };
}

export function createDatabaseRecordCopyDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
}): DatabaseDesiredStateDraftInput {
  if (input.record.revision === null) {
    throw new Error('A database record cannot be duplicated without an exact record revision');
  }
  const titleProperty = input.source.properties.find((property) => property.type === 'title');
  if (!titleProperty) throw new Error('The selected source has no title property');
  const title = input.record.values[titleProperty.id];
  if (typeof title !== 'string')
    throw new Error('The source record has no valid title to duplicate');
  return {
    ...databaseDraftBase(input.database),
    sampleRecords: [],
    recordMutations: [],
    recordCopies: [
      {
        id: input.record.id,
        expectedRevision: input.record.revision,
        sourceKey: input.source.key,
        title: title.trim() === '' ? '' : `${title} copy`,
      },
    ],
  };
}

export function createDatabaseRecordArchiveDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  action: 'archive' | 'restore';
}): DatabaseDesiredStateDraftInput {
  if (input.record.revision === null) {
    throw new Error('A database record archive change requires an exact record revision');
  }
  if (input.action === 'restore' && !input.record.archivedAt) {
    throw new Error('Only an archived database record can be restored');
  }
  return {
    ...databaseDraftBase(input.database),
    sampleRecords: [],
    recordMutations: [],
    recordArchives: [
      {
        id: input.record.id,
        expectedRevision: input.record.revision,
        sourceKey: input.source.key,
        action: input.action,
      },
    ],
  };
}

export function createDatabaseRecordMoveDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  targetSource: DatabaseSource;
  record: ProjectedDatabaseRecord;
}): DatabaseDesiredStateDraftInput {
  if (input.record.revision === null) {
    throw new Error('A database record move requires an exact record revision');
  }
  if (input.source.id === input.targetSource.id) {
    throw new Error('A database record must move to a different source');
  }
  if (!input.database.sources.some((source) => source.id === input.targetSource.id)) {
    throw new Error('The move target is not part of the selected database');
  }
  if (
    !(input.database.sourceMappings ?? []).some(
      (mapping) =>
        mapping.sourceId === input.source.id && mapping.targetSourceId === input.targetSource.id,
    )
  ) {
    throw new Error('The move target has no explicit compatibility mapping');
  }
  return {
    ...databaseDraftBase(input.database),
    sampleRecords: [],
    recordMutations: [],
    recordMoves: [
      {
        id: input.record.id,
        expectedRevision: input.record.revision,
        sourceKey: input.source.key,
        targetSourceKey: input.targetSource.key,
      },
    ],
  };
}

export * from './database-bulk-commands';

// Re-export the schema-rebase helper from the record command surface. The
// helper rebuilds queued record operations and is consumed alongside record
// mutations by the workspace coordinator.
export { rebaseQueuedDatabaseRecordMutations } from './database-view-commands';
