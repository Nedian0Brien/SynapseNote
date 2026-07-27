import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DatabaseDefinitionSchema,
  type DatabasePublicSharePolicy,
} from '@nedian0brien/synapsenote-core';
import { createDefaultDatabaseQueryAccessResolver } from './database-access-policy.ts';
import type { DatabaseCommitEngine } from './database-commit.ts';
import { createDatabaseCommitEngine } from './database-commit.ts';
import { createDatabaseDataPlane, DatabaseDataPlaneError } from './database-data-plane.ts';
import {
  DatabaseComputedPropertyPreviewResponseSchema,
  DatabaseDescribeResponseSchema,
  DatabaseQueryResponseSchema,
} from './database-data-plane-api.ts';
import { createDatabaseFormRetentionService } from './database-form-retention.ts';
import { createDatabaseFormStateStore } from './database-form-state-store.ts';
import { createDatabasePlanEngine } from './database-plan.ts';
import { createDatabaseRecordIndex } from './database-record-index.ts';
import type { DatabaseRepairEngine } from './database-repair.ts';
import { DatabaseSemanticIndex } from './database-semantic-index.ts';
import { createDatabaseStore } from './database-store.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function definition(input: {
  id: string;
  key: string;
  name: string;
  purpose: string;
  vocabulary: string[];
}) {
  return DatabaseDefinitionSchema.parse({
    version: 1,
    id: input.id,
    key: input.key,
    name: input.name,
    aliases: input.key === 'customer-feedback' ? ['Voice of customer'] : [],
    contract: {
      purpose: input.purpose,
      canonicality: 'canonical',
      vocabulary: input.vocabulary,
      freshness: { expectation: 'daily', maxAgeSeconds: 86_400 },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: `ds_${input.key.replaceAll('-', '_')}`,
        key: input.key,
        name: input.name,
        recordMeaning: `One ${input.name.toLocaleLowerCase()} record`,
        folder: input.key,
        properties: [
          {
            id: `prop_${input.key.replaceAll('-', '_')}_title`,
            key: 'title',
            name: 'Title',
            type: 'title',
          },
          {
            id: `prop_${input.key.replaceAll('-', '_')}_score`,
            key: 'score',
            name: 'Score',
            type: 'number',
          },
          {
            id: `prop_${input.key.replaceAll('-', '_')}_code`,
            key: 'code',
            name: 'Code',
            type: 'text',
          },
          ...(input.key === 'customer-feedback'
            ? [
                {
                  id: 'prop_customer_feedback_related',
                  key: 'related-feedback',
                  name: 'Related feedback',
                  type: 'relation' as const,
                  targetSourceId: 'ds_customer_feedback',
                },
              ]
            : []),
        ],
      },
    ],
    views: [
      {
        id: `view_${input.key.replaceAll('-', '_')}_table`,
        key: 'table',
        name: 'Table',
        sourceId: `ds_${input.key.replaceAll('-', '_')}`,
        layout: { type: 'table' },
        groups: [
          {
            propertyId: `prop_${input.key.replaceAll('-', '_')}_score`,
            direction: 'desc',
          },
        ],
        projection: {
          propertyIds: [`prop_${input.key.replaceAll('-', '_')}_title`],
        },
      },
      {
        id: `view_${input.key.replaceAll('-', '_')}_agent`,
        key: 'agent-brief',
        name: 'Agent brief',
        sourceId: `ds_${input.key.replaceAll('-', '_')}`,
        layout: { type: 'agent' },
        where: {
          propertyId: `prop_${input.key.replaceAll('-', '_')}_score`,
          operator: 'gte',
          value: 5,
        },
        sort: [
          {
            propertyId: `prop_${input.key.replaceAll('-', '_')}_score`,
            direction: 'desc',
          },
        ],
        projection: {
          propertyIds: [
            `prop_${input.key.replaceAll('-', '_')}_title`,
            `prop_${input.key.replaceAll('-', '_')}_score`,
          ],
          body: 'preview',
        },
        agent: {
          semanticContract: {
            purpose: `Summarize actionable ${input.name.toLocaleLowerCase()}`,
            evidence: 'required',
            freshness: 'require_current',
          },
          tokenBudget: {
            maxTokens: 2_000,
            reserveTokens: 200,
            tokenizer: 'utf8_bytes_div3',
            encoding: 'object_rows',
          },
          scope: {
            maxRecords: 1,
            relationDepth: 0,
            relationMaxRecords: 10,
            relationFanOut: 5,
          },
          writePolicy: {
            mode: 'read_only',
            allowedActions: [],
            allowedPropertyIds: [],
            maxRecordsPerCommit: 0,
          },
        },
      },
    ],
  });
}

function record(input: {
  databaseId: string;
  sourceId: string;
  recordId: string;
  title: string;
  score: number;
  body?: string;
}): string {
  return `---\n_sn:\n  database_id: ${input.databaseId}\n  source_id: ${
    input.sourceId
  }\n  record_id: ${input.recordId}\ntitle: ${input.title}\nscore: ${
    input.score
  }\ncode: "${input.score}"\n---\n${input.body ?? 'Body'}\n`;
}

async function fixture(semanticIndex?: DatabaseSemanticIndex) {
  const projectDir = mkdtempSync(join(tmpdir(), 'synapsenote-data-plane-'));
  const contentDir = join(projectDir, 'content');
  mkdirSync(contentDir, { recursive: true });
  tempDirs.push(projectDir);
  const store = createDatabaseStore({ projectDir, contentDir });
  const feedback = definition({
    id: 'db_feedback',
    key: 'customer-feedback',
    name: 'Customer feedback',
    purpose: 'Track actionable reports from customer conversations',
    vocabulary: ['customer', 'feedback', 'voice'],
  });
  const research = definition({
    id: 'db_research',
    key: 'customer-research',
    name: 'Customer research',
    purpose: 'Track customer interviews and research sessions',
    vocabulary: ['customer', 'research', 'interview'],
  });
  await store.create(feedback);
  await store.create(research);
  mkdirSync(join(contentDir, 'customer-feedback'), { recursive: true });
  writeFileSync(
    join(contentDir, 'customer-feedback', 'alpha.md'),
    record({
      databaseId: feedback.id,
      sourceId: feedback.sources[0]?.id ?? '',
      recordId: 'rec_alpha',
      title: 'Alpha',
      score: 9,
      body: 'Checkout login latency reported by an enterprise customer.',
    }),
  );
  writeFileSync(
    join(contentDir, 'customer-feedback', 'beta.md'),
    record({
      databaseId: feedback.id,
      sourceId: feedback.sources[0]?.id ?? '',
      recordId: 'rec_beta',
      title: 'Beta',
      score: 3,
    }),
  );
  const index = createDatabaseRecordIndex({ contentDir, databaseStore: store });
  await index.rebuild();
  const plans = createDatabasePlanEngine({
    databaseStore: store,
    databaseRecordIndex: index,
    projectDir,
    contentDir,
  });
  return {
    projectDir,
    contentDir,
    store,
    index,
    plans,
    dataPlane: createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      ...(semanticIndex ? { semanticIndex } : {}),
    }),
  };
}

