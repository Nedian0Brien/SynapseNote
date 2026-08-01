import { relative, resolve, sep } from 'node:path';
import {
  type DatabaseDefinition,
  databaseStoredPropertyIds,
  encodeDatabaseMarkdownCellText,
  parseDatabaseMarkdownOwner,
  reshapeDatabaseMarkdownOwnerColumns,
  serializeDatabaseManifestYaml,
  updateDatabaseManifestYaml,
} from '@nedian0brien/synapsenote-core';
import { databaseMarkdownTableDocumentPath } from './database-markdown-table-creation.ts';
import type {
  DatabaseConflictDomain,
  DatabaseConvergenceAction,
  DatabaseDraftArtifact,
  DatabasePlanArtifact,
  DatabasePlanConflict,
  DatabaseWriteGuardSnapshot,
} from './database-plan-artifacts.ts';
import { compileDatabaseRelationConflicts } from './database-plan-conflict-compiler.ts';
import {
  cloneDatabasePlanValue as clone,
  compactDatabasePlanUuid as compactUuid,
  databasePlanObjectMap as databaseObjectMap,
  createEmptyDatabaseMarkdownOwnerTable as emptyMarkdownOwnerTable,
  databasePlanErrorCode as errno,
  hashDatabasePlanValue as hash,
  databaseRecordNeedsPersonRewrite as recordNeedsPersonRewrite,
  databaseRecordNeedsSourceRewrite as recordNeedsSourceRewrite,
  sameDatabasePlanValue as same,
  databaseSourceNeedsRecordRewrite as sourceNeedsRecordRewrite,
  stableDatabasePlanValue as stable,
} from './database-plan-convergence-policy.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';

/** Narrow dependencies used while compiling manifest, records, and conflicts. */
export interface DatabasePlanManifestRecordCompilerContext {
  databaseRecordIndex?: DatabaseRecordIndex;
  projectDir?: string;
  contentDir?: string;
  readFile: (absolutePath: string) => string;
  generateUuid: () => string;
  captureWriteGuards: (
    draftId: string,
    immutableTargetSet: readonly string[],
  ) => DatabaseWriteGuardSnapshot;
}

