import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type DatabaseRecordMutation,
  DatabaseRecordMutationSchema,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseStore } from './database-store.ts';

export type { DatabaseRecordMutation };
export { DatabaseRecordMutationSchema };

import {
  type DatabaseDraftArtifact,
  type DatabasePlanArtifact,
  DatabasePlanError,
  type DatabaseVerificationDraftResult,
  type DatabaseWriteGuardSnapshot,
  type ResolveDatabaseWriteGuards,
} from './database-plan-artifacts.ts';
import {
  cloneDatabasePlanValue as clone,
  compactDatabasePlanUuid as compactUuid,
  databasePlanExpiry as expiry,
  hashDatabasePlanValue as hash,
} from './database-plan-convergence-policy.ts';
import {
  compileDatabaseDeletionPlanPolicy,
  createDatabaseDeletionDraftPolicy,
  createDatabaseVerificationDraftPolicy,
} from './database-plan-destruction-verification-policy.ts';
import { DatabaseDesiredStateDraftSchema } from './database-plan-draft-contracts.ts';
import { compileDatabasePlan } from './database-plan-manifest-record-compiler.ts';
import { normalizeDatabasePlanDesiredState } from './database-plan-normalizer.ts';
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
      normalized = normalizeDatabasePlanDesiredState({
        desiredState: parsed.data,
        databaseStore: this.#databaseStore,
        databaseRecordIndex: this.#databaseRecordIndex,
        generateUuid: this.#generateUuid,
        now: this.#now,
      });
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
}

export function createDatabasePlanEngine(
  options: CreateDatabasePlanEngineOptions,
): DatabasePlanEngine {
  return new DatabasePlanEngine(options);
}
