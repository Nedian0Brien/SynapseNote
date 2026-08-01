import {
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  type DatabasePerson,
} from '@nedian0brien/synapsenote-core';
import { compactDatabasePlanUuid as compactUuid } from './database-plan-convergence-policy.ts';
import {
  DatabaseAutomationEventValueDraftSchema,
  type DatabaseDesiredStateDraft,
} from './database-plan-draft-contracts.ts';
import type { DatabasePlanNormalizationIdentity } from './database-plan-normalization-identity.ts';
import {
  normalizeDatabaseFilter as filterWithPropertyIds,
  normalizeDatabaseSampleValue as normalizeSampleValue,
} from './database-plan-normalization-policy.ts';

export interface DatabasePlanNormalizedSchema {
  definition: DatabaseDefinition;
  uniquePropertyId: string | null;
}

export function composeDatabasePlanSchema(
  input: DatabasePlanNormalizationIdentity & {
    desiredState: DatabaseDesiredStateDraft;
    normalizedSources: DatabaseDefinition['sources'];
    generateUuid: () => string;
  },
): DatabasePlanNormalizedSchema {
  const {
    desiredState,
    currentDefinition,
    targetResolutions,
    databaseId,
    normalizedPeople,
    sourceIdByKey,
    propertyIdsBySource,
    wantsMarkdownTableStorage,
    normalizedSources,
  } = input;
  const normalizedSourceMappings =
    desiredState.sourceMappings === undefined
      ? (currentDefinition?.sourceMappings ?? [])
      : desiredState.sourceMappings.map((mapping) => {
          const sourceId = sourceIdByKey.get(mapping.sourceKey);
          const targetSourceId = sourceIdByKey.get(mapping.targetSourceKey);
          const source = normalizedSources.find((candidate) => candidate.id === sourceId);
          const target = normalizedSources.find((candidate) => candidate.id === targetSourceId);
          if (!source || !target) {
            throw new Error(
              `Source mapping references unknown source keys "${mapping.sourceKey}" and "${mapping.targetSourceKey}"`,
            );
          }
          return {
            sourceId,
            targetSourceId,
            propertyMappings: mapping.propertyMappings.map((propertyMapping) => {
              const sourceProperty = source.properties.find(
                (property) => property.key === propertyMapping.sourcePropertyKey,
              );
              const targetProperty = target.properties.find(
                (property) => property.key === propertyMapping.targetPropertyKey,
              );
              if (!sourceProperty || !targetProperty) {
                throw new Error(
                  `Source mapping references unknown property keys "${propertyMapping.sourcePropertyKey}" and "${propertyMapping.targetPropertyKey}"`,
                );
              }
              const sourceOptions =
                'options' in sourceProperty ? sourceProperty.options : undefined;
              const targetOptions =
                'options' in targetProperty ? targetProperty.options : undefined;
              return {
                sourcePropertyId: sourceProperty.id,
                targetPropertyId: targetProperty.id,
                optionMappings: propertyMapping.optionMappings.map((optionMapping) => {
                  const sourceOption = sourceOptions?.find(
                    (option) => option.key === optionMapping.sourceOptionKey,
                  );
                  const targetOption = targetOptions?.find(
                    (option) => option.key === optionMapping.targetOptionKey,
                  );
                  if (!sourceOption || !targetOption) {
                    throw new Error(
                      `Source mapping references unknown option keys "${optionMapping.sourceOptionKey}" and "${optionMapping.targetOptionKey}"`,
                    );
                  }
                  return {
                    sourceOptionId: sourceOption.id,
                    targetOptionId: targetOption.id,
                  };
                }),
              };
            }),
          };
        });
  const normalizedViews = desiredState.views.map((view) => {
    const sourceId = sourceIdByKey.get(view.sourceKey);
    const propertyIds = propertyIdsBySource.get(view.sourceKey);
    if (!sourceId || !propertyIds) throw new Error(`View "${view.key}" has an unknown source key`);
    const raw = view as Record<string, unknown>;
    const projection = (raw.projection ?? {}) as Record<string, unknown>;
    const projectionPropertyIds = Array.isArray(projection.propertyIds)
      ? projection.propertyIds.map(String)
      : null;
    const propertyKeys = Array.isArray(projection.propertyKeys)
      ? projection.propertyKeys.map(String)
      : projectionPropertyIds
        ? []
        : [...propertyIds.keys()];
    const knownPropertyIds = new Set(propertyIds.values());
    const propertiesById = new Map(
      normalizedSources
        .find((source) => source.id === sourceId)
        ?.properties.map((property) => [property.id, property] as const) ?? [],
    );
    const resolveViewPropertyId = (entry: Record<string, unknown>, context: string) => {
      const explicit = String(entry.propertyId ?? '');
      const resolved = knownPropertyIds.has(explicit)
        ? explicit
        : propertyIds.get(String(entry.propertyKey ?? ''));
      if (!resolved) throw new Error(`View "${view.key}" ${context} has an unknown property`);
      return resolved;
    };
    const currentView = currentDefinition?.views.find((candidate) => candidate.key === view.key);
    const viewId = view.id ?? currentView?.id ?? `view_${compactUuid(input.generateUuid)}`;
    targetResolutions.push({
      kind: 'view',
      selector: `views.${view.key}`,
      targetId: viewId,
      via: view.id ? 'explicit_id' : currentView ? 'stable_key' : 'generated',
    });
    const conditionalColors = Array.isArray(raw.conditionalColors)
      ? raw.conditionalColors.map((entry, index) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`View "${view.key}" conditional color ${index + 1} must be an object`);
          }
          const item = entry as Record<string, unknown>;
          const key = String(item.key ?? '');
          if (!key) {
            throw new Error(`View "${view.key}" conditional color ${index + 1} needs a key`);
          }
          const currentRule = currentView?.conditionalColors.find(
            (candidate) => candidate.key === key,
          );
          const explicitId = typeof item.id === 'string' ? item.id : undefined;
          const id = explicitId ?? currentRule?.id ?? `ccr_${compactUuid(input.generateUuid)}`;
          targetResolutions.push({
            kind: 'conditional_color_rule',
            selector: `views.${view.key}.conditionalColors.${key}`,
            targetId: id,
            via: explicitId ? 'explicit_id' : currentRule ? 'stable_key' : 'generated',
          });
          const applyTo = item.applyTo;
          if (!applyTo || typeof applyTo !== 'object' || Array.isArray(applyTo)) {
            throw new Error(
              `View "${view.key}" conditional color "${key}" needs an applyTo object`,
            );
          }
          const target = applyTo as Record<string, unknown>;
          return {
            id,
            key,
            name: item.name,
            color: item.color,
            where: filterWithPropertyIds(
              item.where,
              propertyIds,
              propertiesById,
              normalizedPeople as DatabasePerson[],
            ),
            applyTo:
              target.type === 'page'
                ? { type: 'page' as const }
                : target.type === 'property'
                  ? {
                      type: 'property' as const,
                      propertyId: resolveViewPropertyId(target, 'conditional color target'),
                    }
                  : (() => {
                      throw new Error(
                        `View "${view.key}" conditional color "${key}" has an invalid target`,
                      );
                    })(),
          };
        })
      : [];
    return {
      id: viewId,
      key: view.key,
      name: view.name,
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
      ...(typeof raw.favorite === 'boolean' ? { favorite: raw.favorite } : {}),
      sourceId,
      layout: view.layout,
      ...(raw.where
        ? {
            where: filterWithPropertyIds(
              raw.where,
              propertyIds,
              propertiesById,
              normalizedPeople as DatabasePerson[],
            ),
          }
        : {}),
      conditionalColors,
      sort: Array.isArray(raw.sort)
        ? raw.sort.map((entry) => {
            const item = entry as Record<string, unknown>;
            return {
              propertyId: resolveViewPropertyId(item, 'sort'),
              direction: item.direction,
            };
          })
        : [],
      groups: Array.isArray(raw.groups)
        ? raw.groups.map((entry) => {
            const item = entry as Record<string, unknown>;
            return {
              propertyId: resolveViewPropertyId(item, 'group'),
              direction: item.direction,
              ...(typeof item.hideEmpty === 'boolean' ? { hideEmpty: item.hideEmpty } : {}),
            };
          })
        : [],
      projection: {
        propertyIds: projectionPropertyIds
          ? projectionPropertyIds.map((propertyId) => {
              if (!knownPropertyIds.has(propertyId)) {
                throw new Error(
                  `View "${view.key}" projection has unknown property ID "${propertyId}"`,
                );
              }
              return propertyId;
            })
          : propertyKeys.map((key) => {
              const propertyId = propertyIds.get(key);
              if (!propertyId)
                throw new Error(`View "${view.key}" projection has unknown property key "${key}"`);
              return propertyId;
            }),
        ...(projection.body === 'hidden' ||
        projection.body === 'preview' ||
        projection.body === 'full'
          ? { body: projection.body }
          : {}),
      },
      ...(raw.agent && typeof raw.agent === 'object' && !Array.isArray(raw.agent)
        ? { agent: raw.agent }
        : {}),
    };
  });
  const normalizedTemplates = desiredState.templates.map((template, templateIndex) => {
    const sourceId = sourceIdByKey.get(template.sourceKey);
    const source = normalizedSources.find((candidate) => candidate.id === sourceId);
    if (!sourceId || !source) {
      throw new Error(`Template "${template.key}" has unknown source key "${template.sourceKey}"`);
    }
    const currentTemplate = currentDefinition?.templates.find(
      (candidate) => candidate.key === template.key,
    );
    const id = template.id ?? currentTemplate?.id ?? `tpl_${compactUuid(input.generateUuid)}`;
    targetResolutions.push({
      kind: 'template',
      selector: `templates.${template.key}`,
      targetId: id,
      via: template.id ? 'explicit_id' : currentTemplate ? 'stable_key' : 'generated',
    });
    const propertyValues: Record<string, unknown> = {};
    for (const [propertyKey, value] of Object.entries(template.propertyValues)) {
      const property = source.properties.find((candidate) => candidate.key === propertyKey);
      if (!property) {
        throw new Error(
          `Template "${template.key}" references unknown property key "${propertyKey}"`,
        );
      }
      propertyValues[property.id] = normalizeSampleValue(
        property,
        value,
        normalizedPeople as DatabasePerson[],
      );
    }
    const viewIds = (template.defaultFor?.viewKeys ?? []).map((viewKey) => {
      const view = normalizedViews.find(
        (candidate) => candidate.key === viewKey && candidate.sourceId === sourceId,
      );
      if (!view) {
        throw new Error(`Template "${template.key}" references unknown view key "${viewKey}"`);
      }
      return view.id;
    });
    const repeat = template.repeat
      ? (() => {
          const owner = normalizedPeople.find((person) => person.key === template.repeat?.ownerKey);
          if (!owner) {
            throw new Error(
              `Template "${template.key}" references unknown owner key "${template.repeat.ownerKey}"`,
            );
          }
          return {
            schedule: structuredClone(template.repeat.schedule),
            timeZone: template.repeat.timeZone,
            ownerId: owner.id,
            paused: template.repeat.paused,
            ...(template.repeat.retry ? { retry: structuredClone(template.repeat.retry) } : {}),
          };
        })()
      : undefined;
    return {
      id,
      key: template.key,
      name: template.name,
      ...(template.description ? { description: template.description } : {}),
      sourceId,
      propertyValues,
      body: template.body ?? template.markdown ?? '',
      order: template.order ?? currentTemplate?.order ?? templateIndex,
      archivedAt: template.archivedAt ?? currentTemplate?.archivedAt ?? null,
      defaultFor: {
        source: template.defaultFor?.source ?? false,
        viewIds,
        entryPoints: template.defaultFor?.entryPoints ?? [],
      },
      ...(repeat ? { repeat } : {}),
    };
  });
  const normalizedButtons = desiredState.buttons.map((button) => {
    const currentButton = currentDefinition?.buttons.find(
      (candidate) => candidate.key === button.key,
    );
    const id = button.id ?? currentButton?.id ?? `dbbtn_${compactUuid(input.generateUuid)}`;
    targetResolutions.push({
      kind: 'action_button',
      selector: `buttons.${button.key}`,
      targetId: id,
      via: button.id ? 'explicit_id' : currentButton ? 'stable_key' : 'generated',
    });
    const placement =
      button.placement.kind === 'database'
        ? { kind: 'database' as const }
        : (() => {
            const sourceId = sourceIdByKey.get(button.placement.sourceKey);
            if (!sourceId) {
              throw new Error(
                `Database button "${button.key}" has unknown placement source "${button.placement.sourceKey}"`,
              );
            }
            return { kind: 'source' as const, sourceId };
          })();
    return {
      id,
      key: button.key,
      name: button.name,
      ...(button.description ? { description: button.description } : {}),
      placement,
      ...(button.confirmation ? { confirmation: button.confirmation } : {}),
      actions: button.actions.map((action) => {
        const sourceId = sourceIdByKey.get(action.sourceKey);
        const source = normalizedSources.find((candidate) => candidate.id === sourceId);
        if (!sourceId || !source) {
          throw new Error(
            `Database button "${button.key}" action "${action.id}" has unknown source "${action.sourceKey}"`,
          );
        }
        const values: Record<string, unknown> = {};
        for (const [propertyKey, value] of Object.entries(action.values)) {
          const property = source.properties.find((candidate) => candidate.key === propertyKey);
          if (!property) {
            throw new Error(
              `Database button "${button.key}" action "${action.id}" has unknown property "${propertyKey}"`,
            );
          }
          values[property.id] = normalizeSampleValue(
            property,
            value,
            normalizedPeople as DatabasePerson[],
          );
        }
        return { id: action.id, kind: action.kind, sourceId, values, body: action.body };
      }),
    };
  });
  const normalizedAutomations = (
    desiredState.automations ??
    currentDefinition?.automations ??
    []
  ).map((automation) => {
    if ('ownerId' in automation) return structuredClone(automation);
    const currentAutomation = currentDefinition?.automations.find(
      (candidate) => candidate.key === automation.key,
    );
    const id = automation.id ?? currentAutomation?.id ?? `auto_${compactUuid(input.generateUuid)}`;
    targetResolutions.push({
      kind: 'automation',
      selector: `automations.${automation.key}`,
      targetId: id,
      via: automation.id ? 'explicit_id' : currentAutomation ? 'stable_key' : 'generated',
    });
    const owner = normalizedPeople.find((person) => person.key === automation.ownerKey);
    if (!owner)
      throw new Error(`Automation "${automation.key}" has unknown owner "${automation.ownerKey}"`);
    const sourceForKey = (sourceKey: string) => {
      const source = normalizedSources.find((candidate) => candidate.key === sourceKey);
      if (!source)
        throw new Error(`Automation "${automation.key}" has unknown source "${sourceKey}"`);
      return source;
    };
    const propertyForKey = (source: DatabaseDefinition['sources'][number], propertyKey: string) => {
      const property = source.properties.find((candidate) => candidate.key === propertyKey);
      if (!property) {
        throw new Error(
          `Automation "${automation.key}" has unknown property "${propertyKey}" in source "${source.key}"`,
        );
      }
      return property;
    };
    const trigger = (() => {
      const input = automation.trigger;
      if (input.kind === 'schedule') {
        return {
          kind: input.kind,
          schedule: structuredClone(input.schedule),
          timeZone: input.timeZone,
        };
      }
      if (input.kind === 'form_submitted') {
        const view = normalizedViews.find((candidate) => candidate.key === input.viewKey);
        if (!view)
          throw new Error(`Automation "${automation.key}" has unknown view "${input.viewKey}"`);
        return { kind: input.kind, viewId: view.id };
      }
      if (input.kind === 'button_invoked' && 'buttonKey' in input) {
        const button = normalizedButtons.find((candidate) => candidate.key === input.buttonKey);
        if (!button) {
          throw new Error(`Automation "${automation.key}" has unknown Button "${input.buttonKey}"`);
        }
        return { kind: input.kind, buttonId: button.id };
      }
      const source = sourceForKey(input.sourceKey);
      if (input.kind === 'record_added') return { kind: input.kind, sourceId: source.id };
      const property = propertyForKey(source, input.propertyKey);
      return input.kind === 'property_changed'
        ? { kind: input.kind, sourceId: source.id, propertyId: property.id }
        : { kind: input.kind, propertyId: property.id };
    })();
    const triggerSource = (() => {
      if ('sourceId' in trigger) {
        return normalizedSources.find((source) => source.id === trigger.sourceId) ?? null;
      }
      if ('viewId' in trigger) {
        const view = normalizedViews.find((candidate) => candidate.id === trigger.viewId);
        return normalizedSources.find((source) => source.id === view?.sourceId) ?? null;
      }
      if ('propertyId' in trigger) {
        return (
          normalizedSources.find((source) =>
            source.properties.some((property) => property.id === trigger.propertyId),
          ) ?? null
        );
      }
      if ('buttonId' in trigger) {
        const button = normalizedButtons.find((candidate) => candidate.id === trigger.buttonId);
        const placement = button?.placement;
        return placement?.kind === 'source'
          ? (normalizedSources.find((source) => source.id === placement.sourceId) ?? null)
          : null;
      }
      return null;
    })();
    const eventValue = (value: unknown): unknown => {
      const parsed = DatabaseAutomationEventValueDraftSchema.safeParse(value);
      if (!parsed.success) return structuredClone(value);
      if (parsed.data.fromEvent !== 'property') return { fromEvent: parsed.data.fromEvent };
      if (!triggerSource || !parsed.data.propertyKey) {
        throw new Error(`Automation "${automation.key}" event property has no trigger source`);
      }
      return {
        fromEvent: 'property' as const,
        propertyId: propertyForKey(triggerSource, parsed.data.propertyKey).id,
      };
    };
    const actions = automation.actions.map((action) => {
      if (action.kind === 'create_record') {
        const source = sourceForKey(action.sourceKey);
        return {
          id: action.id,
          kind: action.kind,
          sourceId: source.id,
          values: Object.fromEntries(
            Object.entries(action.values).map(([propertyKey, value]) => [
              propertyForKey(source, propertyKey).id,
              eventValue(value),
            ]),
          ),
          ...(action.body === undefined ? {} : { body: eventValue(action.body) }),
        };
      }
      if (action.kind === 'update_trigger_record') {
        if (!triggerSource)
          throw new Error(`Automation "${automation.key}" update has no trigger source`);
        return {
          id: action.id,
          kind: action.kind,
          operations: action.operations.map((operation) => {
            if (operation.op === 'append' && operation.propertyKey === undefined) {
              return { op: operation.op, value: operation.value };
            }
            const property = propertyForKey(triggerSource, String(operation.propertyKey));
            const { propertyKey: _propertyKey, ...rest } = operation;
            return { ...rest, propertyId: property.id };
          }),
        };
      }
      if (action.kind === 'change_relation') {
        if (!triggerSource)
          throw new Error(`Automation "${automation.key}" relation has no trigger source`);
        return {
          id: action.id,
          kind: action.kind,
          propertyId: propertyForKey(triggerSource, action.propertyKey).id,
          operation: action.operation,
          recordId: action.recordId,
        };
      }
      if (action.kind === 'assign_person') {
        if (!triggerSource)
          throw new Error(`Automation "${automation.key}" assignment has no trigger source`);
        const person = normalizedPeople.find((candidate) => candidate.key === action.personKey);
        if (!person)
          throw new Error(
            `Automation "${automation.key}" has unknown person "${action.personKey}"`,
          );
        return {
          id: action.id,
          kind: action.kind,
          propertyId: propertyForKey(triggerSource, action.propertyKey).id,
          operation: action.operation,
          personId: person.id,
        };
      }
      if (action.kind === 'notification') {
        return {
          id: action.id,
          kind: action.kind,
          recipientIds: action.recipientKeys.map((personKey) => {
            const person = normalizedPeople.find((candidate) => candidate.key === personKey);
            if (!person)
              throw new Error(
                `Automation "${automation.key}" has unknown recipient "${personKey}"`,
              );
            return person.id;
          }),
          title: action.title,
          body: action.body,
        };
      }
      if (action.kind === 'apply_template') {
        const template = normalizedTemplates.find(
          (candidate) => candidate.key === action.templateKey,
        );
        if (!template)
          throw new Error(
            `Automation "${automation.key}" has unknown template "${action.templateKey}"`,
          );
        return { id: action.id, kind: action.kind, templateId: template.id };
      }
      if (!triggerSource && (action.propertyKeys.length > 0 || action.includeBody)) {
        throw new Error(
          `Automation "${automation.key}" egress has no record-backed trigger source`,
        );
      }
      const propertyIds = action.propertyKeys.map((propertyKey) => {
        if (!triggerSource) {
          throw new Error(`Automation "${automation.key}" egress has no trigger source`);
        }
        return propertyForKey(triggerSource, propertyKey).id;
      });
      return action.kind === 'external_webhook'
        ? {
            id: action.id,
            kind: action.kind,
            connectionId: action.connectionId,
            eventName: action.eventName,
            propertyIds,
            includeBody: action.includeBody,
          }
        : {
            id: action.id,
            kind: action.kind,
            connectionId: action.connectionId,
            to: action.to,
            subject: action.subject,
            propertyIds,
            includeBody: action.includeBody,
          };
    });
    return {
      id,
      key: automation.key,
      name: automation.name,
      ...(automation.description ? { description: automation.description } : {}),
      version: automation.version,
      enabled: automation.enabled,
      ownerId: owner.id,
      trigger,
      actions,
      ...(automation.retry ? { retry: structuredClone(automation.retry) } : {}),
      ...(automation.limits ? { limits: structuredClone(automation.limits) } : {}),
    };
  });
  const rawDefinition = {
    version: wantsMarkdownTableStorage ? (2 as const) : (1 as const),
    id: databaseId,
    key: desiredState.database.key,
    name: desiredState.database.name,
    ...(desiredState.database.description === undefined
      ? {}
      : { description: desiredState.database.description }),
    ...(desiredState.database.icon === undefined ? {} : { icon: desiredState.database.icon }),
    ...(desiredState.database.cover === undefined ? {} : { cover: desiredState.database.cover }),
    aliases: desiredState.database.aliases ?? [],
    people: normalizedPeople,
    contract: desiredState.database.contract,
    sources: normalizedSources,
    ...(normalizedSourceMappings.length > 0 ? { sourceMappings: normalizedSourceMappings } : {}),
    views: normalizedViews,
    templates: normalizedTemplates,
    buttons: normalizedButtons,
    automations: normalizedAutomations,
  };
  let definition = DatabaseDefinitionSchema.parse(rawDefinition);
  let uniquePropertyId: string | null = null;
  if (desiredState.uniqueKey) {
    uniquePropertyId =
      propertyIdsBySource
        .get(desiredState.uniqueKey.sourceKey)
        ?.get(desiredState.uniqueKey.propertyKey) ?? null;
    if (!uniquePropertyId) throw new Error('Unique key references an unknown source/property key');
    definition = DatabaseDefinitionSchema.parse({
      ...definition,
      sources: definition.sources.map((source) => ({
        ...source,
        properties: source.properties.map((property) =>
          property.id === uniquePropertyId
            ? {
                ...property,
                semantics: {
                  ...property.semantics,
                  constraints: {
                    ...property.semantics.constraints,
                    unique: true,
                  },
                },
              }
            : property,
        ),
      })),
    });
  }
  return { definition, uniquePropertyId };
}