export function compileDatabasePlan(
  context: DatabasePlanManifestRecordCompilerContext,
  draft: DatabaseDraftArtifact,
  snapshot: ReturnType<DatabaseStore['snapshot']>,
  now: Date,
  expiresAt: string,
): DatabasePlanArtifact {
  const definition = draft.normalized.definition;
  const conflicts: DatabasePlanConflict[] = [];
  conflicts.push(...compileDatabaseRelationConflicts(definition, snapshot));
  if (definition.version === 2) {
    const ownerPaths = new Map<string, string>();
    const ownerBlocks = new Map<string, string>();
    for (const source of definition.sources) {
      const storage = source.storage;
      if (!storage || storage.kind !== 'markdown_table') continue;
      const previousPathSource = ownerPaths.get(storage.owner.path);
      if (previousPathSource) {
        conflicts.push({
          code: 'owner_path_conflict',
          message: `V2 owner path "${storage.owner.path}" is claimed by multiple sources`,
          targetId: source.id,
        });
      } else {
        ownerPaths.set(storage.owner.path, source.id);
      }
      const previousBlockSource = ownerBlocks.get(storage.owner.blockId);
      if (previousBlockSource) {
        conflicts.push({
          code: 'owner_block_conflict',
          message: `V2 owner block "${storage.owner.blockId}" is claimed by multiple sources`,
          targetId: source.id,
        });
      } else {
        ownerBlocks.set(storage.owner.blockId, source.id);
      }
    }
  }
  const byId = snapshot.databases.find((candidate) => candidate.id === definition.id) ?? null;
  const byKey = snapshot.databases.find((candidate) => candidate.key === definition.key);
  if (byId && byId.key !== definition.key) {
    conflicts.push({
      code: 'database_key_changed',
      message: `Stable database key cannot change from "${byId.key}" to "${definition.key}"`,
      targetId: definition.id,
    });
  }
  if (byKey && byKey.id !== definition.id) {
    conflicts.push({
      code: 'database_key_exists',
      message: `Database key "${definition.key}" belongs to another stable database ID`,
      targetId: byKey.id,
    });
  }

  const manifestPath = `.ok/databases/${definition.key}.yml`;
  const manifestAction: DatabaseConvergenceAction = byId
    ? same(byId, definition)
      ? 'noop'
      : 'update'
    : 'create';
  const manifestDiff: DatabasePlanArtifact['diff']['manifests'][number][] = [];
  if (manifestAction === 'create') {
    manifestDiff.push({
      path: manifestPath,
      before: null,
      after: serializeDatabaseManifestYaml(definition),
      action: 'create',
    });
  } else if (manifestAction === 'update') {
    if (!context.projectDir) {
      conflicts.push({
        code: 'planning_io_unavailable',
        message: 'Updating a manifest requires a project-scoped exact file reader',
        targetId: definition.id,
      });
    } else {
      try {
        const before = context.readFile(resolve(context.projectDir, manifestPath));
        manifestDiff.push({
          path: manifestPath,
          before,
          after: updateDatabaseManifestYaml(before, definition),
          action: 'update',
        });
      } catch {
        conflicts.push({
          code: 'planning_io_unavailable',
          message: `Canonical manifest "${manifestPath}" could not be read for an exact update`,
          targetId: definition.id,
        });
      }
    }
  }
  // A v2 manifest update only needs the owner-table transaction boundary when
  // it changes which properties occupy table COLUMNS. Renames, view/filter/
  // sort/layout edits, and the derived property types (formula, rollup, the
  // created/last-edited metadata, verification, button) leave every owner
  // table byte-identical, so the manifest writer is the correct and only
  // writer for them.
  //
  // Refusing all of them — as this did until now — froze the schema and every
  // view of every v2 database, which is most of what the surface does.
  //
  // Both sides are DERIVED rather than read from `storage.storedPropertyIds`:
  // a desired state arrives carrying the previous storage block verbatim
  // (clients edit `properties` and leave `storage` alone), so comparing the
  // stored field against itself would report "no column change" for exactly
  // the edit that adds one.
  //
  // A real column change reshapes the owner table in the SAME plan as the
  // manifest, so both files move together or neither does.
  if (byId?.version === 2 && manifestAction === 'update') {
    for (const source of definition.sources) {
      const current = byId.sources.find((candidate) => candidate.id === source.id);
      const storage = source.storage;
      if (!current || current.storage?.kind !== 'markdown_table') continue;
      const nextColumns = databaseStoredPropertyIds(source);
      if (databaseStoredPropertyIds(current).join('\0') === nextColumns.join('\0')) continue;
      if (!storage || storage.kind !== 'markdown_table') {
        conflicts.push({
          code: 'source_record_migration_required',
          message: `Source "${source.id}" dropped its owner-table storage in a column change`,
          targetId: source.id,
        });
        continue;
      }
      if (!context.projectDir || !context.contentDir) {
        conflicts.push({
          code: 'planning_io_unavailable',
          message: 'A V2 column change requires a project-scoped content directory',
          targetId: source.id,
        });
        continue;
      }
      const ownerPath = relative(
        context.projectDir,
        resolve(context.contentDir, storage.owner.path),
      )
        .split(sep)
        .join('/');
      let before: string;
      try {
        before = context.readFile(resolve(context.projectDir, ownerPath));
      } catch {
        conflicts.push({
          code: 'planning_io_unavailable',
          message: `V2 owner table "${storage.owner.path}" could not be read for a column change`,
          targetId: source.id,
        });
        continue;
      }
      const parsed = parseDatabaseMarkdownOwner(before);
      if (!parsed.ok) {
        conflicts.push({
          code: 'source_record_migration_required',
          message: `V2 owner table "${storage.owner.path}" is not parseable (${parsed.code}); repair it before changing columns`,
          targetId: source.id,
        });
        continue;
      }
      const propertyById = new Map(
        source.properties.map((property) => [property.id, property] as const),
      );
      try {
        manifestDiff.push({
          path: ownerPath,
          before,
          after: reshapeDatabaseMarkdownOwnerColumns(
            before,
            parsed.owner,
            nextColumns.map((propertyId) => ({
              propertyId,
              header: encodeDatabaseMarkdownCellText(
                (propertyById.get(propertyId)?.name ?? propertyId).replace(/[\r\n]+/gu, ' '),
              ),
            })),
          ),
          action: 'update',
        });
      } catch (error) {
        conflicts.push({
          code: 'source_record_migration_required',
          message: `V2 owner table "${storage.owner.path}" could not absorb the column change: ${
            error instanceof Error ? error.message : String(error)
          }`,
          targetId: source.id,
        });
      }
    }
  }
  if (definition.version === 2 && manifestAction === 'create') {
    if (!context.projectDir || !context.contentDir) {
      conflicts.push({
        code: 'planning_io_unavailable',
        message: 'V2 database creation requires a project-scoped content directory',
        targetId: definition.id,
      });
    } else {
      for (const source of definition.sources) {
        const storage = source.storage;
        if (!storage || storage.kind !== 'markdown_table') continue;
        const contentPath = relative(
          context.projectDir,
          resolve(context.contentDir, storage.owner.path),
        )
          .split(sep)
          .join('/');
        if (
          !contentPath ||
          contentPath === '..' ||
          contentPath.startsWith('../') ||
          contentPath.includes('\\') ||
          contentPath
            .split('/')
            .some((segment) => segment === '' || segment === '.' || segment === '..')
        ) {
          conflicts.push({
            code: 'unsafe_owner_path',
            message: `V2 owner path "${storage.owner.path}" escapes the project root`,
            targetId: source.id,
          });
          continue;
        }
        try {
          const before = context.readFile(resolve(context.projectDir, contentPath));
          conflicts.push({
            code: 'record_path_occupied',
            message: `V2 owner path "${storage.owner.path}" is already occupied`,
            targetId: source.id,
          });
          void before;
        } catch (error) {
          if (errno(error) !== 'ENOENT') {
            conflicts.push({
              code: 'planning_io_unavailable',
              message: `V2 owner path "${storage.owner.path}" could not be inspected safely`,
              targetId: source.id,
            });
            continue;
          }
          manifestDiff.push({
            path: contentPath,
            before: null,
            after: emptyMarkdownOwnerTable(definition, source),
            action: 'create',
          });
        }
      }
    }
  }

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
  const operations: DatabasePlanArtifact['normalizedOperations'] = [
    {
      kind: 'ensure_database',
      databaseId: definition.id,
      manifestPath,
      action: manifestAction,
    },
    ...definition.sources.flatMap((source) =>
      source.properties.map((property) =>
        property.type === 'relation'
          ? {
              kind: 'ensure_relation' as const,
              sourceId: source.id,
              propertyId: property.id,
              targetSourceId: property.targetSourceId,
              ...(property.pairedPropertyId ? { pairedPropertyId: property.pairedPropertyId } : {}),
              action: propertyAction(source.id, property),
            }
          : {
              kind: 'ensure_property' as const,
              sourceId: source.id,
              propertyId: property.id,
              action: propertyAction(source.id, property),
            },
      ),
    ),
    ...definition.views.map((view) => ({
      kind: 'ensure_view' as const,
      sourceId: view.sourceId,
      viewId: view.id,
      action: actionFor(view.id, view),
    })),
    ...(byId
      ? [
          {
            kind: 'alter_schema' as const,
            databaseId: definition.id,
            action:
              addedIds.length > 0 || updatedIds.length > 0 || removedIds.length > 0
                ? ('update' as const)
                : ('noop' as const),
            addedIds,
            updatedIds,
            removedIds,
          },
        ]
      : []),
    ...draft.normalized.recordMutations.map((mutation) => ({
      kind: 'mutate_record' as const,
      sourceId: mutation.sourceId,
      recordId: mutation.recordId,
      operations: mutation.operations,
    })),
    ...definition.sources.flatMap((source) => {
      const copies = draft.normalized.recordCopies
        .filter((copy) => {
          const sample = draft.normalized.sampleRecords.find(
            (record) => record.id === copy.newRecordId,
          );
          return sample?.sourceId === source.id;
        })
        .map((copy) => ({
          sourceRecordId: copy.sourceRecordId,
          newRecordId: copy.newRecordId,
        }));
      return copies.length > 0
        ? [{ kind: 'duplicate_records' as const, sourceId: source.id, copies }]
        : [];
    }),
    ...(draft.normalized.recordMoves.length > 0
      ? [
          {
            kind: 'move_records' as const,
            moves: draft.normalized.recordMoves.map((move) => ({
              recordId: move.recordId,
              sourceId: move.sourceId,
              targetSourceId: move.targetSourceId,
              sourcePath: move.sourcePath,
              targetPath: move.targetPath,
            })),
          },
        ]
      : []),
    ...definition.sources.flatMap((source) => {
      const records = draft.normalized.recordArchives
        .filter((archive) => {
          const sample = draft.normalized.sampleRecords.find(
            (record) => record.id === archive.recordId,
          );
          return sample?.sourceId === source.id;
        })
        .map((archive) => ({
          recordId: archive.recordId,
          action: archive.action,
          archivedAt: archive.archivedAt,
        }));
      return records.length > 0
        ? [{ kind: 'archive_records' as const, sourceId: source.id, records }]
        : [];
    }),
    ...definition.sources.flatMap((source) => {
      const recordIds = draft.normalized.recordDeletions
        .filter((deletion) => deletion.sourceId === source.id)
        .map((deletion) => deletion.recordId);
      return recordIds.length > 0
        ? [{ kind: 'delete_records' as const, sourceId: source.id, recordIds }]
        : [];
    }),
    ...definition.sources.flatMap((source) => {
      const sourceRecords = recordPlans.filter((record) => record.sample.sourceId === source.id);
      const recordIds = sourceRecords.map((record) => record.sample.id);
      return recordIds.length > 0
        ? [
            {
              kind: 'upsert_records' as const,
              sourceId: source.id,
              recordIds,
              created: sourceRecords.filter((record) => record.action === 'create').length,
              updated: sourceRecords.filter((record) => record.action === 'update').length,
              unchanged: sourceRecords.filter((record) => record.action === 'noop').length,
            },
          ]
        : [];
    }),
  ];
  const relationDependencyIds = draft.normalized.sampleRecords.flatMap((record) => {
    const source = definition.sources.find((candidate) => candidate.id === record.sourceId);
    if (!source) return [];
    return source.properties.flatMap((property) => {
      if (property.type !== 'relation') return [];
      const value = record.values[property.id];
      if (value === undefined) return [];
      return Array.isArray(value) ? value.map(String) : [String(value)];
    });
  });
  const targetSet = [
    ...new Set([
      definition.id,
      ...definition.sources.map((source) => source.id),
      ...definition.sources.flatMap((source) => source.properties.map((property) => property.id)),
      ...definition.sources.flatMap((source) =>
        source.properties.flatMap((property) =>
          property.type === 'select' ||
          property.type === 'status' ||
          property.type === 'multi_select'
            ? property.options.map((option) => option.id)
            : [],
        ),
      ),
      ...definition.views.map((view) => view.id),
      ...draft.normalized.sampleRecords.map((record) => record.id),
      ...draft.normalized.recordCopies.map((copy) => copy.sourceRecordId),
      ...draft.normalized.recordDeletions.map((record) => record.recordId),
      ...draft.normalized.recordMoves.map((record) => record.recordId),
      ...relationDependencyIds,
      ...draft.normalized.targetResolutions.map((resolution) => resolution.targetId),
    ]),
  ].sort();
  const writeGuards = context.captureWriteGuards(draft.id, targetSet);
  const createdRecordCount = recordPlans.filter((record) => record.action === 'create').length;
  const updatedRecordCount = recordPlans.filter((record) => record.action === 'update').length;
  const movedRecordCount = draft.normalized.recordMoves.length;
  const changedRecordCount = createdRecordCount + updatedRecordCount + movedRecordCount;
  const deletedRecordCount = draft.normalized.recordDeletions.length;
  const body = {
    draftId: draft.id,
    draftRevision: draft.revision,
    snapshotRevision: snapshot.revision,
    expiresAt,
    immutableTargetSet: targetSet,
    writeGuards,
    targetResolutions: draft.normalized.targetResolutions,
    ...(draft.normalized.verificationChange
      ? {
          verificationReview: {
            action: draft.normalized.verificationChange.action,
            databaseId: definition.id,
            sourceId: draft.normalized.verificationChange.sourceId,
            recordId: draft.normalized.verificationChange.recordId,
            propertyId: draft.normalized.verificationChange.propertyId,
            actor: clone(draft.normalized.verificationChange.actor),
            expectedRevision:
              draft.normalized.sampleRecords.find(
                (record) => record.id === draft.normalized.verificationChange?.recordId,
              )?.expectedRevision ?? 'sha256:missing',
            verifiedAt:
              draft.normalized.verificationChange.value.state === 'verified'
                ? draft.normalized.verificationChange.value.verifiedAt
                : null,
            expiresAt:
              draft.normalized.verificationChange.value.state === 'verified'
                ? (draft.normalized.verificationChange.value.expiresAt ?? null)
                : null,
            evidenceRevision:
              draft.normalized.verificationChange.value.state === 'verified'
                ? (draft.normalized.verificationChange.value.evidenceRevision ?? null)
                : null,
            notePresent: draft.normalized.verificationChange.value.note !== undefined,
          },
        }
      : {}),
    normalizedOperations: operations,
    affectedObjects: {
      databaseIds: [definition.id],
      sourceIds: definition.sources.map((source) => source.id),
      propertyIds: definition.sources.flatMap((source) =>
        source.properties.map((property) => property.id),
      ),
      viewIds: definition.views.map((view) => view.id),
      recordIds: [
        ...draft.normalized.sampleRecords.map((record) => record.id),
        ...draft.normalized.recordDeletions.map((record) => record.recordId),
      ],
      automationIds: definition.automations.map((automation) => automation.id),
    },
    conflictDomains: (
      ['record_value', 'schema', 'option', 'view', 'formula', 'relation', 'automation'] as const
    ).filter((domain) => conflictDomains.has(domain)),
    diff: {
      mode: 'exact' as const,
      manifests: manifestDiff,
      records: [
        ...recordPlans
          .filter((record) => record.action !== 'noop')
          .map((record) => ({
            recordId: record.sample.id,
            sourceId: record.sample.sourceId,
            path: record.path,
            action: record.action as 'create' | 'update',
            before: record.existing
              ? {
                  revision: record.existing.revision ?? 'sha256:missing',
                  values: record.existing.values,
                  body: record.existing.body,
                  archivedAt: record.existing.archivedAt ?? null,
                  ...(record.existing.pageLayoutOverride
                    ? { pageLayoutOverride: record.existing.pageLayoutOverride }
                    : {}),
                }
              : null,
            after: {
              values: record.sample.values,
              body: record.sample.body,
              ...(record.sample.archivedAt !== undefined
                ? { archivedAt: record.sample.archivedAt }
                : record.existing?.archivedAt
                  ? { archivedAt: record.existing.archivedAt }
                  : {}),
              ...(record.sample.pageLayoutOverride !== undefined
                ? record.sample.pageLayoutOverride
                  ? { pageLayoutOverride: record.sample.pageLayoutOverride }
                  : {}
                : record.existing?.pageLayoutOverride
                  ? { pageLayoutOverride: record.existing.pageLayoutOverride }
                  : {}),
            },
          })),
        ...draft.normalized.recordDeletions.map((record) => ({
          recordId: record.recordId,
          sourceId: record.sourceId,
          path: record.path,
          action: 'delete' as const,
          before: {
            revision: record.expectedRevision,
            values: record.values,
            body: record.body,
            archivedAt: context.databaseRecordIndex?.getById(record.recordId)?.archivedAt ?? null,
            ...(context.databaseRecordIndex?.getById(record.recordId)?.pageLayoutOverride
              ? {
                  pageLayoutOverride: context.databaseRecordIndex.getById(record.recordId)
                    ?.pageLayoutOverride,
                }
              : {}),
          },
          after: null,
        })),
        ...draft.normalized.recordMoves.map((record) => ({
          recordId: record.recordId,
          sourceId: record.targetSourceId,
          beforeSourceId: record.sourceId,
          path: record.sourcePath,
          targetPath: record.targetPath,
          action: 'move' as const,
          before: {
            revision: record.expectedRevision,
            values: context.databaseRecordIndex?.getById(record.recordId)?.values ?? {},
            body: record.body,
            archivedAt: record.archivedAt,
            ...(context.databaseRecordIndex?.getById(record.recordId)?.pageLayoutOverride
              ? {
                  pageLayoutOverride: context.databaseRecordIndex.getById(record.recordId)
                    ?.pageLayoutOverride,
                }
              : {}),
          },
          after: {
            values: record.values,
            body: record.body,
            archivedAt: record.archivedAt,
          },
        })),
      ],
      templates: draft.normalized.templates,
      policy: draft.normalized.policy,
    },
    risk: {
      level: (manifestAction === 'update' ||
      draft.normalized.policy.mode === 'autonomous' ||
      deletedRecordCount > 0 ||
      changedRecordCount > 20
        ? 'high'
        : changedRecordCount > 0 || draft.normalized.templates.length > 0
          ? 'medium'
          : 'low') as 'low' | 'medium' | 'high',
      reasons: [
        ...(manifestAction === 'create' ? ['Creates a canonical database manifest'] : []),
        ...(manifestAction === 'update' ? ['Alters an existing canonical database schema'] : []),
        ...(createdRecordCount > 0 ? [`Creates ${createdRecordCount} canonical record(s)`] : []),
        ...(updatedRecordCount > 0 ? [`Updates ${updatedRecordCount} canonical record(s)`] : []),
        ...(draft.normalized.verificationChange
          ? [
              `${draft.normalized.verificationChange.action} governed verification for record ${draft.normalized.verificationChange.recordId}`,
            ]
          : []),
        ...(movedRecordCount > 0 ? [`Moves ${movedRecordCount} canonical record(s)`] : []),
        ...(deletedRecordCount > 0 ? [`Deletes ${deletedRecordCount} canonical record(s)`] : []),
        ...(manifestAction === 'noop' && changedRecordCount === 0 && deletedRecordCount === 0
          ? ['Desired canonical state is already converged']
          : []),
        ...(draft.normalized.policy.mode === 'autonomous'
          ? ['Requests autonomous agent write policy']
          : []),
      ],
    },
    conflicts,
    approvals: [
      {
        code: 'create_database' as const,
        required: !byId,
        reason: 'Creating canonical database state requires commit approval',
      },
      {
        code: 'alter_schema' as const,
        required: Boolean(byId && manifestAction === 'update'),
        reason: 'Changing an existing canonical schema requires commit approval',
      },
      {
        code: 'sample_record_write' as const,
        required: changedRecordCount > 0,
        reason: 'Record upserts create or replace canonical Markdown files',
      },
      {
        code: 'verification_change' as const,
        required: draft.normalized.verificationChange !== undefined,
        reason:
          'Verification lifecycle changes require review of actor, expiry, evidence revision, and record revision',
      },
      {
        code: 'delete_record' as const,
        required: deletedRecordCount > 0,
        reason: 'Deleting canonical Markdown records is destructive and requires approval',
      },
      {
        code: 'autonomous_policy' as const,
        required: draft.normalized.policy.mode === 'autonomous',
        reason: 'Autonomous write delegation requires explicit approval',
      },
    ],
    postconditions: [
      {
        code: 'manifest_valid' as const,
        description: 'Committed manifest parses as the normalized definition',
      },
      {
        code: 'stable_ids_unique' as const,
        description: 'Every database object stable ID is unique',
      },
      {
        code: 'stable_targets_resolved' as const,
        description: 'Every human-addressed write target resolves into the immutable ID set',
      },
      {
        code: 'required_values' as const,
        description: 'Every planned record satisfies required properties',
      },
      {
        code: 'unique_key' as const,
        description: 'Declared unique-key values remain unique',
      },
      {
        code: 'relation_integrity' as const,
        description: 'Every relation value resolves to an indexed record',
      },
      ...(draft.normalized.verificationChange
        ? [
            {
              code: 'verification_attribution' as const,
              description:
                'Stored verification exactly matches the authenticated actor and reviewed evidence lifecycle',
            },
          ]
        : []),
    ],
    committable:
      conflicts.length === 0 &&
      (manifestDiff.length > 0 ||
        recordPlans.some((record) => record.action !== 'noop') ||
        deletedRecordCount > 0 ||
        draft.normalized.recordMoves.length > 0),
    requiresCommit:
      manifestDiff.length > 0 ||
      recordPlans.some((record) => record.action !== 'noop') ||
      deletedRecordCount > 0 ||
      draft.normalized.recordMoves.length > 0,
  };
  const plan: DatabasePlanArtifact = {
    id: `plan_${compactUuid(context.generateUuid)}`,
    hash: hash(body),
    createdAt: now.toISOString(),
    ...body,
  };
  return clone(plan);
}
