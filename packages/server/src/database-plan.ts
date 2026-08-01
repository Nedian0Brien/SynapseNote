import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createDatabaseDocumentId,
  createDatabaseMarkdownRecordId,
  DATABASE_DEFAULT_STATUS_BLUEPRINT,
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  type DatabaseDocumentId,
  type DatabasePerson,
  type DatabaseProperty,
  type DatabaseRecordMutation,
  DatabaseRecordMutationSchema,
  databaseRecordPageLayoutOverrideIssues,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';

export type { DatabaseRecordMutation };
export { DatabaseRecordMutationSchema };

import {
  type DatabaseDraftArtifact,
  type DatabasePlanArtifact,
  DatabasePlanError,
  type DatabaseTargetResolution,
  type DatabaseVerificationDraftResult,
  type DatabaseWriteGuardSnapshot,
  type ResolveDatabaseWriteGuards,
} from './database-plan-artifacts.ts';
import {
  cloneDatabasePlanValue as clone,
  compactDatabasePlanUuid as compactUuid,
  databasePlanExpiry as expiry,
  hashDatabasePlanValue as hash,
  sameDatabasePlanValue as same,
} from './database-plan-convergence-policy.ts';
import {
  compileDatabaseDeletionPlanPolicy,
  createDatabaseDeletionDraftPolicy,
  createDatabaseVerificationDraftPolicy,
} from './database-plan-destruction-verification-policy.ts';
import {
  DatabaseAutomationEventValueDraftSchema,
  type DatabaseDesiredStateDraft,
  DatabaseDesiredStateDraftSchema,
} from './database-plan-draft-contracts.ts';
import { compileDatabasePlan } from './database-plan-manifest-record-compiler.ts';
import {
  applyDatabaseRecordMutation as applyRecordMutation,
  normalizeDatabaseFilter as filterWithPropertyIds,
  normalizeDatabaseSampleValue as normalizeSampleValue,
  reconcileDatabasePairedRelationSamples as reconcilePairedRelationSamples,
} from './database-plan-normalization-policy.ts';
import { DatabaseWriteGuardSnapshotSchema } from './database-plan-write-guards.ts';

export {
  type DatabaseConflictDomain,
  type DatabaseConvergenceAction,
  type DatabaseDraftArtifact,
  type DatabaseNormalizedRecordMutationOperation,
  type DatabasePlanApprovalCode,
  DatabasePlanApprovalCodeSchema,
  type DatabasePlanArtifact,
  type DatabasePlanConflict,
  DatabasePlanError,
  type DatabasePlanErrorCode,
  type DatabaseTargetResolution,
  type DatabaseVerificationDraftResult,
  type DatabaseWriteGuardSnapshot,
  type ResolveDatabaseWriteGuards,
} from './database-plan-artifacts.ts';

export {
  type DatabaseDesiredStateDraft,
  type DatabaseDesiredStateDraftInput,
  DatabaseDesiredStateDraftSchema,
} from './database-plan-draft-contracts.ts';

export interface CreateDatabasePlanEngineOptions {
  databaseStore: DatabaseStore;
  databaseRecordIndex?: DatabaseRecordIndex;
  projectDir?: string;
  contentDir?: string;
  readFile?: (absolutePath: string) => string;
  now?: () => Date;
  generateUuid?: () => string;
  resolveWriteGuards?: ResolveDatabaseWriteGuards;
}

export class DatabasePlanEngine {
  readonly #databaseStore: DatabaseStore;
  readonly #databaseRecordIndex?: DatabaseRecordIndex;
  readonly #projectDir?: string;
  readonly #contentDir?: string;
  readonly #readFile: (absolutePath: string) => string;
  readonly #now: () => Date;
  readonly #generateUuid: () => string;
  readonly #resolveWriteGuards: ResolveDatabaseWriteGuards;
  readonly #drafts = new Map<string, DatabaseDraftArtifact>();
  readonly #plans = new Map<string, DatabasePlanArtifact>();

  constructor(options: CreateDatabasePlanEngineOptions) {
    this.#databaseStore = options.databaseStore;
    this.#databaseRecordIndex = options.databaseRecordIndex;
    this.#projectDir = options.projectDir === undefined ? undefined : resolve(options.projectDir);
    this.#contentDir = options.contentDir === undefined ? undefined : resolve(options.contentDir);
    this.#readFile = options.readFile ?? ((path) => readFileSync(path, 'utf8'));
    this.#now = options.now ?? (() => new Date());
    this.#generateUuid = options.generateUuid ?? randomUUID;
    this.#resolveWriteGuards =
      options.resolveWriteGuards ??
      (({ definition, immutableTargetSet, operation }) => ({
        permissions: [
          {
            scopeId:
              operation === 'verification'
                ? (immutableTargetSet.find((target) => target.startsWith('ds_')) ?? definition.id)
                : definition.id,
            policyId: operation === 'verification' ? 'project-owner-verification' : 'project-owner',
            policyRevision: hash(`synapsenote:database-${operation}-access:project-owner:v1`),
            ...(operation === 'verification' ? { capability: 'verification' as const } : {}),
          },
        ],
        querySnapshots: [],
      }));
  }

