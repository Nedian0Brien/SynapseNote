import { createHash } from 'node:crypto';
import {
  DATABASE_STORAGE_CAPABILITY_MATRIX,
  type DatabaseAccessPrincipal,
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  type DatabasePublicSharePolicy,
  type DatabaseQuery,
  DatabaseQuerySchema,
  type DatabaseRecord,
  type DatabaseSource,
  type DatabaseStorageCapability,
  type DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import type { DatabaseRecordIndexStatus } from './database-record-index.ts';

export interface DatabaseDescribeResult {
  manifestRevision: string;
  schemaRevision: string;
  database: DatabaseDefinition;
  source: DatabaseSource | null;
  index: DatabaseRecordIndexStatus;
  storageCapabilities: readonly DatabaseStorageCapability[];
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
  record: Pick<
    DatabaseRecord,
    | 'id'
    | 'path'
    | 'revision'
    | 'values'
    | 'invalidValues'
    | 'issues'
    | 'archivedAt'
    | 'semanticRevisions'
  >;
}

interface AccessDecision {
  allowed?: boolean;
  policyId: string;
  policyRevision: string;
  allowedPropertyIds: readonly string[] | null;
}

interface ReadProjectionPort {
  assertReadable(): void;
  snapshot(): { revision: string; databases: readonly DatabaseDefinition[] };
  indexStatus(): DatabaseRecordIndexStatus;
  resolveQueryAccess(input: {
    action: 'describe';
    database: DatabaseDefinition;
    source: DatabaseSource;
    query: DatabaseQuery;
    view: DatabaseView | null;
    principal: DatabaseAccessPrincipal;
  }): AccessDecision;
  currentAccessPrincipal(): DatabaseAccessPrincipal;
  catalog(): readonly {
    id: string;
    key: string;
    name: string;
    sources: readonly { id: string; key: string; name: string }[];
  }[];
  publicShare(): DatabasePublicSharePolicy | undefined;
  getContextRecord(recordId: string): {
    record: DatabaseRecord | null;
    deniedRecord: boolean;
  };
}

function cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition {
  return structuredClone(definition);
}

function schemaRevision(definition: DatabaseDefinition): string {
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

export function createDatabaseReadProjection(port: ReadProjectionPort) {
  const describeCanonical = (input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
  }): DatabaseDescribeResult => {
    port.assertReadable();
    const snapshot = port.snapshot();
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
      schemaRevision: schemaRevision(database),
      database: cloneDefinition(database),
      source: source ? structuredClone(source) : null,
      index: port.indexStatus(),
      storageCapabilities: DATABASE_STORAGE_CAPABILITY_MATRIX,
      allowedOperations: ['catalog', 'describe', 'find', 'query', 'pack'],
    };
  };

  const describe = (input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
    includeViews?: boolean;
  }): DatabaseDescribeResult => {
    port.assertReadable();
    const snapshot = port.snapshot();
    const database = snapshot.databases.find(
      (candidate) =>
        (input.databaseId !== undefined && candidate.id === input.databaseId) ||
        (input.databaseKey !== undefined && candidate.key === input.databaseKey),
    );
    if (!database) {
      throw new DatabaseDataPlaneError('database_not_found', 'Database was not found', {
        databaseId: input.databaseId,
        databaseKey: input.databaseKey,
        candidates: port.catalog().map(({ id, key, name }) => ({ id, key, name })),
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
      const access = port.resolveQueryAccess({
        action: 'describe',
        database: cloneDefinition(database),
        source: structuredClone(source),
        query: structuredClone(query),
        view: null,
        principal: port.currentAccessPrincipal(),
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
            port
              .catalog()
              .find((candidate) => candidate.id === database.id)
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
            canonicalSchemaRevision: schemaRevision(database),
            receipts,
            projection,
          }),
        )
        .digest('hex')}`;
    if (
      projectedSources.length === database.sources.length &&
      receipts.every(({ allowedPropertyIds }) => allowedPropertyIds === null)
    ) {
      const canonical = describeCanonical(input);
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
        const policy = port.publicShare();
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
            const access = port.resolveQueryAccess({
              action: 'describe',
              database: cloneDefinition(database),
              source: structuredClone(source),
              query: structuredClone(query),
              view: structuredClone(view),
              principal: port.currentAccessPrincipal(),
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
      index: port.indexStatus(),
      storageCapabilities: DATABASE_STORAGE_CAPABILITY_MATRIX,
      allowedOperations: ['catalog', 'describe', 'find', 'query', 'pack'],
    };
  };

  return {
    describeCanonical,
    describe,
    describeIfChanged(input: {
      databaseId?: string;
      databaseKey?: string;
      sourceId?: string;
      ifSchemaRevision?: string;
    }): DatabaseDescribeResult | DatabaseDescribeNotModifiedResult {
      const described = describe(input);
      if (input.ifSchemaRevision !== described.schemaRevision) return described;
      return {
        notModified: true,
        manifestRevision: described.manifestRevision,
        schemaRevision: described.schemaRevision,
        databaseId: described.database.id,
        sourceId: described.source?.id ?? null,
      };
    },
    record(input: {
      databaseId: string;
      sourceId: string;
      recordId: string;
    }): DatabaseRecordLookupResult {
      const described = describeCanonical({
        databaseId: input.databaseId,
        sourceId: input.sourceId,
      });
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
      const access = port.getContextRecord(input.recordId);
      if (access.deniedRecord) {
        throw new DatabaseDataPlaneError('permission_denied', 'Record access is denied', input);
      }
      const record = access.record;
      if (!record || record.databaseId !== input.databaseId || record.sourceId !== input.sourceId) {
        throw new DatabaseDataPlaneError(
          'record_not_found',
          'Database record was not found',
          input,
        );
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
          ...(record.semanticRevisions
            ? { semanticRevisions: structuredClone(record.semanticRevisions) }
            : {}),
          values: structuredClone(record.values),
          ...(record.invalidValues ? { invalidValues: structuredClone(record.invalidValues) } : {}),
          ...(record.issues ? { issues: structuredClone(record.issues) } : {}),
          ...(record.archivedAt ? { archivedAt: record.archivedAt } : {}),
        },
      };
    },
  };
}