describe('DatabaseDataPlane', () => {
  test('binds public shares to their canonical target and projection', async () => {
    const { dataPlane } = await fixture();
    const policy = (target: DatabasePublicSharePolicy['target']): DatabasePublicSharePolicy => ({
      version: 1,
      id: 'dbshare_00000000-0000-4000-8000-000000000001',
      target,
      access: 'public',
      propertyIds: ['prop_customer_feedback_title'],
      allowBody: false,
      allowFormSubmission: false,
      expiresAt: null,
      revokedAt: null,
      tokenHash: null,
      createdBy: 'user:owner',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    });

    const databaseShare = policy({
      kind: 'database',
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
    });
    const described = dataPlane.withPublicShare(databaseShare, () =>
      dataPlane.describe({ databaseId: 'db_feedback', sourceId: 'ds_customer_feedback' }),
    );
    expect(described.source?.properties.map(({ id }) => id)).toEqual([
      'prop_customer_feedback_title',
    ]);
    const result = dataPlane.withPublicShare(databaseShare, () =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query: { select: ['prop_customer_feedback_title'] },
      }),
    );
    expect(result.records).toHaveLength(2);
    expect(Object.keys(result.records[0]?.values ?? {})).toEqual(['prop_customer_feedback_title']);
    expect(() =>
      dataPlane.withPublicShare(databaseShare, () =>
        dataPlane.describe({ databaseId: 'db_research', sourceId: 'ds_customer_research' }),
      ),
    ).toThrow(DatabaseDataPlaneError);
    expect(() =>
      dataPlane.withPublicShare(databaseShare, () =>
        dataPlane.authorizeOperation({ action: 'update_record', databaseId: 'db_feedback' }),
      ),
    ).toThrow(DatabaseDataPlaneError);

    const recordShare = policy({
      kind: 'record',
      databaseId: 'db_feedback',
      recordId: 'rec_alpha',
    });
    const recordResult = dataPlane.withPublicShare(recordShare, () =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query: { select: ['prop_customer_feedback_title'] },
      }),
    );
    expect(recordResult.records.map(({ id }) => id)).toEqual(['rec_alpha']);
  });

  test('requires view-bound public reads and validates share targets before persistence', async () => {
    const { dataPlane } = await fixture();
    expect(
      dataPlane.validatePublicShareTarget({
        target: {
          kind: 'view',
          databaseId: 'db_feedback',
          viewId: 'view_customer_feedback_table',
        },
        propertyIds: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
        allowFormSubmission: false,
      }),
    ).toEqual({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      viewId: 'view_customer_feedback_table',
      recordId: null,
    });
    expect(() =>
      dataPlane.validatePublicShareTarget({
        target: {
          kind: 'chart',
          databaseId: 'db_feedback',
          viewId: 'view_customer_feedback_table',
        },
        propertyIds: ['prop_customer_feedback_title'],
        allowFormSubmission: false,
      }),
    ).toThrow(DatabaseDataPlaneError);

    const viewShare: DatabasePublicSharePolicy = {
      version: 1,
      id: 'dbshare_00000000-0000-4000-8000-000000000002',
      target: {
        kind: 'view',
        databaseId: 'db_feedback',
        viewId: 'view_customer_feedback_table',
      },
      access: 'link',
      propertyIds: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
      allowBody: false,
      allowFormSubmission: false,
      expiresAt: null,
      revokedAt: null,
      tokenHash: `sha256:${'a'.repeat(64)}`,
      createdBy: 'user:owner',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    };
    const unbound = dataPlane.withPublicShare(viewShare, () =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query: { select: ['prop_customer_feedback_title'] },
      }),
    );
    expect(unbound.records).toEqual([]);
    expect(unbound.resultState).toMatchObject({
      emptyReason: 'permission_filtered',
      permissionFiltered: true,
    });
    const result = dataPlane.withPublicShare(viewShare, () =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_table',
        query: { select: ['prop_customer_feedback_title'] },
      }),
    );
    expect(result.savedQuery?.id).toBe('view_customer_feedback_table');
  });

  test('enforces trusted workspace access for database creation and permission management', async () => {
    const { store, index, plans } = await fixture();
    const scoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      resolveGlobalAccess: ({ action, principal }) => ({
        allowed:
          principal.kind === 'user' &&
          principal.id === 'user:builder' &&
          action === 'create_database',
        policyId: 'workspace-grant',
        policyRevision: `sha256:${'5'.repeat(64)}`,
      }),
    });
    expect(() =>
      scoped.withAccessPrincipal({ kind: 'user', id: 'user:guest' }, () =>
        scoped.authorizeOperation({ action: 'create_database' }),
      ),
    ).toThrow(DatabaseDataPlaneError);
    expect(() =>
      scoped.withAccessPrincipal({ kind: 'user', id: 'user:builder' }, () =>
        scoped.authorizeOperation({ action: 'create_database' }),
      ),
    ).not.toThrow();
    expect(() =>
      scoped.withAccessPrincipal({ kind: 'user', id: 'user:builder' }, () =>
        scoped.authorizeOperation({ action: 'manage_permissions' }),
      ),
    ).toThrow(DatabaseDataPlaneError);
  });

  test('rebuilds optional semantic state and exposes deterministic permission-scoped hybrid retrieval', async () => {
    let semanticEmbeddingCalls = 0;
    const semanticIndex = new DatabaseSemanticIndex({
      configuration: {
        enabled: true,
        providerId: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        privacy: 'local_only',
        propertyIds: ['prop_customer_feedback_title'],
        includeBody: false,
      },
      provider: {
        id: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        location: 'local',
        async embed(texts) {
          semanticEmbeddingCalls += 1;
          return texts.map((text) => (text.includes('Beta') || text === 'body' ? [1, 0] : [0, 1]));
        },
      },
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    });
    const { dataPlane, index, store } = await fixture(semanticIndex);
    expect(
      await dataPlane.rebuildSemanticIndex({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
      }),
    ).toMatchObject({
      state: 'ready',
      indexedRecords: 2,
      privacy: 'local_only',
    });
    const hybrid = await dataPlane.retrieve({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'body',
      mode: 'hybrid',
      propertyIds: ['prop_customer_feedback_title'],
      includeBody: true,
    });
    expect(hybrid).toMatchObject({
      requestedMode: 'hybrid',
      appliedMode: 'hybrid',
      degradedReason: null,
      semanticIndex: {
        state: 'ready',
        providerId: 'provider_local',
        model: 'embed-v1',
      },
      ranking: {
        trace: { strategy: 'reciprocal_rank_fusion', constant: 60 },
      },
    });
    expect(hybrid.ranking.hits[0]?.recordId).toBe('rec_beta');
    expect(hybrid.semantic?.trace).toMatchObject({
      privacy: 'local_only',
      propertyIds: ['prop_customer_feedback_title'],
    });

    const rowScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      semanticIndex,
      resolveQueryAccess: () => ({
        policyId: 'semantic-row-scope',
        policyRevision: `sha256:${'a'.repeat(64)}`,
        allowedRecordIds: ['rec_beta'],
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    const scoped = await rowScoped.retrieve({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'body',
      mode: 'hybrid',
      propertyIds: ['prop_customer_feedback_title'],
    });
    expect(scoped.ranking.hits.map(({ recordId }) => recordId)).toEqual(['rec_beta']);
    expect(scoped.permissionExclusions).toMatchObject({
      records: 1,
      properties: 3,
    });
    expect(scoped.semanticIndex).toMatchObject({
      indexedRecords: 1,
      createdAt: null,
    });
    expect(
      rowScoped.semanticIndexStatus({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
      }),
    ).toMatchObject({ indexedRecords: 1, createdAt: null });
    const callsBeforeDeniedRebuild = semanticEmbeddingCalls;
    await expect(
      rowScoped.rebuildSemanticIndex({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
      }),
    ).rejects.toMatchObject({ code: 'permission_denied' });
    expect(semanticEmbeddingCalls).toBe(callsBeforeDeniedRebuild);
    expect(JSON.stringify(scoped)).not.toContain('rec_alpha');

    let deniedProviderCalls = 0;
    const projectionDenied = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      semanticIndex: new DatabaseSemanticIndex({
        configuration: {
          enabled: true,
          providerId: 'provider_local',
          model: 'embed-v1',
          dimensions: 2,
          privacy: 'local_only',
          propertyIds: ['prop_customer_feedback_title'],
          includeBody: false,
        },
        provider: {
          id: 'provider_local',
          model: 'embed-v1',
          dimensions: 2,
          location: 'local',
          async embed(texts) {
            deniedProviderCalls += 1;
            return texts.map(() => [1, 0]);
          },
        },
      }),
      resolveQueryAccess: () => ({
        policyId: 'semantic-property-scope',
        policyRevision: `sha256:${'b'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_score'],
      }),
    });
    await expect(
      projectionDenied.retrieve({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        text: 'body',
        mode: 'semantic',
        propertyIds: ['prop_customer_feedback_score'],
      }),
    ).rejects.toMatchObject({ code: 'permission_denied' });
    expect(deniedProviderCalls).toBe(0);

    index.upsertPath(
      'customer-feedback/beta.md',
      record({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        recordId: 'rec_beta',
        title: 'Beta changed',
        score: 3,
      }),
    );
    const scopedStale = await rowScoped.retrieve({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'body',
      mode: 'hybrid',
      propertyIds: ['prop_customer_feedback_title'],
    });
    expect(scopedStale).toMatchObject({
      appliedMode: 'lexical',
      degradedReason: 'semantic_not_ready',
      semanticIndex: { state: 'stale', indexedRecords: 1, createdAt: null },
    });
    expect(semanticEmbeddingCalls).toBe(callsBeforeDeniedRebuild);
    const refreshed = await dataPlane.retrieve({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'body',
      mode: 'hybrid',
      propertyIds: ['prop_customer_feedback_title'],
    });
    expect(refreshed).toMatchObject({
      appliedMode: 'hybrid',
      degradedReason: null,
      semanticIndex: { state: 'ready', indexedRecords: 2 },
    });

    dataPlane.configureSemanticIndex(new DatabaseSemanticIndex());
    const degraded = await dataPlane.retrieve({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'body',
      mode: 'hybrid',
      propertyIds: ['prop_customer_feedback_title'],
    });
    expect(degraded).toMatchObject({
      appliedMode: 'lexical',
      degradedReason: 'semantic_not_ready',
      semantic: null,
      semanticIndex: { state: 'disabled', reason: 'not_configured' },
    });
    await expect(
      dataPlane.retrieve({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        text: 'body',
        mode: 'hybrid',
        propertyIds: ['prop_customer_feedback_title'],
        requireSemantic: true,
      }),
    ).rejects.toMatchObject({ code: 'semantic_index_unavailable' });
  });

  test('submits a public Form through schema validation, conditional visibility, replay, and duplicate guards', async () => {
    const { projectDir, contentDir, store, index, plans } = await fixture();
    const current = store.snapshot().databases.find((candidate) => candidate.id === 'db_feedback');
    if (!current) throw new Error('expected feedback database');
    const formDefinition = DatabaseDefinitionSchema.parse({
      ...current,
      sources: current.sources.map((source) =>
        source.id === 'ds_customer_feedback'
          ? {
              ...source,
              properties: [
                ...source.properties,
                {
                  id: 'prop_customer_feedback_files',
                  key: 'files',
                  name: 'Files',
                  type: 'files',
                },
              ],
            }
          : source,
      ),
      views: [
        ...current.views,
        {
          id: 'view_customer_feedback_form',
          key: 'feedback-form',
          name: 'Feedback form',
          sourceId: 'ds_customer_feedback',
          layout: {
            type: 'form',
            configuration: {
              access: 'public',
              title: 'Send feedback',
              questions: [
                {
                  id: 'frmq_001_title',
                  propertyId: 'prop_customer_feedback_title',
                  label: 'Title',
                  required: true,
                },
                {
                  id: 'frmq_002_score',
                  propertyId: 'prop_customer_feedback_score',
                  label: 'Score',
                  required: true,
                },
                {
                  id: 'frmq_003_code',
                  propertyId: 'prop_customer_feedback_code',
                  label: 'Code',
                  required: true,
                  visibleWhen: {
                    mode: 'all',
                    conditions: [
                      {
                        questionId: 'frmq_002_score',
                        operator: 'equals',
                        value: 9,
                      },
                    ],
                  },
                },
                {
                  id: 'frmq_004_files',
                  propertyId: 'prop_customer_feedback_files',
                  label: 'Files',
                  required: false,
                },
              ],
              fileUploads: { enabled: true, maxFilesPerQuestion: 2 },
              duplicateSubmission: {
                type: 'reject_property',
                propertyId: 'prop_customer_feedback_code',
              },
              closesAt: '2026-07-22T00:00:00.000Z',
              spamProtection: {
                honeypot: true,
                minimumCompletionSeconds: 2,
                rateLimit: { maxSubmissions: 3, windowSeconds: 60 },
              },
              retention: { type: 'delete_after', days: 1 },
            },
          },
          projection: {
            propertyIds: [
              'prop_customer_feedback_title',
              'prop_customer_feedback_score',
              'prop_customer_feedback_code',
              'prop_customer_feedback_files',
            ],
          },
        },
      ],
    });
    const publicForm = formDefinition.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_form',
    );
    if (!publicForm || publicForm.layout.type !== 'form') throw new Error('expected Form view');
    const testedDefinition = DatabaseDefinitionSchema.parse({
      ...formDefinition,
      views: [
        ...formDefinition.views,
        {
          ...structuredClone(publicForm),
          id: 'view_customer_feedback_internal_form',
          key: 'feedback-internal-form',
          layout: {
            type: 'form',
            configuration: {
              ...structuredClone(publicForm.layout.configuration),
              access: 'internal',
            },
          },
        },
        {
          ...structuredClone(publicForm),
          id: 'view_customer_feedback_closed_form',
          key: 'feedback-closed-form',
          layout: {
            type: 'form',
            configuration: {
              ...structuredClone(publicForm.layout.configuration),
              closesAt: '2026-07-21T11:00:00.000Z',
            },
          },
        },
      ],
    });
    await store.update(testedDefinition.id, testedDefinition);
    await index.rebuild();
    const formStateStore = createDatabaseFormStateStore(projectDir);
    const automationEvents = new Map<string, { kind: string; viewId?: string | null }>();
    const publishAutomationEvent = async (event: {
      deduplicationKey: string;
      kind: string;
      viewId?: string | null;
    }) => {
      automationEvents.set(event.deduplicationKey, event);
    };
    const dataPlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      formStateStore,
      publishAutomationEvent,
      now: () => new Date('2026-07-21T12:00:00.000Z'),
    });
    let snapshot = 0;
    const commitEngine = createDatabaseCommitEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      git: {
        snapshot: async () => String(++snapshot).repeat(40).slice(0, 40),
        hashBlob: async () => `sha1:${'a'.repeat(40)}`,
      },
    });
    dataPlane.configureCommitEngine(commitEngine);
    const publicFormPolicy: DatabasePublicSharePolicy = {
      version: 1,
      id: 'dbshare_00000000-0000-4000-8000-000000000003',
      target: {
        kind: 'form',
        databaseId: 'db_feedback',
        viewId: 'view_customer_feedback_form',
      },
      access: 'public',
      propertyIds: [
        'prop_customer_feedback_title',
        'prop_customer_feedback_score',
        'prop_customer_feedback_code',
        'prop_customer_feedback_files',
      ],
      allowBody: false,
      allowFormSubmission: true,
      expiresAt: null,
      revokedAt: null,
      tokenHash: null,
      createdBy: 'user:owner',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    };
    expect(
      dataPlane.validatePublicShareTarget({
        target: publicFormPolicy.target,
        propertyIds: publicFormPolicy.propertyIds,
        allowFormSubmission: true,
      }),
    ).toMatchObject({ viewId: 'view_customer_feedback_form' });
    expect(() =>
      dataPlane.validatePublicShareTarget({
        target: publicFormPolicy.target,
        propertyIds: ['prop_customer_feedback_title'],
        allowFormSubmission: true,
      }),
    ).toThrow(DatabaseDataPlaneError);
    const publicDescription = dataPlane.withPublicShare(publicFormPolicy, () =>
      dataPlane.describe({ databaseId: 'db_feedback' }),
    );
    expect(publicDescription.database.views).toMatchObject([
      {
        id: 'view_customer_feedback_form',
        layout: { type: 'form', configuration: { questions: expect.any(Array) } },
      },
    ]);
    expect(
      await dataPlane.authorizeFormUpload({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_form',
        remoteAddress: '203.0.113.10',
      }),
    ).toEqual({ parentDocName: 'customer-feedback/form-response' });

    await expect(
      dataPlane.submitForm({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_internal_form',
        submissionId: 'sub_internal_remote_1',
        startedAt: '2026-07-21T11:59:50.000Z',
        remoteAddress: '203.0.113.10',
        answers: {},
      }),
    ).rejects.toMatchObject({ code: 'form_access_denied' });
    await expect(
      dataPlane.submitForm({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_closed_form',
        submissionId: 'sub_closed_form_1',
        startedAt: '2026-07-21T11:59:50.000Z',
        remoteAddress: '203.0.113.10',
        answers: {},
      }),
    ).rejects.toMatchObject({ code: 'form_closed' });
    await expect(
      dataPlane.submitForm({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_form',
        submissionId: 'sub_honeypot_1',
        startedAt: '2026-07-21T11:59:50.000Z',
        remoteAddress: '203.0.113.10',
        honeypot: 'spam',
        answers: {},
      }),
    ).rejects.toMatchObject({ code: 'form_invalid_submission' });
    await expect(
      dataPlane.submitForm({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_form',
        submissionId: 'sub_too_fast_1',
        startedAt: '2026-07-21T11:59:59.500Z',
        remoteAddress: '203.0.113.10',
        answers: {},
      }),
    ).rejects.toMatchObject({ code: 'form_invalid_submission' });

    await expect(
      dataPlane.submitForm({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_form',
        submissionId: 'sub_hidden_answer_1',
        startedAt: '2026-07-21T11:59:50.000Z',
        remoteAddress: '203.0.113.10',
        answers: {
          prop_customer_feedback_title: 'Hidden answer',
          prop_customer_feedback_score: 3,
          prop_customer_feedback_code: 'should-not-be-visible',
        },
      }),
    ).rejects.toMatchObject({ code: 'form_invalid_submission' });

    const request = {
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      viewId: 'view_customer_feedback_form',
      submissionId: 'sub_valid_response_1',
      startedAt: '2026-07-21T11:59:50.000Z',
      remoteAddress: '203.0.113.10',
      answers: {
        prop_customer_feedback_title: 'Public report',
        prop_customer_feedback_score: 9,
        prop_customer_feedback_code: 'public-unique-code',
      },
    } as const;
    const submitted = await dataPlane.withPublicShare(publicFormPolicy, () =>
      dataPlane.submitForm(request),
    );
    expect(submitted).toMatchObject({
      status: 'created',
      idempotentReplay: false,
      confirmation: { title: 'Response submitted' },
    });
    expect((await dataPlane.submitForm(request)).idempotentReplay).toBe(true);
    const restartedDataPlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      formStateStore: createDatabaseFormStateStore(projectDir),
      now: () => new Date('2026-07-21T12:00:00.000Z'),
      publishAutomationEvent,
    });
    restartedDataPlane.configureCommitEngine(commitEngine);
    expect((await restartedDataPlane.submitForm(request)).idempotentReplay).toBe(true);
    expect([...automationEvents.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'record_added' }),
        expect.objectContaining({
          kind: 'form_submitted',
          viewId: 'view_customer_feedback_form',
        }),
      ]),
    );
    expect(
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query: {
          where: {
            propertyId: 'prop_customer_feedback_code',
            operator: 'eq',
            value: 'public-unique-code',
          },
        },
      }).records,
    ).toEqual([
      expect.objectContaining({
        id: submitted.recordId,
        values: expect.objectContaining({
          prop_customer_feedback_title: 'Public report',
          prop_customer_feedback_score: 9,
          prop_customer_feedback_code: 'public-unique-code',
        }),
      }),
    ]);
    await expect(
      dataPlane.submitForm({
        ...request,
        submissionId: 'sub_duplicate_code_2',
      }),
    ).rejects.toMatchObject({ code: 'form_duplicate_submission' });
    await expect(
      dataPlane.submitForm({
        ...request,
        submissionId: 'sub_rate_limited_3',
        answers: {
          ...request.answers,
          prop_customer_feedback_code: 'another-code',
        },
      }),
    ).rejects.toMatchObject({ code: 'form_rate_limited' });
    const restartedAfterLimit = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      formStateStore: createDatabaseFormStateStore(projectDir),
      now: () => new Date('2026-07-21T12:00:00.000Z'),
    });
    restartedAfterLimit.configureCommitEngine(commitEngine);
    await expect(
      restartedAfterLimit.submitForm({
        ...request,
        submissionId: 'sub_rate_limited_after_restart',
        answers: {
          ...request.answers,
          prop_customer_feedback_code: 'after-restart-code',
        },
      }),
    ).rejects.toMatchObject({ code: 'form_rate_limited' });

    const retention = createDatabaseFormRetentionService({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      databaseCommitEngine: commitEngine,
      formStateStore,
      now: () => new Date('2026-07-23T12:00:00.000Z'),
    });
    expect(await retention.run()).toMatchObject({
      deleted: [submitted.recordId],
      failed: [],
    });
    expect(index.getById(submitted.recordId)).toBeNull();
  });

  test('previews a complete property conversion as one exact schema and record plan', async () => {
    const { dataPlane } = await fixture();
    const described = dataPlane.describe({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
    });
    const sourceProperty = described.source?.properties.find(
      (property) => property.id === 'prop_customer_feedback_code',
    );
    if (!sourceProperty) throw new Error('expected conversion source property');
    const result = dataPlane.previewPropertyConversion({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      propertyId: sourceProperty.id,
      targetProperty: { ...sourceProperty, type: 'number' },
    });

    expect(result.preview).toMatchObject({
      committable: true,
      requiresLossyApproval: false,
      summary: { total: 2, converted: 2, blocked: 0 },
    });
    expect(result.draft?.normalized.recordMutations).toHaveLength(2);
    expect(result.plan).toMatchObject({ committable: true, conflicts: [] });
    expect(result.plan?.normalizedOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'alter_schema', action: 'update' }),
        expect.objectContaining({
          kind: 'mutate_record',
          recordId: 'rec_alpha',
        }),
        expect.objectContaining({
          kind: 'mutate_record',
          recordId: 'rec_beta',
        }),
      ]),
    );
  });

  test('refuses incomplete permission scope and conditional conversion failures', async () => {
    const { store, index, dataPlane } = await fixture();
    const described = dataPlane.describe({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
    });
    const sourceProperty = described.source?.properties.find(
      (property) => property.id === 'prop_customer_feedback_title',
    );
    if (!sourceProperty) throw new Error('expected conversion source property');
    const blocked = dataPlane.previewPropertyConversion({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      propertyId: sourceProperty.id,
      targetProperty: { ...sourceProperty, type: 'number' },
    });
    expect(blocked.preview.committable).toBe(false);
    expect(blocked.plan).toBeNull();
    expect(blocked.preview.summary.blocked).toBe(2);

    const scoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'partial',
        policyRevision: `sha256:${'a'.repeat(64)}`,
        allowedRecordIds: ['rec_alpha'],
        allowedPropertyIds: null,
      }),
    });
    expect(() =>
      scoped.previewPropertyConversion({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        propertyId: sourceProperty.id,
        targetProperty: { ...sourceProperty, type: 'text' },
      }),
    ).toThrow(DatabaseDataPlaneError);
  });

  test('commits and exactly undoes a property conversion through the common transaction', async () => {
    const { projectDir, contentDir, store, index, plans, dataPlane } = await fixture();
    const described = dataPlane.describe({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
    });
    const sourceProperty = described.source?.properties.find(
      (property) => property.id === 'prop_customer_feedback_code',
    );
    if (!sourceProperty) throw new Error('expected conversion source property');
    const conversion = dataPlane.previewPropertyConversion({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      propertyId: sourceProperty.id,
      targetProperty: { ...sourceProperty, type: 'number' },
    });
    if (!conversion.plan) throw new Error('expected exact conversion plan');
    const conversionPlan = conversion.plan;
    let snapshot = 0;
    const commits = createDatabaseCommitEngine({
      projectDir,
      contentDir,
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      git: {
        snapshot: async () => String(++snapshot).repeat(40).slice(0, 40),
        hashBlob: async () => `sha1:${'a'.repeat(40)}`,
      },
    });
    dataPlane.configureCommitEngine(commits);
    const deniedAgent = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      resolveQueryAccess: createDefaultDatabaseQueryAccessResolver(),
      bindMutationActorToAccessPrincipal: true,
    });
    deniedAgent.configureCommitEngine(commits);
    expect(() =>
      deniedAgent.withAccessPrincipal(
        {
          kind: 'agent',
          id: 'agent:session-one',
          invokingUserId: 'user:local-owner',
          sessionId: 'session-one',
        },
        () => deniedAgent.getPlan(conversionPlan.id),
      ),
    ).toThrow(DatabaseDataPlaneError);
    await expect(
      deniedAgent.withAccessPrincipal(
        {
          kind: 'agent',
          id: 'agent:session-one',
          invokingUserId: 'user:local-owner',
          sessionId: 'session-one',
        },
        () =>
          deniedAgent.commit({
            planId: conversionPlan.id,
            planHash: conversionPlan.hash,
            expectedSnapshotRevision: conversionPlan.snapshotRevision,
            idempotencyKey: 'conversion-denied-agent',
            approvalToken: commits.expectedApprovalToken(conversionPlan.hash),
            actor: { principalId: 'human:forged-owner', kind: 'human' },
          }),
      ),
    ).rejects.toMatchObject({ code: 'permission_denied' });

    const boundUser = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      resolveQueryAccess: createDefaultDatabaseQueryAccessResolver(),
      bindMutationActorToAccessPrincipal: true,
    });
    boundUser.configureCommitEngine(commits);
    const committed = await boundUser.commit({
      planId: conversionPlan.id,
      planHash: conversionPlan.hash,
      expectedSnapshotRevision: conversionPlan.snapshotRevision,
      idempotencyKey: 'conversion-commit-1',
      approvalToken: commits.expectedApprovalToken(conversionPlan.hash),
      actor: {
        principalId: 'agent:forged',
        kind: 'agent',
        sessionId: 'forged',
      },
    });
    expect(committed.verification.status).toBe('passed');
    expect(committed.auditReceipt.actor).toEqual({
      principalId: 'user:local-owner',
      kind: 'human',
    });
    expect(
      dataPlane
        .describe({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
        })
        .source?.properties.find((property) => property.id === sourceProperty.id)?.type,
    ).toBe('number');
    expect(
      dataPlane
        .query({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
          query: { select: [sourceProperty.id], sort: [] },
        })
        .records.map((record) => record.values[sourceProperty.id]),
    ).toEqual([9, 3]);

    const undoPreview = await dataPlane.undo({
      action: 'preview',
      undoToken: committed.undoToken,
    });
    expect(undoPreview.canApply).toBe(true);
    const undone = await dataPlane.undo({
      action: 'apply',
      undoToken: committed.undoToken,
      idempotencyKey: 'conversion-undo-1',
      actor: { principalId: 'human:owner', kind: 'human' },
    });
    expect(undone.receipt?.status).toBe('applied');
    expect(
      dataPlane
        .describe({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
        })
        .source?.properties.find((property) => property.id === sourceProperty.id)?.type,
    ).toBe('text');
    expect(
      dataPlane
        .query({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
          query: { select: [sourceProperty.id], sort: [] },
        })
        .records.map((record) => record.values[sourceProperty.id]),
    ).toEqual(['9', '3']);
  });

  test('projects Person cards only after row and property permissions', async () => {
    const { contentDir, store, index } = await fixture();
    const peopleDatabase = DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_people_tasks',
      key: 'people-tasks',
      name: 'People tasks',
      people: [
        {
          id: 'person_owner',
          key: 'owner',
          name: 'Owner',
          kind: 'local',
          subjectId: 'principal-owner',
        },
        {
          id: 'person_codex',
          key: 'codex',
          name: 'Codex',
          kind: 'agent',
          subjectId: 'agent:codex',
        },
      ],
      contract: {
        purpose: 'Track permission-safe Person values',
        canonicality: 'canonical',
        vocabulary: ['task', 'owner'],
        freshness: { expectation: 'realtime' },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_people_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          folder: 'people-tasks',
          properties: [
            {
              id: 'prop_people_title',
              key: 'title',
              name: 'Title',
              type: 'title',
            },
            {
              id: 'prop_people_owners',
              key: 'owners',
              name: 'Owners',
              type: 'person',
              multiple: true,
            },
          ],
        },
      ],
    });
    await store.create(peopleDatabase);
    mkdirSync(join(contentDir, 'people-tasks'), { recursive: true });
    writeFileSync(
      join(contentDir, 'people-tasks', 'one.md'),
      `---\n_sn:\n  database_id: db_people_tasks\n  source_id: ds_people_tasks\n  record_id: rec_people_one\ntitle: One\nowners:\n  - owner\n  - codex\n---\nBody\n`,
    );
    await index.rebuild();

    const hidden = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'hide-person',
        policyRevision: `sha256:${'a'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_people_title'],
      }),
    }).query({
      databaseId: peopleDatabase.id,
      sourceId: 'ds_people_tasks',
      query: { select: ['prop_people_title', 'prop_people_owners'] },
    });
    expect(hidden.records[0]?.values).toEqual({ prop_people_title: 'One' });
    expect(hidden.people).toEqual([]);

    const visiblePlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
    });
    const visible = visiblePlane.query({
      databaseId: peopleDatabase.id,
      sourceId: 'ds_people_tasks',
      query: { select: ['prop_people_owners'] },
    });
    expect(visible.people?.map((person) => person.id)).toEqual(['person_owner', 'person_codex']);
    expect(JSON.stringify(visible.people)).not.toContain('subjectId');
    expect(DatabaseQueryResponseSchema.safeParse(visible).success).toBe(true);
  });

  test('projects permission-safe local file availability without duplicating external URLs', async () => {
    const { contentDir, store, index } = await fixture();
    const filesDatabase = DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_file_tasks',
      key: 'file-tasks',
      name: 'File tasks',
      contract: {
        purpose: 'Track file deliverables',
        canonicality: 'canonical',
        vocabulary: ['file'],
        freshness: { expectation: 'realtime' },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_file_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          folder: 'file-tasks',
          properties: [
            {
              id: 'prop_file_title',
              key: 'title',
              name: 'Title',
              type: 'title',
            },
            {
              id: 'prop_file_assets',
              key: 'assets',
              name: 'Assets',
              type: 'files',
            },
          ],
        },
      ],
    });
    await store.create(filesDatabase);
    mkdirSync(join(contentDir, 'file-tasks'), { recursive: true });
    mkdirSync(join(contentDir, 'assets'), { recursive: true });
    writeFileSync(join(contentDir, 'assets', 'available.pdf'), 'available');
    writeFileSync(
      join(contentDir, 'file-tasks', 'one.md'),
      `---
_sn:
  database_id: db_file_tasks
  source_id: ds_file_tasks
  record_id: rec_file_one
title: One
assets:
  - kind: local
    path: assets/available.pdf
  - kind: local
    path: assets/missing.pdf
  - kind: external
    url: https://cdn.example.com/demo.mp4
---
Body
`,
    );
    await index.rebuild();

    const hidden = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'hide-files',
        policyRevision: `sha256:${'b'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_file_title'],
      }),
    }).query({
      databaseId: filesDatabase.id,
      sourceId: 'ds_file_tasks',
      query: { select: ['prop_file_title', 'prop_file_assets'] },
    });
    expect(hidden.fileStates).toBeUndefined();

    const visiblePlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
    });
    const visible = visiblePlane.query({
      databaseId: filesDatabase.id,
      sourceId: 'ds_file_tasks',
      query: { select: ['prop_file_assets'] },
    });
    expect(visible.fileStates).toEqual({
      'assets/available.pdf': 'available',
      'assets/missing.pdf': 'missing',
    });
    expect(JSON.stringify(visible.fileStates)).not.toContain('cdn.example.com');
    expect(DatabaseQueryResponseSchema.safeParse(visible).success).toBe(true);
    const pack = visiblePlane.pack({
      databaseId: filesDatabase.id,
      sourceId: 'ds_file_tasks',
      goal: 'Inspect deliverable availability',
      propertyIds: ['prop_file_assets'],
      maxTokens: 2_000,
      reserveTokens: 0,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
    });
    expect(pack.fileStates).toEqual(visible.fileStates);
  });

  test('projects minimal relation cards only when the target record and title are readable', async () => {
    const { contentDir, store, index } = await fixture();
    const relationsDatabase = DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_relation_tasks',
      key: 'relation-tasks',
      name: 'Relation tasks',
      contract: {
        purpose: 'Track permission-safe relation values',
        canonicality: 'canonical',
        vocabulary: ['task', 'project'],
        freshness: { expectation: 'realtime' },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_relation_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          folder: 'relation-tasks',
          properties: [
            {
              id: 'prop_relation_task_title',
              key: 'title',
              name: 'Title',
              type: 'title',
            },
            {
              id: 'prop_relation_project',
              key: 'project',
              name: 'Project',
              type: 'relation',
              targetSourceId: 'ds_relation_projects',
              cardinality: 'one',
            },
          ],
        },
        {
          id: 'ds_relation_projects',
          key: 'projects',
          name: 'Projects',
          recordMeaning: 'One project',
          folder: 'relation-projects',
          properties: [
            {
              id: 'prop_relation_project_title',
              key: 'title',
              name: 'Title',
              type: 'title',
            },
          ],
        },
      ],
    });
    await store.create(relationsDatabase);
    mkdirSync(join(contentDir, 'relation-tasks'), { recursive: true });
    mkdirSync(join(contentDir, 'relation-projects'), { recursive: true });
    writeFileSync(
      join(contentDir, 'relation-tasks', 'one.md'),
      `---\n_sn:\n  database_id: db_relation_tasks\n  source_id: ds_relation_tasks\n  record_id: rec_relation_task\ntitle: Ship\nproject: rec_relation_project\n---\nBody\n`,
    );
    writeFileSync(
      join(contentDir, 'relation-projects', 'alpha.md'),
      `---\n_sn:\n  database_id: db_relation_tasks\n  source_id: ds_relation_projects\n  record_id: rec_relation_project\ntitle: Alpha\n---\nBody\n`,
    );
    await index.rebuild();

    let targetPolicyRevision = `sha256:${'c'.repeat(64)}`;
    let targetRecordIds: string[] = [];
    const scopedPlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: ({ source }) => ({
        policyId: 'relation-scope',
        policyRevision:
          source.id === 'ds_relation_projects' ? targetPolicyRevision : `sha256:${'e'.repeat(64)}`,
        allowedRecordIds: source.id === 'ds_relation_projects' ? targetRecordIds : null,
        allowedPropertyIds: null,
      }),
    });
    const denied = scopedPlane.query({
      databaseId: relationsDatabase.id,
      sourceId: 'ds_relation_tasks',
      query: { select: ['prop_relation_project'] },
    });
    expect(denied.records[0]?.values.prop_relation_project).toBe('rec_relation_project');
    expect(denied.relationRecords).toEqual([]);

    targetPolicyRevision = `sha256:${'d'.repeat(64)}`;
    targetRecordIds = ['rec_relation_project'];
    const newlyVisible = scopedPlane.query({
      databaseId: relationsDatabase.id,
      sourceId: 'ds_relation_tasks',
      query: { select: ['prop_relation_project'] },
    });
    expect(newlyVisible.queryId).not.toBe(denied.queryId);
    expect(newlyVisible.snapshotRevision).not.toBe(denied.snapshotRevision);
    expect(newlyVisible.relationRecords?.map((record) => record.id)).toEqual([
      'rec_relation_project',
    ]);

    const visible = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
    }).query({
      databaseId: relationsDatabase.id,
      sourceId: 'ds_relation_tasks',
      query: { select: ['prop_relation_project'] },
    });
    expect(visible.relationRecords).toEqual([
      {
        id: 'rec_relation_project',
        sourceId: 'ds_relation_projects',
        title: 'Alpha',
      },
    ]);
    expect(DatabaseQueryResponseSchema.safeParse(visible).success).toBe(true);
  });

  test('continues a stateless query cursor after rebuilding the index and data plane', async () => {
    const { contentDir, store, index, dataPlane } = await fixture();
    const first = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: { page: { limit: 1 } },
    });
    const cursor = first.nextCursor;
    if (!cursor) throw new Error('durable pagination fixture must have a continuation cursor');

    const originalRevision = index.snapshot().revision;
    const rebuiltIndex = createDatabaseRecordIndex({
      contentDir,
      databaseStore: store,
    });
    await rebuiltIndex.rebuild();
    expect(rebuiltIndex.snapshot().revision).toBe(originalRevision);

    const rebuiltDataPlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: rebuiltIndex,
    });
    const second = rebuiltDataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: { page: { limit: 1, cursor } },
    });

    expect(first.records.map((entry) => entry.id)).toEqual(['rec_alpha']);
    expect(second).toMatchObject({
      matched: 2,
      returned: 1,
      isComplete: true,
      nextCursor: null,
      snapshotRevision: first.snapshotRevision,
      records: [{ id: 'rec_beta' }],
    });
  });

  test('refuses every canonical read while a database transaction is active', async () => {
    const { dataPlane } = await fixture();
    dataPlane.configureCommitEngine({
      isTransactionActive: () => true,
    } as unknown as DatabaseCommitEngine);
    for (const read of [
      () => dataPlane.catalog(),
      () => dataPlane.describe({ databaseId: 'db_feedback' }),
      () =>
        dataPlane.query({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
        }),
      () => dataPlane.createPlan('draft_unavailable_during_transaction'),
    ]) {
      expect(read).toThrow(DatabaseDataPlaneError);
      try {
        read();
      } catch (error) {
        expect(error).toMatchObject({ code: 'transaction_in_progress' });
      }
    }
  });

  test('refuses every canonical read while a repair transaction is active', async () => {
    const { dataPlane } = await fixture();
    dataPlane.configureRepairEngine({
      isTransactionActive: () => true,
    } as unknown as DatabaseRepairEngine);
    for (const read of [
      () => dataPlane.catalog(),
      () => dataPlane.describe({ databaseId: 'db_feedback' }),
      () =>
        dataPlane.query({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
        }),
      () => dataPlane.createPlan('draft_unavailable_during_repair'),
    ]) {
      expect(read).toThrow(DatabaseDataPlaneError);
      try {
        read();
      } catch (error) {
        expect(error).toMatchObject({ code: 'transaction_in_progress' });
      }
    }
  });

  test('refuses canonical reads while Git exposes a partial database transition', async () => {
    const { store, index, plans } = await fixture();
    const dataPlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      isCanonicalTransitionActive: () => true,
    });
    expect(() => dataPlane.catalog()).toThrow(DatabaseDataPlaneError);
    try {
      dataPlane.catalog();
    } catch (error) {
      expect(error).toMatchObject({ code: 'transaction_in_progress' });
    }
  });

  test('blocks every v2 and v1 mutation while a migration gate is held', async () => {
    const { store, index, plans } = await fixture();
    const dataPlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      isDatabaseMigrationActive: () => ({ taskId: 'task_migration_freeze' }),
    });
    expect(() => dataPlane.catalog()).toThrow(DatabaseDataPlaneError);
    try {
      dataPlane.catalog();
    } catch (error) {
      expect(error).toMatchObject({ code: 'transaction_in_progress', details: { taskId: 'task_migration_freeze' } });
    }
    await expect(dataPlane.commit({} as never)).rejects.toMatchObject({
      code: 'transaction_in_progress',
      details: { taskId: 'task_migration_freeze' },
    });
    await expect(
      dataPlane.mutateMarkdownTable({ operation: 'update_cell', input: {} } as never),
    ).rejects.toMatchObject({ code: 'transaction_in_progress', details: { taskId: 'task_migration_freeze' } });
  });

  test('returns compact ranked catalog candidates without silently resolving ambiguity', async () => {
    const { dataPlane } = await fixture();
    const catalog = dataPlane.catalog('customer');
    expect(catalog).toMatchObject({ complete: true, query: 'customer' });
    expect(catalog.candidates.map((candidate) => candidate.id)).toEqual([
      'db_feedback',
      'db_research',
    ]);
    expect(catalog.candidates[0]).toMatchObject({
      purpose: 'Track actionable reports from customer conversations',
      viewCount: 2,
      relationCount: 1,
    });
    expect(catalog.candidates[0]?.schemaRevision).toMatch(/^sha256:/);
    expect(catalog.candidates[0]?.sources[0]).toMatchObject({
      id: 'ds_customer_feedback',
      recordMeaning: 'One customer feedback record',
      propertyCount: 4,
    });
    expect(catalog.candidates.every((candidate) => candidate.matchedBy.length > 0)).toBe(true);
    expect(dataPlane.catalog('related').candidates).toEqual([
      expect.objectContaining({
        id: 'db_feedback',
        relationCount: 1,
        matchedBy: expect.arrayContaining(['relation_key', 'relation_name']),
      }),
    ]);
    expect(dataPlane.catalogIfChanged('customer', catalog.catalogRevision)).toEqual({
      notModified: true,
      query: 'customer',
      manifestRevision: catalog.manifestRevision,
      catalogRevision: catalog.catalogRevision,
    });
    expect(dataPlane.catalogIfChanged('different', catalog.catalogRevision)).toMatchObject({
      complete: true,
      query: 'different',
    });
  });

  test('filters catalog metadata and cache revisions before candidate ranking', async () => {
    const { dataPlane: unrestricted, store, index, plans } = await fixture();
    const scoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      resolveQueryAccess: ({ database }) => ({
        allowed: database.id === 'db_feedback',
        policyId: 'policy_catalog_scope',
        policyRevision: `sha256:${'9'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: database.id === 'db_feedback' ? ['prop_customer_feedback_title'] : [],
      }),
    });

    const catalog = scoped.catalog();
    expect(catalog.candidates.map((candidate) => candidate.id)).toEqual(['db_feedback']);
    expect(catalog.candidates[0]).toMatchObject({ relationCount: 0 });
    expect(catalog.candidates[0]?.sources[0]).toMatchObject({
      propertyCount: 1,
    });
    expect(scoped.catalog('related').candidates).toEqual([]);
    expect(catalog.catalogRevision).not.toBe(unrestricted.catalog().catalogRevision);
  });

  test('projects describe schemas without leaking denied properties or candidates', async () => {
    const { dataPlane: unrestricted, store, index, plans } = await fixture();
    const scoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      resolveQueryAccess: ({ database }) => ({
        allowed: database.id === 'db_feedback',
        policyId: 'policy_describe_scope',
        policyRevision: `sha256:${'8'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: database.id === 'db_feedback' ? ['prop_customer_feedback_title'] : [],
      }),
    });

    const described = scoped.describe({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
    });
    expect(DatabaseDescribeResponseSchema.safeParse(described).success).toBe(true);
    expect(described.source?.properties.map((property) => property.id)).toEqual([
      'prop_customer_feedback_title',
    ]);
    expect(described.database.views).toEqual([]);
    expect(described.database.buttons).toEqual([]);
    expect(described.database.automations).toEqual([]);
    expect(described.schemaRevision).not.toBe(
      unrestricted.describe({ databaseId: 'db_feedback' }).schemaRevision,
    );

    expect(() => scoped.describe({ databaseId: 'db_research' })).toThrow(DatabaseDataPlaneError);
    try {
      scoped.describe({ databaseId: 'db_missing' });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'database_not_found',
        details: {
          candidates: [{ id: 'db_feedback', key: 'customer-feedback' }],
        },
      });
    }
  });

  test('describes exact stable IDs with semantics, constraints, views, and recovery candidates', async () => {
    const { dataPlane } = await fixture();
    const described = dataPlane.describe({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
    });
    expect(described).toMatchObject({
      database: {
        id: 'db_feedback',
        contract: { canonicality: 'canonical', sensitivity: 'internal' },
      },
      source: { id: 'ds_customer_feedback' },
      allowedOperations: ['catalog', 'describe', 'find', 'query', 'pack'],
      index: { state: 'idle', recordCount: 2 },
    });
    expect(described.schemaRevision).toMatch(/^sha256:/);
    expect(described.database.views[0]).toMatchObject({
      id: 'view_customer_feedback_table',
      layout: { type: 'table' },
    });
    expect(described.source?.properties[0]).toMatchObject({
      id: 'prop_customer_feedback_title',
      semantics: { inferencePolicy: 'explicit_only', sensitivity: 'inherit' },
    });
    expect(
      dataPlane.describeIfChanged({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        ifSchemaRevision: described.schemaRevision,
      }),
    ).toEqual({
      notModified: true,
      manifestRevision: described.manifestRevision,
      schemaRevision: described.schemaRevision,
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
    });

    expect(() => dataPlane.describe({ databaseId: 'db_missing' })).toThrow(DatabaseDataPlaneError);
    try {
      dataPlane.describe({ databaseId: 'db_missing' });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'database_not_found',
        details: {
          candidates: [
            {
              id: 'db_feedback',
              key: 'customer-feedback',
              name: 'Customer feedback',
            },
            {
              id: 'db_research',
              key: 'customer-research',
              name: 'Customer research',
            },
          ],
        },
      });
    }
  });

  test('runs exact typed queries and refuses a schema-stale index', async () => {
    const { dataPlane, index, store } = await fixture();
    const query = {
      where: {
        propertyId: 'prop_customer_feedback_score',
        operator: 'gte' as const,
        value: 5,
      },
      sort: [
        {
          propertyId: 'prop_customer_feedback_score',
          direction: 'desc' as const,
        },
      ],
      select: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
      page: { limit: 1 },
    };
    const result = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query,
    });
    expect(result).toMatchObject({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      matched: 1,
      returned: 1,
      isComplete: true,
      indexState: 'idle',
      records: [
        {
          id: 'rec_alpha',
          values: {
            prop_customer_feedback_title: 'Alpha',
            prop_customer_feedback_score: 9,
          },
        },
      ],
      resultState: {
        empty: false,
        emptyReason: null,
        permissionFiltered: false,
        partialIndex: false,
        truncated: false,
      },
      trace: {
        source: { databaseId: 'db_feedback', sourceId: 'ds_customer_feedback' },
        filter: {
          propertyIds: ['prop_customer_feedback_score'],
        },
        ranking: {
          strategy: 'typed_sort_then_record_id',
          sort: [{ propertyId: 'prop_customer_feedback_score', direction: 'desc' }],
          semantics: {
            version: 1,
            locale: 'und',
            naturalNumbers: 'ascii_decimal_runs',
            emptyValues: 'last_regardless_of_direction',
          },
          tieBreakers: ['record_id'],
        },
        truncation: {
          cause: null,
          limit: 1,
          cursorProvided: false,
          nextCursor: null,
        },
      },
    });
    expect(result.manifestRevision).toMatch(/^sha256:/);
    expect(result.indexRevision).toMatch(/^sha256:/);
    expect(result.queryId).toMatch(/^qry_/);
    expect(result.recordRevisions).toEqual({
      rec_alpha: expect.stringMatching(/^sha256:/),
    });
    expect(result.permissionExclusions).toMatchObject({
      evaluated: true,
      policyId: 'project-owner',
      records: 0,
      properties: 0,
    });
    expect(result.delta).toBeNull();

    const unchanged = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query,
      deltaSince: {
        queryId: result.queryId,
        recordRevisions: result.recordRevisions,
        isComplete: result.isComplete,
      },
    });
    expect(unchanged.delta).toEqual({
      sinceQueryId: result.queryId,
      scope: 'returned_page',
      addedOrChangedRecordIds: [],
      unchangedRecordIds: ['rec_alpha'],
      removedRecordIds: [],
      absentFromPageRecordIds: [],
      isComplete: true,
    });
    index.upsertPath(
      'customer-feedback/alpha.md',
      record({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        recordId: 'rec_alpha',
        title: 'Alpha updated',
        score: 10,
      }),
    );
    const changed = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query,
      deltaSince: {
        queryId: result.queryId,
        recordRevisions: result.recordRevisions,
        isComplete: true,
      },
    });
    expect(changed.delta).toMatchObject({
      addedOrChangedRecordIds: ['rec_alpha'],
      unchangedRecordIds: [],
      removedRecordIds: [],
      isComplete: true,
    });
    index.deletePath('customer-feedback/alpha.md');
    const removed = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query,
      deltaSince: {
        queryId: changed.queryId,
        recordRevisions: changed.recordRevisions,
        isComplete: true,
      },
    });
    expect(removed.delta).toMatchObject({
      addedOrChangedRecordIds: [],
      unchangedRecordIds: [],
      removedRecordIds: ['rec_alpha'],
      absentFromPageRecordIds: [],
      isComplete: true,
    });
    expect(() =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query,
        deltaSince: {
          queryId: 'qry_wrong',
          recordRevisions: {},
          isComplete: true,
        },
      }),
    ).toThrow(DatabaseDataPlaneError);

    const feedback = store.getById('db_feedback');
    if (!feedback) throw new Error('feedback fixture missing');
    await store.update('db_feedback', {
      ...feedback,
      name: 'Renamed feedback',
    });
    expect(() =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
      }),
    ).toThrow(DatabaseDataPlaneError);
    try {
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'stale_index' });
    }
  });

  test('returns invalid external values as explicit partial-index rows without typed coercion', async () => {
    const { dataPlane, index, store } = await fixture();
    index.upsertPath(
      'customer-feedback/alpha.md',
      `---
_sn:
  database_id: db_feedback
  source_id: ds_customer_feedback
  record_id: rec_alpha
title: Alpha
score: high
---
External edit remains canonical.
`,
    );
    const result = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: {
        select: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
      },
    });
    expect(result.records.find((record) => record.id === 'rec_alpha')).toMatchObject({
      values: { prop_customer_feedback_title: 'Alpha' },
      invalidValues: { prop_customer_feedback_score: 'high' },
      issues: [
        {
          propertyId: 'prop_customer_feedback_score',
          code: 'invalid_property_value',
        },
      ],
    });
    expect(result.resultState).toMatchObject({
      partialIndex: true,
      empty: false,
    });
    expect(DatabaseQueryResponseSchema.safeParse(result).success).toBe(true);

    const filtered = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: {
        where: {
          propertyId: 'prop_customer_feedback_score',
          operator: 'is_empty',
        },
      },
    });
    expect(filtered.records.map((record) => record.id)).not.toContain('rec_alpha');

    const hidden = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'hide-invalid-score',
        policyRevision: `sha256:${'e'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    expect(
      JSON.stringify(
        hidden.query({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
          query: {
            select: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
          },
        }),
      ),
    ).not.toContain('high');
    expect(
      JSON.stringify(
        hidden.record({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
          recordId: 'rec_alpha',
        }),
      ),
    ).not.toContain('high');
  });

  test('filters and sorts permission-scoped Formula/Rollup projections without hiding typed errors', async () => {
    const { contentDir, store } = await fixture();
    const computed = DatabaseDefinitionSchema.parse({
      version: 1,
      id: 'db_computed',
      key: 'computed',
      name: 'Computed',
      contract: {
        purpose: 'Query permission-scoped derived values',
        canonicality: 'canonical',
        vocabulary: ['computed'],
        freshness: { expectation: 'realtime' },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_computed_tasks',
          key: 'tasks',
          name: 'Tasks',
          recordMeaning: 'One task',
          folder: 'computed-tasks',
          properties: [
            {
              id: 'prop_computed_title',
              key: 'title',
              name: 'Title',
              type: 'title',
            },
            {
              id: 'prop_computed_score',
              key: 'score',
              name: 'Score',
              type: 'number',
            },
            {
              id: 'prop_computed_double',
              key: 'double',
              name: 'Double',
              type: 'formula',
              source: 'prop("score") * 2',
              ast: {
                language: 'synapse-formula-1',
                version: 1,
                resultType: 'number',
                expression: {
                  type: 'binary',
                  operator: 'multiply',
                  left: { type: 'property', propertyId: 'prop_computed_score' },
                  right: { type: 'literal', valueType: 'number', value: 2 },
                },
              },
            },
            {
              id: 'prop_computed_broken',
              key: 'broken',
              name: 'Broken',
              type: 'formula',
              source: 'prop("score") / 0',
              ast: {
                language: 'synapse-formula-1',
                version: 1,
                resultType: 'number',
                expression: {
                  type: 'binary',
                  operator: 'divide',
                  left: { type: 'property', propertyId: 'prop_computed_score' },
                  right: { type: 'literal', valueType: 'number', value: 0 },
                },
              },
            },
            {
              id: 'prop_computed_projects',
              key: 'projects',
              name: 'Projects',
              type: 'relation',
              targetSourceId: 'ds_computed_projects',
              cardinality: 'many',
            },
            {
              id: 'prop_computed_budget',
              key: 'visible_budget',
              name: 'Visible budget',
              type: 'rollup',
              relationPropertyId: 'prop_computed_projects',
              targetPropertyId: 'prop_computed_project_budget',
              function: 'sum',
              targetValueType: 'number',
            },
          ],
        },
        {
          id: 'ds_computed_projects',
          key: 'projects',
          name: 'Projects',
          recordMeaning: 'One project',
          folder: 'computed-projects',
          properties: [
            {
              id: 'prop_computed_project_title',
              key: 'title',
              name: 'Title',
              type: 'title',
            },
            {
              id: 'prop_computed_project_budget',
              key: 'budget',
              name: 'Budget',
              type: 'number',
            },
          ],
        },
      ],
    });
    await store.create(computed);
    mkdirSync(join(contentDir, 'computed-tasks'), { recursive: true });
    mkdirSync(join(contentDir, 'computed-projects'), { recursive: true });
    writeFileSync(
      join(contentDir, 'computed-tasks', 'task.md'),
      `---\n_sn:\n  database_id: db_computed\n  source_id: ds_computed_tasks\n  record_id: rec_computed_task\ntitle: Task\nscore: 4\nprojects:\n  - rec_computed_visible\n  - rec_computed_denied\n---\n`,
    );
    writeFileSync(
      join(contentDir, 'computed-projects', 'visible.md'),
      `---\n_sn:\n  database_id: db_computed\n  source_id: ds_computed_projects\n  record_id: rec_computed_visible\ntitle: Visible\nbudget: 10\n---\n`,
    );
    writeFileSync(
      join(contentDir, 'computed-projects', 'denied.md'),
      `---\n_sn:\n  database_id: db_computed\n  source_id: ds_computed_projects\n  record_id: rec_computed_denied\ntitle: Denied\nbudget: 1000000\n---\n`,
    );
    const index = createDatabaseRecordIndex({
      contentDir,
      databaseStore: store,
    });
    await index.rebuild();
    const dataPlane = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: ({ source }) => ({
        policyId: `computed-${source.key}`,
        policyRevision: `sha256:${(source.id === 'ds_computed_tasks' ? 'c' : 'd').repeat(64)}`,
        allowedRecordIds: source.id === 'ds_computed_projects' ? ['rec_computed_visible'] : null,
        allowedPropertyIds: null,
      }),
    });
    const result = dataPlane.query({
      databaseId: computed.id,
      sourceId: 'ds_computed_tasks',
      query: {
        where: {
          propertyId: 'prop_computed_double',
          operator: 'gte',
          value: 8,
        },
        sort: [{ propertyId: 'prop_computed_budget', direction: 'desc' }],
        select: [
          'prop_computed_title',
          'prop_computed_double',
          'prop_computed_broken',
          'prop_computed_budget',
        ],
      },
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.values).toMatchObject({
      prop_computed_double: 8,
    });
    expect(result.records[0]?.values).not.toHaveProperty('prop_computed_budget');
    expect(result.records[0]?.values).not.toHaveProperty('prop_computed_broken');
    expect(result.records[0]?.computedResults?.prop_computed_broken).toMatchObject({
      kind: 'error',
      problem: { code: 'divide_by_zero' },
    });
    expect(result.records[0]?.computedResults?.prop_computed_budget).toMatchObject({
      kind: 'error',
      problem: { code: 'permission_denied' },
    });
    expect(result.trace.derivedIndex.permissionRevision).toMatch(/^sha256:/);
    expect(result.trace.derivedIndex).toMatchObject({
      propertyIds: ['prop_computed_broken', 'prop_computed_budget', 'prop_computed_double'],
      cache: 'miss',
    });
    const responseContract = DatabaseQueryResponseSchema.safeParse(result);
    expect(responseContract.success ? [] : responseContract.error.issues).toEqual([]);

    const rollup = computed.sources[0]?.properties.find(
      (property) => property.id === 'prop_computed_budget',
    );
    if (rollup?.type !== 'rollup') throw new Error('Rollup fixture missing');
    const preview = dataPlane.previewComputedProperty({
      databaseId: computed.id,
      sourceId: 'ds_computed_tasks',
      recordId: 'rec_computed_task',
      property: { ...rollup, function: 'count_all' },
    });
    expect(preview.result).toMatchObject({
      kind: 'error',
      problem: { code: 'permission_denied' },
    });
    expect(preview.permissionRevision).toMatch(/^sha256:/);
    expect(DatabaseComputedPropertyPreviewResponseSchema.safeParse(preview).success).toBe(true);

    const cached = dataPlane.query({
      databaseId: computed.id,
      sourceId: 'ds_computed_tasks',
      query: {
        where: {
          propertyId: 'prop_computed_double',
          operator: 'gte',
          value: 8,
        },
        sort: [{ propertyId: 'prop_computed_budget', direction: 'desc' }],
        select: [
          'prop_computed_title',
          'prop_computed_double',
          'prop_computed_broken',
          'prop_computed_budget',
        ],
      },
    });
    expect(cached.trace.derivedIndex.cache).toBe('hit');
    index.upsertPath(
      'computed-projects/visible.md',
      `---\n_sn:\n  database_id: db_computed\n  source_id: ds_computed_projects\n  record_id: rec_computed_visible\ntitle: Visible\nbudget: 20\n---\n`,
    );
    const changed = dataPlane.query({
      databaseId: computed.id,
      sourceId: 'ds_computed_tasks',
      query: {
        where: {
          propertyId: 'prop_computed_double',
          operator: 'gte',
          value: 8,
        },
        sort: [{ propertyId: 'prop_computed_budget', direction: 'desc' }],
        select: [
          'prop_computed_title',
          'prop_computed_double',
          'prop_computed_broken',
          'prop_computed_budget',
        ],
      },
      deltaSince: {
        queryId: cached.queryId,
        recordRevisions: cached.recordRevisions,
        isComplete: cached.isComplete,
      },
    });
    expect(changed.records[0]?.values).not.toHaveProperty('prop_computed_budget');
    expect(changed.records[0]?.computedResults?.prop_computed_budget).toMatchObject({
      kind: 'error',
      problem: { code: 'permission_denied' },
    });
    expect(changed.trace.derivedIndex.cache).toBe('miss');
    expect(changed.delta?.addedOrChangedRecordIds).toEqual([]);
  });

  test('applies a saved Agent View filter, projection, budgeted row scope, and policy receipt', async () => {
    const { contentDir, dataPlane, index, store } = await fixture();
    const result = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      agentViewId: 'view_customer_feedback_agent',
    });
    expect(result).toMatchObject({
      matched: 1,
      returned: 1,
      records: [
        {
          id: 'rec_alpha',
          values: {
            prop_customer_feedback_title: 'Alpha',
            prop_customer_feedback_score: 9,
          },
        },
      ],
      agentView: {
        id: 'view_customer_feedback_agent',
        revision: expect.stringMatching(/^sha256:/),
        semanticContract: {
          evidence: 'required',
          freshness: 'require_current',
        },
        scope: { maxRecords: 1 },
        writePolicy: { mode: 'read_only', maxRecordsPerCommit: 0 },
      },
      trace: {
        agentView: { id: 'view_customer_feedback_agent' },
        filter: {
          propertyIds: ['prop_customer_feedback_score'],
        },
        projection: {
          requestedPropertyIds: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
        },
        truncation: { limit: 1 },
      },
    });
    expect(() =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        agentViewId: 'view_customer_feedback_agent',
        query: { select: ['prop_customer_feedback_related'] },
      }),
    ).toThrow(DatabaseDataPlaneError);
    try {
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        agentViewId: 'view_customer_feedback_agent',
        query: { select: ['prop_customer_feedback_related'] },
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'agent_view_scope_violation',
        details: {
          deniedPropertyIds: ['prop_customer_feedback_related'],
          allowedPropertyIds: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
        },
      });
    }
    expect(() =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        agentViewId: 'view_missing',
      }),
    ).toThrow(DatabaseDataPlaneError);

    expect(() =>
      dataPlane.pack({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        agentViewId: 'view_customer_feedback_agent',
        goal: 'Prepare an evidence-grounded feedback brief',
      }),
    ).toThrow(DatabaseDataPlaneError);
    try {
      dataPlane.pack({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        agentViewId: 'view_customer_feedback_agent',
        goal: 'Prepare an evidence-grounded feedback brief',
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'agent_view_scope_violation',
        details: {
          agentViewId: 'view_customer_feedback_agent',
          requiredDisclosure: 'evidence',
        },
      });
    }

    const pack = dataPlane.pack({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      agentViewId: 'view_customer_feedback_agent',
      goal: 'Prepare an evidence-grounded feedback brief',
      disclosure: { level: 'evidence', searchText: 'checkout latency' },
    });
    expect(pack).toMatchObject({
      agentView: {
        id: 'view_customer_feedback_agent',
        semanticContract: {
          evidence: 'required',
          freshness: 'require_current',
        },
        scope: { maxRecords: 1 },
        writePolicy: { mode: 'read_only', maxRecordsPerCommit: 0 },
      },
      schema: {
        properties: [
          { id: 'prop_customer_feedback_title' },
          { id: 'prop_customer_feedback_score' },
        ],
      },
      returned: 1,
      disclosure: {
        level: 'evidence',
        searchText: 'checkout latency',
      },
      budget: {
        maxTokens: 2_000,
        reserveTokens: 200,
        tokenizer: 'utf8_bytes_div3',
      },
    });
    expect(pack.disclosure.level).toBe('evidence');
    if (pack.disclosure.level !== 'evidence') throw new Error('expected evidence disclosure');
    expect(pack.disclosure.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordId: 'rec_alpha',
          field: 'body',
          matchedTerms: ['checkout'],
          offsetEncoding: 'utf16_code_units',
        }),
        expect.objectContaining({
          recordId: 'rec_alpha',
          field: 'body',
          matchedTerms: ['latency'],
          offsetEncoding: 'utf16_code_units',
        }),
      ]),
    );
    const inspections = dataPlane.listContextInspections();
    expect(inspections).toHaveLength(1);
    expect(inspections[0]).toMatchObject({
      packId: pack.id,
      tokenCount: {
        tokenizer: 'utf8_bytes_div3',
        estimated: pack.budget.estimatedTokens,
        available: 1_800,
        max: 2_000,
        reserve: 200,
      },
      redactions: {
        evaluated: true,
        rootRecords: 0,
        rootProperties: 0,
        relationRecords: 0,
        relationProperties: 0,
      },
      freshness: {
        indexRevision: pack.snapshot.indexRevision,
        indexState: 'idle',
        indexFreshness: 'snapshot',
      },
      truncation: {
        truncated: false,
        cause: null,
        continuationAvailable: false,
      },
    });
    expect(dataPlane.getContextInspection(pack.id)).toMatchObject({
      packId: pack.id,
      exactPack: pack,
    });

    writeFileSync(
      join(contentDir, 'customer-feedback', 'beta.md'),
      record({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        recordId: 'rec_beta',
        title: 'Beta',
        score: 7,
      }),
    );
    await index.rebuild();
    const paged = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      agentViewId: 'view_customer_feedback_agent',
    });
    expect(paged).toMatchObject({ matched: 2, returned: 1, isComplete: false });
    expect(paged.nextCursor).not.toBeNull();
    const pagedPack = dataPlane.pack({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      agentViewId: 'view_customer_feedback_agent',
      goal: 'Prepare an evidence-grounded feedback brief',
      disclosure: { level: 'evidence', searchText: 'checkout' },
    });
    expect(pagedPack.nextCursor).not.toBeNull();

    const updated = store.getById('db_feedback');
    if (!updated) throw new Error('feedback fixture is missing');
    const updatedView = updated.views.find((view) => view.id === 'view_customer_feedback_agent');
    if (!updatedView?.agent) throw new Error('Agent View fixture is missing');
    updatedView.agent.semanticContract.instructions = 'Use the revised briefing contract.';
    await store.update(updated.id, updated);
    await index.rebuild();

    try {
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        agentViewId: 'view_customer_feedback_agent',
        query: { page: { limit: 1, cursor: paged.nextCursor ?? undefined } },
      });
      throw new Error('expected the old Agent View query cursor to be rejected');
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid_cursor' });
    }
    try {
      dataPlane.pack({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        agentViewId: 'view_customer_feedback_agent',
        goal: 'Prepare an evidence-grounded feedback brief',
        disclosure: { level: 'evidence', searchText: 'checkout' },
        cursor: pagedPack.nextCursor ?? undefined,
      });
      throw new Error('expected the old Agent View pack cursor to be rejected');
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid_pack_cursor' });
    }
  });

  test('preserves the saved Agent View projection order when a pack omits propertyIds', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const view = definition?.views.find(({ id }) => id === 'view_customer_feedback_agent');
    if (!definition || !view?.agent) throw new Error('Agent View fixture is missing');

    view.projection.propertyIds = ['prop_customer_feedback_score', 'prop_customer_feedback_title'];
    await store.update(definition.id, definition);
    await index.rebuild();

    const pack = dataPlane.pack({
      databaseId: definition.id,
      sourceId: 'ds_customer_feedback',
      agentViewId: view.id,
      goal: 'Prepare an evidence-grounded feedback brief',
      disclosure: { level: 'evidence', searchText: 'checkout latency' },
    });

    expect(pack.schema.properties.map(({ id }) => id)).toEqual([
      'prop_customer_feedback_score',
      'prop_customer_feedback_title',
    ]);
    expect(pack.retrieval?.projection).toMatchObject({
      requestedPropertyIds: ['prop_customer_feedback_score', 'prop_customer_feedback_title'],
      returnedPropertyIds: ['prop_customer_feedback_score', 'prop_customer_feedback_title'],
      omittedPropertyIds: [],
    });
  });

  test('redacts properties and bodies above an Agent View sensitivity policy from packs and inspections', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const source = definition?.sources.find(({ id }) => id === 'ds_customer_feedback');
    const view = definition?.views.find(({ id }) => id === 'view_customer_feedback_agent');
    if (!definition || !source || !view?.agent) throw new Error('Agent View fixture is missing');
    definition.contract.sensitivity = 'confidential';
    for (const property of source.properties) {
      property.semantics.sensitivity =
        property.id === 'prop_customer_feedback_title'
          ? 'public'
          : property.id === 'prop_customer_feedback_score'
            ? 'internal'
            : property.id === 'prop_customer_feedback_code'
              ? 'confidential'
              : 'restricted';
    }
    view.projection.propertyIds.push('prop_customer_feedback_code');
    view.projection.body = 'full';
    view.agent.semanticContract.evidence = 'none';
    view.agent.readPolicy = { maxSensitivity: 'internal' };
    await store.update(definition.id, definition);
    await index.rebuild();

    const pack = dataPlane.pack({
      databaseId: definition.id,
      sourceId: source.id,
      agentViewId: view.id,
      goal: 'Summarize without confidential fields',
      disclosure: { level: 'full_body' },
    });
    expect(pack.agentView?.readPolicy).toEqual({ maxSensitivity: 'internal' });
    expect(pack.schema.properties.map(({ id }) => id)).toEqual([
      'prop_customer_feedback_title',
      'prop_customer_feedback_score',
    ]);
    expect(pack.disclosure).toEqual({ level: 'full_body', fullBodies: [] });
    expect(pack.snapshot.sensitivityRedactions).toMatchObject({
      evaluated: true,
      maxSensitivity: 'internal',
      rootProperties: 1,
      body: true,
    });
    expect(pack.omitted).toMatchObject({ sensitivityProperties: 1, sensitivityBodies: 1 });
    const inspection = dataPlane.getContextInspection(pack.id);
    expect(inspection.redactions).toMatchObject({
      sensitivityProperties: 1,
      sensitivityBodies: 1,
    });
    const serialized = JSON.stringify(inspection);
    expect(serialized).not.toContain('CUST-ALPHA');
    expect(serialized).not.toContain('Checkout login latency');
  });

  test('executes ordinary saved views with revision receipts and invalidates stale cursors', async () => {
    const { dataPlane, store, index } = await fixture();
    const first = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      viewId: 'view_customer_feedback_table',
      query: { page: { limit: 1 } },
    });
    const firstSavedQueryRevision = first.savedQuery?.revision;
    expect(first).toMatchObject({
      matched: 2,
      returned: 1,
      isComplete: false,
      savedQuery: {
        id: 'view_customer_feedback_table',
        key: 'table',
        sourceId: 'ds_customer_feedback',
        layout: 'table',
        revision: expect.stringMatching(/^sha256:/),
      },
      agentView: null,
      trace: {
        savedQuery: { id: 'view_customer_feedback_table' },
        aggregation: {
          appliedAfterPermissionScope: true,
          matched: 2,
          totalGroups: 2,
        },
        projection: {
          requestedPropertyIds: ['prop_customer_feedback_title'],
          returnedPropertyIds: ['prop_customer_feedback_title'],
        },
      },
      records: [{ values: { prop_customer_feedback_title: expect.any(String) } }],
      aggregation: { matched: 2, totalGroups: 2, returnedGroups: 2 },
    });
    const firstCursor = first.nextCursor;
    if (!firstCursor) throw new Error('saved query fixture must paginate');

    const schemaChanged = store.getById('db_feedback');
    if (!schemaChanged) throw new Error('feedback fixture is missing');
    const title = schemaChanged.sources[0]?.properties.find(
      (property) => property.id === 'prop_customer_feedback_title',
    );
    if (!title) throw new Error('title fixture is missing');
    title.name = 'Feedback title';
    await store.update(schemaChanged.id, schemaChanged);
    await index.rebuild();
    expect(() =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_table',
        query: { page: { limit: 1, cursor: firstCursor } },
      }),
    ).toThrow(/cursor/i);

    const afterSchema = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      viewId: 'view_customer_feedback_table',
      query: { page: { limit: 1 } },
    });
    expect(afterSchema.savedQuery?.revision).toBe(firstSavedQueryRevision);
    expect(afterSchema.snapshotRevision).not.toBe(first.snapshotRevision);
    const secondCursor = afterSchema.nextCursor;
    if (!secondCursor) throw new Error('saved query fixture must still paginate');

    const viewChanged = store.getById('db_feedback');
    if (!viewChanged) throw new Error('feedback fixture is missing');
    const tableView = viewChanged.views.find((view) => view.id === 'view_customer_feedback_table');
    if (!tableView) throw new Error('table view fixture is missing');
    tableView.sort = [{ propertyId: 'prop_customer_feedback_score', direction: 'desc' }];
    await store.update(viewChanged.id, viewChanged);
    await index.rebuild();
    const afterView = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      viewId: 'view_customer_feedback_table',
      query: { page: { limit: 1 } },
    });
    expect(afterView.savedQuery?.revision).not.toBe(afterSchema.savedQuery?.revision);
    expect(afterView.queryId).not.toBe(afterSchema.queryId);
    expect(() =>
      dataPlane.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_table',
        query: { page: { limit: 1, cursor: secondCursor } },
      }),
    ).toThrow(/cursor/i);
  });

  test('applies linked-view overrides to one saved-view query without changing canonical storage', async () => {
    const { dataPlane, store } = await fixture();
    const before = store.getById('db_feedback');
    if (!before) throw new Error('feedback fixture is missing');
    const canonical = before.views.find((view) => view.id === 'view_customer_feedback_table');
    if (!canonical) throw new Error('table view fixture is missing');

    const overridden = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      viewId: canonical.id,
      viewOverrides: {
        where: { propertyId: 'prop_customer_feedback_score', operator: 'gte', value: 5 },
        sort: [{ propertyId: 'prop_customer_feedback_score', direction: 'desc' }],
        projection: {
          propertyIds: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
          body: 'hidden',
        },
      },
      query: { page: { limit: 10 } },
    });

    expect(overridden.trace.filter.expression).toEqual({
      propertyId: 'prop_customer_feedback_score',
      operator: 'gte',
      value: 5,
    });
    expect(overridden.trace.ranking.sort).toEqual([
      { propertyId: 'prop_customer_feedback_score', direction: 'desc' },
    ]);
    expect(
      overridden.records.every((record) =>
        Object.keys(record.values).every((propertyId) =>
          ['prop_customer_feedback_title', 'prop_customer_feedback_score'].includes(propertyId),
        ),
      ),
    ).toBe(true);
    expect(store.getById('db_feedback')?.views.find((view) => view.id === canonical.id)).toEqual(
      canonical,
    );
  });

  test('evaluates ordered saved-view colors without leaking denied filter properties', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const view = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !view) throw new Error('saved view fixture is missing');
    view.conditionalColors = [
      {
        id: 'ccr_high_first',
        key: 'high-first',
        name: 'High score first',
        color: 'red',
        where: {
          propertyId: 'prop_customer_feedback_score',
          operator: 'gte',
          value: 5,
        },
        applyTo: { type: 'page' },
      },
      {
        id: 'ccr_high_second',
        key: 'high-second',
        name: 'High score second',
        color: 'orange',
        where: {
          propertyId: 'prop_customer_feedback_score',
          operator: 'gte',
          value: 5,
        },
        applyTo: { type: 'page' },
      },
      {
        id: 'ccr_high_title',
        key: 'high-title',
        name: 'High score title',
        color: 'purple',
        where: {
          propertyId: 'prop_customer_feedback_score',
          operator: 'gte',
          value: 5,
        },
        applyTo: {
          type: 'property',
          propertyId: 'prop_customer_feedback_title',
        },
      },
    ];
    await store.update(definition.id, definition);
    await index.rebuild();

    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: 'ds_customer_feedback',
      viewId: view.id,
    });
    expect(result.conditionalColors).toEqual({
      rules: view.conditionalColors.map(({ id, key, name, color, applyTo }) => ({
        id,
        key,
        name,
        color,
        applyTo,
      })),
      records: {
        rec_alpha: {
          pageRuleId: 'ccr_high_first',
          propertyRuleIds: { prop_customer_feedback_title: 'ccr_high_title' },
        },
      },
    });

    const permissionScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'title-only',
        policyRevision: `sha256:${'d'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    expect(() =>
      permissionScoped.query({
        databaseId: definition.id,
        sourceId: 'ds_customer_feedback',
        viewId: view.id,
      }),
    ).toThrow(/outside the effective read scope/i);
  });

  test('executes Board groups with bounded returned-page memberships', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const view = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !view) throw new Error('saved view fixture is missing');
    view.layout = {
      type: 'board',
      configuration: {
        cardSize: 'medium',
        cardPreview: { type: 'none' },
        fitImage: false,
        colorColumns: true,
        groupLimit: 12,
        cardLimitPerGroup: 25,
      },
    };
    view.groups = [
      {
        propertyId: 'prop_customer_feedback_score',
        direction: 'desc',
        hideEmpty: false,
      },
    ];
    await store.update(definition.id, definition);
    await index.rebuild();

    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: 'ds_customer_feedback',
      viewId: view.id,
      query: { page: { limit: 1 } },
    });
    expect(result.aggregation).toMatchObject({
      groupBy: [
        {
          propertyId: 'prop_customer_feedback_score',
          direction: 'desc',
          arrayMode: 'each',
          includeEmpty: true,
        },
      ],
    });
    expect(result.aggregation?.groupBy).toHaveLength(1);
    expect(result.groupMemberships).toEqual({
      rec_alpha: [[{ propertyId: 'prop_customer_feedback_score', value: 9 }]],
    });
    expect(Object.keys(result.groupMemberships ?? {})).toEqual(
      result.records.map((record) => record.id),
    );
  });

  test('enforces Timeline load, hidden layout fields, grouping, and permission dependencies', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const source = definition?.sources.find((candidate) => candidate.id === 'ds_customer_feedback');
    const view = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !source || !view) throw new Error('saved view fixture is missing');
    source.properties.push({
      id: 'prop_customer_feedback_schedule',
      key: 'schedule',
      name: 'Schedule',
      type: 'date',
    });
    view.layout = {
      type: 'timeline',
      configuration: {
        dateMapping: {
          type: 'range',
          propertyId: 'prop_customer_feedback_schedule',
        },
        scale: 'week',
        showTable: true,
        showToday: true,
        showDependencies: true,
        dependencyPropertyId: 'prop_customer_feedback_related',
        noDateLane: true,
        loadLimit: 1,
      },
    };
    view.groups = [
      {
        propertyId: 'prop_customer_feedback_score',
        direction: 'desc',
        hideEmpty: false,
      },
    ];
    await store.update(definition.id, definition);
    await index.rebuild();

    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: source.id,
      viewId: view.id,
      query: { page: { limit: 50 } },
    });
    expect(result.returned).toBe(1);
    expect(result.trace.projection.requestedPropertyIds).toEqual(
      expect.arrayContaining([
        'prop_customer_feedback_title',
        'prop_customer_feedback_schedule',
        'prop_customer_feedback_related',
      ]),
    );
    expect(result.aggregation?.groupBy[0]?.propertyId).toBe('prop_customer_feedback_score');

    const permissionScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'title-only',
        policyRevision: `sha256:${'e'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: [
          'prop_customer_feedback_title',
          'prop_customer_feedback_score',
          'prop_customer_feedback_related',
        ],
      }),
    });
    expect(() =>
      permissionScoped.query({
        databaseId: definition.id,
        sourceId: source.id,
        viewId: view.id,
      }),
    ).toThrow(/outside the effective read scope/i);
  });

  test('projects hidden Calendar dates and fails closed when the date is outside read scope', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const source = definition?.sources.find((candidate) => candidate.id === 'ds_customer_feedback');
    const view = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !source || !view) throw new Error('saved view fixture is missing');
    source.properties.push({
      id: 'prop_customer_feedback_schedule',
      key: 'schedule',
      name: 'Schedule',
      type: 'date',
    });
    view.layout = {
      type: 'calendar',
      configuration: {
        datePropertyId: 'prop_customer_feedback_schedule',
        display: 'month',
        weekStartsOn: 'monday',
        timeZone: 'UTC',
        showWeekends: true,
        cardLimitPerDay: 10,
      },
    };
    await store.update(definition.id, definition);
    await index.rebuild();

    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: source.id,
      viewId: view.id,
    });
    expect(result.trace.projection.requestedPropertyIds).toEqual(
      expect.arrayContaining(['prop_customer_feedback_title', 'prop_customer_feedback_schedule']),
    );

    const permissionScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'title-only',
        policyRevision: `sha256:${'f'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    expect(() =>
      permissionScoped.query({
        databaseId: definition.id,
        sourceId: source.id,
        viewId: view.id,
      }),
    ).toThrow(/outside the effective read scope/i);
  });

  test('enforces List load, grouping, hidden hierarchy projection, and permission scope', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const source = definition?.sources.find((candidate) => candidate.id === 'ds_customer_feedback');
    const view = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !source || !view) throw new Error('saved view fixture is missing');
    source.properties.push({
      id: 'prop_customer_feedback_parent',
      key: 'parent',
      name: 'Parent',
      type: 'relation',
      targetSourceId: source.id,
      cardinality: 'one',
    });
    view.layout = {
      type: 'list',
      configuration: {
        hierarchy: {
          type: 'parent_relation',
          propertyId: 'prop_customer_feedback_parent',
        },
        density: 'compact',
        showSections: true,
        collapsibleSections: true,
        showDividers: true,
        loadLimit: 1,
      },
    };
    view.groups = [
      {
        propertyId: 'prop_customer_feedback_score',
        direction: 'desc',
        hideEmpty: false,
      },
    ];
    await store.update(definition.id, definition);
    await index.rebuild();

    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: source.id,
      viewId: view.id,
      query: { page: { limit: 50 } },
    });
    expect(result.returned).toBe(1);
    expect(result.trace.projection.requestedPropertyIds).toContain('prop_customer_feedback_parent');
    expect(result.aggregation?.groupBy[0]?.propertyId).toBe('prop_customer_feedback_score');

    const permissionScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'no-parent',
        policyRevision: `sha256:${'1'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
      }),
    });
    expect(() =>
      permissionScoped.query({
        databaseId: definition.id,
        sourceId: source.id,
        viewId: view.id,
      }),
    ).toThrow(/outside the effective read scope/i);
  });

  test('enforces Gallery load, hidden media projection, and permission scope', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const source = definition?.sources.find((candidate) => candidate.id === 'ds_customer_feedback');
    const view = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !source || !view) throw new Error('saved view fixture is missing');
    source.properties.push({
      id: 'prop_customer_feedback_media',
      key: 'media',
      name: 'Media',
      type: 'files',
    });
    view.layout = {
      type: 'gallery',
      configuration: {
        cardSize: 'medium',
        cardPreview: {
          type: 'files',
          propertyId: 'prop_customer_feedback_media',
        },
        fitImage: false,
        showTitle: true,
        fallbackStyle: 'color',
        loadLimit: 1,
      },
    };
    await store.update(definition.id, definition);
    await index.rebuild();

    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: source.id,
      viewId: view.id,
      query: { page: { limit: 50 } },
    });
    expect(result.returned).toBe(1);
    expect(result.trace.projection.requestedPropertyIds).toContain('prop_customer_feedback_media');

    const permissionScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'no-media',
        policyRevision: `sha256:${'2'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    expect(() =>
      permissionScoped.query({
        databaseId: definition.id,
        sourceId: source.id,
        viewId: view.id,
      }),
    ).toThrow(/outside the effective read scope/i);
  });

  test('enforces Map marker limits, hidden Place projection, and permission scope', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const source = definition?.sources.find((candidate) => candidate.id === 'ds_customer_feedback');
    const view = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !source || !view) throw new Error('saved view fixture is missing');
    source.properties.push({
      id: 'prop_customer_feedback_place',
      key: 'place',
      name: 'Place',
      type: 'place',
    });
    view.layout = {
      type: 'map',
      configuration: {
        placePropertyId: 'prop_customer_feedback_place',
        basemap: 'local',
        clustering: true,
        clusterRadius: 48,
        showLabels: true,
        showMissingLocations: true,
        initialZoom: 2,
        loadLimit: 1,
      },
    };
    await store.update(definition.id, definition);
    await index.rebuild();

    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: source.id,
      viewId: view.id,
      query: { page: { limit: 50 } },
    });
    expect(result.returned).toBe(1);
    expect(result.trace.projection.requestedPropertyIds).toContain('prop_customer_feedback_place');

    const permissionScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'no-place',
        policyRevision: `sha256:${'4'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    expect(() =>
      permissionScoped.query({
        databaseId: definition.id,
        sourceId: source.id,
        viewId: view.id,
      }),
    ).toThrow(/outside the effective read scope/i);
  });

  test('returns a typed saved-query receipt for Dashboard container views', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const source = definition?.sources.find((candidate) => candidate.id === 'ds_customer_feedback');
    const table = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !source || !table) throw new Error('saved view fixture is missing');
    definition.views.push({
      id: 'view_customer_feedback_dashboard',
      key: 'dashboard',
      name: 'Dashboard',
      sourceId: source.id,
      layout: {
        type: 'dashboard',
        configuration: {
          rows: [
            {
              id: 'dshr_overview',
              height: 'medium',
              widgets: [{ id: 'dshw_table', viewId: table.id, width: 4 }],
            },
          ],
          globalFilters: [],
          interactions: [],
        },
      },
      sort: [],
      groups: [],
      projection: {
        propertyIds: ['prop_customer_feedback_title'],
        body: 'hidden',
      },
      conditionalColors: [],
    });
    await store.update(definition.id, definition);
    await index.rebuild();

    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: source.id,
      viewId: 'view_customer_feedback_dashboard',
    });
    expect(result.savedQuery).toMatchObject({
      id: 'view_customer_feedback_dashboard',
      layout: 'dashboard',
    });
    expect(DatabaseQueryResponseSchema.safeParse(result).success).toBe(true);
  });

  test('enforces Feed paging and permission-checks hidden chronology identity', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const source = definition?.sources.find((candidate) => candidate.id === 'ds_customer_feedback');
    const view = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !source || !view) throw new Error('saved view fixture is missing');
    source.properties.push({
      id: 'prop_customer_feedback_date',
      key: 'date',
      name: 'Date',
      type: 'date',
    });
    view.layout = {
      type: 'feed',
      configuration: {
        chronologyPropertyId: 'prop_customer_feedback_date',
        density: 'comfortable',
        showProperties: true,
        readTracking: 'session',
        loadLimit: 1,
      },
    };
    view.sort = [{ propertyId: 'prop_customer_feedback_date', direction: 'desc' }];
    await store.update(definition.id, definition);
    await index.rebuild();
    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: source.id,
      viewId: view.id,
      query: { page: { limit: 50 } },
    });
    expect(result).toMatchObject({
      returned: 1,
      savedQuery: { layout: 'feed' },
    });
    expect(result.trace.projection.requestedPropertyIds).toContain('prop_customer_feedback_date');
    const permissionScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'no-feed-date',
        policyRevision: `sha256:${'5'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    expect(() =>
      permissionScoped.query({
        databaseId: definition.id,
        sourceId: source.id,
        viewId: view.id,
      }),
    ).toThrow(/outside the effective read scope/i);
  });

  test('applies saved and public Chart aggregation, bounded drill-through rows, and permission scope', async () => {
    const { dataPlane, store, index } = await fixture();
    const definition = store.getById('db_feedback');
    const source = definition?.sources.find((candidate) => candidate.id === 'ds_customer_feedback');
    const view = definition?.views.find(
      (candidate) => candidate.id === 'view_customer_feedback_table',
    );
    if (!definition || !source || !view) throw new Error('saved view fixture is missing');
    view.layout = {
      type: 'chart',
      configuration: {
        chartType: 'vertical_bar',
        dimension: {
          propertyId: 'prop_customer_feedback_score',
          arrayMode: 'each',
        },
        measure: { type: 'count' },
        showLegend: true,
        showLabels: true,
        showAxisNames: true,
        groupLimit: 20,
        loadLimit: 1,
      },
    };
    await store.update(definition.id, definition);
    await index.rebuild();

    const result = dataPlane.query({
      databaseId: definition.id,
      sourceId: source.id,
      viewId: view.id,
      query: { page: { limit: 50 } },
    });
    expect(result.returned).toBe(1);
    expect(result.aggregation).toMatchObject({
      groupBy: [{ propertyId: 'prop_customer_feedback_score', arrayMode: 'each' }],
      calculations: [{ id: 'chart_measure', function: 'count_all', value: 2 }],
    });
    expect(result.groupMemberships).toBeDefined();
    expect(result.trace.projection.requestedPropertyIds).toContain('prop_customer_feedback_score');
    const chartPolicy: DatabasePublicSharePolicy = {
      version: 1,
      id: 'dbshare_00000000-0000-4000-8000-000000000004',
      target: { kind: 'chart', databaseId: definition.id, viewId: view.id },
      access: 'public',
      propertyIds: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
      allowBody: false,
      allowFormSubmission: false,
      expiresAt: null,
      revokedAt: null,
      tokenHash: null,
      createdBy: 'user:owner',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    };
    expect(
      dataPlane.validatePublicShareTarget({
        target: chartPolicy.target,
        propertyIds: chartPolicy.propertyIds,
        allowFormSubmission: false,
      }),
    ).toMatchObject({ viewId: view.id, sourceId: source.id });
    const publicResult = dataPlane.withPublicShare(chartPolicy, () =>
      dataPlane.query({
        databaseId: definition.id,
        sourceId: source.id,
        viewId: view.id,
      }),
    );
    expect(publicResult.aggregation).toMatchObject({
      returnedGroups: 2,
      calculations: [{ id: 'chart_measure', value: 2 }],
    });
    expect(JSON.stringify(publicResult)).not.toContain('prop_customer_feedback_code');

    const permissionScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'no-chart-dimension',
        policyRevision: `sha256:${'3'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    expect(() =>
      permissionScoped.query({
        databaseId: definition.id,
        sourceId: source.id,
        viewId: view.id,
      }),
    ).toThrow(/outside the effective read scope/i);
  });

  test('filters records and values before counts while binding cursors to permission revisions', async () => {
    const { store, index } = await fixture();
    let policyRevision = `sha256:${'c'.repeat(64)}`;
    const scoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'agent-view-support',
        policyRevision,
        allowedRecordIds: ['rec_alpha'],
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    const result = scoped.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: {
        select: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
        page: { limit: 1 },
      },
    });
    expect(result).toMatchObject({
      matched: 1,
      returned: 1,
      isComplete: true,
      truncatedBy: null,
      permissionExclusions: {
        evaluated: true,
        policyId: 'agent-view-support',
        policyRevision,
        records: 1,
        properties: 3,
      },
      resultState: {
        empty: false,
        emptyReason: null,
        permissionFiltered: true,
        partialIndex: false,
        truncated: false,
      },
      records: [
        {
          id: 'rec_alpha',
          values: { prop_customer_feedback_title: 'Alpha' },
        },
      ],
    });
    expect(result.records[0]?.values).not.toHaveProperty('prop_customer_feedback_score');
    const scopedPack = scoped.pack({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      goal: 'Inspect the effective support scope',
      propertyIds: ['prop_customer_feedback_title'],
      maxTokens: 2_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
    });
    expect(scoped.getContextInspection(scopedPack.id).redactions).toEqual({
      evaluated: true,
      rootRecords: 1,
      rootProperties: 3,
      relationRecords: 0,
      relationProperties: 0,
      sensitivityProperties: 0,
      sensitivityBodies: 0,
      sensitivityRelationEdges: 0,
    });
    const permissionFilteredEmpty = scoped.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: {
        where: {
          propertyId: 'prop_customer_feedback_title',
          operator: 'contains',
          value: 'not present',
        },
      },
    });
    expect(permissionFilteredEmpty.resultState).toEqual({
      empty: true,
      emptyReason: 'permission_filtered',
      permissionFiltered: true,
      partialIndex: false,
      truncated: false,
    });
    expect(() =>
      scoped.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query: {
          where: {
            propertyId: 'prop_customer_feedback_score',
            operator: 'gte',
            value: 5,
          },
        },
      }),
    ).toThrow(DatabaseDataPlaneError);
    try {
      scoped.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query: {
          sort: [{ propertyId: 'prop_customer_feedback_score', direction: 'desc' }],
        },
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'permission_denied',
        details: {
          policyId: 'agent-view-support',
          deniedPropertyIds: ['prop_customer_feedback_score'],
          allowedPropertyIds: ['prop_customer_feedback_title'],
        },
      });
    }

    const paged = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'changing-policy',
        policyRevision,
        allowedRecordIds: null,
        allowedPropertyIds: null,
      }),
    });
    const firstPage = paged.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: { page: { limit: 1 } },
    });
    expect(firstPage).toMatchObject({
      matched: 2,
      returned: 1,
      isComplete: false,
      truncatedBy: 'page_limit',
      nextCursor: expect.any(String),
      resultState: { truncated: true },
      trace: {
        truncation: { cause: 'page_limit', limit: 1, cursorProvided: false },
      },
    });
    policyRevision = `sha256:${'d'.repeat(64)}`;
    expect(() =>
      paged.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query: {
          page: { limit: 1, cursor: firstPage.nextCursor ?? undefined },
        },
      }),
    ).toThrow(/cursor/i);
  });

  test('redacts hidden properties and views from error recovery candidates', async () => {
    const { store, index, plans } = await fixture();
    const scoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      resolveQueryAccess: ({ view }) => ({
        allowed: view?.id !== 'view_customer_feedback_table',
        policyId: 'error-redaction-scope',
        policyRevision: `sha256:${'6'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds:
          view?.id === 'view_customer_feedback_agent'
            ? ['prop_customer_feedback_title', 'prop_customer_feedback_score']
            : ['prop_customer_feedback_title'],
        allowBody: false,
      }),
    });

    for (const operation of [
      () =>
        scoped.query({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
          query: {
            where: {
              propertyId: 'prop_guessed_secret',
              operator: 'is_not_empty',
            },
          },
        }),
      () =>
        scoped.retrieve({
          databaseId: 'db_feedback',
          sourceId: 'ds_customer_feedback',
          text: 'secret',
          mode: 'lexical',
          propertyIds: ['prop_guessed_secret'],
        }),
    ]) {
      try {
        await operation();
        throw new Error('expected permission denial');
      } catch (error) {
        expect(error).toMatchObject({
          code: 'permission_denied',
          details: { allowedPropertyIds: ['prop_customer_feedback_title'] },
        });
        expect(JSON.stringify(error)).not.toContain('Score');
        expect(JSON.stringify(error)).not.toContain('Related feedback');
      }
    }

    try {
      scoped.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        viewId: 'view_customer_feedback_table',
      });
      throw new Error('expected hidden view to be unavailable');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'view_not_found',
        details: {
          candidates: [expect.objectContaining({ id: 'view_customer_feedback_agent' })],
        },
      });
      expect(JSON.stringify((error as DatabaseDataPlaneError).details.candidates)).not.toContain(
        'view_customer_feedback_table',
      );
    }

    try {
      scoped.createDraft({
        database: { id: 'db_feedback', key: 'customer-feedback' },
        sources: [{ key: 'customer-feedback', properties: [{ key: 'secret-score' }] }],
      });
      throw new Error('expected planning visibility denial');
    } catch (error) {
      expect(error).toMatchObject({ code: 'permission_denied' });
      expect(JSON.stringify(error)).not.toContain('Score');
      expect(JSON.stringify(error)).not.toContain('Related feedback');
    }
  });

  test('applies row and property permissions before lexical ranking, counts, and evidence', async () => {
    const { store, index } = await fixture();
    const policyRevision = `sha256:${'e'.repeat(64)}`;
    const rowScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'lexical-row-scope',
        policyRevision,
        allowedRecordIds: ['rec_beta'],
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    const deniedFind = rowScoped.find({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'checkout latency',
    });
    expect(deniedFind.retrieval).toMatchObject({
      matched: 0,
      returned: 0,
      hits: [],
      permissionExclusions: {
        evaluated: true,
        policyId: 'lexical-row-scope',
        policyRevision,
        records: 1,
        properties: 3,
      },
      resultState: {
        empty: true,
        emptyReason: 'permission_filtered',
        permissionFiltered: true,
        truncated: false,
      },
      trace: {
        termStats: [
          { term: 'checkout', indexedRecords: 0, scopedRecords: 0 },
          { term: 'latency', indexedRecords: 0, scopedRecords: 0 },
        ],
      },
    });
    expect(JSON.stringify(deniedFind.retrieval)).not.toContain('rec_alpha');
    expect(JSON.stringify(deniedFind.retrieval)).not.toContain('enterprise customer');

    const deniedPack = rowScoped.pack({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      goal: 'Search only the effective lexical scope',
      propertyIds: ['prop_customer_feedback_title'],
      maxTokens: 2_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      disclosure: { level: 'evidence', searchText: 'checkout latency' },
    });
    expect(deniedPack.disclosure).toEqual({
      level: 'evidence',
      searchText: 'checkout latency',
      matched: 0,
      isComplete: true,
      evidence: [],
    });

    const propertyScoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'lexical-property-scope',
        policyRevision,
        allowedRecordIds: ['rec_alpha'],
        allowedPropertyIds: ['prop_customer_feedback_score'],
      }),
    });
    const hiddenTitlePack = propertyScoped.pack({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      goal: 'Search without disclosing the hidden title property',
      propertyIds: ['prop_customer_feedback_score'],
      maxTokens: 2_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      disclosure: { level: 'evidence', searchText: 'Alpha' },
    });
    expect(hiddenTitlePack.snapshot.permissionExclusions).toMatchObject({
      policyId: 'lexical-property-scope',
      records: 1,
      properties: 3,
    });
    expect(hiddenTitlePack.schema.properties.map((property) => property.id)).toEqual([
      'prop_customer_feedback_score',
    ]);
    expect(JSON.stringify(hiddenTitlePack.schema)).not.toContain('prop_customer_feedback_title');
    expect(hiddenTitlePack.disclosure).toEqual({
      level: 'evidence',
      searchText: 'Alpha',
      matched: 0,
      isComplete: true,
      evidence: [],
    });
  });

  test('redacts bodies before lexical, semantic, and full-body context disclosure', async () => {
    let embeddingCalls = 0;
    const semanticIndex = new DatabaseSemanticIndex({
      configuration: {
        enabled: true,
        providerId: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        privacy: 'local_only',
        propertyIds: ['prop_customer_feedback_title'],
        includeBody: true,
      },
      provider: {
        id: 'provider_local',
        model: 'embed-v1',
        dimensions: 2,
        location: 'local',
        async embed(texts) {
          embeddingCalls += 1;
          return texts.map(() => [1, 0]);
        },
      },
    });
    const { store, index } = await fixture();
    const scoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      semanticIndex,
      resolveQueryAccess: () => ({
        policyId: 'body-hidden',
        policyRevision: `sha256:${'7'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: null,
        allowBody: false,
      }),
    });

    const lexical = await scoped.retrieve({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'enterprise customer',
      mode: 'lexical',
      includeBody: true,
    });
    expect(lexical.ranking.hits).toEqual([]);
    expect(lexical.permissionExclusions).toMatchObject({ body: true });
    expect(JSON.stringify(lexical)).not.toContain('Checkout login latency');

    await expect(
      scoped.retrieve({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        text: 'enterprise customer',
        mode: 'semantic',
      }),
    ).rejects.toMatchObject({
      code: 'permission_denied',
      details: { bodyDenied: true },
    });
    expect(embeddingCalls).toBe(0);

    const pack = scoped.pack({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      goal: 'Return records without hidden bodies',
      propertyIds: ['prop_customer_feedback_title'],
      maxTokens: 2_000,
      tokenizer: 'utf8_bytes_div3',
      encoding: 'object_rows',
      disclosure: { level: 'full_body' },
    });
    expect(pack.disclosure).toEqual({ level: 'full_body', fullBodies: [] });
    expect(pack.omitted.permissionBodies).toBe(2);
    expect(JSON.stringify(pack)).not.toContain('enterprise customer');
  });

  test('applies row and property permissions before totals, groups, and per-column calculations', async () => {
    const { store, index } = await fixture();
    const policyRevision = `sha256:${'f'.repeat(64)}`;
    const scoped = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'aggregation-scope',
        policyRevision,
        allowedRecordIds: ['rec_beta'],
        allowedPropertyIds: ['prop_customer_feedback_title', 'prop_customer_feedback_score'],
      }),
    });
    const result = scoped.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: {
        page: { limit: 1 },
        aggregate: {
          groupBy: [{ propertyId: 'prop_customer_feedback_title' }],
          calculations: [
            { id: 'records', function: 'count_all' },
            {
              id: 'score_sum',
              function: 'sum',
              propertyId: 'prop_customer_feedback_score',
            },
          ],
        },
      },
    });
    expect(result.aggregation).toMatchObject({
      matched: 1,
      calculations: [
        { id: 'records', value: 1 },
        { id: 'score_sum', value: 3 },
      ],
      totalGroups: 1,
      groups: [{ matched: 1, key: [{ value: 'Beta' }] }],
    });
    expect(result.permissionExclusions).toMatchObject({
      records: 1,
      properties: 2,
    });
    expect(result.trace.aggregation).toMatchObject({
      appliedAfterPermissionScope: true,
      matched: 1,
      totalGroups: 1,
    });

    const propertyDenied = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      resolveQueryAccess: () => ({
        policyId: 'aggregation-property-scope',
        policyRevision,
        allowedRecordIds: null,
        allowedPropertyIds: ['prop_customer_feedback_title'],
      }),
    });
    expect(() =>
      propertyDenied.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query: {
          aggregate: {
            calculations: [
              {
                id: 'score_sum',
                function: 'sum',
                propertyId: 'prop_customer_feedback_score',
              },
            ],
          },
        },
      }),
    ).toThrow(DatabaseDataPlaneError);
    try {
      propertyDenied.query({
        databaseId: 'db_feedback',
        sourceId: 'ds_customer_feedback',
        query: {
          aggregate: {
            groupBy: [{ propertyId: 'prop_customer_feedback_score' }],
          },
        },
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'permission_denied',
        details: { deniedPropertyIds: ['prop_customer_feedback_score'] },
      });
    }
  });

  test('distinguishes definitive no-match from source-local partial-index results', async () => {
    const { dataPlane, index } = await fixture();
    const noMatch = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: {
        where: {
          propertyId: 'prop_customer_feedback_score',
          operator: 'gt',
          value: 100,
        },
      },
    });
    expect(noMatch.resultState).toEqual({
      empty: true,
      emptyReason: 'no_match',
      permissionFiltered: false,
      partialIndex: false,
      truncated: false,
    });
    expect(noMatch.trace.index).toMatchObject({
      freshness: 'snapshot',
      issueCount: 0,
    });

    index.upsertPath(
      'customer-research/invalid.md',
      '---\n_sn:\n  database_id: db_research\n  source_id: ds_customer_research\n  record_id: rec_invalid_research\ntitle: Invalid research\nscore: not-a-number\n---\n',
    );
    const unrelatedIssue = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: {
        where: {
          propertyId: 'prop_customer_feedback_score',
          operator: 'gt',
          value: 100,
        },
      },
    });
    expect(unrelatedIssue.resultState.emptyReason).toBe('no_match');
    expect(unrelatedIssue.trace.index.issueCount).toBe(0);

    index.upsertPath(
      'customer-feedback/invalid.md',
      '---\n_sn:\n  database_id: db_feedback\n  source_id: ds_customer_feedback\n  record_id: rec_invalid\ntitle: Invalid\nscore: not-a-number\n---\n',
    );
    const partial = dataPlane.query({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      query: {
        where: {
          propertyId: 'prop_customer_feedback_score',
          operator: 'gt',
          value: 100,
        },
      },
    });
    expect(partial.resultState).toEqual({
      empty: true,
      emptyReason: 'partial_index',
      permissionFiltered: false,
      partialIndex: true,
      truncated: false,
    });
    expect(partial.trace.index.issueCount).toBe(1);
  });

  test('finds through an inspectable compiled query and refuses ambiguous coercion', async () => {
    const { dataPlane } = await fixture();
    const found = dataPlane.find({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'score at least 5 sort by score descending top 1',
    });
    expect(found.plan).toMatchObject({
      interpretation: {
        filters: [
          {
            propertyId: 'prop_customer_feedback_score',
            operator: 'gte',
            value: 5,
          },
        ],
        limit: 1,
        requiresResolution: false,
      },
    });
    expect(found.result).toMatchObject({
      matched: 1,
      returned: 1,
      records: [{ id: 'rec_alpha' }],
    });
    expect(found.retrieval).toBeNull();

    const lexical = dataPlane.find({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'checkout latency',
    });
    expect(lexical.retrieval).toMatchObject({
      matched: 1,
      returned: 1,
      isComplete: true,
      hits: [
        {
          recordId: 'rec_alpha',
          scoreBreakdown: { title: 0, property: 0, body: 20 },
          matchedBy: ['body'],
          evidence: expect.arrayContaining([
            expect.objectContaining({
              id: expect.stringMatching(/^ev_/),
              field: 'body',
              offsetEncoding: 'utf16_code_units',
            }),
          ]),
        },
      ],
      trace: {
        strategy: 'lexical_and',
        termStats: [
          { term: 'checkout', scopedRecords: 1 },
          { term: 'latency', scopedRecords: 1 },
        ],
        noMatchReason: null,
      },
    });

    const missing = dataPlane.find({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'checkout nonexistent-term',
    });
    expect(missing.retrieval).toMatchObject({
      matched: 0,
      hits: [],
      trace: {
        noMatchReason: 'term_absent_in_scope',
        termStats: [
          { term: 'checkout', scopedRecords: 1 },
          { term: 'nonexistent-term', indexedRecords: 0, scopedRecords: 0 },
        ],
      },
    });

    const unresolved = dataPlane.find({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'score at least urgent',
    });
    expect(unresolved.result).toBeNull();
    expect(unresolved.retrieval).toBeNull();
    expect(unresolved.plan).toMatchObject({
      query: null,
      interpretation: {
        requiresResolution: true,
        warnings: [{ code: 'invalid_property_value' }],
      },
    });
  });

  test('boosts only readable, current Verification evidence and redacts it at the property boundary', async () => {
    const { contentDir, store, index, plans } = await fixture();
    const current = store.snapshot().databases.find((candidate) => candidate.id === 'db_feedback');
    if (!current) throw new Error('expected feedback database');
    const verificationProperty = {
      id: 'prop_customer_feedback_verification',
      key: 'verification',
      name: 'Verification',
      type: 'verification' as const,
    };
    await store.update(
      current.id,
      DatabaseDefinitionSchema.parse({
        ...current,
        sources: current.sources.map((source) => ({
          ...source,
          properties: [...source.properties, verificationProperty],
        })),
      }),
    );
    writeFileSync(
      join(contentDir, 'customer-feedback', 'alpha.md'),
      record({
        databaseId: current.id,
        sourceId: 'ds_customer_feedback',
        recordId: 'rec_alpha',
        title: 'Shared result',
        score: 9,
        body: 'Shared evidence',
      }),
    );
    writeFileSync(
      join(contentDir, 'customer-feedback', 'beta.md'),
      `---\n_sn:\n  database_id: db_feedback\n  source_id: ds_customer_feedback\n  record_id: rec_beta\ntitle: Shared result\nscore: 3\ncode: "3"\nverification:\n  state: verified\n  verifiedAt: 2026-07-20T00:00:00.000Z\n  verifiedBy:\n    kind: agent\n    principal_id: agent:reviewer\n---\nShared evidence\n`,
    );
    await index.rebuild();
    const readable = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    }).find({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'shared',
    }).retrieval;
    expect(readable?.hits.map((hit) => hit.recordId)).toEqual(['rec_beta', 'rec_alpha']);
    expect(readable?.hits[0]).toMatchObject({
      scoreBreakdown: { verification: 1 },
      verification: [
        {
          propertyId: verificationProperty.id,
          status: 'verified',
          verifiedBy: { kind: 'agent', principal_id: 'agent:reviewer' },
        },
      ],
    });

    const denied = createDatabaseDataPlane({
      databaseStore: store,
      databaseRecordIndex: index,
      databasePlanEngine: plans,
      resolveQueryAccess: () => ({
        policyId: 'hide-verification',
        policyRevision: `sha256:${'d'.repeat(64)}`,
        allowedRecordIds: null,
        allowedPropertyIds: current.sources[0]?.properties.map(({ id }) => id) ?? [],
      }),
      now: () => new Date('2026-07-21T00:00:00.000Z'),
    }).find({
      databaseId: 'db_feedback',
      sourceId: 'ds_customer_feedback',
      text: 'shared',
    }).retrieval;
    expect(denied?.hits.map((hit) => hit.recordId)).toEqual(['rec_alpha', 'rec_beta']);
    expect(denied?.hits.every((hit) => hit.verification === undefined)).toBe(true);
    expect(denied?.hits.every((hit) => hit.scoreBreakdown.verification === undefined)).toBe(true);
    expect(denied?.trace.ranking.verificationWeight).toBeUndefined();
  });
});
