import { createHash } from 'node:crypto';
import type {
  DatabaseDefinition,
  DatabaseFileAvailability,
  DatabaseFileValue,
  DatabaseProperty,
  DatabaseQuery,
  DatabaseQueryResult,
  DatabaseRecord,
  DatabaseRichTextReference,
  DatabaseSource,
  DatabaseValue,
  DatabaseVerificationProjection,
  DatabaseView,
  ProjectedDatabasePerson,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseLexicalEvidence,
  DatabaseLexicalSearchInput,
  DatabaseLexicalSearchResult,
} from './database-record-index.ts';

export type DatabaseContextPackTokenizer = 'utf8_bytes_div3' | 'utf8_bytes_div2';
export type DatabaseContextPackEncoding = 'object_rows' | 'columnar_dictionary';

export interface DatabaseRelationProjection {
  sourceId: string;
  propertyIds: readonly string[];
}

export interface DatabaseRelationExpansionInput {
  /** Number of relation edges traversed from each returned root record. */
  maxDepth: number;
  /** Hard cap across all deduplicated related records in one pack page. */
  maxRecords: number;
  /** Hard cap for each record/property relation fan-out. */
  maxRecordsPerRelation: number;
  /** Target-source projections; omitted sources default to their title property. */
  projections?: readonly DatabaseRelationProjection[];
}

export interface DatabaseContextPackAgentView {
  id: string;
  key: string;
  name: string;
  revision: string;
  semanticContract: NonNullable<DatabaseView['agent']>['semanticContract'];
  scope: NonNullable<DatabaseView['agent']>['scope'];
  readPolicy: NonNullable<DatabaseView['agent']>['readPolicy'];
  writePolicy: NonNullable<DatabaseView['agent']>['writePolicy'];
}

export interface DatabaseContextPackRetrieval {
  query: {
    filter: DatabaseQuery['where'] | null;
    sort: DatabaseQuery['sort'];
    includeArchived: boolean;
  };
  filters: {
    propertyIds: readonly string[];
  };
  ranking: {
    strategy: 'typed_sort_then_created_at_then_record_id';
    sort: DatabaseQuery['sort'];
    tieBreakers: readonly ['created_at', 'record_id'];
  };
  projection: {
    requestedPropertyIds: readonly string[];
    returnedPropertyIds: readonly string[];
    omittedPropertyIds: readonly string[];
  };
  result: {
    matched: number;
    returned: number;
    omittedRecords: number;
    complete: boolean;
    continuationAvailable: boolean;
  };
  permission: {
    evaluated: boolean;
    policyId: string;
    policyRevision: string;
    records: number;
    properties: number;
    body?: boolean;
  } | null;
  evidence: {
    mode: 'records' | 'evidence' | 'full_body';
    searchText: string | null;
    matched: number;
    returned: number;
  };
}

export interface DatabaseContextPackInput {
  databaseId: string;
  sourceId: string;
  goal: string;
  query?: Omit<DatabaseQuery, 'page' | 'aggregate'>;
  propertyIds?: readonly string[];
  maxTokens: number;
  reserveTokens?: number;
  tokenizer: DatabaseContextPackTokenizer;
  encoding: DatabaseContextPackEncoding;
  disclosure?:
    | { level: 'records' }
    | { level: 'evidence'; searchText: string }
    | { level: 'full_body' };
  relationExpansion?: DatabaseRelationExpansionInput;
  /** Resolved only by the trusted data plane; wire clients provide agentViewId. */
  agentView?: DatabaseContextPackAgentView;
  /** Trusted per-pack root query cap, normally supplied by an Agent View. */
  recordLimit?: number;
  /** Trusted body-evidence gate resolved from an Agent View projection. */
  includeBodyEvidence?: boolean;
  /** Trusted sensitivity projection resolved from canonical property semantics. */
  sensitivityPolicy?: {
    maxSensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
    redactedPropertyIdsBySource: Readonly<Record<string, readonly string[]>>;
    allowBody: boolean;
  };
  cursor?: string;
  /** Internal cooperative cancellation seam; excluded from request identity. */
  throwIfCancelled?: () => void;
}

export interface DatabaseContextPackDependencies {
  describe(input: { databaseId: string; sourceId: string }): {
    manifestRevision: string;
    schemaRevision: string;
    database: DatabaseDefinition;
    source: DatabaseSource | null;
  };
  query(input: {
    databaseId: string;
    sourceId: string;
    query: DatabaseQuery;
  }): DatabaseQueryResult & {
    indexRevision: string;
    indexState?: 'idle' | 'rebuilding' | 'error';
    permissionExclusions?: {
      evaluated: boolean;
      policyId: string;
      policyRevision: string;
      records: number;
      properties: number;
      body?: boolean;
    };
    trace?: {
      projection: {
        returnedPropertyIds: readonly string[];
      };
    };
  };
  searchText(input: DatabaseLexicalSearchInput): DatabaseLexicalSearchResult;
  getRecord(recordId: string): {
    record: DatabaseRecord | null;
    deniedRecord: boolean;
    deniedPropertyIds: readonly string[];
    deniedBody?: boolean;
  };
}

interface PackedProperty {
  id: string;
  key: string;
  name: string;
  type: DatabaseProperty['type'];
  required: boolean;
  semantics: DatabaseProperty['semantics'];
  options?: Array<{ id: string; key: string; name: string }>;
  targetSourceId?: string;
  cardinality?: 'one' | 'many';
  multiple?: boolean;
}

interface PackedRecord {
  id: string;
  path: string;
  revision?: string;
  evidenceRevision?: string;
  values: Record<string, DatabaseValue>;
  textReferences?: Record<string, readonly DatabaseRichTextReference[]>;
  verification?: Record<string, DatabaseVerificationProjection>;
}

