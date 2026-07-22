/**
 * Stable public v1 database contracts exported from `@nedian0brien/synapsenote`.
 *
 * Keep the version suffix even while v1 is the only version. Unversioned
 * internal implementation types may evolve; these aliases are the public SDK
 * compatibility boundary documented by RFC 0001.
 */

import type {
  DatabaseAgentViewConfig,
  DatabaseDateRangeValue,
  DatabaseDateReminder,
  DatabaseDateValue,
  DatabaseDefinition,
  DatabaseExternalFileValue,
  DatabaseFileValue,
  DatabaseLocalFileValue,
  DatabasePerson,
  DatabasePersonKind,
  DatabaseQuery,
  DatabaseQueryResult,
  DatabaseRecord,
  DatabaseSource,
  DatabaseTransactionFileDelta,
  DatabaseTransactionReceipt,
  DatabaseUndoReceipt,
  ProjectedDatabasePerson,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseCatalogEntry,
  DatabaseCatalogNotModifiedResult,
  DatabaseCatalogResult,
  DatabaseCommitInput,
  DatabaseCommitResult,
  DatabaseContextInspection,
  DatabaseContextInspectionSummary,
  DatabaseContextPack,
  DatabaseDataPlanePackInput,
  DatabaseDataPlaneQueryResult,
  DatabaseDescribeNotModifiedResult,
  DatabaseDescribeResult,
  DatabaseDesiredStateDraftInput,
  DatabaseDraftArtifact,
  DatabaseFindResult,
  DatabasePlanArtifact,
  DatabaseQueryDelta,
  DatabaseQueryDeltaReceipt,
  DatabaseRelationExpansion,
  DatabaseRelationExpansionInput,
  DatabaseRepairApplyInput,
  DatabaseRepairPlan,
  DatabaseRepairReceipt,
  DatabaseRepairResult,
  DatabaseTask,
  DatabaseTaskRequest,
  DatabaseTaskResponse,
  DatabaseUndoInput,
  DatabaseUndoResult,
} from '@nedian0brien/synapsenote-server';

export type DatabaseManifestV1 = DatabaseDefinition;
export type DatabaseFileValueV1 = DatabaseFileValue;
export type DatabaseLocalFileValueV1 = DatabaseLocalFileValue;
export type DatabaseExternalFileValueV1 = DatabaseExternalFileValue;
export type DatabasePersonV1 = DatabasePerson;
export type DatabasePersonKindV1 = DatabasePersonKind;
export type ProjectedDatabasePersonV1 = ProjectedDatabasePerson;
export type ProjectedDatabaseRelationRecordV1 = ProjectedDatabaseRelationRecord;
export type DatabaseDateRangeValueV1 = DatabaseDateRangeValue;
export type DatabaseDateReminderV1 = DatabaseDateReminder;
export type DatabaseDateValueV1 = DatabaseDateValue;
export type DatabaseAgentViewConfigV1 = DatabaseAgentViewConfig;
export type DatabaseQueryV1 = DatabaseQuery;
export type DatabaseQueryResultV1 = DatabaseQueryResult;
export type DatabaseRecordV1 = DatabaseRecord;
export type DatabaseSourceV1 = DatabaseSource;
export type DatabaseTransactionFileDeltaV1 = DatabaseTransactionFileDelta;
export type DatabaseTransactionReceiptV1 = DatabaseTransactionReceipt;
export type DatabaseUndoReceiptV1 = DatabaseUndoReceipt;

export type AgentDataCatalogEntryV1 = DatabaseCatalogEntry;
export type AgentDataCatalogNotModifiedResultV1 = DatabaseCatalogNotModifiedResult;
export type AgentDataCatalogResultV1 = DatabaseCatalogResult;
export type AgentDataCommitInputV1 = DatabaseCommitInput;
export type AgentDataCommitResultV1 = DatabaseCommitResult;
export type AgentDataContextPackV1 = DatabaseContextPack;
export type AgentDataContextPackInputV1 = DatabaseDataPlanePackInput;
export type AgentDataContextInspectionV1 = DatabaseContextInspection;
export type AgentDataContextInspectionSummaryV1 = DatabaseContextInspectionSummary;
export type AgentDataQueryResultV1 = DatabaseDataPlaneQueryResult;
export type AgentDataDescribeNotModifiedResultV1 = DatabaseDescribeNotModifiedResult;
export type AgentDataDescribeResultV1 = DatabaseDescribeResult;
export type AgentDataDesiredStateDraftInputV1 = DatabaseDesiredStateDraftInput;
export type AgentDataDraftArtifactV1 = DatabaseDraftArtifact;
export type AgentDataFindResultV1 = DatabaseFindResult;
export type AgentDataPlanArtifactV1 = DatabasePlanArtifact;
export type AgentDataQueryDeltaV1 = DatabaseQueryDelta;
export type AgentDataQueryDeltaReceiptV1 = DatabaseQueryDeltaReceipt;
export type AgentDataRelationExpansionV1 = DatabaseRelationExpansion;
export type AgentDataRelationExpansionInputV1 = DatabaseRelationExpansionInput;
export type AgentDataRepairApplyInputV1 = DatabaseRepairApplyInput;
export type AgentDataRepairPlanV1 = DatabaseRepairPlan;
export type AgentDataRepairReceiptV1 = DatabaseRepairReceipt;
export type AgentDataRepairResultV1 = DatabaseRepairResult;
export type AgentDataTaskV1 = DatabaseTask;
export type AgentDataTaskRequestV1 = DatabaseTaskRequest;
export type AgentDataTaskResponseV1 = DatabaseTaskResponse;
export type AgentDataUndoInputV1 = DatabaseUndoInput;
export type AgentDataUndoResultV1 = DatabaseUndoResult;
