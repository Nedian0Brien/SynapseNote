import {
  type DatabaseAccessPrincipal,
  type DatabaseDefinition,
  type DatabaseQuery,
  DatabaseQuerySchema,
  type DatabaseRecord,
  type DatabaseSource,
  DatabaseVerificationValueSchema,
  type DatabaseView,
  projectDatabaseVerification,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseContextInspector } from './database-context-inspector.ts';
import {
  createDatabaseContextPack,
  type DatabaseContextPack,
  type DatabaseContextPackDependencies,
  type DatabaseContextPackInput,
} from './database-context-pack.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import {
  DATABASE_LEXICAL_MAX_HITS,
  DATABASE_LEXICAL_MAX_TERMS,
  DatabaseLexicalSearchLimitError,
  type DatabaseLexicalSearchResult,
  type DatabaseRecordIndex,
} from './database-record-index.ts';
import { recordDatabaseContextPackCapture } from './database-telemetry.ts';

interface AccessDecision {
  allowed?: boolean;
  policyId: string;
  policyRevision: string;
  allowedRecordIds: readonly string[] | null;
  allowedPropertyIds: readonly string[] | null;
  allowBody?: boolean;
}

export interface DatabaseContextSearchProjectionResult extends DatabaseLexicalSearchResult {
  permissionExclusions: {
    evaluated: true;
    policyId: string;
    policyRevision: string;
    records: number;
    properties: number;
    body?: boolean;
  };
  resultState: {
    empty: boolean;
    emptyReason: 'no_match' | 'permission_filtered' | null;
    permissionFiltered: boolean;
    truncated: boolean;
  };
}

export interface DatabaseContextSearchProjectionPort {
  assertReadable(): void;
  snapshot(): { databases: readonly DatabaseDefinition[] };
  recordIndex: Pick<DatabaseRecordIndex, 'getById' | 'list' | 'searchText'>;
  resolveQueryAccess(input: {
    action: 'search' | 'pack_context';
    database: DatabaseDefinition;
    source: DatabaseSource;
    query: DatabaseQuery;
    view: DatabaseView | null;
    principal: DatabaseAccessPrincipal;
  }): AccessDecision;
  currentAccessPrincipal(): DatabaseAccessPrincipal;
  now(): Date;
  describeCanonical: DatabaseContextPackDependencies['describe'];
  query(
    input: Parameters<DatabaseContextPackDependencies['query']>[0] & {
      throwIfCancelled?: () => void;
    },
  ): ReturnType<DatabaseContextPackDependencies['query']>;
  contextInspector: Pick<DatabaseContextInspector, 'capture'>;
}

function cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition {
  return structuredClone(definition);
}

/**
 * Owns the permission-scoped read paths that feed context packs: lexical
 * retrieval, record projection/redaction, pack construction, and auditing.
 */
export function createDatabaseContextSearchProjection(port: DatabaseContextSearchProjectionPort) {
  const searchTextWithAccess = (
    input: Parameters<DatabaseRecordIndex['searchText']>[0],
    query: unknown,
  ): DatabaseContextSearchProjectionResult => {
    port.assertReadable();
    const snapshot = port.snapshot();
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
    const access = port.resolveQueryAccess({
      action: 'search',
      database: cloneDefinition(database),
      source: structuredClone(source),
      query: structuredClone(parsedQuery),
      view: null,
      principal: port.currentAccessPrincipal(),
    });
    if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
      throw new Error('Database query access resolver returned an invalid policy identity');
    }
    const records = port.recordIndex.list(database.id, source.id);
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
    const permissionExclusions = {
      evaluated: true as const,
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
    const verificationTime = new Date(port.now().getTime());
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
      result = port.recordIndex.searchText({
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
  };

  const getContextRecord = (recordId: string) => {
    port.assertReadable();
    const record = port.recordIndex.getById(recordId);
    if (!record) {
      return { record: null, deniedRecord: false, deniedPropertyIds: [], deniedBody: false };
    }
    const database = port
      .snapshot()
      .databases.find((candidate) => candidate.id === record.databaseId);
    const source = database?.sources.find((candidate) => candidate.id === record.sourceId);
    if (!database || !source) {
      return { record: null, deniedRecord: false, deniedPropertyIds: [], deniedBody: false };
    }
    const query = DatabaseQuerySchema.parse({
      select: source.properties.map((property) => property.id),
      page: { limit: 1 },
    });
    const access = port.resolveQueryAccess({
      action: 'pack_context',
      database: cloneDefinition(database),
      source: structuredClone(source),
      query,
      view: null,
      principal: port.currentAccessPrincipal(),
    });
    if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
      throw new Error('Database query access resolver returned an invalid policy identity');
    }
    if (access.allowedRecordIds !== null && !access.allowedRecordIds.includes(record.id)) {
      return { record: null, deniedRecord: true, deniedPropertyIds: [], deniedBody: false };
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
  };

  return {
    captureContextPack(pack: DatabaseContextPack): DatabaseContextPack {
      port.contextInspector.capture(pack);
      recordDatabaseContextPackCapture({
        estimatedTokens: pack.budget.estimatedTokens,
        truncated: !pack.isComplete,
      });
      return pack;
    },
    createContextPack(input: DatabaseContextPackInput): DatabaseContextPack {
      return createDatabaseContextPack(
        {
          describe: port.describeCanonical,
          query: (request) =>
            port.query({
              ...request,
              ...(input.throwIfCancelled ? { throwIfCancelled: input.throwIfCancelled } : {}),
            }),
          searchText: (request) =>
            searchTextWithAccess(request, {
              ...(input.query?.where ? { where: input.query.where } : {}),
              sort: input.query?.sort ?? [],
              select: [...request.propertyIds],
            }),
          getRecord: getContextRecord,
        },
        input,
      );
    },
    searchTextWithAccess,
    getContextRecord,
  };
}
