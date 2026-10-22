import { describe, expect, test } from 'bun:test';
import type { DatabaseRecord, DatabaseSource } from '@nedian0brien/synapsenote-core';
import {
  DATABASE_SEMANTIC_EMBED_BATCH_SIZE,
  DatabaseSemanticIndex,
  fuseDatabaseRetrieval,
} from './database-semantic-index.ts';

const hash = (value: string) => `sha256:${value.repeat(64)}`;
const identity = {
  databaseId: 'db_tasks',
  sourceId: 'ds_tasks',
  schemaRevision: hash('a'),
  indexRevision: hash('b'),
};
const source = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
} as DatabaseSource;
const records: DatabaseRecord[] = [
  {
    id: 'rec_alpha',
    databaseId: identity.databaseId,
    sourceId: identity.sourceId,
    path: 'tasks/alpha.md',
    revision: hash('c'),
    values: { prop_title: 'Alpha' },
    body: 'First body',
  },
  {
    id: 'rec_beta',
    databaseId: identity.databaseId,
    sourceId: identity.sourceId,
    path: 'tasks/beta.md',
    revision: hash('d'),
    values: { prop_title: 'Beta' },
    body: 'Second body',
  },
];

describe('DatabaseSemanticIndex', () => {
  test('fuses lexical and semantic ranks with inspectable deterministic RRF contributions', () => {
    const result = fuseDatabaseRetrieval({
      lexicalHits: [
        { recordId: 'rec_alpha', path: 'tasks/alpha.md', revision: hash('a') },
        { recordId: 'rec_beta', path: 'tasks/beta.md', revision: hash('b') },
      ],
      semanticHits: [
        { recordId: 'rec_beta', path: 'tasks/beta.md', revision: hash('b') },
        { recordId: 'rec_gamma', path: 'tasks/gamma.md', revision: hash('c') },
      ],
      lexicalWeight: 1,
      semanticWeight: 1,
    });
    expect(result.hits.map(({ recordId }) => recordId)).toEqual([
      'rec_beta',
      'rec_alpha',
      'rec_gamma',
    ]);
    expect(result.hits[0]).toMatchObject({
      ranking: {
        lexicalRank: 2,
        semanticRank: 1,
        lexicalContribution: 1 / 62,
        semanticContribution: 1 / 61,
      },
    });
    expect(result.trace).toEqual({
      strategy: 'reciprocal_rank_fusion',
      constant: 60,
      lexicalWeight: 1,
      semanticWeight: 1,
      tieBreakers: ['path', 'record_id'],
    });
  });

  test('fails closed for remote embeddings without explicit remote privacy consent', async () => {
    let calls = 0;
    const index = new DatabaseSemanticIndex({
      configuration: {
        enabled: true,
        providerId: 'provider_remote',
        model: 'embed-v1',
        dimensions: 2,
        privacy: 'local_only',
        propertyIds: ['prop_title'],
        includeBody: false,
      },
      provider: {
        id: 'provider_remote',
        model: 'embed-v1',
        dimensions: 2,
        location: 'remote',
        async embed() {
          calls += 1;
          return [];
        },
      },
    });
    expect(await index.rebuild({ identity, source, records })).toMatchObject({
      state: 'disabled',
      privacy: 'local_only',
      reason: 'privacy_blocked',
    });
    expect(calls).toBe(0);
  });

  test('tracks exact model freshness and ranks only permission-scoped records', async () => {
    const roles: string[] = [];
    const index = new DatabaseSemanticIndex({
      configuration: {
        enabled: true,
        providerId: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        privacy: 'local_only',
        propertyIds: ['prop_title'],
        includeBody: true,
      },
      provider: {
        id: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        location: 'local',
        async embed(texts, options) {
          roles.push(options.role);
          return texts.map((text) =>
            text.includes('Beta') || text === 'beta query' ? [1, 0] : [0, 1],
          );
        },
      },
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });
    expect(await index.rebuild({ identity, source, records })).toMatchObject({
      state: 'ready',
      providerId: 'provider_local',
      model: 'embed-v1',
      dimensions: 2,
      indexedRecords: 2,
    });
    const result = await index.search({
      identity,
      query: 'beta query',
      allowedRecordIds: ['rec_alpha'],
    });
    expect(result).toMatchObject({
      matched: 1,
      hits: [{ recordId: 'rec_alpha' }],
      trace: {
        strategy: 'semantic_cosine',
        providerId: 'provider_local',
        privacy: 'local_only',
        propertyIds: ['prop_title'],
        includeBody: true,
      },
    });
    expect(index.status({ ...identity, indexRevision: hash('e') })).toMatchObject({
      state: 'stale',
      staleRecords: 2,
      reason: 'snapshot_changed',
    });
    expect(roles).toEqual(['document', 'query']);
  });

  test('resolves the portable searchable projection to exact stable property IDs', async () => {
    const index = new DatabaseSemanticIndex({
      configuration: {
        enabled: true,
        providerId: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        privacy: 'local_only',
        propertyIds: 'searchable',
        includeBody: false,
      },
      provider: {
        id: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        location: 'local',
        async embed(texts) {
          return texts.map(() => [1, 0]);
        },
      },
    });
    expect(index.status(identity, source)).toMatchObject({
      state: 'stale',
      propertyIds: ['prop_title'],
    });
    expect(await index.rebuild({ identity, source, records })).toMatchObject({
      state: 'ready',
      propertyIds: ['prop_title'],
    });
  });

  test('marks an empty source ready without sending an empty provider batch', async () => {
    let calls = 0;
    const index = new DatabaseSemanticIndex({
      configuration: {
        enabled: true,
        providerId: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        privacy: 'local_only',
        propertyIds: 'searchable',
        includeBody: true,
      },
      provider: {
        id: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        location: 'local',
        async embed() {
          calls += 1;
          return [];
        },
      },
    });
    expect(await index.rebuild({ identity, source, records: [] })).toMatchObject({
      state: 'ready',
      indexedRecords: 0,
      staleRecords: 0,
    });
    expect(calls).toBe(0);
  });

  test('batches source embeddings below the provider request ceiling', async () => {
    const batchSizes: number[] = [];
    const index = new DatabaseSemanticIndex({
      configuration: {
        enabled: true,
        providerId: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        privacy: 'local_only',
        propertyIds: 'searchable',
        includeBody: false,
      },
      provider: {
        id: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        location: 'local',
        async embed(texts) {
          batchSizes.push(texts.length);
          return texts.map(() => [1, 0]);
        },
      },
    });
    const template = records[0];
    if (!template) throw new Error('semantic record fixture is missing');
    const manyRecords = Array.from(
      { length: DATABASE_SEMANTIC_EMBED_BATCH_SIZE * 2 + 1 },
      (_, offset) => ({
        ...template,
        id: `rec_${offset}`,
        path: `tasks/${offset}.md`,
      }),
    );
    expect(await index.rebuild({ identity, source, records: manyRecords })).toMatchObject({
      state: 'ready',
      indexedRecords: DATABASE_SEMANTIC_EMBED_BATCH_SIZE * 2 + 1,
    });
    expect(batchSizes).toEqual([
      DATABASE_SEMANTIC_EMBED_BATCH_SIZE,
      DATABASE_SEMANTIC_EMBED_BATCH_SIZE,
      1,
    ]);
  });
});
