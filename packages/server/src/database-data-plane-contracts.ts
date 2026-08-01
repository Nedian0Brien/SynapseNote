/**
 * Public query, retrieval, and HTTP-handler contracts for the database data
 * plane. Runtime orchestration stays in database-data-plane.ts; extracted
 * collaborators depend on this stable boundary instead of that facade.
 */
import type {
  DatabaseAccessPrincipal,
  DatabaseDefinition,
  DatabaseFilter,
  DatabaseFindPlan,
  DatabaseLinkedViewSettings,
  DatabasePermissionAction,
  DatabasePropertyConversionPreview,
  DatabaseQuery,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseContextPackEncoding,
  DatabaseContextPackInput,
  DatabaseContextPackTokenizer,
} from './database-context-pack.ts';
import type { DatabaseDraftArtifact, DatabasePlanArtifact } from './database-plan-artifacts.ts';
import type {
  DatabaseLexicalSearchResult,
  DatabaseRecordIndexStatus,
} from './database-record-index.ts';
import type {
  DatabaseSemanticIndexStatus,
  DatabaseSemanticSearchResult,
  fuseDatabaseRetrieval,
} from './database-semantic-index.ts';

export interface DatabaseFindResult {
  databaseId: string;
  sourceId: string;
  manifestRevision: string;
  indexRevision: string;
  plan: DatabaseFindPlan;
  retrieval: DatabaseDataPlaneLexicalSearchResult | null;
  result: DatabaseDataPlaneQueryResult | null;
}

export interface DatabaseDataPlaneLexicalSearchResult extends DatabaseLexicalSearchResult {
  permissionExclusions: DatabaseQueryPermissionExclusions;
  resultState: {
    empty: boolean;
    emptyReason: 'no_match' | 'permission_filtered' | null;
    permissionFiltered: boolean;
    truncated: boolean;
  };
}

export type DatabaseRetrievalMode = 'lexical' | 'semantic' | 'hybrid';

export interface DatabaseDataPlaneRetrievalResult {
  databaseId: string;
  sourceId: string;
  manifestRevision: string;
  indexRevision: string;
  query: string;
  requestedMode: DatabaseRetrievalMode;
  appliedMode: DatabaseRetrievalMode;
  degradedReason: 'semantic_not_ready' | 'semantic_projection_denied' | null;
  candidateLimit: number;
  lexical: DatabaseDataPlaneLexicalSearchResult | null;
  semantic: DatabaseSemanticSearchResult | null;
  ranking: ReturnType<typeof fuseDatabaseRetrieval>;
  semanticIndex: DatabaseSemanticIndexStatus;
  permissionExclusions: DatabaseQueryPermissionExclusions;
}

export interface DatabaseDataPlaneQueryResult extends DatabaseQueryResult {
  databaseId: string;
  queryId: string;
  manifestRevision: string;
  indexRevision: string;
  indexState: DatabaseRecordIndexStatus['state'];
  recordRevisions: Readonly<Record<string, string | null>>;
  permissionExclusions: DatabaseQueryPermissionExclusions;
  savedQuery: AppliedDatabaseSavedQuery | null;
  agentView: AppliedDatabaseAgentView | null;
  resultState: DatabaseQueryResultState;
  trace: DatabaseQueryExplainTrace;
  delta: DatabaseQueryDelta | null;
}

export interface AppliedDatabaseAgentView {
  id: string;
  key: string;
  name: string;
  revision: string;
  semanticContract: NonNullable<DatabaseView['agent']>['semanticContract'];
  scope: NonNullable<DatabaseView['agent']>['scope'];
  readPolicy: NonNullable<DatabaseView['agent']>['readPolicy'];
  writePolicy: NonNullable<DatabaseView['agent']>['writePolicy'];
}

export interface AppliedDatabaseSavedQuery {
  id: string;
  key: string;
  name: string;
  sourceId: string;
  layout: DatabaseView['layout']['type'];
  revision: string;
}

export interface DatabaseQueryResultState {
  empty: boolean;
  emptyReason:
    | 'no_match'
    | 'permission_filtered'
    | 'partial_index'
    | 'permission_filtered_and_partial_index'
    | null;
  permissionFiltered: boolean;
  partialIndex: boolean;
  truncated: boolean;
}

export interface DatabaseQueryExplainTrace {
  source: { databaseId: string; sourceId: string };
  savedQuery: AppliedDatabaseSavedQuery | null;
  agentView: AppliedDatabaseAgentView | null;
  filter: { expression: DatabaseFilter | null; propertyIds: readonly string[] };
  ranking: {
    strategy: 'typed_sort_then_record_id';
    sort: DatabaseQuery['sort'];
    semantics: typeof import('@nedian0brien/synapsenote-core').DATABASE_QUERY_SORT_SEMANTICS;
    tieBreakers: readonly ['record_id'];
  };
  projection: {
    requestedPropertyIds: readonly string[];
    returnedPropertyIds: readonly string[];
    excludedPropertyIds: readonly string[];
  };
  aggregation: {
    requested: DatabaseQuery['aggregate'] | null;
    appliedAfterPermissionScope: true;
    matched: number;
    totalGroups: number;
    returnedGroups: number;
    truncatedBy: 'group_limit' | null;
  };
  permission: DatabaseQueryPermissionExclusions;
  index: {
    revision: string;
    state: DatabaseRecordIndexStatus['state'];
    freshness: 'snapshot';
    issueCount: number;
  };
  derivedIndex: {
    propertyIds: readonly string[];
    cache: 'hit' | 'miss' | 'not_applicable';
    permissionRevision: string | null;
    revision: string | null;
  };
  truncation: {
    cause: DatabaseQueryResult['truncatedBy'];
    limit: number;
    cursorProvided: boolean;
    nextCursor: string | null;
  };
}

