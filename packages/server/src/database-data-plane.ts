import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { FrontmatterValue } from '@nedian0brien/synapsenote-core';
import {
  applyDatabaseLinkedViewSettings,
  compileDatabaseFind,
  compileFormulaSource,
  DATABASE_QUERY_SORT_SEMANTICS,
  type DatabaseAccessPrincipal,
  DatabaseAccessPrincipalSchema,
  type DatabaseConditionalColorResult,
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  DatabaseFilesValueSchema,
  type DatabaseFilter,
  type DatabaseFindPlan,
  type DatabaseFormValue,
  type DatabaseFormViewConfiguration,
  type DatabaseLinkedViewSettings,
  type DatabasePermissionAction,
  type DatabaseProperty,
  type DatabasePropertyConversionPreview,
  DatabasePropertySchema,
  type DatabasePublicSharePolicy,
  DatabasePublicSharePolicySchema,
  type DatabasePublicShareTarget,
  type DatabaseQuery,
  DatabaseQueryError,
  type DatabaseQueryResult,
  DatabaseQuerySchema,
  type DatabaseRecord,
  type DatabaseRecordActor,
  type DatabaseRecordIssue,
  type DatabaseSource,
  type DatabaseValue,
  DatabaseVerificationValueSchema,
  type DatabaseView,
  databasePublicShareIsActive,
  evaluateDatabaseFilter,
  type FormulaComputedResult,
  formulaErrorResult,
  isDatabaseValueValidForProperty,
  isRecordPathInSource,
  materializeDatabaseDerivedRecords,
  type ProjectedDatabaseRelationRecord,
  previewDatabasePropertyConversion,
  projectDatabaseVerification,
  queryDatabaseRecords,
  validateDatabasePropertyConstraints,
} from '@nedian0brien/synapsenote-core';
import type { EnqueueDatabaseAutomationEventInput } from './database-automation.ts';
import type {
  DatabaseButtonPlan,
  DatabaseButtonPlanInput,
  DatabaseButtonPlanner,
} from './database-button.ts';
import { databaseDesiredStateBase } from './database-button.ts';
import type {
  DatabaseButtonExecutionInput,
  DatabaseButtonExecutor,
  DatabaseButtonRun,
} from './database-button-executor.ts';
import {
  type DatabaseCommitEngine,
  DatabaseCommitError,
  type DatabaseCommitInput,
  type DatabaseCommitResult,
  type DatabaseUndoInput,
  type DatabaseUndoResult,
} from './database-commit.ts';
import {
  type DatabaseContextInspection,
  type DatabaseContextInspectionScope,
  type DatabaseContextInspectionSummary,
  DatabaseContextInspector,
} from './database-context-inspector.ts';
import {
  createDatabaseContextPack,
  type DatabaseContextPack,
  type DatabaseContextPackEncoding,
  DatabaseContextPackError,
  type DatabaseContextPackInput,
  type DatabaseContextPackTokenizer,
} from './database-context-pack.ts';
import {
  createDatabaseFormStateStore,
  type DatabaseFormStateStore,
  databaseFormPrivateKey,
} from './database-form-state-store.ts';
import {
  createDatabasePlanEngine,
  type DatabaseDesiredStateDraftInput,
  type DatabaseDraftArtifact,
  type DatabasePlanArtifact,
  type DatabasePlanEngine,
  type DatabaseVerificationDraftResult,
} from './database-plan.ts';
import {
  DATABASE_LEXICAL_MAX_HITS,
  DATABASE_LEXICAL_MAX_TERMS,
  DatabaseLexicalSearchLimitError,
  type DatabaseLexicalSearchResult,
  type DatabaseRecordIndex,
  type DatabaseRecordIndexIssueCode,
  type DatabaseRecordIndexStatus,
} from './database-record-index.ts';
import type {
  DatabaseRepairApplyInput,
  DatabaseRepairEngine,
  DatabaseRepairPlan,
  DatabaseRepairResult,
} from './database-repair.ts';
import {
  DatabaseSemanticIndex,
  type DatabaseSemanticIndexStatus,
  type DatabaseSemanticSearchResult,
  fuseDatabaseRetrieval,
} from './database-semantic-index.ts';
import type { DatabaseStore } from './database-store.ts';
import { recordDatabaseContextPackCapture } from './database-telemetry.ts';

export type DatabaseDataPlaneErrorCode =
  | 'database_not_found'
  | 'source_not_found'
  | 'property_not_found'
  | 'record_not_found'
  | 'invalid_computed_property'
  | 'invalid_property_conversion'
  | 'delta_query_mismatch'
  | 'stale_index'
  | 'index_unavailable'
  | 'semantic_index_unavailable'
  | 'resource_limit'
  | 'permission_denied'
  | 'view_not_found'
  | 'view_source_mismatch'
  | 'agent_view_not_found'
  | 'agent_view_source_mismatch'
  | 'agent_view_scope_violation'
  | 'agent_view_budget_exceeded'
  | 'context_inspection_not_found'
  | 'form_not_found'
  | 'form_access_denied'
  | 'form_closed'
  | 'form_invalid_submission'
  | 'form_rate_limited'
  | 'form_duplicate_submission'
  | 'button_plan_expired'
  | 'repair_unavailable'
  | 'transaction_in_progress';

export class DatabaseDataPlaneError extends Error {
  readonly code: DatabaseDataPlaneErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseDataPlaneErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'DatabaseDataPlaneError';
    this.code = code;
    this.details = details;
  }
}

export type DatabaseCatalogMatchField =
  | 'database_key'
  | 'database_name'
  | 'database_alias'
  | 'purpose'
  | 'vocabulary'
  | 'source_key'
  | 'source_name'
  | 'record_meaning'
  | 'relation_key'
  | 'relation_name'
  | 'relation_target';

export interface DatabaseCatalogSourceCard {
  id: string;
  key: string;
  name: string;
  recordMeaning: string;
  propertyCount: number;
}

export interface DatabaseCatalogEntry {
  id: string;
  key: string;
  name: string;
  schemaRevision: string;
  purpose: string;
  canonicality: DatabaseDefinition['contract']['canonicality'];
  vocabulary: readonly string[];
  freshness: DatabaseDefinition['contract']['freshness'];
  sensitivity: DatabaseDefinition['contract']['sensitivity'];
  sources: readonly DatabaseCatalogSourceCard[];
  viewCount: number;
  relationCount: number;
  score: number;
  matchedBy: readonly DatabaseCatalogMatchField[];
}

export interface DatabaseCatalogResult {
  query: string | null;
  manifestRevision: string;
  catalogRevision: string;
  complete: true;
  candidates: readonly DatabaseCatalogEntry[];
}

export interface DatabaseCatalogNotModifiedResult {
  notModified: true;
  query: string | null;
  manifestRevision: string;
  catalogRevision: string;
}

export interface DatabaseDescribeResult {
  manifestRevision: string;
  schemaRevision: string;
  database: DatabaseDefinition;
  source: DatabaseSource | null;
  index: DatabaseRecordIndexStatus;
  allowedOperations: readonly ['catalog', 'describe', 'find', 'query', 'pack'];
}

export interface DatabaseDescribeNotModifiedResult {
  notModified: true;
  manifestRevision: string;
  schemaRevision: string;
  databaseId: string;
  sourceId: string | null;
}

export interface DatabaseRecordLookupResult {
  databaseId: string;
  sourceId: string;
  manifestRevision: string;
  indexRevision: string;
  record: {
    id: string;
    path: string;
    revision: string | null;
    values: Record<string, DatabaseValue>;
    invalidValues?: Record<string, FrontmatterValue>;
    issues?: DatabaseRecordIssue[];
    archivedAt?: string;
  };
}

export interface DatabaseComputedPropertyPreviewResult {
  databaseId: string;
  sourceId: string;
  recordId: string;
  propertyId: string;
  manifestRevision: string;
  indexRevision: string;
  evaluatedAt: string;
  permissionRevision: string;
  result: FormulaComputedResult;
}

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
    semantics: typeof DATABASE_QUERY_SORT_SEMANTICS;
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
  };
  truncation: {
    cause: DatabaseQueryResult['truncatedBy'];
    limit: number;
    cursorProvided: boolean;
    nextCursor: string | null;
  };
}

export interface DatabaseQueryAccessDecision {
  /** False means the operation itself is denied, independently of projections. */
  allowed?: boolean;
  /** Stable human-inspectable policy identifier, not a secret or bearer token. */
  policyId: string;
  /** Changes whenever the effective decision changes. */
  policyRevision: string;
  /** null means all indexed records in the source are readable. */
  allowedRecordIds: readonly string[] | null;
  /** null means all source properties are readable. */
  allowedPropertyIds: readonly string[] | null;
  /** Omitted means allowed for backward-compatible trusted resolvers. */
  allowBody?: boolean;
}

export interface DatabasePublicShareTargetResolution {
  databaseId: string;
  sourceId: string;
  viewId: string | null;
  recordId: string | null;
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

export interface CreateDatabaseDataPlaneOptions {
  databaseStore: DatabaseStore;
  databaseRecordIndex: DatabaseRecordIndex;
  databasePlanEngine?: DatabasePlanEngine;
  databaseButtonPlanner?: DatabaseButtonPlanner;
  contextInspector?: DatabaseContextInspector;
  semanticIndex?: DatabaseSemanticIndex;
  /** Trusted server-side authorization seam; never populated from request JSON. */
  resolveQueryAccess?: ResolveDatabaseQueryAccess;
  /** Workspace-scoped authorization for operations that do not yet have a database/source. */
  resolveGlobalAccess?: ResolveDatabaseGlobalAccess;
  formStateStore?: DatabaseFormStateStore;
  publishAutomationEvent?: (input: EnqueueDatabaseAutomationEventInput) => Promise<unknown>;
  now?: () => Date;
  defaultAccessPrincipal?: DatabaseAccessPrincipal;
  /** Replace caller-supplied mutation attribution with the trusted transport principal. */
  bindMutationActorToAccessPrincipal?: boolean;
  /** Blocks reads while Git exposes only part of a multi-file canonical transition. */
  isCanonicalTransitionActive?: () => boolean;
}

export interface DatabaseFormSubmissionInput {
  databaseId: string;
  sourceId: string;
  viewId: string;
  submissionId: string;
  startedAt: string;
  answers: Readonly<Record<string, DatabaseFormValue>>;
  honeypot?: string;
  remoteAddress: string;
}

export interface DatabaseFormSubmissionResult {
  status: 'created';
  recordId: string;
  submittedAt: string;
  idempotentReplay: boolean;
  confirmation: DatabaseFormViewConfiguration['confirmation'];
}

export interface DatabaseFormUploadAuthorization {
  parentDocName: string;
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
  /** Internal cooperative cancellation seam; never part of the wire schema. */
  throwIfCancelled?: () => void;
};

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim();
}

function cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition {
  return structuredClone(definition);
}

function databaseSchemaRevision(definition: DatabaseDefinition): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(definition)).digest('hex')}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

type DatabaseSensitivity = DatabaseDefinition['contract']['sensitivity'];
const DATABASE_SENSITIVITY_RANK: Readonly<Record<DatabaseSensitivity, number>> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

function contextSensitivityPolicy(
  database: DatabaseDefinition,
  maxSensitivity: DatabaseSensitivity,
): NonNullable<DatabaseContextPackInput['sensitivityPolicy']> {
  const maxRank = DATABASE_SENSITIVITY_RANK[maxSensitivity];
  const redactedPropertyIdsBySource = Object.fromEntries(
    database.sources.map((source) => [
      source.id,
      source.properties
        .filter((property) => {
          const sensitivity =
            property.semantics.sensitivity === 'inherit'
              ? database.contract.sensitivity
              : property.semantics.sensitivity;
          return DATABASE_SENSITIVITY_RANK[sensitivity] > maxRank;
        })
        .map(({ id }) => id)
        .sort(),
    ]),
  );
  return {
    maxSensitivity,
    redactedPropertyIdsBySource,
    allowBody: DATABASE_SENSITIVITY_RANK[database.contract.sensitivity] <= maxRank,
  };
}

function isLoopbackAddress(value: string): boolean {
  const address = value.trim().toLowerCase();
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === 'localhost' ||
    address.startsWith('127.') ||
    address === '::ffff:127.0.0.1'
  );
}

function isEmptyFormValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function formValuesEqual(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function formQuestionVisible(
  question: DatabaseFormViewConfiguration['questions'][number],
  questions: readonly DatabaseFormViewConfiguration['questions'][number][],
  answers: Readonly<Record<string, DatabaseFormValue>>,
): boolean {
  if (!question.visibleWhen) return true;
  const byQuestionId = new Map(questions.map((candidate) => [candidate.id, candidate] as const));
  const outcomes = question.visibleWhen.conditions.map((condition) => {
    const dependency = byQuestionId.get(condition.questionId);
    const answer = dependency ? answers[dependency.propertyId] : undefined;
    switch (condition.operator) {
      case 'equals':
        return formValuesEqual(answer, condition.value);
      case 'not_equals':
        return !formValuesEqual(answer, condition.value);
      case 'is_empty':
        return isEmptyFormValue(answer);
      case 'is_not_empty':
        return !isEmptyFormValue(answer);
      default:
        return false;
    }
  });
  return question.visibleWhen.mode === 'all' ? outcomes.every(Boolean) : outcomes.some(Boolean);
}

function databaseDefinitionDraftBase(
  database: DatabaseDefinition,
): Pick<
  DatabaseDesiredStateDraftInput,
  | 'database'
  | 'sources'
  | 'sourceMappings'
  | 'views'
  | 'policy'
  | 'templates'
  | 'buttons'
  | 'automations'
> {
  const sourceKeyById = new Map(database.sources.map((source) => [source.id, source.key] as const));
  const executableState = databaseDesiredStateBase(database);
  return {
    database: {
      id: database.id,
      key: database.key,
      name: database.name,
      ...(database.description ? { description: database.description } : {}),
      ...(database.icon ? { icon: database.icon } : {}),
      ...(database.cover ? { cover: database.cover } : {}),
      aliases: [...database.aliases],
      people: structuredClone(database.people),
      contract: structuredClone(database.contract),
    },
    sources: database.sources.map((source) => structuredClone(source)),
    sourceMappings: (database.sourceMappings ?? []).map((mapping) => {
      const source = database.sources.find((candidate) => candidate.id === mapping.sourceId);
      const target = database.sources.find((candidate) => candidate.id === mapping.targetSourceId);
      if (!source || !target) throw new Error('Source mapping references an unknown source');
      return {
        sourceKey: source.key,
        targetSourceKey: target.key,
        propertyMappings: mapping.propertyMappings.map((propertyMapping) => {
          const sourceProperty = source.properties.find(
            (property) => property.id === propertyMapping.sourcePropertyId,
          );
          const targetProperty = target.properties.find(
            (property) => property.id === propertyMapping.targetPropertyId,
          );
          if (!sourceProperty || !targetProperty) {
            throw new Error('Source mapping references an unknown property');
          }
          return {
            sourcePropertyKey: sourceProperty.key,
            targetPropertyKey: targetProperty.key,
            optionMappings: propertyMapping.optionMappings.map((optionMapping) => {
              const sourceOption =
                'options' in sourceProperty
                  ? sourceProperty.options.find(
                      (option) => option.id === optionMapping.sourceOptionId,
                    )
                  : undefined;
              const targetOption =
                'options' in targetProperty
                  ? targetProperty.options.find(
                      (option) => option.id === optionMapping.targetOptionId,
                    )
                  : undefined;
              if (!sourceOption || !targetOption) {
                throw new Error('Source mapping references an unknown option');
              }
              return {
                sourceOptionKey: sourceOption.key,
                targetOptionKey: targetOption.key,
              };
            }),
          };
        }),
      };
    }),
    views: database.views.map((view) => {
      const { sourceId, ...canonicalView } = structuredClone(view);
      return {
        ...canonicalView,
        sourceKey: sourceKeyById.get(sourceId) ?? sourceId,
      };
    }),
    templates: executableState.templates,
    buttons: executableState.buttons,
    automations: executableState.automations,
    policy: { mode: 'review', allowedOperations: [], maxRecordsPerCommit: 1 },
  };
}

function databaseQueryId(
  databaseId: string,
  sourceId: string,
  query: unknown,
  permissionScope: unknown,
): string {
  const parsed = DatabaseQuerySchema.parse(query ?? {});
  return `qry_${createHash('sha256')
    .update(
      stableJson({
        databaseId,
        sourceId,
        query: parsed,
        permissionScope,
        sortSemanticsVersion: DATABASE_QUERY_SORT_SEMANTICS.version,
      }),
    )
    .digest('hex')
    .slice(0, 24)}`;
}

function combineFilters(
  saved: DatabaseFilter | undefined,
  requested: DatabaseFilter | undefined,
): DatabaseFilter | undefined {
  if (!saved) return requested;
  if (!requested) return saved;
  return { and: [saved, requested] };
}

function appliedAgentView(view: DatabaseView): AppliedDatabaseAgentView {
  if (view.layout.type !== 'agent' || !view.agent) {
    throw new Error(`View "${view.id}" is not a valid Agent View`);
  }
  return {
    id: view.id,
    key: view.key,
    name: view.name,
    revision: `sha256:${createHash('sha256').update(stableJson(view)).digest('hex')}`,
    semanticContract: structuredClone(view.agent.semanticContract),
    scope: structuredClone(view.agent.scope),
    readPolicy: structuredClone(view.agent.readPolicy),
    writePolicy: structuredClone(view.agent.writePolicy),
  };
}

function appliedSavedQuery(view: DatabaseView): AppliedDatabaseSavedQuery {
  return {
    id: view.id,
    key: view.key,
    name: view.name,
    sourceId: view.sourceId,
    layout: view.layout.type,
    revision: `sha256:${createHash('sha256').update(stableJson(view)).digest('hex')}`,
  };
}

function filterPropertyIds(filter: DatabaseFilter | undefined): string[] {
  if (!filter) return [];
  if ('and' in filter) return filter.and.flatMap(filterPropertyIds);
  if ('or' in filter) return filter.or.flatMap(filterPropertyIds);
  if ('not' in filter) return filterPropertyIds(filter.not);
  return [filter.propertyId];
}

function conditionalColorPropertyIds(view: DatabaseView | null): string[] {
  return (view?.conditionalColors ?? []).flatMap((rule) => [
    ...filterPropertyIds(rule.where),
    ...(rule.applyTo.type === 'property' ? [rule.applyTo.propertyId] : []),
  ]);
}

function layoutPropertyIds(view: DatabaseView | null): string[] {
  if (!view) return [];
  if (view.layout.type === 'board' && view.layout.configuration.cardPreview.type === 'files') {
    return [view.layout.configuration.cardPreview.propertyId];
  }
  if (view.layout.type === 'timeline') {
    const mapping = view.layout.configuration.dateMapping;
    return [
      ...(mapping.type === 'range'
        ? [mapping.propertyId]
        : [mapping.startPropertyId, mapping.endPropertyId]),
      ...(view.layout.configuration.dependencyPropertyId
        ? [view.layout.configuration.dependencyPropertyId]
        : []),
    ];
  }
  if (view.layout.type === 'calendar') {
    return [view.layout.configuration.datePropertyId];
  }
  if (
    view.layout.type === 'list' &&
    view.layout.configuration.hierarchy.type === 'parent_relation'
  ) {
    return [view.layout.configuration.hierarchy.propertyId];
  }
  if (view.layout.type === 'gallery' && view.layout.configuration.cardPreview.type === 'files') {
    return [view.layout.configuration.cardPreview.propertyId];
  }
  if (view.layout.type === 'chart') {
    return [
      ...(view.layout.configuration.dimension
        ? [view.layout.configuration.dimension.propertyId]
        : []),
      ...(view.layout.configuration.seriesPropertyId
        ? [view.layout.configuration.seriesPropertyId]
        : []),
      ...(view.layout.configuration.measure.type === 'property'
        ? [view.layout.configuration.measure.propertyId]
        : []),
    ];
  }
  if (view.layout.type === 'map') {
    return [view.layout.configuration.placePropertyId];
  }
  if (view.layout.type === 'feed') {
    return [
      view.layout.configuration.chronologyPropertyId,
      ...(view.layout.configuration.authorPropertyId
        ? [view.layout.configuration.authorPropertyId]
        : []),
    ];
  }
  return [];
}

function viewReferencedPropertyIds(view: DatabaseView): string[] {
  return [
    ...filterPropertyIds(view.where),
    ...view.sort.map(({ propertyId }) => propertyId),
    ...view.groups.map(({ propertyId }) => propertyId),
    ...view.projection.propertyIds,
    ...conditionalColorPropertyIds(view),
    ...layoutPropertyIds(view),
    ...(view.layout.type === 'form'
      ? view.layout.configuration.questions.flatMap((question) => [
          question.propertyId,
          ...(question.visibleWhen?.conditions.flatMap(({ questionId }) => {
            const dependency =
              view.layout.type === 'form'
                ? view.layout.configuration.questions.find(({ id }) => id === questionId)
                : undefined;
            return dependency ? [dependency.propertyId] : [];
          }) ?? []),
        ])
      : []),
  ];
}

function chartAggregate(view: DatabaseView) {
  if (view.layout.type !== 'chart') return undefined;
  const configuration = view.layout.configuration;
  return {
    groupBy: [
      ...(configuration.dimension
        ? [
            {
              propertyId: configuration.dimension.propertyId,
              direction: 'asc' as const,
              arrayMode: configuration.dimension.arrayMode,
              includeEmpty: true,
            },
          ]
        : []),
      ...(configuration.seriesPropertyId
        ? [
            {
              propertyId: configuration.seriesPropertyId,
              direction: 'asc' as const,
              arrayMode: 'each' as const,
              includeEmpty: true,
            },
          ]
        : []),
    ],
    calculations: [
      configuration.measure.type === 'count'
        ? { id: 'chart_measure', function: 'count_all' as const }
        : {
            id: 'chart_measure',
            function: configuration.measure.function,
            propertyId: configuration.measure.propertyId,
          },
    ],
    groupLimit: configuration.groupLimit,
    membershipLimit: 1_000,
  };
}

function evaluateConditionalColors(input: {
  view: DatabaseView | null;
  source: DatabaseSource;
  records: readonly DatabaseRecord[];
  returnedRecordIds: readonly string[];
}): DatabaseConditionalColorResult | undefined {
  const rules = input.view?.conditionalColors ?? [];
  if (rules.length === 0) return undefined;
  const recordsById = new Map(input.records.map((record) => [record.id, record] as const));
  const records: DatabaseConditionalColorResult['records'] = {};
  for (const recordId of input.returnedRecordIds) {
    const record = recordsById.get(recordId);
    if (!record) continue;
    let pageRuleId: string | undefined;
    const propertyRuleIds: Record<string, string> = {};
    for (const rule of rules) {
      if (evaluateDatabaseFilter(record, input.source, rule.where) !== 'match') continue;
      if (rule.applyTo.type === 'page') {
        pageRuleId ??= rule.id;
      } else {
        propertyRuleIds[rule.applyTo.propertyId] ??= rule.id;
      }
    }
    if (pageRuleId || Object.keys(propertyRuleIds).length > 0) {
      records[recordId] = {
        ...(pageRuleId ? { pageRuleId } : {}),
        ...(Object.keys(propertyRuleIds).length > 0 ? { propertyRuleIds } : {}),
      };
    }
  }
  return {
    rules: rules.map(({ id, key, name, color, applyTo }) => ({
      id,
      key,
      name,
      color,
      applyTo: structuredClone(applyTo),
    })),
    records,
  };
}

const UNRESTRICTED_POLICY_REVISION = `sha256:${createHash('sha256')
  .update('synapsenote:database-query-access:project-owner:v1')
  .digest('hex')}`;

function databaseCatalogRevision(
  manifestRevision: string,
  query: string | null,
  permissionFingerprint: unknown,
): string {
  return `sha256:${createHash('sha256')
    .update(stableJson({ manifestRevision, query, permissionFingerprint }))
    .digest('hex')}`;
}

export class DatabaseDataPlane {
  readonly #databaseStore: DatabaseStore;
  readonly #databaseRecordIndex: DatabaseRecordIndex;
  readonly #databasePlanEngine: DatabasePlanEngine;
  readonly #databaseButtonPlanner: DatabaseButtonPlanner | null;
  readonly #contextInspector: DatabaseContextInspector;
  #semanticIndex: DatabaseSemanticIndex;
  readonly #resolveQueryAccess: ResolveDatabaseQueryAccess;
  readonly #resolveGlobalAccess: ResolveDatabaseGlobalAccess;
  readonly #accessPrincipal = new AsyncLocalStorage<DatabaseAccessPrincipal>();
  readonly #publicShare = new AsyncLocalStorage<DatabasePublicSharePolicy>();
  readonly #trustedFormMutation = new AsyncLocalStorage<boolean>();
  #defaultAccessPrincipal: DatabaseAccessPrincipal;
  readonly #bindMutationActorToAccessPrincipal: boolean;
  readonly #isCanonicalTransitionActive: () => boolean;
  readonly #now: () => Date;
  readonly #formStateStore: DatabaseFormStateStore;
  #publishAutomationEvent:
    | ((input: EnqueueDatabaseAutomationEventInput) => Promise<unknown>)
    | null;
  readonly #derivedSnapshotCache = new Map<string, readonly DatabaseRecord[]>();
  readonly #buttonInvocationByPlanId = new Map<
    string,
    Pick<DatabaseButtonPlan, 'databaseId' | 'sourceId' | 'recordId' | 'propertyId' | 'buttonId'>
  >();
  readonly #buttonPlans = new Map<string, DatabaseButtonPlan>();
  #databaseButtonExecutor: DatabaseButtonExecutor | null = null;
  #databaseCommitEngine: DatabaseCommitEngine | null = null;
  #databaseRepairEngine: DatabaseRepairEngine | null = null;

  constructor(options: CreateDatabaseDataPlaneOptions) {
    this.#databaseStore = options.databaseStore;
    this.#databaseRecordIndex = options.databaseRecordIndex;
    this.#databasePlanEngine =
      options.databasePlanEngine ??
      createDatabasePlanEngine({ databaseStore: options.databaseStore });
    this.#databaseButtonPlanner = options.databaseButtonPlanner ?? null;
    this.#contextInspector = options.contextInspector ?? new DatabaseContextInspector();
    this.#semanticIndex = options.semanticIndex ?? new DatabaseSemanticIndex();
    this.#formStateStore = options.formStateStore ?? createDatabaseFormStateStore();
    this.#publishAutomationEvent = options.publishAutomationEvent ?? null;
    this.#isCanonicalTransitionActive = options.isCanonicalTransitionActive ?? (() => false);
    const resolveConfiguredQueryAccess =
      options.resolveQueryAccess ??
      (() => ({
        policyId: 'project-owner',
        policyRevision: UNRESTRICTED_POLICY_REVISION,
        allowedRecordIds: null,
        allowedPropertyIds: null,
        allowBody: true,
      }));
    this.#resolveQueryAccess = (input) => {
      const policy = this.#publicShare.getStore();
      return policy
        ? this.#resolvePublicShareAccess(policy, input)
        : resolveConfiguredQueryAccess(input);
    };
    this.#resolveGlobalAccess =
      options.resolveGlobalAccess ??
      (({ principal }) => ({
        allowed: principal.kind === 'user',
        policyId: 'project-owner-global',
        policyRevision: UNRESTRICTED_POLICY_REVISION,
      }));
    this.#defaultAccessPrincipal = DatabaseAccessPrincipalSchema.parse(
      options.defaultAccessPrincipal ?? { kind: 'user', id: 'user:local-owner' },
    );
    this.#bindMutationActorToAccessPrincipal = options.bindMutationActorToAccessPrincipal ?? false;
    this.#now = options.now ?? (() => new Date());
  }

  /** Bind trusted transport identity to every nested read in one request. */
  withAccessPrincipal<T>(principal: DatabaseAccessPrincipal, operation: () => T): T {
    return this.#accessPrincipal.run(DatabaseAccessPrincipalSchema.parse(principal), operation);
  }

  /**
   * Update the local fallback principal after the server has loaded its durable
   * project identity. HTTP requests always bind a principal explicitly, while
   * direct in-process consumers (startup jobs, previews, and tests) use this
   * fallback. Keeping both paths on the same owner identity prevents the
   * default policy resolver from treating an in-process read as an ungranted
   * guest after principal bootstrap.
   */
  setDefaultAccessPrincipal(principal: DatabaseAccessPrincipal): void {
    this.#defaultAccessPrincipal = DatabaseAccessPrincipalSchema.parse(principal);
  }

  /** Bind a server-resolved share. Request JSON must never call this with an unverified policy. */
  withPublicShare<T>(policy: DatabasePublicSharePolicy, operation: () => T): T {
    const parsed = DatabasePublicSharePolicySchema.parse(policy);
    if (!databasePublicShareIsActive(parsed, this.#now())) {
      throw new DatabaseDataPlaneError('permission_denied', 'Public share is unavailable');
    }
    return this.#publicShare.run(parsed, () =>
      this.withAccessPrincipal({ kind: 'user', id: `share:${parsed.id}` }, operation),
    );
  }

  /** Validate a proposed share against canonical IDs and the publisher's current authority. */
  validatePublicShareTarget(input: {
    target: DatabasePublicShareTarget;
    propertyIds: readonly string[];
    allowFormSubmission: boolean;
  }): DatabasePublicShareTargetResolution {
    const target = input.target;
    this.authorizeOperation({ action: 'publish', databaseId: target.databaseId });
    const database = this.#databaseStore
      .snapshot()
      .databases.find((candidate) => candidate.id === target.databaseId);
    if (!database) {
      throw new DatabaseDataPlaneError('database_not_found', 'Database was not found');
    }
    let source: DatabaseSource | undefined;
    let view: DatabaseView | undefined;
    let record: DatabaseRecord | undefined;
    if (target.kind === 'database') {
      source = database.sources.find((candidate) => candidate.id === target.sourceId);
    } else if (target.kind === 'record') {
      record = this.#databaseRecordIndex.getById(target.recordId) ?? undefined;
      if (record?.databaseId === database.id) {
        source = database.sources.find((candidate) => candidate.id === record?.sourceId);
      }
    } else {
      view = database.views.find((candidate) => candidate.id === target.viewId);
      source = view
        ? database.sources.find((candidate) => candidate.id === view?.sourceId)
        : undefined;
      if (
        view &&
        ((target.kind === 'form' && view.layout.type !== 'form') ||
          (target.kind === 'chart' && view.layout.type !== 'chart') ||
          (target.kind === 'view' && (view.layout.type === 'form' || view.layout.type === 'chart')))
      ) {
        throw new DatabaseDataPlaneError('view_not_found', 'Share target view type does not match');
      }
    }
    if (!source) {
      throw new DatabaseDataPlaneError(
        target.kind === 'record'
          ? 'record_not_found'
          : target.kind === 'database'
            ? 'source_not_found'
            : 'view_not_found',
        'Public share target was not found',
      );
    }
    const knownPropertyIds = new Set(source.properties.map(({ id }) => id));
    const unknownPropertyIds = input.propertyIds.filter((id) => !knownPropertyIds.has(id));
    if (unknownPropertyIds.length > 0) {
      throw new DatabaseDataPlaneError(
        'property_not_found',
        'Public share references an unknown property',
        { propertyIds: unknownPropertyIds },
      );
    }
    const titleProperty = source.properties.find(({ type }) => type === 'title');
    if (!titleProperty || !input.propertyIds.includes(titleProperty.id)) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'Public shares must include the source title property',
      );
    }
    if (view) {
      const hiddenViewPropertyIds = viewReferencedPropertyIds(view).filter(
        (propertyId) => !input.propertyIds.includes(propertyId),
      );
      if (hiddenViewPropertyIds.length > 0) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Public View shares must expose every property required by the View',
          { propertyIds: [...new Set(hiddenViewPropertyIds)].sort() },
        );
      }
    }
    if (input.allowFormSubmission) {
      if (target.kind !== 'form' || view?.layout.type !== 'form') {
        throw new DatabaseDataPlaneError(
          'form_access_denied',
          'Only a Form share may accept submissions',
        );
      }
      const submittedPropertyIds = view.layout.configuration.questions.map(
        ({ propertyId }) => propertyId,
      );
      const hiddenSubmissionPropertyIds = submittedPropertyIds.filter(
        (propertyId) => !input.propertyIds.includes(propertyId),
      );
      if (hiddenSubmissionPropertyIds.length > 0) {
        throw new DatabaseDataPlaneError(
          'form_access_denied',
          'Form shares must expose every submitted property',
          { propertyIds: hiddenSubmissionPropertyIds },
        );
      }
    }
    return {
      databaseId: database.id,
      sourceId: source.id,
      viewId: view?.id ?? null,
      recordId: record?.id ?? null,
    };
  }

  #currentAccessPrincipal(): DatabaseAccessPrincipal {
    return this.#accessPrincipal.getStore() ?? this.#defaultAccessPrincipal;
  }

  #trustedMutationActor(): DatabaseCommitInput['actor'] {
    const principal = this.#currentAccessPrincipal();
    return principal.kind === 'agent'
      ? {
          principalId: principal.id,
          kind: 'agent',
          sessionId: principal.sessionId,
        }
      : { principalId: principal.id, kind: 'human' };
  }

  #trustedRecordActor(): DatabaseRecordActor {
    const principal = this.#currentAccessPrincipal();
    return {
      kind: principal.kind === 'agent' ? 'agent' : 'human',
      principal_id: principal.id,
    };
  }

  currentRecordActor(): DatabaseRecordActor {
    return this.#trustedRecordActor();
  }

  authorizeOperation(input: {
    action: DatabasePermissionAction;
    databaseId?: string;
    sourceId?: string;
    recordIds?: readonly string[];
    propertyIds?: readonly string[];
  }): void {
    const principal = this.#currentAccessPrincipal();
    if (!input.databaseId) {
      const access = this.#resolveGlobalAccess({ action: input.action, principal });
      if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
        throw new Error('Database global access resolver returned an invalid policy identity');
      }
      if (access.allowed === false) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Operation exceeds the effective workspace access scope',
          {
            action: input.action,
            policyId: access.policyId,
            policyRevision: access.policyRevision,
          },
        );
      }
      return;
    }
    const database = this.#databaseStore
      .snapshot()
      .databases.find((candidate) => candidate.id === input.databaseId);
    if (!database) {
      if (input.action === 'create_database' || input.action === 'manage_permissions') {
        this.authorizeOperation({ action: input.action });
        return;
      }
      throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
        databaseId: input.databaseId,
      });
    }
    const recordSourceIds = new Set(
      (input.recordIds ?? []).flatMap((recordId) => {
        const record = this.#databaseRecordIndex.getById(recordId);
        return record?.databaseId === database.id ? [record.sourceId] : [];
      }),
    );
    const sources = input.sourceId
      ? database.sources.filter((source) => source.id === input.sourceId)
      : recordSourceIds.size > 0
        ? database.sources.filter((source) => recordSourceIds.has(source.id))
        : database.sources;
    if (sources.length === 0) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', {
        databaseId: input.databaseId,
        sourceId: input.sourceId,
      });
    }
    for (const source of sources) {
      const access = this.#resolveQueryAccess({
        action: input.action,
        database: cloneDefinition(database),
        source: structuredClone(source),
        query: DatabaseQuerySchema.parse({}),
        view: null,
        principal,
      });
      const deniedProperties = (input.propertyIds ?? []).filter(
        (propertyId) =>
          access.allowedPropertyIds !== null && !access.allowedPropertyIds.includes(propertyId),
      );
      const deniedRecords = (input.recordIds ?? []).filter(
        (recordId) =>
          access.allowedRecordIds !== null && !access.allowedRecordIds.includes(recordId),
      );
      if (access.allowed === false || deniedProperties.length > 0 || deniedRecords.length > 0) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Operation exceeds the effective database access scope',
          {
            action: input.action,
            databaseId: database.id,
            sourceId: source.id,
            policyId: access.policyId,
            policyRevision: access.policyRevision,
            deniedPropertyIds: deniedProperties,
            deniedRecordIds: deniedRecords,
          },
        );
      }
    }
  }

  authorizePlanMutation(planId: string): void {
    this.#assertPlanMutationAccess(this.#databasePlanEngine.getPlan(planId));
  }

  catalog(query?: string): DatabaseCatalogResult {
    this.#assertReadable();
    const snapshot = this.#databaseStore.snapshot();
    const needle = query === undefined || query.trim() === '' ? null : normalized(query);
    const permissionReceipts: unknown[] = [];
    const candidates = snapshot.databases
      .map((database) => {
        const visibleSources = database.sources.flatMap((source) => {
          const access = this.#resolveQueryAccess({
            action: 'catalog',
            database: cloneDefinition(database),
            source: structuredClone(source),
            query: DatabaseQuerySchema.parse({}),
            view: null,
            principal: this.#currentAccessPrincipal(),
          });
          permissionReceipts.push({
            databaseId: database.id,
            sourceId: source.id,
            allowed: access.allowed !== false,
            policyId: access.policyId,
            policyRevision: access.policyRevision,
            allowedPropertyIds:
              access.allowedPropertyIds === null ? null : [...access.allowedPropertyIds].sort(),
          });
          if (access.allowed === false) return [];
          const allowedPropertyIds =
            access.allowedPropertyIds === null ? null : new Set(access.allowedPropertyIds);
          return [
            {
              ...structuredClone(source),
              properties:
                allowedPropertyIds === null
                  ? structuredClone(source.properties)
                  : source.properties
                      .filter((property) => allowedPropertyIds.has(property.id))
                      .map((property) => structuredClone(property)),
            },
          ];
        });
        if (visibleSources.length === 0) return null;
        const visibleSourceIds = new Set(visibleSources.map((source) => source.id));
        return this.#catalogEntry(
          {
            ...cloneDefinition(database),
            sources: visibleSources,
            views: database.views
              .filter((view) => visibleSourceIds.has(view.sourceId))
              .map((view) => structuredClone(view)),
          },
          needle,
        );
      })
      .filter((entry): entry is DatabaseCatalogEntry => entry !== null)
      .filter((entry) => needle === null || entry.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.key.localeCompare(right.key) ||
          left.id.localeCompare(right.id),
      );
    return {
      query: needle,
      manifestRevision: snapshot.revision,
      catalogRevision: databaseCatalogRevision(snapshot.revision, needle, permissionReceipts),
      complete: true,
      candidates,
    };
  }

  /**
   * Cheap cache key for permission-scoped workspace-search projections.
   * Includes schema, record-index, and effective row/property policy state so
   * a cached record document can never outlive a permission change.
   */
  workspaceSearchRevision(): string {
    this.#assertReadable();
    const snapshot = this.#databaseStore.snapshot();
    const query = DatabaseQuerySchema.parse({});
    const policies = snapshot.databases.flatMap((database) =>
      database.sources.map((source) => {
        const access = this.#resolveQueryAccess({
          action: 'search',
          database: cloneDefinition(database),
          source: structuredClone(source),
          query: structuredClone(query),
          view: null,
          principal: this.#currentAccessPrincipal(),
        });
        return {
          databaseId: database.id,
          sourceId: source.id,
          policyId: access.policyId,
          policyRevision: access.policyRevision,
          allowedRecordIds:
            access.allowedRecordIds === null ? null : [...access.allowedRecordIds].sort(),
          allowedPropertyIds:
            access.allowedPropertyIds === null ? null : [...access.allowedPropertyIds].sort(),
        };
      }),
    );
    return `sha256:${createHash('sha256')
      .update(
        stableJson({
          manifestRevision: snapshot.revision,
          indexRevision: this.#databaseRecordIndex.status().revision,
          policies,
        }),
      )
      .digest('hex')}`;
  }

  /**
   * Canonical record paths regardless of caller visibility. Workspace search
   * uses this only as an exclusion set so the ordinary Markdown page tier
   * cannot duplicate (or bypass permissions for) database records.
   */
  workspaceSearchRecordPaths(): readonly string[] {
    const snapshot = this.#databaseStore.snapshot();
    return snapshot.databases
      .flatMap((database) =>
        database.sources.flatMap((source) =>
          this.#databaseRecordIndex.list(database.id, source.id).map((record) => record.path),
        ),
      )
      .sort();
  }

  catalogIfChanged(
    query?: string,
    ifCatalogRevision?: string,
  ): DatabaseCatalogResult | DatabaseCatalogNotModifiedResult {
    const catalog = this.catalog(query);
    if (ifCatalogRevision !== catalog.catalogRevision) return catalog;
    return {
      notModified: true,
      query: catalog.query,
      manifestRevision: catalog.manifestRevision,
      catalogRevision: catalog.catalogRevision,
    };
  }

  #describeCanonical(input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
  }): DatabaseDescribeResult {
    this.#assertReadable();
    const snapshot = this.#databaseStore.snapshot();
    const database = snapshot.databases.find(
      (candidate) =>
        (input.databaseId !== undefined && candidate.id === input.databaseId) ||
        (input.databaseKey !== undefined && candidate.key === input.databaseKey),
    );
    if (!database) {
      throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
        databaseId: input.databaseId,
        databaseKey: input.databaseKey,
        candidates: snapshot.databases.map((candidate) => ({
          id: candidate.id,
          key: candidate.key,
          name: candidate.name,
        })),
      });
    }
    const source =
      input.sourceId === undefined
        ? null
        : (database.sources.find((candidate) => candidate.id === input.sourceId) ?? null);
    if (input.sourceId !== undefined && !source) {
      throw new DatabaseDataPlaneError(
        'source_not_found',
        `Data source "${input.sourceId}" was not found`,
        {
          databaseId: database.id,
          sourceId: input.sourceId,
          candidates: database.sources.map((candidate) => ({
            id: candidate.id,
            key: candidate.key,
            name: candidate.name,
          })),
        },
      );
    }
    return {
      manifestRevision: snapshot.revision,
      schemaRevision: databaseSchemaRevision(database),
      database: cloneDefinition(database),
      source: source ? structuredClone(source) : null,
      index: this.#databaseRecordIndex.status(),
      allowedOperations: ['catalog', 'describe', 'find', 'query', 'pack'],
    };
  }

  describe(input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
    includeViews?: boolean;
  }): DatabaseDescribeResult {
    this.#assertReadable();
    const snapshot = this.#databaseStore.snapshot();
    const database = snapshot.databases.find(
      (candidate) =>
        (input.databaseId !== undefined && candidate.id === input.databaseId) ||
        (input.databaseKey !== undefined && candidate.key === input.databaseKey),
    );
    if (!database) {
      throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
        databaseId: input.databaseId,
        databaseKey: input.databaseKey,
        candidates: this.catalog().candidates.map(({ id, key, name }) => ({
          id,
          key,
          name,
        })),
      });
    }
    const query = DatabaseQuerySchema.parse({});
    const receipts: Array<{
      sourceId: string;
      policyId: string;
      policyRevision: string;
      allowedPropertyIds: readonly string[] | null;
    }> = [];
    const projectedSources = database.sources.flatMap((source) => {
      const access = this.#resolveQueryAccess({
        action: 'describe',
        database: cloneDefinition(database),
        source: structuredClone(source),
        query: structuredClone(query),
        view: null,
        principal: this.#currentAccessPrincipal(),
      });
      if (access.allowed === false) return [];
      const allowedPropertyIds =
        access.allowedPropertyIds === null ? null : new Set(access.allowedPropertyIds);
      const properties = source.properties.filter(
        (property) => allowedPropertyIds === null || allowedPropertyIds.has(property.id),
      );
      if (!properties.some((property) => property.type === 'title')) return [];
      receipts.push({
        sourceId: source.id,
        policyId: access.policyId,
        policyRevision: access.policyRevision,
        allowedPropertyIds:
          access.allowedPropertyIds === null ? null : [...access.allowedPropertyIds].sort(),
      });
      return [
        {
          ...structuredClone(source),
          properties: properties.map((property) => structuredClone(property)),
          defaultViewId: undefined,
          pageLayout: undefined,
        },
      ];
    });
    const requestedSourceExists =
      input.sourceId === undefined ||
      database.sources.some((candidate) => candidate.id === input.sourceId);
    const requestedSourceVisible =
      input.sourceId === undefined ||
      projectedSources.some((source) => source.id === input.sourceId);
    if (!requestedSourceExists || !requestedSourceVisible) {
      throw new DatabaseDataPlaneError(
        requestedSourceExists ? 'permission_denied' : 'source_not_found',
        requestedSourceExists
          ? 'Database description is outside the effective access scope'
          : 'Data source was not found',
        {
          databaseId: database.id,
          ...(input.sourceId ? { sourceId: input.sourceId } : {}),
          candidates:
            this.catalog()
              .candidates.find((candidate) => candidate.id === database.id)
              ?.sources.map(({ id, key, name }) => ({ id, key, name })) ?? [],
        },
      );
    }
    if (projectedSources.length === 0) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'Database description is outside the effective access scope',
        {
          databaseId: database.id,
          ...(input.sourceId ? { sourceId: input.sourceId } : {}),
          candidates: [],
        },
      );
    }
    const scopedSchemaRevision = (projection: DatabaseDefinition): string =>
      `sha256:${createHash('sha256')
        .update(
          stableJson({
            canonicalSchemaRevision: databaseSchemaRevision(database),
            receipts,
            projection,
          }),
        )
        .digest('hex')}`;
    if (
      projectedSources.length === database.sources.length &&
      receipts.every(({ allowedPropertyIds }) => allowedPropertyIds === null)
    ) {
      const canonical = this.#describeCanonical(input);
      return {
        ...canonical,
        schemaRevision: scopedSchemaRevision(canonical.database),
      };
    }
    const projectedSourceIds = new Set(projectedSources.map((source) => source.id));
    const projected = DatabaseDefinitionSchema.safeParse({
      ...cloneDefinition(database),
      people: [],
      sources: projectedSources.map((source) => ({
        ...source,
        properties: source.properties.filter(
          (property) =>
            property.type !== 'relation' || projectedSourceIds.has(property.targetSourceId),
        ),
      })),
      sourceMappings: undefined,
      views: (() => {
        const policy = this.#publicShare.getStore();
        if (
          policy &&
          (policy.target.kind === 'view' ||
            policy.target.kind === 'form' ||
            policy.target.kind === 'chart')
        ) {
          const viewId = policy.target.viewId;
          return database.views
            .filter((view) => view.id === viewId && projectedSourceIds.has(view.sourceId))
            .map((view) => structuredClone(view));
        }
        if (input.includeViews !== true) return [];
        const visiblePropertyIdsBySource = new Map(
          projectedSources.map((source) => [
            source.id,
            new Set(source.properties.map((property) => property.id)),
          ]),
        );
        return database.views
          .filter((view) => projectedSourceIds.has(view.sourceId))
          .filter((view) => {
            const visiblePropertyIds = visiblePropertyIdsBySource.get(view.sourceId);
            const source = database.sources.find((candidate) => candidate.id === view.sourceId);
            if (!visiblePropertyIds || !source) return false;
            const access = this.#resolveQueryAccess({
              action: 'describe',
              database: cloneDefinition(database),
              source: structuredClone(source),
              query: structuredClone(query),
              view: structuredClone(view),
              principal: this.#currentAccessPrincipal(),
            });
            if (access.allowed === false) return false;
            const allowedPropertyIds =
              access.allowedPropertyIds === null
                ? visiblePropertyIds
                : new Set(access.allowedPropertyIds);
            return view.projection.propertyIds.every((propertyId) =>
              allowedPropertyIds.has(propertyId),
            );
          })
          .map((view) => structuredClone(view));
      })(),
      templates: [],
      buttons: [],
      automations: [],
    });
    if (!projected.success) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'The effective property scope cannot be represented as a self-contained schema',
        {
          databaseId: database.id,
          ...(input.sourceId ? { sourceId: input.sourceId } : {}),
          policyIds: receipts.map(({ policyId }) => policyId),
        },
      );
    }
    const source =
      input.sourceId === undefined
        ? null
        : (projected.data.sources.find((candidate) => candidate.id === input.sourceId) ?? null);
    return {
      manifestRevision: snapshot.revision,
      schemaRevision: scopedSchemaRevision(projected.data),
      database: projected.data,
      source,
      index: this.#databaseRecordIndex.status(),
      allowedOperations: ['catalog', 'describe', 'find', 'query', 'pack'],
    };
  }

  describeIfChanged(input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
    ifSchemaRevision?: string;
  }): DatabaseDescribeResult | DatabaseDescribeNotModifiedResult {
    const described = this.describe(input);
    if (input.ifSchemaRevision !== described.schemaRevision) return described;
    return {
      notModified: true,
      manifestRevision: described.manifestRevision,
      schemaRevision: described.schemaRevision,
      databaseId: described.database.id,
      sourceId: described.source?.id ?? null,
    };
  }

  find(input: {
    databaseId: string;
    sourceId: string;
    text: string;
    limit?: number;
  }): DatabaseFindResult {
    const described = this.describe({
      databaseId: input.databaseId,
      sourceId: input.sourceId,
    });
    if (!described.source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', input);
    }
    const plan = compileDatabaseFind(
      described.source,
      {
        text: input.text,
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      },
      described.database.people,
    );
    // Free-text compilation lists every searchable text property as an
    // implicit convenience filter. Route that intent through the
    // permission-scoped lexical index instead of treating hidden inferred
    // properties as explicit filter dependencies.
    const result =
      plan.query && !plan.interpretation.freeText
        ? this.query({
            databaseId: input.databaseId,
            sourceId: input.sourceId,
            query: plan.query,
          })
        : null;
    const freeText = plan.interpretation.freeText;
    const titleProperty = described.source.properties.find((property) => property.type === 'title');
    const retrieval =
      freeText && titleProperty && !plan.interpretation.requiresResolution
        ? this.#searchTextWithAccess(
            {
              databaseId: input.databaseId,
              sourceId: input.sourceId,
              text: freeText.text,
              propertyIds: freeText.searchedPropertyIds,
              titlePropertyId: titleProperty.id,
              includeBody: true,
              limit: plan.interpretation.limit,
            },
            plan.query ?? {},
          )
        : null;
    return {
      databaseId: input.databaseId,
      sourceId: input.sourceId,
      manifestRevision: described.manifestRevision,
      indexRevision: described.index.revision,
      plan,
      retrieval,
      result,
    };
  }

  semanticIndexStatus(input: {
    databaseId: string;
    sourceId: string;
  }): DatabaseSemanticIndexStatus {
    const described = this.#describeCanonical(input);
    if (!described.source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', input);
    }
    const status = this.#semanticIndex.status(
      {
        databaseId: described.database.id,
        sourceId: described.source.id,
        schemaRevision: described.schemaRevision,
        indexRevision: described.index.revision,
      },
      described.source,
    );
    const access = this.#resolveQueryAccess({
      action: 'search',
      database: cloneDefinition(described.database),
      source: structuredClone(described.source),
      query: DatabaseQuerySchema.parse({ select: status.propertyIds }),
      view: null,
      principal: this.#currentAccessPrincipal(),
    });
    if (access.allowed === false) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'Semantic index status is outside the effective read scope',
        { policyId: access.policyId, policyRevision: access.policyRevision },
      );
    }
    const records = this.#databaseRecordIndex.list(described.database.id, described.source.id);
    return this.#projectSemanticIndexStatus(status, described.source, records, access);
  }

  async rebuildSemanticIndex(input: {
    databaseId: string;
    sourceId: string;
  }): Promise<DatabaseSemanticIndexStatus> {
    const described = this.#describeCanonical(input);
    if (!described.source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', input);
    }
    if (
      described.index.state !== 'idle' ||
      described.index.manifestRevision !== described.manifestRevision
    ) {
      throw new DatabaseDataPlaneError(
        'stale_index',
        'Canonical record index must be current before semantic indexing',
        {
          indexState: described.index.state,
          indexManifestRevision: described.index.manifestRevision,
          manifestRevision: described.manifestRevision,
        },
      );
    }
    const current = this.#semanticIndex.status(
      {
        databaseId: described.database.id,
        sourceId: described.source.id,
        schemaRevision: described.schemaRevision,
        indexRevision: described.index.revision,
      },
      described.source,
    );
    const access = this.#resolveQueryAccess({
      action: 'search',
      database: cloneDefinition(described.database),
      source: structuredClone(described.source),
      query: DatabaseQuerySchema.parse({ select: current.propertyIds }),
      view: null,
      principal: this.#currentAccessPrincipal(),
    });
    const allPropertyIds = new Set(described.source.properties.map(({ id }) => id));
    const fullPropertyAccess =
      access.allowedPropertyIds === null ||
      (access.allowedPropertyIds.length === allPropertyIds.size &&
        access.allowedPropertyIds.every((propertyId) => allPropertyIds.has(propertyId)));
    if (
      access.allowed === false ||
      access.allowedRecordIds !== null ||
      !fullPropertyAccess ||
      (current.includeBody && access.allowBody === false)
    ) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'A shared semantic index can only be rebuilt from an unrestricted read scope',
        { policyId: access.policyId, policyRevision: access.policyRevision },
      );
    }
    return this.#semanticIndex.rebuild({
      identity: {
        databaseId: described.database.id,
        sourceId: described.source.id,
        schemaRevision: described.schemaRevision,
        indexRevision: described.index.revision,
      },
      source: described.source,
      records: this.#databaseRecordIndex.list(described.database.id, described.source.id),
    });
  }

  async retrieve(input: {
    databaseId: string;
    sourceId: string;
    text: string;
    mode: DatabaseRetrievalMode;
    propertyIds?: readonly string[];
    includeBody?: boolean;
    lexicalWeight?: number;
    semanticWeight?: number;
    requireSemantic?: boolean;
    limit?: number;
  }): Promise<DatabaseDataPlaneRetrievalResult> {
    const described = this.#describeCanonical(input);
    const source = described.source;
    if (!source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', input);
    }
    if (
      described.index.state !== 'idle' ||
      described.index.manifestRevision !== described.manifestRevision
    ) {
      throw new DatabaseDataPlaneError('stale_index', 'Database record index is not current', {
        indexState: described.index.state,
        indexManifestRevision: described.index.manifestRevision,
        manifestRevision: described.manifestRevision,
      });
    }
    const titleProperty = source.properties.find((property) => property.type === 'title');
    if (!titleProperty) throw new Error('Database source is missing its required title property');
    const searchablePropertyIds =
      input.propertyIds ??
      source.properties
        .filter((property) => ['title', 'text', 'url', 'email', 'phone'].includes(property.type))
        .map(({ id }) => id);
    const accessQuery = DatabaseQuerySchema.parse({
      select: searchablePropertyIds,
    });
    const access = this.#resolveQueryAccess({
      action: 'search',
      database: cloneDefinition(described.database),
      source: structuredClone(source),
      query: structuredClone(accessQuery),
      view: null,
      principal: this.#currentAccessPrincipal(),
    });
    if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
      throw new Error('Database query access resolver returned an invalid policy identity');
    }
    const records = this.#databaseRecordIndex.list(described.database.id, source.id);
    const allRecordIds = new Set(records.map(({ id }) => id));
    const allPropertyIds = new Set(source.properties.map(({ id }) => id));
    const allowedRecordIds =
      access.allowedRecordIds === null
        ? allRecordIds
        : new Set(access.allowedRecordIds.filter((recordId) => allRecordIds.has(recordId)));
    const allowedPropertyIds =
      access.allowedPropertyIds === null
        ? allPropertyIds
        : new Set(access.allowedPropertyIds.filter((propertyId) => allPropertyIds.has(propertyId)));
    const unavailablePropertyIds = searchablePropertyIds.filter(
      (propertyId) => !allPropertyIds.has(propertyId) || !allowedPropertyIds.has(propertyId),
    );
    if (unavailablePropertyIds.length > 0) {
      if (access.allowedPropertyIds !== null || access.allowed === false) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Retrieval properties are outside the effective read scope',
          {
            policyId: access.policyId,
            policyRevision: access.policyRevision,
            deniedPropertyIds: unavailablePropertyIds,
            allowedPropertyIds: [...allowedPropertyIds].sort(),
          },
        );
      }
      throw new DatabaseQueryError('unknown_property', 'Retrieval property is not in the source', {
        unknownPropertyIds: unavailablePropertyIds,
        candidates: source.properties
          .filter((property) => allowedPropertyIds.has(property.id))
          .map(({ id, key, name }) => ({ id, key, name })),
      });
    }
    const permittedSearchPropertyIds = searchablePropertyIds.filter((propertyId) =>
      allowedPropertyIds.has(propertyId),
    );
    const permissionExclusions: DatabaseQueryPermissionExclusions = {
      evaluated: true,
      policyId: access.policyId,
      policyRevision: access.policyRevision,
      records: records.length - allowedRecordIds.size,
      properties: source.properties.length - allowedPropertyIds.size,
      body: access.allowBody === false,
    };
    const identity = {
      databaseId: described.database.id,
      sourceId: source.id,
      schemaRevision: described.schemaRevision,
      indexRevision: described.index.revision,
    };
    let semanticIndex = this.#semanticIndex.status(identity, source);
    let deniedSemanticProperties = semanticIndex.propertyIds.filter(
      (propertyId) => !allowedPropertyIds.has(propertyId),
    );
    let deniedSemanticBody = semanticIndex.includeBody && access.allowBody === false;
    if (
      input.mode !== 'lexical' &&
      semanticIndex.state === 'stale' &&
      deniedSemanticProperties.length === 0 &&
      !deniedSemanticBody
    ) {
      if (access.allowedRecordIds === null && access.allowedPropertyIds === null) {
        semanticIndex = await this.rebuildSemanticIndex(input);
      }
      deniedSemanticProperties = semanticIndex.propertyIds.filter(
        (propertyId) => !allowedPropertyIds.has(propertyId),
      );
      deniedSemanticBody = semanticIndex.includeBody && access.allowBody === false;
    }
    const semanticReady =
      semanticIndex.state === 'ready' &&
      deniedSemanticProperties.length === 0 &&
      !deniedSemanticBody;
    if (
      (input.mode === 'semantic' || input.requireSemantic === true) &&
      (deniedSemanticProperties.length > 0 || deniedSemanticBody)
    ) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'Semantic projection contains properties outside the effective read scope',
        {
          policyId: access.policyId,
          policyRevision: access.policyRevision,
          deniedPropertyIds: deniedSemanticProperties,
          bodyDenied: deniedSemanticBody,
          allowedPropertyIds: [...allowedPropertyIds].sort(),
        },
      );
    }
    if ((input.mode === 'semantic' || input.requireSemantic === true) && !semanticReady) {
      throw new DatabaseDataPlaneError(
        'semantic_index_unavailable',
        `Semantic index is ${semanticIndex.state}`,
        { semanticIndex },
      );
    }
    const limit = Math.min(100, Math.max(1, input.limit ?? 25));
    const candidateLimit = Math.min(500, Math.max(100, limit * 10));
    const lexical =
      input.mode === 'semantic'
        ? null
        : this.#searchTextWithAccess(
            {
              databaseId: described.database.id,
              sourceId: source.id,
              text: input.text,
              propertyIds: permittedSearchPropertyIds,
              titlePropertyId: titleProperty.id,
              includeBody: input.includeBody !== false && access.allowBody !== false,
              limit: candidateLimit,
            },
            accessQuery,
          );
    const semantic =
      input.mode !== 'lexical' && semanticReady
        ? await this.#semanticIndex.search({
            identity,
            query: input.text,
            allowedRecordIds: [...allowedRecordIds],
            limit: candidateLimit,
          })
        : null;
    const degradedReason =
      input.mode !== 'hybrid' || semantic
        ? null
        : deniedSemanticProperties.length > 0
          ? 'semantic_projection_denied'
          : 'semantic_not_ready';
    const appliedMode: DatabaseRetrievalMode =
      input.mode === 'hybrid' && !semantic ? 'lexical' : input.mode;
    const fused = fuseDatabaseRetrieval({
      lexicalHits: lexical?.hits ?? [],
      semanticHits: semantic?.hits ?? [],
      lexicalWeight: appliedMode === 'semantic' ? 0 : (input.lexicalWeight ?? 1),
      semanticWeight: appliedMode === 'lexical' ? 0 : (input.semanticWeight ?? 1),
      limit,
    });
    return {
      databaseId: described.database.id,
      sourceId: source.id,
      manifestRevision: described.manifestRevision,
      indexRevision: described.index.revision,
      query: input.text,
      requestedMode: input.mode,
      appliedMode,
      degradedReason,
      candidateLimit,
      lexical,
      semantic,
      ranking: {
        ...fused,
        isComplete:
          fused.isComplete && (lexical?.isComplete ?? true) && (semantic?.isComplete ?? true),
      },
      semanticIndex: this.#projectSemanticIndexStatus(semanticIndex, source, records, access),
      permissionExclusions,
    };
  }

  /**
   * Resolve one canonical record by its stable ID without scanning query
   * pages. The same row/property authorization seam used by query and context
   * packs is applied before any values leave the server.
   */
  record(input: {
    databaseId: string;
    sourceId: string;
    recordId: string;
  }): DatabaseRecordLookupResult {
    const described = this.#describeCanonical({
      databaseId: input.databaseId,
      sourceId: input.sourceId,
    });
    const index = described.index;
    if (index.state === 'error') {
      throw new DatabaseDataPlaneError(
        'index_unavailable',
        'Database record index is unavailable',
        {
          indexState: index.state,
          lastError: index.lastError,
        },
      );
    }
    if (index.state === 'rebuilding' || index.manifestRevision !== described.manifestRevision) {
      throw new DatabaseDataPlaneError('stale_index', 'Database record index is not current', {
        indexState: index.state,
        indexRevision: index.revision,
        indexManifestRevision: index.manifestRevision,
        manifestRevision: described.manifestRevision,
      });
    }

    const access = this.#getContextRecord(input.recordId);
    if (access.deniedRecord) {
      throw new DatabaseDataPlaneError('permission_denied', 'Record access is denied', {
        databaseId: input.databaseId,
        sourceId: input.sourceId,
        recordId: input.recordId,
      });
    }
    const record = access.record;
    if (!record || record.databaseId !== input.databaseId || record.sourceId !== input.sourceId) {
      throw new DatabaseDataPlaneError('record_not_found', 'Database record was not found', {
        databaseId: input.databaseId,
        sourceId: input.sourceId,
        recordId: input.recordId,
      });
    }
    return {
      databaseId: input.databaseId,
      sourceId: input.sourceId,
      manifestRevision: described.manifestRevision,
      indexRevision: index.revision,
      record: {
        id: record.id,
        path: record.path,
        revision: record.revision,
        values: structuredClone(record.values),
        ...(record.invalidValues ? { invalidValues: structuredClone(record.invalidValues) } : {}),
        ...(record.issues ? { issues: structuredClone(record.issues) } : {}),
        ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
      },
    };
  }

  /**
   * Evaluate an unsaved Formula or Rollup definition against one frozen,
   * permission-filtered record snapshot. This is intentionally read-only: the
   * candidate schema never enters the store or canonical Markdown.
   */
  previewComputedProperty(input: {
    databaseId: string;
    sourceId: string;
    recordId: string;
    property: Extract<DatabaseProperty, { type: 'formula' | 'rollup' }>;
  }): DatabaseComputedPropertyPreviewResult {
    const described = this.#describeCanonical({
      databaseId: input.databaseId,
      sourceId: input.sourceId,
    });
    const source = described.source;
    if (!source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', input);
    }
    const index = described.index;
    if (index.state === 'error') {
      throw new DatabaseDataPlaneError(
        'index_unavailable',
        'Database record index is unavailable',
        { indexState: index.state, lastError: index.lastError },
      );
    }
    if (index.state === 'rebuilding' || index.manifestRevision !== described.manifestRevision) {
      throw new DatabaseDataPlaneError('stale_index', 'Database record index is not current', {
        indexState: index.state,
        indexRevision: index.revision,
        indexManifestRevision: index.manifestRevision,
        manifestRevision: described.manifestRevision,
      });
    }

    const existing = source.properties.find((property) => property.id === input.property.id);
    if (!existing || (existing.type !== 'formula' && existing.type !== 'rollup')) {
      throw new DatabaseDataPlaneError(
        'property_not_found',
        'Computed property was not found in this data source',
        { sourceId: source.id, propertyId: input.property.id },
      );
    }
    const parsedProperty = DatabasePropertySchema.safeParse(input.property);
    if (
      !parsedProperty.success ||
      (parsedProperty.data.type !== 'formula' && parsedProperty.data.type !== 'rollup')
    ) {
      throw new DatabaseDataPlaneError(
        'invalid_computed_property',
        parsedProperty.success
          ? 'Computed preview requires a Formula or Rollup property'
          : (parsedProperty.error.issues[0]?.message ?? 'Computed property is invalid'),
        {
          propertyId: input.property.id,
          ...(parsedProperty.success ? {} : { issues: parsedProperty.error.issues }),
        },
      );
    }
    const candidate: DatabaseDefinition = {
      ...described.database,
      sources: described.database.sources.map((candidateSource) =>
        candidateSource.id === source.id
          ? {
              ...candidateSource,
              properties: candidateSource.properties.map((property) =>
                property.id === input.property.id ? parsedProperty.data : property,
              ),
            }
          : candidateSource,
      ),
    };
    if (parsedProperty.data.type === 'formula') {
      try {
        const compiled = compileFormulaSource(parsedProperty.data.source, {
          definition: candidate,
          sourceId: source.id,
          resultType: parsedProperty.data.ast.resultType,
        });
        if (stableJson(compiled) !== stableJson(parsedProperty.data.ast)) {
          throw new Error('Formula source and canonical AST do not match');
        }
      } catch (error) {
        throw new DatabaseDataPlaneError(
          'invalid_computed_property',
          error instanceof Error ? error.message : 'Formula source is invalid',
          { propertyId: input.property.id },
        );
      }
    }

    const allRecords = candidate.sources.flatMap((candidateSource) =>
      this.#databaseRecordIndex.list(candidate.id, candidateSource.id),
    );
    const record = allRecords.find(
      (candidateRecord) =>
        candidateRecord.id === input.recordId && candidateRecord.sourceId === source.id,
    );
    if (!record) {
      throw new DatabaseDataPlaneError('record_not_found', 'Database record was not found', {
        databaseId: input.databaseId,
        sourceId: input.sourceId,
        recordId: input.recordId,
      });
    }

    const scopes = new Map<
      string,
      {
        policyId: string;
        policyRevision: string;
        allowedRecordIds: ReadonlySet<string>;
        allowedPropertyIds: ReadonlySet<string>;
      }
    >();
    for (const candidateSource of candidate.sources) {
      const sourceRecordIds = new Set(
        allRecords
          .filter((candidateRecord) => candidateRecord.sourceId === candidateSource.id)
          .map((candidateRecord) => candidateRecord.id),
      );
      const sourcePropertyIds = new Set(candidateSource.properties.map((property) => property.id));
      const query = DatabaseQuerySchema.parse({
        select: [...sourcePropertyIds],
        page: { limit: 1 },
      });
      const access = this.#resolveQueryAccess({
        action: 'describe',
        database: cloneDefinition(candidate),
        source: structuredClone(candidateSource),
        query,
        view: null,
        principal: this.#currentAccessPrincipal(),
      });
      if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
        throw new Error('Database query access resolver returned an invalid policy identity');
      }
      scopes.set(candidateSource.id, {
        policyId: access.policyId,
        policyRevision: access.policyRevision,
        allowedRecordIds:
          access.allowedRecordIds === null
            ? sourceRecordIds
            : new Set(access.allowedRecordIds.filter((recordId) => sourceRecordIds.has(recordId))),
        allowedPropertyIds:
          access.allowedPropertyIds === null
            ? sourcePropertyIds
            : new Set(
                access.allowedPropertyIds.filter((propertyId) => sourcePropertyIds.has(propertyId)),
              ),
      });
    }
    const ownerScope = scopes.get(source.id);
    if (
      !ownerScope?.allowedRecordIds.has(record.id) ||
      !ownerScope.allowedPropertyIds.has(input.property.id)
    ) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'Computed property preview access is denied',
        {
          databaseId: input.databaseId,
          sourceId: input.sourceId,
          recordId: input.recordId,
        },
      );
    }

    const permissionRevision = `sha256:${createHash('sha256')
      .update(
        stableJson(
          [...scopes]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([sourceId, scope]) => ({
              sourceId,
              policyId: scope.policyId,
              policyRevision: scope.policyRevision,
              allowedRecordIds: [...scope.allowedRecordIds].sort(),
              allowedPropertyIds: [...scope.allowedPropertyIds].sort(),
            })),
        ),
      )
      .digest('hex')}`;
    const evaluatedAt =
      index.lastIncrementalAt ?? index.lastRebuiltAt ?? '1970-01-01T00:00:00.000Z';
    const materialized = materializeDatabaseDerivedRecords({
      definition: candidate,
      records: allRecords,
      context: { now: evaluatedAt, timeZone: 'UTC', locale: 'en' },
      permissionRevision,
      canReadRecord: (candidateRecord) =>
        scopes.get(candidateRecord.sourceId)?.allowedRecordIds.has(candidateRecord.id) ?? false,
      canReadProperty: (sourceId, propertyId) =>
        scopes.get(sourceId)?.allowedPropertyIds.has(propertyId) ?? false,
    });
    const result = materialized.find((candidateRecord) => candidateRecord.id === record.id)
      ?.computedResults?.[input.property.id];
    return {
      databaseId: input.databaseId,
      sourceId: input.sourceId,
      recordId: input.recordId,
      propertyId: input.property.id,
      manifestRevision: described.manifestRevision,
      indexRevision: index.revision,
      evaluatedAt,
      permissionRevision,
      result:
        result ??
        formulaErrorResult({
          code: 'missing_projection',
          message: 'Computed preview result is unavailable',
          propertyId: input.property.id,
        }),
    };
  }

  query(input: {
    databaseId: string;
    sourceId: string;
    viewId?: string;
    agentViewId?: string;
    viewOverrides?: DatabaseLinkedViewSettings;
    query?: unknown;
    deltaSince?: DatabaseQueryDeltaReceipt;
    /** Internal cooperative cancellation seam; never part of the wire schema. */
    throwIfCancelled?: () => void;
  }): DatabaseDataPlaneQueryResult {
    this.#assertReadable();
    const storeSnapshot = this.#databaseStore.snapshot();
    const database = storeSnapshot.databases.find((candidate) => candidate.id === input.databaseId);
    if (!database) {
      throw new DatabaseDataPlaneError(
        'database_not_found',
        `Database "${input.databaseId}" was not found`,
        { databaseId: input.databaseId },
      );
    }
    const source = database.sources.find((candidate) => candidate.id === input.sourceId);
    if (!source) {
      throw new DatabaseDataPlaneError(
        'source_not_found',
        `Data source "${input.sourceId}" was not found`,
        { databaseId: input.databaseId, sourceId: input.sourceId },
      );
    }

    const index = this.#databaseRecordIndex.status();
    if (index.state === 'error') {
      throw new DatabaseDataPlaneError(
        'index_unavailable',
        'Database record index is unavailable',
        {
          indexState: index.state,
          lastError: index.lastError,
        },
      );
    }
    if (index.state === 'rebuilding' || index.manifestRevision !== storeSnapshot.revision) {
      throw new DatabaseDataPlaneError('stale_index', 'Database record index is not current', {
        indexState: index.state,
        indexRevision: index.revision,
        indexManifestRevision: index.manifestRevision,
        manifestRevision: storeSnapshot.revision,
      });
    }

    const requestedQuery = DatabaseQuerySchema.parse(input.query ?? {});
    if (
      input.viewId !== undefined &&
      input.agentViewId !== undefined &&
      input.viewId !== input.agentViewId
    ) {
      throw new DatabaseQueryError(
        'invalid_query',
        'viewId and agentViewId must address the same saved view when both are provided',
        { viewId: input.viewId, agentViewId: input.agentViewId },
      );
    }
    const requestedViewId = input.viewId ?? input.agentViewId;
    const visibleViews = this.#visibleViews(
      database,
      source,
      requestedQuery.aggregate ? 'aggregate' : 'query',
    );
    const canonicalView =
      requestedViewId === undefined
        ? null
        : (visibleViews.find((candidate) => candidate.id === requestedViewId) ?? null);
    if (requestedViewId !== undefined && !canonicalView) {
      if (input.agentViewId !== undefined) {
        throw new DatabaseDataPlaneError('agent_view_not_found', 'Agent View was not found', {
          agentViewId: input.agentViewId,
          candidates: visibleViews
            .filter((candidate) => candidate.layout.type === 'agent' && candidate.agent)
            .map((candidate) => ({
              id: candidate.id,
              key: candidate.key,
              name: candidate.name,
            })),
        });
      }
      throw new DatabaseDataPlaneError('view_not_found', 'Saved query view was not found', {
        viewId: requestedViewId,
        candidates: visibleViews.map((candidate) => ({
          id: candidate.id,
          key: candidate.key,
          name: candidate.name,
          layout: candidate.layout.type,
        })),
      });
    }
    if (
      input.agentViewId !== undefined &&
      canonicalView &&
      (canonicalView.layout.type !== 'agent' || !canonicalView.agent)
    ) {
      throw new DatabaseDataPlaneError('agent_view_not_found', 'Agent View was not found', {
        agentViewId: input.agentViewId,
        candidates: visibleViews
          .filter((candidate) => candidate.layout.type === 'agent' && candidate.agent)
          .map((candidate) => ({
            id: candidate.id,
            key: candidate.key,
            name: candidate.name,
          })),
      });
    }
    if (canonicalView && canonicalView.sourceId !== source.id) {
      throw new DatabaseDataPlaneError(
        input.agentViewId === undefined ? 'view_source_mismatch' : 'agent_view_source_mismatch',
        'Saved query view belongs to a different data source',
        {
          viewId: canonicalView.id,
          viewSourceId: canonicalView.sourceId,
          sourceId: source.id,
        },
      );
    }
    const view = canonicalView
      ? applyDatabaseLinkedViewSettings(canonicalView, input.viewOverrides)
      : null;
    const savedQuery = view ? appliedSavedQuery(view) : null;
    const agentView = view?.layout.type === 'agent' && view.agent ? appliedAgentView(view) : null;
    const colorPropertyIds = conditionalColorPropertyIds(view);
    const visualPropertyIds = layoutPropertyIds(view);
    if (agentView && view) {
      const projected = new Set(view.projection.propertyIds);
      const requestedDependencies = [
        ...filterPropertyIds(requestedQuery.where),
        ...requestedQuery.sort.map((sort) => sort.propertyId),
        ...(requestedQuery.select ?? []),
        ...(requestedQuery.aggregate?.groupBy.map((group) => group.propertyId) ?? []),
        ...(requestedQuery.aggregate?.calculations.flatMap((calculation) =>
          calculation.propertyId ? [calculation.propertyId] : [],
        ) ?? []),
        ...colorPropertyIds,
      ];
      const outsideScope = [...new Set(requestedDependencies)].filter(
        (propertyId) => !projected.has(propertyId),
      );
      if (outsideScope.length > 0) {
        throw new DatabaseDataPlaneError(
          'agent_view_scope_violation',
          'Query references properties outside the Agent View projection',
          {
            agentViewId: view.id,
            deniedPropertyIds: outsideScope,
            allowedPropertyIds: [...projected],
          },
        );
      }
    }
    const parsedQuery = DatabaseQuerySchema.parse(
      view
        ? {
            where: combineFilters(view.where, requestedQuery.where),
            sort: requestedQuery.sort.length > 0 ? requestedQuery.sort : view.sort,
            select: requestedQuery.select ?? [
              ...new Set([...view.projection.propertyIds, ...visualPropertyIds]),
            ],
            aggregate:
              requestedQuery.aggregate ??
              (view.layout.type === 'chart'
                ? chartAggregate(view)
                : view.groups.length > 0
                  ? {
                      groupBy: view.groups.map((group) => ({
                        propertyId: group.propertyId,
                        direction: group.direction,
                        arrayMode:
                          view.layout.type === 'board' ? ('each' as const) : ('set' as const),
                        includeEmpty: !group.hideEmpty,
                      })),
                      calculations: [],
                      groupLimit:
                        view.layout.type === 'board' ? view.layout.configuration.groupLimit : 100,
                    }
                  : undefined),
            page: {
              ...requestedQuery.page,
              limit: Math.min(
                requestedQuery.page.limit,
                view.layout.type === 'timeline' ||
                  view.layout.type === 'list' ||
                  view.layout.type === 'gallery' ||
                  view.layout.type === 'chart' ||
                  view.layout.type === 'map' ||
                  view.layout.type === 'feed'
                  ? view.layout.configuration.loadLimit
                  : 500,
                view.agent?.scope.maxRecords ?? 500,
              ),
            },
          }
        : requestedQuery,
    );
    const access = this.#resolveQueryAccess({
      action: parsedQuery.aggregate ? 'aggregate' : 'query',
      database: cloneDefinition(database),
      source: structuredClone(source),
      query: structuredClone(parsedQuery),
      view: view ? structuredClone(view) : null,
      principal: this.#currentAccessPrincipal(),
    });
    if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
      throw new Error('Database query access resolver returned an invalid policy identity');
    }
    // Typed queries, derived properties, colors, and relation projections use
    // frontmatter only. Canonical bodies stay in the index and are disclosed
    // separately only by evidence/full-body retrieval paths.
    const allDatabaseRecords = this.#databaseRecordIndex.list(database.id, undefined, {
      includeBody: false,
    });
    const allRecords = allDatabaseRecords.filter((record) => record.sourceId === source.id);
    const allRecordIds = new Set(allRecords.map((record) => record.id));
    const allPropertyIds = new Set(source.properties.map((property) => property.id));
    const requestedPropertyIds = [
      ...filterPropertyIds(parsedQuery.where),
      ...parsedQuery.sort.map((sort) => sort.propertyId),
      ...(parsedQuery.select ?? []),
      ...(parsedQuery.aggregate?.groupBy.map((group) => group.propertyId) ?? []),
      ...(parsedQuery.aggregate?.calculations.flatMap((calculation) =>
        calculation.propertyId ? [calculation.propertyId] : [],
      ) ?? []),
      ...colorPropertyIds,
      ...visualPropertyIds,
    ];
    const accessPropertyIds =
      access.allowedPropertyIds === null
        ? allPropertyIds
        : new Set(access.allowedPropertyIds.filter((propertyId) => allPropertyIds.has(propertyId)));
    const unknownPropertyId = requestedPropertyIds.find(
      (propertyId) => !allPropertyIds.has(propertyId),
    );
    if (unknownPropertyId && access.allowedPropertyIds !== null) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'The query references a property outside the effective read scope',
        {
          policyId: access.policyId,
          policyRevision: access.policyRevision,
          deniedPropertyIds: [unknownPropertyId],
          allowedPropertyIds: [...accessPropertyIds].sort(),
        },
      );
    }
    if (unknownPropertyId) {
      throw new DatabaseQueryError(
        'unknown_property',
        `Property "${unknownPropertyId}" is not defined by source "${source.id}"`,
        {
          propertyId: unknownPropertyId,
          candidates: source.properties
            .filter((property) => accessPropertyIds.has(property.id))
            .map((property) => ({
              id: property.id,
              key: property.key,
              name: property.name,
            })),
        },
      );
    }
    if (parsedQuery.select && new Set(parsedQuery.select).size !== parsedQuery.select.length) {
      throw new DatabaseQueryError(
        'duplicate_property',
        'Query select contains the same property more than once',
        { propertyIds: parsedQuery.select },
      );
    }
    const allowedRecordIds =
      access.allowedRecordIds === null
        ? allRecordIds
        : new Set(access.allowedRecordIds.filter((recordId) => allRecordIds.has(recordId)));
    const allowedPropertyIds = accessPropertyIds;
    const dependencyPropertyIds = [
      ...filterPropertyIds(parsedQuery.where),
      ...parsedQuery.sort.map((sort) => sort.propertyId),
      ...(parsedQuery.aggregate?.groupBy.map((group) => group.propertyId) ?? []),
      ...(parsedQuery.aggregate?.calculations.flatMap((calculation) =>
        calculation.propertyId ? [calculation.propertyId] : [],
      ) ?? []),
      ...colorPropertyIds,
      ...visualPropertyIds,
    ];
    const deniedDependencies = [...new Set(dependencyPropertyIds)].filter(
      (propertyId) => !allowedPropertyIds.has(propertyId),
    );
    if (deniedDependencies.length > 0) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'The query filters, sorts, groups, or calculates a property outside the effective read scope',
        {
          policyId: access.policyId,
          policyRevision: access.policyRevision,
          deniedPropertyIds: deniedDependencies,
          allowedPropertyIds: [...allowedPropertyIds].sort(),
        },
      );
    }
    const selectedPropertyIds = (parsedQuery.select ?? [...allPropertyIds]).filter((propertyId) =>
      allowedPropertyIds.has(propertyId),
    );
    const scopedQuery: DatabaseQuery = {
      ...parsedQuery,
      select: selectedPropertyIds,
    };
    const relationPermissionScopes = new Map<string, unknown>();
    const relationAccess = new Map<
      string,
      {
        titlePropertyId: string;
        allowedRecordIds: ReadonlySet<string>;
        allowedPropertyIds: ReadonlySet<string>;
        records: ReadonlyMap<string, DatabaseRecord>;
        policyId: string;
        policyRevision: string;
      } | null
    >();
    const resolveRelationAccess = (targetSourceId: string) => {
      let targetAccess = relationAccess.get(targetSourceId);
      if (targetAccess === undefined) {
        const targetSource = database.sources.find((candidate) => candidate.id === targetSourceId);
        const titleProperty = targetSource?.properties.find(
          (property) => property.type === 'title',
        );
        if (!targetSource || !titleProperty) {
          relationAccess.set(targetSourceId, null);
          return null;
        }
        const targetRecords = this.#databaseRecordIndex.list(database.id, targetSource.id);
        const targetRecordIds = new Set(targetRecords.map((record) => record.id));
        const targetPropertyIds = new Set(targetSource.properties.map((property) => property.id));
        const targetQuery = DatabaseQuerySchema.parse({
          select: targetSource.properties.map((property) => property.id),
        });
        const targetPolicy = this.#resolveQueryAccess({
          action: 'expand_relation',
          database: cloneDefinition(database),
          source: structuredClone(targetSource),
          query: structuredClone(targetQuery),
          view: null,
          principal: this.#currentAccessPrincipal(),
        });
        if (
          targetPolicy.policyId.trim() === '' ||
          !/^sha256:[a-f0-9]{64}$/.test(targetPolicy.policyRevision)
        ) {
          throw new Error('Database query access resolver returned an invalid policy identity');
        }
        const allowedPropertyIds =
          targetPolicy.allowedPropertyIds === null
            ? targetPropertyIds
            : new Set(
                targetPolicy.allowedPropertyIds.filter((propertyId) =>
                  targetPropertyIds.has(propertyId),
                ),
              );
        const targetAllowedRecordIds =
          targetPolicy.allowedRecordIds === null
            ? targetRecordIds
            : new Set(
                targetPolicy.allowedRecordIds.filter((targetRecordId) =>
                  targetRecordIds.has(targetRecordId),
                ),
              );
        relationPermissionScopes.set(targetSourceId, {
          sourceId: targetSourceId,
          policyId: targetPolicy.policyId,
          policyRevision: targetPolicy.policyRevision,
          allowedRecordIds:
            targetPolicy.allowedRecordIds === null
              ? ('*' as const)
              : [...targetAllowedRecordIds].sort(),
          allowedPropertyIds:
            targetPolicy.allowedPropertyIds === null
              ? ('*' as const)
              : [...allowedPropertyIds].sort(),
        });
        targetAccess = {
          titlePropertyId: titleProperty.id,
          allowedRecordIds: targetAllowedRecordIds,
          allowedPropertyIds,
          records: new Map(targetRecords.map((record) => [record.id, record])),
          policyId: targetPolicy.policyId,
          policyRevision: targetPolicy.policyRevision,
        };
        relationAccess.set(targetSourceId, targetAccess);
      }
      return targetAccess;
    };
    const resolveRelationRecord = (
      recordId: string,
      targetSourceId: string,
    ): ProjectedDatabaseRelationRecord | null => {
      const targetAccess = resolveRelationAccess(targetSourceId);
      if (!targetAccess?.allowedRecordIds.has(recordId)) return null;
      if (!targetAccess.allowedPropertyIds.has(targetAccess.titlePropertyId)) return null;
      const target = targetAccess.records.get(recordId);
      const title = target?.values[targetAccess.titlePropertyId];
      if (!target || typeof title !== 'string') return null;
      return {
        id: target.id,
        sourceId: target.sourceId,
        title,
        ...(target.archivedAt ? { archivedAt: target.archivedAt } : {}),
      };
    };
    for (const property of source.properties) {
      if (property.type === 'relation' && selectedPropertyIds.includes(property.id)) {
        resolveRelationRecord('rec_permission_probe', property.targetSourceId);
      }
    }
    if (
      source.properties.some(
        (property) => property.type === 'formula' || property.type === 'rollup',
      )
    ) {
      for (const targetSource of database.sources) {
        if (targetSource.id !== source.id) resolveRelationAccess(targetSource.id);
      }
    }
    const permissionScope = {
      policyId: access.policyId,
      policyRevision: access.policyRevision,
      allowedRecordIds:
        access.allowedRecordIds === null
          ? ('*' as const)
          : [...new Set(access.allowedRecordIds)].sort(),
      allowedPropertyIds:
        access.allowedPropertyIds === null
          ? ('*' as const)
          : [...new Set(access.allowedPropertyIds)].sort(),
      relationTargets: [...relationPermissionScopes]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([, scope]) => scope),
      savedQuery: savedQuery === null ? null : { id: savedQuery.id, revision: savedQuery.revision },
      agentView: agentView === null ? null : { id: agentView.id, revision: agentView.revision },
    };
    const queryId = databaseQueryId(database.id, source.id, scopedQuery, permissionScope);
    if (input.deltaSince && input.deltaSince.queryId !== queryId) {
      throw new DatabaseDataPlaneError(
        'delta_query_mismatch',
        'deltaSince belongs to a different typed query',
        { providedQueryId: input.deltaSince.queryId, expectedQueryId: queryId },
      );
    }
    const computedPropertyIds = source.properties
      .filter((property) => property.type === 'formula' || property.type === 'rollup')
      .map((property) => property.id)
      .filter((propertyId) => allowedPropertyIds.has(propertyId))
      .sort();
    const derivedPermissionRevision =
      computedPropertyIds.length === 0
        ? null
        : `sha256:${createHash('sha256').update(stableJson(permissionScope)).digest('hex')}`;
    const derivedCacheKey =
      derivedPermissionRevision === null
        ? null
        : `drv_${createHash('sha256')
            .update(
              stableJson({
                databaseId: database.id,
                indexRevision: index.revision,
                manifestRevision: storeSnapshot.revision,
                permissionRevision: derivedPermissionRevision,
                evaluatedAt:
                  index.lastIncrementalAt ?? index.lastRebuiltAt ?? '1970-01-01T00:00:00.000Z',
              }),
            )
            .digest('hex')}`;
    let derivedCache: DatabaseQueryExplainTrace['derivedIndex']['cache'] = 'not_applicable';
    let derivedRecords: readonly DatabaseRecord[] = allDatabaseRecords;
    if (derivedCacheKey && derivedPermissionRevision) {
      const cached = this.#derivedSnapshotCache.get(derivedCacheKey);
      if (cached) {
        derivedCache = 'hit';
        this.#derivedSnapshotCache.delete(derivedCacheKey);
        this.#derivedSnapshotCache.set(derivedCacheKey, cached);
        derivedRecords = cached;
      } else {
        derivedCache = 'miss';
        derivedRecords = materializeDatabaseDerivedRecords({
          definition: database,
          records: allDatabaseRecords,
          context: {
            now: index.lastIncrementalAt ?? index.lastRebuiltAt ?? '1970-01-01T00:00:00.000Z',
            timeZone: 'UTC',
            locale: 'en',
          },
          permissionRevision: derivedPermissionRevision,
          canReadRecord: (record) =>
            record.sourceId === source.id
              ? allowedRecordIds.has(record.id)
              : (resolveRelationAccess(record.sourceId)?.allowedRecordIds.has(record.id) ?? false),
          canReadProperty: (sourceId, propertyId) =>
            sourceId === source.id
              ? allowedPropertyIds.has(propertyId)
              : (resolveRelationAccess(sourceId)?.allowedPropertyIds.has(propertyId) ?? false),
          ...(input.throwIfCancelled ? { throwIfCancelled: input.throwIfCancelled } : {}),
        });
        this.#derivedSnapshotCache.set(derivedCacheKey, derivedRecords);
        while (this.#derivedSnapshotCache.size > 32) {
          const oldest = this.#derivedSnapshotCache.keys().next().value;
          if (oldest === undefined) break;
          this.#derivedSnapshotCache.delete(oldest);
        }
      }
    }
    const verificationTime = new Date(this.#now().getTime());
    verificationTime.setUTCSeconds(0, 0);
    const result = queryDatabaseRecords({
      source,
      records: derivedRecords.filter(
        (record) => record.sourceId === source.id && allowedRecordIds.has(record.id),
      ),
      people: database.people,
      resolveFileAvailability: (path) => this.#databaseRecordIndex.fileAvailability(path),
      resolveRelationRecord,
      query: scopedQuery,
      verificationTime,
      ...(input.throwIfCancelled ? { throwIfCancelled: input.throwIfCancelled } : {}),
      snapshotRevision: `sha256:${createHash('sha256')
        .update(
          stableJson({
            indexRevision: index.revision,
            permissionScope,
            sortSemanticsVersion: DATABASE_QUERY_SORT_SEMANTICS.version,
            verificationAsOf: verificationTime.toISOString(),
          }),
        )
        .digest('hex')}`,
    });
    const conditionalColors = evaluateConditionalColors({
      view,
      source,
      records: derivedRecords,
      returnedRecordIds: result.records.map((record) => record.id),
    });
    const sourceIssueCount = this.#databaseRecordIndex
      .snapshot()
      .issues.filter(
        (issue) =>
          (issue.databaseId === database.id && issue.sourceId === source.id) ||
          (issue.databaseId === undefined &&
            issue.sourceId === undefined &&
            isRecordPathInSource(issue.path, source)),
      ).length;
    const permissionExclusions: DatabaseQueryPermissionExclusions = {
      evaluated: true,
      policyId: access.policyId,
      policyRevision: access.policyRevision,
      records: allRecords.length - allowedRecordIds.size,
      properties: source.properties.length - allowedPropertyIds.size,
      body: access.allowBody === false,
    };
    const permissionFiltered =
      permissionExclusions.records > 0 || permissionExclusions.properties > 0;
    const partialIndex = sourceIssueCount > 0;
    const emptyReason: DatabaseQueryResultState['emptyReason'] =
      result.matched > 0
        ? null
        : permissionExclusions.records > 0 && partialIndex
          ? 'permission_filtered_and_partial_index'
          : permissionExclusions.records > 0
            ? 'permission_filtered'
            : partialIndex
              ? 'partial_index'
              : 'no_match';
    const requestedProjection = parsedQuery.select ?? [...allPropertyIds];
    const trace: DatabaseQueryExplainTrace = {
      source: { databaseId: database.id, sourceId: source.id },
      savedQuery,
      agentView,
      filter: {
        expression: parsedQuery.where ? structuredClone(parsedQuery.where) : null,
        propertyIds: [...new Set(filterPropertyIds(parsedQuery.where))],
      },
      ranking: {
        strategy: 'typed_sort_then_record_id',
        sort: structuredClone(parsedQuery.sort),
        semantics: DATABASE_QUERY_SORT_SEMANTICS,
        tieBreakers: ['record_id'],
      },
      projection: {
        requestedPropertyIds: [...requestedProjection],
        returnedPropertyIds: [...selectedPropertyIds],
        excludedPropertyIds: requestedProjection.filter(
          (propertyId) => !allowedPropertyIds.has(propertyId),
        ),
      },
      aggregation: {
        requested: parsedQuery.aggregate ? structuredClone(parsedQuery.aggregate) : null,
        appliedAfterPermissionScope: true,
        matched: result.aggregation?.matched ?? result.matched,
        totalGroups: result.aggregation?.totalGroups ?? 0,
        returnedGroups: result.aggregation?.returnedGroups ?? 0,
        truncatedBy: result.aggregation?.truncatedBy ?? null,
      },
      permission: permissionExclusions,
      index: {
        revision: index.revision,
        state: index.state,
        freshness: 'snapshot',
        issueCount: sourceIssueCount,
      },
      derivedIndex: {
        propertyIds: computedPropertyIds,
        cache: derivedCache,
        permissionRevision: derivedPermissionRevision,
      },
      truncation: {
        cause: result.truncatedBy,
        limit: parsedQuery.page.limit,
        cursorProvided: parsedQuery.page.cursor !== undefined,
        nextCursor: result.nextCursor,
      },
    };
    const recordRevisions = Object.fromEntries(
      result.records.map((record) => [
        record.id,
        `sha256:${createHash('sha256')
          .update(
            stableJson({
              canonicalRevision: record.revision,
              computedResults: record.computedResults ?? null,
            }),
          )
          .digest('hex')}`,
      ]),
    );
    const previousIds = Object.keys(input.deltaSince?.recordRevisions ?? {}).sort();
    const currentIds = Object.keys(recordRevisions).sort();
    const absent = previousIds.filter((recordId) => !(recordId in recordRevisions));
    const delta = input.deltaSince
      ? {
          sinceQueryId: input.deltaSince.queryId,
          scope: 'returned_page' as const,
          addedOrChangedRecordIds: currentIds.filter(
            (recordId) => input.deltaSince?.recordRevisions[recordId] !== recordRevisions[recordId],
          ),
          unchangedRecordIds: currentIds.filter(
            (recordId) => input.deltaSince?.recordRevisions[recordId] === recordRevisions[recordId],
          ),
          removedRecordIds:
            input.deltaSince.isComplete && result.isComplete ? absent : ([] as string[]),
          absentFromPageRecordIds:
            input.deltaSince.isComplete && result.isComplete ? ([] as string[]) : absent,
          isComplete: input.deltaSince.isComplete && result.isComplete,
        }
      : null;
    return {
      ...result,
      ...(conditionalColors ? { conditionalColors } : {}),
      databaseId: database.id,
      queryId,
      manifestRevision: storeSnapshot.revision,
      indexRevision: index.revision,
      indexState: index.state,
      recordRevisions,
      permissionExclusions,
      savedQuery,
      agentView,
      resultState: {
        empty: result.matched === 0,
        emptyReason,
        permissionFiltered,
        partialIndex,
        truncated: result.truncatedBy !== null || result.aggregation?.truncatedBy === 'group_limit',
      },
      trace,
      delta,
    };
  }

  pack(input: DatabaseDataPlanePackInput): DatabaseContextPack {
    const snapshot = this.#databaseStore.snapshot();
    const database = snapshot.databases.find((candidate) => candidate.id === input.databaseId);
    if (!database) {
      throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
        databaseId: input.databaseId,
      });
    }
    const source = database.sources.find((candidate) => candidate.id === input.sourceId);
    if (!source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', {
        databaseId: input.databaseId,
        sourceId: input.sourceId,
      });
    }
    const visibleAgentViews = this.#visibleViews(database, source, 'pack_context').filter(
      (candidate) => candidate.layout.type === 'agent' && candidate.agent,
    );
    const view =
      input.agentViewId === undefined
        ? null
        : (visibleAgentViews.find((candidate) => candidate.id === input.agentViewId) ?? null);
    if (input.agentViewId !== undefined && (!view || view.layout.type !== 'agent' || !view.agent)) {
      throw new DatabaseDataPlaneError('agent_view_not_found', 'Agent View was not found', {
        agentViewId: input.agentViewId,
        candidates: visibleAgentViews.map((candidate) => ({
          id: candidate.id,
          key: candidate.key,
          name: candidate.name,
        })),
      });
    }
    if (view && view.sourceId !== source.id) {
      throw new DatabaseDataPlaneError(
        'agent_view_source_mismatch',
        'Agent View belongs to a different data source',
        {
          agentViewId: view.id,
          viewSourceId: view.sourceId,
          sourceId: source.id,
        },
      );
    }
    if (!view) {
      if (input.maxTokens === undefined || !input.tokenizer || !input.encoding) {
        throw new DatabaseContextPackError(
          'invalid_pack_budget',
          'A context pack without an Agent View requires maxTokens, tokenizer, and encoding',
        );
      }
      const { agentViewId: _agentViewId, ...plain } = input;
      return this.#captureContextPack(
        this.#createContextPack({
          ...plain,
          sensitivityPolicy: contextSensitivityPolicy(database, 'internal'),
          maxTokens: input.maxTokens,
          tokenizer: input.tokenizer,
          encoding: input.encoding,
        }),
      );
    }

    const agentContract = view.agent;
    if (!agentContract || view.layout.type !== 'agent') {
      throw new Error('validated Agent View is missing its typed contract');
    }
    const agentView = appliedAgentView(view);
    const sensitivityPolicy = contextSensitivityPolicy(
      database,
      agentContract.readPolicy.maxSensitivity,
    );
    const budget = agentContract.tokenBudget;
    if (
      agentContract.semanticContract.evidence === 'required' &&
      input.disclosure?.level !== 'evidence'
    ) {
      throw new DatabaseDataPlaneError(
        'agent_view_scope_violation',
        'Agent View requires evidence disclosure with an explicit search text',
        { agentViewId: view.id, requiredDisclosure: 'evidence' },
      );
    }
    if (input.disclosure?.level === 'full_body' && view.projection.body !== 'full') {
      throw new DatabaseDataPlaneError(
        'agent_view_scope_violation',
        'Agent View does not permit full-body disclosure',
        { agentViewId: view.id, allowedBodyDisclosure: view.projection.body },
      );
    }
    if (input.maxTokens !== undefined && input.maxTokens > budget.maxTokens) {
      throw new DatabaseDataPlaneError(
        'agent_view_budget_exceeded',
        'Requested token budget exceeds the Agent View maximum',
        {
          agentViewId: view.id,
          requestedMaxTokens: input.maxTokens,
          maxTokens: budget.maxTokens,
        },
      );
    }
    if (
      (input.tokenizer !== undefined && input.tokenizer !== budget.tokenizer) ||
      (input.encoding !== undefined && input.encoding !== budget.encoding)
    ) {
      throw new DatabaseDataPlaneError(
        'agent_view_scope_violation',
        'Tokenizer and encoding must match the saved Agent View contract',
        {
          agentViewId: view.id,
          tokenizer: budget.tokenizer,
          encoding: budget.encoding,
        },
      );
    }
    const projected = new Set(view.projection.propertyIds);
    const propertyIds = input.propertyIds ?? view.projection.propertyIds;
    const requestedDependencies = [
      ...propertyIds,
      ...filterPropertyIds(input.query?.where),
      ...(input.query?.sort ?? []).map((sort) => sort.propertyId),
    ];
    const outsideScope = [...new Set(requestedDependencies)].filter(
      (propertyId) => !projected.has(propertyId),
    );
    if (outsideScope.length > 0) {
      throw new DatabaseDataPlaneError(
        'agent_view_scope_violation',
        'Context pack references properties outside the Agent View projection',
        {
          agentViewId: view.id,
          deniedPropertyIds: outsideScope,
          allowedPropertyIds: [...projected],
        },
      );
    }
    const savedRelation = agentContract.scope;
    if (
      input.relationExpansion &&
      (savedRelation.relationDepth === 0 ||
        input.relationExpansion.maxDepth > savedRelation.relationDepth ||
        input.relationExpansion.maxRecords > savedRelation.relationMaxRecords ||
        input.relationExpansion.maxRecordsPerRelation > savedRelation.relationFanOut)
    ) {
      throw new DatabaseDataPlaneError(
        'agent_view_scope_violation',
        'Relation expansion exceeds the saved Agent View scope',
        {
          agentViewId: view.id,
          allowedRelationScope: {
            maxDepth: savedRelation.relationDepth,
            maxRecords: savedRelation.relationMaxRecords,
            maxRecordsPerRelation: savedRelation.relationFanOut,
          },
        },
      );
    }
    const relationExpansion =
      input.relationExpansion ??
      (savedRelation.relationDepth > 0
        ? {
            maxDepth: savedRelation.relationDepth,
            maxRecords: savedRelation.relationMaxRecords,
            maxRecordsPerRelation: savedRelation.relationFanOut,
          }
        : undefined);
    const reserveTokens = Math.max(
      input.reserveTokens ?? budget.reserveTokens,
      budget.reserveTokens,
    );
    const maxTokens = input.maxTokens ?? budget.maxTokens;
    if (reserveTokens >= maxTokens) {
      throw new DatabaseDataPlaneError(
        'agent_view_budget_exceeded',
        'Agent View reserve leaves no usable context budget',
        { agentViewId: view.id, maxTokens, reserveTokens },
      );
    }
    const { agentViewId: _agentViewId, ...requested } = input;
    return this.#captureContextPack(
      this.#createContextPack({
        ...requested,
        propertyIds: [...propertyIds],
        query: {
          where: combineFilters(view.where, input.query?.where),
          sort: input.query?.sort?.length ? input.query.sort : view.sort,
          select: [...propertyIds],
          includeArchived: input.query?.includeArchived ?? false,
        },
        maxTokens,
        reserveTokens,
        tokenizer: budget.tokenizer,
        encoding: budget.encoding,
        ...(relationExpansion ? { relationExpansion } : {}),
        agentView,
        recordLimit: agentContract.scope.maxRecords,
        includeBodyEvidence: view.projection.body !== 'hidden' && sensitivityPolicy.allowBody,
        sensitivityPolicy,
      }),
    );
  }

  listContextInspections(
    scope?: DatabaseContextInspectionScope,
  ): readonly DatabaseContextInspectionSummary[] {
    this.authorizeOperation({ action: 'read_audit' });
    return this.#contextInspector.list(scope);
  }

  getContextInspection(
    packId: string,
    scope?: DatabaseContextInspectionScope,
  ): DatabaseContextInspection {
    this.authorizeOperation({ action: 'read_audit' });
    const inspection = this.#contextInspector.get(packId, scope);
    if (!inspection) {
      throw new DatabaseDataPlaneError(
        'context_inspection_not_found',
        `Context inspection for pack "${packId}" was not found`,
        {
          packId,
          candidates: this.#contextInspector.list(scope).map((candidate) => candidate.packId),
        },
      );
    }
    return inspection;
  }

  #captureContextPack(pack: DatabaseContextPack): DatabaseContextPack {
    this.#contextInspector.capture(pack);
    recordDatabaseContextPackCapture({
      estimatedTokens: pack.budget.estimatedTokens,
      truncated: !pack.isComplete,
    });
    return pack;
  }

  /** Content-free index state: revision, freshness, rebuild progress, and
   *  last error. See `DatabaseRecordIndexStatus`. */
  getRecordIndexStatus(): DatabaseRecordIndexStatus {
    this.authorizeOperation({ action: 'read_audit' });
    return this.#databaseRecordIndex.status();
  }

  /** Content-free summary of live index issues, grouped by code, plus a
   *  bounded sample of stable IDs/paths — never record property values or
   *  Markdown bodies. */
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
  } {
    this.authorizeOperation({ action: 'read_audit' });
    const issues = this.#databaseRecordIndex.snapshot().issues;
    const byCode: Partial<Record<DatabaseRecordIndexIssueCode, number>> = {};
    for (const issue of issues) {
      byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
    }
    return {
      total: issues.length,
      byCode,
      sample: issues.slice(0, 50).map((issue) => ({
        code: issue.code,
        path: issue.path,
        ...(issue.databaseId ? { databaseId: issue.databaseId } : {}),
        ...(issue.sourceId ? { sourceId: issue.sourceId } : {}),
        ...(issue.recordId ? { recordId: issue.recordId } : {}),
      })),
    };
  }

  /** Content-free per-database schema revisions, for diagnostics. */
  getSchemaRevisions(): ReadonlyArray<{
    databaseId: string;
    key: string;
    name: string;
    schemaRevision: string;
  }> {
    this.authorizeOperation({ action: 'read_audit' });
    return this.#databaseStore.snapshot().databases.map((database) => ({
      databaseId: database.id,
      key: database.key,
      name: database.name,
      schemaRevision: databaseSchemaRevision(database),
    }));
  }

  #createContextPack(input: DatabaseContextPackInput): DatabaseContextPack {
    return createDatabaseContextPack(
      {
        describe: (request) => this.#describeCanonical(request),
        query: (request) =>
          this.query({
            ...request,
            ...(input.throwIfCancelled ? { throwIfCancelled: input.throwIfCancelled } : {}),
          }),
        searchText: (request) =>
          this.#searchTextWithAccess(request, {
            ...(input.query?.where ? { where: input.query.where } : {}),
            sort: input.query?.sort ?? [],
            select: [...request.propertyIds],
          }),
        getRecord: (recordId) => this.#getContextRecord(recordId),
      },
      input,
    );
  }

  #searchTextWithAccess(
    input: Parameters<DatabaseRecordIndex['searchText']>[0],
    query: unknown,
  ): DatabaseDataPlaneLexicalSearchResult {
    this.#assertReadable();
    const snapshot = this.#databaseStore.snapshot();
    const database = snapshot.databases.find((candidate) => candidate.id === input.databaseId);
    if (!database) {
      throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
        databaseId: input.databaseId,
      });
    }
    const source = database.sources.find((candidate) => candidate.id === input.sourceId);
    if (!source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', {
        databaseId: input.databaseId,
        sourceId: input.sourceId,
      });
    }
    const parsedQuery = DatabaseQuerySchema.parse(query ?? {});
    const access = this.#resolveQueryAccess({
      action: 'search',
      database: cloneDefinition(database),
      source: structuredClone(source),
      query: structuredClone(parsedQuery),
      view: null,
      principal: this.#currentAccessPrincipal(),
    });
    if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
      throw new Error('Database query access resolver returned an invalid policy identity');
    }
    const records = this.#databaseRecordIndex.list(database.id, source.id);
    const recordIds = new Set(records.map((record) => record.id));
    const propertyIds = new Set(source.properties.map((property) => property.id));
    const allowedRecordIds =
      access.allowedRecordIds === null
        ? recordIds
        : new Set(access.allowedRecordIds.filter((recordId) => recordIds.has(recordId)));
    const allowedPropertyIds =
      access.allowedPropertyIds === null
        ? propertyIds
        : new Set(access.allowedPropertyIds.filter((propertyId) => propertyIds.has(propertyId)));
    const searchedPropertyIds = input.propertyIds.filter(
      (propertyId) => propertyIds.has(propertyId) && allowedPropertyIds.has(propertyId),
    );
    const permissionExclusions: DatabaseQueryPermissionExclusions = {
      evaluated: true,
      policyId: access.policyId,
      policyRevision: access.policyRevision,
      records: records.length - allowedRecordIds.size,
      properties: source.properties.length - allowedPropertyIds.size,
    };
    const permissionFiltered =
      permissionExclusions.records > 0 || permissionExclusions.properties > 0;
    const requestedLimit = Math.max(1, input.limit ?? 25);
    const selectedPropertyIds = new Set(
      parsedQuery.select ?? source.properties.map(({ id }) => id),
    );
    const verificationProperties = source.properties.filter(
      (property) =>
        property.type === 'verification' &&
        selectedPropertyIds.has(property.id) &&
        allowedPropertyIds.has(property.id),
    );
    const recordById = new Map(records.map((record) => [record.id, record] as const));
    const verificationTime = new Date(this.#now().getTime());
    const verificationForRecord = (record: DatabaseRecord) =>
      verificationProperties.flatMap((property) => {
        const parsed = DatabaseVerificationValueSchema.safeParse(record.values[property.id]);
        return parsed.success
          ? [
              {
                propertyId: property.id,
                ...projectDatabaseVerification(
                  parsed.data,
                  record.revision,
                  record.evidenceRevision ?? record.revision,
                  verificationTime,
                ),
              },
            ]
          : [];
      });
    let result: DatabaseLexicalSearchResult;
    try {
      result = this.#databaseRecordIndex.searchText({
        ...input,
        includeBody: input.includeBody && access.allowBody !== false,
        propertyIds: searchedPropertyIds,
        allowedRecordIds: [...allowedRecordIds],
        limit: Math.min(DATABASE_LEXICAL_MAX_HITS, requestedLimit),
        rankBoost: (record) =>
          verificationForRecord(record).some(({ status }) => status === 'verified') ? 1 : 0,
      });
    } catch (error) {
      if (error instanceof DatabaseLexicalSearchLimitError) {
        throw new DatabaseDataPlaneError('resource_limit', error.message, {
          observedTerms: error.observedTerms,
          maximumTerms: DATABASE_LEXICAL_MAX_TERMS,
        });
      }
      throw error;
    }
    const rankedHits = result.hits
      .map((hit) => {
        const record = recordById.get(hit.recordId);
        const verification = record ? verificationForRecord(record) : [];
        const verificationScore = verification.some(({ status }) => status === 'verified') ? 1 : 0;
        return {
          ...hit,
          scoreBreakdown:
            verificationProperties.length > 0
              ? { ...hit.scoreBreakdown, verification: verificationScore }
              : hit.scoreBreakdown,
          ...(verification.length > 0 ? { verification } : {}),
        };
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.path.localeCompare(right.path) ||
          left.recordId.localeCompare(right.recordId),
      );
    const hits = rankedHits.slice(0, requestedLimit);
    return {
      ...result,
      returned: hits.length,
      isComplete: rankedHits.length <= requestedLimit,
      hits,
      trace: {
        ...result.trace,
        ranking:
          verificationProperties.length > 0
            ? { ...result.trace.ranking, verificationWeight: 1 }
            : result.trace.ranking,
      },
      permissionExclusions,
      resultState: {
        empty: result.matched === 0,
        emptyReason:
          result.matched > 0 ? null : permissionFiltered ? 'permission_filtered' : 'no_match',
        permissionFiltered,
        truncated: rankedHits.length > requestedLimit,
      },
    };
  }

  createDraft(input: unknown, ttlSeconds?: number): DatabaseDraftArtifact {
    this.#assertPlanningInputReadAccess(input);
    const draft = this.#databasePlanEngine.createDraft(input, ttlSeconds);
    try {
      this.#assertDraftReadAccess(draft);
      return draft;
    } catch (error) {
      this.#databasePlanEngine.discardDraft(draft.id);
      throw error;
    }
  }

  createDatabaseDeletionDraft(
    databaseId: string,
    expectedSnapshotRevision: string,
    ttlSeconds?: number,
  ): DatabaseDraftArtifact {
    this.authorizeOperation({ action: 'delete_database', databaseId });
    const draft = this.#databasePlanEngine.createDatabaseDeletionDraft(
      databaseId,
      expectedSnapshotRevision,
      ttlSeconds,
    );
    try {
      this.#assertDraftReadAccess(draft);
      return draft;
    } catch (error) {
      this.#databasePlanEngine.discardDraft(draft.id);
      throw error;
    }
  }

  createVerificationDraft(
    input: unknown,
    actor: DatabaseRecordActor,
    ttlSeconds?: number,
  ): DatabaseVerificationDraftResult {
    this.#assertPlanningInputReadAccess(input);
    return this.#databasePlanEngine.createVerificationDraft(
      input,
      this.#bindMutationActorToAccessPrincipal ? this.#trustedRecordActor() : actor,
      ttlSeconds,
    );
  }

  async submitForm(input: DatabaseFormSubmissionInput): Promise<DatabaseFormSubmissionResult> {
    const described = this.#describeCanonical({
      databaseId: input.databaseId,
      sourceId: input.sourceId,
    });
    if (!described.source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Form data source was not found');
    }
    const view = described.database.views.find((candidate) => candidate.id === input.viewId);
    if (!view || view.layout.type !== 'form') {
      throw new DatabaseDataPlaneError('form_not_found', 'Form view was not found', {
        viewId: input.viewId,
      });
    }
    if (view.sourceId !== described.source.id) {
      throw new DatabaseDataPlaneError('view_source_mismatch', 'Form belongs to another source');
    }
    const publicShare = this.#publicShare.getStore();
    if (
      publicShare &&
      (publicShare.target.kind !== 'form' ||
        publicShare.target.databaseId !== input.databaseId ||
        publicShare.target.viewId !== input.viewId ||
        !publicShare.allowFormSubmission)
    ) {
      throw new DatabaseDataPlaneError(
        'form_access_denied',
        'This public share does not accept form submissions.',
      );
    }
    const configuration = view.layout.configuration;
    if (
      !publicShare &&
      configuration.access === 'internal' &&
      !isLoopbackAddress(input.remoteAddress)
    ) {
      throw new DatabaseDataPlaneError(
        'form_access_denied',
        'This form only accepts responses from the local workspace.',
      );
    }

    const now = this.#now();
    if (configuration.closesAt && now.getTime() >= Date.parse(configuration.closesAt)) {
      throw new DatabaseDataPlaneError('form_closed', configuration.closedMessage, {
        closesAt: configuration.closesAt,
      });
    }
    const receiptKey = `${described.database.id}:${view.id}:${input.submissionId}`;
    const receiptKeyHash = databaseFormPrivateKey(receiptKey);
    const fingerprint = `sha256:${createHash('sha256')
      .update(stableJson({ startedAt: input.startedAt, answers: input.answers }))
      .digest('hex')}`;
    const prior = await this.#formStateStore.get(receiptKeyHash);
    if (prior) {
      if (prior.fingerprint !== fingerprint) {
        throw new DatabaseDataPlaneError(
          'form_duplicate_submission',
          'Submission ID was already used for different answers.',
        );
      }
      if (prior.state === 'created') {
        await this.#publishFormAutomationEvent(prior);
        return { ...prior.result, idempotentReplay: true };
      }
      if (prior.state === 'deleted') {
        throw new DatabaseDataPlaneError(
          'form_duplicate_submission',
          'This submission was accepted previously and has passed its retention period.',
        );
      }
      const indexed = this.#databaseRecordIndex.getById(prior.recordId);
      if (
        indexed?.databaseId === described.database.id &&
        indexed.sourceId === described.source.id
      ) {
        await this.#formStateStore.markCreated(prior.id, now.toISOString());
        await this.#publishFormAutomationEvent(prior);
        return { ...prior.result, idempotentReplay: true };
      }
    }
    if (configuration.spamProtection.honeypot && (input.honeypot ?? '') !== '') {
      throw new DatabaseDataPlaneError('form_invalid_submission', 'Form submission was rejected.');
    }
    const startedAt = Date.parse(input.startedAt);
    const minimumMs = configuration.spamProtection.minimumCompletionSeconds * 1_000;
    if (!Number.isFinite(startedAt) || now.getTime() - startedAt < minimumMs) {
      throw new DatabaseDataPlaneError(
        'form_invalid_submission',
        'Form was submitted too quickly. Please review your answers and try again.',
      );
    }
    const rate = configuration.spamProtection.rateLimit;
    if (!prior) {
      const rateDecision = await this.#formStateStore.consumeRate({
        keyHash: databaseFormPrivateKey(
          `submit:${described.database.id}:${view.id}:${input.remoteAddress}`,
        ),
        nowMs: now.getTime(),
        windowSeconds: rate.windowSeconds,
        limit: rate.maxSubmissions,
      });
      if (!rateDecision.allowed) {
        throw new DatabaseDataPlaneError(
          'form_rate_limited',
          'Too many responses were submitted. Please try again later.',
          { retryAfterSeconds: rateDecision.retryAfterSeconds },
        );
      }
    }

    const knownPropertyIds = new Set(
      configuration.questions.map((question) => question.propertyId),
    );
    for (const propertyId of Object.keys(input.answers)) {
      if (!knownPropertyIds.has(propertyId)) {
        throw new DatabaseDataPlaneError(
          'form_invalid_submission',
          `Answer targets an unknown form property "${propertyId}".`,
        );
      }
    }

    const visiblePropertyIds = new Set<string>();
    for (const question of configuration.questions) {
      const visible = formQuestionVisible(question, configuration.questions, input.answers);
      const answer = input.answers[question.propertyId];
      if (!visible) {
        if (answer !== undefined) {
          throw new DatabaseDataPlaneError(
            'form_invalid_submission',
            `Hidden question "${question.label}" cannot be submitted.`,
          );
        }
        continue;
      }
      visiblePropertyIds.add(question.propertyId);
      if (question.required && isEmptyFormValue(answer)) {
        throw new DatabaseDataPlaneError(
          'form_invalid_submission',
          `"${question.label}" is required.`,
          { propertyId: question.propertyId },
        );
      }
    }

    const valuesByPropertyId: Record<string, DatabaseFormValue> = {
      ...structuredClone(configuration.defaults),
    };
    for (const [propertyId, value] of Object.entries(input.answers)) {
      if (visiblePropertyIds.has(propertyId) && !isEmptyFormValue(value)) {
        valuesByPropertyId[propertyId] = structuredClone(value);
      }
    }
    const valuesByPropertyKey: Record<string, DatabaseFormValue> = {};
    for (const [propertyId, value] of Object.entries(valuesByPropertyId)) {
      const property = described.source.properties.find((candidate) => candidate.id === propertyId);
      if (!property || !isDatabaseValueValidForProperty(property, value)) {
        throw new DatabaseDataPlaneError(
          'form_invalid_submission',
          `Submitted value is invalid for property "${propertyId}".`,
          { propertyId },
        );
      }
      const constraintIssue = validateDatabasePropertyConstraints(property, value);
      if (constraintIssue) {
        throw new DatabaseDataPlaneError(
          'form_invalid_submission',
          `${property.name} ${constraintIssue}.`,
          { propertyId },
        );
      }
      if (property.type === 'files') {
        const files = DatabaseFilesValueSchema.parse(value);
        if (
          !configuration.fileUploads.enabled ||
          files.length > configuration.fileUploads.maxFilesPerQuestion ||
          files.some((file) => file.kind !== 'local')
        ) {
          throw new DatabaseDataPlaneError(
            'form_invalid_submission',
            'File answers must use uploaded local files within the configured limit.',
            { propertyId },
          );
        }
      }
      valuesByPropertyKey[property.key] = value;
    }

    const duplicatePolicy = configuration.duplicateSubmission;
    if (duplicatePolicy.type === 'reject_property') {
      const duplicateValue = valuesByPropertyId[duplicatePolicy.propertyId];
      if (isEmptyFormValue(duplicateValue)) {
        throw new DatabaseDataPlaneError(
          'form_invalid_submission',
          'The duplicate-check field requires a value.',
          { propertyId: duplicatePolicy.propertyId },
        );
      }
      if (
        typeof duplicateValue !== 'string' &&
        typeof duplicateValue !== 'number' &&
        typeof duplicateValue !== 'boolean'
      ) {
        throw new DatabaseDataPlaneError(
          'form_invalid_submission',
          'The duplicate-check field must contain one scalar value.',
        );
      }
      const existing = this.query({
        databaseId: described.database.id,
        sourceId: described.source.id,
        query: {
          where: {
            propertyId: duplicatePolicy.propertyId,
            operator: 'eq',
            value: duplicateValue,
          },
          select: [duplicatePolicy.propertyId],
          page: { limit: 1 },
        },
      });
      if (existing.matched > 0) {
        throw new DatabaseDataPlaneError(
          'form_duplicate_submission',
          'A response with this value has already been submitted.',
          { propertyId: duplicatePolicy.propertyId },
        );
      }
    }

    const desiredState: DatabaseDesiredStateDraftInput = {
      ...databaseDefinitionDraftBase(described.database),
      sampleRecords: [
        {
          id:
            prior?.recordId ??
            `rec_form_${receiptKeyHash.slice('sha256:'.length, 'sha256:'.length + 32)}`,
          sourceKey: described.source.key,
          values: valuesByPropertyKey,
          body: '',
        },
      ],
      recordMutations: [],
    };
    const draft = this.#trustedFormMutation.run(true, () => this.createDraft(desiredState, 300));
    const recordId = draft.normalized.sampleRecords[0]?.id;
    if (!recordId) throw new Error('Form draft did not allocate a record ID');
    const plan = this.#trustedFormMutation.run(true, () => this.createPlan(draft.id, 300));
    if (!plan.committable) {
      throw new DatabaseDataPlaneError(
        'form_invalid_submission',
        'Form response does not satisfy the database schema.',
        { conflicts: plan.conflicts },
      );
    }
    const result: DatabaseFormSubmissionResult = {
      status: 'created',
      recordId,
      submittedAt: prior?.result.submittedAt ?? now.toISOString(),
      idempotentReplay: false,
      confirmation: structuredClone(configuration.confirmation),
    };
    const deleteAfter =
      configuration.retention.type === 'delete_after'
        ? new Date(
            Date.parse(result.submittedAt) + configuration.retention.days * 86_400_000,
          ).toISOString()
        : null;
    const receipt = await this.#formStateStore.reserve({
      keyHash: receiptKeyHash,
      fingerprint,
      databaseId: described.database.id,
      sourceId: described.source.id,
      viewId: view.id,
      recordId,
      result,
      deleteAfter,
      now: now.toISOString(),
    });
    try {
      await this.#trustedFormMutation.run(true, () =>
        this.commit({
          planId: plan.id,
          planHash: plan.hash,
          expectedSnapshotRevision: plan.snapshotRevision,
          idempotencyKey: `form:${view.id}:${input.submissionId}`,
          approvalToken: `approve:${plan.hash}`,
          actor: { kind: 'system', principalId: `form:${view.id}` },
        }),
      );
    } catch (error) {
      const indexed = this.#databaseRecordIndex.getById(receipt.recordId);
      if (
        !indexed ||
        indexed.databaseId !== receipt.databaseId ||
        indexed.sourceId !== receipt.sourceId
      ) {
        throw error;
      }
      await this.#formStateStore.markCreated(receipt.id, this.#now().toISOString());
      await this.#publishFormAutomationEvent(receipt);
      return { ...receipt.result, idempotentReplay: true };
    }
    await this.#formStateStore.markCreated(receipt.id, this.#now().toISOString());
    await this.#publishFormAutomationEvent(receipt);
    return result;
  }

  async authorizeFormUpload(input: {
    databaseId: string;
    sourceId: string;
    viewId: string;
    remoteAddress: string;
  }): Promise<DatabaseFormUploadAuthorization> {
    const described = this.#describeCanonical({
      databaseId: input.databaseId,
      sourceId: input.sourceId,
    });
    if (!described.source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Form data source was not found');
    }
    const view = described.database.views.find((candidate) => candidate.id === input.viewId);
    if (!view || view.layout.type !== 'form') {
      throw new DatabaseDataPlaneError('form_not_found', 'Form view was not found');
    }
    if (view.sourceId !== described.source.id) {
      throw new DatabaseDataPlaneError('view_source_mismatch', 'Form belongs to another source');
    }
    const configuration = view.layout.configuration;
    if (configuration.access === 'internal' && !isLoopbackAddress(input.remoteAddress)) {
      throw new DatabaseDataPlaneError(
        'form_access_denied',
        'This form only accepts uploads from the local workspace.',
      );
    }
    const now = this.#now();
    if (configuration.closesAt && now.getTime() >= Date.parse(configuration.closesAt)) {
      throw new DatabaseDataPlaneError('form_closed', configuration.closedMessage);
    }
    if (!configuration.fileUploads.enabled) {
      throw new DatabaseDataPlaneError(
        'form_invalid_submission',
        'This form does not accept file uploads.',
      );
    }
    const rate = configuration.spamProtection.rateLimit;
    const uploadLimit = rate.maxSubmissions * configuration.fileUploads.maxFilesPerQuestion;
    const rateDecision = await this.#formStateStore.consumeRate({
      keyHash: databaseFormPrivateKey(
        `upload:${described.database.id}:${view.id}:${input.remoteAddress}`,
      ),
      nowMs: now.getTime(),
      windowSeconds: rate.windowSeconds,
      limit: uploadLimit,
    });
    if (!rateDecision.allowed) {
      throw new DatabaseDataPlaneError(
        'form_rate_limited',
        'Too many form files were uploaded. Please try again later.',
        { retryAfterSeconds: rateDecision.retryAfterSeconds },
      );
    }
    const folder = described.source.folder === '.' ? '' : `${described.source.folder}/`;
    return { parentDocName: `${folder}form-response` };
  }

  getDraft(draftId: string): DatabaseDraftArtifact {
    const draft = this.#databasePlanEngine.getDraft(draftId);
    this.#assertDraftReadAccess(draft);
    return draft;
  }

  discardDraft(draftId: string): { discarded: boolean; draftId: string } {
    this.#assertDraftReadAccess(this.#databasePlanEngine.getDraft(draftId));
    return this.#databasePlanEngine.discardDraft(draftId);
  }

  createPlan(draftId: string, ttlSeconds?: number): DatabasePlanArtifact {
    this.#assertReadable();
    this.#assertDraftReadAccess(this.#databasePlanEngine.getDraft(draftId));
    const plan = this.#databasePlanEngine.createPlan(draftId, ttlSeconds);
    this.#assertPlanMutationAccess(plan);
    return plan;
  }

  getPlan(planId: string): DatabasePlanArtifact {
    const plan = this.#databasePlanEngine.getPlan(planId);
    this.#assertPlanMutationAccess(plan);
    return plan;
  }

  /** Restore a persisted immutable Agent Run plan and its draft after a process restart. */
  restorePlanBundle(bundle: {
    plan: DatabasePlanArtifact;
    draft: DatabaseDraftArtifact;
  }): DatabasePlanArtifact {
    this.#databasePlanEngine.restoreDraft(bundle.draft);
    this.#databasePlanEngine.restorePlan(bundle.plan);
    return this.getPlan(bundle.plan.id);
  }

  previewPropertyConversion(input: {
    databaseId: string;
    sourceId: string;
    propertyId: string;
    targetProperty: unknown;
    allowLossy?: boolean;
    ttlSeconds?: number;
  }): DatabasePropertyConversionPlanPreview {
    this.#assertReadable();
    const snapshot = this.#databaseStore.snapshot();
    const database = snapshot.databases.find((candidate) => candidate.id === input.databaseId);
    if (!database) {
      throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
        databaseId: input.databaseId,
      });
    }
    const source = database.sources.find((candidate) => candidate.id === input.sourceId);
    if (!source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', {
        databaseId: database.id,
        sourceId: input.sourceId,
      });
    }
    const sourceProperty = source.properties.find((candidate) => candidate.id === input.propertyId);
    if (!sourceProperty) {
      throw new DatabaseDataPlaneError('property_not_found', 'Property was not found', {
        databaseId: database.id,
        sourceId: source.id,
        propertyId: input.propertyId,
      });
    }
    const parsedTarget = DatabasePropertySchema.safeParse(input.targetProperty);
    if (!parsedTarget.success) {
      throw new DatabaseDataPlaneError(
        'invalid_property_conversion',
        'Target property schema is invalid',
        {
          issues: parsedTarget.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      );
    }
    const targetProperty = parsedTarget.data;
    if (
      targetProperty.id !== sourceProperty.id ||
      targetProperty.key !== sourceProperty.key ||
      targetProperty.name !== sourceProperty.name
    ) {
      throw new DatabaseDataPlaneError(
        'invalid_property_conversion',
        'Type conversion must preserve the property ID, key, and name',
        { propertyId: sourceProperty.id },
      );
    }
    const access = this.#resolveQueryAccess({
      action: 'alter_schema',
      database: cloneDefinition(database),
      source: structuredClone(source),
      query: DatabaseQuerySchema.parse({}),
      view: null,
      principal: this.#currentAccessPrincipal(),
    });
    if (access.allowedRecordIds !== null || access.allowedPropertyIds !== null) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'Property conversion requires complete source and schema access',
        {
          databaseId: database.id,
          sourceId: source.id,
          propertyId: sourceProperty.id,
        },
      );
    }
    const records = this.#databaseRecordIndex.list(database.id, source.id);
    if (records.some((record) => record.revision === null)) {
      throw new DatabaseDataPlaneError(
        'stale_index',
        'Property conversion requires exact revisions for every source record',
        { databaseId: database.id, sourceId: source.id },
      );
    }
    const preview = previewDatabasePropertyConversion({
      sourceProperty,
      targetProperty,
      records: records.map((record) => ({
        id: record.id,
        revision: record.revision as string,
        value: record.values[sourceProperty.id],
      })),
      allowLossy: input.allowLossy,
    });
    const base = {
      databaseId: database.id,
      sourceId: source.id,
      propertyId: sourceProperty.id,
      manifestRevision: snapshot.revision,
      indexRevision: this.#databaseRecordIndex.snapshot().revision,
      preview,
    };
    if (!preview.committable) return { ...base, draft: null, plan: null };

    const sourceKeyById = new Map(database.sources.map((entry) => [entry.id, entry.key] as const));
    const desiredState = {
      database: {
        id: database.id,
        key: database.key,
        name: database.name,
        ...(database.description ? { description: database.description } : {}),
        ...(database.icon ? { icon: database.icon } : {}),
        ...(database.cover ? { cover: database.cover } : {}),
        ...(database.aliases ? { aliases: [...database.aliases] } : {}),
        people: structuredClone(database.people),
        contract: structuredClone(database.contract),
      },
      sources: database.sources.map((entry) => ({
        ...structuredClone(entry),
        properties: entry.properties.map((property) =>
          property.id === sourceProperty.id
            ? structuredClone(targetProperty)
            : structuredClone(property),
        ),
      })),
      views: database.views.map((view) => {
        const { sourceId, ...canonicalView } = structuredClone(view);
        return {
          ...canonicalView,
          sourceKey: sourceKeyById.get(sourceId) ?? sourceId,
        };
      }),
      policy: {
        mode: 'review' as const,
        allowedOperations: ['alter_schema', 'mutate_record'],
        maxRecordsPerCommit: Math.max(1, records.length),
      },
      sampleRecords: [],
      recordMutations: preview.changes.flatMap((change) => {
        if (change.outcome === 'empty' || change.outcome === 'blocked') return [];
        return [
          {
            id: change.recordId,
            expectedRevision: change.expectedRevision,
            sourceKey: source.key,
            operations:
              change.after === undefined
                ? [{ op: 'unset' as const, propertyKey: targetProperty.key }]
                : [
                    {
                      op: 'set' as const,
                      propertyKey: targetProperty.key,
                      value: structuredClone(change.after),
                    },
                  ],
          },
        ];
      }),
    };
    try {
      const draft = this.#databasePlanEngine.createDraft(desiredState, input.ttlSeconds);
      const plan = this.#databasePlanEngine.createPlan(draft.id, input.ttlSeconds);
      return { ...base, draft, plan };
    } catch (error) {
      throw new DatabaseDataPlaneError(
        'invalid_property_conversion',
        'Property conversion could not produce an exact database plan',
        { reason: error instanceof Error ? error.message : String(error) },
      );
    }
  }

  createButtonPlan(input: DatabaseButtonPlanInput): DatabaseButtonPlan {
    this.#assertReadable();
    if (!this.#databaseButtonPlanner) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'Database Button planning is not configured for this server',
      );
    }
    const plan = this.#databaseButtonPlanner.createPlan(input);
    this.#buttonPlans.set(plan.id, structuredClone(plan));
    if (plan.internalPlan) {
      this.#buttonInvocationByPlanId.set(plan.internalPlan.id, {
        databaseId: plan.databaseId,
        sourceId: plan.sourceId,
        recordId: plan.recordId,
        propertyId: plan.propertyId,
        buttonId: plan.buttonId,
      });
    }
    return plan;
  }

  configureButtonExecutor(executor: DatabaseButtonExecutor): void {
    this.#databaseButtonExecutor = executor;
  }

  async executeButton(
    input: DatabaseButtonExecutionInput,
  ): Promise<{ run: DatabaseButtonRun; undoToken: string | null }> {
    if (!this.#databaseButtonExecutor) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'Database Button execution is unavailable on this server',
      );
    }
    const plan = this.#buttonPlans.get(input.buttonPlanId);
    if (!plan) {
      throw new DatabaseDataPlaneError(
        'button_plan_expired',
        'Database Button plan expired; create and review a fresh plan',
        { buttonPlanId: input.buttonPlanId },
      );
    }
    this.authorizeOperation({
      action: 'run_automation',
      databaseId: plan.databaseId,
      sourceId: plan.sourceId,
      ...(plan.recordId ? { recordIds: [plan.recordId] } : {}),
      ...(plan.propertyId ? { propertyIds: [plan.propertyId] } : {}),
    });
    if (plan.externalSteps.length > 0) {
      this.authorizeOperation({
        action: 'external_egress',
        databaseId: plan.databaseId,
        sourceId: plan.sourceId,
      });
    }
    const result = await this.#databaseButtonExecutor.execute(
      plan,
      this.#bindMutationActorToAccessPrincipal
        ? { ...input, actor: this.#trustedMutationActor() }
        : input,
    );
    if (result.run.state === 'succeeded' || result.run.state === 'failed') {
      this.#buttonPlans.delete(input.buttonPlanId);
    }
    return result;
  }

  async listButtonRuns(limit = 100): Promise<DatabaseButtonRun[]> {
    this.authorizeOperation({ action: 'read_audit' });
    return this.#databaseButtonExecutor?.list(limit) ?? [];
  }

  configureCommitEngine(engine: DatabaseCommitEngine): void {
    this.#databaseCommitEngine = engine;
  }

  /** Replace derived semantic state after a live provider/config change. */
  configureSemanticIndex(index: DatabaseSemanticIndex): void {
    this.#semanticIndex = index;
  }

  configureAutomationEventPublisher(
    publisher: (input: EnqueueDatabaseAutomationEventInput) => Promise<unknown>,
  ): void {
    this.#publishAutomationEvent = publisher;
  }

  async #publishFormAutomationEvent(receipt: {
    id: string;
    databaseId: string;
    sourceId: string;
    viewId: string;
    recordId: string;
  }): Promise<void> {
    if (!this.#publishAutomationEvent) return;
    const record = this.#databaseRecordIndex.getById(receipt.recordId);
    if (!record?.revision) {
      throw new DatabaseDataPlaneError(
        'index_unavailable',
        'Form response was committed but its automation event awaits an exact indexed revision.',
        { recordId: receipt.recordId },
      );
    }
    await this.#publishAutomationEvent({
      deduplicationKey: `form:${receipt.id}`,
      databaseId: receipt.databaseId,
      kind: 'form_submitted',
      occurredAt: this.#now().toISOString(),
      sourceId: receipt.sourceId,
      recordId: receipt.recordId,
      recordRevision: record.revision,
      viewId: receipt.viewId,
    });
  }

  configureRepairEngine(engine: DatabaseRepairEngine): void {
    this.#databaseRepairEngine = engine;
  }

  async previewRepair(ttlSeconds?: number): Promise<DatabaseRepairPlan> {
    this.#assertReadable();
    if (!this.#databaseRepairEngine) {
      throw new DatabaseDataPlaneError('repair_unavailable', 'Database repair is unavailable');
    }
    return this.#databaseRepairEngine.preview(ttlSeconds);
  }

  async applyRepair(input: DatabaseRepairApplyInput): Promise<DatabaseRepairResult> {
    if (!this.#databaseRepairEngine) {
      throw new DatabaseDataPlaneError('repair_unavailable', 'Database repair is unavailable');
    }
    for (const database of this.#databaseStore.snapshot().databases) {
      this.authorizeOperation({
        action: 'alter_schema',
        databaseId: database.id,
      });
    }
    return this.#databaseRepairEngine.apply(
      this.#bindMutationActorToAccessPrincipal
        ? { ...input, principalId: this.#trustedMutationActor().principalId }
        : input,
    );
  }

  async commit(input: DatabaseCommitInput): Promise<DatabaseCommitResult> {
    if (!this.#databaseCommitEngine) {
      throw new DatabaseCommitError(
        'commit_unavailable',
        'Database commit engine is not configured',
      );
    }
    const exactPlan = this.#databasePlanEngine.getPlan(input.planId);
    this.#assertPlanMutationAccess(exactPlan);
    const trustedInput = this.#bindMutationActorToAccessPrincipal
      ? { ...input, actor: this.#trustedMutationActor() }
      : input;
    const result = await this.#databaseCommitEngine.commit(trustedInput);
    await this.#publishPlanAutomationEvents(exactPlan, result);
    const invocation = this.#buttonInvocationByPlanId.get(input.planId);
    if (invocation && this.#publishAutomationEvent) {
      const record = invocation.recordId
        ? this.#databaseRecordIndex.getById(invocation.recordId)
        : null;
      if (invocation.recordId && !record?.revision) {
        throw new DatabaseDataPlaneError(
          'index_unavailable',
          'Button changes committed but the invocation event awaits an exact indexed revision.',
          { recordId: invocation.recordId, mutationId: result.mutationId },
        );
      }
      await this.#publishAutomationEvent({
        deduplicationKey: `button:${result.mutationId}`,
        databaseId: invocation.databaseId,
        kind: 'button_invoked',
        sourceId: invocation.sourceId,
        recordId: invocation.recordId,
        recordRevision: record?.revision ?? null,
        propertyId: invocation.propertyId,
        buttonId: invocation.buttonId,
      });
      this.#buttonInvocationByPlanId.delete(input.planId);
    }
    return result;
  }

  async #publishPlanAutomationEvents(
    plan: DatabasePlanArtifact,
    result: DatabaseCommitResult,
  ): Promise<void> {
    if (!this.#publishAutomationEvent) return;
    const databaseId = plan.affectedObjects.databaseIds[0];
    if (!databaseId) return;
    for (const change of plan.diff.records) {
      if (change.action === 'delete') continue;
      const record = this.#databaseRecordIndex.getById(change.recordId);
      if (!record?.revision) {
        throw new DatabaseDataPlaneError(
          'index_unavailable',
          'Database changes committed but automation events await an exact indexed revision.',
          { recordId: change.recordId, mutationId: result.mutationId },
        );
      }
      if (change.action === 'create') {
        await this.#publishAutomationEvent({
          deduplicationKey: `commit:${result.mutationId}:record:${record.id}`,
          databaseId,
          kind: 'record_added',
          sourceId: record.sourceId,
          recordId: record.id,
          recordRevision: record.revision,
        });
        continue;
      }
      const before = change.before?.values ?? {};
      const after = change.after?.values ?? {};
      for (const propertyId of new Set(Object.keys(before).concat(Object.keys(after)))) {
        if (stableJson(before[propertyId]) === stableJson(after[propertyId])) continue;
        await this.#publishAutomationEvent({
          deduplicationKey: `commit:${result.mutationId}:record:${record.id}:property:${propertyId}`,
          databaseId,
          kind: 'property_changed',
          sourceId: record.sourceId,
          recordId: record.id,
          recordRevision: record.revision,
          propertyId,
        });
      }
    }
  }

  async undo(input: DatabaseUndoInput): Promise<DatabaseUndoResult> {
    if (!this.#databaseCommitEngine) {
      throw new DatabaseCommitError(
        'commit_unavailable',
        'Database commit engine is not configured',
      );
    }
    return this.#databaseCommitEngine.undo(
      this.#bindMutationActorToAccessPrincipal && input.action === 'apply'
        ? { ...input, actor: this.#trustedMutationActor() }
        : input,
    );
  }

  #projectSemanticIndexStatus(
    status: DatabaseSemanticIndexStatus,
    source: DatabaseSource,
    records: readonly DatabaseRecord[],
    access: DatabaseQueryAccessDecision,
  ): DatabaseSemanticIndexStatus {
    const scoped =
      access.allowedRecordIds !== null ||
      access.allowedPropertyIds !== null ||
      access.allowBody === false;
    if (!scoped) return status;
    const allowedRecordIds =
      access.allowedRecordIds === null ? null : new Set(access.allowedRecordIds);
    const allowedPropertyIds =
      access.allowedPropertyIds === null ? null : new Set(access.allowedPropertyIds);
    const visibleRecords = records
      .filter((record) => allowedRecordIds === null || allowedRecordIds.has(record.id))
      .map((record) => ({
        id: record.id,
        path: record.path,
        values: Object.fromEntries(
          Object.entries(record.values)
            .filter(
              ([propertyId]) => allowedPropertyIds === null || allowedPropertyIds.has(propertyId),
            )
            .sort(([left], [right]) => left.localeCompare(right)),
        ),
        ...(status.includeBody && access.allowBody !== false ? { body: record.body } : {}),
      }));
    const visibleProperties = source.properties.filter(
      (property) => allowedPropertyIds === null || allowedPropertyIds.has(property.id),
    );
    const visibleIndexedRecords = Math.min(status.indexedRecords, visibleRecords.length);
    return {
      ...status,
      schemaRevision: `sha256:${createHash('sha256')
        .update(
          stableJson({
            properties: visibleProperties,
            policy: access.policyRevision,
          }),
        )
        .digest('hex')}`,
      indexRevision: `sha256:${createHash('sha256')
        .update(stableJson({ records: visibleRecords, policy: access.policyRevision }))
        .digest('hex')}`,
      propertyIds: status.propertyIds.filter(
        (propertyId) => allowedPropertyIds === null || allowedPropertyIds.has(propertyId),
      ),
      indexedRecords: visibleIndexedRecords,
      staleRecords: Math.min(status.staleRecords, visibleIndexedRecords),
      createdAt: null,
    };
  }

  #assertPlanningInputReadAccess(input: unknown): void {
    if (this.#trustedFormMutation.getStore() === true) return;
    const principal = this.#currentAccessPrincipal();
    const rawDatabase =
      input && typeof input === 'object' && 'database' in input
        ? (input as { database?: unknown }).database
        : null;
    const selector =
      rawDatabase && typeof rawDatabase === 'object'
        ? (rawDatabase as { id?: unknown; key?: unknown })
        : null;
    const database = this.#databaseStore
      .snapshot()
      .databases.find(
        (candidate) =>
          (typeof selector?.id === 'string' && candidate.id === selector.id) ||
          (typeof selector?.key === 'string' && candidate.key === selector.key),
      );
    if (!database) {
      if (principal.kind === 'agent') {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Agent plans require an existing database with unrestricted planning visibility',
        );
      }
      return;
    }
    for (const source of database.sources) {
      const access = this.#resolveQueryAccess({
        action: 'query',
        database: cloneDefinition(database),
        source: structuredClone(source),
        query: DatabaseQuerySchema.parse({}),
        view: null,
        principal,
      });
      if (
        access.allowed === false ||
        access.allowedRecordIds !== null ||
        access.allowedPropertyIds !== null ||
        access.allowBody === false
      ) {
        throw new DatabaseDataPlaneError(
          'permission_denied',
          'Database plans require unrestricted visibility of the existing schema and records',
          { policyId: access.policyId, policyRevision: access.policyRevision },
        );
      }
    }
  }

  #assertDraftReadAccess(draft: DatabaseDraftArtifact): void {
    if (this.#trustedFormMutation.getStore() === true) return;
    const databaseId = draft.normalized.definition.id;
    const existing = this.#databaseStore
      .snapshot()
      .databases.some((database) => database.id === databaseId);
    if (!existing) return;
    const recordIds = [
      ...draft.normalized.sampleRecords.map(({ id }) => id),
      ...draft.normalized.recordMutations.map(({ recordId }) => recordId),
      ...draft.normalized.recordCopies.map(({ sourceRecordId }) => sourceRecordId),
      ...draft.normalized.recordArchives.map(({ recordId }) => recordId),
      ...draft.normalized.recordMoves.map(({ recordId }) => recordId),
      ...draft.normalized.recordDeletions.map(({ recordId }) => recordId),
    ];
    for (const source of draft.normalized.definition.sources) {
      this.authorizeOperation({
        action: 'query',
        databaseId,
        sourceId: source.id,
        recordIds: [...new Set(recordIds)],
        propertyIds: source.properties.map(({ id }) => id),
      });
    }
  }

  #assertPlanMutationAccess(plan: DatabasePlanArtifact): void {
    if (this.#trustedFormMutation.getStore() === true) return;
    const snapshot = this.#databaseStore.snapshot();
    const principal = this.#currentAccessPrincipal();
    const actions = new Set<DatabasePermissionAction>();
    for (const operation of plan.normalizedOperations) {
      switch (operation.kind) {
        case 'ensure_database':
          if (operation.action === 'create') actions.add('create_database');
          else if (operation.action === 'delete') actions.add('delete_database');
          else if (operation.action !== 'noop') actions.add('alter_schema');
          break;
        case 'delete_database':
          actions.add('delete_database');
          break;
        case 'ensure_property':
        case 'ensure_relation':
        case 'ensure_view':
        case 'alter_schema':
          if (operation.action !== 'noop') actions.add('alter_schema');
          break;
        case 'upsert_records':
          if (operation.created > 0) actions.add('create_record');
          if (operation.updated > 0) actions.add('update_record');
          break;
        case 'mutate_record':
        case 'duplicate_records':
        case 'archive_records':
        case 'move_records':
          actions.add('update_record');
          break;
        case 'delete_records':
          actions.add('delete_record');
          break;
      }
    }
    for (const action of actions) {
      for (const databaseId of plan.affectedObjects.databaseIds) {
        const database = snapshot.databases.find((candidate) => candidate.id === databaseId);
        if (!database) {
          this.authorizeOperation({ action });
          continue;
        }
        const sources =
          plan.affectedObjects.sourceIds.length > 0
            ? database.sources.filter((source) =>
                plan.affectedObjects.sourceIds.includes(source.id),
              )
            : database.sources;
        for (const source of sources) {
          const access = this.#resolveQueryAccess({
            action,
            database: cloneDefinition(database),
            source: structuredClone(source),
            query: DatabaseQuerySchema.parse({}),
            view: null,
            principal,
          });
          const deniedProperties = plan.affectedObjects.propertyIds.filter(
            (propertyId) =>
              access.allowedPropertyIds !== null && !access.allowedPropertyIds.includes(propertyId),
          );
          const deniedRecords = plan.affectedObjects.recordIds.filter(
            (recordId) =>
              access.allowedRecordIds !== null && !access.allowedRecordIds.includes(recordId),
          );
          if (access.allowed === false || deniedProperties.length > 0 || deniedRecords.length > 0) {
            throw new DatabaseDataPlaneError(
              'permission_denied',
              'Database plan exceeds the effective mutation scope',
              {
                action,
                databaseId,
                sourceId: source.id,
                policyId: access.policyId,
                policyRevision: access.policyRevision,
                deniedPropertyIds: deniedProperties,
                deniedRecordIds: deniedRecords,
              },
            );
          }
        }
      }
    }
  }

  #assertReadable(): void {
    if (
      this.#databaseCommitEngine?.isTransactionActive() ||
      this.#databaseRepairEngine?.isTransactionActive() ||
      this.#isCanonicalTransitionActive()
    ) {
      throw new DatabaseDataPlaneError(
        'transaction_in_progress',
        'Database transaction is in progress; retry after it reaches a committed or rolled-back state',
      );
    }
  }

  #getContextRecord(recordId: string): {
    record: DatabaseRecord | null;
    deniedRecord: boolean;
    deniedPropertyIds: readonly string[];
    deniedBody: boolean;
  } {
    this.#assertReadable();
    const record = this.#databaseRecordIndex.getById(recordId);
    if (!record)
      return {
        record: null,
        deniedRecord: false,
        deniedPropertyIds: [],
        deniedBody: false,
      };
    const database = this.#databaseStore
      .snapshot()
      .databases.find((candidate) => candidate.id === record.databaseId);
    const source = database?.sources.find((candidate) => candidate.id === record.sourceId);
    if (!database || !source) {
      return {
        record: null,
        deniedRecord: false,
        deniedPropertyIds: [],
        deniedBody: false,
      };
    }
    const query = DatabaseQuerySchema.parse({
      select: source.properties.map((property) => property.id),
      page: { limit: 1 },
    });
    const access = this.#resolveQueryAccess({
      action: 'pack_context',
      database: cloneDefinition(database),
      source: structuredClone(source),
      query,
      view: null,
      principal: this.#currentAccessPrincipal(),
    });
    if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
      throw new Error('Database query access resolver returned an invalid policy identity');
    }
    if (access.allowedRecordIds !== null && !access.allowedRecordIds.includes(record.id)) {
      return {
        record: null,
        deniedRecord: true,
        deniedPropertyIds: [],
        deniedBody: false,
      };
    }
    const allowedPropertyIds =
      access.allowedPropertyIds === null
        ? new Set(source.properties.map((property) => property.id))
        : new Set(access.allowedPropertyIds);
    return {
      record: {
        ...record,
        body: access.allowBody === false ? '' : record.body,
        values: Object.fromEntries(
          Object.entries(record.values).filter(([propertyId]) =>
            allowedPropertyIds.has(propertyId),
          ),
        ),
        ...(record.invalidValues
          ? {
              invalidValues: Object.fromEntries(
                Object.entries(record.invalidValues).filter(([propertyId]) =>
                  allowedPropertyIds.has(propertyId),
                ),
              ),
            }
          : {}),
        ...(record.issues
          ? {
              issues: record.issues.filter((issue) => allowedPropertyIds.has(issue.propertyId)),
            }
          : {}),
      },
      deniedRecord: false,
      deniedBody: access.allowBody === false,
      deniedPropertyIds: source.properties
        .map((property) => property.id)
        .filter((propertyId) => !allowedPropertyIds.has(propertyId)),
    };
  }

  #catalogEntry(database: DatabaseDefinition, needle: string | null): DatabaseCatalogEntry {
    const matched = new Map<DatabaseCatalogMatchField, number>();
    const match = (field: DatabaseCatalogMatchField, value: string, weight: number): void => {
      if (needle !== null && normalized(value).includes(needle)) {
        matched.set(field, Math.max(matched.get(field) ?? 0, weight));
      }
    };
    if (needle !== null) {
      match('database_key', database.key, normalized(database.key) === needle ? 120 : 100);
      match('database_name', database.name, normalized(database.name) === needle ? 110 : 90);
      for (const alias of database.aliases) match('database_alias', alias, 80);
      match('purpose', database.contract.purpose, 70);
      for (const word of database.contract.vocabulary) match('vocabulary', word, 75);
      for (const source of database.sources) {
        match('source_key', source.key, 70);
        match('source_name', source.name, 65);
        match('record_meaning', source.recordMeaning, 60);
        for (const property of source.properties) {
          if (property.type !== 'relation') continue;
          match('relation_key', property.key, 65);
          match('relation_name', property.name, 60);
          const target = database.sources.find(
            (candidate) => candidate.id === property.targetSourceId,
          );
          if (target) {
            match('relation_target', target.key, 55);
            match('relation_target', target.name, 50);
          }
        }
      }
    }
    return {
      id: database.id,
      key: database.key,
      name: database.name,
      schemaRevision: databaseSchemaRevision(database),
      purpose: database.contract.purpose,
      canonicality: database.contract.canonicality,
      vocabulary: [...database.contract.vocabulary],
      freshness: structuredClone(database.contract.freshness),
      sensitivity: database.contract.sensitivity,
      sources: database.sources.map((source) => ({
        id: source.id,
        key: source.key,
        name: source.name,
        recordMeaning: source.recordMeaning,
        propertyCount: source.properties.length,
      })),
      viewCount: database.views.length,
      relationCount: database.sources.reduce(
        (count, source) =>
          count + source.properties.filter((property) => property.type === 'relation').length,
        0,
      ),
      score: [...matched.values()].reduce((sum, value) => sum + value, 0),
      matchedBy: [...matched.keys()],
    };
  }

  #visibleViews(
    database: DatabaseDefinition,
    source: DatabaseSource,
    action: 'query' | 'aggregate' | 'pack_context',
  ): DatabaseView[] {
    const query = DatabaseQuerySchema.parse({});
    return database.views
      .filter((view) => view.sourceId === source.id)
      .filter((view) => {
        const access = this.#resolveQueryAccess({
          action,
          database: cloneDefinition(database),
          source: structuredClone(source),
          query: structuredClone(query),
          view: structuredClone(view),
          principal: this.#currentAccessPrincipal(),
        });
        if (access.allowed === false) return false;
        if (access.allowedPropertyIds === null) return true;
        const allowed = new Set(access.allowedPropertyIds);
        return view.projection.propertyIds.every((propertyId) => allowed.has(propertyId));
      })
      .map((view) => structuredClone(view));
  }

  #resolvePublicShareAccess(
    policy: DatabasePublicSharePolicy,
    input: Parameters<ResolveDatabaseQueryAccess>[0],
  ): DatabaseQueryAccessDecision {
    const revision = `sha256:${createHash('sha256')
      .update(
        stableJson({
          id: policy.id,
          target: policy.target,
          access: policy.access,
          propertyIds: policy.propertyIds,
          allowBody: policy.allowBody,
          allowFormSubmission: policy.allowFormSubmission,
          expiresAt: policy.expiresAt,
          revokedAt: policy.revokedAt,
          tokenHash: policy.tokenHash,
          updatedAt: policy.updatedAt,
        }),
      )
      .digest('hex')}`;
    const denied = (): DatabaseQueryAccessDecision => ({
      allowed: false,
      policyId: policy.id,
      policyRevision: revision,
      allowedRecordIds: [],
      allowedPropertyIds: [],
      allowBody: false,
    });
    const readableActions = new Set<DatabasePermissionAction>([
      'catalog',
      'describe',
      'read_record',
      'search',
      'query',
      'aggregate',
      'expand_relation',
      'pack_context',
    ]);
    const target = policy.target;
    if (!readableActions.has(input.action) || input.database.id !== target.databaseId) {
      return denied();
    }

    let sourceId: string | null = null;
    let allowedRecordIds: readonly string[] | null = null;
    if (target.kind === 'database') {
      sourceId = target.sourceId;
    } else if (target.kind === 'record') {
      const record = this.#databaseRecordIndex.getById(target.recordId);
      if (!record || record.databaseId !== target.databaseId) return denied();
      sourceId = record.sourceId;
      allowedRecordIds = [record.id];
    } else {
      const targetView = input.database.views.find(({ id }) => id === target.viewId);
      if (!targetView) return denied();
      sourceId = targetView.sourceId;
      const operationNeedsView =
        target.kind !== 'form' &&
        (input.action === 'query' ||
          input.action === 'aggregate' ||
          input.action === 'pack_context');
      if (operationNeedsView && input.view?.id !== targetView.id) return denied();
      if (input.view && input.view.id !== targetView.id) return denied();
    }
    if (input.source.id !== sourceId) return denied();
    const knownPropertyIds = new Set(input.source.properties.map(({ id }) => id));
    const allowedPropertyIds = policy.propertyIds.filter((id) => knownPropertyIds.has(id));
    if (
      !input.source.properties.some(
        ({ id, type }) => type === 'title' && allowedPropertyIds.includes(id),
      )
    ) {
      return denied();
    }
    return {
      allowed: true,
      policyId: policy.id,
      policyRevision: revision,
      allowedRecordIds,
      allowedPropertyIds,
      allowBody: policy.allowBody,
    };
  }
}

export function createDatabaseDataPlane(
  options: CreateDatabaseDataPlaneOptions,
): DatabaseDataPlane {
  return new DatabaseDataPlane(options);
}
