import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  DatabaseManifestMigrationPreview,
  DatabaseTask,
} from '@nedian0brien/synapsenote-server';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  DatabaseMigrationDialog,
  DatabaseMigrationRecoveryPanel,
  databaseMigrationStartInput,
  databaseMigrationTaskStorageKey,
  migrationTaskCanRetry,
  migrationTaskCanRollback,
} from './DatabaseMigrationDialog';

const originalFetch = globalThis.fetch;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
});

const preview: DatabaseManifestMigrationPreview = {
  expectedManifestRevision: `sha256:${'b'.repeat(64)}`,
  targetVersion: 2,
  complete: true,
  committable: true,
  summary: { notNeeded: 0, ready: 51, blocked: 0 },
  items: Array.from({ length: 51 }, (_, index) => ({
    databaseId: `db_tasks_${index}`,
    databaseKey: `tasks-${index}`,
    manifestPath: `.ok/databases/tasks-${index}.yml`,
    expectedRevision: `sha256:${'a'.repeat(64)}`,
    sourceVersion: 1,
    targetVersion: 2,
    action: 'ready' as const,
    migrationIds: ['database-markdown-table-v2-content'],
    lossless: true,
    changed: true,
    planHash: `sha256:${'c'.repeat(64)}`,
    ownerPaths: [`tasks-${index}.md`],
    linkedDocumentPaths: [`tasks-${index}/first.md`],
    blockerCount: 0,
    migrationCommittedAt: '2026-07-27T00:00:00.000Z',
  })),
};

const task: DatabaseTask = {
  version: 1,
  id: 'task_migration',
  operation: 'migration',
  state: 'running',
  revision: `sha256:${'d'.repeat(64)}`,
  createdAt: '2026-07-27T00:00:00.000Z',
  startedAt: '2026-07-27T00:00:00.000Z',
  finishedAt: null,
  cancellable: true,
  progress: { completed: 1, total: 4, unit: 'files', message: 'Staging' },
  result: null,
  problem: null,
};

