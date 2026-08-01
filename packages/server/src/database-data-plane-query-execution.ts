import { createHash } from 'node:crypto';
import {
  applyDatabaseLinkedViewSettings,
  buildDatabaseReverseRelationIndex,
  createDatabaseDerivedRevision,
  DATABASE_QUERY_SORT_SEMANTICS,
  type DatabaseConditionalColorResult,
  type DatabaseDefinition,
  type DatabaseFilter,
  type DatabaseQuery,
  DatabaseQueryError,
  DatabaseQuerySchema,
  type DatabaseRecord,
  type DatabaseSource,
  type DatabaseView,
  isRecordPathInSource,
  materializeDatabaseDerivedRecords,
  type ProjectedDatabaseRelationRecord,
  queryDatabaseRecords,
} from '@nedian0brien/synapsenote-core';
import type {
  AppliedDatabaseAgentView,
  AppliedDatabaseSavedQuery,
  DatabaseDataPlaneQueryInput,
  DatabaseDataPlaneQueryResult,
  DatabaseQueryExplainTrace,
  DatabaseQueryPermissionExclusions,
  DatabaseQueryResultState,
  ResolveDatabaseQueryAccess,
} from './database-data-plane.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import {
  collectDatabaseQueryPropertyIds,
  databaseFilterPropertyIds,
  scopeDatabaseQueryProjection,
} from './database-data-plane-query-filter.ts';
import {
  createDatabaseQueryDelta,
  createDatabaseQueryTrace,
} from './database-data-plane-query-trace.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';

interface QueryExecutionPort {
  assertReadable(): void;
  snapshot(): { revision: string; databases: readonly DatabaseDefinition[] };
  recordIndex: DatabaseRecordIndex;
  visibleViews(
    database: DatabaseDefinition,
    source: DatabaseSource,
    action: 'query' | 'aggregate' | 'pack_context',
  ): DatabaseView[];
  resolveQueryAccess: ResolveDatabaseQueryAccess;
  currentAccessPrincipal(): Parameters<ResolveDatabaseQueryAccess>[0]['principal'];
  derivedSnapshotCache: Map<string, readonly DatabaseRecord[]>;
  now(): Date;
  combineFilters(
    left: DatabaseFilter | undefined,
    right: DatabaseFilter | undefined,
  ): DatabaseFilter | undefined;
  appliedSavedQuery(view: DatabaseView): AppliedDatabaseSavedQuery;
  appliedAgentView(view: DatabaseView): AppliedDatabaseAgentView;
  conditionalColorPropertyIds(view: DatabaseView | null): string[];
  layoutPropertyIds(view: DatabaseView | null): string[];
  chartAggregate(view: DatabaseView): DatabaseQuery['aggregate'] | undefined;
  evaluateConditionalColors(input: {
    view: DatabaseView | null;
    source: DatabaseSource;
    records: readonly DatabaseRecord[];
    returnedRecordIds: readonly string[];
  }): DatabaseConditionalColorResult | undefined;
  databaseQueryId(
    databaseId: string,
    sourceId: string,
    query: DatabaseQuery,
    permissionScope: unknown,
  ): string;
  cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition;
  stableJson(value: unknown): string;
}

