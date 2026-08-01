import { createHash } from 'node:crypto';
import {
  DATABASE_QUERY_SORT_SEMANTICS,
  type DatabaseQuery,
  type DatabaseQueryResult,
} from '@nedian0brien/synapsenote-core';
import type {
  AppliedDatabaseAgentView,
  AppliedDatabaseSavedQuery,
  DatabaseQueryDelta,
  DatabaseQueryExplainTrace,
  DatabaseQueryPermissionExclusions,
} from './database-data-plane-contracts.ts';
import { databaseFilterPropertyIds } from './database-data-plane-query-filter.ts';
import type { DatabaseRecordIndexStatus } from './database-record-index.ts';

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

export function createDatabaseQueryTrace(input: {
  databaseId: string;
  sourceId: string;
  savedQuery: AppliedDatabaseSavedQuery | null;
  agentView: AppliedDatabaseAgentView | null;
  query: DatabaseQuery;
  requestedPropertyIds: readonly string[];
  selectedPropertyIds: readonly string[];
  allowedPropertyIds: ReadonlySet<string>;
  result: DatabaseQueryResult;
  permission: DatabaseQueryPermissionExclusions;
  index: Pick<DatabaseRecordIndexStatus, 'revision' | 'state'>;
  issueCount: number;
  derivedIndex: DatabaseQueryExplainTrace['derivedIndex'];
}): DatabaseQueryExplainTrace {
  return {
    source: { databaseId: input.databaseId, sourceId: input.sourceId },
    savedQuery: input.savedQuery,
    agentView: input.agentView,
    filter: {
      expression: input.query.where ? structuredClone(input.query.where) : null,
      propertyIds: [...new Set(databaseFilterPropertyIds(input.query.where))],
    },
    ranking: {
      strategy: 'typed_sort_then_record_id',
      sort: structuredClone(input.query.sort),
      semantics: DATABASE_QUERY_SORT_SEMANTICS,
      tieBreakers: ['record_id'],
    },
    projection: {
      requestedPropertyIds: [...input.requestedPropertyIds],
      returnedPropertyIds: [...input.selectedPropertyIds],
      excludedPropertyIds: input.requestedPropertyIds.filter(
        (propertyId) => !input.allowedPropertyIds.has(propertyId),
      ),
    },
    aggregation: {
      requested: input.query.aggregate ? structuredClone(input.query.aggregate) : null,
      appliedAfterPermissionScope: true,
      matched: input.result.aggregation?.matched ?? input.result.matched,
      totalGroups: input.result.aggregation?.totalGroups ?? 0,
      returnedGroups: input.result.aggregation?.returnedGroups ?? 0,
      truncatedBy: input.result.aggregation?.truncatedBy ?? null,
    },
    permission: input.permission,
    index: {
      revision: input.index.revision,
      state: input.index.state,
      freshness: 'snapshot',
      issueCount: input.issueCount,
    },
    derivedIndex: input.derivedIndex,
    truncation: {
      cause: input.result.truncatedBy,
      limit: input.query.page.limit,
      cursorProvided: input.query.page.cursor !== undefined,
      nextCursor: input.result.nextCursor,
    },
  };
}

export function createDatabaseQueryDelta(input: {
  result: DatabaseQueryResult;
  deltaSince?: {
    queryId: string;
    recordRevisions: Readonly<Record<string, string | null>>;
    isComplete: boolean;
  };
}): {
  recordRevisions: Readonly<Record<string, string>>;
  delta: DatabaseQueryDelta | null;
} {
  const recordRevisions = Object.fromEntries(
    input.result.records.map((record) => [
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
          input.deltaSince.isComplete && input.result.isComplete ? absent : ([] as string[]),
        absentFromPageRecordIds:
          input.deltaSince.isComplete && input.result.isComplete ? ([] as string[]) : absent,
        isComplete: input.deltaSince.isComplete && input.result.isComplete,
      }
    : null;
  return { recordRevisions, delta };
}
