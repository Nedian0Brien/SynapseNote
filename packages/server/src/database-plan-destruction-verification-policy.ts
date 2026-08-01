import { resolve } from 'node:path';
import {
  type DatabaseDefinition,
  DatabaseRecordActorSchema,
  DatabaseVerificationLifecycleInputSchema,
  DatabaseVerificationValueSchema,
} from '@nedian0brien/synapsenote-core';
import {
  type DatabaseDraftArtifact,
  type DatabasePlanArtifact,
  type DatabasePlanConflict,
  DatabasePlanError,
  type DatabaseTargetResolution,
  type DatabaseVerificationDraftResult,
  type DatabaseWriteGuardSnapshot,
} from './database-plan-artifacts.ts';
import {
  cloneDatabasePlanValue as clone,
  compactDatabasePlanUuid as compactUuid,
  databasePlanObjectMap as databaseObjectMap,
  databasePlanExpiry as expiry,
  hashDatabasePlanValue as hash,
  sameDatabasePlanValue as same,
} from './database-plan-convergence-policy.ts';
import {
  type DatabaseDesiredStateDraft,
  DatabaseDesiredStateDraftSchema,
} from './database-plan-draft-contracts.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';

function deletionDesiredState(definition: DatabaseDefinition): DatabaseDesiredStateDraft {
  const sourcesById = new Map(definition.sources.map((source) => [source.id, source] as const));
  const sourceKey = (sourceId: string): string => {
    const source = sourcesById.get(sourceId);
    if (!source) throw new Error(`Deletion draft has unknown source "${sourceId}"`);
    return source.key;
  };
  const propertyKey = (propertyId: string): string => {
    for (const source of definition.sources) {
      const property = source.properties.find((candidate) => candidate.id === propertyId);
      if (property) return property.key;
    }
    throw new Error(`Deletion draft has unknown property "${propertyId}"`);
  };
  const viewKey = (viewId: string): string => {
    const view = definition.views.find((candidate) => candidate.id === viewId);
    if (!view) throw new Error(`Deletion draft has unknown view "${viewId}"`);
    return view.key;
  };
  const personKey = (personId: string): string => {
    const person = definition.people.find((candidate) => candidate.id === personId);
    if (!person) throw new Error(`Deletion draft has unknown person "${personId}"`);
    return person.key;
  };
  return DatabaseDesiredStateDraftSchema.parse({
    database: {
      id: definition.id,
      key: definition.key,
      name: definition.name,
      ...(definition.description ? { description: definition.description } : {}),
      ...(definition.icon ? { icon: definition.icon } : {}),
      ...(definition.cover ? { cover: definition.cover } : {}),
      aliases: definition.aliases,
      people: definition.people,
      contract: definition.contract,
    },
    sources: definition.sources,
    ...(definition.sourceMappings
      ? {
          sourceMappings: definition.sourceMappings.map((mapping) => ({
            sourceKey: sourceKey(mapping.sourceId),
            targetSourceKey: sourceKey(mapping.targetSourceId),
            propertyMappings: mapping.propertyMappings.map((property) => ({
              sourcePropertyKey: propertyKey(property.sourcePropertyId),
              targetPropertyKey: propertyKey(property.targetPropertyId),
              optionMappings: property.optionMappings.map((option) => ({
                sourceOptionKey: option.sourceOptionId,
                targetOptionKey: option.targetOptionId,
              })),
            })),
          })),
        }
      : {}),
    views: definition.views.map((view) => ({ ...view, sourceKey: sourceKey(view.sourceId) })),
    templates: definition.templates.map((template) => ({
      id: template.id,
      key: template.key,
      name: template.name,
      ...(template.description ? { description: template.description } : {}),
      sourceKey: sourceKey(template.sourceId),
      body: template.body,
      propertyValues: Object.fromEntries(
        Object.entries(template.propertyValues).map(([id, value]) => [propertyKey(id), value]),
      ),
      order: template.order,
      archivedAt: template.archivedAt,
      defaultFor: {
        source: template.defaultFor.source,
        viewKeys: template.defaultFor.viewIds.map(viewKey),
        entryPoints: template.defaultFor.entryPoints,
      },
      ...(template.repeat
        ? { repeat: { ...template.repeat, ownerKey: personKey(template.repeat.ownerId) } }
        : {}),
    })),
    buttons: definition.buttons.map((button) => ({
      id: button.id,
      key: button.key,
      name: button.name,
      ...(button.description ? { description: button.description } : {}),
      placement:
        button.placement.kind === 'database'
          ? { kind: 'database' as const }
          : { kind: 'source' as const, sourceKey: sourceKey(button.placement.sourceId) },
      ...(button.confirmation ? { confirmation: button.confirmation } : {}),
      actions: button.actions.map((action) => {
        if (action.kind !== 'create_record') {
          throw new Error(`Deletion draft cannot normalize button action "${action.kind}"`);
        }
        return {
          id: action.id,
          kind: action.kind,
          sourceKey: sourceKey(action.sourceId),
          values: Object.fromEntries(
            Object.entries(action.values).map(([id, value]) => [propertyKey(id), value]),
          ),
          body: action.body,
        };
      }),
    })),
    automations: definition.automations,
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 100_000 },
    sampleRecords: [],
    recordMutations: [],
    recordCopies: [],
    recordArchives: [],
    recordMoves: [],
    recordDeletions: [],
  });
}

