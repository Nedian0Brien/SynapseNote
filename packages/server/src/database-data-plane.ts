import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import {
  compileDatabaseFind,
  compileFormulaSource,
  DATABASE_QUERY_SORT_SEMANTICS,
  type DatabaseAccessPrincipal,
  DatabaseAccessPrincipalSchema,
  type DatabaseConditionalColorResult,
  type DatabaseDefinition,
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
  type DatabasePublicShareTarget,
  type DatabaseQuery,
  type DatabaseQueryResult,
  DatabaseQuerySchema,
  type DatabaseRecord,
  type DatabaseRecordActor,
  type DatabaseSource,
  DatabaseVerificationValueSchema,
  type DatabaseView,
  evaluateDatabaseFilter,
  type FormulaComputedResult,
  formulaErrorResult,
  materializeDatabaseDerivedRecords,
  projectDatabaseVerification,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseMarkdownTableExport } from '@nedian0brien/synapsenote-core/server';
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
import type {
  DatabaseCommitEngine,
  DatabaseCommitInput,
  DatabaseCommitResult,
  DatabaseUndoInput,
  DatabaseUndoResult,
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
  type DatabaseContextPackInput,
  type DatabaseContextPackTokenizer,
} from './database-context-pack.ts';
import { createDatabaseButtonCoordinator } from './database-data-plane-buttons.ts';
import {
  createDatabaseCatalog,
  type DatabaseCatalogNotModifiedResult,
  type DatabaseCatalogResult,
} from './database-data-plane-catalog.ts';
import { createDatabaseCommitAutomationCoordinator } from './database-data-plane-commit-automation.ts';
import { createDatabaseContextPackCoordinator } from './database-data-plane-context.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import {
  authorizeDatabaseFormUpload,
  type DatabaseFormSubmissionInput,
  type DatabaseFormSubmissionResult,
  type DatabaseFormUploadAuthorization,
  submitDatabaseForm,
} from './database-data-plane-form-policy.ts';
import {
  type DatabaseMarkdownTableExportInput,
  type DatabaseMarkdownTableMutationRequest,
  exportDatabaseMarkdownTable,
} from './database-data-plane-markdown-adapters.ts';
import { createDatabasePlanMutationCoordinator } from './database-data-plane-plan-mutations.ts';
import {
  createDatabasePublicSharePolicy,
  type DatabasePublicShareTargetResolution,
} from './database-data-plane-public-share.ts';
import { executeDatabaseQuery } from './database-data-plane-query-execution.ts';
import {
  createDatabaseReadProjection,
  type DatabaseDescribeNotModifiedResult,
  type DatabaseDescribeResult,
  type DatabaseRecordLookupResult,
} from './database-data-plane-read-projection.ts';
import { createDatabaseRetrieval } from './database-data-plane-retrieval.ts';
import {
  createDatabaseFormStateStore,
  type DatabaseFormStateStore,
} from './database-form-state-store.ts';
import type { DatabaseMarkdownTableWriter } from './database-markdown-table-writer.ts';
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
  DatabaseRepairPreviewOptions,
  DatabaseRepairResult,
  DatabaseRepairUndoInput,
  DatabaseRepairUndoResult,
} from './database-repair.ts';
import {
  DatabaseSemanticIndex,
  type DatabaseSemanticIndexStatus,
  type DatabaseSemanticSearchResult,
  type fuseDatabaseRetrieval,
} from './database-semantic-index.ts';
import type { DatabaseStore } from './database-store.ts';
import { recordDatabaseContextPackCapture } from './database-telemetry.ts';
import { isV1Database, v1MigrationRequiredMessage } from './database-v1-compatibility.ts';

