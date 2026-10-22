import type { DatabaseDefinition } from '@nedian0brien/synapsenote-core';
import type { DatabaseDesiredStateDraftInput } from '@nedian0brien/synapsenote-server';

export function databaseDraftBase(
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