interface PackedRelatedRecord extends PackedRecord {
  sourceId: string;
}

export interface DatabaseRelationExpansion {
  requested: {
    maxDepth: number;
    maxRecords: number;
    maxRecordsPerRelation: number;
    projections: readonly DatabaseRelationProjection[];
  };
  schemas: readonly {
    sourceId: string;
    sourceKey: string;
    recordMeaning: string;
    properties: readonly PackedProperty[];
  }[];
  records: readonly PackedRelatedRecord[];
  edges: readonly {
    fromSourceId: string;
    fromRecordId: string;
    propertyId: string;
    toSourceId: string;
    toRecordId: string;
    depth: number;
  }[];
  complete: boolean;
  omitted: {
    depthLimit: number;
    recordLimit: number;
    fanOutLimit: number;
    missingRecords: readonly { sourceId: string; recordId: string }[];
    permissionRecords: number;
    permissionProperties: number;
    sensitivityProperties: number;
    sensitivityEdges: number;
    cycles: number;
    deduplicatedRecords: number;
  };
}

export interface ColumnarDatabaseRecords {
  columns: readonly string[];
  dictionaries: Readonly<Record<string, readonly string[]>>;
  rows: readonly (readonly unknown[])[];
  textReferences?: Readonly<
    Record<string, Readonly<Record<string, readonly DatabaseRichTextReference[]>>>
  >;
  evidenceRevisions?: Readonly<Record<string, string>>;
  verification?: Readonly<Record<string, Readonly<Record<string, DatabaseVerificationProjection>>>>;
}

export interface DatabaseContextPack {
  id: string;
  goal: string;
  database: {
    id: string;
    key: string;
    name: string;
    purpose: string;
    canonicality: DatabaseDefinition['contract']['canonicality'];
    freshness: DatabaseDefinition['contract']['freshness'];
  };
  agentView: DatabaseContextPackAgentView | null;
  /** Explainability metadata for the exact root retrieval; diagnostic fields are optional for older packs. */
  retrieval?: DatabaseContextPackRetrieval;
  schema: {
    manifestRevision: string;
    schemaRevision: string;
    sourceId: string;
    sourceKey: string;
    recordMeaning: string;
    properties: readonly PackedProperty[];
    people: readonly ProjectedDatabasePerson[];
  };
  snapshot: {
    indexRevision: string;
    indexState: 'idle' | 'rebuilding' | 'error' | null;
    indexFreshness: DatabaseQueryResult['indexFreshness'];
    matched: number;
    queryPageComplete: boolean;
    permissionExclusions: {
      evaluated: boolean;
      policyId: string;
      policyRevision: string;
      records: number;
      properties: number;
    } | null;
    sensitivityRedactions: {
      evaluated: true;
      maxSensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
      rootProperties: number;
      relationProperties: number;
      relationEdges: number;
      body: boolean;
    } | null;
  };
  /** Availability for local files referenced by included records only. */
  fileStates: Readonly<Record<string, DatabaseFileAvailability>>;
  /** Minimal readable relation targets referenced by included records only. */
  relationRecords: readonly ProjectedDatabaseRelationRecord[];
  encoding: DatabaseContextPackEncoding;
  records: readonly PackedRecord[] | ColumnarDatabaseRecords;
  disclosure:
    | { level: 'records' }
    | {
        level: 'evidence';
        searchText: string;
        matched: number;
        isComplete: boolean;
        evidence: readonly DatabaseLexicalEvidence[];
      }
    | {
        level: 'full_body';
        fullBodies: readonly {
          recordId: string;
          path: string;
          revision: string | null;
          body: string;
        }[];
      };
  relationExpansion: DatabaseRelationExpansion | null;
  returned: number;
  isComplete: boolean;
  nextCursor: string | null;
  omitted: {
    records: number;
    propertyIds: readonly string[];
    evidence: number;
    fullBodies: number;
    permissionBodies: number;
    sensitivityProperties: number;
    sensitivityBodies: number;
    reason: 'token_budget' | 'query_page' | null;
  };
  budget: {
    tokenizer: DatabaseContextPackTokenizer;
    maxTokens: number;
    reserveTokens: number;
    availableTokens: number;
    estimatedTokens: number;
  };
}

export type DatabaseContextPackErrorCode =
  | 'invalid_pack_cursor'
  | 'stale_pack_cursor'
  | 'unknown_pack_property'
  | 'duplicate_pack_property'
  | 'invalid_relation_expansion'
  | 'unknown_relation_projection_source'
  | 'unknown_relation_projection_property'
  | 'duplicate_relation_projection'
  | 'invalid_pack_scope'
  | 'invalid_pack_budget'
  | 'budget_too_small';

export class DatabaseContextPackError extends Error {
  readonly code: DatabaseContextPackErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DatabaseContextPackErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'DatabaseContextPackError';
    this.code = code;
    this.details = details;
  }
}

