import { describe, expect, test } from 'bun:test';
import { DatabaseContextInspector } from './database-context-inspector.ts';
import type { DatabaseContextPack } from './database-context-pack.ts';

function pack(id: string, estimatedTokens: number): DatabaseContextPack {
  return {
    id,
    goal: `Inspect ${id}`,
    database: {
      id: 'db_tasks',
      key: 'tasks',
      name: 'Tasks',
      purpose: 'Track work',
      canonicality: 'canonical',
      freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
    },
    agentView: null,
    schema: {
      manifestRevision: 'sha256:manifest',
      schemaRevision: 'sha256:schema',
      sourceId: 'ds_tasks',
      sourceKey: 'tasks',
      recordMeaning: 'One task',
      properties: [],
    },
    snapshot: {
      indexRevision: 'sha256:index',
      indexState: 'idle',
      indexFreshness: 'snapshot',
      matched: 1,
      queryPageComplete: false,
      permissionExclusions: {
        evaluated: true,
        policyId: 'support-agent',
        policyRevision: `sha256:${'a'.repeat(64)}`,
        records: 2,
        properties: 1,
      },
    },
    encoding: 'object_rows',
    records: [],
    disclosure: { level: 'records' },
    relationExpansion: null,
    returned: 0,
    isComplete: false,
    nextCursor: 'opaque-cursor',
    omitted: {
      records: 1,
      propertyIds: ['prop_secret'],
      evidence: 0,
      fullBodies: 0,
      reason: 'token_budget',
    },
    budget: {
      tokenizer: 'utf8_bytes_div3',
      maxTokens: 1_000,
      reserveTokens: 100,
      availableTokens: 900,
      estimatedTokens,
    },
  };
}

describe('DatabaseContextInspector', () => {
  test('captures exact immutable packs and separates redactions, omissions, freshness, and truncation', () => {
    const inspector = new DatabaseContextInspector(2);
    const original = pack('pack_first', 420);
    inspector.capture(original, '2026-07-19T12:00:00.000Z');
    original.goal = 'mutated after capture';

    expect(inspector.list()).toEqual([
      expect.objectContaining({
        packId: 'pack_first',
        capturedAt: '2026-07-19T12:00:00.000Z',
        goal: 'Inspect pack_first',
        tokenCount: {
          tokenizer: 'utf8_bytes_div3',
          estimated: 420,
          available: 900,
          max: 1_000,
          reserve: 100,
        },
        redactions: {
          evaluated: true,
          rootRecords: 2,
          rootProperties: 1,
          relationRecords: 0,
          relationProperties: 0,
          sensitivityProperties: 0,
          sensitivityBodies: 0,
          sensitivityRelationEdges: 0,
        },
        omissions: expect.objectContaining({ records: 1, propertyIds: ['prop_secret'] }),
        freshness: expect.objectContaining({
          manifestRevision: 'sha256:manifest',
          schemaRevision: 'sha256:schema',
          indexRevision: 'sha256:index',
          indexState: 'idle',
          indexFreshness: 'snapshot',
        }),
        truncation: {
          truncated: true,
          cause: 'token_budget',
          continuationAvailable: true,
        },
      }),
    ]);
    const detail = inspector.get('pack_first');
    expect(detail?.exactPack.goal).toBe('Inspect pack_first');
    if (!detail) throw new Error('expected captured inspection');
    detail.exactPack.goal = 'mutated returned clone';
    expect(inspector.get('pack_first')?.exactPack.goal).toBe('Inspect pack_first');
  });

  test('keeps newest-first bounded process-local history', () => {
    const inspector = new DatabaseContextInspector(2);
    inspector.capture(pack('pack_first', 100), '2026-07-19T12:00:00.000Z');
    inspector.capture(pack('pack_second', 200), '2026-07-19T12:01:00.000Z');
    inspector.capture(pack('pack_third', 300), '2026-07-19T12:02:00.000Z');

    expect(inspector.list().map((entry) => entry.packId)).toEqual(['pack_third', 'pack_second']);
    expect(inspector.get('pack_first')).toBeNull();
  });

  test('filters list and detail access by database, source, view, and record scope', () => {
    const inspector = new DatabaseContextInspector(5);
    const taskPack = pack('pack_task', 120);
    taskPack.records = [{ id: 'rec_task', path: 'tasks/task.md', values: {} }];
    const projectPack = pack('pack_project', 180);
    projectPack.database = {
      ...projectPack.database,
      id: 'db_projects',
      key: 'projects',
      name: 'Projects',
    };
    projectPack.schema = {
      ...projectPack.schema,
      sourceId: 'ds_projects',
      sourceKey: 'projects',
    };
    projectPack.agentView = {
      id: 'view_projects_agent',
      key: 'projects-agent',
      name: 'Projects agent',
      revision: 'sha256:view',
      semanticContract: {
        purpose: 'Inspect projects',
        evidence: 'preferred',
        freshness: 'require_current',
      },
      scope: { maxRecords: 10, relationDepth: 0, relationMaxRecords: 10, relationFanOut: 5 },
      readPolicy: { maxSensitivity: 'internal' },
      writePolicy: {
        mode: 'read_only',
        allowedActions: [],
        allowedPropertyIds: [],
        maxRecordsPerCommit: 0,
      },
    };
    inspector.capture(taskPack);
    inspector.capture(projectPack);

    expect(inspector.list({ databaseId: 'db_tasks' }).map((entry) => entry.packId)).toEqual([
      'pack_task',
    ]);
    expect(inspector.list({ sourceId: 'ds_projects' }).map((entry) => entry.packId)).toEqual([
      'pack_project',
    ]);
    expect(inspector.list({ viewId: 'view_projects_agent' }).map((entry) => entry.packId)).toEqual([
      'pack_project',
    ]);
    expect(inspector.list({ recordId: 'rec_task' }).map((entry) => entry.packId)).toEqual([
      'pack_task',
    ]);
    expect(inspector.list({ recordIds: ['rec_task'] }).map((entry) => entry.packId)).toEqual([
      'pack_task',
    ]);
    expect(inspector.list({ recordIds: ['rec_task', 'rec_missing'] })).toHaveLength(0);
    expect(inspector.get('pack_project', { databaseId: 'db_tasks' })).toBeNull();
    expect(inspector.get('pack_project', { viewId: 'view_projects_agent' })).toMatchObject({
      packId: 'pack_project',
    });
  });
});
