import { createHash } from 'node:crypto';
import {
  compileFormulaSource,
  type DatabaseAccessPrincipal,
  type DatabaseDefinition,
  type DatabaseProperty,
  DatabasePropertySchema,
  type DatabaseQuery,
  DatabaseQuerySchema,
  type DatabaseRecord,
  type DatabaseSource,
  type DatabaseView,
  type FormulaComputedResult,
  formulaErrorResult,
  materializeDatabaseDerivedRecords,
} from '@nedian0brien/synapsenote-core';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import type { DatabaseRecordIndexStatus } from './database-record-index.ts';

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

interface ComputedPreviewAccessDecision {
  allowed?: boolean;
  policyId: string;
  policyRevision: string;
  allowedRecordIds: readonly string[] | null;
  allowedPropertyIds: readonly string[] | null;
}

export interface DatabaseComputedPropertyPreviewPort {
  describeCanonical(input: { databaseId: string; sourceId: string }): {
    manifestRevision: string;
    database: DatabaseDefinition;
    source: DatabaseSource | null;
    index: DatabaseRecordIndexStatus;
  };
  listRecords(databaseId: string, sourceId: string): readonly DatabaseRecord[];
  resolveQueryAccess(input: {
    action: 'describe';
    database: DatabaseDefinition;
    source: DatabaseSource;
    query: DatabaseQuery;
    view: DatabaseView | null;
    principal: DatabaseAccessPrincipal;
  }): ComputedPreviewAccessDecision;
  currentAccessPrincipal(): DatabaseAccessPrincipal;
}

export interface DatabaseComputedPropertyPreviewInput {
  databaseId: string;
  sourceId: string;
  recordId: string;
  property: Extract<DatabaseProperty, { type: 'formula' | 'rollup' }>;
}

function cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition {
  return structuredClone(definition);
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

/** Executes one permission-scoped Formula or Rollup preview against canonical records. */
export function previewDatabaseComputedProperty(
  port: DatabaseComputedPropertyPreviewPort,
  input: DatabaseComputedPropertyPreviewInput,
): DatabaseComputedPropertyPreviewResult {
  const described = port.describeCanonical({
    databaseId: input.databaseId,
    sourceId: input.sourceId,
  });
  const source = described.source;
  if (!source) {
    throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', {
      databaseId: input.databaseId,
      sourceId: input.sourceId,
      recordId: input.recordId,
      propertyId: input.property.id,
    });
  }
  const index = described.index;
  if (index.state === 'error') {
    throw new DatabaseDataPlaneError('index_unavailable', 'Database record index is unavailable', {
      indexState: index.state,
      lastError: index.lastError,
    });
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
    port.listRecords(candidate.id, candidateSource.id),
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
    const access = port.resolveQueryAccess({
      action: 'describe',
      database: cloneDefinition(candidate),
      source: structuredClone(candidateSource),
      query,
      view: null,
      principal: port.currentAccessPrincipal(),
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
  const evaluatedAt = index.lastIncrementalAt ?? index.lastRebuiltAt ?? '1970-01-01T00:00:00.000Z';
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
