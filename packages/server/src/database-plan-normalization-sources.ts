import {
  DATABASE_DEFAULT_STATUS_BLUEPRINT,
  type DatabaseDefinition,
} from '@nedian0brien/synapsenote-core';
import { compactDatabasePlanUuid as compactUuid } from './database-plan-convergence-policy.ts';
import type { DatabaseDesiredStateDraft } from './database-plan-draft-contracts.ts';
import type { DatabasePlanNormalizationIdentity } from './database-plan-normalization-identity.ts';

export function normalizeDatabasePlanSources(
  input: Pick<
    DatabasePlanNormalizationIdentity,
    | 'currentSourceByDesiredKey'
    | 'sourceIdByKey'
    | 'propertyIdsBySource'
    | 'targetResolutions'
    | 'wantsMarkdownTableStorage'
  > & { desiredState: DatabaseDesiredStateDraft; generateUuid: () => string },
): DatabaseDefinition['sources'] {
  const {
    desiredState,
    currentSourceByDesiredKey,
    sourceIdByKey,
    propertyIdsBySource,
    targetResolutions,
    wantsMarkdownTableStorage,
  } = input;
  const storedProperty = (property: { type: string }): boolean =>
    !new Set([
      'formula',
      'rollup',
      'created_time',
      'last_edited_time',
      'created_by',
      'last_edited_by',
      'verification',
      'button',
    ]).has(property.type);
  const normalizedSources = desiredState.sources.map((source) => ({
    id: sourceIdByKey.get(source.key),
    key: source.key,
    name: source.name,
    ...(typeof source.description === 'string' ? { description: source.description } : {}),
    recordMeaning: source.recordMeaning,
    folder: source.folder,
    includeSubfolders:
      typeof source.includeSubfolders === 'boolean' ? source.includeSubfolders : true,
    ...(typeof source.defaultViewId === 'string' ? { defaultViewId: source.defaultViewId } : {}),
    properties: source.properties.map((property) => {
      const propertyId = propertyIdsBySource.get(source.key)?.get(property.key);
      const currentSource = currentSourceByDesiredKey.get(source.key);
      const currentProperty =
        currentSource && currentSource.id === sourceIdByKey.get(source.key)
          ? currentSource.properties.find((candidate) => candidate.id === propertyId)
          : undefined;
      const base = {
        id: propertyId,
        key: property.key,
        name: property.name,
        ...(typeof property.description === 'string' ? { description: property.description } : {}),
        ...(Array.isArray(property.aliases) ? { aliases: property.aliases } : {}),
        ...(typeof property.required === 'boolean' ? { required: property.required } : {}),
        ...(property.semantics && typeof property.semantics === 'object'
          ? { semantics: property.semantics }
          : {}),
        type: property.type,
      };
      if (property.type === 'status') {
        const providedGroups = Array.isArray(property.groups)
          ? property.groups
          : DATABASE_DEFAULT_STATUS_BLUEPRINT.map((entry) => entry.group);
        const currentStatus = currentProperty?.type === 'status' ? currentProperty : undefined;
        const groups = providedGroups.map((group: unknown) => {
          if (!group || typeof group !== 'object' || Array.isArray(group)) {
            throw new Error(`Property "${property.key}" has an invalid status group`);
          }
          const value = group as Record<string, unknown>;
          const currentGroup = currentStatus?.groups.find(
            (candidate) => candidate.key === value.key,
          );
          return {
            id:
              typeof value.id === 'string'
                ? value.id
                : (currentGroup?.id ?? `stg_${compactUuid(input.generateUuid)}`),
            key: value.key,
            name: value.name,
            category: value.category,
            ...(typeof value.color === 'string' ? { color: value.color } : {}),
          };
        });
        const groupIdByKey = new Map(groups.map((group) => [group.key, group.id] as const));
        const providedOptions = Array.isArray(property.options)
          ? property.options
          : DATABASE_DEFAULT_STATUS_BLUEPRINT.flatMap((entry) =>
              entry.options.map((option) => ({ ...option, groupKey: entry.group.key })),
            );
        return {
          ...base,
          groups,
          options: providedOptions.map((option: unknown) => {
            if (!option || typeof option !== 'object' || Array.isArray(option)) {
              throw new Error(`Property "${property.key}" has an invalid status option`);
            }
            const value = option as Record<string, unknown>;
            const currentOption = currentStatus?.options.find(
              (candidate) => candidate.key === value.key,
            );
            const optionId =
              typeof value.id === 'string'
                ? value.id
                : (currentOption?.id ?? `opt_${compactUuid(input.generateUuid)}`);
            const groupId =
              typeof value.groupId === 'string'
                ? value.groupId
                : groupIdByKey.get(String(value.groupKey ?? ''));
            if (!groupId) {
              throw new Error(`Status option "${String(value.key)}" has an unknown group key`);
            }
            targetResolutions.push({
              kind: 'option',
              selector: `sources.${source.key}.properties.${property.key}.options.${String(value.key)}`,
              targetId: optionId,
              via:
                typeof value.id === 'string'
                  ? 'explicit_id'
                  : currentOption
                    ? 'stable_key'
                    : 'generated',
            });
            return {
              id: optionId,
              key: value.key,
              name: value.name,
              groupId,
              ...(typeof value.color === 'string' ? { color: value.color } : {}),
              ...(typeof value.archived === 'boolean' ? { archived: value.archived } : {}),
            };
          }),
        };
      }
      if (property.type === 'select' || property.type === 'multi_select') {
        if (!Array.isArray(property.options))
          throw new Error(`Property "${property.key}" requires options`);
        return {
          ...base,
          options: property.options.map((option: unknown) => {
            if (!option || typeof option !== 'object' || Array.isArray(option)) {
              throw new Error(`Property "${property.key}" has an invalid option`);
            }
            const value = option as Record<string, unknown>;
            const currentOption =
              currentProperty?.type === 'select' || currentProperty?.type === 'multi_select'
                ? currentProperty.options.find((candidate) => candidate.key === value.key)
                : undefined;
            const optionId =
              typeof value.id === 'string'
                ? value.id
                : (currentOption?.id ?? `opt_${compactUuid(input.generateUuid)}`);
            targetResolutions.push({
              kind: 'option',
              selector: `sources.${source.key}.properties.${property.key}.options.${String(value.key)}`,
              targetId: optionId,
              via:
                typeof value.id === 'string'
                  ? 'explicit_id'
                  : currentOption
                    ? 'stable_key'
                    : 'generated',
            });
            return {
              id: optionId,
              key: value.key,
              name: value.name,
              ...(typeof value.color === 'string' ? { color: value.color } : {}),
              ...(typeof value.archived === 'boolean' ? { archived: value.archived } : {}),
            };
          }),
        };
      }
      if (property.type === 'relation') {
        const targetSourceKey = String(property.targetSourceKey ?? '');
        const targetSourceId =
          typeof property.targetSourceId === 'string'
            ? property.targetSourceId
            : sourceIdByKey.get(targetSourceKey);
        if (!targetSourceId) {
          throw new Error(
            `Relation "${property.key}" has unknown target source key "${targetSourceKey}"`,
          );
        }
        const resolvedTargetSourceKey =
          targetSourceKey ||
          [...sourceIdByKey.entries()].find(([, sourceId]) => sourceId === targetSourceId)?.[0];
        const pairedPropertyKey =
          typeof property.pairedPropertyKey === 'string' ? property.pairedPropertyKey : '';
        const pairedPropertyId =
          typeof property.pairedPropertyId === 'string'
            ? property.pairedPropertyId
            : pairedPropertyKey && resolvedTargetSourceKey
              ? propertyIdsBySource.get(resolvedTargetSourceKey)?.get(pairedPropertyKey)
              : undefined;
        if (pairedPropertyKey && !pairedPropertyId) {
          throw new Error(
            `Relation "${property.key}" has unknown paired property key "${pairedPropertyKey}" in target source`,
          );
        }
        if (pairedPropertyId) {
          targetResolutions.push({
            kind: 'property',
            selector: `sources.${source.key}.properties.${property.key}.pairedProperty`,
            targetId: pairedPropertyId,
            via: typeof property.pairedPropertyId === 'string' ? 'explicit_id' : 'stable_key',
          });
        }
        // A cross-database target arrives as an explicit pair of IDs: its
        // source is not in `sourceIdByKey`, so there is no key to compile,
        // and the database it belongs to has to be carried through rather
        // than inferred. Same-database relations omit it, as before.
        const targetDatabaseId =
          typeof property.targetDatabaseId === 'string' ? property.targetDatabaseId : undefined;
        return {
          ...base,
          targetSourceId,
          ...(targetDatabaseId ? { targetDatabaseId } : {}),
          ...(pairedPropertyId ? { pairedPropertyId } : {}),
          ...(property.cardinality === 'one' || property.cardinality === 'many'
            ? { cardinality: property.cardinality }
            : {}),
        };
      }
      if (property.type === 'unique_id') {
        const currentUniqueId = currentProperty?.type === 'unique_id' ? currentProperty : undefined;
        return {
          ...base,
          required: false,
          prefix:
            typeof property.prefix === 'string'
              ? property.prefix
              : (currentUniqueId?.prefix ?? property.key.toUpperCase()),
          nextNumber:
            typeof property.nextNumber === 'number'
              ? property.nextNumber
              : (currentUniqueId?.nextNumber ?? 1),
        };
      }
      if (property.type === 'place') {
        const currentPlace = currentProperty?.type === 'place' ? currentProperty : undefined;
        return {
          ...base,
          externalSearch:
            property.externalSearch === 'explicit' || property.externalSearch === 'disabled'
              ? property.externalSearch
              : (currentPlace?.externalSearch ?? 'disabled'),
          externalMap:
            property.externalMap === 'explicit' || property.externalMap === 'disabled'
              ? property.externalMap
              : (currentPlace?.externalMap ?? 'disabled'),
        };
      }
      if (property.type === 'button') {
        if (typeof property.label !== 'string' || !Array.isArray(property.actions)) {
          throw new Error(`Button "${property.key}" requires a label and actions`);
        }
        const actions = property.actions.map((rawAction: unknown, actionIndex: number) => {
          if (!rawAction || typeof rawAction !== 'object' || Array.isArray(rawAction)) {
            throw new Error(`Button "${property.key}" has an invalid action`);
          }
          const action = rawAction as Record<string, unknown>;
          const common = { id: action.id, kind: action.kind };
          const resolvePropertyId = (
            sourceKey: string,
            explicitId: unknown,
            stableKey: unknown,
            selector: string,
          ): string => {
            const byKey =
              typeof stableKey === 'string'
                ? propertyIdsBySource.get(sourceKey)?.get(stableKey)
                : undefined;
            const propertyId = typeof explicitId === 'string' ? explicitId : byKey;
            if (!propertyId) {
              throw new Error(
                `Button "${property.key}" action "${String(action.id)}" references unknown property key "${String(stableKey ?? '')}"`,
              );
            }
            targetResolutions.push({
              kind: 'property',
              selector,
              targetId: propertyId,
              via: typeof explicitId === 'string' ? 'explicit_id' : 'stable_key',
            });
            return propertyId;
          };
          if (action.kind === 'update_record') {
            if (!Array.isArray(action.operations)) {
              throw new Error(`Button update action "${String(action.id)}" requires operations`);
            }
            return {
              ...common,
              operations: action.operations.map((rawOperation: unknown, operationIndex: number) => {
                if (
                  !rawOperation ||
                  typeof rawOperation !== 'object' ||
                  Array.isArray(rawOperation)
                ) {
                  throw new Error(`Button update action "${String(action.id)}" is invalid`);
                }
                const operation = rawOperation as Record<string, unknown>;
                if (
                  operation.op === 'append' &&
                  operation.propertyId === undefined &&
                  operation.propertyKey === undefined
                ) {
                  return operation;
                }
                const propertyId = resolvePropertyId(
                  source.key,
                  operation.propertyId,
                  operation.propertyKey,
                  `sources.${source.key}.properties.${property.key}.actions.${actionIndex}.operations.${operationIndex}.property`,
                );
                const { propertyKey: _propertyKey, ...canonical } = operation;
                return { ...canonical, propertyId };
              }),
            };
          }
          if (action.kind === 'create_record') {
            const targetSourceKey =
              typeof action.sourceKey === 'string'
                ? action.sourceKey
                : [...sourceIdByKey.entries()].find(([, id]) => id === action.sourceId)?.[0];
            const targetSourceId =
              typeof action.sourceId === 'string'
                ? action.sourceId
                : targetSourceKey
                  ? sourceIdByKey.get(targetSourceKey)
                  : undefined;
            if (!targetSourceKey || !targetSourceId) {
              throw new Error(
                `Button create action "${String(action.id)}" references an unknown source`,
              );
            }
            targetResolutions.push({
              kind: 'source',
              selector: `sources.${source.key}.properties.${property.key}.actions.${actionIndex}.source`,
              targetId: targetSourceId,
              via: typeof action.sourceId === 'string' ? 'explicit_id' : 'stable_key',
            });
            if (
              !action.values ||
              typeof action.values !== 'object' ||
              Array.isArray(action.values)
            ) {
              throw new Error(`Button create action "${String(action.id)}" requires values`);
            }
            const targetIds = propertyIdsBySource.get(targetSourceKey);
            const canonicalValues = Object.fromEntries(
              Object.entries(action.values).map(([reference, value]) => {
                const propertyId = [...(targetIds?.values() ?? [])].includes(reference)
                  ? reference
                  : targetIds?.get(reference);
                if (!propertyId) {
                  throw new Error(
                    `Button create action "${String(action.id)}" references unknown property "${reference}"`,
                  );
                }
                targetResolutions.push({
                  kind: 'property',
                  selector: `sources.${source.key}.properties.${property.key}.actions.${actionIndex}.values.${reference}`,
                  targetId: propertyId,
                  via: propertyId === reference ? 'explicit_id' : 'stable_key',
                });
                return [propertyId, value];
              }),
            );
            return {
              ...common,
              sourceId: targetSourceId,
              values: canonicalValues,
              ...(typeof action.body === 'string' ? { body: action.body } : {}),
            };
          }
          if (action.kind === 'external_webhook') {
            const propertyReferences = Array.isArray(action.propertyIds)
              ? action.propertyIds
              : Array.isArray(action.propertyKeys)
                ? action.propertyKeys
                : [];
            return {
              ...common,
              connectionId: action.connectionId,
              eventName: action.eventName,
              propertyIds: propertyReferences.map((reference, propertyIndex) =>
                resolvePropertyId(
                  source.key,
                  Array.isArray(action.propertyIds) ? reference : undefined,
                  Array.isArray(action.propertyKeys) ? reference : undefined,
                  `sources.${source.key}.properties.${property.key}.actions.${actionIndex}.properties.${propertyIndex}`,
                ),
              ),
              ...(typeof action.includeBody === 'boolean'
                ? { includeBody: action.includeBody }
                : {}),
            };
          }
          if (action.kind === 'archive_record') {
            return { ...common, action: action.action };
          }
          throw new Error(
            `Button "${property.key}" has unsupported action kind "${String(action.kind)}"`,
          );
        });
        return {
          ...base,
          label: property.label,
          ...(property.confirmation &&
          typeof property.confirmation === 'object' &&
          !Array.isArray(property.confirmation)
            ? { confirmation: property.confirmation }
            : {}),
          actions,
        };
      }
      if (property.type === 'formula') {
        if (typeof property.source !== 'string') {
          throw new Error(`Formula "${property.key}" requires source`);
        }
        if (!property.ast || typeof property.ast !== 'object' || Array.isArray(property.ast)) {
          throw new Error(`Formula "${property.key}" requires a canonical AST`);
        }
        return {
          ...base,
          source: property.source,
          ast: property.ast,
        };
      }
      if (property.type === 'rollup') {
        const relationPropertyKey =
          typeof property.relationPropertyKey === 'string'
            ? property.relationPropertyKey
            : undefined;
        const relationPropertyId =
          typeof property.relationPropertyId === 'string'
            ? property.relationPropertyId
            : relationPropertyKey
              ? propertyIdsBySource.get(source.key)?.get(relationPropertyKey)
              : undefined;
        if (!relationPropertyId) {
          throw new Error(
            `Rollup "${property.key}" has unknown relation property key "${relationPropertyKey ?? ''}"`,
          );
        }
        const relationDraft = source.properties.find(
          (candidate) =>
            candidate.type === 'relation' &&
            (candidate.id === relationPropertyId ||
              propertyIdsBySource.get(source.key)?.get(candidate.key) === relationPropertyId),
        );
        const currentRelationCandidate = currentSource?.properties.find(
          (candidate) => candidate.id === relationPropertyId,
        );
        const currentRelation =
          currentRelationCandidate?.type === 'relation' ? currentRelationCandidate : undefined;
        const targetSourceKey =
          relationDraft && typeof relationDraft.targetSourceKey === 'string'
            ? relationDraft.targetSourceKey
            : relationDraft && typeof relationDraft.targetSourceId === 'string'
              ? [...sourceIdByKey.entries()].find(
                  ([, sourceId]) => sourceId === relationDraft.targetSourceId,
                )?.[0]
              : currentRelation
                ? [...sourceIdByKey.entries()].find(
                    ([, sourceId]) => sourceId === currentRelation.targetSourceId,
                  )?.[0]
                : undefined;
        const targetPropertyKey =
          typeof property.targetPropertyKey === 'string' ? property.targetPropertyKey : undefined;
        const targetPropertyId =
          typeof property.targetPropertyId === 'string'
            ? property.targetPropertyId
            : targetSourceKey && targetPropertyKey
              ? propertyIdsBySource.get(targetSourceKey)?.get(targetPropertyKey)
              : undefined;
        if (!targetPropertyId) {
          throw new Error(
            `Rollup "${property.key}" has unknown target property key "${targetPropertyKey ?? ''}"`,
          );
        }
        if (typeof property.function !== 'string') {
          throw new Error(`Rollup "${property.key}" requires a function`);
        }
        if (typeof property.targetValueType !== 'string') {
          throw new Error(`Rollup "${property.key}" requires targetValueType`);
        }
        targetResolutions.push(
          {
            kind: 'property',
            selector: `sources.${source.key}.properties.${property.key}.relationProperty`,
            targetId: relationPropertyId,
            via: typeof property.relationPropertyId === 'string' ? 'explicit_id' : 'stable_key',
          },
          {
            kind: 'property',
            selector: `sources.${source.key}.properties.${property.key}.targetProperty`,
            targetId: targetPropertyId,
            via: typeof property.targetPropertyId === 'string' ? 'explicit_id' : 'stable_key',
          },
        );
        return {
          ...base,
          relationPropertyId,
          targetPropertyId,
          function: property.function,
          targetValueType: property.targetValueType,
          ...(typeof property.targetItemType === 'string'
            ? { targetItemType: property.targetItemType }
            : {}),
        };
      }
      return base;
    }),
    ...(wantsMarkdownTableStorage
      ? {
          storage: (() => {
            const current = currentSourceByDesiredKey.get(source.key)?.storage;
            const raw = source.storage;
            const currentOwner = current?.kind === 'markdown_table' ? current.owner : undefined;
            const rawOwner = raw && typeof raw === 'object' ? raw : undefined;
            const ownerPath =
              (rawOwner && 'ownerPath' in rawOwner ? rawOwner.ownerPath : undefined) ??
              (rawOwner &&
              'owner' in rawOwner &&
              rawOwner.owner &&
              typeof rawOwner.owner === 'object'
                ? rawOwner.owner.path
                : undefined) ??
              currentOwner?.path ??
              `${desiredState.database.key}${source.key === desiredState.database.key ? '' : `-${source.key}`}.md`;
            const sourceId = sourceIdByKey.get(source.key) ?? '';
            const blockId =
              (rawOwner && 'blockId' in rawOwner ? rawOwner.blockId : undefined) ??
              (rawOwner &&
              'owner' in rawOwner &&
              rawOwner.owner &&
              typeof rawOwner.owner === 'object'
                ? rawOwner.owner.blockId
                : undefined) ??
              currentOwner?.blockId ??
              `dbb_${sourceId
                .replace(/^ds_/, '')
                .replace(/[^A-Za-z0-9_-]/g, '_')
                .slice(0, 110)}_primary`;
            const titlePropertyId = propertyIdsBySource
              .get(source.key)
              ?.get(source.properties.find((property) => property.type === 'title')?.key ?? '');
            if (!titlePropertyId) throw new Error(`Source "${source.key}" has no Title property`);
            const storedPropertyIds = source.properties
              .filter((property) => storedProperty(property))
              .map((property) => propertyIdsBySource.get(source.key)?.get(property.key))
              .filter((propertyId): propertyId is string => propertyId !== undefined);
            return {
              kind: 'markdown_table' as const,
              formatVersion: 2 as const,
              owner: { path: ownerPath, blockId },
              titlePropertyId,
              storedPropertyIds,
            };
          })(),
        }
      : {}),
  })) as unknown as DatabaseDefinition['sources'];
  return normalizedSources;
}
