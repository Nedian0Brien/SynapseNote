import { resolve } from 'node:path';
import type { DatabaseDefinition } from '@nedian0brien/synapsenote-core';
import { databaseMarkdownTableDocumentPath } from './database-markdown-table-creation.ts';
import type {
  DatabaseConflictDomain,
  DatabaseConvergenceAction,
  DatabaseDraftArtifact,
} from './database-plan-artifacts.ts';
import {
  databasePlanObjectMap as databaseObjectMap,
  databasePlanErrorCode as errno,
  databaseRecordNeedsPersonRewrite as recordNeedsPersonRewrite,
  databaseRecordNeedsSourceRewrite as recordNeedsSourceRewrite,
  sameDatabasePlanValue as same,
  databaseSourceNeedsRecordRewrite as sourceNeedsRecordRewrite,
  stableDatabasePlanValue as stable,
} from './database-plan-convergence-policy.ts';
import type { DatabasePlanManifestCompilation } from './database-plan-manifest-compiler.ts';
import type { DatabasePlanManifestRecordCompilerContext } from './database-plan-manifest-record-compiler.ts';

/** Record conflicts and convergence classifications, without artifact assembly. */
export function compileDatabasePlanRecords(
  context: DatabasePlanManifestRecordCompilerContext,
  draft: DatabaseDraftArtifact,
  manifest: DatabasePlanManifestCompilation,
) {
  const { definition, byId, manifestAction, conflicts } = manifest;
  const currentObjects = databaseObjectMap(byId);
  const desiredObjects = databaseObjectMap(definition);
  const actionFor = (id: string, value: unknown): DatabaseConvergenceAction => {
    const current = currentObjects.get(id);
    return current === undefined ? 'create' : same(current, value) ? 'noop' : 'update';
  };
  const propertyAction = (
    sourceId: string,
    property: DatabaseDefinition['sources'][number]['properties'][number],
  ): DatabaseConvergenceAction => {
    const currentSource = byId?.sources.find((source) =>
      source.properties.some((candidate) => candidate.id === property.id),
    );
    if (!currentSource) return 'create';
    const current = currentSource.properties.find((candidate) => candidate.id === property.id);
    return currentSource.id !== sourceId || !same(current, property) ? 'update' : 'noop';
  };

  const seenRecordIds = new Set<string>();
  const totalRecordTargets =
    draft.normalized.sampleRecords.length +
    draft.normalized.recordDeletions.length +
    draft.normalized.recordMoves.length;
  if (totalRecordTargets > draft.normalized.policy.maxRecordsPerCommit) {
    conflicts.push({
      code: 'record_limit_exceeded',
      message: `Desired state includes ${totalRecordTargets} record target(s), exceeding the policy limit of ${draft.normalized.policy.maxRecordsPerCommit}`,
      targetId: definition.id,
    });
  }
  const deletionIds = new Set(
    draft.normalized.recordDeletions.map((deletion) => deletion.recordId),
  );
  const movedTargetSourceByRecordId = new Map(
    draft.normalized.recordMoves.map((move) => [move.recordId, move.targetSourceId] as const),
  );
  for (const sample of draft.normalized.sampleRecords) {
    if (seenRecordIds.has(sample.id)) {
      conflicts.push({
        code: 'duplicate_record_target',
        message: `Record "${sample.id}" appears more than once in one desired state`,
        targetId: sample.id,
        sampleRecordId: sample.id,
      });
    }
    seenRecordIds.add(sample.id);
  }
  for (const deletion of draft.normalized.recordDeletions) {
    if (seenRecordIds.has(deletion.recordId)) {
      conflicts.push({
        code: 'duplicate_record_target',
        message: `Record "${deletion.recordId}" is both written and deleted in one desired state`,
        targetId: deletion.recordId,
        sampleRecordId: deletion.recordId,
      });
    }
    seenRecordIds.add(deletion.recordId);
    const current = context.databaseRecordIndex?.getById(deletion.recordId) ?? null;
    if (!current) {
      conflicts.push({
        code: 'record_not_found',
        message: `Record "${deletion.recordId}" no longer exists`,
        targetId: deletion.recordId,
        sampleRecordId: deletion.recordId,
      });
    } else if (current.revision !== deletion.expectedRevision) {
      conflicts.push({
        code: 'record_revision_changed',
        message: `Record "${deletion.recordId}" changed after deletion was prepared`,
        targetId: deletion.recordId,
        sampleRecordId: deletion.recordId,
      });
    }
  }
  for (const copy of draft.normalized.recordCopies) {
    const current = context.databaseRecordIndex?.getById(copy.sourceRecordId) ?? null;
    if (!current || current.revision !== copy.expectedRevision) {
      conflicts.push({
        code: current ? 'record_revision_changed' : 'record_not_found',
        message: current
          ? `Record copy source "${copy.sourceRecordId}" changed after duplication was prepared`
          : `Record copy source "${copy.sourceRecordId}" no longer exists`,
        targetId: copy.sourceRecordId,
        sampleRecordId: copy.newRecordId,
      });
    }
  }
  for (const move of draft.normalized.recordMoves) {
    if (seenRecordIds.has(move.recordId)) {
      conflicts.push({
        code: 'duplicate_record_target',
        message: `Record "${move.recordId}" is moved and changed by another operation`,
        targetId: move.recordId,
        sampleRecordId: move.recordId,
      });
    }
    seenRecordIds.add(move.recordId);
    const current = context.databaseRecordIndex?.getById(move.recordId) ?? null;
    if (!current || current.revision !== move.expectedRevision) {
      conflicts.push({
        code: current ? 'record_revision_changed' : 'record_not_found',
        message: `Record move source "${move.recordId}" is missing or changed`,
        targetId: move.recordId,
        sampleRecordId: move.recordId,
      });
    }
    if (context.contentDir) {
      try {
        context.readFile(resolve(context.contentDir, move.targetPath));
        conflicts.push({
          code: 'record_path_occupied',
          message: `Record move target path "${move.targetPath}" is occupied`,
          targetId: move.recordId,
          sampleRecordId: move.recordId,
        });
      } catch (error) {
        if (errno(error) !== 'ENOENT') {
          conflicts.push({
            code: 'planning_io_unavailable',
            message: `Record move target path "${move.targetPath}" could not be inspected`,
            targetId: move.recordId,
            sampleRecordId: move.recordId,
          });
        }
      }
    }
  }
  const plannedV2DocumentPaths = new Set<string>();
  const recordPlans = draft.normalized.sampleRecords.map((sample) => {
    const source = definition.sources.find((candidate) => candidate.id === sample.sourceId);
    if (!source) throw new Error('Normalized sample source is missing');
    const existing = context.databaseRecordIndex?.getById(sample.id) ?? null;
    if (existing) {
      if (existing.databaseId !== definition.id || existing.sourceId !== sample.sourceId) {
        conflicts.push({
          code: 'record_scope_mismatch',
          message: `Record "${sample.id}" belongs to a different database or source`,
          targetId: sample.id,
          sampleRecordId: sample.id,
        });
      } else if (!sample.expectedRevision) {
        conflicts.push({
          code: 'record_revision_required',
          message: `Updating record "${sample.id}" requires its current revision`,
          targetId: sample.id,
          sampleRecordId: sample.id,
        });
      } else if (existing.revision !== sample.expectedRevision) {
        conflicts.push({
          code: 'record_revision_changed',
          message: `Record "${sample.id}" changed after the desired state was prepared`,
          targetId: sample.id,
          sampleRecordId: sample.id,
        });
      }
      const currentSource = byId?.sources.find((candidate) => candidate.id === existing.sourceId);
      const storageContractChanged = currentSource
        ? recordNeedsSourceRewrite(currentSource, source, existing.values) ||
          (byId
            ? recordNeedsPersonRewrite(byId, definition, currentSource.id, existing.values)
            : false)
        : false;
      const action: DatabaseConvergenceAction =
        !storageContractChanged &&
        same(existing.values, sample.values) &&
        existing.body === sample.body &&
        (sample.archivedAt === undefined || (existing.archivedAt ?? null) === sample.archivedAt) &&
        (sample.pageLayoutOverride === undefined ||
          same(existing.pageLayoutOverride ?? null, sample.pageLayoutOverride))
          ? 'noop'
          : 'update';
      return { sample, source, existing, path: existing.path, action };
    }
    if (
      definition.version === 2 &&
      source.storage?.kind === 'markdown_table' &&
      sample.id &&
      !sample.documentId &&
      context.databaseRecordIndex &&
      !existing
    ) {
      conflicts.push({
        code: 'record_identity_required',
        message: `New v2 record "${sample.id}" must provide its stable documentId; generated IDs cannot be inferred from a caller-supplied record ID`,
        targetId: sample.id,
        sampleRecordId: sample.id,
      });
    }
    if (sample.expectedRevision) {
      conflicts.push({
        code: 'record_not_found',
        message: `Record "${sample.id}" no longer exists at its expected revision`,
        targetId: sample.id,
        sampleRecordId: sample.id,
      });
    }
    const path =
      definition.version === 2 && source.storage?.kind === 'markdown_table'
        ? databaseMarkdownTableDocumentPath(definition, source, sample)
        : `${source.folder === '.' ? '' : `${source.folder}/`}${sample.id}.md`;
    if (definition.version === 2 && source.storage?.kind === 'markdown_table') {
      if (plannedV2DocumentPaths.has(path) || path === source.storage.owner.path) {
        conflicts.push({
          code: 'record_path_occupied',
          message: `V2 linked document path "${path}" is claimed by another canonical target`,
          targetId: sample.id,
          sampleRecordId: sample.id,
        });
      }
      plannedV2DocumentPaths.add(path);
    }
    if (context.contentDir) {
      try {
        context.readFile(resolve(context.contentDir, path));
        conflicts.push({
          code: 'record_path_occupied',
          message: `Record target path "${path}" is already occupied by an unmanaged file`,
          targetId: sample.id,
          sampleRecordId: sample.id,
        });
      } catch (error) {
        if (errno(error) !== 'ENOENT') {
          conflicts.push({
            code: 'planning_io_unavailable',
            message: `Record target path "${path}" could not be inspected safely`,
            targetId: sample.id,
            sampleRecordId: sample.id,
          });
        }
        // ENOENT is expected for a new record. Commit rechecks under the write lock.
      }
    }
    return { sample, source, existing: null, path, action: 'create' as const };
  });

  if (byId && manifestAction === 'update') {
    if (!context.databaseRecordIndex) {
      conflicts.push({
        code: 'planning_io_unavailable',
        message: 'Schema convergence requires the project record index',
        targetId: definition.id,
      });
    } else {
      const upsertIds = new Set([
        ...draft.normalized.sampleRecords.map((sample) => sample.id),
        ...draft.normalized.recordMutations.map((mutation) => mutation.recordId),
      ]);
      for (const desiredSource of definition.sources) {
        for (const property of desiredSource.properties) {
          const currentSource = byId.sources.find((source) =>
            source.properties.some((candidate) => candidate.id === property.id),
          );
          if (!currentSource || currentSource.id === desiredSource.id) continue;
          const recordsWithValue = context.databaseRecordIndex
            .list(byId.id, currentSource.id)
            .filter((record) => record.values[property.id] !== undefined);
          if (recordsWithValue.length > 0) {
            conflicts.push({
              code: 'source_record_migration_required',
              message: `Property "${property.id}" moves between sources while ${recordsWithValue.length} record(s) still store values; migrate that data first`,
              targetId: property.id,
              propertyId: property.id,
            });
          }
        }
      }
      for (const currentSource of byId.sources) {
        const records = context.databaseRecordIndex.list(byId.id, currentSource.id);
        if (records.length === 0) continue;
        const desiredSource = definition.sources.find(
          (candidate) => candidate.id === currentSource.id,
        );
        if (!desiredSource) {
          conflicts.push({
            code: 'source_removal_blocked',
            message: `Source "${currentSource.id}" still owns ${records.length} record(s) and cannot be removed by schema convergence`,
            targetId: currentSource.id,
          });
          continue;
        }
        if (
          currentSource.folder !== desiredSource.folder ||
          currentSource.includeSubfolders !== desiredSource.includeSubfolders
        ) {
          conflicts.push({
            code: 'source_record_migration_required',
            message: `Source "${currentSource.id}" changes record path ownership; use a migration operation before altering its folder contract`,
            targetId: currentSource.id,
          });
          continue;
        }
        const personStorageChanged = records.some((record) =>
          recordNeedsPersonRewrite(byId, definition, currentSource.id, record.values),
        );
        if (!sourceNeedsRecordRewrite(currentSource, desiredSource) && !personStorageChanged) {
          continue;
        }
        const omitted = records.filter(
          (record) =>
            (recordNeedsSourceRewrite(currentSource, desiredSource, record.values) ||
              recordNeedsPersonRewrite(byId, definition, currentSource.id, record.values)) &&
            !upsertIds.has(record.id),
        );
        if (omitted.length > 0) {
          conflicts.push({
            code: 'source_record_migration_required',
            message: `Source "${currentSource.id}" changes stored values for ${omitted.length} omitted record(s); include every affected record as a revision-bound upsert`,
            targetId: currentSource.id,
          });
        }
      }
    }
  }

  for (const sample of draft.normalized.sampleRecords) {
    const source = definition.sources.find((candidate) => candidate.id === sample.sourceId);
    if (!source) continue;
    for (const property of source.properties) {
      if (property.required && sample.values[property.id] === undefined) {
        conflicts.push({
          code: 'sample_required_value_missing',
          message: `Sample record is missing required property "${property.key}"`,
          targetId: sample.id,
          propertyId: property.id,
          sampleRecordId: sample.id,
        });
      }
      if (property.type === 'relation') {
        const value = sample.values[property.id];
        if (value === undefined) continue;
        const relationIds = Array.isArray(value) ? value.map(String) : [String(value)];
        for (const recordId of relationIds) {
          if (deletionIds.has(recordId)) {
            conflicts.push({
              code: 'relation_target_missing',
              message: `Relation property "${property.id}" targets record "${recordId}", which is deleted by the same desired state`,
              targetId: recordId,
              propertyId: property.id,
              sampleRecordId: sample.id,
            });
            continue;
          }
          const plannedTarget = draft.normalized.sampleRecords.find(
            (candidate) => candidate.id === recordId,
          );
          const indexedTarget = context.databaseRecordIndex?.getById(recordId) ?? null;
          const targetSourceId =
            plannedTarget?.sourceId ??
            movedTargetSourceByRecordId.get(recordId) ??
            indexedTarget?.sourceId;
          const targetDatabaseId = plannedTarget ? definition.id : indexedTarget?.databaseId;
          // An absent `targetDatabaseId` means this database, which is what
          // every relation authored before cross-database targets says.
          const expectedDatabaseId = property.targetDatabaseId ?? definition.id;
          if (
            targetSourceId !== property.targetSourceId ||
            targetDatabaseId !== expectedDatabaseId
          ) {
            conflicts.push({
              code: 'relation_target_missing',
              message: `Relation property "${property.id}" target "${recordId}" does not resolve in source "${property.targetSourceId}"`,
              targetId: recordId,
              propertyId: property.id,
              sampleRecordId: sample.id,
            });
          }
        }
      } else if (property.type === 'person') {
        const value = sample.values[property.id];
        if (value === undefined) continue;
        const personIds = Array.isArray(value) ? value.map(String) : [];
        for (const personId of personIds) {
          if (!definition.people.some((person) => person.id === personId)) {
            conflicts.push({
              code: 'person_target_missing',
              message: `Person property "${property.id}" references undeclared person "${personId}"`,
              targetId: personId,
              propertyId: property.id,
              sampleRecordId: sample.id,
            });
          }
        }
      }
    }
  }
  if (deletionIds.size > 0 || movedTargetSourceByRecordId.size > 0) {
    const plannedValues = new Map(
      draft.normalized.sampleRecords.map((record) => [record.id, record.values] as const),
    );
    for (const source of definition.sources) {
      const relationProperties = source.properties.filter(
        (property) => property.type === 'relation',
      );
      if (relationProperties.length === 0) continue;
      for (const record of context.databaseRecordIndex?.list(definition.id, source.id) ?? []) {
        if (deletionIds.has(record.id)) continue;
        const values = plannedValues.get(record.id) ?? record.values;
        for (const property of relationProperties) {
          const value = values[property.id];
          const relationIds =
            value === undefined ? [] : Array.isArray(value) ? value.map(String) : [String(value)];
          const invalidTarget = relationIds.find(
            (recordId) =>
              deletionIds.has(recordId) ||
              (movedTargetSourceByRecordId.has(recordId) &&
                movedTargetSourceByRecordId.get(recordId) !== property.targetSourceId),
          );
          if (!invalidTarget) continue;
          conflicts.push({
            code: 'relation_target_missing',
            message: deletionIds.has(invalidTarget)
              ? `Record "${record.id}" still references deletion target "${invalidTarget}" through relation "${property.id}"`
              : `Record "${record.id}" still references moved target "${invalidTarget}" outside relation source "${property.targetSourceId}"`,
            targetId: invalidTarget,
            propertyId: property.id,
            sampleRecordId: record.id,
          });
        }
      }
    }
  }
  const upsertIds = new Set(draft.normalized.sampleRecords.map((sample) => sample.id));
  for (const source of definition.sources) {
    const uniqueProperties = source.properties.filter(
      (property) => property.semantics.constraints.unique,
    );
    if (uniqueProperties.length === 0) continue;
    const records = [
      ...(context.databaseRecordIndex?.list(definition.id, source.id) ?? []).filter(
        (record) => !upsertIds.has(record.id) && !deletionIds.has(record.id),
      ),
      ...draft.normalized.sampleRecords.filter((sample) => sample.sourceId === source.id),
    ];
    for (const property of uniqueProperties) {
      const seen = new Map<string, string>();
      for (const sample of records) {
        const value = sample.values[property.id];
        if (value === undefined) continue;
        const key = stable(value);
        const firstRecordId = seen.get(key);
        if (firstRecordId) {
          conflicts.push({
            code: 'sample_unique_value_duplicate',
            message: `Records "${firstRecordId}" and "${sample.id}" repeat unique property "${property.key}"`,
            targetId: sample.id,
            propertyId: property.id,
            sampleRecordId: sample.id,
          });
        } else {
          seen.set(key, sample.id);
        }
      }
    }
  }
  const currentIds = new Set(currentObjects.keys());
  const desiredIds = new Set(desiredObjects.keys());
  const addedIds = [...desiredIds].filter((id) => !currentIds.has(id)).sort();
  const removedIds = [...currentIds].filter((id) => !desiredIds.has(id)).sort();
  const updatedIds = [...desiredIds]
    .filter((id) => currentIds.has(id) && !same(currentObjects.get(id), desiredObjects.get(id)))
    .sort();
  for (const source of definition.sources) {
    for (const property of source.properties) {
      if (propertyAction(source.id, property) === 'update' && !updatedIds.includes(property.id)) {
        updatedIds.push(property.id);
      }
    }
  }
  updatedIds.sort();
  const desiredProperties = definition.sources.flatMap((source) => source.properties);
  const currentProperties = byId?.sources.flatMap((source) => source.properties) ?? [];
  const changedPropertyIds = new Set(
    [...desiredProperties, ...currentProperties]
      .filter((property) => {
        const desired = desiredProperties.find((candidate) => candidate.id === property.id);
        const current = currentProperties.find((candidate) => candidate.id === property.id);
        if (!desired || !current || !same(desired, current)) return true;
        const desiredSource = definition.sources.find((source) =>
          source.properties.some((candidate) => candidate.id === property.id),
        );
        return desiredSource ? propertyAction(desiredSource.id, desired) !== 'noop' : true;
      })
      .map((property) => property.id),
  );
  const changedProperties = [...desiredProperties, ...currentProperties].filter(
    (property, index, properties) =>
      changedPropertyIds.has(property.id) &&
      properties.findIndex((candidate) => candidate.id === property.id) === index,
  );
  const conflictDomains = new Set<DatabaseConflictDomain>();
  const hasRecordChanges =
    recordPlans.some((record) => record.action !== 'noop') ||
    draft.normalized.recordMutations.length > 0 ||
    draft.normalized.recordCopies.length > 0 ||
    draft.normalized.recordArchives.length > 0 ||
    draft.normalized.recordMoves.length > 0 ||
    draft.normalized.recordDeletions.length > 0;
  if (hasRecordChanges) conflictDomains.add('record_value');
  if (
    definition.views.some((view) => actionFor(view.id, view) !== 'noop') ||
    (byId?.views.some((view) => !definition.views.some((candidate) => candidate.id === view.id)) ??
      false)
  ) {
    conflictDomains.add('view');
  }
  if (
    definition.automations.some((automation) => actionFor(automation.id, automation) !== 'noop') ||
    (byId?.automations.some(
      (automation) => !definition.automations.some((candidate) => candidate.id === automation.id),
    ) ??
      false)
  ) {
    conflictDomains.add('automation');
  }
  if (
    manifestAction !== 'noop' ||
    addedIds.length > 0 ||
    removedIds.length > 0 ||
    changedProperties.length > 0
  ) {
    conflictDomains.add('schema');
  }
  for (const property of changedProperties) {
    if (
      property.type === 'select' ||
      property.type === 'status' ||
      property.type === 'multi_select'
    ) {
      conflictDomains.add('option');
    }
    if (property.type === 'formula' || property.type === 'rollup') {
      conflictDomains.add('formula');
    }
    if (property.type === 'relation' || property.type === 'rollup') {
      conflictDomains.add('relation');
    }
  }
  return {
    currentObjects,
    desiredObjects,
    addedIds,
    removedIds,
    updatedIds,
    actionFor,
    propertyAction,
    recordPlans,
    conflictDomains,
  };
}
