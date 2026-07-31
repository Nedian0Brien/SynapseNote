import { describe, expect, test } from 'bun:test';
import {
  DATABASE_API_SCHEMA_VERSION,
  DATABASE_API_SCHEMA_VERSION_HEADER,
  DATABASE_API_SCHEMAS,
  DatabaseTaskRequestSchema,
  DatabaseTaskResponseSchema,
  DatabaseTaskSchema,
} from './database-data-plane-api.ts';

const revision = `sha256:${'a'.repeat(64)}`;

function task(state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled') {
  return {
    version: 1 as const,
    id: 'task_import_1',
    operation: 'import' as const,
    state,
    revision,
    createdAt: '2026-07-19T00:00:00.000Z',
    startedAt: state === 'queued' ? null : '2026-07-19T00:00:01.000Z',
    finishedAt:
      state === 'succeeded' || state === 'failed' || state === 'cancelled'
        ? '2026-07-19T00:00:02.000Z'
        : null,
    cancellable: state === 'queued' || state === 'running',
    progress: {
      completed: state === 'queued' ? 0 : 1,
      total: 1,
      unit: 'files' as const,
      message: null,
    },
    result: state === 'succeeded' ? { imported: 1 } : null,
    problem:
      state === 'failed'
        ? {
            type: 'urn:ok:error:database-task-failed',
            title: 'Database task failed',
            status: 500,
            detail: 'Import failed safely',
            code: 'task_failed',
            retryable: true,
          }
        : null,
  };
}

