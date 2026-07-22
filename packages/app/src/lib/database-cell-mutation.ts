import type {
  DatabaseAutomation,
  DatabaseDefinition,
  DatabaseFilter,
  DatabasePageLayout,
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseRecordPageLayoutOverride,
  DatabaseSelectOptionChange,
  DatabaseSelectOptionPreview,
  DatabaseSource,
  DatabaseTemplate,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import {
  applyDatabaseTemplate,
  canonicalizeDatabasePlaceValue,
  DatabaseDefinitionSchema,
  DatabaseFilesValueSchema,
  DatabaseRecordIdSchema,
  databaseRecordPageLayoutOverrideIssues,
  isValidDatabaseEmail,
  isValidDatabasePhone,
  isValidDatabaseUrl,
  parseSerializedDatabaseDateValue,
  previewDatabaseSelectOptionChange,
  validateDatabaseFilter,
  validateDatabasePropertyConstraints,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseDesiredStateDraftInput,
  DatabaseRecordMutation,
} from '@nedian0brien/synapsenote-server';

function databaseDraftBase(
  database: DatabaseDefinition,
): Pick<
  DatabaseDesiredStateDraftInput,
  | 'database'
  | 'sources'
  | 'sourceMappings'
  | 'views'
  | 'policy'
  | 'templates'
  | 'buttons'
  | 'automations'
> {
  const sourceKeyById = new Map(database.sources.map((source) => [source.id, source.key] as const));
  return {
    database: {
      id: database.id,
      key: database.key,
      name: database.name,
      ...(database.description ? { description: database.description } : {}),
      ...(database.icon ? { icon: database.icon } : {}),
      ...(database.cover ? { cover: database.cover } : {}),
      ...(database.aliases ? { aliases: [...database.aliases] } : {}),
      people: structuredClone(database.people),
      contract: structuredClone(database.contract),
    },
    sources: database.sources.map((source) => structuredClone(source)),
    sourceMappings: (database.sourceMappings ?? []).map((mapping) => {
      const source = database.sources.find((candidate) => candidate.id === mapping.sourceId);
      const target = database.sources.find((candidate) => candidate.id === mapping.targetSourceId);
      if (!source || !target) throw new Error('Source mapping references an unknown source');
      return {
        sourceKey: source.key,
        targetSourceKey: target.key,
        propertyMappings: mapping.propertyMappings.map((propertyMapping) => {
          const sourceProperty = source.properties.find(
            (property) => property.id === propertyMapping.sourcePropertyId,
          );
          const targetProperty = target.properties.find(
            (property) => property.id === propertyMapping.targetPropertyId,
          );
          if (!sourceProperty || !targetProperty) {
            throw new Error('Source mapping references an unknown property');
          }
          return {
            sourcePropertyKey: sourceProperty.key,
            targetPropertyKey: targetProperty.key,
            optionMappings: propertyMapping.optionMappings.map((optionMapping) => {
              const sourceOption =
                'options' in sourceProperty
                  ? sourceProperty.options.find(
                      (option) => option.id === optionMapping.sourceOptionId,
                    )
                  : undefined;
              const targetOption =
                'options' in targetProperty
                  ? targetProperty.options.find(
                      (option) => option.id === optionMapping.targetOptionId,
                    )
                  : undefined;
              if (!sourceOption || !targetOption) {
                throw new Error('Source mapping references an unknown option');
              }
              return {
                sourceOptionKey: sourceOption.key,
                targetOptionKey: targetOption.key,
              };
            }),
          };
        }),
      };
    }),
    views: database.views.map((view) => {
      const { sourceId, ...canonicalView } = structuredClone(view);
      return {
        ...canonicalView,
        sourceKey: sourceKeyById.get(sourceId) ?? sourceId,
      };
    }),
    templates: (database.templates ?? []).map((template) => {
      const source = database.sources.find((candidate) => candidate.id === template.sourceId);
      if (!source) throw new Error('Database template references an unknown source');
      return {
        id: template.id,
        key: template.key,
        name: template.name,
        ...(template.description ? { description: template.description } : {}),
        sourceKey: source.key,
        body: template.body,
        propertyValues: Object.fromEntries(
          Object.entries(template.propertyValues).map(([propertyId, value]) => {
            const property = source.properties.find((candidate) => candidate.id === propertyId);
            if (!property) throw new Error('Database template references an unknown property');
            return [property.key, structuredClone(value)];
          }),
        ),
        order: template.order,
        archivedAt: template.archivedAt,
        defaultFor: {
          source: template.defaultFor.source,
          viewKeys: template.defaultFor.viewIds.map((viewId) => {
            const view = database.views.find((candidate) => candidate.id === viewId);
            if (!view) throw new Error('Database template references an unknown view');
            return view.key;
          }),
          entryPoints: [...template.defaultFor.entryPoints],
        },
        ...(template.repeat
          ? {
              repeat: {
                schedule: structuredClone(template.repeat.schedule),
                timeZone: template.repeat.timeZone,
                ownerKey:
                  (database.people ?? []).find((person) => person.id === template.repeat?.ownerId)
                    ?.key ?? template.repeat.ownerId,
                paused: template.repeat.paused,
                retry: structuredClone(template.repeat.retry),
              },
            }
          : {}),
      };
    }),
    buttons: (database.buttons ?? []).map((button) => ({
      id: button.id,
      key: button.key,
      name: button.name,
      ...(button.description ? { description: button.description } : {}),
      placement:
        button.placement.kind === 'database'
          ? { kind: 'database' as const }
          : {
              kind: 'source' as const,
              sourceKey: sourceKeyById.get(button.placement.sourceId) ?? button.placement.sourceId,
            },
      ...(button.confirmation ? { confirmation: structuredClone(button.confirmation) } : {}),
      actions: button.actions.map((action) => {
        if (action.kind !== 'create_record') {
          throw new Error('Database-level button contains an unsupported action');
        }
        const source = database.sources.find((candidate) => candidate.id === action.sourceId);
        if (!source) throw new Error('Database-level button references an unknown source');
        return {
          id: action.id,
          kind: action.kind,
          sourceKey: source.key,
          values: Object.fromEntries(
            Object.entries(action.values).map(([propertyId, value]) => {
              const property = source.properties.find((candidate) => candidate.id === propertyId);
              if (!property)
                throw new Error('Database-level button references an unknown property');
              return [property.key, structuredClone(value)];
            }),
          ),
          body: action.body,
        };
      }),
    })),
    automations: structuredClone(database.automations ?? []),
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 1 },
  };
}