export function createDatabaseDeletionDraftPolicy(
  input: {
    databaseStore: DatabaseStore;
    databaseRecordIndex?: DatabaseRecordIndex;
    now: () => Date;
    generateUuid: () => string;
  },
  databaseId: string,
  expectedSnapshotRevision: string,
  ttlSeconds = 1_800,
): DatabaseDraftArtifact {
  const snapshot = input.databaseStore.snapshot();
  if (snapshot.revision !== expectedSnapshotRevision) {
    throw new DatabasePlanError(
      'snapshot_changed',
      'Database catalog changed before deletion planning',
      { expectedSnapshotRevision, observedSnapshotRevision: snapshot.revision },
    );
  }
  const definition = snapshot.databases.find((candidate) => candidate.id === databaseId);
  if (!definition) {
    throw new DatabasePlanError('invalid_desired_state', `Database "${databaseId}" was not found`, {
      databaseId,
    });
  }
  if (!input.databaseRecordIndex) {
    throw new DatabasePlanError(
      'write_guard_unavailable',
      'Database deletion requires a complete canonical record index',
      { databaseId },
    );
  }
  const records = input.databaseRecordIndex.list(databaseId);
  if (records.length > 100_000) {
    throw new DatabasePlanError(
      'invalid_desired_state',
      'Database deletion exceeds the bounded 100,000-record transaction limit',
      { databaseId, records: records.length, limit: 100_000 },
    );
  }
  const incomplete = records.find((record) => !record.revision);
  if (incomplete) {
    throw new DatabasePlanError(
      'write_guard_unavailable',
      'Database deletion requires exact revisions for every canonical record',
      { databaseId, recordId: incomplete.id },
    );
  }
  const desiredState = deletionDesiredState(definition);
  const targetResolutions: DatabaseTargetResolution[] = [
    { kind: 'database', selector: 'database.id', targetId: definition.id, via: 'explicit_id' },
    ...definition.sources.map((source) => ({
      kind: 'source' as const,
      selector: `sources.${source.key}`,
      targetId: source.id,
      via: 'explicit_id' as const,
    })),
    ...definition.sources.flatMap((source) =>
      source.properties.map((property) => ({
        kind: 'property' as const,
        selector: `sources.${source.key}.properties.${property.key}`,
        targetId: property.id,
        via: 'explicit_id' as const,
      })),
    ),
    ...definition.views.map((view) => ({
      kind: 'view' as const,
      selector: `views.${view.key}`,
      targetId: view.id,
      via: 'explicit_id' as const,
    })),
    ...definition.templates.map((template) => ({
      kind: 'template' as const,
      selector: `templates.${template.key}`,
      targetId: template.id,
      via: 'explicit_id' as const,
    })),
    ...definition.buttons.map((button) => ({
      kind: 'action_button' as const,
      selector: `buttons.${button.key}`,
      targetId: button.id,
      via: 'explicit_id' as const,
    })),
    ...definition.automations.map((automation) => ({
      kind: 'automation' as const,
      selector: `automations.${automation.key}`,
      targetId: automation.id,
      via: 'explicit_id' as const,
    })),
    ...records.map((record) => ({
      kind: 'record' as const,
      selector: `records.${record.id}`,
      targetId: record.id,
      via: 'explicit_id' as const,
    })),
  ];
  const normalized: DatabaseDraftArtifact['normalized'] = {
    definition: clone(definition),
    databaseDeletion: true,
    uniquePropertyId: null,
    templates: clone(desiredState.templates),
    policy: clone(desiredState.policy),
    sampleRecords: [],
    recordMutations: [],
    recordCopies: [],
    recordArchives: [],
    recordMoves: [],
    recordDeletions: records.map((record) => ({
      recordId: record.id,
      sourceId: record.sourceId,
      expectedRevision: record.revision as string,
      path: record.path,
      values: clone(record.values),
      body: record.body,
    })),
    targetResolutions,
  };
  const now = input.now();
  const ttl = Math.min(86_400, Math.max(60, Math.trunc(ttlSeconds)));
  const id = `draft_${compactUuid(input.generateUuid)}`;
  const artifact: DatabaseDraftArtifact = {
    id,
    revision: hash({ desiredState, normalized }),
    createdAt: now.toISOString(),
    expiresAt: expiry(now, ttl),
    desiredState,
    normalized,
  };
  return clone(artifact);
}