describe('versioned database API schemas', () => {
  test('publishes one immutable v1 registry for every required operation family', () => {
    expect(DATABASE_API_SCHEMA_VERSION).toBe(1);
    expect(DATABASE_API_SCHEMA_VERSION_HEADER).toBe('X-SynapseNote-Database-Schema-Version');
    expect(Object.isFrozen(DATABASE_API_SCHEMAS)).toBe(true);
    expect(Object.isFrozen(DATABASE_API_SCHEMAS.operations)).toBe(true);
    expect(Object.keys(DATABASE_API_SCHEMAS.operations)).toEqual([
      'catalog',
      'describe',
      'record',
      'computedPropertyPreview',
      'propertyConversion',
      'find',
      'retrieve',
      'query',
      'formSubmit',
      'contextPack',
      'contextInspection',
      'plan',
      'button',
      'placeSearch',
      'commit',
      'markdownTableMutation',
      'agentRuns',
      'templateRuns',
      'automations',
      'autonomy',
      'permissions',
      'publicShares',
      'undo',
      'repair',
      'task',
    ]);
    for (const schemas of Object.values(DATABASE_API_SCHEMAS.operations)) {
      expect(typeof schemas.request.safeParse).toBe('function');
      expect(typeof schemas.response.safeParse).toBe('function');
      expect(Object.isFrozen(schemas)).toBe(true);
    }
  });

  test('keeps request schemas strict and portable', () => {
    expect(DATABASE_API_SCHEMAS.operations.catalog.request.parse({ q: 'tasks' })).toEqual({
      q: 'tasks',
    });
    expect(
      DATABASE_API_SCHEMAS.operations.record.request.safeParse({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_first',
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      DATABASE_API_SCHEMAS.operations.query.request.safeParse({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      DATABASE_API_SCHEMAS.operations.formSubmit.request.safeParse({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        viewId: 'view_form',
        submissionId: 'sub_response_123',
        startedAt: '2026-07-21T12:00:00.000Z',
        answers: { prop_title: 'Response' },
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      DATABASE_API_SCHEMAS.operations.button.request.safeParse({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        recordId: 'rec_first',
        propertyId: 'prop_button',
        expectedRecordRevision: `sha256:${'a'.repeat(64)}`,
        unknown: true,
      }).success,
    ).toBe(false);
    expect(
      DATABASE_API_SCHEMAS.operations.button.request.safeParse({
        databaseId: 'db_tasks',
        buttonId: 'dbbtn_pair',
      }).success,
    ).toBe(true);
    expect(
      DATABASE_API_SCHEMAS.operations.plan.request.safeParse({
        action: 'create_database_deletion_draft',
        databaseId: 'db_tasks',
        expectedSnapshotRevision: `sha256:${'a'.repeat(64)}`,
      }).success,
    ).toBe(true);
    expect(
      DATABASE_API_SCHEMAS.operations.button.request.safeParse({
        databaseId: 'db_tasks',
        buttonId: 'dbbtn_pair',
        recordId: 'rec_first',
      }).success,
    ).toBe(false);
    expect(
      DATABASE_API_SCHEMAS.operations.contextPack.request.safeParse({
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        goal: 'Summarize tasks',
        maxTokens: 1_000,
        tokenizer: 'utf8_bytes_div3',
        encoding: 'object_rows',
      }).success,
    ).toBe(true);
    expect(
      DATABASE_API_SCHEMAS.operations.autonomy.request.safeParse({
        action: 'set_session',
        sessionId: 'session-1',
        mode: 'balanced',
        expectedRevision: 'sha256:empty',
        delegation: {
          databaseIds: ['db_tasks'],
          actions: ['update_record'],
          propertyIds: ['prop_title'],
          allowBody: false,
          maxRecordsPerAction: 10,
          maxRecordsTotal: 10,
          maxActionsTotal: 1,
          maxEgressBytesTotal: 0,
          expiresAt: '2026-07-20T01:00:00.000Z',
        },
      }).success,
    ).toBe(false);
    expect(
      DATABASE_API_SCHEMAS.operations.autonomy.response.safeParse({
        action: 'set_session',
        sessionId: 'session-1',
        mode: 'balanced',
        delegation: null,
        sessionToken: 'dbsession_one-time-capability',
        usage: { records: 0, actions: 0, egressBytes: 0 },
        revision,
        usageRevision: revision,
      }).success,
    ).toBe(true);
  });

  test('projects structured Date, Files, and Place contracts through the public response schema', () => {
    const response = {
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      manifestRevision: revision,
      indexRevision: revision,
      record: {
        id: 'rec_first',
        path: 'tasks/first.md',
        revision,
        values: {
          prop_due: {
            start: '2026-07-20T00:00:00Z',
            end: '2026-07-20T01:00:00Z',
            timeZone: 'Asia/Seoul',
            reminder: { anchor: 'start', minutesBefore: 30 },
          },
          prop_files: [
            { kind: 'local', path: 'assets/report.pdf', caption: 'Signed report' },
            { kind: 'external', url: 'https://cdn.example.com/demo.mp4', name: 'Demo' },
          ],
          prop_place: {
            label: 'City Hall',
            address: 'Seoul',
            lat: 37.57,
            lon: 126.98,
            precision: 'approximate',
            source: 'manual',
          },
        },
      },
    };
    expect(DATABASE_API_SCHEMAS.operations.record.response.safeParse(response).success).toBe(true);
    expect(
      DATABASE_API_SCHEMAS.operations.record.response.safeParse({
        ...response,
        record: {
          ...response.record,
          values: { ...response.record.values, prop_files: [{ kind: 'local', path: '../x' }] },
        },
      }).success,
    ).toBe(false);
    expect(
      DATABASE_API_SCHEMAS.operations.record.response.safeParse({
        ...response,
        record: {
          ...response.record,
          values: { ...response.record.values, prop_place: { label: 'Bad', lat: 999, lon: 0 } },
        },
      }).success,
    ).toBe(false);
  });

  test('defines content-free task list, get, cancel, progress, result, and problem envelopes', () => {
    for (const state of ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const) {
      expect(DatabaseTaskSchema.safeParse(task(state)).success).toBe(true);
    }
    expect(
      DatabaseTaskSchema.safeParse({ ...task('running'), finishedAt: '2026-07-19T00:00:02.000Z' })
        .success,
    ).toBe(false);
    expect(DatabaseTaskSchema.safeParse({ ...task('failed'), problem: null }).success).toBe(false);
    expect(DatabaseTaskRequestSchema.parse({ action: 'list' })).toEqual({
      action: 'list',
      limit: 50,
    });
    expect(
      DatabaseTaskRequestSchema.safeParse({
        action: 'cancel',
        taskId: 'task_import_1',
        expectedRevision: revision,
      }).success,
    ).toBe(true);
    expect(
      DatabaseTaskRequestSchema.safeParse({
        action: 'preview_import',
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        expectedManifestRevision: revision,
      }).success,
    ).toBe(true);
    expect(
      DatabaseTaskRequestSchema.safeParse({
        action: 'preview_migration',
        databaseIds: ['db_tasks'],
        expectedManifestRevision: revision,
        targetVersion: 1,
      }).success,
    ).toBe(true);
    expect(
      DatabaseTaskRequestSchema.safeParse({
        action: 'start',
        task: {
          operation: 'migration',
          expectedManifestRevision: revision,
          targetVersion: 1,
        },
      }).success,
    ).toBe(true);
    for (const action of ['retry', 'resume'] as const) {
      expect(
        DatabaseTaskRequestSchema.safeParse({
          action,
          taskId: 'task_import_1',
          expectedRevision: revision,
        }).success,
      ).toBe(true);
    }
    expect(
      DatabaseTaskRequestSchema.safeParse({
        action: 'rollback',
        taskId: 'task_import_1',
        expectedRevision: revision,
      }).success,
    ).toBe(true);
    expect(
      DatabaseTaskResponseSchema.safeParse({
        action: 'rollback',
        rollback: { taskId: 'task_import_1', status: 'applied', restored: 3 },
      }).success,
    ).toBe(true);
    expect(
      DatabaseTaskResponseSchema.safeParse({
        action: 'list',
        tasks: [task('running')],
        nextCursor: null,
      }).success,
    ).toBe(true);
    expect(
      DatabaseTaskResponseSchema.safeParse({
        action: 'preview_import',
        preview: {
          databaseId: 'db_tasks',
          sourceId: 'ds_tasks',
          sourceFolder: 'tasks',
          items: [
            {
              path: 'tasks/first.md',
              action: 'modify',
              reasons: [
                {
                  code: 'record_identity_required',
                  message: 'A stable record ID will be assigned.',
                },
              ],
              plannedChanges: [{ type: 'assign_record_id' }],
            },
          ],
          summary: { include: 0, exclude: 0, modify: 1, reject: 0 },
          complete: true,
          entryLimit: 100_000,
        },
      }).success,
    ).toBe(true);
    expect(
      DatabaseTaskResponseSchema.safeParse({
        action: 'preview_migration',
        preview: {
          expectedManifestRevision: revision,
          targetVersion: 1,
          items: [
            {
              databaseId: 'db_tasks',
              databaseKey: 'tasks',
              manifestPath: '.ok/databases/tasks.yml',
              expectedRevision: revision,
              sourceVersion: 1,
              targetVersion: 1,
              action: 'not_needed',
              migrationIds: ['database-manifest-v1-identity'],
              lossless: true,
              changed: false,
            },
          ],
          summary: { notNeeded: 1, ready: 0, blocked: 0 },
          complete: true,
          committable: true,
        },
      }).success,
    ).toBe(true);
  });
});