export type {
  DatabaseCatalogEntry,
  DatabaseCatalogMatchField,
  DatabaseCatalogNotModifiedResult,
  DatabaseCatalogResult,
  DatabaseCatalogSourceCard,
} from './database-data-plane-catalog.ts';
export type { DatabaseDataPlaneErrorCode } from './database-data-plane-errors.ts';
export { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
export type {
  DatabaseFormSubmissionInput,
  DatabaseFormSubmissionResult,
  DatabaseFormUploadAuthorization,
} from './database-data-plane-form-policy.ts';
export type {
  DatabaseMarkdownTableExportInput,
  DatabaseMarkdownTableMutationInput,
  DatabaseMarkdownTableMutationRequest,
} from './database-data-plane-markdown-adapters.ts';
export type { DatabasePublicShareTargetResolution } from './database-data-plane-public-share.ts';
export type {
  DatabaseDescribeNotModifiedResult,
  DatabaseDescribeResult,
  DatabaseRecordLookupResult,
} from './database-data-plane-read-projection.ts';

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
  /** Internal cooperative cancellation seam; never part of the wire schema. */
  throwIfCancelled?: () => void;
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
  /** The sole v2 owner-table mutation boundary. */
  databaseMarkdownTableWriter?: DatabaseMarkdownTableWriter;
  /**
   * Compatibility seam for embedded/import callers. Production sets this to
   * false so product/API/form mutations cannot invoke the v1 record writer.
   */
  allowLegacyV1Mutation?: boolean;
  /** Blocks mutations while a durable v1→v2 task owns the canonical transition. */
  isDatabaseMigrationActive?: () => { taskId: string } | null;
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

function _isLoopbackAddress(value: string): boolean {
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

function _formQuestionVisible(
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
  readonly #isDatabaseMigrationActive: () => { taskId: string } | null;
  readonly #databaseMarkdownTableWriter: DatabaseMarkdownTableWriter | null;
  readonly #allowLegacyV1Mutation: boolean;
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
    this.#isDatabaseMigrationActive = options.isDatabaseMigrationActive ?? (() => null);
    this.#databaseMarkdownTableWriter = options.databaseMarkdownTableWriter ?? null;
    this.#allowLegacyV1Mutation = options.allowLegacyV1Mutation ?? true;
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
    return createDatabasePublicSharePolicy(this.#publicSharePort()).withPublicShare(
      policy,
      operation,
    );
  }

  /** Validate a proposed share against canonical IDs and the publisher's current authority. */
  validatePublicShareTarget(input: {
    target: DatabasePublicShareTarget;
    propertyIds: readonly string[];
    allowFormSubmission: boolean;
  }): DatabasePublicShareTargetResolution {
    return createDatabasePublicSharePolicy(this.#publicSharePort()).validateTarget(input);
  }

  #currentAccessPrincipal(): DatabaseAccessPrincipal {
    return this.#accessPrincipal.getStore() ?? this.#defaultAccessPrincipal;
  }

  #catalogPort() {
    return {
      assertReadable: this.#assertReadable.bind(this),
      snapshot: this.#databaseStore.snapshot.bind(this.#databaseStore),
      index: {
        list: this.#databaseRecordIndex.list.bind(this.#databaseRecordIndex),
        status: this.#databaseRecordIndex.status.bind(this.#databaseRecordIndex),
      },
      resolveQueryAccess: this.#resolveQueryAccess,
      currentAccessPrincipal: this.#currentAccessPrincipal.bind(this),
    };
  }

  #readProjectionPort() {
    return {
      assertReadable: this.#assertReadable.bind(this),
      snapshot: this.#databaseStore.snapshot.bind(this.#databaseStore),
      indexStatus: this.#databaseRecordIndex.status.bind(this.#databaseRecordIndex),
      resolveQueryAccess: this.#resolveQueryAccess,
      currentAccessPrincipal: this.#currentAccessPrincipal.bind(this),
      catalog: () => this.catalog().candidates,
      publicShare: this.#publicShare.getStore.bind(this.#publicShare),
      getContextRecord: this.#getContextRecord.bind(this),
    };
  }

  #publicSharePort() {
    return {
      now: this.#now,
      runPublicShare: this.#publicShare.run.bind(this.#publicShare),
      withAccessPrincipal: this.withAccessPrincipal.bind(this),
      authorizeOperation: this.authorizeOperation.bind(this),
      snapshot: this.#databaseStore.snapshot.bind(this.#databaseStore),
      getRecordById: this.#databaseRecordIndex.getById.bind(this.#databaseRecordIndex),
    };
  }

  #retrievalPort() {
    return {
      describeCanonical: this.#describeCanonical.bind(this),
      resolveQueryAccess: this.#resolveQueryAccess,
      currentAccessPrincipal: this.#currentAccessPrincipal.bind(this),
      recordIndex: this.#databaseRecordIndex,
      semanticIndex: this.#semanticIndex,
      searchTextWithAccess: this.#searchTextWithAccess.bind(this),
      projectSemanticIndexStatus: this.#projectSemanticIndexStatus.bind(this),
    };
  }

  #queryExecutionPort() {
    return {
      assertReadable: this.#assertReadable.bind(this),
      snapshot: this.#databaseStore.snapshot.bind(this.#databaseStore),
      recordIndex: this.#databaseRecordIndex,
      visibleViews: this.#visibleViews.bind(this),
      resolveQueryAccess: this.#resolveQueryAccess,
      currentAccessPrincipal: this.#currentAccessPrincipal.bind(this),
      derivedSnapshotCache: this.#derivedSnapshotCache,
      now: this.#now,
      combineFilters,
      appliedSavedQuery,
      appliedAgentView,
      conditionalColorPropertyIds,
      layoutPropertyIds,
      chartAggregate,
      evaluateConditionalColors,
      databaseQueryId,
      cloneDefinition,
      stableJson,
    };
  }

  #contextPackPort() {
    return {
      snapshot: this.#databaseStore.snapshot.bind(this.#databaseStore),
      visibleViews: this.#visibleViews.bind(this),
      appliedAgentView,
      contextSensitivityPolicy,
      filterPropertyIds,
      combineFilters,
      createContextPack: this.#createContextPack.bind(this),
      captureContextPack: this.#captureContextPack.bind(this),
      authorizeOperation: this.authorizeOperation.bind(this),
      contextInspector: this.#contextInspector,
      recordIndex: this.#databaseRecordIndex,
      databaseSchemaRevision,
    };
  }

  #planMutationPort() {
    return {
      assertReadable: this.#assertReadable.bind(this),
      assertPlanningInputReadAccess: this.#assertPlanningInputReadAccess.bind(this),
      assertDraftReadAccess: this.#assertDraftReadAccess.bind(this),
      assertPlanMutationAccess: this.#assertPlanMutationAccess.bind(this),
      authorizeOperation: this.authorizeOperation.bind(this),
      snapshot: this.#databaseStore.snapshot.bind(this.#databaseStore),
      planEngine: this.#databasePlanEngine,
      recordIndex: this.#databaseRecordIndex,
      resolveQueryAccess: this.#resolveQueryAccess,
      currentAccessPrincipal: this.#currentAccessPrincipal.bind(this),
      bindMutationActorToAccessPrincipal: this.#bindMutationActorToAccessPrincipal,
      trustedRecordActor: this.#trustedRecordActor.bind(this),
      cloneDefinition,
    };
  }

  #buttonPort() {
    return {
      assertReadable: this.#assertReadable.bind(this),
      assertMutationAllowed: this.#assertMutationAllowed.bind(this),
      authorizeOperation: this.authorizeOperation.bind(this),
      planner: this.#databaseButtonPlanner,
      plans: this.#buttonPlans,
      invocationByPlanId: this.#buttonInvocationByPlanId,
      executor: () => this.#databaseButtonExecutor,
      setExecutor: (executor: DatabaseButtonExecutor) => {
        this.#databaseButtonExecutor = executor;
      },
      bindMutationActorToAccessPrincipal: this.#bindMutationActorToAccessPrincipal,
      trustedMutationActor: this.#trustedMutationActor.bind(this),
    };
  }

  #commitAutomationPort() {
    return {
      assertReadable: this.#assertReadable.bind(this),
      assertMutationAllowed: this.#assertMutationAllowed.bind(this),
      assertPlanMutationAccess: this.#assertPlanMutationAccess.bind(this),
      authorizeOperation: this.authorizeOperation.bind(this),
      databases: () => this.#databaseStore.snapshot().databases,
      planEngine: this.#databasePlanEngine,
      recordIndex: this.#databaseRecordIndex,
      getCommitEngine: () => this.#databaseCommitEngine,
      setCommitEngine: (engine: DatabaseCommitEngine) => {
        this.#databaseCommitEngine = engine;
      },
      getRepairEngine: () => this.#databaseRepairEngine,
      setRepairEngine: (engine: DatabaseRepairEngine) => {
        this.#databaseRepairEngine = engine;
      },
      getPublisher: () => this.#publishAutomationEvent,
      setPublisher: (
        publisher: (input: EnqueueDatabaseAutomationEventInput) => Promise<unknown>,
      ) => {
        this.#publishAutomationEvent = publisher;
      },
      now: this.#now,
      bindMutationActorToAccessPrincipal: this.#bindMutationActorToAccessPrincipal,
      trustedMutationActor: this.#trustedMutationActor.bind(this),
      trustedRecordActor: this.#trustedRecordActor.bind(this),
      buttonInvocationByPlanId: this.#buttonInvocationByPlanId,
      markdownTableWriter: this.#databaseMarkdownTableWriter,
      stableJson,
    };
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
    return createDatabaseCatalog(this.#catalogPort()).catalog(query);
  }

  /**
   * Cheap cache key for permission-scoped workspace-search projections.
   * Includes schema, record-index, and effective row/property policy state so
   * a cached record document can never outlive a permission change.
   */
  workspaceSearchRevision(): string {
    return createDatabaseCatalog(this.#catalogPort()).workspaceSearchRevision();
  }

  /**
   * Canonical record paths regardless of caller visibility. Workspace search
   * uses this only as an exclusion set so the ordinary Markdown page tier
   * cannot duplicate (or bypass permissions for) database records.
   */
  workspaceSearchRecordPaths(): readonly string[] {
    return createDatabaseCatalog(this.#catalogPort()).workspaceSearchRecordPaths();
  }

  catalogIfChanged(
    query?: string,
    ifCatalogRevision?: string,
  ): DatabaseCatalogResult | DatabaseCatalogNotModifiedResult {
    return createDatabaseCatalog(this.#catalogPort()).catalogIfChanged(query, ifCatalogRevision);
  }

  #describeCanonical(input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
  }): DatabaseDescribeResult {
    return createDatabaseReadProjection(this.#readProjectionPort()).describeCanonical(input);
  }

  describe(input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
    includeViews?: boolean;
  }): DatabaseDescribeResult {
    return createDatabaseReadProjection(this.#readProjectionPort()).describe(input);
  }

  describeIfChanged(input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
    ifSchemaRevision?: string;
  }): DatabaseDescribeResult | DatabaseDescribeNotModifiedResult {
    return createDatabaseReadProjection(this.#readProjectionPort()).describeIfChanged(input);
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
    return createDatabaseRetrieval(this.#retrievalPort()).semanticIndexStatus(input);
  }

  async rebuildSemanticIndex(input: {
    databaseId: string;
    sourceId: string;
  }): Promise<DatabaseSemanticIndexStatus> {
    return createDatabaseRetrieval(this.#retrievalPort()).rebuildSemanticIndex(input);
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
    return createDatabaseRetrieval(this.#retrievalPort()).retrieve(input);
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
    return createDatabaseReadProjection(this.#readProjectionPort()).record(input);
  }

  /**
   * Export either canonical Markdown files or a revision-stamped computed
   * snapshot. Computed exports are assembled from the same permission-scoped
   * query path as the UI/API and contain no owner marker, so they cannot be
   * mistaken for an importable database source.
   */
  exportMarkdownTable(input: DatabaseMarkdownTableExportInput): DatabaseMarkdownTableExport {
    return exportDatabaseMarkdownTable(
      {
        describeCanonical: this.#describeCanonical.bind(this),
        getV2CanonicalDocuments: this.#databaseRecordIndex.getV2CanonicalDocuments.bind(
          this.#databaseRecordIndex,
        ),
        query: this.query.bind(this),
        now: this.#now,
      },
      input,
    );
  }
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

  query(input: DatabaseDataPlaneQueryInput): DatabaseDataPlaneQueryResult {
    return executeDatabaseQuery(this.#queryExecutionPort(), input);
  }

  pack(input: DatabaseDataPlanePackInput): DatabaseContextPack {
    return createDatabaseContextPackCoordinator(this.#contextPackPort()).pack(input);
  }

  listContextInspections(
    scope?: DatabaseContextInspectionScope,
  ): readonly DatabaseContextInspectionSummary[] {
    return createDatabaseContextPackCoordinator(this.#contextPackPort()).listContextInspections(
      scope,
    );
  }

  getContextInspection(
    packId: string,
    scope?: DatabaseContextInspectionScope,
  ): DatabaseContextInspection {
    return createDatabaseContextPackCoordinator(this.#contextPackPort()).getContextInspection(
      packId,
      scope,
    );
  }

  getRecordIndexStatus(): DatabaseRecordIndexStatus {
    return createDatabaseContextPackCoordinator(this.#contextPackPort()).getRecordIndexStatus();
  }

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
    return createDatabaseContextPackCoordinator(
      this.#contextPackPort(),
    ).getRecordIndexIssuesSummary();
  }

  getSchemaRevisions(): ReadonlyArray<{
    databaseId: string;
    key: string;
    name: string;
    schemaRevision: string;
  }> {
    return createDatabaseContextPackCoordinator(this.#contextPackPort()).getSchemaRevisions();
  }

  #captureContextPack(pack: DatabaseContextPack): DatabaseContextPack {
    this.#contextInspector.capture(pack);
    recordDatabaseContextPackCapture({
      estimatedTokens: pack.budget.estimatedTokens,
      truncated: !pack.isComplete,
    });
    return pack;
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
    return createDatabasePlanMutationCoordinator(this.#planMutationPort()).createDraft(
      input,
      ttlSeconds,
    );
  }

  createDatabaseDeletionDraft(
    databaseId: string,
    expectedSnapshotRevision: string,
    ttlSeconds?: number,
  ): DatabaseDraftArtifact {
    return createDatabasePlanMutationCoordinator(
      this.#planMutationPort(),
    ).createDatabaseDeletionDraft(databaseId, expectedSnapshotRevision, ttlSeconds);
  }

  createVerificationDraft(
    input: unknown,
    actor: DatabaseRecordActor,
    ttlSeconds?: number,
  ): DatabaseVerificationDraftResult {
    return createDatabasePlanMutationCoordinator(this.#planMutationPort()).createVerificationDraft(
      input,
      actor,
      ttlSeconds,
    );
  }

  getDraft(draftId: string): DatabaseDraftArtifact {
    return createDatabasePlanMutationCoordinator(this.#planMutationPort()).getDraft(draftId);
  }

  discardDraft(draftId: string): { discarded: boolean; draftId: string } {
    return createDatabasePlanMutationCoordinator(this.#planMutationPort()).discardDraft(draftId);
  }

  createPlan(draftId: string, ttlSeconds?: number): DatabasePlanArtifact {
    return createDatabasePlanMutationCoordinator(this.#planMutationPort()).createPlan(
      draftId,
      ttlSeconds,
    );
  }

  getPlan(planId: string): DatabasePlanArtifact {
    return createDatabasePlanMutationCoordinator(this.#planMutationPort()).getPlan(planId);
  }

  restorePlanBundle(bundle: {
    plan: DatabasePlanArtifact;
    draft: DatabaseDraftArtifact;
  }): DatabasePlanArtifact {
    return createDatabasePlanMutationCoordinator(this.#planMutationPort()).restorePlanBundle(
      bundle,
    );
  }

  previewPropertyConversion(input: {
    databaseId: string;
    sourceId: string;
    propertyId: string;
    targetProperty: unknown;
    allowLossy?: boolean;
    ttlSeconds?: number;
  }): DatabasePropertyConversionPlanPreview {
    return createDatabasePlanMutationCoordinator(
      this.#planMutationPort(),
    ).previewPropertyConversion(input);
  }

  #formPolicyPort() {
    return {
      assertMutationAllowed: this.#assertMutationAllowed.bind(this),
      describeCanonical: this.#describeCanonical.bind(this),
      publicShare: () => this.#publicShare.getStore(),
      now: this.#now,
      formStateStore: this.#formStateStore,
      recordById: (recordId: string) => this.#databaseRecordIndex.getById(recordId) ?? undefined,
      query: (input: unknown) => this.query(input as DatabaseDataPlaneQueryInput),
      databaseDefinitionDraftBase,
      withTrustedMutation: <T>(operation: () => T): T =>
        this.#trustedFormMutation.run(true, operation),
      createDraft: this.createDraft.bind(this),
      createPlan: this.createPlan.bind(this),
      commit: this.commit.bind(this),
      publishFormAutomationEvent: this.#publishFormAutomationEvent.bind(this),
    };
  }

  async submitForm(input: DatabaseFormSubmissionInput): Promise<DatabaseFormSubmissionResult> {
    return submitDatabaseForm(this.#formPolicyPort(), input);
  }

  async authorizeFormUpload(input: {
    databaseId: string;
    sourceId: string;
    viewId: string;
    remoteAddress: string;
  }): Promise<DatabaseFormUploadAuthorization> {
    return authorizeDatabaseFormUpload(this.#formPolicyPort(), input);
  }
  createButtonPlan(input: DatabaseButtonPlanInput): DatabaseButtonPlan {
    return createDatabaseButtonCoordinator(this.#buttonPort()).createButtonPlan(input);
  }

  configureButtonExecutor(executor: DatabaseButtonExecutor): void {
    createDatabaseButtonCoordinator(this.#buttonPort()).configureButtonExecutor(executor);
  }

  async executeButton(
    input: DatabaseButtonExecutionInput,
  ): Promise<{ run: DatabaseButtonRun; undoToken: string | null }> {
    return createDatabaseButtonCoordinator(this.#buttonPort()).executeButton(input);
  }

  async listButtonRuns(limit = 100): Promise<DatabaseButtonRun[]> {
    return createDatabaseButtonCoordinator(this.#buttonPort()).listButtonRuns(limit);
  }

  configureCommitEngine(engine: DatabaseCommitEngine): void {
    createDatabaseCommitAutomationCoordinator(this.#commitAutomationPort()).configureCommitEngine(
      engine,
    );
  }

  configureAutomationEventPublisher(
    publisher: (input: EnqueueDatabaseAutomationEventInput) => Promise<unknown>,
  ): void {
    createDatabaseCommitAutomationCoordinator(
      this.#commitAutomationPort(),
    ).configureAutomationEventPublisher(publisher);
  }

  async #publishFormAutomationEvent(receipt: {
    id: string;
    databaseId: string;
    sourceId: string;
    viewId: string;
    recordId: string;
  }): Promise<void> {
    return createDatabaseCommitAutomationCoordinator(
      this.#commitAutomationPort(),
    ).publishFormAutomationEvent(receipt);
  }

  configureRepairEngine(engine: DatabaseRepairEngine): void {
    createDatabaseCommitAutomationCoordinator(this.#commitAutomationPort()).configureRepairEngine(
      engine,
    );
  }

  async previewRepair(
    ttlSeconds?: number,
    options?: DatabaseRepairPreviewOptions,
  ): Promise<DatabaseRepairPlan> {
    return createDatabaseCommitAutomationCoordinator(this.#commitAutomationPort()).previewRepair(
      ttlSeconds,
      options,
    );
  }

  async applyRepair(input: DatabaseRepairApplyInput): Promise<DatabaseRepairResult> {
    return createDatabaseCommitAutomationCoordinator(this.#commitAutomationPort()).applyRepair(
      input,
    );
  }

  async undoRepair(input: DatabaseRepairUndoInput): Promise<DatabaseRepairUndoResult> {
    return createDatabaseCommitAutomationCoordinator(this.#commitAutomationPort()).undoRepair(
      input,
    );
  }

  async commit(input: DatabaseCommitInput): Promise<DatabaseCommitResult> {
    return createDatabaseCommitAutomationCoordinator(this.#commitAutomationPort()).commit(input);
  }

  async mutateMarkdownTable(input: DatabaseMarkdownTableMutationRequest): Promise<unknown> {
    return createDatabaseCommitAutomationCoordinator(
      this.#commitAutomationPort(),
    ).mutateMarkdownTable(input);
  }

  async undo(input: DatabaseUndoInput): Promise<DatabaseUndoResult> {
    return createDatabaseCommitAutomationCoordinator(this.#commitAutomationPort()).undo(input);
  }

  /** Replace derived semantic state after a live provider/config change. */
  configureSemanticIndex(index: DatabaseSemanticIndex): void {
    this.#semanticIndex = index;
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
    if (!this.#allowLegacyV1Mutation) {
      const snapshot = this.#databaseStore.snapshot();
      const blocked = this.#v1MutationSources(plan, snapshot.databases);
      if (blocked.length > 0) {
        throw new DatabaseDataPlaneError(
          'storage_read_only',
          v1MigrationRequiredMessage('The selected source'),
          {
            databaseIds: [...new Set(blocked.map(({ databaseId }) => databaseId))],
            sourceIds: [...new Set(blocked.map(({ sourceId }) => sourceId))],
            migrationRequired: true,
          },
        );
      }
    }
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

  #v1MutationSources(
    plan: DatabasePlanArtifact,
    databases: readonly DatabaseDefinition[],
  ): Array<{ databaseId: string; sourceId: string }> {
    const mutatesCanonicalState = plan.normalizedOperations.some((operation) => {
      switch (operation.kind) {
        case 'ensure_database':
          return operation.action !== 'noop';
        case 'ensure_property':
        case 'ensure_relation':
        case 'ensure_view':
          return operation.action !== 'noop';
        case 'alter_schema':
          return operation.action !== 'noop';
        case 'upsert_records':
          return operation.created > 0 || operation.updated > 0;
        case 'mutate_record':
        case 'delete_records':
        case 'duplicate_records':
        case 'archive_records':
        case 'move_records':
        case 'delete_database':
          return true;
        default:
          return false;
      }
    });
    if (!mutatesCanonicalState) return [];
    const databaseIds =
      plan.affectedObjects.databaseIds.length > 0
        ? plan.affectedObjects.databaseIds
        : databases.map((database) => database.id);
    const sourceIds = new Set(plan.affectedObjects.sourceIds);
    return databases
      .filter((database) => databaseIds.includes(database.id) && isV1Database(database))
      .flatMap((database) =>
        database.sources
          .filter((source) => sourceIds.size === 0 || sourceIds.has(source.id))
          .map((source) => ({ databaseId: database.id, sourceId: source.id })),
      );
  }

  #assertReadable(): void {
    const migration = this.#isDatabaseMigrationActive();
    if (migration) {
      throw new DatabaseDataPlaneError(
        'transaction_in_progress',
        'Database migration is in progress; retry after the task reaches a committed or rolled-back state',
        { taskId: migration.taskId },
      );
    }
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

  #assertMutationAllowed(): void {
    const migration = this.#isDatabaseMigrationActive();
    if (migration) {
      throw new DatabaseDataPlaneError(
        'transaction_in_progress',
        'Database migration is in progress; retry after the task reaches a committed or rolled-back state',
        { taskId: migration.taskId },
      );
    }
    this.#assertReadable();
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
    return createDatabasePublicSharePolicy(this.#publicSharePort()).resolveAccess(policy, input);
  }
}

export function createDatabaseDataPlane(
  options: CreateDatabaseDataPlaneOptions,
): DatabaseDataPlane {
  return new DatabaseDataPlane(options);
}
