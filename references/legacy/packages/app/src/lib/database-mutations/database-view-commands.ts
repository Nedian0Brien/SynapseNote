import type {
  DatabaseAutomation,
  DatabaseDefinition,
  DatabaseFilter,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { DatabaseDefinitionSchema, validateDatabaseFilter } from '@nedian0brien/synapsenote-core';
import type {
  DatabaseDesiredStateDraftInput,
  DatabaseRecordMutation,
} from '@nedian0brien/synapsenote-server';
import { databaseDraftBase } from './database-desired-state-base';

export function rebaseQueuedDatabaseRecordMutations(input: {
  database: DatabaseDefinition;
  recordMutations: readonly DatabaseRecordMutation[];
}): DatabaseDesiredStateDraftInput {
  return {
    ...databaseDraftBase(input.database),
    sampleRecords: [],
    recordMutations: structuredClone([...input.recordMutations]),
    recordCopies: [],
    recordArchives: [],
    recordMoves: [],
    recordDeletions: [],
  };
}

export function createDatabaseAutomationDesiredState(input: {
  database: DatabaseDefinition;
  automations: readonly DatabaseAutomation[];
}): DatabaseDesiredStateDraftInput {
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    automations: structuredClone(input.automations),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
    recordArchives: [],
  };
}

export function createDatabaseViewFilterChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  viewId: string;
  where?: DatabaseFilter;
}): DatabaseDesiredStateDraftInput {
  const view = input.database.views.find((candidate) => candidate.id === input.viewId);
  if (!view || view.sourceId !== input.source.id) {
    throw new Error('The saved view is outside the selected source');
  }
  if (input.where) {
    validateDatabaseFilter(input.source, input.where, input.database.people);
  }
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    views: input.database.views.map((candidate) => {
      if (candidate.id !== view.id) return candidate;
      const { where: _currentWhere, ...withoutWhere } = candidate;
      return input.where ? { ...withoutWhere, where: structuredClone(input.where) } : withoutWhere;
    }),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

export function createDatabaseViewConfigurationChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  view: DatabaseView;
}): DatabaseDesiredStateDraftInput {
  const current = input.database.views.find((candidate) => candidate.id === input.view.id);
  if (!current || current.sourceId !== input.source.id || input.view.sourceId !== input.source.id) {
    throw new Error('The saved view is outside the selected source');
  }
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    views: input.database.views.map((candidate) =>
      candidate.id === current.id ? structuredClone(input.view) : candidate,
    ),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

export type DatabaseViewLifecycleChange =
  | { kind: 'create'; view: DatabaseView }
  | { kind: 'duplicate'; view: DatabaseView }
  | { kind: 'rename'; viewId: string; name: string }
  | { kind: 'reorder'; viewId: string; direction: -1 | 1 }
  | { kind: 'reorder-to'; viewId: string; targetViewId: string }
  | { kind: 'favorite'; viewId: string; favorite: boolean }
  | { kind: 'delete'; viewId: string };

export function createDatabaseViewLifecycleChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  change: DatabaseViewLifecycleChange;
}): DatabaseDesiredStateDraftInput {
  const currentViews = input.database.views;
  const change = input.change;
  let views: DatabaseView[];
  if (change.kind === 'create' || change.kind === 'duplicate') {
    if (change.view.sourceId !== input.source.id) {
      throw new Error('The saved view is outside the selected source');
    }
    views = [...currentViews, structuredClone(change.view)];
  } else {
    const viewIndex = currentViews.findIndex(
      (candidate) => candidate.id === change.viewId && candidate.sourceId === input.source.id,
    );
    if (viewIndex < 0) throw new Error('The saved view is outside the selected source');
    if (change.kind === 'delete') {
      const sourceViewCount = currentViews.filter(
        (candidate) => candidate.sourceId === input.source.id,
      ).length;
      if (sourceViewCount <= 1) {
        throw new Error('Cannot delete the last saved view for this source');
      }
      if (input.source.defaultViewId === change.viewId) {
        throw new Error('Clear or change the source default before deleting this view');
      }
      views = currentViews.filter((_, index) => index !== viewIndex);
    } else if (change.kind === 'reorder' || change.kind === 'reorder-to') {
      const sourceViewIndexes = currentViews.flatMap((candidate, index) =>
        candidate.sourceId === input.source.id ? [index] : [],
      );
      const sourcePosition = sourceViewIndexes.indexOf(viewIndex);
      const targetIndex =
        change.kind === 'reorder'
          ? sourceViewIndexes[sourcePosition + change.direction]
          : sourceViewIndexes.find(
              (candidateIndex) => currentViews[candidateIndex]?.id === change.targetViewId,
            );
      views = [...currentViews];
      if (targetIndex !== undefined) {
        if (change.kind === 'reorder') {
          [views[viewIndex], views[targetIndex]] = [
            views[targetIndex] as DatabaseView,
            views[viewIndex] as DatabaseView,
          ];
        } else {
          const [moving] = views.splice(viewIndex, 1);
          if (moving) views.splice(targetIndex, 0, moving);
        }
      }
    } else {
      views = currentViews.map((candidate, index) => {
        if (index !== viewIndex) return candidate;
        return change.kind === 'rename'
          ? { ...candidate, name: change.name }
          : { ...candidate, favorite: change.favorite };
      });
    }
  }
  const definition = DatabaseDefinitionSchema.parse({ ...input.database, views });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

export function createDatabaseDefaultViewChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  viewId?: string;
}): DatabaseDesiredStateDraftInput {
  const source = input.database.sources.find((candidate) => candidate.id === input.source.id);
  if (!source) throw new Error('The selected source is outside the database');
  if (
    input.viewId &&
    !input.database.views.some(
      (view) => view.id === input.viewId && view.sourceId === input.source.id,
    )
  ) {
    throw new Error('The default view must belong to the selected source');
  }
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((candidate) => {
      if (candidate.id !== source.id) return candidate;
      const { defaultViewId: _currentDefault, ...withoutDefault } = candidate;
      return input.viewId ? { ...withoutDefault, defaultViewId: input.viewId } : withoutDefault;
    }),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

export * from './database-page-commands';
export * from './database-property-advanced-commands';