/**
 * Rebuild queued record operations against the freshly described schema.
 * This is the offline reconciliation boundary: stale record preconditions are
 * preserved, while stale manifest/view definitions are never replayed.
 */
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

/**
 * Rename the visible database page without changing its stable database/source
 * identities. When the source and database currently share a title, keep both
 * names synchronized; otherwise only the selected source page title changes.
 */
export function createDatabasePageTitleDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  name: string;
}): DatabaseDesiredStateDraftInput {
  const name = input.name.trim();
  if (!name) throw new Error('A database page title is required');
  const source = input.database.sources.find((candidate) => candidate.id === input.source.id);
  if (!source) throw new Error('The selected source is outside the database');
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    ...(input.database.name === source.name ? { name } : {}),
    sources: input.database.sources.map((candidate) =>
      candidate.id === source.id ? { ...candidate, name } : candidate,
    ),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

/** Persist the optional Notion-style page icon/cover without changing stable IDs. */
export function createDatabasePageAppearanceDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  icon?: string | null;
  cover?: string | null;
}): DatabaseDesiredStateDraftInput {
  const source = input.database.sources.find((candidate) => candidate.id === input.source.id);
  if (!source) throw new Error('The selected source is outside the database');
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    ...(input.icon === undefined
      ? {}
      : input.icon === null || input.icon.trim() === ''
        ? { icon: undefined }
        : { icon: input.icon.trim() }),
    ...(input.cover === undefined
      ? {}
      : input.cover === null || input.cover.trim() === ''
        ? { cover: undefined }
        : { cover: input.cover.trim() }),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

export function createDatabasePageLayoutChangeDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  pageLayout: DatabasePageLayout;
}): DatabaseDesiredStateDraftInput {
  const source = input.database.sources.find((candidate) => candidate.id === input.source.id);
  if (!source) throw new Error('The selected source is outside the database');
  const definition = DatabaseDefinitionSchema.parse({
    ...input.database,
    sources: input.database.sources.map((candidate) =>
      candidate.id === source.id
        ? { ...candidate, pageLayout: structuredClone(input.pageLayout) }
        : candidate,
    ),
  });
  return {
    ...databaseDraftBase(definition),
    sampleRecords: [],
    recordMutations: [],
  };
}

