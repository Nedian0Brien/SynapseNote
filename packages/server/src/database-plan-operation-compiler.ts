import type { DatabaseDraftArtifact, DatabasePlanArtifact } from './database-plan-artifacts.ts';
import {
  cloneDatabasePlanValue as clone,
  compactDatabasePlanUuid as compactUuid,
  hashDatabasePlanValue as hash,
} from './database-plan-convergence-policy.ts';
import type { DatabasePlanManifestCompilation } from './database-plan-manifest-compiler.ts';
import type { DatabasePlanManifestRecordCompilerContext } from './database-plan-manifest-record-compiler.ts';
import type { compileDatabasePlanRecords } from './database-plan-record-compiler.ts';
import type { DatabaseStore } from './database-store.ts';

/** Deterministic operation, approval, diff, and hash artifact assembly. */
export function compileDatabasePlanArtifact(
  context: DatabasePlanManifestRecordCompilerContext,
  draft: DatabaseDraftArtifact,
  snapshot: ReturnType<DatabaseStore['snapshot']>,
  now: Date,
  expiresAt: string,
  manifest: DatabasePlanManifestCompilation,
  records: ReturnType<typeof compileDatabasePlanRecords>,
): DatabasePlanArtifact {
  const { definition, byId, manifestPath, manifestAction, manifestDiff, conflicts } = manifest;
  const {
    addedIds,
    removedIds,
    updatedIds,
    actionFor,
    propertyAction,
    recordPlans,
    conflictDomains,
  } = records;
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