  captureWriteGuards(
    draftId: string,
    immutableTargetSet: readonly string[],
  ): DatabaseWriteGuardSnapshot {
    const draft = this.getDraft(draftId);
    const operation = draft.normalized.verificationChange ? 'verification' : 'write';
    try {
      const parsed = DatabaseWriteGuardSnapshotSchema.parse(
        this.#resolveWriteGuards({
          definition: clone(draft.normalized.definition),
          immutableTargetSet: [...immutableTargetSet],
          operation,
        }),
      );
      const permissions = [...parsed.permissions].sort(
        (left, right) =>
          left.scopeId.localeCompare(right.scopeId) || left.policyId.localeCompare(right.policyId),
      );
      const querySnapshots = [...parsed.querySnapshots].sort((left, right) =>
        left.queryId.localeCompare(right.queryId),
      );
      if (new Set(permissions.map((guard) => guard.scopeId)).size !== permissions.length) {
        throw new Error('Write permission guards contain a duplicate scopeId');
      }
      if (new Set(querySnapshots.map((guard) => guard.queryId)).size !== querySnapshots.length) {
        throw new Error('Write query guards contain a duplicate queryId');
      }
      if (
        operation === 'verification' &&
        !permissions.some(
          (guard) =>
            guard.capability === 'verification' &&
            guard.scopeId === draft.normalized.verificationChange?.sourceId,
        )
      ) {
        throw new Error(
          'Verification changes require an explicit source-scoped verification permission guard',
        );
      }
      return { permissions, querySnapshots };
    } catch (error) {
      throw new DatabasePlanError(
        'write_guard_unavailable',
        'Write concurrency guards could not be resolved safely',
        { reason: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  createDraft(input: unknown, ttlSeconds = 1_800): DatabaseDraftArtifact {
    const ttl = Math.min(86_400, Math.max(60, Math.trunc(ttlSeconds)));
    const parsed = DatabaseDesiredStateDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new DatabasePlanError('invalid_desired_state', 'Desired database state is invalid', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    let normalized: DatabaseDraftArtifact['normalized'];
    try {
      normalized = this.#normalize(parsed.data);
    } catch (error) {
      throw new DatabasePlanError('invalid_desired_state', 'Desired database state is invalid', {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    const now = this.#now();
    const id = `draft_${compactUuid(this.#generateUuid)}`;
    const artifact: DatabaseDraftArtifact = {
      id,
      revision: hash({ desiredState: parsed.data, normalized }),
      createdAt: now.toISOString(),
      expiresAt: expiry(now, ttl),
      desiredState: parsed.data,
      normalized,
    };
    this.#drafts.set(id, clone(artifact));
    return clone(artifact);
  }

  createDatabaseDeletionDraft(
    databaseId: string,
    expectedSnapshotRevision: string,
    ttlSeconds = 1_800,
  ): DatabaseDraftArtifact {
    const artifact = createDatabaseDeletionDraftPolicy(
      {
        databaseStore: this.#databaseStore,
        databaseRecordIndex: this.#databaseRecordIndex,
        now: this.#now,
        generateUuid: this.#generateUuid,
      },
      databaseId,
      expectedSnapshotRevision,
      ttlSeconds,
    );
    this.#drafts.set(artifact.id, clone(artifact));
    return clone(artifact);
  }

  createVerificationDraft(
    lifecycleInput: unknown,
    authenticatedActor: unknown,
    ttlSeconds = 1_800,
  ): DatabaseVerificationDraftResult {
    const result = createDatabaseVerificationDraftPolicy(
      {
        databaseStore: this.#databaseStore,
        databaseRecordIndex: this.#databaseRecordIndex,
        now: this.#now,
        generateUuid: this.#generateUuid,
      },
      lifecycleInput,
      authenticatedActor,
      ttlSeconds,
    );
    this.#drafts.set(result.draft.id, clone(result.draft));
    return result;
  }

  getDraft(id: string): DatabaseDraftArtifact {
    const draft = this.#drafts.get(id);
    if (!draft)
      throw new DatabasePlanError('draft_not_found', `Draft "${id}" was not found`, { id });
    if (Date.parse(draft.expiresAt) <= this.#now().getTime()) {
      this.#drafts.delete(id);
      throw new DatabasePlanError('draft_expired', `Draft "${id}" has expired`, {
        id,
        expiredAt: draft.expiresAt,
      });
    }
    return clone(draft);
  }

  /** Restore an exact durable draft after a server process restart. */
  restoreDraft(draft: DatabaseDraftArtifact): void {
    this.#drafts.set(draft.id, clone(draft));
  }

  discardDraft(id: string): { discarded: boolean; draftId: string } {
    return { discarded: this.#drafts.delete(id), draftId: id };
  }

  createPlan(draftId: string, ttlSeconds = 900): DatabasePlanArtifact {
    const draft = this.getDraft(draftId);
    const snapshot = this.#databaseStore.snapshot();
    const ttl = Math.min(3_600, Math.max(60, Math.trunc(ttlSeconds)));
    const now = this.#now();
    const expiresAt = new Date(
      Math.min(now.getTime() + ttl * 1_000, Date.parse(draft.expiresAt)),
    ).toISOString();
    if (draft.normalized.databaseDeletion) {
      return this.#createDatabaseDeletionPlan(draft, snapshot, now, expiresAt);
    }
    const plan = compileDatabasePlan(
      {
        databaseRecordIndex: this.#databaseRecordIndex,
        projectDir: this.#projectDir,
        contentDir: this.#contentDir,
        readFile: this.#readFile,
        generateUuid: this.#generateUuid,
        captureWriteGuards: (id, immutableTargetSet) =>
          this.captureWriteGuards(id, immutableTargetSet),
      },
      draft,
      snapshot,
      now,
      expiresAt,
    );
    this.#plans.set(plan.id, clone(plan));
    return clone(plan);
  }

  getPlan(id: string): DatabasePlanArtifact {
    const plan = this.#plans.get(id);
    if (!plan) throw new DatabasePlanError('plan_not_found', `Plan "${id}" was not found`, { id });
    if (Date.parse(plan.expiresAt) <= this.#now().getTime()) {
      this.#plans.delete(id);
      throw new DatabasePlanError('plan_expired', `Plan "${id}" has expired`, {
        id,
        expiredAt: plan.expiresAt,
      });
    }
    return clone(plan);
  }

  /** Restore an exact durable plan after a server process restart. */
  restorePlan(plan: DatabasePlanArtifact): void {
    this.#plans.set(plan.id, clone(plan));
  }

  #createDatabaseDeletionPlan(
    draft: DatabaseDraftArtifact,
    snapshot: ReturnType<DatabaseStore['snapshot']>,
    now: Date,
    expiresAt: string,
  ): DatabasePlanArtifact {
    const plan = compileDatabaseDeletionPlanPolicy(
      {
        draft,
        snapshot,
        databaseRecordIndex: this.#databaseRecordIndex,
        projectDir: this.#projectDir,
        readFile: this.#readFile,
        generateUuid: this.#generateUuid,
        captureWriteGuards: this.captureWriteGuards.bind(this),
      },
      now,
      expiresAt,
    );
    this.#plans.set(plan.id, clone(plan));
    return clone(plan);
  }

  #normalize(desiredState: DatabaseDesiredStateDraft): DatabaseDraftArtifact['normalized'] {
    const snapshot = this.#databaseStore.snapshot();
    const existingById = desiredState.database.id
      ? (snapshot.databases.find((database) => database.id === desiredState.database.id) ?? null)
      : null;
    const existingByKey =
      snapshot.databases.find((database) => database.key === desiredState.database.key) ?? null;
    const currentDefinition = existingById ?? (desiredState.database.id ? null : existingByKey);
    const targetResolutions: DatabaseTargetResolution[] = [];
    const databaseId =
      desiredState.database.id ?? existingByKey?.id ?? `db_${compactUuid(this.#generateUuid)}`;
    targetResolutions.push({
      kind: 'database',
      selector: desiredState.database.id ? 'database.id' : 'database.key',
      targetId: databaseId,
      via: desiredState.database.id ? 'explicit_id' : existingByKey ? 'stable_key' : 'generated',
    });
    const desiredPeople = desiredState.database.people ?? currentDefinition?.people ?? [];
    const normalizedPeople = desiredPeople.map((person) => {
      const currentPerson = currentDefinition?.people.find(
        (candidate) =>
          candidate.key === person.key ||
          (typeof person.id === 'string' && candidate.id === person.id),
      );
      const personId =
        person.id ?? currentPerson?.id ?? `person_${compactUuid(this.#generateUuid)}`;
      targetResolutions.push({
        kind: 'person',
        selector: `database.people.${person.key}`,
        targetId: personId,
        via: person.id ? 'explicit_id' : currentPerson ? 'stable_key' : 'generated',
      });
      return {
        id: personId,
        key: person.key,
        name: person.name,
        kind: person.kind,
        ...(person.subjectId === undefined ? {} : { subjectId: person.subjectId }),
        ...(person.active === undefined ? {} : { active: person.active }),
      };
    });
    const currentSourceByDesiredKey = new Map(
      desiredState.sources.map((source) => [
        source.key,
        currentDefinition?.sources.find((candidate) => candidate.key === source.key) ?? null,
      ]),
    );
    const sourceIdByKey = new Map<string, string>();
    for (const source of desiredState.sources) {
      const currentSource = currentSourceByDesiredKey.get(source.key);
      const sourceId = source.id ?? currentSource?.id ?? `ds_${compactUuid(this.#generateUuid)}`;
      sourceIdByKey.set(source.key, sourceId);
      targetResolutions.push({
        kind: 'source',
        selector: `sources.${source.key}`,
        targetId: sourceId,
        via: source.id ? 'explicit_id' : currentSource ? 'stable_key' : 'generated',
      });
    }
    const propertyIdsBySource = new Map<string, Map<string, string>>();
    for (const source of desiredState.sources) {
      const resolvedSourceId = sourceIdByKey.get(source.key);
      const currentSource = currentSourceByDesiredKey.get(source.key);
      const reusableSource = currentSource?.id === resolvedSourceId ? currentSource : null;
      const propertyIds = new Map<string, string>();
      for (const property of source.properties) {
        const currentProperty = reusableSource?.properties.find(
          (candidate) => candidate.key === property.key,
        );
        const propertyId =
          property.id ?? currentProperty?.id ?? `prop_${compactUuid(this.#generateUuid)}`;
        propertyIds.set(property.key, propertyId);
        targetResolutions.push({
          kind: 'property',
          selector: `sources.${source.key}.properties.${property.key}`,
          targetId: propertyId,
          via: property.id ? 'explicit_id' : currentProperty ? 'stable_key' : 'generated',
        });
      }
      propertyIdsBySource.set(source.key, propertyIds);
    }
    const wantsMarkdownTableStorage =
      desiredState.sources.some(
        (source) =>
          source.storage === 'markdown_table' ||
          (source.storage && typeof source.storage === 'object'),
      ) || currentDefinition?.version === 2;
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
          ...(typeof property.description === 'string'
            ? { description: property.description }
            : {}),
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
                  : (currentGroup?.id ?? `stg_${compactUuid(this.#generateUuid)}`),
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
                  : (currentOption?.id ?? `opt_${compactUuid(this.#generateUuid)}`);
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
                  : (currentOption?.id ?? `opt_${compactUuid(this.#generateUuid)}`);
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
          const currentUniqueId =
            currentProperty?.type === 'unique_id' ? currentProperty : undefined;
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
                operations: action.operations.map(
                  (rawOperation: unknown, operationIndex: number) => {
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
                  },
                ),
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
      if (!sourceId || !propertyIds)
        throw new Error(`View "${view.key}" has an unknown source key`);
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
      const viewId = view.id ?? currentView?.id ?? `view_${compactUuid(this.#generateUuid)}`;
      targetResolutions.push({
        kind: 'view',
        selector: `views.${view.key}`,
        targetId: viewId,
        via: view.id ? 'explicit_id' : currentView ? 'stable_key' : 'generated',
      });
      const conditionalColors = Array.isArray(raw.conditionalColors)
        ? raw.conditionalColors.map((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              throw new Error(
                `View "${view.key}" conditional color ${index + 1} must be an object`,
              );
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
            const id = explicitId ?? currentRule?.id ?? `ccr_${compactUuid(this.#generateUuid)}`;
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
                  throw new Error(
                    `View "${view.key}" projection has unknown property key "${key}"`,
                  );
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
        throw new Error(
          `Template "${template.key}" has unknown source key "${template.sourceKey}"`,
        );
      }
      const currentTemplate = currentDefinition?.templates.find(
        (candidate) => candidate.key === template.key,
      );
      const id = template.id ?? currentTemplate?.id ?? `tpl_${compactUuid(this.#generateUuid)}`;
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
            const owner = normalizedPeople.find(
              (person) => person.key === template.repeat?.ownerKey,
            );
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
      const id = button.id ?? currentButton?.id ?? `dbbtn_${compactUuid(this.#generateUuid)}`;
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
      const id =
        automation.id ?? currentAutomation?.id ?? `auto_${compactUuid(this.#generateUuid)}`;
      targetResolutions.push({
        kind: 'automation',
        selector: `automations.${automation.key}`,
        targetId: id,
        via: automation.id ? 'explicit_id' : currentAutomation ? 'stable_key' : 'generated',
      });
      const owner = normalizedPeople.find((person) => person.key === automation.ownerKey);
      if (!owner)
        throw new Error(
          `Automation "${automation.key}" has unknown owner "${automation.ownerKey}"`,
        );
      const sourceForKey = (sourceKey: string) => {
        const source = normalizedSources.find((candidate) => candidate.key === sourceKey);
        if (!source)
          throw new Error(`Automation "${automation.key}" has unknown source "${sourceKey}"`);
        return source;
      };
      const propertyForKey = (
        source: DatabaseDefinition['sources'][number],
        propertyKey: string,
      ) => {
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
            throw new Error(
              `Automation "${automation.key}" has unknown Button "${input.buttonKey}"`,
            );
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
      if (!uniquePropertyId)
        throw new Error('Unique key references an unknown source/property key');
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
    const explicitSampleRecords = desiredState.sampleRecords.map((sample, sampleIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === sample.sourceKey);
      if (!source) throw new Error(`Sample record has unknown source key "${sample.sourceKey}"`);
      const values: Record<string, unknown> = {};
      for (const [propertyKey, value] of Object.entries(sample.values)) {
        const property = source.properties.find((candidate) => candidate.key === propertyKey);
        if (!property) throw new Error(`Sample record has unknown property key "${propertyKey}"`);
        try {
          const normalizedValue = normalizeSampleValue(property, value, definition.people);
          values[property.id] = normalizedValue;
          if (property.type === 'select' || property.type === 'status') {
            const option = property.options.find((candidate) => candidate.id === normalizedValue);
            if (option) {
              targetResolutions.push({
                kind: 'option',
                selector: `sampleRecords.${sampleIndex}.values.${propertyKey}`,
                targetId: option.id,
                via:
                  value === option.id
                    ? 'explicit_id'
                    : value === option.key
                      ? 'stable_key'
                      : 'exact_name',
              });
            }
          } else if (property.type === 'multi_select' && Array.isArray(normalizedValue)) {
            normalizedValue.forEach((optionId, optionIndex) => {
              const option = property.options.find((candidate) => candidate.id === optionId);
              const input = Array.isArray(value) ? value[optionIndex] : undefined;
              if (!option) return;
              targetResolutions.push({
                kind: 'option',
                selector: `sampleRecords.${sampleIndex}.values.${propertyKey}.${optionIndex}`,
                targetId: option.id,
                via:
                  input === option.id
                    ? 'explicit_id'
                    : input === option.key
                      ? 'stable_key'
                      : 'exact_name',
              });
            });
          } else if (property.type === 'person' && Array.isArray(normalizedValue)) {
            normalizedValue.forEach((personId, personIndex) => {
              const person = definition.people.find((candidate) => candidate.id === personId);
              const input = Array.isArray(value) ? value[personIndex] : undefined;
              if (!person) return;
              targetResolutions.push({
                kind: 'person',
                selector: `sampleRecords.${sampleIndex}.values.${propertyKey}.${personIndex}`,
                targetId: person.id,
                via:
                  input === person.id
                    ? 'explicit_id'
                    : input === person.key
                      ? 'stable_key'
                      : 'exact_name',
              });
            });
          } else if (property.type === 'relation') {
            const recordIds = Array.isArray(normalizedValue)
              ? normalizedValue.map(String)
              : [String(normalizedValue)];
            recordIds.forEach((recordId, relationIndex) => {
              targetResolutions.push({
                kind: 'record',
                selector: `sampleRecords.${sampleIndex}.values.${propertyKey}.${relationIndex}`,
                targetId: recordId,
                via: 'explicit_id',
              });
            });
          }
        } catch (error) {
          throw new Error(
            `Sample property "${propertyKey}" is invalid: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      for (const property of source.properties) {
        if (values[property.id] === undefined && property.semantics.defaultValue !== undefined) {
          values[property.id] = normalizeSampleValue(
            property,
            structuredClone(property.semantics.defaultValue),
            definition.people,
          );
        }
      }
      let recordId = sample.id;
      let documentId = sample.documentId as DatabaseDocumentId | undefined;
      let expectedRevision = sample.expectedRevision ?? null;
      let resolutionVia: DatabaseTargetResolution['via'] = sample.id ? 'explicit_id' : 'generated';
      if (!recordId && uniquePropertyId && values[uniquePropertyId] !== undefined) {
        const matches = (this.#databaseRecordIndex?.list(databaseId, source.id) ?? []).filter(
          (record) => same(record.values[uniquePropertyId], values[uniquePropertyId]),
        );
        if (matches.length > 1) {
          throw new Error(
            `Sample record unique key resolves ambiguously to ${matches.length} records`,
          );
        }
        const match = matches[0];
        if (match) {
          if (!match.revision) throw new Error(`Record "${match.id}" has no stable revision`);
          recordId = match.id;
          expectedRevision ??= match.revision;
          resolutionVia = 'unique_property';
        }
      }
      if (source.storage?.kind === 'markdown_table' && !recordId) {
        documentId ??= createDatabaseDocumentId(this.#generateUuid);
        recordId = createDatabaseMarkdownRecordId(source.id, documentId);
      }
      recordId ??= `rec_${compactUuid(this.#generateUuid)}`;
      if (source.storage?.kind === 'markdown_table' && documentId) {
        const canonicalRecordId = createDatabaseMarkdownRecordId(source.id, documentId);
        if (recordId !== canonicalRecordId) {
          throw new Error(
            `V2 sample record "${recordId}" does not match document identity "${documentId}" for source "${source.id}"`,
          );
        }
      }
      if (sample.pageLayoutOverride) {
        const layoutIssues = databaseRecordPageLayoutOverrideIssues(
          source,
          sample.pageLayoutOverride,
        );
        if (layoutIssues.length > 0) {
          throw new Error(
            `Sample record page layout override is invalid: ${layoutIssues.join('; ')}`,
          );
        }
      }
      targetResolutions.push({
        kind: 'record',
        selector: sample.id
          ? `sampleRecords.${sampleIndex}.id`
          : resolutionVia === 'unique_property'
            ? `sampleRecords.${sampleIndex}.uniqueKey`
            : `sampleRecords.${sampleIndex}`,
        targetId: recordId,
        via: resolutionVia,
      });
      return {
        id: recordId,
        sourceId: source.id,
        values,
        body: sample.body,
        expectedRevision,
        ...(documentId ? { documentId } : {}),
        ...(sample.pageLayoutOverride !== undefined
          ? {
              pageLayoutOverride: sample.pageLayoutOverride
                ? structuredClone(sample.pageLayoutOverride)
                : null,
            }
          : {}),
      };
    });
    const explicitSampleIds = new Set(explicitSampleRecords.map((record) => record.id));
    const uniqueIdBackfillRecords = definition.sources.flatMap((source) => {
      const currentSource = currentDefinition?.sources.find(
        (candidate) => candidate.id === source.id,
      );
      const addsUniqueId = source.properties.some(
        (property) =>
          property.type === 'unique_id' &&
          currentSource?.properties.find((candidate) => candidate.id === property.id)?.type !==
            'unique_id',
      );
      if (!addsUniqueId) return [];
      return (this.#databaseRecordIndex?.list(databaseId, source.id) ?? [])
        .filter((record) => !explicitSampleIds.has(record.id))
        .map((record) => {
          if (!record.revision) {
            throw new Error(`Unique ID backfill record "${record.id}" has no stable revision`);
          }
          return {
            id: record.id,
            sourceId: source.id,
            values: structuredClone(record.values) as Record<string, unknown>,
            body: record.body,
            expectedRevision: record.revision,
            archivedAt: record.archivedAt ?? null,
            ...(record.pageLayoutOverride
              ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
              : {}),
          };
        });
    });
    const recordCopies = desiredState.recordCopies.map((copy, copyIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === copy.sourceKey);
      if (!source) throw new Error(`Record copy has unknown source key "${copy.sourceKey}"`);
      const sourceRecord = this.#databaseRecordIndex?.getById(copy.id) ?? null;
      if (!sourceRecord) throw new Error(`Record copy source "${copy.id}" was not found`);
      if (sourceRecord.databaseId !== databaseId || sourceRecord.sourceId !== source.id) {
        throw new Error('Record copy source belongs to a different database or source');
      }
      if (!sourceRecord.revision)
        throw new Error(`Record copy source "${copy.id}" has no revision`);
      const titleProperty = source.properties.find((property) => property.type === 'title');
      if (!titleProperty)
        throw new Error(`Record copy source "${source.key}" has no title property`);
      const newRecordId = copy.newId ?? `rec_${compactUuid(this.#generateUuid)}`;
      if (newRecordId === sourceRecord.id)
        throw new Error('A record copy must use a new stable ID');
      targetResolutions.push({
        kind: 'record',
        selector: `recordCopies.${copyIndex}.id`,
        targetId: sourceRecord.id,
        via: 'explicit_id',
      });
      targetResolutions.push({
        kind: 'record',
        selector: copy.newId ? `recordCopies.${copyIndex}.newId` : `recordCopies.${copyIndex}`,
        targetId: newRecordId,
        via: copy.newId ? 'explicit_id' : 'generated',
      });
      return {
        sourceRecordId: sourceRecord.id,
        expectedRevision: copy.expectedRevision,
        sourcePath: sourceRecord.path,
        newRecordId,
        sample: {
          id: newRecordId,
          sourceId: source.id,
          values: { ...sourceRecord.values, [titleProperty.id]: copy.title },
          body: sourceRecord.body,
          expectedRevision: null,
          ...(sourceRecord.pageLayoutOverride
            ? { pageLayoutOverride: structuredClone(sourceRecord.pageLayoutOverride) }
            : {}),
        },
      };
    });
    const archiveTimestamp = this.#now().toISOString();
    const recordArchives = desiredState.recordArchives.map((archive, archiveIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === archive.sourceKey);
      if (!source) throw new Error(`Record archive has unknown source key "${archive.sourceKey}"`);
      const record = this.#databaseRecordIndex?.getById(archive.id) ?? null;
      if (!record) throw new Error(`Record archive target "${archive.id}" was not found`);
      if (record.databaseId !== databaseId || record.sourceId !== source.id) {
        throw new Error('Record archive target belongs to a different database or source');
      }
      if (!record.revision)
        throw new Error(`Record archive target "${archive.id}" has no revision`);
      const archivedAt =
        archive.action === 'archive' ? (record.archivedAt ?? archiveTimestamp) : null;
      targetResolutions.push({
        kind: 'record',
        selector: `recordArchives.${archiveIndex}.id`,
        targetId: record.id,
        via: 'explicit_id',
      });
      return {
        recordId: record.id,
        action: archive.action,
        archivedAt,
        sample: {
          id: record.id,
          sourceId: source.id,
          values: record.values,
          body: record.body,
          expectedRevision: archive.expectedRevision,
          archivedAt,
          ...(record.pageLayoutOverride
            ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
            : {}),
        },
      };
    });
    const recordMoves = desiredState.recordMoves.map((move, moveIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === move.sourceKey);
      const target = definition.sources.find((candidate) => candidate.key === move.targetSourceKey);
      if (!source || !target) throw new Error('Record move references an unknown source key');
      if (source.id === target.id) throw new Error('Record move target must be a different source');
      const record = this.#databaseRecordIndex?.getById(move.id) ?? null;
      if (!record) throw new Error(`Record move target "${move.id}" was not found`);
      if (record.databaseId !== databaseId || record.sourceId !== source.id) {
        throw new Error('Record move target belongs to a different database or source');
      }
      if (!record.revision) throw new Error(`Record move target "${move.id}" has no revision`);
      const sourceMapping = (definition.sourceMappings ?? []).find(
        (mapping) => mapping.sourceId === source.id && mapping.targetSourceId === target.id,
      );
      if (!sourceMapping) {
        throw new Error(
          `Record move requires an explicit source mapping from "${source.key}" to "${target.key}"`,
        );
      }
      const values: Record<string, unknown> = {};
      for (const targetProperty of target.properties) {
        const propertyMapping = sourceMapping.propertyMappings.find(
          (mapping) => mapping.targetPropertyId === targetProperty.id,
        );
        const sourceProperty = source.properties.find(
          (property) => property.id === propertyMapping?.sourcePropertyId,
        );
        const sourceValue = sourceProperty ? record.values[sourceProperty.id] : undefined;
        if (sourceValue === undefined) {
          if (targetProperty.required) {
            throw new Error(
              `Record move cannot satisfy required target property "${targetProperty.key}"`,
            );
          }
          continue;
        }
        if (
          (sourceProperty?.type === 'select' || sourceProperty?.type === 'status') &&
          targetProperty.type === sourceProperty.type &&
          typeof sourceValue === 'string'
        ) {
          const explicitTargetOptionId = propertyMapping?.optionMappings.find(
            (mapping) => mapping.sourceOptionId === sourceValue,
          )?.targetOptionId;
          const optionKey = sourceProperty.options.find((option) => option.id === sourceValue)?.key;
          const targetOption = targetProperty.options.find(
            (option) =>
              option.id === explicitTargetOptionId ||
              (explicitTargetOptionId === undefined && option.key === optionKey),
          );
          if (!targetOption) {
            throw new Error(
              `Record move cannot map select option for target property "${targetProperty.key}"`,
            );
          }
          values[targetProperty.id] = targetOption.id;
        } else if (
          sourceProperty?.type === 'multi_select' &&
          targetProperty.type === 'multi_select' &&
          Array.isArray(sourceValue)
        ) {
          values[targetProperty.id] = sourceValue.map((sourceOptionId) => {
            const explicitTargetOptionId = propertyMapping?.optionMappings.find(
              (mapping) => mapping.sourceOptionId === sourceOptionId,
            )?.targetOptionId;
            const optionKey = sourceProperty.options.find(
              (option) => option.id === sourceOptionId,
            )?.key;
            const targetOption = targetProperty.options.find(
              (option) =>
                option.id === explicitTargetOptionId ||
                (explicitTargetOptionId === undefined && option.key === optionKey),
            );
            if (!targetOption) {
              throw new Error(
                `Record move cannot map multi-select option for target property "${targetProperty.key}"`,
              );
            }
            return targetOption.id;
          });
        } else {
          values[targetProperty.id] = sourceValue;
        }
      }
      const targetPath = `${target.folder === '.' ? '' : `${target.folder}/`}${record.id}.md`;
      targetResolutions.push({
        kind: 'record',
        selector: `recordMoves.${moveIndex}.id`,
        targetId: record.id,
        via: 'explicit_id',
      });
      return {
        recordId: record.id,
        expectedRevision: move.expectedRevision,
        sourceId: source.id,
        targetSourceId: target.id,
        sourcePath: record.path,
        targetPath,
        values,
        body: record.body,
        archivedAt: record.archivedAt ?? null,
        pageLayoutOverride: null,
      };
    });
    const sampleRecords = [
      ...explicitSampleRecords,
      ...uniqueIdBackfillRecords,
      ...recordCopies.map((copy) => copy.sample),
      ...recordArchives.map((archive) => archive.sample),
    ];
    const recordMutations = desiredState.recordMutations.map((mutation, mutationIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === mutation.sourceKey);
      if (!source) {
        throw new Error(`Record mutation has unknown source key "${mutation.sourceKey}"`);
      }
      let record = mutation.id ? this.#databaseRecordIndex?.getById(mutation.id) : null;
      const via: DatabaseTargetResolution['via'] = mutation.id ? 'explicit_id' : 'unique_property';
      if (!mutation.id) {
        if (!uniquePropertyId) {
          throw new Error('A uniqueValue mutation target requires a declared unique key');
        }
        const uniqueProperty = source.properties.find(
          (property) => property.id === uniquePropertyId,
        );
        if (!uniqueProperty) {
          throw new Error('The declared unique key does not belong to the mutation source');
        }
        const uniqueValue = normalizeSampleValue(
          uniqueProperty,
          mutation.uniqueValue,
          definition.people,
          { allowInactivePeople: true },
        );
        const matches = (this.#databaseRecordIndex?.list(databaseId, source.id) ?? []).filter(
          (candidate) => same(candidate.values[uniquePropertyId], uniqueValue),
        );
        if (matches.length !== 1) {
          throw new Error(
            `Record mutation unique key resolved to ${matches.length} records; expected exactly one`,
          );
        }
        record = matches[0] ?? null;
      }
      if (!record) throw new Error('Record mutation target was not found in the current index');
      if (record.databaseId !== databaseId || record.sourceId !== source.id) {
        throw new Error('Record mutation target belongs to a different database or source');
      }
      if (!record.revision)
        throw new Error(`Record mutation target "${record.id}" has no revision`);
      const applied = applyRecordMutation(source, definition.people, record, mutation);
      const requestedExpectedRevision = mutation.expectedRevision ?? record.revision;
      const preconditionsMatch =
        mutation.preconditions.length > 0 &&
        mutation.preconditions.every((precondition) => {
          const property = source.properties.find(
            (candidate) => candidate.key === precondition.propertyKey,
          );
          if (!property) return false;
          const present = Object.hasOwn(record.values, property.id);
          return (
            present === precondition.present &&
            (!present || same(record.values[property.id], precondition.value))
          );
        });
      const alreadyConverged = same(record.values, applied.values) && record.body === applied.body;
      const expectedRevision =
        requestedExpectedRevision === record.revision || preconditionsMatch || alreadyConverged
          ? record.revision
          : requestedExpectedRevision;
      targetResolutions.push({
        kind: 'record',
        selector: mutation.id
          ? `recordMutations.${mutationIndex}.id`
          : `recordMutations.${mutationIndex}.uniqueValue`,
        targetId: record.id,
        via,
      });
      for (const [operationIndex, operation] of applied.operations.entries()) {
        if (operation.kind === 'link' || operation.kind === 'unlink') {
          targetResolutions.push({
            kind: 'record',
            selector: `recordMutations.${mutationIndex}.operations.${operationIndex}.recordId`,
            targetId: operation.recordId,
            via: 'explicit_id',
          });
        } else if (
          (operation.kind === 'add' || operation.kind === 'remove') &&
          definition.people.some((person) => person.id === operation.value)
        ) {
          targetResolutions.push({
            kind: 'person',
            selector: `recordMutations.${mutationIndex}.operations.${operationIndex}.value`,
            targetId: operation.value,
            via: 'explicit_id',
          });
        }
      }
      return {
        recordId: record.id,
        sourceId: source.id,
        expectedRevision,
        values: applied.values,
        body: applied.body,
        operations: applied.operations,
        ...(record.pageLayoutOverride
          ? { pageLayoutOverride: structuredClone(record.pageLayoutOverride) }
          : {}),
      };
    });
    const recordDeletions = desiredState.recordDeletions.map((deletion, deletionIndex) => {
      const source = definition.sources.find((candidate) => candidate.key === deletion.sourceKey);
      if (!source) {
        throw new Error(`Record deletion has unknown source key "${deletion.sourceKey}"`);
      }
      const record = this.#databaseRecordIndex?.getById(deletion.id) ?? null;
      if (!record) throw new Error(`Record deletion target "${deletion.id}" was not found`);
      if (record.databaseId !== databaseId || record.sourceId !== source.id) {
        throw new Error('Record deletion target belongs to a different database or source');
      }
      if (!record.revision)
        throw new Error(`Record deletion target "${record.id}" has no revision`);
      targetResolutions.push({
        kind: 'record',
        selector: `recordDeletions.${deletionIndex}.id`,
        targetId: record.id,
        via: 'explicit_id',
      });
      return {
        recordId: record.id,
        sourceId: source.id,
        expectedRevision: deletion.expectedRevision,
        path: record.path,
        values: record.values,
        body: record.body,
      };
    });
    for (const source of definition.sources) {
      const uniqueProperties = source.properties.filter(
        (property): property is Extract<DatabaseProperty, { type: 'unique_id' }> =>
          property.type === 'unique_id',
      );
      if (uniqueProperties.length === 0) continue;
      const indexedRecords = this.#databaseRecordIndex?.list(databaseId, source.id) ?? [];
      for (const property of uniqueProperties) {
        const observed = indexedRecords
          .map((record) => record.values[property.id])
          .filter(
            (value): value is number =>
              typeof value === 'number' && Number.isSafeInteger(value) && value >= 1,
          );
        const used = new Set(observed);
        let nextNumber = Math.max(property.nextNumber, 1, ...observed.map((value) => value + 1));
        const allocate = (): number => {
          while (used.has(nextNumber)) nextNumber += 1;
          if (!Number.isSafeInteger(nextNumber)) {
            throw new Error(`Unique ID property "${property.key}" exhausted safe integers`);
          }
          const allocated = nextNumber;
          used.add(allocated);
          nextNumber += 1;
          return allocated;
        };
        for (const sample of sampleRecords.filter((record) => record.sourceId === source.id)) {
          const existing = this.#databaseRecordIndex?.getById(sample.id);
          const currentValue =
            existing?.sourceId === source.id ? existing.values[property.id] : undefined;
          sample.values[property.id] =
            typeof currentValue === 'number' &&
            Number.isSafeInteger(currentValue) &&
            currentValue >= 1
              ? currentValue
              : allocate();
        }
        for (const move of recordMoves.filter((record) => record.targetSourceId === source.id)) {
          move.values[property.id] = allocate();
        }
        property.nextNumber = nextNumber;
      }
    }
    definition = DatabaseDefinitionSchema.parse(definition);
    const pairedRelations = reconcilePairedRelationSamples(
      definition,
      currentDefinition,
      [
        ...sampleRecords.map((sample) => ({
          ...sample,
          values: structuredClone(sample.values) as Record<string, unknown>,
        })),
        ...recordMutations.map((mutation) => ({
          id: mutation.recordId,
          sourceId: mutation.sourceId,
          values: structuredClone(mutation.values) as Record<string, unknown>,
          body: mutation.body,
          expectedRevision: mutation.expectedRevision,
          ...(mutation.pageLayoutOverride
            ? { pageLayoutOverride: structuredClone(mutation.pageLayoutOverride) }
            : {}),
        })),
      ],
      (recordId) => this.#databaseRecordIndex?.getById(recordId) ?? null,
    );
    return {
      definition,
      uniquePropertyId,
      templates: clone(desiredState.templates),
      policy: clone(desiredState.policy),
      sampleRecords: pairedRelations.samples,
      recordMutations: [
        ...recordMutations.map((mutation) => ({
          recordId: mutation.recordId,
          sourceId: mutation.sourceId,
          operations: mutation.operations,
        })),
        ...pairedRelations.inverseMutations,
      ],
      recordCopies: recordCopies.map(({ sample: _sample, ...copy }) => copy),
      recordArchives: recordArchives.map(({ sample: _sample, ...archive }) => archive),
      recordMoves,
      recordDeletions,
      targetResolutions,
    };
  }
}

export function createDatabasePlanEngine(
  options: CreateDatabasePlanEngineOptions,
): DatabasePlanEngine {
  return new DatabasePlanEngine(options);
}
