import {
  type DatabaseAccessPrincipal,
  type DatabaseDefinition,
  type DatabaseQuery,
  DatabaseQueryError,
  DatabaseQuerySchema,
  type DatabaseRecord,
  type DatabaseSource,
  type DatabaseView,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseDataPlaneLexicalSearchResult,
  DatabaseDataPlaneRetrievalResult,
  DatabaseQueryAccessDecision,
  DatabaseQueryPermissionExclusions,
  DatabaseRetrievalMode,
} from './database-data-plane.ts';
import { DatabaseDataPlaneError } from './database-data-plane-errors.ts';
import type { DatabaseDescribeResult } from './database-data-plane-read-projection.ts';
import type { DatabaseRecordIndex } from './database-record-index.ts';
import {
  type DatabaseSemanticIndex,
  type DatabaseSemanticIndexStatus,
  fuseDatabaseRetrieval,
} from './database-semantic-index.ts';

interface RetrievalPort {
  describeCanonical(input: {
    databaseId?: string;
    databaseKey?: string;
    sourceId?: string;
  }): DatabaseDescribeResult;
  resolveQueryAccess(input: {
    action: 'search';
    database: DatabaseDefinition;
    source: DatabaseSource;
    query: DatabaseQuery;
    view: DatabaseView | null;
    principal: DatabaseAccessPrincipal;
  }): DatabaseQueryAccessDecision;
  currentAccessPrincipal(): DatabaseAccessPrincipal;
  recordIndex: Pick<DatabaseRecordIndex, 'list'>;
  semanticIndex: DatabaseSemanticIndex;
  searchTextWithAccess(
    input: Parameters<DatabaseRecordIndex['searchText']>[0],
    query: unknown,
  ): DatabaseDataPlaneLexicalSearchResult;
  projectSemanticIndexStatus(
    status: DatabaseSemanticIndexStatus,
    source: DatabaseSource,
    records: readonly DatabaseRecord[],
    access: DatabaseQueryAccessDecision,
  ): DatabaseSemanticIndexStatus;
}

function cloneDefinition(definition: DatabaseDefinition): DatabaseDefinition {
  return structuredClone(definition);
}

export function createDatabaseRetrieval(port: RetrievalPort) {
  const semanticIndexStatus = (input: {
    databaseId: string;
    sourceId: string;
  }): DatabaseSemanticIndexStatus => {
    const described = port.describeCanonical(input);
    if (!described.source) {
      throw new DatabaseDataPlaneError('source_not_found', 'Data source was not found', input);
    }
    const status = port.semanticIndex.status(
      {
        databaseId: described.database.id,
        sourceId: described.source.id,
        schemaRevision: described.schemaRevision,
        indexRevision: described.index.revision,
      },
      described.source,
    );
    const access = port.resolveQueryAccess({
      action: 'search',
      database: cloneDefinition(described.database),
      source: structuredClone(described.source),
      query: DatabaseQuerySchema.parse({ select: status.propertyIds }),
      view: null,
      principal: port.currentAccessPrincipal(),
    });
    if (access.allowed === false) {
      throw new DatabaseDataPlaneError(
        'permission_denied',
        'Semantic index status is outside the effective read scope',
        { policyId: access.policyId, policyRevision: access.policyRevision },
      );
    }
    const records = port.recordIndex.list(described.database.id, described.source.id);
    return port.projectSemanticIndexStatus(status, described.source, records, access);
  };

  const rebuildSemanticIndex = async (input: {
    databaseId: string;
    sourceId: string;
  }): Promise<DatabaseSemanticIndexStatus> => {
    const described = port.describeCanonical(input);
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
    const current = port.semanticIndex.status(
      {
        databaseId: described.database.id,
        sourceId: described.source.id,
        schemaRevision: described.schemaRevision,
        indexRevision: described.index.revision,
      },
      described.source,
    );
    const access = port.resolveQueryAccess({
      action: 'search',
      database: cloneDefinition(described.database),
      source: structuredClone(described.source),
      query: DatabaseQuerySchema.parse({ select: current.propertyIds }),
      view: null,
      principal: port.currentAccessPrincipal(),
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
    return port.semanticIndex.rebuild({
      identity: {
        databaseId: described.database.id,
        sourceId: described.source.id,
        schemaRevision: described.schemaRevision,
        indexRevision: described.index.revision,
      },
      source: described.source,
      records: port.recordIndex.list(described.database.id, described.source.id),
    });
  };

  return {
    semanticIndexStatus,
    rebuildSemanticIndex,
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
      const described = port.describeCanonical(input);
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
      const accessQuery = DatabaseQuerySchema.parse({ select: searchablePropertyIds });
      const access = port.resolveQueryAccess({
        action: 'search',
        database: cloneDefinition(described.database),
        source: structuredClone(source),
        query: structuredClone(accessQuery),
        view: null,
        principal: port.currentAccessPrincipal(),
      });
      if (access.policyId.trim() === '' || !/^sha256:[a-f0-9]{64}$/.test(access.policyRevision)) {
        throw new Error('Database query access resolver returned an invalid policy identity');
      }
      const records = port.recordIndex.list(described.database.id, source.id);
      const allRecordIds = new Set(records.map(({ id }) => id));
      const allPropertyIds = new Set(source.properties.map(({ id }) => id));
      const allowedRecordIds =
        access.allowedRecordIds === null
          ? allRecordIds
          : new Set(access.allowedRecordIds.filter((recordId) => allRecordIds.has(recordId)));
      const allowedPropertyIds =
        access.allowedPropertyIds === null
          ? allPropertyIds
          : new Set(
              access.allowedPropertyIds.filter((propertyId) => allPropertyIds.has(propertyId)),
            );
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
        throw new DatabaseQueryError(
          'unknown_property',
          'Retrieval property is not in the source',
          {
            unknownPropertyIds: unavailablePropertyIds,
            candidates: source.properties
              .filter((property) => allowedPropertyIds.has(property.id))
              .map(({ id, key, name }) => ({ id, key, name })),
          },
        );
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
      let semanticIndex = port.semanticIndex.status(identity, source);
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
          semanticIndex = await rebuildSemanticIndex(input);
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
          : port.searchTextWithAccess(
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
          ? await port.semanticIndex.search({
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
        semanticIndex: port.projectSemanticIndexStatus(semanticIndex, source, records, access),
        permissionExclusions,
      };
    },
  };
}
