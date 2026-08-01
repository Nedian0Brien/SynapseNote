/**
 * The HTTP handler capability boundary. Each signature is derived from the
 * request schema or the stable public result it serializes; handlers never
 * receive the data-plane's untyped implementation-shaped call surface.
 */
import type {
  DatabaseAccessPrincipal,
  DatabasePermissionAction,
  DatabaseProperty,
  DatabasePublicSharePolicy,
  DatabasePublicShareTarget,
  DatabaseRecordActor,
  DatabaseVerificationLifecycleInput,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseButtonPlan, DatabaseButtonPlanInput } from './database-button.ts';
import type {
  DatabaseButtonExecutionInput,
  DatabaseButtonRun,
} from './database-button-executor.ts';
import type {
  DatabaseCommitInput,
  DatabaseCommitResult,
  DatabaseUndoInput,
  DatabaseUndoResult,
} from './database-commit.ts';
import type {
  DatabaseContextInspection,
  DatabaseContextInspectionScope,
  DatabaseContextInspectionSummary,
} from './database-context-inspector.ts';
import type { DatabaseContextPack } from './database-context-pack.ts';
import type {
  DatabaseCatalogNotModifiedResult,
  DatabaseCatalogResult,
} from './database-data-plane-catalog.ts';
import type { DatabaseComputedPropertyPreviewResult } from './database-data-plane-computed-preview.ts';
import type {
  DatabaseDataPlanePackInput,
  DatabaseDataPlaneQueryInput,
  DatabaseDataPlaneQueryResult,
  DatabaseDataPlaneRetrievalResult,
  DatabaseFindResult,
  DatabasePropertyConversionPlanPreview,
} from './database-data-plane-contracts.ts';
import type {
  DatabaseFormSubmissionInput,
  DatabaseFormSubmissionResult,
} from './database-data-plane-form-policy.ts';
import type {
  DatabaseMarkdownTableExportInput,
  DatabaseMarkdownTableMutationRequest,
} from './database-data-plane-markdown-adapters.ts';
import type {
  DatabaseDescribeNotModifiedResult,
  DatabaseDescribeResult,
  DatabaseRecordLookupResult,
} from './database-data-plane-read-projection.ts';
import type {
  DatabaseDraftArtifact,
  DatabasePlanArtifact,
  DatabaseVerificationDraftResult,
} from './database-plan-artifacts.ts';
import type { DatabaseDesiredStateDraftInput } from './database-plan-draft-contracts.ts';
import type {
  DatabaseRecordIndexIssueCode,
  DatabaseRecordIndexStatus,
} from './database-record-index.ts';
import type {
  DatabaseRepairApplyInput,
  DatabaseRepairPlan,
  DatabaseRepairPreviewOptions,
  DatabaseRepairResult,
  DatabaseRepairUndoInput,
  DatabaseRepairUndoResult,
} from './database-repair.ts';

export interface DatabaseDataPlaneReadHandlerPort {
  catalogIfChanged(
    query?: string,
    ifCatalogRevision?: string,
  ): DatabaseCatalogResult | DatabaseCatalogNotModifiedResult;
  describeIfChanged(input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
    ifSchemaRevision?: string;
  }): DatabaseDescribeResult | DatabaseDescribeNotModifiedResult;
  describe(input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
    includeViews?: boolean;
  }): DatabaseDescribeResult;
  record(input: {
    databaseId: string;
    sourceId: string;
    recordId: string;
  }): DatabaseRecordLookupResult;
  exportMarkdownTable(
    input: DatabaseMarkdownTableExportInput,
  ): ReturnType<
    typeof import('@nedian0brien/synapsenote-core/server').createDatabaseMarkdownTableExport
  >;
  previewComputedProperty(input: {
    databaseId: string;
    sourceId: string;
    recordId: string;
    property: Extract<DatabaseProperty, { type: 'formula' | 'rollup' }>;
  }): DatabaseComputedPropertyPreviewResult;
  find(input: {
    databaseId: string;
    sourceId: string;
    text: string;
    limit?: number;
  }): DatabaseFindResult;
  retrieve(input: {
    databaseId: string;
    sourceId: string;
    text: string;
    mode: 'lexical' | 'semantic' | 'hybrid';
    propertyIds?: readonly string[];
    includeBody?: boolean;
    lexicalWeight?: number;
    semanticWeight?: number;
    requireSemantic?: boolean;
    limit?: number;
  }): Promise<DatabaseDataPlaneRetrievalResult>;
  query(input: DatabaseDataPlaneQueryInput): DatabaseDataPlaneQueryResult;
  pack(input: DatabaseDataPlanePackInput): DatabaseContextPack;
  listContextInspections(
    scope?: DatabaseContextInspectionScope,
  ): readonly DatabaseContextInspectionSummary[];
  getContextInspection(
    packId: string,
    scope?: DatabaseContextInspectionScope,
  ): DatabaseContextInspection;
  getRecordIndexStatus(): DatabaseRecordIndexStatus;
  getRecordIndexIssuesSummary(): {
    total: number;
    byCode: Partial<Record<DatabaseRecordIndexIssueCode, number>>;
    sample: ReadonlyArray<{
      code: DatabaseRecordIndexIssueCode;
      path: string;
      databaseId?: string;
      sourceId?: string;
      recordId?: string;
    }>;
  };
  getSchemaRevisions(): ReadonlyArray<{
    databaseId: string;
    key: string;
    name: string;
    schemaRevision: string;
  }>;
}