export function createDatabaseRecordPageLayoutOverrideDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  body: string;
  pageLayoutOverride: DatabaseRecordPageLayoutOverride | null;
}): DatabaseDesiredStateDraftInput {
  if (!input.record.revision) throw new Error('The record has no stable revision');
  if (input.pageLayoutOverride) {
    const issues = databaseRecordPageLayoutOverrideIssues(input.source, input.pageLayoutOverride);
    if (issues.length > 0) throw new Error(issues.join('; '));
  }
  const storedTypes = new Set([
    'title',
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
    'relation',
  ]);
  const values = Object.fromEntries(
    input.source.properties.flatMap((property) => {
      const value = input.record.values[property.id];
      return value !== undefined && storedTypes.has(property.type)
        ? [[property.key, structuredClone(value)]]
        : [];
    }),
  );
  return {
    ...databaseDraftBase(input.database),
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 1 },
    sampleRecords: [
      {
        id: input.record.id,
        expectedRevision: input.record.revision,
        sourceKey: input.source.key,
        values,
        body: input.body,
        pageLayoutOverride: input.pageLayoutOverride,
      },
    ],
    recordMutations: [],
  };
}

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
  if (input.property.type !== 'select') {
    throw new Error('Select option lifecycle changes require a Select property');
  }
  if (!input.source.properties.some((property) => property.id === input.property.id)) {
    throw new Error('The Select property is outside the selected source');
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
    return {
      id: change.recordId,
      expectedRevision: change.expectedRevision,
      sourceKey: input.source.key,
      operations: [
        {
          op: 'set' as const,
          propertyKey: input.property.key,
          value: change.afterOptionId,
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

/**
 * Derives a stable, ASCII `key` from a human-entered property name, matching
 * `DatabaseStableKeySchema` (`^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$`). Non-ASCII
 * names collapse to `property`; callers dedupe against `existingKeys`.
 */
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

/** Adds a new schema property. The server mints its stable ID on commit. */
export function createDatabaseAddPropertyDesiredState(input: {
  database: DatabaseDefinition;
  source: DatabaseSource;
  property: { key: string; name: string; type: DatabasePropertyType } & Record<string, unknown>;
}): DatabaseDesiredStateDraftInput {
  const currentSource = input.database.sources.find((source) => source.id === input.source.id);
  if (!currentSource) throw new Error('The selected source is unavailable');
  if (currentSource.properties.some((property) => property.key === input.property.key)) {
    throw new Error(`A property with the key "${input.property.key}" already exists`);
  }
  const base = databaseDraftBase(input.database);
  return {
    ...base,
    sources: base.sources.map((source) =>
      source.key === currentSource.key
        ? { ...source, properties: [...source.properties, input.property] }
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

function databasePropertyPrecondition(record: ProjectedDatabaseRecord, property: DatabaseProperty) {
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
  if (!title) throw new Error(`${titleProperty.name} cannot be empty`);
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
  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('The source record has no valid title to duplicate');
  }
  return {
    ...databaseDraftBase(input.database),
    sampleRecords: [],
    recordMutations: [],
    recordCopies: [
      {
        id: input.record.id,
        expectedRevision: input.record.revision,
        sourceKey: input.source.key,
        title: `${title} copy`,
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

export function parseDatabaseCellDraft(
  property: DatabaseProperty,
  draft: string,
  people: readonly ProjectedDatabasePerson[] = [],
): DatabaseValue | undefined {
  if (
    property.type === 'formula' ||
    property.type === 'rollup' ||
    property.type === 'created_time' ||
    property.type === 'last_edited_time' ||
    property.type === 'created_by' ||
    property.type === 'last_edited_by' ||
    property.type === 'verification' ||
    property.type === 'button' ||
    property.type === 'unique_id'
  ) {
    throw new Error(
      property.type === 'unique_id'
        ? `${property.name} is an allocated read-only property`
        : `${property.name} is a derived read-only property`,
    );
  }
  const constrained = <T extends DatabaseValue>(value: T): T => {
    const issue = validateDatabasePropertyConstraints(property, value);
    if (issue) throw new Error(`${property.name} ${issue}`);
    return value;
  };
  if (draft === '') {
    if (property.type === 'title' || property.required) {
      throw new Error(`${property.name} cannot be empty`);
    }
    return undefined;
  }
  if (property.type === 'number') {
    const value = Number(draft);
    if (!Number.isFinite(value)) throw new Error(`${property.name} must be a finite number`);
    return constrained(value);
  }
  if (property.type === 'url' && !isValidDatabaseUrl(draft)) {
    throw new Error(`${property.name} must be an HTTP or HTTPS URL`);
  }
  if (property.type === 'email' && !isValidDatabaseEmail(draft)) {
    throw new Error(`${property.name} must be a valid email address`);
  }
  if (property.type === 'phone' && !isValidDatabasePhone(draft)) {
    throw new Error(`${property.name} must be a dialable phone number`);
  }
  if (property.type === 'checkbox') {
    if (draft !== 'true' && draft !== 'false') {
      throw new Error(`${property.name} must be checked or unchecked`);
    }
    return draft === 'true';
  }
  if (property.type === 'date') {
    try {
      return constrained(parseSerializedDatabaseDateValue(draft));
    } catch (cause) {
      throw new Error(
        `${property.name} ${cause instanceof Error ? cause.message : 'requires a valid date'}`,
      );
    }
  }
  if (property.type === 'select' || property.type === 'status') {
    if (!property.options.some((option) => option.id === draft && option.archived !== true)) {
      throw new Error(`${property.name} requires a valid option`);
    }
    return draft;
  }
  if (property.type === 'multi_select') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid option list`);
    }
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (value) =>
          typeof value === 'string' && property.options.some((option) => option.id === value),
      )
    ) {
      throw new Error(`${property.name} requires a valid option list`);
    }
    return [...new Set(parsed)];
  }
  if (property.type === 'person') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid person list`);
    }
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (value) => typeof value === 'string' && people.some((person) => person.id === value),
      ) ||
      (property.required && parsed.length === 0) ||
      (!property.multiple && parsed.length > 1)
    ) {
      throw new Error(`${property.name} requires declared people within its cardinality`);
    }
    return [...new Set(parsed)];
  }
  if (property.type === 'files') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid file list`);
    }
    const files = DatabaseFilesValueSchema.safeParse(parsed);
    if (!files.success || (property.required && files.data.length === 0)) {
      throw new Error(`${property.name} requires unique safe local assets or HTTP(S) URLs`);
    }
    return files.data;
  }
  if (property.type === 'place') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid JSON place object`);
    }
    try {
      return constrained(canonicalizeDatabasePlaceValue(parsed));
    } catch {
      throw new Error(
        `${property.name} requires a label or address, valid coordinates, precision, and source`,
      );
    }
  }
  if (property.type === 'relation') {
    if (property.cardinality === 'one') {
      if (!DatabaseRecordIdSchema.safeParse(draft).success) {
        throw new Error(`${property.name} requires one stable record ID`);
      }
      return constrained(draft);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid record ID list`);
    }
    if (
      !Array.isArray(parsed) ||
      parsed.some((recordId) => !DatabaseRecordIdSchema.safeParse(recordId).success) ||
      new Set(parsed).size !== parsed.length ||
      (property.required && parsed.length === 0)
    ) {
      throw new Error(`${property.name} requires unique record IDs within its cardinality`);
    }
    return constrained(parsed);
  }
  return constrained(draft);
}

export function isDatabaseCellEditable(property: DatabaseProperty): boolean {
  return [
    'title',
    'text',
    'number',
    'checkbox',
    'select',
    'status',
    'multi_select',
    'person',
    'files',
    'relation',
    'url',
    'email',
    'phone',
    'date',
    'place',
  ].includes(property.type);
}