export function createDatabaseVerificationDraftPolicy(
  input: {
    databaseStore: DatabaseStore;
    databaseRecordIndex?: DatabaseRecordIndex;
    now: () => Date;
    generateUuid: () => string;
  },
  lifecycleInput: unknown,
  authenticatedActor: unknown,
  ttlSeconds = 1_800,
): DatabaseVerificationDraftResult {
  const lifecycle = DatabaseVerificationLifecycleInputSchema.parse(lifecycleInput);
  const actor = DatabaseRecordActorSchema.parse(authenticatedActor);
  if (actor.kind === 'filesystem' || actor.kind === 'system') {
    throw new DatabasePlanError(
      'invalid_desired_state',
      'Verification requires an authenticated human, agent, or sync principal',
    );
  }
  const definition = input.databaseStore.getById(lifecycle.databaseId);
  if (!definition) {
    throw new DatabasePlanError('invalid_desired_state', 'Verification database was not found');
  }
  const source = definition.sources.find((candidate) => candidate.id === lifecycle.sourceId);
  const property = source?.properties.find((candidate) => candidate.id === lifecycle.propertyId);
  const record = input.databaseRecordIndex?.getById(lifecycle.recordId);
  if (!source || !property || property.type !== 'verification') {
    throw new DatabasePlanError(
      'invalid_desired_state',
      'Verification target is not an opt-in Verification property',
    );
  }
  if (!record || record.databaseId !== definition.id || record.sourceId !== source.id) {
    throw new DatabasePlanError(
      'invalid_desired_state',
      'Verification record was not found in the requested source',
    );
  }
  if (record.revision !== lifecycle.expectedRevision) {
    throw new DatabasePlanError(
      'invalid_desired_state',
      'Verification requires the exact current record revision',
      { expectedRevision: lifecycle.expectedRevision, observedRevision: record.revision },
    );
  }
  if ('expiresAt' in lifecycle && lifecycle.expiresAt && !property.allowExpiry) {
    throw new DatabasePlanError(
      'invalid_desired_state',
      'This Verification property does not allow expiry',
    );
  }
  if (
    lifecycle.action !== 'unverify' &&
    property.requireEvidenceRevision &&
    !lifecycle.evidenceRevision
  ) {
    throw new DatabasePlanError(
      'invalid_desired_state',
      'This Verification property requires an evidence revision',
    );
  }
  const current = DatabaseVerificationValueSchema.safeParse(record.values[property.id]);
  if (lifecycle.action === 'renew' && (!current.success || current.data.state !== 'verified')) {
    throw new DatabasePlanError(
      'invalid_desired_state',
      'Only an existing verified value can be renewed',
    );
  }
  const now = input.now();
  const value = DatabaseVerificationValueSchema.parse(
    lifecycle.action === 'unverify'
      ? { state: 'unverified', ...(lifecycle.note ? { note: lifecycle.note } : {}) }
      : {
          state: 'verified',
          verifiedAt: now.toISOString(),
          verifiedBy: actor,
          ...(lifecycle.expiresAt ? { expiresAt: lifecycle.expiresAt } : {}),
          ...(lifecycle.evidenceRevision ? { evidenceRevision: lifecycle.evidenceRevision } : {}),
          ...(lifecycle.note ? { note: lifecycle.note } : {}),
        },
  );
  const policy = { mode: 'review' as const, allowedOperations: [], maxRecordsPerCommit: 1 };
  const desiredState = {
    database: {
      id: definition.id,
      key: definition.key,
      name: definition.name,
      ...(definition.icon ? { icon: definition.icon } : {}),
      ...(definition.cover ? { cover: definition.cover } : {}),
      contract: structuredClone(definition.contract),
    },
    sources: [],
    views: [],
    templates: [],
    buttons: [],
    policy,
    sampleRecords: [],
    recordMutations: [],
    recordCopies: [],
    recordArchives: [],
    recordMoves: [],
    recordDeletions: [],
  } as DatabaseDesiredStateDraft;
  const normalized: DatabaseDraftArtifact['normalized'] = {
    definition: clone(definition),
    uniquePropertyId:
      source.properties.find((candidate) => candidate.semantics.constraints.unique)?.id ?? null,
    templates: [],
    policy,
    sampleRecords: [
      {
        id: record.id,
        sourceId: source.id,
        values: { ...structuredClone(record.values), [property.id]: value },
        body: record.body,
        expectedRevision: lifecycle.expectedRevision,
        archivedAt: record.archivedAt ?? null,
        ...(record.pageLayoutOverride
          ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
          : {}),
      },
    ],
    recordMutations: [
      {
        recordId: record.id,
        sourceId: source.id,
        operations: [{ kind: 'set', propertyId: property.id, value }],
      },
    ],
    recordCopies: [],
    recordArchives: [],
    recordMoves: [],
    recordDeletions: [],
    targetResolutions: [
      {
        kind: 'property',
        selector: 'verification.propertyId',
        targetId: property.id,
        via: 'explicit_id',
      },
      {
        kind: 'record',
        selector: 'verification.recordId',
        targetId: record.id,
        via: 'explicit_id',
      },
    ],
    verificationChange: {
      sourceId: source.id,
      recordId: record.id,
      propertyId: property.id,
      action: lifecycle.action,
      actor,
      value,
    },
  };
  const ttl = Math.min(86_400, Math.max(60, Math.trunc(ttlSeconds)));
  const id = `draft_${compactUuid(input.generateUuid)}`;
  const artifact: DatabaseDraftArtifact = {
    id,
    revision: hash({ desiredState, normalized }),
    createdAt: now.toISOString(),
    expiresAt: expiry(now, ttl),
    desiredState,
    normalized,
  };
  return {
    draft: clone(artifact),
    review: {
      action: lifecycle.action,
      databaseId: definition.id,
      sourceId: source.id,
      recordId: record.id,
      propertyId: property.id,
      actor: clone(actor),
      expectedRevision: lifecycle.expectedRevision,
      verifiedAt: value.state === 'verified' ? value.verifiedAt : null,
      expiresAt: value.state === 'verified' ? (value.expiresAt ?? null) : null,
      evidenceRevision: value.state === 'verified' ? (value.evidenceRevision ?? null) : null,
      notePresent: value.note !== undefined,
    },
  };
}