export interface DatabaseDataPlanePlanHandlerPort {
  createDraft(input: DatabaseDesiredStateDraftInput, ttlSeconds?: number): DatabaseDraftArtifact;
  createDatabaseDeletionDraft(
    databaseId: string,
    expectedSnapshotRevision: string,
    ttlSeconds?: number,
  ): DatabaseDraftArtifact;
  createVerificationDraft(
    input: DatabaseVerificationLifecycleInput,
    actor: DatabaseRecordActor,
    ttlSeconds?: number,
  ): DatabaseVerificationDraftResult;
  getDraft(draftId: string): DatabaseDraftArtifact;
  discardDraft(draftId: string): { discarded: boolean; draftId: string };
  createPlan(draftId: string, ttlSeconds?: number): DatabasePlanArtifact;
  getPlan(planId: string): DatabasePlanArtifact;
  restorePlanBundle(bundle: {
    plan: DatabasePlanArtifact;
    draft: DatabaseDraftArtifact;
  }): DatabasePlanArtifact;
  previewPropertyConversion(input: {
    databaseId: string;
    sourceId: string;
    propertyId: string;
    targetProperty: DatabaseProperty;
    allowLossy?: boolean;
    ttlSeconds?: number;
  }): DatabasePropertyConversionPlanPreview;
}

export interface DatabaseDataPlaneMutationHandlerPort {
  submitForm(input: DatabaseFormSubmissionInput): Promise<DatabaseFormSubmissionResult>;
  createButtonPlan(input: DatabaseButtonPlanInput): DatabaseButtonPlan;
  executeButton(
    input: DatabaseButtonExecutionInput,
  ): Promise<{ run: DatabaseButtonRun; undoToken: string | null }>;
  listButtonRuns(limit?: number): Promise<DatabaseButtonRun[]>;
  commit(input: DatabaseCommitInput): Promise<DatabaseCommitResult>;
  mutateMarkdownTable(
    input: DatabaseMarkdownTableMutationRequest,
  ): Promise<import('./database-markdown-table-writer.ts').DatabaseMarkdownTableMutationResult>;
  undo(input: DatabaseUndoInput): Promise<DatabaseUndoResult>;
  previewRepair(
    ttlSeconds?: number,
    options?: DatabaseRepairPreviewOptions,
  ): Promise<DatabaseRepairPlan>;
  applyRepair(input: DatabaseRepairApplyInput): Promise<DatabaseRepairResult>;
  undoRepair(input: DatabaseRepairUndoInput): Promise<DatabaseRepairUndoResult>;
}

export interface DatabaseDataPlaneAccessHandlerPort {
  currentRecordActor(): DatabaseRecordActor;
  authorizeOperation(input: {
    action: DatabasePermissionAction;
    databaseId?: string;
    sourceId?: string;
    recordIds?: readonly string[];
    propertyIds?: readonly string[];
  }): void;
  authorizePlanMutation(planId: string): void;
  validatePublicShareTarget(input: {
    target: DatabasePublicShareTarget;
    propertyIds: readonly string[];
    allowFormSubmission: boolean;
  }): void;
  withPublicShare<T>(policy: DatabasePublicSharePolicy, operation: () => T): T;
  withAccessPrincipal<T>(principal: DatabaseAccessPrincipal, operation: () => T): T;
}

/** Exact union of the operation-family ports required by HTTP route builders. */
export type DatabaseDataPlaneHandlerPort = DatabaseDataPlaneReadHandlerPort &
  DatabaseDataPlanePlanHandlerPort &
  DatabaseDataPlaneMutationHandlerPort &
  DatabaseDataPlaneAccessHandlerPort;
