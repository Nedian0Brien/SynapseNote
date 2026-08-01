/** Owns the public immutable artifacts and error contract emitted by database planning. */
import type {
  DatabaseDefinition,
  DatabaseDocumentId,
  DatabaseRecordActor,
  DatabaseRecordPageLayoutOverride,
  DatabaseVerificationValue,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import type { DatabaseDesiredStateDraft } from './database-plan-draft-contracts.ts';

export interface DatabaseTargetResolution {
  kind:
    | 'database'
    | 'person'
    | 'source'
    | 'property'
    | 'option'
    | 'view'
    | 'template'
    | 'action_button'
    | 'automation'
    | 'conditional_color_rule'
    | 'record';
  selector: string;
  targetId: string;
  via: 'explicit_id' | 'stable_key' | 'exact_name' | 'unique_property' | 'generated';
}

export interface DatabaseWriteGuardSnapshot {
  permissions: readonly {
    scopeId: string;
    policyId: string;
    policyRevision: string;
    capability?: 'write' | 'verification';
  }[];
  querySnapshots: readonly {
    queryId: string;
    snapshotRevision: string;
  }[];
}

export type ResolveDatabaseWriteGuards = (input: {
  definition: DatabaseDefinition;
  immutableTargetSet: readonly string[];
  operation: 'write' | 'verification';
}) => DatabaseWriteGuardSnapshot;

export type DatabaseNormalizedRecordMutationOperation =
  | { kind: 'set'; propertyId: string; value: unknown }
  | { kind: 'unset'; propertyId: string }
  | { kind: 'add' | 'remove'; propertyId: string; value: string }
  | { kind: 'increment'; propertyId: string; by: number }
  | { kind: 'append'; propertyId: string | null; value: string }
  | { kind: 'link' | 'unlink'; propertyId: string; recordId: string };

export interface DatabaseDraftArtifact {
  id: string;
  revision: string;
  createdAt: string;
  expiresAt: string;
  desiredState: DatabaseDesiredStateDraft;
  normalized: {
    definition: DatabaseDefinition;
    databaseDeletion?: true;
    uniquePropertyId: string | null;
    templates: DatabaseDesiredStateDraft['templates'];
    policy: DatabaseDesiredStateDraft['policy'];
    sampleRecords: readonly {
      id: string;
      sourceId: string;
      values: Readonly<Record<string, unknown>>;
      body: string;
      expectedRevision: string | null;
      documentId?: DatabaseDocumentId;
      archivedAt?: string | null;
      pageLayoutOverride?: DatabaseRecordPageLayoutOverride | null;
    }[];
    recordMutations: readonly {
      recordId: string;
      sourceId: string;
      operations: readonly DatabaseNormalizedRecordMutationOperation[];
    }[];
    recordCopies: readonly {
      sourceRecordId: string;
      expectedRevision: string;
      sourcePath: string;
      newRecordId: string;
    }[];
    recordArchives: readonly {
      recordId: string;
      action: 'archive' | 'restore';
      archivedAt: string | null;
    }[];
    recordMoves: readonly {
      recordId: string;
      expectedRevision: string;
      sourceId: string;
      targetSourceId: string;
      sourcePath: string;
      targetPath: string;
      values: Readonly<Record<string, unknown>>;
      body: string;
      archivedAt: string | null;
      pageLayoutOverride: null;
    }[];
    recordDeletions: readonly {
      recordId: string;
      sourceId: string;
      expectedRevision: string;
      path: string;
      values: Readonly<Record<string, unknown>>;
      body: string;
    }[];
    targetResolutions: readonly DatabaseTargetResolution[];
    verificationChange?: {
      sourceId: string;
      recordId: string;
      propertyId: string;
      action: 'verify' | 'renew' | 'unverify';
      actor: DatabaseRecordActor;
      value: DatabaseVerificationValue;
    };
  };
}

export interface DatabaseVerificationDraftResult {
  draft: DatabaseDraftArtifact;
  review: {
    action: 'verify' | 'renew' | 'unverify';
    databaseId: string;
    sourceId: string;
    recordId: string;
    propertyId: string;
    actor: DatabaseRecordActor;
    expectedRevision: string;
    verifiedAt: string | null;
    expiresAt: string | null;
    evidenceRevision: string | null;
    notePresent: boolean;
  };
}

/**
 * The planning capabilities consumed by data-plane collaborators. Keeping this
 * structural port beside the artifacts prevents those collaborators from
 * reaching back into the plan orchestration facade.
 */
export interface DatabasePlanEnginePort {
  createDraft(input: unknown, ttlSeconds?: number): DatabaseDraftArtifact;
  createDatabaseDeletionDraft(
    databaseId: string,
    expectedSnapshotRevision: string,
    ttlSeconds?: number,
  ): DatabaseDraftArtifact;
  createVerificationDraft(
    input: unknown,
    actor: DatabaseRecordActor,
    ttlSeconds?: number,
  ): DatabaseVerificationDraftResult;
  getDraft(draftId: string): DatabaseDraftArtifact;
  discardDraft(draftId: string): { discarded: boolean; draftId: string };
  createPlan(draftId: string, ttlSeconds?: number): DatabasePlanArtifact;
  getPlan(planId: string): DatabasePlanArtifact;
  restoreDraft(draft: DatabaseDraftArtifact): void;
  restorePlan(plan: DatabasePlanArtifact): void;
}

export type DatabaseConvergenceAction = 'create' | 'update' | 'noop';

export const DatabasePlanApprovalCodeSchema = z.enum([
  'create_database',
  'delete_database',
  'alter_schema',
  'autonomous_policy',
  'sample_record_write',
  'verification_change',
  'delete_record',
]);
export type DatabasePlanApprovalCode = z.infer<typeof DatabasePlanApprovalCodeSchema>;

export type DatabaseConflictDomain =
  | 'record_value'
  | 'schema'
  | 'option'
  | 'view'
  | 'formula'
  | 'relation'
  | 'automation';

export interface DatabasePlanConflict {
  code:
    | 'database_id_exists'
    | 'database_key_exists'
    | 'database_key_changed'
    | 'record_not_found'
    | 'record_scope_mismatch'
    | 'record_revision_required'
    | 'record_revision_changed'
    | 'record_identity_required'
    | 'record_path_occupied'
    | 'duplicate_record_target'
    | 'record_limit_exceeded'
    | 'relation_target_missing'
    | 'person_target_missing'
    | 'source_record_migration_required'
    | 'source_removal_blocked'
    | 'unsafe_owner_path'
    | 'owner_path_conflict'
    | 'owner_block_conflict'
    | 'planning_io_unavailable'
    | 'sample_required_value_missing'
    | 'sample_value_invalid'
    | 'sample_unique_value_duplicate';
  message: string;
  targetId: string;
  propertyId?: string;
  sampleRecordId?: string;
}

export interface DatabasePlanArtifact {
  id: string;
  hash: string;
  draftId: string;
  draftRevision: string;
  snapshotRevision: string;
  createdAt: string;
  expiresAt: string;
  immutableTargetSet: readonly string[];
  writeGuards: DatabaseWriteGuardSnapshot;
  targetResolutions: readonly DatabaseTargetResolution[];
  verificationReview?: DatabaseVerificationDraftResult['review'];
  normalizedOperations: readonly (
    | {
        kind: 'ensure_database';
        databaseId: string;
        manifestPath: string;
        action: DatabaseConvergenceAction | 'delete';
      }
    | {
        kind: 'delete_database';
        databaseId: string;
        manifestPath: string;
        recordIds: readonly string[];
      }
    | {
        kind: 'ensure_property';
        sourceId: string;
        propertyId: string;
        action: DatabaseConvergenceAction;
      }
    | {
        kind: 'ensure_relation';
        sourceId: string;
        propertyId: string;
        targetSourceId: string;
        pairedPropertyId?: string;
        action: DatabaseConvergenceAction;
      }
    | {
        kind: 'ensure_view';
        sourceId: string;
        viewId: string;
        action: DatabaseConvergenceAction;
      }
    | {
        kind: 'alter_schema';
        databaseId: string;
        action: 'update' | 'noop';
        addedIds: readonly string[];
        updatedIds: readonly string[];
        removedIds: readonly string[];
      }
    | {
        kind: 'upsert_records';
        sourceId: string;
        recordIds: readonly string[];
        created: number;
        updated: number;
        unchanged: number;
      }
    | {
        kind: 'mutate_record';
        sourceId: string;
        recordId: string;
        operations: readonly DatabaseNormalizedRecordMutationOperation[];
      }
    | {
        kind: 'delete_records';
        sourceId: string;
        recordIds: readonly string[];
      }
    | {
        kind: 'duplicate_records';
        sourceId: string;
        copies: readonly { sourceRecordId: string; newRecordId: string }[];
      }
    | {
        kind: 'archive_records';
        sourceId: string;
        records: readonly {
          recordId: string;
          action: 'archive' | 'restore';
          archivedAt: string | null;
        }[];
      }
    | {
        kind: 'move_records';
        moves: readonly {
          recordId: string;
          sourceId: string;
          targetSourceId: string;
          sourcePath: string;
          targetPath: string;
        }[];
      }
  )[];
  affectedObjects: {
    databaseIds: readonly string[];
    sourceIds: readonly string[];
    propertyIds: readonly string[];
    viewIds: readonly string[];
    recordIds: readonly string[];
    automationIds?: readonly string[];
  };
  /** Exact user-facing areas that a fresh plan must reconcile after a concurrent change. */
  conflictDomains?: readonly DatabaseConflictDomain[];
  diff: {
    mode: 'exact';
    manifests: readonly {
      path: string;
      before: string | null;
      after: string | null;
      action: 'create' | 'update' | 'delete';
    }[];
    records: readonly {
      recordId: string;
      sourceId: string;
      path: string;
      action: 'create' | 'update' | 'delete' | 'move';
      beforeSourceId?: string;
      targetPath?: string;
      before: {
        revision: string;
        values: Readonly<Record<string, unknown>>;
        body: string;
        archivedAt?: string | null;
        pageLayoutOverride?: DatabaseRecordPageLayoutOverride | null;
      } | null;
      after: {
        values: Readonly<Record<string, unknown>>;
        body: string;
        archivedAt?: string | null;
        pageLayoutOverride?: DatabaseRecordPageLayoutOverride | null;
      } | null;
    }[];
    templates: DatabaseDesiredStateDraft['templates'];
    policy: DatabaseDesiredStateDraft['policy'];
  };
  risk: {
    level: 'low' | 'medium' | 'high';
    reasons: readonly string[];
  };
  conflicts: readonly DatabasePlanConflict[];
  approvals: readonly {
    code: DatabasePlanApprovalCode;
    required: boolean;
    reason: string;
  }[];
  postconditions: readonly {
    code:
      | 'manifest_valid'
      | 'database_absent'
      | 'records_absent'
      | 'stable_ids_unique'
      | 'stable_targets_resolved'
      | 'required_values'
      | 'unique_key'
      | 'relation_integrity'
      | 'verification_attribution';
    description: string;
  }[];
  committable: boolean;
  requiresCommit: boolean;
}

export type DatabasePlanErrorCode =
  | 'draft_not_found'
  | 'draft_expired'
  | 'plan_not_found'
  | 'plan_expired'
  | 'write_guard_unavailable'
  | 'snapshot_changed'
  | 'invalid_desired_state';

export class DatabasePlanError extends Error {
  readonly code: DatabasePlanErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabasePlanErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'DatabasePlanError';
    this.code = code;
    this.details = details;
  }
}