export function compileDatabaseDeletionPlanPolicy(
  input: {
    draft: DatabaseDraftArtifact;
    snapshot: ReturnType<DatabaseStore['snapshot']>;
    databaseRecordIndex?: DatabaseRecordIndex;
    projectDir?: string;
    readFile: (absolutePath: string) => string;
    generateUuid: () => string;
    captureWriteGuards: (
      draftId: string,
      immutableTargetSet: readonly string[],
    ) => DatabaseWriteGuardSnapshot;
  },
  now: Date,
  expiresAt: string,
): DatabasePlanArtifact {
  const { draft, snapshot } = input;
  const definition = draft.normalized.definition;
  const current = snapshot.databases.find((candidate) => candidate.id === definition.id);
  const manifestPath = `.ok/databases/${definition.key}.yml`;
  const conflicts: DatabasePlanConflict[] = [];
  let manifestBefore: string | null = null;
  if (!current || !same(current, definition)) {
    conflicts.push({
      code: 'database_key_changed',
      message: 'Database schema changed after the deletion target was frozen',
      targetId: definition.id,
    });
  } else if (!input.projectDir) {
    conflicts.push({
      code: 'planning_io_unavailable',
      message: 'Database deletion requires a project-scoped exact manifest reader',
      targetId: definition.id,
    });
  } else {
    try {
      manifestBefore = input.readFile(resolve(input.projectDir, manifestPath));
    } catch {
      conflicts.push({
        code: 'planning_io_unavailable',
        message: `Canonical manifest "${manifestPath}" could not be read for exact deletion`,
        targetId: definition.id,
      });
    }
  }
  const indexed = input.databaseRecordIndex?.list(definition.id) ?? [];
  const frozenById = new Map(
    draft.normalized.recordDeletions.map((record) => [record.recordId, record] as const),
  );
  if (
    indexed.length !== frozenById.size ||
    indexed.some(
      (record) =>
        record.revision !== frozenById.get(record.id)?.expectedRevision ||
        record.path !== frozenById.get(record.id)?.path,
    )
  ) {
    conflicts.push({
      code: 'source_record_migration_required',
      message: 'Database records changed after the deletion target set was frozen',
      targetId: definition.id,
    });
  }
  const targetSet = [
    ...new Set([
      ...databaseObjectMap(definition).keys(),
      ...draft.normalized.recordDeletions.map((record) => record.recordId),
      ...draft.normalized.targetResolutions.map((resolution) => resolution.targetId),
    ]),
  ].sort();
  const writeGuards = input.captureWriteGuards(draft.id, targetSet);
  const operations: DatabasePlanArtifact['normalizedOperations'] = [
    {
      kind: 'ensure_database',
      databaseId: definition.id,
      manifestPath,
      action: 'delete',
    },
    {
      kind: 'delete_database',
      databaseId: definition.id,
      manifestPath,
      recordIds: draft.normalized.recordDeletions.map((record) => record.recordId).sort(),
    },
    ...definition.sources.flatMap((source) => {
      const recordIds = draft.normalized.recordDeletions
        .filter((record) => record.sourceId === source.id)
        .map((record) => record.recordId)
        .sort();
      return recordIds.length > 0
        ? [{ kind: 'delete_records' as const, sourceId: source.id, recordIds }]
        : [];
    }),
  ];
  const body = {
    draftId: draft.id,
    draftRevision: draft.revision,
    snapshotRevision: snapshot.revision,
    expiresAt,
    immutableTargetSet: targetSet,
    writeGuards,
    targetResolutions: draft.normalized.targetResolutions,
    normalizedOperations: operations,
    affectedObjects: {
      databaseIds: [definition.id],
      sourceIds: definition.sources.map((source) => source.id),
      propertyIds: definition.sources.flatMap((source) =>
        source.properties.map((property) => property.id),
      ),
      viewIds: definition.views.map((view) => view.id),
      recordIds: draft.normalized.recordDeletions.map((record) => record.recordId),
      automationIds: definition.automations.map((automation) => automation.id),
    },
    conflictDomains: [
      'record_value',
      'schema',
      'option',
      'view',
      'formula',
      'relation',
      'automation',
    ] as const,
    diff: {
      mode: 'exact' as const,
      manifests:
        manifestBefore === null
          ? []
          : [
              {
                path: manifestPath,
                before: manifestBefore,
                after: null,
                action: 'delete' as const,
              },
            ],
      records: draft.normalized.recordDeletions.map((record) => ({
        recordId: record.recordId,
        sourceId: record.sourceId,
        path: record.path,
        action: 'delete' as const,
        before: {
          revision: record.expectedRevision,
          values: record.values,
          body: record.body,
          archivedAt: input.databaseRecordIndex?.getById(record.recordId)?.archivedAt ?? null,
        },
        after: null,
      })),
      templates: clone(draft.normalized.templates),
      policy: clone(draft.normalized.policy),
    },
    risk: {
      level: 'high' as const,
      reasons: [
        'Deletes the canonical database manifest and every contained schema object',
        `Deletes ${draft.normalized.recordDeletions.length} canonical record(s)`,
      ],
    },
    conflicts,
    approvals: [
      {
        code: 'delete_database' as const,
        required: true,
        reason: 'Deleting a canonical database and all of its objects requires approval',
      },
      {
        code: 'delete_record' as const,
        required: draft.normalized.recordDeletions.length > 0,
        reason: 'Deleting canonical Markdown records is destructive and requires approval',
      },
    ],
    postconditions: [
      {
        code: 'database_absent' as const,
        description: 'The deleted database manifest is absent from the canonical store',
      },
      {
        code: 'records_absent' as const,
        description: 'Every record frozen into the database deletion plan is absent',
      },
      {
        code: 'stable_targets_resolved' as const,
        description: 'Every deletion target resolves into the immutable stable-ID set',
      },
    ],
    committable: conflicts.length === 0 && manifestBefore !== null,
    requiresCommit: true,
  };
  const plan: DatabasePlanArtifact = {
    id: `plan_${compactUuid(input.generateUuid)}`,
    hash: hash(body),
    createdAt: now.toISOString(),
    ...body,
  };
  return clone(plan);
}