describe('DatabaseMigrationDialog', () => {
  test('binds start to the preview plan hash and committed-at timestamp', () => {
    expect(databaseMigrationStartInput('db_tasks_0', preview)).toEqual({
      databaseIds: ['db_tasks_0'],
      expectedManifestRevision: preview.expectedManifestRevision,
      targetVersion: 2,
      planHashes: { db_tasks_0: preview.items[0]?.planHash },
      migrationCommittedAt: { db_tasks_0: preview.items[0]?.migrationCommittedAt },
    });
    expect(
      databaseMigrationStartInput('db_tasks_0', preview, {
        ownerChoices: {
          db_tasks_0: { ds_tasks_0: { path: 'tasks-owner.md', blockId: 'dbb_tasks_primary' } },
        },
        titleChoices: { db_tasks_0: { rec_alpha: { kind: 'use_record_title' } } },
      }),
    ).toMatchObject({
      ownerChoices: {
        db_tasks_0: { ds_tasks_0: { path: 'tasks-owner.md', blockId: 'dbb_tasks_primary' } },
      },
      titleChoices: { db_tasks_0: { rec_alpha: { kind: 'use_record_title' } } },
    });
    expect(databaseMigrationStartInput(['db_tasks_0', 'db_tasks_1'], preview)).toMatchObject({
      databaseIds: ['db_tasks_0', 'db_tasks_1'],
      planHashes: {
        db_tasks_0: preview.items[0]?.planHash,
        db_tasks_1: preview.items[1]?.planHash,
      },
    });
  });

  test('shows bounded preview diff and exposes approval', () => {
    let approved = false;
    render(
      <DatabaseMigrationDialog
        preview={preview}
        task={null}
        onApprove={() => {
          approved = true;
        }}
        onCancel={() => {}}
        onResume={() => {}}
        onRollback={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(screen.getByTestId('database-migration-dialog').textContent).toContain('Ready51');
    expect(screen.getByRole('button', { name: 'Show all changes' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Show all changes' }));
    expect(screen.getByText('.ok/databases/tasks-50.yml')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Approve migration' }));
    expect(approved).toBe(true);
  });

  test('renders progress and recovery affordance without claiming completion', () => {
    let resumed = false;
    let rolledBack = false;
    let retried = false;
    const { rerender } = render(
      <DatabaseMigrationDialog
        preview={preview}
        task={task}
        onApprove={() => {}}
        onCancel={() => {}}
        onResume={() => {
          resumed = true;
        }}
        onRollback={() => {
          rolledBack = true;
        }}
        onRetry={() => {
          retried = true;
        }}
      />,
    );
    expect((screen.getByLabelText('Migration progress') as HTMLProgressElement).value).toBe(0.25);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
    rerender(
      <DatabaseMigrationDialog
        preview={preview}
        task={{
          ...task,
          state: 'failed',
          finishedAt: '2026-07-27T00:00:01.000Z',
          cancellable: false,
          problem: {
            type: 'urn:problem:task-execution-failed',
            title: 'Migration failed',
            status: 500,
            detail: 'journal needs inspection',
            code: 'task_execution_failed',
            retryable: true,
            recovery: { action: 'restart_task' },
          },
        }}
        onApprove={() => {}}
        onCancel={() => {}}
        onResume={() => {
          resumed = true;
        }}
        onRollback={() => {
          rolledBack = true;
        }}
        onRetry={() => {
          retried = true;
        }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Inspect and resume' }));
    expect(resumed).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry migration' }));
    expect(retried).toBe(true);
    rerender(
      <DatabaseMigrationDialog
        preview={preview}
        task={{
          ...task,
          state: 'succeeded',
          finishedAt: '2026-07-27T00:00:02.000Z',
          cancellable: false,
          progress: { completed: 4, total: 4, unit: 'files', message: 'Complete' },
        }}
        onApprove={() => {}}
        onCancel={() => {}}
        onResume={() => {}}
        onRollback={() => {
          rolledBack = true;
        }}
        onRetry={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roll back migration' }));
    expect(rolledBack).toBe(true);
  });

  test('requires an explicit acknowledgement for non-lossless migration items', () => {
    let approved = false;
    const nonLossless = {
      ...preview,
      items: preview.items.map((item, index) =>
        index === 0 ? { ...item, lossless: false } : item,
      ),
    };
    render(
      <DatabaseMigrationDialog
        preview={nonLossless}
        task={null}
        onApprove={() => {
          approved = true;
        }}
        onCancel={() => {}}
        onResume={() => {}}
        onRollback={() => {}}
        onRetry={() => {}}
      />,
    );
    const approve = screen.getByRole('button', { name: 'Approve migration' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(approve.disabled).toBe(false);
    fireEvent.click(approve);
    expect(approved).toBe(true);
  });

  test('renders title and owner-path choices from content-free blockers', async () => {
    const choices: Array<unknown> = [];
    const blockedItem = preview.items[0];
    if (!blockedItem) throw new Error('expected a migration preview item');
    const blockedPreview: DatabaseManifestMigrationPreview = {
      ...preview,
      committable: false,
      summary: { notNeeded: 0, ready: 0, blocked: 1 },
      items: [
        {
          ...blockedItem,
          action: 'blocked',
          planHash: undefined,
          migrationCommittedAt: undefined,
          blockers: [
            {
              code: 'title_conflict',
              recordId: 'rec_alpha',
              sourceId: 'ds_tasks',
              path: 'tasks/alpha.md',
              propertyId: 'prop_title',
              message: 'Choose a title',
            },
            {
              code: 'owner_path_collision',
              sourceId: 'ds_tasks',
              path: 'tasks-owner.md',
              message: 'Choose an owner path',
            },
          ],
        },
      ],
    };
    render(
      <DatabaseMigrationDialog
        preview={blockedPreview}
        task={null}
        onApprove={() => {}}
        onCancel={() => {}}
        onResume={() => {}}
        onRollback={() => {}}
        onRetry={() => {}}
        onTitleChoice={(recordId, choice) => choices.push({ recordId, choice })}
        onOwnerChoice={(sourceId, path, blockId) => choices.push({ sourceId, path, blockId })}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Title choice rec_alpha' }));
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Use database title' })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('option', { name: 'Use database title' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Owner path ds_tasks' }), {
      target: { value: 'migrated/tasks.md' },
    });
    expect(choices).toEqual([
      { recordId: 'rec_alpha', choice: { kind: 'use_record_title' } },
      { sourceId: 'ds_tasks', path: 'migrated/tasks.md', blockId: 'dbb_tasks_primary' },
    ]);
  });

  test('recognizes a durable succeeded task as rollback-capable and scopes its reconnect key', () => {
    expect(
      migrationTaskCanRollback({
        ...task,
        state: 'succeeded',
        finishedAt: '2026-07-27T00:00:02.000Z',
      }),
    ).toBe(true);
    expect(
      migrationTaskCanRetry({
        ...task,
        state: 'failed',
        finishedAt: '2026-07-27T00:00:02.000Z',
        cancellable: false,
        problem: {
          type: 'urn:problem:task-execution-failed',
          title: 'Migration failed',
          status: 500,
          detail: 'retryable failure',
          code: 'task_execution_failed',
          retryable: true,
        },
      }),
    ).toBe(true);
    expect(databaseMigrationTaskStorageKey('db_tasks_0')).toBe(
      'synapsenote:database:migration-task:db_tasks_0',
    );
  });

  test('reattaches a persisted task after a panel remount instead of showing optimistic success', async () => {
    const taskId = 'task_reconnect';
    const persistedTask: DatabaseTask = {
      ...task,
      id: taskId,
      state: 'succeeded',
      finishedAt: '2026-07-27T00:00:02.000Z',
      cancellable: false,
      progress: { completed: 4, total: 4, unit: 'files', message: 'Complete' },
    };
    const persistedItem = preview.items[0];
    if (!persistedItem) throw new Error('expected a migration preview item');
    const persistedPreview = { ...preview, items: [persistedItem] };
    window.localStorage.setItem(databaseMigrationTaskStorageKey('db_reconnect'), taskId);
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { action?: string };
      const payload =
        body.action === 'get' ? { task: persistedTask } : { preview: persistedPreview };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(
      <DatabaseMigrationRecoveryPanel
        databaseId="db_reconnect"
        expectedManifestRevision={preview.expectedManifestRevision}
      />,
    );
    await waitFor(() => expect(screen.getByText('succeeded')).toBeDefined());
    expect(screen.getByRole('button', { name: 'Roll back migration' })).toBeDefined();
    expect(
      fetchMock.mock.calls.some(([, init]) => String(init?.body).includes('"action":"get"')),
    ).toBe(true);
  });

  test('scopes a batch preview to the selected database IDs and exposes accessible selection controls', async () => {
    const firstItem = preview.items[0];
    const secondItem = preview.items[1];
    if (!firstItem || !secondItem) throw new Error('expected two migration preview items');
    const batchPreview: DatabaseManifestMigrationPreview = {
      ...preview,
      items: [firstItem, secondItem],
      summary: { notNeeded: 0, ready: 2, blocked: 0 },
    };
    const previewRequests: Array<{ databaseIds?: string[] }> = [];
    const fetchMock = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        action?: string;
        databaseIds?: string[];
      };
      if (body.action === 'preview_migration') {
        previewRequests.push({ databaseIds: body.databaseIds });
        return new Response(JSON.stringify({ preview: batchPreview }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ task }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    render(
      <DatabaseMigrationRecoveryPanel
        databaseIds={['db_tasks_0', 'db_tasks_1']}
        databaseLabels={{ db_tasks_0: 'Tasks', db_tasks_1: 'Projects' }}
        expectedManifestRevision={preview.expectedManifestRevision}
      />,
    );
    await waitFor(() => expect(previewRequests.length).toBeGreaterThan(0));
    expect(screen.getByRole('checkbox', { name: 'Select database Tasks' })).toBeDefined();
    const projects = screen.getByRole('checkbox', { name: 'Select database Projects' });
    expect((projects as HTMLButtonElement).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(projects);
    await waitFor(() =>
      expect(previewRequests.at(-1)?.databaseIds).toEqual(['db_tasks_0', 'db_tasks_1']),
    );
    expect(screen.getByText('Projects')).toBeDefined();
  });
});
