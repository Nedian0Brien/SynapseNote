import { createHash } from 'node:crypto';
import type { DatabaseRecord, DatabaseSource } from '@nedian0brien/synapsenote-core';

export type DatabaseSemanticPrivacyMode = 'local_only' | 'remote_allowed' | 'blocked';
export type DatabaseSemanticIndexState = 'disabled' | 'building' | 'ready' | 'stale' | 'error';
export const DATABASE_SEMANTIC_EMBED_BATCH_SIZE = 128;

export interface DatabaseEmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  readonly location: 'local' | 'remote';
  embed(
    texts: readonly string[],
    options: { role: 'document' | 'query' },
  ): Promise<readonly (readonly number[])[]>;
}

export interface DatabaseSemanticIndexConfiguration {
  enabled: boolean;
  providerId: string;
  model: string;
  dimensions: number;
  privacy: DatabaseSemanticPrivacyMode;
  /** Exact stable IDs, or the source's deterministic searchable text projection. */
  propertyIds: readonly string[] | 'searchable';
  includeBody: boolean;
}

export interface DatabaseSemanticIndexIdentity {
  databaseId: string;
  sourceId: string;
  schemaRevision: string;
  indexRevision: string;
}

export interface DatabaseSemanticIndexStatus extends DatabaseSemanticIndexIdentity {
  state: DatabaseSemanticIndexState;
  providerId: string | null;
  model: string | null;
  dimensions: number | null;
  privacy: DatabaseSemanticPrivacyMode;
  propertyIds: readonly string[];
  includeBody: boolean;
  indexedRecords: number;
  staleRecords: number;
  createdAt: string | null;
  reason:
    | 'not_configured'
    | 'privacy_blocked'
    | 'provider_mismatch'
    | 'snapshot_changed'
    | 'build_failed'
    | null;
}

export interface DatabaseSemanticSearchHit {
  recordId: string;
  path: string;
  revision: string | null;
  score: number;
  inputHash: string;
}

export interface DatabaseSemanticSearchResult {
  query: string;
  matched: number;
  returned: number;
  isComplete: boolean;
  hits: readonly DatabaseSemanticSearchHit[];
  trace: {
    strategy: 'semantic_cosine';
    providerId: string;
    model: string;
    dimensions: number;
    privacy: DatabaseSemanticPrivacyMode;
    propertyIds: readonly string[];
    includeBody: boolean;
    schemaRevision: string;
    indexRevision: string;
    tieBreakers: readonly ['path', 'record_id'];
  };
}

export interface DatabaseHybridRetrievalHit {
  recordId: string;
  path: string;
  revision: string | null;
  score: number;
  ranking: {
    lexicalRank: number | null;
    semanticRank: number | null;
    lexicalContribution: number;
    semanticContribution: number;
  };
}

export interface DatabaseHybridRetrievalResult {
  matched: number;
  returned: number;
  isComplete: boolean;
  hits: readonly DatabaseHybridRetrievalHit[];
  trace: {
    strategy: 'reciprocal_rank_fusion';
    constant: 60;
    lexicalWeight: number;
    semanticWeight: number;
    tieBreakers: readonly ['path', 'record_id'];
  };
}

interface IndexedVector {
  recordId: string;
  path: string;
  revision: string | null;
  inputHash: string;
  vector: readonly number[];
}

interface ReadySnapshot {
  identity: DatabaseSemanticIndexIdentity;
  createdAt: string;
  vectors: readonly IndexedVector[];
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

function semanticInput(
  source: DatabaseSource,
  record: DatabaseRecord,
  propertyIds: readonly string[],
  includeBody: boolean,
): string {
  const properties = propertyIds.map((propertyId) => {
    const property = source.properties.find((candidate) => candidate.id === propertyId);
    return {
      propertyId,
      key: property?.key ?? propertyId,
      value: record.values[propertyId] ?? null,
    };
  });
  return stableJson({ properties, ...(includeBody ? { body: record.body } : {}) });
}

function normalizedVector(vector: readonly number[], dimensions: number): readonly number[] {
  if (vector.length !== dimensions || vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`Embedding provider returned a vector other than ${dimensions} finite values`);
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) throw new Error('Embedding provider returned a zero vector');
  return vector.map((value) => value / magnitude);
}

