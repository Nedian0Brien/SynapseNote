import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../config/schema.ts';
import { register } from './database-task.ts';
import type { ServerInstance } from './shared.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function capture() {
  let handler: (args: Record<string, unknown>) => Promise<Record<string, unknown>> =
    async () => ({});
  let config: Record<string, unknown> = {};
  const server = {
    registerTool(_name: string, nextConfig: Record<string, unknown>, nextHandler: typeof handler) {
      config = nextConfig;
      handler = nextHandler;
    },
  } as unknown as ServerInstance;
  register(server, {
    resolveCwd: async () => '/project',
    config: {} as Config,
    serverUrl: 'http://localhost:7777',
  });
  return { handler, config };
}

const revision = `sha256:${'a'.repeat(64)}`;
const task = {
  version: 1,
  id: 'task_1',
  operation: 'import',
  state: 'running',
  revision,
  createdAt: '2026-07-19T00:00:00.000Z',
  startedAt: '2026-07-19T00:00:01.000Z',
  finishedAt: null,
  cancellable: true,
  progress: { completed: 4, total: 10, unit: 'files', message: 'Importing' },
  result: null,
  problem: null,
};

describe('data_task MCP tool', () => {
  test('documents approval-gated launch and checkpointed lifecycle control', () => {
    const { config } = capture();
    expect(String(config.description)).toContain('action=start');
    expect(String(config.description)).toContain('preview_import');
    expect(String(config.description)).toContain('resume');
    expect(String(config.description)).toContain('expectedRevision');
    expect(config.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    });
  });

  test('forwards list, launch, retry, resume, and exact-revision cancellation', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      if (body.action === 'list') {
        return Response.json({ action: 'list', tasks: [task], nextCursor: 'cursor_2' });
      }
      if (body.action === 'preview_import') {
        return Response.json({
          action: 'preview_import',
          preview: {
            databaseId: 'db_tasks',
            sourceId: 'ds_tasks',
            sourceFolder: 'tasks',
            items: [],
            summary: { include: 0, exclude: 0, modify: 0, reject: 0 },
            complete: true,
            entryLimit: 100_000,
          },
        });
      }
      if (body.action === 'preview_migration') {
        return Response.json({
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
            summary: { notNeeded: 1, blocked: 0 },
            complete: true,
            committable: true,
          },
        });
      }
      return Response.json({
        action: body.action,
        task:
          body.action === 'cancel'
            ? {
                ...task,
                state: 'cancelled',
                finishedAt: '2026-07-19T00:00:02.000Z',
                cancellable: false,
              }
            : task,
      });
    }) as unknown as typeof fetch;
    const { handler } = capture();

    const listed = await handler({
      action: 'list',
      state: 'running',
      limit: 1,
      cursor: 'cursor_1',
    });
    expect(listed).toMatchObject({
      structuredContent: {
        action: 'list',
        tasks: [{ id: 'task_1' }],
        nextCursor: 'cursor_2',
      },
    });
    const fetched = await handler({ action: 'get', taskId: 'task_1' });
    expect(fetched.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('task_1 is running') }),
    ]);
    const cancelled = await handler({
      action: 'cancel',
      taskId: 'task_1',
      expectedRevision: revision,
    });
    expect(cancelled.content).toEqual([
      expect.objectContaining({ text: expect.stringContaining('task_1 is cancelled') }),
    ]);
    const previewed = await handler({
      action: 'preview_import',
      databaseId: 'db_tasks',
      sourceId: 'ds_tasks',
      expectedManifestRevision: revision,
    });
    expect(previewed).toMatchObject({
      structuredContent: {
        action: 'preview_import',
        preview: { databaseId: 'db_tasks', sourceId: 'ds_tasks', complete: true },
      },
    });
    const migrationPreview = await handler({
      action: 'preview_migration',
      databaseIds: ['db_tasks'],
      expectedManifestRevision: revision,
      targetVersion: 1,
    });
    expect(migrationPreview).toMatchObject({
      structuredContent: {
        action: 'preview_migration',
        preview: { summary: { notNeeded: 1, blocked: 0 }, committable: true },
      },
    });
    await handler({
      action: 'start',
      operation: 'migration',
      expectedManifestRevision: revision,
      targetVersion: 1,
      databaseIds: ['db_tasks'],
    });
    await handler({ action: 'retry', taskId: 'task_1', expectedRevision: revision });
    await handler({ action: 'resume', taskId: 'task_1', expectedRevision: revision });
    expect(bodies).toEqual([
      { action: 'list', state: 'running', limit: 1, cursor: 'cursor_1' },
      { action: 'get', taskId: 'task_1' },
      { action: 'cancel', taskId: 'task_1', expectedRevision: revision },
      {
        action: 'preview_import',
        databaseId: 'db_tasks',
        sourceId: 'ds_tasks',
        expectedManifestRevision: revision,
      },
      {
        action: 'preview_migration',
        databaseIds: ['db_tasks'],
        expectedManifestRevision: revision,
        targetVersion: 1,
      },
      {
        action: 'start',
        task: {
          operation: 'migration',
          expectedManifestRevision: revision,
          targetVersion: 1,
          databaseIds: ['db_tasks'],
        },
      },
      { action: 'retry', taskId: 'task_1', expectedRevision: revision },
      { action: 'resume', taskId: 'task_1', expectedRevision: revision },
    ]);
  });

  test('rejects incomplete lifecycle requests before HTTP with action-specific guidance', async () => {
    const fetchMock = mock(async () => Response.json({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { handler } = capture();
    expect(await handler({ action: 'get' })).toMatchObject({
      isError: true,
      structuredContent: { problem: { code: 'invalid_request' } },
    });
    expect(await handler({ action: 'cancel', taskId: 'task_1' })).toMatchObject({
      isError: true,
      structuredContent: { problem: { code: 'invalid_request' } },
    });
    expect(await handler({ action: 'start', operation: 'bulk' })).toMatchObject({
      isError: true,
      structuredContent: { problem: { code: 'invalid_request' } },
    });
    expect(await handler({ action: 'preview_import', databaseId: 'db_tasks' })).toMatchObject({
      isError: true,
      structuredContent: { problem: { code: 'invalid_request' } },
    });
    expect(
      await handler({ action: 'preview_migration', expectedManifestRevision: revision }),
    ).toMatchObject({
      isError: true,
      structuredContent: { problem: { code: 'invalid_request' } },
    });
    const incompleteResume = await handler({ action: 'resume', taskId: 'task_1' });
    expect(incompleteResume).toMatchObject({
      isError: true,
      structuredContent: { problem: { code: 'invalid_request' } },
    });
    expect(incompleteResume.content).toEqual([
      expect.objectContaining({
        text: expect.stringContaining('resume requires expectedRevision'),
      }),
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