interface PackCursor {
  v: 1;
  fingerprint: string;
  snapshotRevision: string;
  queryCursor: string | null;
  offset: number;
  delivered: number;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(input: DatabaseContextPackInput): string {
  const { cursor: _cursor, throwIfCancelled: _throwIfCancelled, ...identity } = input;
  return createHash('sha256').update(stable(identity)).digest('hex');
}

function encodeCursor(cursor: PackCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string, expectedFingerprint: string): PackCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<PackCursor>;
    if (
      parsed.v !== 1 ||
      parsed.fingerprint !== expectedFingerprint ||
      typeof parsed.snapshotRevision !== 'string' ||
      (parsed.queryCursor !== null && typeof parsed.queryCursor !== 'string') ||
      !Number.isInteger(parsed.offset) ||
      (parsed.offset ?? -1) < 0 ||
      !Number.isInteger(parsed.delivered) ||
      (parsed.delivered ?? -1) < 0
    ) {
      throw new Error('cursor shape mismatch');
    }
    return parsed as PackCursor;
  } catch (error) {
    throw new DatabaseContextPackError(
      'invalid_pack_cursor',
      'Context pack cursor is invalid or belongs to a different request',
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

function estimateTokens(value: unknown, tokenizer: DatabaseContextPackTokenizer): number {
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  return Math.ceil(bytes / (tokenizer === 'utf8_bytes_div3' ? 3 : 2));
}

function packedProperty(property: DatabaseProperty): PackedProperty {
  return {
    id: property.id,
    key: property.key,
    name: property.name,
    type: property.type,
    required: property.required,
    semantics: structuredClone(property.semantics),
    ...(property.type === 'select' || property.type === 'multi_select'
      ? {
          options: property.options.map((option) => ({
            id: option.id,
            key: option.key,
            name: option.name,
          })),
        }
      : {}),
    ...(property.type === 'relation'
      ? { targetSourceId: property.targetSourceId, cardinality: property.cardinality }
      : {}),
    ...(property.type === 'person' ? { multiple: property.multiple } : {}),
  };
}

function objectRecord(
  record: DatabaseQueryResult['records'][number],
  propertyIds: ReadonlySet<string>,
): PackedRecord {
  const textReferences = Object.fromEntries(
    Object.entries(record.textProjections ?? {}).flatMap(([propertyId, projection]) =>
      propertyIds.has(propertyId) && projection.references.length > 0
        ? [[propertyId, projection.references]]
        : [],
    ),
  );
  return {
    id: record.id,
    path: record.path,
    ...(record.revision === null ? {} : { revision: record.revision }),
    ...(record.evidenceRevision == null ? {} : { evidenceRevision: record.evidenceRevision }),
    values: Object.fromEntries(
      Object.entries(record.values)
        .filter(([propertyId]) => propertyIds.has(propertyId))
        .map(([propertyId, value]) => [
          propertyId,
          record.textProjections?.[propertyId]?.plainText ?? value,
        ]),
    ),
    ...(Object.keys(textReferences).length > 0 ? { textReferences } : {}),
    ...(record.verificationProjections && Object.keys(record.verificationProjections).length > 0
      ? { verification: structuredClone(record.verificationProjections) }
      : {}),
  };
}

function relationIds(value: DatabaseValue | undefined): readonly string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

function filterPropertyIdsForPack(filter: DatabaseQuery['where']): string[] {
  if (!filter) return [];
  if ('and' in filter) return filter.and.flatMap(filterPropertyIdsForPack);
  if ('or' in filter) return filter.or.flatMap(filterPropertyIdsForPack);
  if ('not' in filter) return filterPropertyIdsForPack(filter.not);
  return [filter.propertyId];
}

function validateRelationExpansion(
  database: DatabaseDefinition,
  input: DatabaseRelationExpansionInput | undefined,
): Map<string, readonly string[]> | null {
  if (!input) return null;
  if (
    !Number.isInteger(input.maxDepth) ||
    input.maxDepth < 1 ||
    input.maxDepth > 3 ||
    !Number.isInteger(input.maxRecords) ||
    input.maxRecords < 1 ||
    input.maxRecords > 500 ||
    !Number.isInteger(input.maxRecordsPerRelation) ||
    input.maxRecordsPerRelation < 1 ||
    input.maxRecordsPerRelation > 50
  ) {
    throw new DatabaseContextPackError(
      'invalid_relation_expansion',
      'Relation expansion requires depth 1..3, total records 1..500, and per-relation fan-out 1..50',
      {
        maxDepth: input.maxDepth,
        maxRecords: input.maxRecords,
        maxRecordsPerRelation: input.maxRecordsPerRelation,
      },
    );
  }
  const projections = input.projections ?? [];
  const duplicateSources = projections
    .map((projection) => projection.sourceId)
    .filter((sourceId, index, all) => all.indexOf(sourceId) !== index);
  if (duplicateSources.length > 0) {
    throw new DatabaseContextPackError(
      'duplicate_relation_projection',
      'Relation expansion contains duplicate target-source projections',
      { sourceIds: [...new Set(duplicateSources)] },
    );
  }
  const bySource = new Map<string, readonly string[]>();
  for (const projection of projections) {
    const source = database.sources.find((candidate) => candidate.id === projection.sourceId);
    if (!source) {
      throw new DatabaseContextPackError(
        'unknown_relation_projection_source',
        'Relation projection names an unknown target source',
        {
          sourceId: projection.sourceId,
          candidates: database.sources.map((candidate) => ({
            id: candidate.id,
            key: candidate.key,
            name: candidate.name,
          })),
        },
      );
    }
    const duplicateProperties = projection.propertyIds.filter(
      (propertyId, index) => projection.propertyIds.indexOf(propertyId) !== index,
    );
    if (projection.propertyIds.length === 0 || duplicateProperties.length > 0) {
      throw new DatabaseContextPackError(
        'duplicate_relation_projection',
        'Each relation projection requires one or more unique property IDs',
        { sourceId: source.id, duplicatePropertyIds: [...new Set(duplicateProperties)] },
      );
    }
    const unknownProperties = projection.propertyIds.filter(
      (propertyId) => !source.properties.some((property) => property.id === propertyId),
    );
    if (unknownProperties.length > 0) {
      throw new DatabaseContextPackError(
        'unknown_relation_projection_property',
        'Relation projection names an unknown target property',
        {
          sourceId: source.id,
          unknownPropertyIds: unknownProperties,
          candidates: source.properties.map((property) => ({
            id: property.id,
            key: property.key,
            name: property.name,
          })),
        },
      );
    }
    bySource.set(source.id, [...projection.propertyIds]);
  }
  return bySource;
}

function createRelationExpansion(
  deps: DatabaseContextPackDependencies,
  database: DatabaseDefinition,
  rootSource: DatabaseSource,
  roots: readonly PackedRecord[],
  input: DatabaseRelationExpansionInput | undefined,
  explicitProjections: Map<string, readonly string[]> | null,
  sensitivityPolicy: DatabaseContextPackInput['sensitivityPolicy'],
): DatabaseRelationExpansion | null {
  if (!input || !explicitProjections) return null;
  const sourceById = new Map(database.sources.map((source) => [source.id, source] as const));
  const sensitivityRedactions = new Map(
    Object.entries(sensitivityPolicy?.redactedPropertyIdsBySource ?? {}).map(
      ([sourceId, propertyIds]) => [sourceId, new Set(propertyIds)] as const,
    ),
  );
  const sensitivityPropertyKeys = new Set<string>();
  const projectionFor = (source: DatabaseSource): readonly string[] => {
    const explicit = explicitProjections.get(source.id);
    const requested =
      explicit ?? source.properties.filter(({ type }) => type === 'title').map(({ id }) => id);
    const redacted = sensitivityRedactions.get(source.id) ?? new Set<string>();
    for (const propertyId of requested) {
      if (redacted.has(propertyId)) sensitivityPropertyKeys.add(`${source.id}:${propertyId}`);
    }
    return requested.filter((propertyId) => !redacted.has(propertyId));
  };
  const rootKeys = new Set<string>();
  const queue: Array<{
    record: DatabaseRecord;
    source: DatabaseSource;
    depth: number;
    ancestors: ReadonlySet<string>;
  }> = [];
  const missing = new Map<string, { sourceId: string; recordId: string }>();
  const deniedRecordKeys = new Set<string>();
  const deniedPropertyKeys = new Set<string>();
  const allowedProjectionIds = new Map<string, Set<string>>();
  for (const root of roots) {
    const access = deps.getRecord(root.id);
    const canonical = access.record;
    if (!canonical || canonical.databaseId !== database.id) {
      const key = `${rootSource.id}:${root.id}`;
      if (access.deniedRecord) deniedRecordKeys.add(key);
      else missing.set(key, { sourceId: rootSource.id, recordId: root.id });
      continue;
    }
    const source = sourceById.get(canonical.sourceId);
    if (!source) continue;
    const relationPropertyIds = new Set(
      source.properties
        .filter((property) => property.type === 'relation')
        .map((property) => property.id),
    );
    for (const propertyId of access.deniedPropertyIds) {
      if (relationPropertyIds.has(propertyId)) {
        deniedPropertyKeys.add(`${source.id}:${canonical.id}:${propertyId}`);
      }
    }
    const key = `${source.id}:${canonical.id}`;
    rootKeys.add(key);
    queue.push({ record: canonical, source, depth: 0, ancestors: new Set([key]) });
  }

  const visited = new Set(rootKeys);
  const related: PackedRelatedRecord[] = [];
  const edges: DatabaseRelationExpansion['edges'][number][] = [];
  const edgeKeys = new Set<string>();
  const usedSourceIds = new Set<string>();
  let depthLimit = 0;
  let recordLimit = 0;
  let fanOutLimit = 0;
  let cycles = 0;
  let deduplicatedRecords = 0;
  let sensitivityEdges = 0;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (!current) continue;
    for (const property of current.source.properties) {
      if (property.type !== 'relation') continue;
      if (sensitivityRedactions.get(current.source.id)?.has(property.id)) {
        sensitivityEdges += relationIds(current.record.values[property.id]).length;
        continue;
      }
      const targetSource = sourceById.get(property.targetSourceId);
      if (!targetSource) continue;
      const targetIds = [...new Set(relationIds(current.record.values[property.id]))];
      if (current.depth >= input.maxDepth) {
        depthLimit += targetIds.length;
        continue;
      }
      fanOutLimit += Math.max(0, targetIds.length - input.maxRecordsPerRelation);
      for (const targetId of targetIds.slice(0, input.maxRecordsPerRelation)) {
        const depth = current.depth + 1;
        const edgeKey = `${current.source.id}:${current.record.id}:${property.id}:${targetSource.id}:${targetId}`;
        if (!edgeKeys.has(edgeKey)) {
          edgeKeys.add(edgeKey);
          edges.push({
            fromSourceId: current.source.id,
            fromRecordId: current.record.id,
            propertyId: property.id,
            toSourceId: targetSource.id,
            toRecordId: targetId,
            depth,
          });
        }
        const targetKey = `${targetSource.id}:${targetId}`;
        if (current.ancestors.has(targetKey)) {
          cycles += 1;
          continue;
        }
        if (visited.has(targetKey)) {
          deduplicatedRecords += 1;
          continue;
        }
        if (related.length >= input.maxRecords) {
          recordLimit += 1;
          continue;
        }
        const targetAccess = deps.getRecord(targetId);
        const target = targetAccess.record;
        if (!target || target.databaseId !== database.id || target.sourceId !== targetSource.id) {
          if (targetAccess.deniedRecord) deniedRecordKeys.add(targetKey);
          else missing.set(targetKey, { sourceId: targetSource.id, recordId: targetId });
          continue;
        }
        visited.add(targetKey);
        const projection = projectionFor(targetSource);
        const neededPropertyIds = new Set([
          ...projection,
          ...(depth < input.maxDepth
            ? targetSource.properties
                .filter((property) => property.type === 'relation')
                .map((property) => property.id)
            : []),
        ]);
        const deniedPropertyIds = new Set(targetAccess.deniedPropertyIds);
        for (const propertyId of deniedPropertyIds) {
          if (neededPropertyIds.has(propertyId)) {
            deniedPropertyKeys.add(`${targetSource.id}:${target.id}:${propertyId}`);
          }
        }
        const allowedProjection = allowedProjectionIds.get(targetSource.id) ?? new Set(projection);
        for (const propertyId of deniedPropertyIds) allowedProjection.delete(propertyId);
        allowedProjectionIds.set(targetSource.id, allowedProjection);
        const projectionSet = new Set(projection);
        related.push({
          sourceId: targetSource.id,
          id: target.id,
          path: target.path,
          ...(target.revision === null ? {} : { revision: target.revision }),
          values: Object.fromEntries(
            Object.entries(target.values).filter(([propertyId]) => projectionSet.has(propertyId)),
          ),
        });
        usedSourceIds.add(targetSource.id);
        queue.push({
          record: target,
          source: targetSource,
          depth,
          ancestors: new Set([...current.ancestors, targetKey]),
        });
      }
    }
  }

  const projections = [...explicitProjections].map(([sourceId, propertyIds]) => ({
    sourceId,
    propertyIds: [...propertyIds],
  }));
  const schemas = database.sources.flatMap((source) => {
    if (!usedSourceIds.has(source.id)) return [];
    const projection = allowedProjectionIds.get(source.id) ?? new Set(projectionFor(source));
    return [
      {
        sourceId: source.id,
        sourceKey: source.key,
        recordMeaning: source.recordMeaning,
        properties: source.properties
          .filter((property) => projection.has(property.id))
          .map(packedProperty),
      },
    ];
  });
  const omitted = {
    depthLimit,
    recordLimit,
    fanOutLimit,
    missingRecords: [...missing.values()],
    permissionRecords: deniedRecordKeys.size,
    permissionProperties: deniedPropertyKeys.size,
    sensitivityProperties: sensitivityPropertyKeys.size,
    sensitivityEdges,
    cycles,
    deduplicatedRecords,
  };
  return {
    requested: {
      maxDepth: input.maxDepth,
      maxRecords: input.maxRecords,
      maxRecordsPerRelation: input.maxRecordsPerRelation,
      projections,
    },
    schemas,
    records: related,
    edges,
    complete:
      depthLimit === 0 &&
      recordLimit === 0 &&
      fanOutLimit === 0 &&
      missing.size === 0 &&
      deniedRecordKeys.size === 0 &&
      deniedPropertyKeys.size === 0 &&
      sensitivityPropertyKeys.size === 0 &&
      sensitivityEdges === 0,
    omitted,
  };
}

function encodeColumnar(
  records: readonly PackedRecord[],
  properties: readonly PackedProperty[],
): ColumnarDatabaseRecords {
  const columns = ['record_id', 'path', 'revision', ...properties.map((property) => property.id)];
  const dictionaries = Object.fromEntries(
    properties.flatMap((property) =>
      property.options ? [[property.id, property.options.map((option) => option.id)] as const] : [],
    ),
  );
  const encodeValue = (property: PackedProperty, value: DatabaseValue | undefined): unknown => {
    if (value === undefined) return null;
    const dictionary = dictionaries[property.id];
    if (!dictionary) return value;
    if (Array.isArray(value)) {
      return value.map((entry) => dictionary.indexOf(typeof entry === 'string' ? entry : ''));
    }
    return dictionary.indexOf(String(value));
  };
  const textReferences = Object.fromEntries(
    records.flatMap((record) =>
      record.textReferences && Object.keys(record.textReferences).length > 0
        ? [[record.id, record.textReferences]]
        : [],
    ),
  );
  const evidenceRevisions = Object.fromEntries(
    records.flatMap((record) =>
      record.evidenceRevision ? [[record.id, record.evidenceRevision]] : [],
    ),
  );
  const verification = Object.fromEntries(
    records.flatMap((record) => (record.verification ? [[record.id, record.verification]] : [])),
  );
  return {
    columns,
    dictionaries,
    rows: records.map((record) => [
      record.id,
      record.path,
      record.revision ?? null,
      ...properties.map((property) => encodeValue(property, record.values[property.id])),
    ]),
    ...(Object.keys(textReferences).length > 0 ? { textReferences } : {}),
    ...(Object.keys(evidenceRevisions).length > 0 ? { evidenceRevisions } : {}),
    ...(Object.keys(verification).length > 0 ? { verification } : {}),
  };
}

export function decodeColumnarDatabaseRecords(
  encoded: ColumnarDatabaseRecords,
): readonly PackedRecord[] {
  return encoded.rows.map((row) => {
    const values: Record<string, DatabaseValue> = {};
    encoded.columns.slice(3).forEach((propertyId, index) => {
      const value = row[index + 3];
      if (value === null || value === undefined) return;
      const dictionary = encoded.dictionaries[propertyId];
      if (!dictionary) {
        values[propertyId] = value as DatabaseValue;
      } else if (Array.isArray(value)) {
        values[propertyId] = value.map((entry) => dictionary[Number(entry)] ?? '');
      } else {
        values[propertyId] = dictionary[Number(value)] ?? '';
      }
    });
    return {
      id: String(row[0]),
      path: String(row[1]),
      ...(row[2] === null ? {} : { revision: String(row[2]) }),
      ...(encoded.evidenceRevisions?.[String(row[0])]
        ? { evidenceRevision: encoded.evidenceRevisions[String(row[0])] }
        : {}),
      values,
      ...(encoded.textReferences?.[String(row[0])]
        ? { textReferences: encoded.textReferences[String(row[0])] }
        : {}),
      ...(encoded.verification?.[String(row[0])]
        ? { verification: encoded.verification[String(row[0])] }
        : {}),
    };
  });
}

export function createDatabaseContextPack(
  deps: DatabaseContextPackDependencies,
  input: DatabaseContextPackInput,
): DatabaseContextPack {
  input.throwIfCancelled?.();
  const reserveTokens = input.reserveTokens ?? 0;
  if (
    input.recordLimit !== undefined &&
    (!Number.isInteger(input.recordLimit) || input.recordLimit < 1 || input.recordLimit > 500)
  ) {
    throw new DatabaseContextPackError(
      'invalid_pack_scope',
      'Context pack recordLimit must be an integer from 1 to 500',
      { recordLimit: input.recordLimit },
    );
  }
  if (
    !Number.isInteger(input.maxTokens) ||
    input.maxTokens < 128 ||
    !Number.isInteger(reserveTokens) ||
    reserveTokens < 0 ||
    reserveTokens >= input.maxTokens
  ) {
    throw new DatabaseContextPackError(
      'invalid_pack_budget',
      'Context pack budget requires maxTokens >= 128 and 0 <= reserveTokens < maxTokens',
      { maxTokens: input.maxTokens, reserveTokens },
    );
  }
  const requestFingerprint = fingerprint(input);
  const cursor = input.cursor ? decodeCursor(input.cursor, requestFingerprint) : null;
  const described = deps.describe({ databaseId: input.databaseId, sourceId: input.sourceId });
  const source = described.source;
  if (!source) throw new Error('Context pack source was not described');
  const relationProjections = validateRelationExpansion(
    described.database,
    input.relationExpansion,
  );

  const requestedSelectedIds =
    input.propertyIds ?? source.properties.map((property) => property.id);
  const duplicateIds = requestedSelectedIds.filter(
    (propertyId, index) => requestedSelectedIds.indexOf(propertyId) !== index,
  );
  if (duplicateIds.length > 0) {
    throw new DatabaseContextPackError(
      'duplicate_pack_property',
      'Context pack property projection contains duplicate IDs',
      { duplicatePropertyIds: [...new Set(duplicateIds)] },
    );
  }
  const unknown = requestedSelectedIds.filter(
    (propertyId) => !source.properties.some((property) => property.id === propertyId),
  );
  if (unknown.length > 0) {
    throw new DatabaseContextPackError('unknown_pack_property', 'Unknown context pack property', {
      unknownPropertyIds: unknown,
      candidates: source.properties.map((property) => ({
        id: property.id,
        key: property.key,
        name: property.name,
      })),
    });
  }
  const sensitiveRootPropertyIds = new Set(
    input.sensitivityPolicy?.redactedPropertyIdsBySource[source.id] ?? [],
  );
  const selectedIds = requestedSelectedIds.filter(
    (propertyId) => !sensitiveRootPropertyIds.has(propertyId),
  );
  const sensitiveDependencies = [
    ...filterPropertyIdsForPack(input.query?.where),
    ...(input.query?.sort ?? []).map(({ propertyId }) => propertyId),
  ].filter((propertyId) => sensitiveRootPropertyIds.has(propertyId));
  if (sensitiveDependencies.length > 0) {
    throw new DatabaseContextPackError(
      'invalid_pack_scope',
      'Context pack filters or sorts exceed the Agent View sensitivity policy',
      { deniedPropertyIds: [...new Set(sensitiveDependencies)].sort() },
    );
  }
  const queryCursor = cursor?.queryCursor ?? undefined;
  const query = deps.query({
    databaseId: input.databaseId,
    sourceId: input.sourceId,
    query: {
      ...(input.query?.where ? { where: input.query.where } : {}),
      sort: input.query?.sort ?? [],
      select: [...selectedIds],
      includeArchived: input.query?.includeArchived ?? false,
      page: {
        limit: Math.min(500, input.recordLimit ?? 500),
        ...(queryCursor ? { cursor: queryCursor } : {}),
      },
    },
  });
  if (cursor && cursor.snapshotRevision !== query.snapshotRevision) {
    throw new DatabaseContextPackError('stale_pack_cursor', 'Context pack snapshot has changed', {
      cursorSnapshotRevision: cursor.snapshotRevision,
      snapshotRevision: query.snapshotRevision,
    });
  }
  const effectiveSelectedIds = query.trace?.projection.returnedPropertyIds ?? selectedIds;
  const properties = effectiveSelectedIds.map((propertyId) => {
    const property = source.properties.find((candidate) => candidate.id === propertyId);
    if (!property) throw new Error('permission-scoped property missing from source');
    return packedProperty(property);
  });

  const disclosureRequest = input.disclosure ?? { level: 'records' as const };
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const lexical =
    disclosureRequest.level === 'evidence' && titleProperty
      ? deps.searchText({
          databaseId: input.databaseId,
          sourceId: input.sourceId,
          text: disclosureRequest.searchText,
          propertyIds: effectiveSelectedIds.filter((propertyId) =>
            source.properties.some(
              (property) =>
                property.id === propertyId &&
                ['title', 'text', 'url', 'email', 'phone'].includes(property.type),
            ),
          ),
          titlePropertyId: titleProperty.id,
          includeBody:
            (input.includeBodyEvidence ?? true) && input.sensitivityPolicy?.allowBody !== false,
          limit: Number.MAX_SAFE_INTEGER,
        })
      : null;
  const lexicalHitByRecordId = new Map(
    (lexical?.hits ?? []).map((hit) => [hit.recordId, hit] as const),
  );

  const retrievalFor = (
    returned: number,
    omittedRecords: number,
    complete: boolean,
    continuationAvailable: boolean,
  ): DatabaseContextPackRetrieval => ({
    query: {
      filter: input.query?.where ?? null,
      sort: structuredClone(input.query?.sort ?? []),
      includeArchived: input.query?.includeArchived ?? false,
    },
    filters: {
      propertyIds: filterPropertyIdsForPack(input.query?.where),
    },
    ranking: {
      strategy: 'typed_sort_then_created_at_then_record_id',
      sort: structuredClone(input.query?.sort ?? []),
      tieBreakers: ['created_at', 'record_id'],
    },
    projection: {
      requestedPropertyIds: [...requestedSelectedIds],
      returnedPropertyIds: [...effectiveSelectedIds],
      omittedPropertyIds: requestedSelectedIds.filter(
        (propertyId) => !effectiveSelectedIds.includes(propertyId),
      ),
    },
    result: {
      matched: query.matched,
      returned,
      omittedRecords,
      complete,
      continuationAvailable,
    },
    permission: query.permissionExclusions ? structuredClone(query.permissionExclusions) : null,
    evidence: {
      mode: disclosureRequest.level,
      searchText: disclosureRequest.level === 'evidence' ? disclosureRequest.searchText : null,
      matched: lexical?.matched ?? 0,
      returned: lexical?.returned ?? 0,
    },
  });

  const offset = cursor?.offset ?? 0;
  const selectedSet = new Set(effectiveSelectedIds);
  const queryCandidates = query.records.map((record) => objectRecord(record, selectedSet));
  const eligibleCandidates = lexical
    ? queryCandidates.filter((record) => lexicalHitByRecordId.has(record.id))
    : queryCandidates;
  if (offset > eligibleCandidates.length) {
    throw new DatabaseContextPackError(
      'invalid_pack_cursor',
      'Context pack cursor offset is invalid',
    );
  }
  const candidates = eligibleCandidates.slice(offset);
  const fileStatesFor = (
    records: readonly PackedRecord[],
  ): Record<string, DatabaseFileAvailability> => {
    const paths = new Set<string>();
    for (const record of records) {
      for (const value of Object.values(record.values)) {
        if (!Array.isArray(value)) continue;
        for (const entry of value as Array<string | DatabaseFileValue>) {
          if (typeof entry !== 'string' && entry.kind === 'local') paths.add(entry.path);
        }
      }
    }
    return Object.fromEntries(
      [...paths]
        .sort((left, right) => left.localeCompare(right))
        .flatMap((path) => (query.fileStates?.[path] ? [[path, query.fileStates[path]]] : [])),
    );
  };
  const relationPropertyIds = new Set(
    source.properties
      .filter((property) => property.type === 'relation')
      .map((property) => property.id),
  );
  const relationRecordsFor = (
    records: readonly PackedRecord[],
  ): ProjectedDatabaseRelationRecord[] => {
    const recordIds = new Set<string>();
    for (const record of records) {
      for (const [propertyId, value] of Object.entries(record.values)) {
        if (!relationPropertyIds.has(propertyId)) continue;
        for (const recordId of Array.isArray(value) ? value : [value]) {
          if (typeof recordId === 'string') recordIds.add(recordId);
        }
      }
    }
    return (query.relationRecords ?? []).filter((record) => recordIds.has(record.id));
  };
  const availableTokens = input.maxTokens - reserveTokens;
  const omittedPropertyIds = source.properties
    .map((property) => property.id)
    .filter((propertyId) => !selectedSet.has(propertyId));
  const base = {
    goal: input.goal,
    database: {
      id: described.database.id,
      key: described.database.key,
      name: described.database.name,
      purpose: described.database.contract.purpose,
      canonicality: described.database.contract.canonicality,
      freshness: described.database.contract.freshness,
    },
    agentView: input.agentView ? structuredClone(input.agentView) : null,
    schema: {
      manifestRevision: described.manifestRevision,
      schemaRevision: described.schemaRevision,
      sourceId: source.id,
      sourceKey: source.key,
      recordMeaning: source.recordMeaning,
      properties,
      people: query.people ?? [],
    },
    snapshot: {
      indexRevision: query.indexRevision,
      indexState: query.indexState ?? null,
      indexFreshness: query.indexFreshness,
      matched: query.matched,
      queryPageComplete: query.isComplete,
      permissionExclusions: query.permissionExclusions
        ? structuredClone(query.permissionExclusions)
        : null,
      sensitivityRedactions: input.sensitivityPolicy
        ? {
            evaluated: true as const,
            maxSensitivity: input.sensitivityPolicy.maxSensitivity,
            rootProperties: requestedSelectedIds.filter((propertyId) =>
              sensitiveRootPropertyIds.has(propertyId),
            ).length,
            relationProperties: 0,
            relationEdges: 0,
            body: input.sensitivityPolicy.allowBody === false,
          }
        : null,
    },
    encoding: input.encoding,
  };

  const relationExpansionFor = (records: readonly PackedRecord[]) =>
    createRelationExpansion(
      deps,
      described.database,
      source,
      records,
      input.relationExpansion,
      relationProjections,
      input.sensitivityPolicy,
    );
  const baseForRelation = (relationExpansion: DatabaseRelationExpansion | null) => ({
    ...base,
    snapshot: {
      ...base.snapshot,
      sensitivityRedactions: base.snapshot.sensitivityRedactions
        ? {
            ...base.snapshot.sensitivityRedactions,
            relationProperties: relationExpansion?.omitted.sensitivityProperties ?? 0,
            relationEdges: relationExpansion?.omitted.sensitivityEdges ?? 0,
          }
        : null,
    },
  });

  const disclosureFor = (records: readonly PackedRecord[]): DatabaseContextPack['disclosure'] => {
    if (disclosureRequest.level === 'evidence') {
      return {
        level: 'evidence',
        searchText: disclosureRequest.searchText,
        matched: lexical?.matched ?? 0,
        isComplete: lexical?.isComplete ?? true,
        evidence: records.flatMap((record) => lexicalHitByRecordId.get(record.id)?.evidence ?? []),
      };
    }
    if (disclosureRequest.level === 'full_body') {
      if (input.sensitivityPolicy?.allowBody === false) {
        return { level: 'full_body', fullBodies: [] };
      }
      return {
        level: 'full_body',
        fullBodies: records.flatMap((record) => {
          const access = deps.getRecord(record.id);
          const canonical = access.record;
          if (
            access.deniedBody ||
            !canonical ||
            canonical.databaseId !== input.databaseId ||
            canonical.sourceId !== input.sourceId
          ) {
            return [];
          }
          return [
            {
              recordId: canonical.id,
              path: canonical.path,
              revision: canonical.revision,
              body: canonical.body,
            },
          ];
        }),
      };
    }
    return { level: 'records' };
  };

  const included: PackedRecord[] = [];
  let minimumNextRecordTokens: number | null = null;
  for (const [recordIndex, record] of candidates.entries()) {
    if (recordIndex % 16 === 0) input.throwIfCancelled?.();
    const proposed = [...included, record];
    const records =
      input.encoding === 'object_rows' ? proposed : encodeColumnar(proposed, properties);
    const relationExpansion = relationExpansionFor(proposed);
    const estimated = estimateTokens(
      {
        ...baseForRelation(relationExpansion),
        fileStates: fileStatesFor(proposed),
        relationRecords: relationRecordsFor(proposed),
        records,
        disclosure: disclosureFor(proposed),
        relationExpansion,
      },
      input.tokenizer,
    );
    if (included.length === 0) minimumNextRecordTokens = estimated;
    if (estimated > availableTokens) break;
    included.push(record);
  }
  if (
    included.length === 0 &&
    candidates.length > 0 &&
    minimumNextRecordTokens !== null &&
    minimumNextRecordTokens > availableTokens
  ) {
    throw new DatabaseContextPackError(
      'budget_too_small',
      'Token budget cannot fit the next record and its requested disclosure or relation expansion',
      {
        minimumTokens: minimumNextRecordTokens,
        availableTokens,
        nextRecordId: candidates[0]?.id,
      },
    );
  }
  input.throwIfCancelled?.();
  const records =
    input.encoding === 'object_rows' ? included : encodeColumnar(included, properties);
  const disclosure = disclosureFor(included);
  const relationExpansion = relationExpansionFor(included);
  const stoppedWithinPage = included.length < candidates.length;
  const nextQueryCursor = stoppedWithinPage ? (queryCursor ?? null) : query.nextCursor;
  const nextOffset = stoppedWithinPage ? offset + included.length : 0;
  const hasMore = stoppedWithinPage || query.nextCursor !== null;
  const nextCursor = hasMore
    ? encodeCursor({
        v: 1,
        fingerprint: requestFingerprint,
        snapshotRevision: query.snapshotRevision,
        queryCursor: nextQueryCursor,
        offset: nextOffset,
        delivered: (cursor?.delivered ?? 0) + included.length,
      })
    : null;
  const omittedRecords = Math.max(0, query.matched - (cursor?.delivered ?? 0) - included.length);
  // Retrieval explainability is a compact diagnostic envelope, like the pack
  // id, cursor, and omission counters below; the budget measures the model
  // context payload (schema, records, disclosures, and relations) rather than
  // charging the same diagnostics twice through the pack envelope.
  const estimatedTokens = estimateTokens(
    {
      ...baseForRelation(relationExpansion),
      fileStates: fileStatesFor(included),
      relationRecords: relationRecordsFor(included),
      records,
      disclosure,
      relationExpansion,
    },
    input.tokenizer,
  );
  if (estimatedTokens > availableTokens) {
    throw new DatabaseContextPackError(
      'budget_too_small',
      'Token budget cannot fit the database card and requested schema',
      { minimumTokens: estimatedTokens, availableTokens },
    );
  }

  const packWithoutIdAndBudget = {
    ...baseForRelation(relationExpansion),
    fileStates: fileStatesFor(included),
    relationRecords: relationRecordsFor(included),
    records,
    disclosure,
    relationExpansion,
    retrieval: retrievalFor(included.length, omittedRecords, !hasMore, hasMore),
    returned: included.length,
    isComplete: !hasMore,
    nextCursor,
    omitted: {
      records: omittedRecords,
      propertyIds: omittedPropertyIds,
      evidence:
        disclosureRequest.level === 'evidence'
          ? Math.max(0, (lexical?.matched ?? 0) - included.length)
          : 0,
      fullBodies:
        disclosureRequest.level === 'full_body'
          ? Math.max(0, query.matched - (cursor?.delivered ?? 0) - included.length)
          : 0,
      permissionBodies:
        disclosureRequest.level === 'full_body'
          ? query.records.filter((record) => deps.getRecord(record.id).deniedBody === true).length
          : 0,
      sensitivityProperties:
        requestedSelectedIds.filter((propertyId) => sensitiveRootPropertyIds.has(propertyId))
          .length + (relationExpansion?.omitted.sensitivityProperties ?? 0),
      sensitivityBodies:
        disclosureRequest.level === 'full_body' && input.sensitivityPolicy?.allowBody === false
          ? query.matched
          : 0,
      reason: stoppedWithinPage
        ? ('token_budget' as const)
        : hasMore
          ? ('query_page' as const)
          : null,
    },
  };
  const id = `pack_${createHash('sha256').update(stable(packWithoutIdAndBudget)).digest('hex').slice(0, 24)}`;
  return {
    id,
    ...packWithoutIdAndBudget,
    budget: {
      tokenizer: input.tokenizer,
      maxTokens: input.maxTokens,
      reserveTokens,
      availableTokens,
      estimatedTokens,
    },
  };
}