function scopeKey(databaseId: string, sourceId: string): string {
  return `${databaseId}\u0000${sourceId}`;
}

/** Deterministically fuse two already permission-scoped rankings. */
export function fuseDatabaseRetrieval(input: {
  lexicalHits: readonly Pick<DatabaseSemanticSearchHit, 'recordId' | 'path' | 'revision'>[];
  semanticHits: readonly Pick<DatabaseSemanticSearchHit, 'recordId' | 'path' | 'revision'>[];
  lexicalWeight: number;
  semanticWeight: number;
  limit?: number;
}): DatabaseHybridRetrievalResult {
  if (
    !Number.isFinite(input.lexicalWeight) ||
    !Number.isFinite(input.semanticWeight) ||
    input.lexicalWeight < 0 ||
    input.semanticWeight < 0 ||
    input.lexicalWeight + input.semanticWeight <= 0
  ) {
    throw new Error('Hybrid retrieval weights must be finite, non-negative, and not both zero');
  }
  const constant = 60 as const;
  const candidates = new Map<
    string,
    {
      recordId: string;
      path: string;
      revision: string | null;
      lexicalRank: number | null;
      semanticRank: number | null;
    }
  >();
  input.lexicalHits.forEach((hit, index) => {
    candidates.set(hit.recordId, {
      ...hit,
      lexicalRank: index + 1,
      semanticRank: null,
    });
  });
  input.semanticHits.forEach((hit, index) => {
    const current = candidates.get(hit.recordId);
    candidates.set(hit.recordId, {
      recordId: hit.recordId,
      path: current?.path ?? hit.path,
      revision: current?.revision ?? hit.revision,
      lexicalRank: current?.lexicalRank ?? null,
      semanticRank: index + 1,
    });
  });
  const ranked = [...candidates.values()]
    .map((candidate) => {
      const lexicalContribution =
        candidate.lexicalRank === null
          ? 0
          : input.lexicalWeight / (constant + candidate.lexicalRank);
      const semanticContribution =
        candidate.semanticRank === null
          ? 0
          : input.semanticWeight / (constant + candidate.semanticRank);
      return {
        recordId: candidate.recordId,
        path: candidate.path,
        revision: candidate.revision,
        score: lexicalContribution + semanticContribution,
        ranking: {
          lexicalRank: candidate.lexicalRank,
          semanticRank: candidate.semanticRank,
          lexicalContribution,
          semanticContribution,
        },
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.path.localeCompare(right.path) ||
        left.recordId.localeCompare(right.recordId),
    );
  const limit = Math.max(1, input.limit ?? 25);
  return {
    matched: ranked.length,
    returned: Math.min(ranked.length, limit),
    isComplete: ranked.length <= limit,
    hits: ranked.slice(0, limit),
    trace: {
      strategy: 'reciprocal_rank_fusion',
      constant,
      lexicalWeight: input.lexicalWeight,
      semanticWeight: input.semanticWeight,
      tieBreakers: ['path', 'record_id'],
    },
  };
}

/** Rebuildable, process-local semantic vectors. Canonical correctness never depends on this index. */
export class DatabaseSemanticIndex {
  readonly #configuration: DatabaseSemanticIndexConfiguration | null;
  readonly #provider: DatabaseEmbeddingProvider | null;
  readonly #now: () => Date;
  readonly #snapshots = new Map<string, ReadySnapshot>();
  readonly #states = new Map<string, DatabaseSemanticIndexStatus>();
  readonly #generations = new Map<string, number>();

  constructor(
    input: {
      configuration?: DatabaseSemanticIndexConfiguration | null;
      provider?: DatabaseEmbeddingProvider | null;
      now?: () => Date;
    } = {},
  ) {
    this.#configuration = input.configuration ?? null;
    this.#provider = input.provider ?? null;
    this.#now = input.now ?? (() => new Date());
  }

  status(
    identity: DatabaseSemanticIndexIdentity,
    source?: DatabaseSource,
  ): DatabaseSemanticIndexStatus {
    const key = scopeKey(identity.databaseId, identity.sourceId);
    const current = this.#states.get(key) ?? this.#baseStatus(identity, source);
    if (
      current.state === 'ready' &&
      (current.schemaRevision !== identity.schemaRevision ||
        current.indexRevision !== identity.indexRevision)
    ) {
      return {
        ...current,
        ...identity,
        state: 'stale',
        staleRecords: current.indexedRecords,
        reason: 'snapshot_changed',
      };
    }
    return structuredClone(current);
  }

  async rebuild(input: {
    identity: DatabaseSemanticIndexIdentity;
    source: DatabaseSource;
    records: readonly DatabaseRecord[];
  }): Promise<DatabaseSemanticIndexStatus> {
    const { identity } = input;
    const key = scopeKey(identity.databaseId, identity.sourceId);
    const propertyIds = this.#resolvePropertyIds(input.source);
    const base = this.#baseStatus(identity, input.source);
    if (base.state === 'disabled') {
      this.#states.set(key, base);
      this.#snapshots.delete(key);
      return structuredClone(base);
    }
    const configuration = this.#configuration as DatabaseSemanticIndexConfiguration;
    const provider = this.#provider as DatabaseEmbeddingProvider;
    const sourcePropertyIds = new Set(input.source.properties.map(({ id }) => id));
    const invalidPropertyIds = propertyIds.filter(
      (propertyId) => !sourcePropertyIds.has(propertyId),
    );
    if (invalidPropertyIds.length > 0 || new Set(propertyIds).size !== propertyIds.length) {
      const failed = { ...base, state: 'error' as const, reason: 'build_failed' as const };
      this.#states.set(key, failed);
      this.#snapshots.delete(key);
      return structuredClone(failed);
    }
    const generation = (this.#generations.get(key) ?? 0) + 1;
    this.#generations.set(key, generation);
    this.#states.set(key, { ...base, state: 'building', reason: null });
    try {
      const documents = input.records
        .filter(
          (record) =>
            record.databaseId === identity.databaseId && record.sourceId === identity.sourceId,
        )
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((record) => {
          const text = semanticInput(input.source, record, propertyIds, configuration.includeBody);
          return {
            record,
            text,
            inputHash: `sha256:${createHash('sha256').update(text).digest('hex')}`,
          };
        });
      const embedded: (readonly number[])[] = [];
      for (
        let offset = 0;
        offset < documents.length;
        offset += DATABASE_SEMANTIC_EMBED_BATCH_SIZE
      ) {
        if (this.#generations.get(key) !== generation) return this.status(identity, input.source);
        const batch = documents.slice(offset, offset + DATABASE_SEMANTIC_EMBED_BATCH_SIZE);
        const batchVectors = await provider.embed(
          batch.map(({ text }) => text),
          { role: 'document' },
        );
        if (batchVectors.length !== batch.length) {
          throw new Error('Embedding provider returned a different number of vectors than inputs');
        }
        embedded.push(...batchVectors);
      }
      const vectors = documents.map(({ record, inputHash }, index) => ({
        recordId: record.id,
        path: record.path,
        revision: record.revision,
        inputHash,
        vector: normalizedVector(embedded[index] ?? [], configuration.dimensions),
      }));
      if (this.#generations.get(key) !== generation) return this.status(identity);
      const createdAt = this.#now().toISOString();
      this.#snapshots.set(key, { identity: structuredClone(identity), createdAt, vectors });
      const ready = {
        ...base,
        state: 'ready' as const,
        propertyIds,
        indexedRecords: vectors.length,
        createdAt,
        reason: null,
      };
      this.#states.set(key, ready);
      return structuredClone(ready);
    } catch {
      if (this.#generations.get(key) !== generation) return this.status(identity);
      const failed = { ...base, state: 'error' as const, reason: 'build_failed' as const };
      this.#states.set(key, failed);
      this.#snapshots.delete(key);
      return structuredClone(failed);
    }
  }

  async search(input: {
    identity: DatabaseSemanticIndexIdentity;
    query: string;
    allowedRecordIds: readonly string[];
    limit?: number;
  }): Promise<DatabaseSemanticSearchResult> {
    const status = this.status(input.identity);
    if (status.state !== 'ready') {
      throw new Error(`Semantic index is ${status.state}: ${status.reason ?? 'not ready'}`);
    }
    const configuration = this.#configuration as DatabaseSemanticIndexConfiguration;
    const provider = this.#provider as DatabaseEmbeddingProvider;
    const snapshot = this.#snapshots.get(
      scopeKey(input.identity.databaseId, input.identity.sourceId),
    );
    if (!snapshot) throw new Error('Semantic index ready state has no vector snapshot');
    const queryVectors = await provider.embed([input.query], { role: 'query' });
    const queryVector = normalizedVector(queryVectors[0] ?? [], configuration.dimensions);
    const allowed = new Set(input.allowedRecordIds);
    const hits = snapshot.vectors
      .filter(({ recordId }) => allowed.has(recordId))
      .map((entry) => ({
        recordId: entry.recordId,
        path: entry.path,
        revision: entry.revision,
        inputHash: entry.inputHash,
        score: entry.vector.reduce(
          (sum, value, index) => sum + value * (queryVector[index] ?? 0),
          0,
        ),
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.path.localeCompare(right.path) ||
          left.recordId.localeCompare(right.recordId),
      );
    const limit = Math.max(1, input.limit ?? 25);
    return {
      query: input.query,
      matched: hits.length,
      returned: Math.min(hits.length, limit),
      isComplete: hits.length <= limit,
      hits: hits.slice(0, limit),
      trace: {
        strategy: 'semantic_cosine',
        providerId: provider.id,
        model: provider.model,
        dimensions: provider.dimensions,
        privacy: configuration.privacy,
        propertyIds: [...status.propertyIds],
        includeBody: configuration.includeBody,
        schemaRevision: input.identity.schemaRevision,
        indexRevision: input.identity.indexRevision,
        tieBreakers: ['path', 'record_id'],
      },
    };
  }

  #resolvePropertyIds(source?: DatabaseSource): readonly string[] {
    const configured = this.#configuration?.propertyIds;
    if (configured !== 'searchable') return configured ? [...configured] : [];
    if (!source) return [];
    return source.properties
      .filter((property) => ['title', 'text', 'url', 'email', 'phone'].includes(property.type))
      .map(({ id }) => id);
  }

  #baseStatus(
    identity: DatabaseSemanticIndexIdentity,
    source?: DatabaseSource,
  ): DatabaseSemanticIndexStatus {
    const configuration = this.#configuration;
    const provider = this.#provider;
    const disabled = (
      reason: DatabaseSemanticIndexStatus['reason'],
      privacy: DatabaseSemanticPrivacyMode,
    ): DatabaseSemanticIndexStatus => ({
      ...identity,
      state: 'disabled',
      providerId: configuration?.providerId ?? null,
      model: configuration?.model ?? null,
      dimensions: configuration?.dimensions ?? null,
      privacy,
      propertyIds: this.#resolvePropertyIds(source),
      includeBody: configuration?.includeBody ?? false,
      indexedRecords: 0,
      staleRecords: 0,
      createdAt: null,
      reason,
    });
    if (!configuration?.enabled || !provider) {
      return disabled('not_configured', configuration?.privacy ?? 'blocked');
    }
    if (configuration.privacy === 'blocked') return disabled('privacy_blocked', 'blocked');
    if (provider.location === 'remote' && configuration.privacy !== 'remote_allowed') {
      return disabled('privacy_blocked', configuration.privacy);
    }
    if (
      provider.id !== configuration.providerId ||
      provider.model !== configuration.model ||
      provider.dimensions !== configuration.dimensions
    ) {
      return disabled('provider_mismatch', configuration.privacy);
    }
    return {
      ...identity,
      state: 'stale',
      providerId: provider.id,
      model: provider.model,
      dimensions: provider.dimensions,
      privacy: configuration.privacy,
      propertyIds: this.#resolvePropertyIds(source),
      includeBody: configuration.includeBody,
      indexedRecords: 0,
      staleRecords: 0,
      createdAt: null,
      reason: 'snapshot_changed',
    };
  }
}