export function executeDatabaseQuery(
  port: QueryExecutionPort,
  input: DatabaseDataPlaneQueryInput,
): DatabaseDataPlaneQueryResult {
  port.assertReadable();
  const storeSnapshot = port.snapshot();
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

  const index = port.recordIndex.status();
  if (index.state === 'error') {
    throw new DatabaseDataPlaneError('index_unavailable', 'Database record index is unavailable', {
      indexState: index.state,
      lastError: index.lastError,
    });
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
  const visibleViews = port.visibleViews(
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
  const savedQuery = view ? port.appliedSavedQuery(view) : null;
  const agentView =
    view?.layout.type === 'agent' && view.agent ? port.appliedAgentView(view) : null;
  const colorPropertyIds = port.conditionalColorPropertyIds(view);
  const visualPropertyIds = port.layoutPropertyIds(view);
  if (agentView && view) {
    const projected = new Set(view.projection.propertyIds);
    const requestedDependencies = [
      ...databaseFilterPropertyIds(requestedQuery.where),
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
          where: port.combineFilters(view.where, requestedQuery.where),
          sort: requestedQuery.sort.length > 0 ? requestedQuery.sort : view.sort,
          select: requestedQuery.select ?? [
            ...new Set([...view.projection.propertyIds, ...visualPropertyIds]),
          ],
          aggregate:
            requestedQuery.aggregate ??
            (view.layout.type === 'chart'
              ? port.chartAggregate(view)
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
  const access = port.resolveQueryAccess({
    action: parsedQuery.aggregate ? 'aggregate' : 'query',
    database: port.cloneDefinition(database),
    source: structuredClone(source),
    query: structuredClone(parsedQuery),
    view: view ? structuredClone(view) : null,
    principal: port.currentAccessPrincipal(),
  });
  if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
    throw new Error('Database query access resolver returned an invalid policy identity');
  }
  // Typed queries, derived properties, colors, and relation projections use
  // frontmatter only. Canonical bodies stay in the index and are disclosed
  // separately only by evidence/full-body retrieval paths.
  const allDatabaseRecords = port.recordIndex.list(database.id, undefined, {
    includeBody: false,
  });
  const allRecords = allDatabaseRecords.filter((record) => record.sourceId === source.id);
  const allRecordIds = new Set(allRecords.map((record) => record.id));
  const allowedRecordIds =
    access.allowedRecordIds === null
      ? allRecordIds
      : new Set(access.allowedRecordIds.filter((recordId) => allRecordIds.has(recordId)));
  const queryProperties = collectDatabaseQueryPropertyIds({
    query: parsedQuery,
    colorPropertyIds,
    visualPropertyIds,
  });
  const { allPropertyIds, allowedPropertyIds, selectedPropertyIds, scopedQuery } =
    scopeDatabaseQueryProjection({
      source,
      query: parsedQuery,
      requestedPropertyIds: queryProperties.requested,
      dependencyPropertyIds: queryProperties.dependencies,
      access,
    });
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
      const titleProperty = targetSource?.properties.find((property) => property.type === 'title');
      if (!targetSource || !titleProperty) {
        relationAccess.set(targetSourceId, null);
        return null;
      }
      const targetRecords = port.recordIndex.list(database.id, targetSource.id);
      const targetRecordIds = new Set(targetRecords.map((record) => record.id));
      const targetPropertyIds = new Set(targetSource.properties.map((property) => property.id));
      const targetQuery = DatabaseQuerySchema.parse({
        select: targetSource.properties.map((property) => property.id),
      });
      const targetPolicy = port.resolveQueryAccess({
        action: 'expand_relation',
        database: port.cloneDefinition(database),
        source: structuredClone(targetSource),
        query: structuredClone(targetQuery),
        view: null,
        principal: port.currentAccessPrincipal(),
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
    source.properties.some((property) => property.type === 'formula' || property.type === 'rollup')
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
  const queryId = port.databaseQueryId(database.id, source.id, scopedQuery, permissionScope);
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
      : `sha256:${createHash('sha256').update(port.stableJson(permissionScope)).digest('hex')}`;
  const relationIndex =
    computedPropertyIds.length === 0
      ? null
      : buildDatabaseReverseRelationIndex(database, allDatabaseRecords);
  const derivedRevision =
    computedPropertyIds.length === 0
      ? null
      : createDatabaseDerivedRevision({
          manifestRevision: storeSnapshot.revision,
          tableRevisions: { [database.id]: index.revision },
          dependencyRevision: relationIndex?.revision ?? 'sha256:empty',
          permissionRevision: derivedPermissionRevision ?? 'sha256:empty',
          evaluationRevision:
            index.lastIncrementalAt ?? index.lastRebuiltAt ?? '1970-01-01T00:00:00.000Z',
        });
  const derivedCacheKey =
    derivedPermissionRevision === null
      ? null
      : `drv_${createHash('sha256')
          .update(
            port.stableJson({
              databaseId: database.id,
              indexRevision: index.revision,
              manifestRevision: storeSnapshot.revision,
              permissionRevision: derivedPermissionRevision,
              derivedRevision,
              evaluatedAt:
                index.lastIncrementalAt ?? index.lastRebuiltAt ?? '1970-01-01T00:00:00.000Z',
            }),
          )
          .digest('hex')}`;
  let derivedCache: DatabaseQueryExplainTrace['derivedIndex']['cache'] = 'not_applicable';
  let derivedRecords: readonly DatabaseRecord[] = allDatabaseRecords;
  if (derivedCacheKey && derivedPermissionRevision) {
    const cached = port.derivedSnapshotCache.get(derivedCacheKey);
    if (cached) {
      derivedCache = 'hit';
      port.derivedSnapshotCache.delete(derivedCacheKey);
      port.derivedSnapshotCache.set(derivedCacheKey, cached);
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
      port.derivedSnapshotCache.set(derivedCacheKey, derivedRecords);
      while (port.derivedSnapshotCache.size > 32) {
        const oldest = port.derivedSnapshotCache.keys().next().value;
        if (oldest === undefined) break;
        port.derivedSnapshotCache.delete(oldest);
      }
    }
  }
  const verificationTime = new Date(port.now().getTime());
  verificationTime.setUTCSeconds(0, 0);
  const result = queryDatabaseRecords({
    source,
    records: derivedRecords.filter(
      (record) => record.sourceId === source.id && allowedRecordIds.has(record.id),
    ),
    storageRevision:
      source.storage?.kind === 'markdown_table'
        ? port.recordIndex.getStorageRevision(database.id, source.id)
        : undefined,
    ...(derivedRevision !== null ? { derivedRevision } : { derivedRevision: null }),
    people: database.people,
    resolveFileAvailability: (path) => port.recordIndex.fileAvailability(path),
    resolveRelationRecord,
    query: scopedQuery,
    verificationTime,
    ...(input.throwIfCancelled ? { throwIfCancelled: input.throwIfCancelled } : {}),
    snapshotRevision: `sha256:${createHash('sha256')
      .update(
        port.stableJson({
          indexRevision: index.revision,
          permissionScope,
          sortSemanticsVersion: DATABASE_QUERY_SORT_SEMANTICS.version,
          verificationAsOf: verificationTime.toISOString(),
        }),
      )
      .digest('hex')}`,
  });
  const conditionalColors = port.evaluateConditionalColors({
    view,
    source,
    records: derivedRecords,
    returnedRecordIds: result.records.map((record) => record.id),
  });
  const sourceIssueCount = port.recordIndex
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
  const trace = createDatabaseQueryTrace({
    databaseId: database.id,
    sourceId: source.id,
    savedQuery,
    agentView,
    query: parsedQuery,
    requestedPropertyIds: requestedProjection,
    selectedPropertyIds,
    allowedPropertyIds,
    result,
    permission: permissionExclusions,
    index,
    issueCount: sourceIssueCount,
    derivedIndex: {
      propertyIds: computedPropertyIds,
      cache: derivedCache,
      permissionRevision: derivedPermissionRevision,
      revision: derivedRevision,
    },
  });
  const { recordRevisions, delta } = createDatabaseQueryDelta({
    result,
    deltaSince: input.deltaSince,
  });
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
