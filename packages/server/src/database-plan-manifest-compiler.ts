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
import type {
  DatabaseConvergenceAction,
  DatabaseDraftArtifact,
  DatabasePlanArtifact,
  DatabasePlanConflict,
} from './database-plan-artifacts.ts';
import { compileDatabaseRelationConflicts } from './database-plan-conflict-compiler.ts';
import {
  createEmptyDatabaseMarkdownOwnerTable as emptyMarkdownOwnerTable,
  databasePlanErrorCode as errno,
  sameDatabasePlanValue as same,
} from './database-plan-convergence-policy.ts';
import type { DatabasePlanManifestRecordCompilerContext } from './database-plan-manifest-record-compiler.ts';
import type { DatabaseStore } from './database-store.ts';

/** Manifest and schema conflicts, including v2 owner-table transitions. */
export interface DatabasePlanManifestCompilation {
  definition: DatabaseDefinition;
  byId: DatabaseDefinition | null;
  manifestPath: string;
  manifestAction: DatabaseConvergenceAction;
  manifestDiff: DatabasePlanArtifact['diff']['manifests'][number][];
  conflicts: DatabasePlanConflict[];
}

export function compileDatabasePlanManifest(
  context: DatabasePlanManifestRecordCompilerContext,
  draft: DatabaseDraftArtifact,
  snapshot: ReturnType<DatabaseStore['snapshot']>,
): DatabasePlanManifestCompilation {
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
  return { definition, byId, manifestPath, manifestAction, manifestDiff, conflicts };
}