export interface DatabaseQueryAccessDecision {
  allowed?: boolean;
  policyId: string;
  policyRevision: string;
  allowedRecordIds: readonly string[] | null;
  allowedPropertyIds: readonly string[] | null;
  allowBody?: boolean;
}

export interface DatabaseQueryPermissionExclusions {
  evaluated: true;
  policyId: string;
  policyRevision: string;
  records: number;
  properties: number;
  body?: boolean;
}

export type ResolveDatabaseQueryAccess = (input: {
  action: DatabasePermissionAction;
  database: DatabaseDefinition;
  source: DatabaseSource;
  query: DatabaseQuery;
  view: DatabaseView | null;
  principal: DatabaseAccessPrincipal;
}) => DatabaseQueryAccessDecision;

export type ResolveDatabaseGlobalAccess = (input: {
  action: DatabasePermissionAction;
  principal: DatabaseAccessPrincipal;
}) => Pick<DatabaseQueryAccessDecision, 'allowed' | 'policyId' | 'policyRevision'>;

export interface DatabaseQueryDeltaReceipt {
  queryId: string;
  recordRevisions: Readonly<Record<string, string | null>>;
  isComplete: boolean;
}

export interface DatabaseQueryDelta {
  sinceQueryId: string;
  scope: 'returned_page';
  addedOrChangedRecordIds: readonly string[];
  unchangedRecordIds: readonly string[];
  removedRecordIds: readonly string[];
  absentFromPageRecordIds: readonly string[];
  isComplete: boolean;
}

export interface DatabaseDataPlaneQueryInput {
  databaseId: string;
  sourceId: string;
  viewId?: string;
  agentViewId?: string;
  viewOverrides?: DatabaseLinkedViewSettings;
  query?: unknown;
  deltaSince?: DatabaseQueryDeltaReceipt;
  throwIfCancelled?: () => void;
}

export interface DatabasePropertyConversionPlanPreview {
  databaseId: string;
  sourceId: string;
  propertyId: string;
  manifestRevision: string;
  indexRevision: string;
  preview: DatabasePropertyConversionPreview;
  draft: DatabaseDraftArtifact | null;
  plan: DatabasePlanArtifact | null;
}

export type DatabaseDataPlanePackInput = Omit<
  DatabaseContextPackInput,
  | 'maxTokens'
  | 'reserveTokens'
  | 'tokenizer'
  | 'encoding'
  | 'agentView'
  | 'recordLimit'
  | 'includeBodyEvidence'
  | 'sensitivityPolicy'
  | 'throwIfCancelled'
> & {
  agentViewId?: string;
  maxTokens?: number;
  reserveTokens?: number;
  tokenizer?: DatabaseContextPackTokenizer;
  encoding?: DatabaseContextPackEncoding;
  throwIfCancelled?: () => void;
};

// biome-ignore lint/suspicious/noExplicitAny: per-route schemas validate HTTP values at this port.
type DatabaseDataPlaneHandlerArguments = any[];
// biome-ignore lint/suspicious/noExplicitAny: route-specific result types remain owned by their handlers.
type DatabaseDataPlaneHandlerResult = any;

/**
 * HTTP handlers intentionally depend on this capability surface rather than
 * the data-plane implementation. The concrete class is structurally checked
 * when handlers are assembled by the compatibility facade.
 */
export interface DatabaseDataPlaneHandlerPort {
  applyRepair(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  authorizeOperation(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  authorizePlanMutation(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  catalogIfChanged(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  commit(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  createButtonPlan(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  createDatabaseDeletionDraft(
    ...args: DatabaseDataPlaneHandlerArguments
  ): DatabaseDataPlaneHandlerResult;
  createDraft(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  createPlan(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  createVerificationDraft(
    ...args: DatabaseDataPlaneHandlerArguments
  ): DatabaseDataPlaneHandlerResult;
  currentRecordActor(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  describe(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  describeIfChanged(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  discardDraft(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  executeButton(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  exportMarkdownTable(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  find(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  getContextInspection(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  getDraft(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  getPlan(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  getRecordIndexIssuesSummary(
    ...args: DatabaseDataPlaneHandlerArguments
  ): DatabaseDataPlaneHandlerResult;
  getRecordIndexStatus(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  getSchemaRevisions(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  listButtonRuns(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  listContextInspections(
    ...args: DatabaseDataPlaneHandlerArguments
  ): DatabaseDataPlaneHandlerResult;
  mutateMarkdownTable(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  pack(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  previewComputedProperty(
    ...args: DatabaseDataPlaneHandlerArguments
  ): DatabaseDataPlaneHandlerResult;
  previewPropertyConversion(
    ...args: DatabaseDataPlaneHandlerArguments
  ): DatabaseDataPlaneHandlerResult;
  previewRepair(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  query(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  record(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  restorePlanBundle(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  retrieve(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  submitForm(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  undo(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  undoRepair(...args: DatabaseDataPlaneHandlerArguments): DatabaseDataPlaneHandlerResult;
  validatePublicShareTarget(
    ...args: DatabaseDataPlaneHandlerArguments
  ): DatabaseDataPlaneHandlerResult;
  withAccessPrincipal<T>(principal: unknown, operation: () => T): T;
  withPublicShare<T>(policy: unknown, operation: () => T): T;
}
