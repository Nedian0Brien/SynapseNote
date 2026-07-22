import { afterEach, describe, expect, mock, test } from 'bun:test';
import { CC1_CHANNEL_DATABASE_CHANGED, CC1_CONTRACT_VERSION } from '@nedian0brien/synapsenote-core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IDBFactory } from 'fake-indexeddb';
import { resetDatabaseOfflineCacheForTests } from '@/lib/database-offline-cache';
import { offlineDatabaseMutationStore } from '@/lib/database-offline-mutation-queue';
import { publishRemoteDatabasePresence } from '@/lib/database-presence';
import { databaseTableLayoutStorageKey } from '@/lib/database-table-layout';
import { databaseLastOpenedViewStorageKey } from '@/lib/database-view-state';
import { emitBranchChanged, emitDatabaseChanged } from '@/lib/documents-events';
import { setServerInstanceId } from '@/lib/server-instance-store';
import { DatabaseTable, DatabaseTableDialog, DatabaseWorkspacePage } from './DatabaseTableDialog';

const originalFetch = globalThis.fetch;
const originalClipboard = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;
const originalAnchorClick = HTMLAnchorElement.prototype.click;
const originalWindowOpen = window.open;
const hash = `sha256:${'a'.repeat(64)}`;
const source = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' as const },
    {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select' as const,
      options: [
        { id: 'opt_active', key: 'active', name: 'Active' },
        { id: 'opt_done', key: 'done', name: 'Done' },
        { id: 'opt_old', key: 'old', name: 'Old', archived: true },
      ],
    },
    { id: 'prop_url', key: 'url', name: 'URL', type: 'url' as const },
    { id: 'prop_email', key: 'email', name: 'Email', type: 'email' as const },
    { id: 'prop_phone', key: 'phone', name: 'Phone', type: 'phone' as const },
    {
      id: 'prop_budget',
      key: 'budget',
      name: 'Budget',
      type: 'number' as const,
      semantics: {
        constraints: { unique: false, min: -10_000, max: 10_000 },
        inferencePolicy: 'explicit_only' as const,
        sensitivity: 'inherit' as const,
        format: {
          style: 'currency',
          options: {
            currency: 'USD',
            useGrouping: true,
            minimumFractionDigits: 2,
          },
        },
      },
    },
  ],
};
const database = {
  version: 1 as const,
  id: 'db_tasks',
  key: 'tasks',
  name: 'Tasks',
  contract: {
    purpose: 'Track tasks',
    canonicality: 'canonical' as const,
    vocabulary: ['task'],
    freshness: { expectation: 'realtime' as const, maxAgeSeconds: 60 },
    sensitivity: 'internal' as const,
  },
  sources: [source],
};

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  if (originalClipboard) {
    Object.defineProperty(globalThis.navigator, 'clipboard', originalClipboard);
  } else {
    Reflect.deleteProperty(globalThis.navigator, 'clipboard');
  }
  localStorage.removeItem(databaseTableLayoutStorageKey(source.id));
  localStorage.removeItem(databaseLastOpenedViewStorageKey(database.id, source.id));
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
  HTMLAnchorElement.prototype.click = originalAnchorClick;
  window.open = originalWindowOpen;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  publishRemoteDatabasePresence([]);
  resetDatabaseOfflineCacheForTests();
  emitBranchChanged(null);
  setServerInstanceId(null);
});

function catalog() {
  return {
    query: null,
    manifestRevision: hash,
    catalogRevision: hash,
    complete: true,
    candidates: [
      {
        id: database.id,
        key: database.key,
        name: database.name,
        purpose: database.contract.purpose,
        sources: [
          {
            id: source.id,
            key: source.key,
            name: source.name,
            recordMeaning: source.recordMeaning,
            propertyCount: source.properties.length,
          },
        ],
        viewCount: 0,
        relationCount: 0,
        score: 0,
        matchedBy: [],
      },
    ],
  };
}

function description() {
  return {
    manifestRevision: hash,
    schemaRevision: hash,
    database,
    source,
    index: {
      state: 'idle',
      revision: hash,
      manifestRevision: hash,
      recordCount: 1,
      issueCount: 0,
      progress: null,
      lastRebuiltAt: '2026-07-20T00:00:00.000Z',
      lastIncrementalAt: null,
      lastError: null,
    },
    allowedOperations: ['catalog', 'describe', 'find', 'query', 'pack'],
  };
}

function queryResult() {
  return {
    sourceId: source.id,
    snapshotRevision: hash,
    matched: 2,
    returned: 1,
    isComplete: false,
    nextCursor: 'cursor_more',
    truncatedBy: 'page_limit',
    indexFreshness: 'snapshot',
    records: [
      {
        id: 'rec_first',
        path: 'tasks/first.md',
        revision: hash,
        values: {
          prop_title: 'First task',
          prop_status: 'opt_active',
          prop_url: 'https://example.com/task',
          prop_email: 'owner@example.com',
          prop_phone: '+82 (2) 1234-5678',
          prop_budget: 1234.5,
        },
      },
    ],
    aggregation: null,
  };
}

describe('DatabaseTableDialog', () => {
  test('plans a source-level multi-step Button from the database header', async () => {
    const actionDatabase = {
      ...database,
      buttons: [
        {
          id: 'dbbtn_pair',
          key: 'create-pair',
          name: 'Create task pair',
          placement: { kind: 'source' as const, sourceId: source.id },
          confirmation: { title: 'Create both tasks?' },
          actions: [
            {
              id: 'create_first',
              kind: 'create_record' as const,
              sourceId: source.id,
              values: { prop_title: 'First generated task' },
              body: '',
            },
            {
              id: 'create_second',
              kind: 'create_record' as const,
              sourceId: source.id,
              values: { prop_title: 'Second generated task' },
              body: '',
            },
          ],
        },
      ],
    };
    const requests: unknown[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json({ ...description(), database: actionDatabase });
      }
      if (path === '/api/databases/query') return Response.json(queryResult());
      if (path === '/api/databases/button') {
        const request = JSON.parse(String(init?.body));
        requests.push(request);
        if (request.action === 'execute') {
          return Response.json({
            action: 'execute',
            run: {
              version: 1,
              id: 'buttonrun_pair',
              buttonPlanId: 'buttonplan_pair',
              buttonPlanHash: hash,
              databaseId: database.id,
              recordId: null,
              buttonId: 'dbbtn_pair',
              propertyId: null,
              state: 'succeeded',
              attempt: 1,
              createdAt: '2026-07-21T00:00:00.000Z',
              startedAt: '2026-07-21T00:00:00.000Z',
              finishedAt: '2026-07-21T00:00:01.000Z',
              nextAttemptAt: null,
              internalMutationId: 'mut_pair',
              actions: [
                {
                  actionId: 'internal_commit',
                  kind: 'internal_commit',
                  state: 'succeeded',
                  receiptId: 'mut_pair',
                },
              ],
              errorCode: null,
              error: null,
            },
            undoToken: 'undo_pair.token',
          });
        }
        return Response.json({
          plan: {
            id: 'buttonplan_pair',
            hash,
            createdAt: '2026-07-21T00:00:00.000Z',
            databaseId: database.id,
            sourceId: source.id,
            recordId: null,
            propertyId: null,
            buttonId: 'dbbtn_pair',
            label: 'Create task pair',
            confirmation: { title: 'Create both tasks?' },
            expectedRecordRevision: null,
            databaseSnapshotRevision: hash,
            permissionGuards: [],
            internalPlan: {
              id: 'plan_pair',
              committable: true,
              diff: { records: [{ action: 'create' }, { action: 'create' }] },
            },
            externalSteps: [],
            risk: { level: 'low', reasons: ['button_confirmation'] },
            requiresApproval: true,
          },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-database-workspace][data-database-id="db_tasks"][data-source-id="ds_tasks"]',
        ),
      ).not.toBeNull(),
    );
    expect(document.querySelector('[data-database-workspace]')?.getAttribute('data-view-id')).toBe(
      null,
    );
    expect(
      document
        .querySelector('[data-database-workspace]')
        ?.getAttribute('data-database-machine-ids'),
    ).toBe('stable');
    fireEvent.click(await screen.findByRole('button', { name: 'Create task pair' }));
    expect((await screen.findByTestId('database-button-review')).textContent).toContain(
      '2 database record changes',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run Button' }));
    await waitFor(() => expect(screen.queryByTestId('database-button-review')).toBeNull());
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual({
      databaseId: database.id,
      buttonId: 'dbbtn_pair',
    });
    expect(requests[1]).toMatchObject({
      action: 'execute',
      buttonPlanId: 'buttonplan_pair',
      buttonPlanHash: hash,
      approvalToken: `approve:${hash}`,
      actor: { principalId: 'user:local', kind: 'human' },
    });
  });

  test('renders a full Gallery from its saved Files preview', async () => {
    const gallerySource = {
      ...source,
      properties: [
        ...source.properties,
        {
          id: 'prop_media',
          key: 'media',
          name: 'Media',
          type: 'files' as const,
        },
      ],
    };
    const galleryView = {
      id: 'view_gallery',
      key: 'gallery',
      name: 'Gallery',
      sourceId: source.id,
      layout: {
        type: 'gallery' as const,
        configuration: {
          cardSize: 'medium' as const,
          cardPreview: { type: 'files' as const, propertyId: 'prop_media' },
          fitImage: false,
          showTitle: true,
          fallbackStyle: 'color' as const,
          loadLimit: 100,
        },
      },
      sort: [],
      groups: [],
      projection: { propertyIds: ['prop_title'], body: 'hidden' as const },
    };
    const galleryDatabase = {
      ...database,
      sources: [gallerySource],
      views: [galleryView],
    };
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json({
          ...description(),
          database: galleryDatabase,
          source: gallerySource,
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          ...queryResult(),
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          records: [
            {
              ...queryResult().records[0],
              values: {
                ...queryResult().records[0]?.values,
                prop_media: [{ kind: 'local', path: 'media/first.png' }],
              },
            },
          ],
          fileStates: { 'media/first.png': 'available' },
        });
      }
      if (path.startsWith('/api/document?docName=tasks%2Ffirst')) {
        return Response.json({
          docName: 'tasks/first',
          content: '---\ntitle: First task\n---\nCanonical body from Markdown.',
          lifecycle: null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 400 });
    }) as typeof fetch;

    render(
      <DatabaseTableDialog
        open
        onOpenChange={() => {}}
        initialTarget={{
          databaseId: database.id,
          sourceId: source.id,
          viewId: galleryView.id,
        }}
      />,
    );
    expect(await screen.findByRole('img', { name: 'First task' })).toBeTruthy();
    expect(document.querySelector('[data-gallery-card="rec_first"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'First task' }));
    expect(await screen.findByText('Canonical body from Markdown.')).toBeTruthy();
    expect(document.querySelector('[data-database-record-peek]')).toBeTruthy();
  });

  test('renders Calendar and drafts a range resize as one exact stable-key mutation', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrowDate = new Date(`${today}T00:00:00.000Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);
    const calendarSource = {
      ...source,
      properties: [
        ...source.properties,
        {
          id: 'prop_schedule',
          key: 'schedule',
          name: 'Schedule',
          type: 'date' as const,
        },
      ],
    };
    const calendarView = {
      id: 'view_calendar',
      key: 'calendar',
      name: 'Calendar',
      sourceId: source.id,
      layout: {
        type: 'calendar' as const,
        configuration: {
          datePropertyId: 'prop_schedule',
          display: 'month' as const,
          weekStartsOn: 'monday' as const,
          timeZone: 'UTC',
          showWeekends: true,
          cardLimitPerDay: 10,
        },
      },
      sort: [],
      groups: [],
      projection: { propertyIds: ['prop_title'], body: 'hidden' as const },
    };
    const calendarDatabase = {
      ...database,
      sources: [calendarSource],
      views: [calendarView],
    };
    let draftedMutations: unknown[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: { recordMutations?: unknown[] };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json({
          ...description(),
          database: calendarDatabase,
          source: calendarSource,
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          ...queryResult(),
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          records: [
            {
              ...queryResult().records[0],
              values: {
                ...queryResult().records[0]?.values,
                prop_schedule: today,
              },
            },
          ],
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        draftedMutations = body.desiredState?.recordMutations ?? [];
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_calendar', revision: hash },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 400 });
    }) as typeof fetch;

    render(
      <DatabaseTableDialog
        open
        onOpenChange={() => {}}
        initialTarget={{
          databaseId: database.id,
          sourceId: source.id,
          viewId: calendarView.id,
        }}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Resize end for rec_first' }));
    await waitFor(() => expect(draftedMutations).toHaveLength(1));
    expect(draftedMutations).toEqual([
      {
        id: 'rec_first',
        expectedRevision: hash,
        sourceKey: 'tasks',
        operations: [
          {
            op: 'set',
            propertyKey: 'schedule',
            value: { start: today, end: tomorrow },
          },
        ],
        preconditions: [{ propertyKey: 'schedule', present: true, value: today }],
      },
    ]);
  });

  test('renders Timeline and drafts a date drag as one exact stable-key mutation', async () => {
    const timelineSource = {
      ...source,
      properties: [
        ...source.properties,
        {
          id: 'prop_schedule',
          key: 'schedule',
          name: 'Schedule',
          type: 'date' as const,
        },
      ],
    };
    const timelineView = {
      id: 'view_timeline',
      key: 'timeline',
      name: 'Timeline',
      sourceId: source.id,
      layout: {
        type: 'timeline' as const,
        configuration: {
          dateMapping: { type: 'range' as const, propertyId: 'prop_schedule' },
          scale: 'day' as const,
          showTable: true,
          showToday: true,
          showDependencies: true,
          noDateLane: true,
          loadLimit: 100,
        },
      },
      sort: [],
      groups: [],
      projection: {
        propertyIds: ['prop_title', 'prop_schedule'],
        body: 'hidden' as const,
      },
    };
    const timelineDatabase = {
      ...database,
      sources: [timelineSource],
      views: [timelineView],
    };
    let draftedMutations: unknown[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: { recordMutations?: unknown[] };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json({
          ...description(),
          database: timelineDatabase,
          source: timelineSource,
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          ...queryResult(),
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          records: [
            {
              ...queryResult().records[0],
              values: {
                ...queryResult().records[0]?.values,
                prop_schedule: { start: '2026-07-20', end: '2026-07-22' },
              },
            },
          ],
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        draftedMutations = body.desiredState?.recordMutations ?? [];
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_timeline', revision: hash },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 400 });
    }) as typeof fetch;

    render(
      <DatabaseTableDialog
        open
        onOpenChange={() => {}}
        initialTarget={{
          databaseId: database.id,
          sourceId: source.id,
          viewId: timelineView.id,
        }}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Move rec_first later' }));
    await waitFor(() => expect(draftedMutations).toHaveLength(1));
    expect(draftedMutations).toEqual([
      {
        id: 'rec_first',
        expectedRevision: hash,
        sourceKey: 'tasks',
        operations: [
          {
            op: 'set',
            propertyKey: 'schedule',
            value: { start: '2026-07-21', end: '2026-07-23' },
          },
        ],
        preconditions: [
          {
            propertyKey: 'schedule',
            present: true,
            value: { start: '2026-07-20', end: '2026-07-22' },
          },
        ],
      },
    ]);
  });

  test('plans a linked Board transition as one exact stable-key record mutation', async () => {
    let draftedMutations: unknown[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: { recordMutations?: unknown[] };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') return Response.json(queryResult());
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        draftedMutations = body.desiredState?.recordMutations ?? [];
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_board_transition', revision: hash },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 400 });
    }) as typeof fetch;

    render(
      <DatabaseTableDialog
        open
        onOpenChange={() => {}}
        initialTarget={{ databaseId: database.id, sourceId: source.id }}
        initialRecordAction={{
          kind: 'transition',
          recordId: 'rec_first',
          changes: [{ propertyId: 'prop_status', value: 'opt_done' }],
        }}
      />,
    );

    await waitFor(() => expect(draftedMutations).toHaveLength(1));
    expect(draftedMutations).toEqual([
      {
        id: 'rec_first',
        expectedRevision: hash,
        sourceKey: 'tasks',
        operations: [{ op: 'set', propertyKey: 'status', value: 'opt_done' }],
        preconditions: [{ propertyKey: 'status', present: true, value: 'opt_active' }],
      },
    ]);
  });

  test('shows attributed remote editing presence in the exact table cell', () => {
    publishRemoteDatabasePresence([
      {
        actor: { kind: 'agent', name: 'Data agent', color: '#2563eb' },
        databaseId: database.id,
        sourceId: source.id,
        recordId: 'rec_first',
        propertyId: 'prop_title',
        viewId: null,
        scope: 'cell',
        operation: 'editing',
        updatedAt: Date.now(),
      },
    ]);
    render(<DatabaseTable databaseId={database.id} source={source} result={queryResult()} />);

    const badge = screen.getByLabelText('Data agent is editing');
    expect(badge.closest('[data-property-id="prop_title"]')).toBeTruthy();
  });

  test('renders a direct-safe optimistic cell value without marking it as a ghost', () => {
    const optimisticCellValues = new Map([['rec_first:prop_title', 'Saving task']]);
    render(
      <DatabaseTable
        databaseId={database.id}
        source={source}
        result={queryResult()}
        optimisticCellValues={optimisticCellValues}
      />,
    );

    const cell = screen.getByText('Saving task').closest('[data-property-id="prop_title"]');
    expect(cell).not.toBeNull();
    expect(cell?.getAttribute('data-canonical')).toBe('true');
    expect(screen.queryByText('First task')).toBeNull();
  });

  test('focuses the inline new-record title after creation handoff', async () => {
    render(
      <DatabaseTable
        databaseId={database.id}
        source={source}
        result={{ ...queryResult(), records: [] }}
        onCreateRecord={() => {}}
        autoFocusNewRecord
      />,
    );

    const input = screen.getByTestId('database-new-row-title');
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  test('surfaces schema property management only when the host wires it up', () => {
    const { rerender } = render(
      <DatabaseTable databaseId={database.id} source={source} result={queryResult()} />,
    );
    expect(screen.queryByRole('button', { name: 'Manage properties' })).toBeNull();

    const onManageProperties = mock(() => {});
    const onRemoveProperty = mock(() => {});
    rerender(
      <DatabaseTable
        databaseId={database.id}
        source={source}
        result={queryResult()}
        onManageProperties={onManageProperties}
        onRemoveProperty={onRemoveProperty}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add property' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add property' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manage properties' }));
    expect(onManageProperties).toHaveBeenCalledTimes(2);
  });

  test('opens a contextual property menu for visibility, order, calculations, and settings', async () => {
    const onManageProperties = mock(() => {});
    const onRemoveProperty = mock(() => {});
    const onConvertProperty = mock(() => {});
    const onCalculationChange = mock(() => {});
    const onOpenPropertyContextInspector = mock(() => {});
    const onOpenAgentScope = mock(() => {});
    const onOpenPropertySort = mock(() => {});
    const onOpenPropertyFilter = mock(() => {});
    const onDuplicateProperty = mock(() => {});
    const user = userEvent.setup();
    const view = render(
      <DatabaseTable
        databaseId={database.id}
        source={source}
        result={queryResult()}
        onManageProperties={onManageProperties}
        onRemoveProperty={onRemoveProperty}
        onConvertProperty={onConvertProperty}
        onCalculationChange={onCalculationChange}
        onOpenPropertyContextInspector={onOpenPropertyContextInspector}
        onOpenAgentScope={onOpenAgentScope}
        onOpenPropertySort={onOpenPropertySort}
        onOpenPropertyFilter={onOpenPropertyFilter}
        onDuplicateProperty={onDuplicateProperty}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Property options for Budget' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Show column' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Move left' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Move right' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Calculate' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Sort by property' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Filter by property' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Inspect property context' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Ask agent about property' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Rename or configure property' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Change property type' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Duplicate property' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete property' })).toBeTruthy();

    await user.click(screen.getByRole('menuitem', { name: 'Sort by property' }));
    expect(onOpenPropertySort).toHaveBeenCalledWith(
      source.properties.find((property) => property.id === 'prop_budget'),
    );
    await user.click(screen.getByRole('button', { name: 'Property options for Budget' }));
    await user.click(screen.getByRole('menuitem', { name: 'Filter by property' }));
    expect(onOpenPropertyFilter).toHaveBeenCalledWith(
      source.properties.find((property) => property.id === 'prop_budget'),
    );
    await user.click(screen.getByRole('button', { name: 'Property options for Budget' }));
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate property' }));
    expect(onDuplicateProperty).toHaveBeenCalledWith(
      source.properties.find((property) => property.id === 'prop_budget'),
    );

    await user.click(screen.getByRole('button', { name: 'Property options for Budget' }));
    await user.click(screen.getByRole('menuitem', { name: 'Inspect property context' }));
    expect(onOpenPropertyContextInspector).toHaveBeenCalledWith(
      source.properties.find((property) => property.id === 'prop_budget'),
    );

    await user.click(screen.getByRole('button', { name: 'Property options for Budget' }));
    await user.click(screen.getByRole('menuitem', { name: 'Ask agent about property' }));
    expect(onOpenAgentScope).toHaveBeenCalledWith({
      databaseId: database.id,
      sourceId: source.id,
      propertyIds: ['prop_budget'],
    });

    await user.click(screen.getByRole('button', { name: 'Property options for Budget' }));
    await user.click(screen.getByRole('menuitem', { name: 'Rename or configure property' }));
    expect(onManageProperties).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Property options for Budget' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete property' }));
    expect(onRemoveProperty).toHaveBeenCalledWith(
      source.properties.find((property) => property.id === 'prop_budget'),
    );

    await user.click(screen.getByRole('button', { name: 'Property options for URL' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Show column' }));
    expect(view.container.querySelector('[data-property-id="prop_url"]')).toBeNull();
  });

  test('renders first-match row colors and property-specific overrides with inspectable metadata', () => {
    render(
      <DatabaseTable
        source={source}
        result={
          {
            ...queryResult(),
            isComplete: true,
            nextCursor: null,
            conditionalColors: {
              rules: [
                {
                  id: 'ccr_active_row',
                  key: 'active-row',
                  name: 'Active row',
                  color: 'yellow',
                  applyTo: { type: 'page' },
                },
                {
                  id: 'ccr_active_status',
                  key: 'active-status',
                  name: 'Active status',
                  color: 'green',
                  applyTo: { type: 'property', propertyId: 'prop_status' },
                },
              ],
              records: {
                rec_first: {
                  pageRuleId: 'ccr_active_row',
                  propertyRuleIds: { prop_status: 'ccr_active_status' },
                },
              },
            },
          } as never
        }
      />,
    );
    const row = document.querySelector('tr[data-record-id="rec_first"]');
    const title = document.querySelector('[data-database-cell-row][data-property-id="prop_title"]');
    const status = document.querySelector(
      '[data-database-cell-row][data-property-id="prop_status"]',
    );
    expect(row?.getAttribute('data-conditional-color')).toBe('yellow');
    expect(title?.getAttribute('data-conditional-color-rule')).toBe('ccr_active_row');
    expect(status?.getAttribute('data-conditional-color')).toBe('green');
    expect(status?.getAttribute('data-conditional-color-rule')).toBe('ccr_active_status');
  });

  test('renders derived Verification state and emits only explicit lifecycle actions', () => {
    const verificationProperty = {
      id: 'prop_verification',
      key: 'verification',
      name: 'Verification',
      type: 'verification' as const,
      allowExpiry: true,
    };
    const verificationSource = {
      ...source,
      properties: [source.properties[0], verificationProperty],
    };
    const actions: string[] = [];
    const result = {
      ...queryResult(),
      records: [
        {
          ...queryResult().records[0],
          evidenceRevision: hash,
          values: {
            prop_title: 'First task',
            prop_verification: {
              state: 'verified' as const,
              verifiedAt: '2026-07-20T00:00:00.000Z',
              verifiedBy: { kind: 'agent' as const, principal_id: 'agent:reviewer' },
            },
          },
          verificationProjections: {
            prop_verification: {
              storedState: 'verified' as const,
              status: 'stale' as const,
              isExpired: false,
              isStale: true,
              verifiedAt: '2026-07-20T00:00:00.000Z',
              verifiedBy: { kind: 'agent' as const, principal_id: 'agent:reviewer' },
              currentRevision: hash,
              currentEvidenceRevision: hash,
            },
          },
        },
      ],
    };
    const { rerender } = render(
      <DatabaseTable
        source={verificationSource as never}
        result={result as never}
        onVerificationAction={(_record, _property, action) => actions.push(action)}
      />,
    );
    expect(screen.getByText('stale')).toBeTruthy();
    expect(screen.getByTitle('stale · agent · agent:reviewer')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Renew' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unverify' }));
    expect(actions).toEqual(['renew', 'unverify']);

    rerender(
      <DatabaseTable
        source={verificationSource as never}
        result={result as never}
        viewPropertyIds={['prop_title']}
      />,
    );
    expect(document.querySelector('th[data-property-id="prop_verification"]')).toBeNull();
    expect(screen.queryByText('stale')).toBeNull();
  });

  test('applies saved-view projection as column visibility without altering the source schema', () => {
    render(
      <DatabaseTable
        source={source}
        result={{ ...queryResult(), isComplete: true, nextCursor: null } as never}
        viewPropertyIds={['prop_title', 'prop_status']}
      />,
    );
    expect(document.querySelector('th[data-property-id="prop_title"]')).toBeTruthy();
    expect(document.querySelector('th[data-property-id="prop_status"]')).toBeTruthy();
    expect(document.querySelector('th[data-property-id="prop_budget"]')).toBeNull();
    expect(source.properties.some((property) => property.id === 'prop_budget')).toBe(true);
  });

  test('routes saved-view property visibility and order changes through a view callback', async () => {
    const onViewPropertyIdsChange = mock(() => {});
    const user = userEvent.setup();
    render(
      <DatabaseTable
        source={source}
        result={{ ...queryResult(), isComplete: true, nextCursor: null } as never}
        viewPropertyIds={['prop_title', 'prop_status', 'prop_budget']}
        onViewPropertyIdsChange={onViewPropertyIdsChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Property options for Budget' }));
    await user.click(screen.getByRole('menuitem', { name: 'Move left' }));
    expect(onViewPropertyIdsChange).toHaveBeenLastCalledWith([
      'prop_title',
      'prop_budget',
      'prop_status',
    ]);

    await user.click(screen.getByRole('button', { name: 'Property options for Budget' }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Show column' }));
    expect(onViewPropertyIdsChange).toHaveBeenLastCalledWith(['prop_title', 'prop_status']);
  });

  test('applies canonical saved-view order and display without overwriting personal layout', () => {
    const personalLayout = {
      propertyIds: source.properties.map((property) => property.id),
      hiddenPropertyIds: ['prop_status'],
      widths: Object.fromEntries(source.properties.map((property) => [property.id, 180])),
      wrap: false,
      rowHeight: 'tall',
    };
    localStorage.setItem(databaseTableLayoutStorageKey(source.id), JSON.stringify(personalLayout));
    render(
      <DatabaseTable
        source={source}
        result={{ ...queryResult(), isComplete: true, nextCursor: null } as never}
        viewPropertyIds={['prop_title', 'prop_budget', 'prop_status']}
        viewConfiguration={{
          wrap: true,
          rowHeight: 'compact',
          propertyWidths: { prop_title: 320, prop_budget: 240 },
        }}
      />,
    );
    expect(
      [...document.querySelectorAll('th[data-property-id]')].map((element) =>
        element.getAttribute('data-property-id'),
      ),
    ).toEqual(['prop_title', 'prop_budget', 'prop_status']);
    expect(document.querySelector('table')?.getAttribute('data-row-height')).toBe('compact');
    expect(
      (document.querySelector('th[data-property-id="prop_budget"]') as HTMLElement).style.width,
    ).toBe('240px');
    expect(
      document
        .querySelector('[data-database-cell-row][data-property-id="prop_budget"]')
        ?.className.includes('whitespace-normal'),
    ).toBe(true);
    expect(
      JSON.parse(localStorage.getItem(databaseTableLayoutStorageKey(source.id)) ?? '{}'),
    ).toEqual(personalLayout);
  });

  test('opens the canonical source default and remembers an explicit All records preference', async () => {
    const user = userEvent.setup();
    const savedView = {
      id: 'view_active',
      key: 'active',
      name: 'Active tasks',
      sourceId: source.id,
      layout: {
        type: 'list' as const,
        configuration: {
          hierarchy: { type: 'flat' as const },
          density: 'compact' as const,
          showSections: true,
          collapsibleSections: true,
          showDividers: true,
          loadLimit: 100,
        },
      },
      where: {
        propertyId: 'prop_status',
        operator: 'eq' as const,
        value: 'opt_active',
      },
      sort: [],
      groups: [],
      projection: {
        propertyIds: ['prop_title', 'prop_status'],
        body: 'hidden' as const,
      },
    };
    const databaseWithDefault = {
      ...database,
      sources: [{ ...source, defaultViewId: savedView.id }],
      views: [savedView],
    };
    const queryBodies: Array<{ viewId?: string }> = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json({
          ...description(),
          database: databaseWithDefault,
          source: databaseWithDefault.sources[0],
        });
      }
      if (path === '/api/databases/query') {
        queryBodies.push(JSON.parse(String(init?.body)) as { viewId?: string });
        return Response.json(queryResult());
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(queryBodies.some((body) => body.viewId === savedView.id)).toBe(true),
    );
    expect(screen.getByRole('combobox', { name: 'Saved database view' }).textContent).toContain(
      'Active tasks',
    );
    expect(screen.getByRole('tab', { name: 'Active tasks' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(document.querySelector('[data-database-primary-view-tabs]')).not.toBeNull();
    expect(document.querySelector('[data-database-compact-view-switcher]')?.className).toContain(
      'md:hidden',
    );
    expect(screen.getByRole('button', { name: 'Drag Active tasks view' })).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'View options for Active tasks' }));
    expect(screen.getByRole('menuitem', { name: 'Filters' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'View settings' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Rename' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Duplicate' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Favorite' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Move left' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Move right' })).not.toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Move left' }).getAttribute('data-disabled'),
    ).not.toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Move right' }).getAttribute('data-disabled'),
    ).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Clear default' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Cannot delete default' })).not.toBeNull();
    expect(
      screen.getByRole('menuitem', { name: 'Cannot delete default' }).getAttribute('data-disabled'),
    ).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Manage views' })).not.toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Filters' }));
    expect(await screen.findByRole('heading', { name: 'Advanced saved filters' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'New database view' })).toBeDefined();
    fireEvent.click(screen.getByRole('combobox', { name: 'Saved database view' }));
    fireEvent.click(await screen.findByRole('option', { name: 'All records' }));
    await waitFor(() => expect(queryBodies.at(-1)?.viewId).toBeUndefined());
    expect(localStorage.getItem(databaseLastOpenedViewStorageKey(database.id, source.id))).toBe(
      '{"viewId":null}',
    );
  });

  test('drags a saved-view tab to a stable target and compiles one reorder-to plan', async () => {
    const viewFirst = {
      id: 'view_first',
      key: 'first',
      name: 'First',
      sourceId: source.id,
      layout: { type: 'table' as const, configuration: {} },
      sort: [],
      groups: [],
      projection: { propertyIds: ['prop_title'], body: 'hidden' as const },
    };
    const viewMiddle = { ...viewFirst, id: 'view_middle', key: 'middle', name: 'Middle' };
    const viewLast = { ...viewFirst, id: 'view_last', key: 'last', name: 'Last' };
    const databaseWithViews = {
      ...database,
      views: [viewFirst, viewMiddle, viewLast],
    };
    const reorderedViews = [viewMiddle, viewLast, viewFirst];
    let desiredState: { views?: Array<{ id: string }> } | null = null;
    let committedViews = databaseWithViews.views;
    let commitCalls = 0;
    let undoCalls = 0;
    let releaseCommit: (() => void) | undefined;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: { views?: Array<{ id: string }> };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json({
          ...description(),
          database: { ...databaseWithViews, views: committedViews },
        });
      }
      if (path === '/api/databases/query') return Response.json(queryResult());
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        desiredState = body.desiredState ?? null;
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_reorder', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_reorder',
            hash,
            draftId: 'draft_reorder',
            draftRevision: hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: true,
            conflicts: [],
            approvals: [],
            risk: { level: 'low', reasons: [] },
            diff: { manifests: [], records: [], templates: [], policy: {} },
          },
        });
      }
      if (path === '/api/databases/commit') {
        commitCalls += 1;
        const nextViews = desiredState?.views
          ?.map(({ id }) => databaseWithViews.views.find((view) => view.id === id))
          .filter((view): view is (typeof databaseWithViews.views)[number] => view !== undefined);
        if (nextViews?.length === databaseWithViews.views.length) committedViews = nextViews;
        return new Promise<Response>((resolve) => {
          releaseCommit = () =>
            resolve(
              Response.json({
                mutationId: 'mut_reorder',
                planId: 'plan_reorder',
                planHash: hash,
                idempotentReplay: false,
                actualDiff: [],
                verification: { status: 'passed' },
                undoToken: 'undo_reorder',
              }),
            );
        });
      }
      if (path === '/api/databases/undo') {
        undoCalls += 1;
        const action = String(body.action);
        if (action === 'apply') committedViews = databaseWithViews.views;
        if (action === 'redo_apply') committedViews = reorderedViews;
        return Response.json({
          action,
          undoId: 'undo_reorder',
          mutationId: 'mut_reorder',
          canApply: true,
          conflicts: [],
          ...(action === 'apply' || action === 'redo_apply'
            ? { receipt: { status: 'applied' } }
            : {}),
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as unknown as typeof fetch;

    render(
      <DatabaseTableDialog
        open
        onOpenChange={() => {}}
        initialTarget={{ databaseId: database.id, sourceId: source.id }}
      />,
    );
    await screen.findByRole('grid');
    const dragHandle = screen.getByRole('button', { name: 'Drag First view' });
    const target = document.querySelector<HTMLElement>('[data-view-id="view_last"]');
    expect(target).not.toBeNull();
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: mock(() => {}),
      getData: mock(() => 'view_first'),
    } as unknown as DataTransfer;
    fireEvent.dragStart(dragHandle, { dataTransfer });
    fireEvent.dragOver(target as HTMLElement, { dataTransfer });
    expect(target?.getAttribute('data-view-drag-over')).toBe('true');
    fireEvent.drop(target as HTMLElement, { dataTransfer });
    await waitFor(() => expect(desiredState).not.toBeNull());
    expect(desiredState?.views?.map((view) => view.id)).toEqual([
      'view_middle',
      'view_last',
      'view_first',
    ]);
    await waitFor(() => expect(commitCalls).toBe(1));
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-database-view-tabs] [data-view-id]')].map(
        (view) => view.getAttribute('data-view-id'),
      ),
    ).toEqual(['view_middle', 'view_last', 'view_first']);
    expect(screen.getByTestId('database-save-indicator')).toBeTruthy();
    releaseCommit?.();
    await waitFor(() =>
      expect(
        screen.getByTestId('database-save-indicator').getAttribute('data-database-save-state'),
      ).toBe('saved'),
    );
    await screen.findByRole('button', { name: 'More database actions' });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More database actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Undo last change' }));
    await waitFor(() => expect(undoCalls).toBe(2));
    await waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLElement>('[data-database-view-tabs] [data-view-id]')].map(
          (view) => view.getAttribute('data-view-id'),
        ),
      ).toEqual(['view_first', 'view_middle', 'view_last']),
    );
    await screen.findByRole('button', { name: 'More database actions' });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'More database actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Redo last change' }));
    await waitFor(() => expect(undoCalls).toBe(4));
    await waitFor(() =>
      expect(
        [...document.querySelectorAll<HTMLElement>('[data-database-view-tabs] [data-view-id]')].map(
          (view) => view.getAttribute('data-view-id'),
        ),
      ).toEqual(['view_middle', 'view_last', 'view_first']),
    );
  });

  test('opens an explicit linked-view target without replacing it with local preference', async () => {
    const savedView = {
      id: 'view_linked',
      key: 'linked',
      name: 'Linked tasks',
      sourceId: source.id,
      layout: { type: 'table' as const, configuration: {} },
      sort: [],
      groups: [],
      projection: { propertyIds: ['prop_title'], body: 'hidden' as const },
    };
    const linkedDatabase = { ...database, views: [savedView] };
    localStorage.setItem(
      databaseLastOpenedViewStorageKey(database.id, source.id),
      JSON.stringify({ viewId: null }),
    );
    const queryBodies: Array<{ viewId?: string }> = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json({ ...description(), database: linkedDatabase });
      }
      if (path === '/api/databases/query') {
        queryBodies.push(JSON.parse(String(init?.body)) as { viewId?: string });
        return Response.json(queryResult());
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseTableDialog
        open
        onOpenChange={() => {}}
        initialTarget={{
          databaseId: database.id,
          sourceId: source.id,
          viewId: savedView.id,
        }}
      />,
    );
    await waitFor(() =>
      expect(queryBodies.some((body) => body.viewId === savedView.id)).toBe(true),
    );
    expect(
      (await screen.findByRole('combobox', { name: 'Saved database view' })).textContent,
    ).toContain('Linked tasks');
  });

  test('formats Unique IDs with the configured prefix and keeps them read-only', () => {
    const uniqueSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_ticket',
          key: 'ticket',
          name: 'Ticket',
          type: 'unique_id' as const,
          prefix: 'TASK',
          nextNumber: 42,
        },
      ],
    };
    const onConfigure = mock(() => {});
    render(
      <DatabaseTable
        source={uniqueSource as never}
        result={{
          ...queryResult(),
          records: [
            {
              id: 'rec_unique',
              path: 'tasks/unique.md',
              revision: hash,
              values: { prop_title: 'Unique task', prop_ticket: 41 },
            },
          ],
        }}
        onEdit={() => {
          throw new Error('Unique ID cells must remain read-only');
        }}
        onConfigureUniqueIdProperty={onConfigure}
      />,
    );

    expect(screen.getByText('TASK-41')).not.toBeNull();
    expect(screen.queryByLabelText('Edit Ticket for record rec_unique')).toBeNull();
    fireEvent.click(screen.getByLabelText('Configure Ticket Unique ID'));
    expect(onConfigure).toHaveBeenCalledWith(expect.objectContaining({ id: 'prop_ticket' }));
  });

  test('shows Place privacy configuration and only exposes external maps when explicitly enabled', () => {
    const openWindow = mock(() => null);
    window.open = openWindow as typeof window.open;
    const placeSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_place',
          key: 'place',
          name: 'Place',
          type: 'place' as const,
          externalSearch: 'disabled' as const,
          externalMap: 'explicit' as const,
        },
      ],
    };
    const onConfigure = mock(() => {});
    render(
      <DatabaseTable
        source={placeSource as never}
        result={{
          ...queryResult(),
          records: [
            {
              id: 'rec_place',
              path: 'tasks/place.md',
              revision: hash,
              values: {
                prop_title: 'Meet',
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
          ],
        }}
        onEdit={() => {}}
        onConfigurePlaceProperty={onConfigure}
      />,
    );

    expect(screen.getByText('City Hall')).toBeTruthy();
    const mapLink = screen.getByLabelText('Open Place in OpenStreetMap; shares stored coordinates');
    expect(openWindow).not.toHaveBeenCalled();
    fireEvent.click(mapLink);
    expect(openWindow).toHaveBeenCalledWith(
      'https://www.openstreetmap.org/?mlat=37.57&mlon=126.98#map=10/37.57/126.98',
      '_blank',
      'noopener,noreferrer',
    );
    fireEvent.click(screen.getByLabelText('Configure Place Place privacy'));
    expect(onConfigure).toHaveBeenCalledWith(expect.objectContaining({ id: 'prop_place' }));
  });

  test('renders typed Formula errors explicitly and keeps derived cells read-only', () => {
    const formulaSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_formula',
          key: 'formula',
          name: 'Formula',
          type: 'formula' as const,
          source: '1 / 0',
          ast: {
            language: 'synapse-formula-1' as const,
            version: 1 as const,
            resultType: 'number' as const,
            expression: {
              type: 'binary' as const,
              operator: 'divide' as const,
              left: {
                type: 'literal' as const,
                valueType: 'number' as const,
                value: 1,
              },
              right: {
                type: 'literal' as const,
                valueType: 'number' as const,
                value: 0,
              },
            },
          },
        },
      ],
    };
    render(
      <DatabaseTable
        source={formulaSource as never}
        result={
          {
            sourceId: formulaSource.id,
            snapshotRevision: hash,
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            indexFreshness: 'snapshot',
            records: [
              {
                id: 'rec_formula',
                path: 'tasks/formula.md',
                revision: hash,
                values: { prop_title: 'Formula task' },
                computedResults: {
                  prop_formula: {
                    kind: 'error',
                    problem: {
                      code: 'divide_by_zero',
                      message: 'Cannot divide by zero',
                    },
                  },
                },
              },
            ],
            aggregation: null,
          } as never
        }
        onEdit={() => {
          throw new Error('Formula cells must remain read-only');
        }}
      />,
    );

    expect(
      screen.getByRole('status', {
        name: /divide_by_zero.*Cannot divide by zero/,
      }),
    ).not.toBeNull();
    expect(screen.queryByLabelText('Edit Formula for record rec_formula')).toBeNull();
    expect(
      document
        .querySelector('[data-property-id="prop_formula"][data-computed-state]')
        ?.getAttribute('data-computed-state'),
    ).toBe('error');
    expect(
      screen
        .getByRole('img', { name: 'Formula: 1 computed error in loaded records' })
        .getAttribute('data-computed-error-codes'),
    ).toBe('divide_by_zero');
    expect(
      document
        .querySelector('[data-property-id="prop_formula"][data-computed-error-code]')
        ?.getAttribute('data-computed-error-message'),
    ).toBe('Cannot divide by zero');
  });

  test('surfaces a Rollup error beside its column and cell', () => {
    const rollupSource = {
      ...source,
      properties: [
        ...source.properties,
        {
          id: 'prop_rollup',
          key: 'rollup',
          name: 'Rollup total',
          type: 'rollup' as const,
          relationPropertyId: 'prop_relation',
          targetSourceId: 'ds_projects',
          targetPropertyId: 'prop_budget',
          function: 'sum' as const,
          targetValueType: 'number' as const,
        },
      ],
    };
    render(
      <DatabaseTable
        source={rollupSource as never}
        result={
          {
            sourceId: rollupSource.id,
            snapshotRevision: hash,
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            indexFreshness: 'snapshot',
            records: [
              {
                id: 'rec_rollup',
                path: 'tasks/rollup.md',
                revision: hash,
                values: { prop_title: 'Rollup task' },
                computedResults: {
                  prop_rollup: {
                    kind: 'error',
                    problem: {
                      code: 'missing_projection',
                      message: 'The related value is not available in this snapshot',
                    },
                  },
                },
              },
            ],
            aggregation: null,
          } as never
        }
      />,
    );

    expect(
      screen.getByRole('img', { name: 'Rollup total: 1 computed error in loaded records' }),
    ).toBeTruthy();
    const cell = document.querySelector(
      '[data-property-id="prop_rollup"][data-computed-error-code="missing_projection"]',
    );
    expect(cell?.getAttribute('data-computed-error-message')).toBe(
      'The related value is not available in this snapshot',
    );
  });

  test('formats created and last edited metadata as read-only date cells', () => {
    const temporalSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_created_time',
          key: 'created_time',
          name: 'Created time',
          type: 'created_time' as const,
        },
        {
          id: 'prop_last_edited_time',
          key: 'last_edited_time',
          name: 'Last edited time',
          type: 'last_edited_time' as const,
        },
        {
          id: 'prop_created_by',
          key: 'created_by',
          name: 'Created by',
          type: 'created_by' as const,
        },
        {
          id: 'prop_last_edited_by',
          key: 'last_edited_by',
          name: 'Last edited by',
          type: 'last_edited_by' as const,
        },
      ],
    };
    render(
      <DatabaseTable
        source={temporalSource as never}
        result={
          {
            ...queryResult(),
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            records: [
              {
                id: 'rec_temporal',
                path: 'tasks/temporal.md',
                revision: hash,
                values: {
                  prop_title: 'Temporal task',
                  prop_created_time: '2026-07-18T08:00:00.000Z',
                  prop_last_edited_time: '2026-07-20T09:30:00.000Z',
                  prop_created_by: 'agent|agent:codex',
                  prop_last_edited_by: 'filesystem|local',
                },
              },
            ],
          } as never
        }
        onEdit={() => {
          throw new Error('Metadata time cells must remain read-only');
        }}
      />,
    );

    expect(
      document.querySelector('[data-database-cell-row][data-property-id="prop_created_time"]')
        ?.textContent,
    ).toContain('2026');
    expect(
      document.querySelector('[data-database-cell-row][data-property-id="prop_last_edited_time"]')
        ?.textContent,
    ).toContain('2026');
    expect(screen.queryByLabelText('Edit Created time for record rec_temporal')).toBeNull();
    expect(screen.queryByLabelText('Edit Last edited time for record rec_temporal')).toBeNull();
    expect(
      document.querySelector('[data-database-cell-row][data-property-id="prop_created_by"]')
        ?.textContent,
    ).toContain('agent · agent:codex');
    expect(
      document.querySelector('[data-database-cell-row][data-property-id="prop_last_edited_by"]')
        ?.textContent,
    ).toContain('filesystem · local');
    expect(screen.queryByLabelText('Edit Created by for record rec_temporal')).toBeNull();
    expect(screen.queryByLabelText('Edit Last edited by for record rec_temporal')).toBeNull();
  });

  test('renders a virtual Button cell and invokes it with exact record context', () => {
    const buttonProperty = {
      id: 'prop_finish',
      key: 'finish',
      name: 'Finish',
      type: 'button' as const,
      label: 'Mark done',
      actions: [
        {
          id: 'mark_done',
          kind: 'update_record' as const,
          operations: [
            {
              op: 'set' as const,
              propertyId: 'prop_status',
              value: 'opt_done',
            },
          ],
        },
      ],
    };
    const actionableSource = {
      ...source,
      properties: [source.properties[0], source.properties[1], buttonProperty],
    };
    const onInvokeButton = mock(() => {});
    render(
      <DatabaseTable
        source={actionableSource as never}
        result={{ ...queryResult(), isComplete: true, nextCursor: null } as never}
        onEdit={() => {
          throw new Error('Button cells must remain read-only');
        }}
        onInvokeButton={onInvokeButton}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark done for record rec_first' }));
    expect(onInvokeButton).toHaveBeenCalledTimes(1);
    expect(onInvokeButton.mock.calls[0]?.[0]).toMatchObject({
      id: 'rec_first',
      revision: hash,
    });
    expect(onInvokeButton.mock.calls[0]?.[1]).toMatchObject({
      id: 'prop_finish',
      type: 'button',
    });
    expect(screen.queryByLabelText('Edit Finish for record rec_first')).toBeNull();
  });

  test('shows invalid external values explicitly and keeps the raw value available for correction', () => {
    render(
      <DatabaseTable
        source={source}
        result={
          {
            ...queryResult(),
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            records: [
              {
                id: 'rec_invalid',
                path: 'tasks/invalid.md',
                revision: hash,
                values: { prop_title: 'Externally edited' },
                invalidValues: { prop_url: 'javascript:alert(1)' },
                issues: [
                  {
                    code: 'invalid_property_value',
                    propertyId: 'prop_url',
                    propertyKey: 'url',
                    message: 'Property "url" must be an HTTP or HTTPS URL string',
                  },
                ],
              },
            ],
          } as never
        }
        onEdit={() => {}}
      />,
    );

    const cell = document.querySelector(
      '[data-property-id="prop_url"][data-invalid-preserved="true"]',
    );
    expect(cell?.getAttribute('data-invalid-preserved')).toBe('true');
    expect(cell?.textContent).toContain('javascript:alert(1)');
    expect(cell?.textContent).toContain('must be an HTTP or HTTPS URL string');
    fireEvent.click(screen.getByLabelText('Edit URL for record rec_invalid'));
    expect((screen.getByLabelText('Edit URL') as HTMLInputElement).value).toBe(
      'javascript:alert(1)',
    );
  });

  test('uses typed scalar inputs for number, URL, email, and phone properties', () => {
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={source as never}
        result={{ ...queryResult(), isComplete: true, nextCursor: null } as never}
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );

    for (const [propertyName, inputType] of [
      ['Budget', 'number'],
      ['URL', 'url'],
      ['Email', 'email'],
      ['Phone', 'tel'],
    ] as const) {
      fireEvent.click(screen.getByLabelText(`Edit ${propertyName} for record rec_first`));
      expect((screen.getByLabelText(`Edit ${propertyName}`) as HTMLInputElement).type).toBe(
        inputType,
      );
      fireEvent.keyDown(screen.getByLabelText(`Edit ${propertyName}`), { key: 'Escape' });
    }
    expect(edits).toEqual([]);
  });

  test('uses checkbox and multi-select editors for their structured values', () => {
    const checkboxProperty = {
      id: 'prop_complete',
      key: 'complete',
      name: 'Complete',
      type: 'checkbox' as const,
    };
    const tagsProperty = {
      id: 'prop_tags',
      key: 'tags',
      name: 'Tags',
      type: 'multi_select' as const,
      options: [
        { id: 'opt_bug', key: 'bug', name: 'Bug' },
        { id: 'opt_feature', key: 'feature', name: 'Feature' },
      ],
    };
    const structuredSource = {
      ...source,
      properties: [source.properties[0], checkboxProperty, tagsProperty],
    };
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={structuredSource as never}
        result={
          {
            ...queryResult(),
            isComplete: true,
            nextCursor: null,
            records: [
              {
                id: 'rec_first',
                path: 'tasks/first.md',
                revision: hash,
                values: {
                  prop_title: 'First task',
                  prop_complete: true,
                  prop_tags: ['opt_bug'],
                },
              },
            ],
          } as never
        }
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );

    fireEvent.click(screen.getByLabelText('Edit Complete for record rec_first'));
    const complete = screen.getByLabelText('Edit Complete') as HTMLButtonElement;
    expect(complete.getAttribute('role')).toBe('checkbox');
    expect(complete.getAttribute('data-state')).toBe('checked');
    fireEvent.click(complete);
    fireEvent.click(screen.getByLabelText('Save cell edit'));

    fireEvent.click(screen.getByLabelText('Edit Tags for record rec_first'));
    expect(screen.getByLabelText('Bug for Tags').getAttribute('data-state')).toBe('checked');
    fireEvent.click(screen.getByLabelText('Feature for Tags'));
    fireEvent.click(screen.getByLabelText('Save cell edit'));

    expect(edits).toEqual([false, ['opt_bug', 'opt_feature']]);
  });

  test('edits Person values across active, inactive, and agent identities', () => {
    const people = [
      {
        id: 'person_owner',
        key: 'owner',
        name: 'Owner',
        kind: 'collaborator' as const,
        subjectId: 'collaborator:owner',
        active: true,
      },
      {
        id: 'person_former',
        key: 'former',
        name: 'Former',
        kind: 'guest' as const,
        active: false,
      },
      {
        id: 'person_unused',
        key: 'unused',
        name: 'Unused Former',
        kind: 'guest' as const,
        active: false,
      },
      {
        id: 'person_codex',
        key: 'codex',
        name: 'Codex',
        kind: 'agent' as const,
        subjectId: 'agent:codex',
        active: true,
      },
    ];
    const personSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_owners',
          key: 'owners',
          name: 'Owners',
          type: 'person' as const,
          multiple: true,
        },
      ],
    };
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={personSource as never}
        people={people}
        result={
          {
            sourceId: source.id,
            snapshotRevision: hash,
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            indexFreshness: 'snapshot',
            records: [
              {
                id: 'rec_first',
                path: 'tasks/first.md',
                revision: hash,
                values: {
                  prop_title: 'First task',
                  prop_owners: ['person_former', 'person_codex'],
                },
              },
            ],
            aggregation: null,
          } as never
        }
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    expect(screen.getByText('Former (inactive), Codex (agent)')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Edit Owners for record rec_first'));
    expect(screen.getByLabelText('Former for Owners').getAttribute('data-state')).toBe('checked');
    expect(screen.queryByLabelText('Unused Former for Owners')).toBeNull();
    fireEvent.click(screen.getByLabelText('Former for Owners'));
    fireEvent.click(screen.getByLabelText('Owner for Owners'));
    fireEvent.click(screen.getByLabelText('Save cell edit'));
    expect(edits).toEqual([['person_codex', 'person_owner']]);
  });

  test('projects Text as plain multiline content and edits canonical stable references', () => {
    const textSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_notes',
          key: 'notes',
          name: 'Notes',
          type: 'text' as const,
        },
      ],
    };
    const raw = 'Owner: [@Owner](synapsenote://person/person_owner)\nSecond line';
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={textSource as never}
        people={[
          {
            id: 'person_owner',
            key: 'owner',
            name: 'Owner',
            kind: 'collaborator',
            active: true,
          },
        ]}
        relationRecords={[{ id: 'rec_alpha', sourceId: source.id, title: 'Alpha task' }]}
        result={
          {
            ...queryResult(),
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            records: [
              {
                id: 'rec_first',
                path: 'tasks/first.md',
                revision: hash,
                values: { prop_title: 'First task', prop_notes: raw },
                textProjections: {
                  prop_notes: {
                    plainText: 'Owner: @Owner\nSecond line',
                    references: [
                      {
                        kind: 'person',
                        target: 'person_owner',
                        label: '@Owner',
                        start: 7,
                        end: 62,
                      },
                    ],
                  },
                },
              },
            ],
          } as never
        }
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );

    const cell = document.querySelector(
      '[data-property-id="prop_notes"][data-database-cell-row="0"]',
    );
    expect(cell?.textContent).toContain('Owner: @Owner\nSecond line');
    expect(cell?.textContent).not.toContain('synapsenote://');

    fireEvent.click(screen.getByLabelText('Edit Notes for record rec_first'));
    const textarea = screen.getByLabelText('Edit Notes') as HTMLTextAreaElement;
    expect(textarea.value).toBe(raw);
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fireEvent.change(screen.getByLabelText('Insert record reference in Notes'), {
      target: { value: 'rec_alpha' },
    });
    expect(textarea.value).toEndWith('[Alpha task](synapsenote://record/rec_alpha)');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(edits).toEqual([]);
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(edits).toEqual([`${raw}[Alpha task](synapsenote://record/rec_alpha)`]);
  });

  test('edits ordered Files captions and URLs while surfacing missing local assets', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('missing.pdf')
        ? Response.json(
            {
              type: 'urn:ok:error:asset-not-found',
              title: 'Asset not found.',
              status: 404,
            },
            { status: 404 },
          )
        : new Response(new Uint8Array([0]), { status: 206 });
    }) as typeof fetch;
    const filesSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_assets',
          key: 'assets',
          name: 'Assets',
          type: 'files' as const,
        },
      ],
    };
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={filesSource as never}
        result={
          {
            sourceId: source.id,
            snapshotRevision: hash,
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            indexFreshness: 'snapshot',
            fileStates: { 'assets/missing.pdf': 'missing' },
            records: [
              {
                id: 'rec_first',
                path: 'tasks/first.md',
                revision: hash,
                values: {
                  prop_title: 'First task',
                  prop_assets: [
                    {
                      kind: 'local',
                      path: 'assets/missing.pdf',
                      caption: 'Old caption',
                    },
                    {
                      kind: 'external',
                      url: 'https://cdn.example.com/demo.mp4',
                      name: 'Demo',
                    },
                  ],
                },
              },
            ],
            aggregation: null,
          } as never
        }
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    expect(screen.getByText('missing.pdf (missing) — Old caption, Demo')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Edit Assets for record rec_first'));
    await waitFor(() => expect(screen.getByText('Missing local file')).not.toBeNull());
    fireEvent.change(screen.getByLabelText('Caption for assets/missing.pdf'), {
      target: { value: 'Updated caption' },
    });
    fireEvent.change(screen.getByLabelText('External URL for Assets'), {
      target: { value: 'https://cdn.example.com/poster.png' },
    });
    fireEvent.click(screen.getByText('Add URL'));
    fireEvent.click(screen.getByLabelText('Move poster.png up'));
    fireEvent.click(screen.getByLabelText('Save cell edit'));
    expect(edits).toEqual([
      [
        {
          kind: 'local',
          path: 'assets/missing.pdf',
          caption: 'Updated caption',
        },
        { kind: 'external', url: 'https://cdn.example.com/poster.png' },
        {
          kind: 'external',
          url: 'https://cdn.example.com/demo.mp4',
          name: 'Demo',
        },
      ],
    ]);
  });

  test('searches and edits readable Relation targets while preserving unavailable IDs', async () => {
    const relationSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_projects',
          key: 'projects',
          name: 'Projects',
          type: 'relation' as const,
          targetSourceId: 'ds_projects',
          cardinality: 'many' as const,
        },
      ],
    };
    const edits: unknown[] = [];
    const searches: string[] = [];
    render(
      <DatabaseTable
        source={relationSource as never}
        result={
          {
            sourceId: source.id,
            snapshotRevision: hash,
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            indexFreshness: 'snapshot',
            relationRecords: [
              {
                id: 'rec_alpha',
                sourceId: 'ds_projects',
                title: 'Alpha project',
              },
            ],
            records: [
              {
                id: 'rec_first',
                path: 'tasks/first.md',
                revision: hash,
                values: {
                  prop_title: 'First task',
                  prop_projects: ['rec_alpha', 'rec_denied'],
                },
              },
            ],
            aggregation: null,
          } as never
        }
        onRelationSearch={async (_property, query) => {
          searches.push(query);
          return [
            {
              id: 'rec_alpha',
              sourceId: 'ds_projects',
              title: 'Alpha project',
            },
            { id: 'rec_beta', sourceId: 'ds_projects', title: 'Beta project' },
          ];
        }}
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    expect(screen.getByText('Alpha project, rec_denied (unavailable)')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Edit Projects for record rec_first'));
    await waitFor(() => expect(screen.getByLabelText('Beta project for Projects')).not.toBeNull());
    expect(searches).toEqual(['']);
    fireEvent.click(screen.getByLabelText('Unavailable related record rec_denied'));
    fireEvent.click(screen.getByLabelText('Beta project for Projects'));
    fireEvent.click(screen.getByLabelText('Save cell edit'));
    expect(edits).toEqual([['rec_alpha', 'rec_beta']]);
  });

  test('edits Status values in deterministic workflow-group order', async () => {
    const statusSource = {
      ...source,
      properties: [
        source.properties[0],
        {
          id: 'prop_workflow',
          key: 'workflow',
          name: 'Workflow',
          type: 'status',
          groups: [
            { id: 'stg_todo', key: 'todo', name: 'To-do', category: 'todo' },
            {
              id: 'stg_doing',
              key: 'in_progress',
              name: 'In progress',
              category: 'in_progress',
            },
            {
              id: 'stg_complete',
              key: 'complete',
              name: 'Complete',
              category: 'complete',
            },
          ],
          options: [
            {
              id: 'opt_not_started',
              key: 'not_started',
              name: 'Not started',
              groupId: 'stg_todo',
            },
            {
              id: 'opt_doing',
              key: 'doing',
              name: 'Doing',
              groupId: 'stg_doing',
            },
            {
              id: 'opt_done',
              key: 'done',
              name: 'Done',
              groupId: 'stg_complete',
            },
          ],
        },
      ],
    };
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={statusSource as never}
        result={
          {
            sourceId: source.id,
            snapshotRevision: hash,
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            indexFreshness: 'snapshot',
            records: [
              {
                id: 'rec_first',
                path: 'tasks/first.md',
                revision: hash,
                values: {
                  prop_title: 'First task',
                  prop_workflow: 'opt_doing',
                },
              },
            ],
            aggregation: null,
          } as never
        }
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    expect(screen.getByText('Doing')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Edit Workflow for record rec_first'));
    const trigger = screen.getByLabelText('Edit Workflow');
    fireEvent.click(trigger);
    expect(await screen.findByText('To-do · Not started')).not.toBeNull();
    expect(screen.getAllByText('In progress · Doing').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Complete · Done'));
    fireEvent.click(screen.getByLabelText('Save cell edit'));
    expect(edits).toEqual(['opt_done']);
  });

  test('edits date time, range, timezone, and reminder as one canonical value', () => {
    const dateSource = {
      ...source,
      properties: [
        source.properties[0],
        { id: 'prop_due', key: 'due', name: 'Due', type: 'date' as const },
      ],
    };
    const edits: unknown[] = [];
    render(
      <DatabaseTable
        source={dateSource as never}
        result={
          {
            sourceId: source.id,
            snapshotRevision: hash,
            matched: 1,
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            indexFreshness: 'snapshot',
            records: [
              {
                id: 'rec_first',
                path: 'tasks/first.md',
                revision: hash,
                values: {
                  prop_title: 'First task',
                  prop_due: {
                    start: '2026-07-20',
                    timeZone: 'Asia/Seoul',
                    reminder: { anchor: 'start', minutesBefore: 30 },
                  },
                },
              },
            ],
            aggregation: null,
          } as never
        }
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    expect(screen.getByText(/30m before start/)).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Edit Due for record rec_first'));
    fireEvent.click(screen.getByLabelText('Include time for Due'));
    fireEvent.change(screen.getByLabelText('Start Due'), {
      target: { value: '2026-07-21T09:00:00' },
    });
    fireEvent.click(screen.getByLabelText('Include end for Due'));
    fireEvent.change(screen.getByLabelText('End Due'), {
      target: { value: '2026-07-22T10:00:00' },
    });
    fireEvent.change(screen.getByLabelText('Reminder minutes for Due'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByLabelText('Save cell edit'));
    expect(edits).toEqual([
      {
        start: '2026-07-21T00:00:00.000Z',
        end: '2026-07-22T01:00:00.000Z',
        timeZone: 'Asia/Seoul',
        reminder: { anchor: 'start', minutesBefore: 45 },
      },
    ]);
  });

  test('supports cell keyboard navigation, canonical copy, and typed TSV paste', () => {
    const pasted: Array<{ property: { id: string }; value: unknown }> = [];
    const view = render(
      <DatabaseTable
        source={source}
        result={queryResult()}
        onEdit={() => {}}
        onPaste={(changes) => pasted.push(...changes)}
      />,
    );
    const titleCell = view.container.querySelector<HTMLElement>(
      '[data-record-id="rec_first"] [data-property-id="prop_title"]',
    );
    const budgetCell = view.container.querySelector<HTMLElement>(
      '[data-record-id="rec_first"] [data-property-id="prop_budget"]',
    );
    if (!titleCell || !budgetCell) throw new Error('expected database cells');

    expect(
      screen.getByRole('grid', { name: 'Tasks database records' }).getAttribute('aria-colcount'),
    ).toBe('8');
    expect(titleCell.getAttribute('role')).toBe('gridcell');
    expect(titleCell.getAttribute('tabindex')).toBe('0');
    expect(budgetCell.getAttribute('tabindex')).toBe('-1');

    act(() => titleCell.focus());
    fireEvent.keyDown(titleCell, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(budgetCell);
    expect(titleCell.getAttribute('tabindex')).toBe('-1');
    expect(budgetCell.getAttribute('tabindex')).toBe('0');

    let copied = '';
    fireEvent.copy(titleCell, {
      clipboardData: {
        setData: (_type: string, value: string) => (copied = value),
      },
    });
    expect(copied).toBe('First task');

    fireEvent.paste(budgetCell, {
      clipboardData: { getData: () => '42.5' },
    });
    expect(pasted).toHaveLength(1);
    expect(pasted[0]).toMatchObject({
      property: { id: 'prop_budget' },
      value: 42.5,
    });
  });

  test('opens the canonical record from a title cell while keeping title editing explicit', () => {
    const onOpen = mock(() => {});
    render(
      <DatabaseTable source={source} result={queryResult()} onOpen={onOpen} onEdit={() => {}} />,
    );
    const titleLink = document.querySelector<HTMLButtonElement>(
      '[data-record-title-link="rec_first"]',
    );
    expect(titleLink?.textContent).toBe('First task');
    expect(screen.getByLabelText('Edit Title for record rec_first')).toBeTruthy();
    if (!titleLink) throw new Error('canonical title link is missing');
    fireEvent.click(titleLink);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_first' }));
  });

  test('offers a row-level agent scope with the canonical record ID', () => {
    const onOpenAgentScope = mock(() => {});
    render(
      <DatabaseTable
        databaseId={database.id}
        viewId="view_table"
        source={source}
        result={queryResult()}
        onOpenAgentScope={onOpenAgentScope}
      />,
    );

    fireEvent.click(screen.getByLabelText('Ask agent about record rec_first'));
    expect(onOpenAgentScope).toHaveBeenCalledWith({
      databaseId: database.id,
      sourceId: source.id,
      viewId: 'view_table',
      recordId: 'rec_first',
    });
  });

  test('returns focus to the edited cell after commit and Escape cancellation', async () => {
    const edits: unknown[] = [];
    const view = render(
      <DatabaseTable
        source={source}
        result={queryResult()}
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    const titleCell = view.container.querySelector<HTMLElement>(
      '[data-record-id="rec_first"] [data-property-id="prop_title"]',
    );
    if (!titleCell) throw new Error('expected title cell');

    fireEvent.click(screen.getByLabelText('Edit Title for record rec_first'));
    const input = screen.getByRole('textbox', { name: 'Edit Title' });
    fireEvent.change(input, { target: { value: 'Committed task' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-property-id')).toBe('prop_title'),
    );
    expect(edits).toEqual(['Committed task']);

    fireEvent.click(screen.getByLabelText('Edit Title for record rec_first'));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit Title' }), { key: 'Escape' });
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-property-id')).toBe('prop_title'),
    );
  });

  test('preserves Unicode text and does not commit Enter during IME composition', () => {
    const edits: unknown[] = [];
    const unicode = '긴 CJK 레이블 👩🏽‍💻 e\u0301 العربية';
    const result = queryResult();
    result.records[0].values.prop_title = unicode;
    const view = render(
      <DatabaseTable
        source={source}
        result={result}
        onEdit={(_record, _property, value) => edits.push(value)}
      />,
    );
    const titleCell = view.container.querySelector<HTMLElement>(
      '[data-record-id="rec_first"] [data-property-id="prop_title"]',
    );
    expect(titleCell?.getAttribute('dir')).toBe('auto');
    expect(titleCell?.textContent).toContain(unicode);
    if (!titleCell) throw new Error('expected title cell');
    fireEvent.click(screen.getByLabelText('Edit Title for record rec_first'));
    const input = screen.getByRole('textbox', { name: 'Edit Title' });
    expect(input.getAttribute('dir')).toBe('auto');
    fireEvent.change(input, { target: { value: `${unicode} 中` } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(edits).toHaveLength(0);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false });
    expect(edits).toEqual([`${unicode} 中`]);
  });

  test('selects rectangular cell ranges and reuses canonical TSV for menu copy and drag/drop', async () => {
    const clipboardWrite = mock(async () => {});
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    const result = queryResult();
    result.records.push({
      ...result.records[0],
      id: 'rec_second',
      path: 'tasks/second.md',
      values: {
        ...result.records[0].values,
        prop_title: 'Second task',
        prop_budget: 9,
      },
    });
    result.returned = 2;
    result.isComplete = true;
    result.nextCursor = null;
    result.truncatedBy = null;
    const pasted: Array<{
      record: { id: string };
      property: { id: string };
      value: unknown;
    }> = [];
    const opened: string[] = [];
    const view = render(
      <DatabaseTable
        source={source}
        result={result}
        onEdit={() => {}}
        onOpen={(record) => opened.push(record.id)}
        onPaste={(changes) => pasted.push(...changes)}
      />,
    );
    const firstTitle = view.container.querySelector<HTMLElement>(
      '[data-record-id="rec_first"] [data-property-id="prop_title"]',
    );
    const firstBudget = view.container.querySelector<HTMLElement>(
      '[data-record-id="rec_first"] [data-property-id="prop_budget"]',
    );
    const secondBudget = view.container.querySelector<HTMLElement>(
      '[data-record-id="rec_second"] [data-property-id="prop_budget"]',
    );
    if (!firstTitle || !firstBudget || !secondBudget) throw new Error('expected range cells');

    act(() => firstTitle.focus());
    fireEvent.keyDown(firstTitle, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(firstBudget, { key: 'ArrowDown', shiftKey: true });
    expect(view.container.querySelectorAll('[data-database-cell-selected="true"]')).toHaveLength(4);

    let dragged = '';
    const transfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (_type: string, value: string) => {
        dragged = value;
      },
      getData: () => dragged,
    };
    fireEvent.dragStart(secondBudget, { dataTransfer: transfer });
    expect(dragged).toBe('First task\t1234.5\nSecond task\t9');
    fireEvent.dragOver(firstTitle, { dataTransfer: transfer });
    fireEvent.drop(firstTitle, { dataTransfer: transfer });
    expect(pasted).toHaveLength(4);

    fireEvent.contextMenu(secondBudget, { clientX: 20, clientY: 30 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy selected cells' }));
    await waitFor(() =>
      expect(clipboardWrite).toHaveBeenCalledWith('First task\t1234.5\nSecond task\t9'),
    );

    fireEvent.contextMenu(secondBudget, { clientX: 20, clientY: 30 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open record' }));
    expect(opened).toEqual(['rec_second']);

    act(() => secondBudget.focus());
    fireEvent.keyDown(secondBudget, { key: 'F10', shiftKey: true });
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Copy selected cells' }),
    );
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit cell' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(document.activeElement).toBe(secondBudget);
  });

  test('configures persisted column layout, wrapping, row height, and full-snapshot calculations', async () => {
    const calculationChange = mock(() => {});
    const result = {
      ...queryResult(),
      aggregation: {
        matched: 2,
        groupBy: [],
        calculations: [
          {
            id: 'table_calculation_0',
            function: 'sum' as const,
            propertyId: 'prop_budget',
            value: 2469,
            unit: 'number' as const,
          },
        ],
        totalGroups: 0,
        returnedGroups: 0,
        groupsComplete: true,
        truncatedBy: null,
        groups: [],
      },
    };
    const view = render(
      <DatabaseTable
        source={source}
        result={result}
        calculations={{ prop_budget: 'sum' }}
        onCalculationChange={calculationChange}
      />,
    );

    expect(screen.getByTestId('database-calculation-row').textContent).toContain('sum: $2,469.00');
    fireEvent.click(screen.getByText('Table layout and calculations'));
    fireEvent.click(screen.getByRole('button', { name: 'Wrap cells' }));
    expect(screen.getByRole('button', { name: 'Wrap cells' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.click(screen.getByLabelText('Table row height'));
    fireEvent.click(await screen.findByRole('option', { name: 'Compact' }));
    expect(
      view.container.querySelector('[data-slot="table"]')?.getAttribute('data-row-height'),
    ).toBe('compact');

    const urlVisibility = screen.getByLabelText('Show URL column');
    fireEvent.click(urlVisibility);
    expect(
      view.container.querySelector('[data-slot="table-head"][data-property-id="prop_url"]'),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText('Width of Budget'), {
      target: { value: '320' },
    });
    expect(
      view.container.querySelector<HTMLElement>(
        '[data-slot="table-head"][data-property-id="prop_budget"]',
      )?.style.width,
    ).toBe('320px');

    fireEvent.click(screen.getByLabelText('Calculation for Budget'));
    fireEvent.click(await screen.findByRole('option', { name: 'average' }));
    expect(calculationChange).toHaveBeenCalledWith('prop_budget', 'average');
    await waitFor(() =>
      expect(localStorage.getItem(databaseTableLayoutStorageKey(source.id))).toContain('320'),
    );
  });

  test('windows large record sets and scrolls keyboard focus into the virtualized range', async () => {
    const base = queryResult().records[0];
    const records = Array.from({ length: 80 }, (_, index) => ({
      ...base,
      id: `rec_${index}`,
      path: `tasks/${index}.md`,
      values: { ...base.values, prop_title: `Task ${index}` },
    }));
    const view = render(
      <DatabaseTable
        source={source}
        result={{
          ...queryResult(),
          matched: records.length,
          returned: records.length,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          records,
        }}
      />,
    );
    expect(view.container.querySelector('[data-record-id="rec_79"]')).toBeNull();
    expect(view.container.querySelectorAll('[data-record-id]').length).toBeLessThan(40);

    const renderedRows = [...view.container.querySelectorAll<HTMLElement>('[data-record-id]')];
    const lastRendered = renderedRows.at(-1);
    const lastIndex = Number(lastRendered?.dataset.recordId?.replace('rec_', ''));
    const lastTitle = lastRendered?.querySelector<HTMLElement>('[data-property-id="prop_title"]');
    if (!lastTitle || !Number.isFinite(lastIndex)) throw new Error('expected virtual window edge');
    act(() => lastTitle.focus());
    fireEvent.keyDown(lastTitle, { key: 'ArrowDown' });
    await waitFor(() =>
      expect(
        view.container.querySelector(
          `[data-record-id="rec_${lastIndex + 1}"] [data-property-id="prop_title"]`,
        ),
      ).toBe(document.activeElement),
    );

    const container = view.container.querySelector<HTMLElement>('[data-slot="table-container"]');
    if (!container) throw new Error('expected virtualized table container');
    Object.defineProperty(container, 'clientHeight', {
      configurable: true,
      value: 300,
    });
    fireEvent.scroll(container, { target: { scrollTop: 4_000 } });
    await waitFor(() =>
      expect(view.container.querySelector('[data-record-id="rec_79"]')).toBeTruthy(),
    );
    expect(view.container.querySelectorAll('[data-record-id]').length).toBeLessThan(40);
  });

  test('requests calculations from the full server snapshot instead of the loaded page', async () => {
    const queryBodies: Array<{
      query?: {
        aggregate?: {
          calculations?: Array<{ function: string; propertyId: string }>;
        };
      };
    }> = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        const body = JSON.parse(String(init?.body)) as (typeof queryBodies)[number];
        queryBodies.push(body);
        const calculation = body.query?.aggregate?.calculations?.[0];
        return Response.json({
          ...queryResult(),
          aggregation: calculation
            ? {
                matched: 2,
                groupBy: [],
                calculations: [
                  {
                    id: 'table_calculation_0',
                    function: calculation.function,
                    propertyId: calculation.propertyId,
                    value: 2469,
                    unit: 'number',
                  },
                ],
                totalGroups: 0,
                returnedGroups: 0,
                groupsComplete: true,
                truncatedBy: null,
                groups: [],
              }
            : null,
        });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    render(<DatabaseTableDialog open onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByText('Table layout and calculations'));
    fireEvent.click(screen.getByLabelText('Calculation for Budget'));
    fireEvent.click(await screen.findByRole('option', { name: 'sum' }));

    await waitFor(() =>
      expect(
        queryBodies.some(
          (body) => body.query?.aggregate?.calculations?.[0]?.propertyId === 'prop_budget',
        ),
      ).toBe(true),
    );
    expect((await screen.findByTestId('database-calculation-row')).textContent).toContain(
      'sum: $2,469.00',
    );
  });

  test('exports canonical CSV/JSON snapshots and rejects formatted-number imports before planning', async () => {
    const createdUrls: Blob[] = [];
    const downloaded: Array<{ name: string; href: string }> = [];
    URL.createObjectURL = mock((blob: Blob) => {
      createdUrls.push(blob);
      return 'blob:database-csv';
    });
    URL.revokeObjectURL = mock(() => {});
    HTMLAnchorElement.prototype.click = mock(function (this: HTMLAnchorElement) {
      downloaded.push({ name: this.download, href: this.href });
    });
    let draftCalls = 0;
    let recordLookupCalls = 0;
    let importedMutations: unknown[] = [];
    const queryLimits: number[] = [];
    const exportArchiveScopes: boolean[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: { recordMutations?: unknown[] };
            query?: { includeArchived?: boolean; page?: { limit?: number } };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        queryLimits.push(body.query?.page?.limit ?? 0);
        if (body.query?.page?.limit === 500) {
          exportArchiveScopes.push(body.query.includeArchived === true);
        }
        return Response.json({
          ...queryResult(),
          matched: body.query?.page?.limit === 500 ? 1 : queryResult().matched,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
        });
      }
      if (path === '/api/databases/record') {
        recordLookupCalls += 1;
        return Response.json({
          databaseId: database.id,
          sourceId: source.id,
          manifestRevision: hash,
          indexRevision: hash,
          record: queryResult().records[0],
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        draftCalls += 1;
        importedMutations = body.desiredState?.recordMutations ?? [];
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_import', revision: hash },
        });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    const openContextInspector = mock((scope: unknown) => scope);
    const openAgentRuns = mock(() => {});
    render(
      <DatabaseTableDialog
        open
        onOpenChange={() => {}}
        onOpenContextInspector={openContextInspector}
        onOpenAgentRuns={openAgentRuns}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Export current CSV' })).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'More database actions' }));
    expect(screen.getByRole('menuitem', { name: 'History' })).not.toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'History' }));
    expect(openAgentRuns).toHaveBeenCalledTimes(1);
    await user.click(await screen.findByRole('button', { name: 'More database actions' }));
    expect(screen.getByRole('menuitem', { name: 'Inspect agent context' })).not.toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Inspect agent context' }));
    expect(openContextInspector).toHaveBeenCalledTimes(1);
    expect(openContextInspector).toHaveBeenCalledWith({
      databaseId: database.id,
      sourceId: source.id,
    });
    await user.click(screen.getByRole('checkbox', { name: 'Select record rec_first' }));
    await user.click(await screen.findByRole('button', { name: 'More database actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Inspect selected context' }));
    expect(openContextInspector).toHaveBeenCalledWith({
      databaseId: database.id,
      sourceId: source.id,
      recordIds: ['rec_first'],
    });
    await user.click(await screen.findByRole('button', { name: 'More database actions' }));
    expect(screen.getByRole('menuitem', { name: 'Templates' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Automations' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Share' })).not.toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Manage views' })).not.toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'Export current CSV' }));
    await waitFor(() => expect(createdUrls).toHaveLength(1));
    await user.click(await screen.findByRole('button', { name: 'More database actions' }));
    const exportAll = screen.getByRole<HTMLElement>('menuitem', {
      name: 'Export all CSV',
    });
    await waitFor(() => expect(exportAll.getAttribute('data-disabled')).toBeNull());
    await user.click(exportAll);
    await waitFor(() => expect(createdUrls).toHaveLength(2));
    await user.click(await screen.findByRole('button', { name: 'More database actions' }));
    const exportJson = screen.getByRole<HTMLElement>('menuitem', {
      name: 'Export JSON',
    });
    await waitFor(() => expect(exportJson.getAttribute('data-disabled')).toBeNull());
    await user.click(exportJson);
    await waitFor(() => expect(createdUrls).toHaveLength(3));
    expect(queryLimits).toContain(500);
    expect(exportArchiveScopes).toEqual([false, true, true]);
    expect(downloaded).toEqual([
      { name: 'tasks-current.csv', href: 'blob:database-csv' },
      { name: 'tasks-all.csv', href: 'blob:database-csv' },
      { name: 'tasks-all.json', href: 'blob:database-csv' },
    ]);
    expect(await createdUrls[0]?.text()).toContain(
      'rec_first,First task,active,https://example.com/task,owner@example.com',
    );
    expect(await createdUrls[0]?.text()).toContain('1234.5');
    expect(await createdUrls[0]?.text()).not.toContain('$1,234.50');
    expect(JSON.parse((await createdUrls[2]?.text()) ?? '')).toMatchObject({
      schema: 'synapsenote.database-export',
      version: 1,
      scope: 'all',
      database: { id: database.id },
      source: { id: source.id },
      revisions: { manifest: hash, schema: hash, index: hash, snapshot: hash },
      result: { complete: true, matched: 1, returned: 1 },
      records: [{ id: 'rec_first', values: { prop_status: 'opt_active' } }],
    });

    const csvInput = screen.getByLabelText('Import database CSV or TSV file');
    const invalidContents = 'record_id,budget\r\nrec_first,"$1,234.50"';
    const invalidFile = {
      name: 'invalid.csv',
      arrayBuffer: async () => new TextEncoder().encode(invalidContents).buffer,
    } as File;
    fireEvent.change(csvInput, { target: { files: [invalidFile] } });
    expect(await screen.findByText(/finite number/i)).toBeTruthy();
    expect(draftCalls).toBe(0);

    const validContents = 'record_id\tbudget\r\nrec_first\t999.25';
    const validFile = {
      name: 'valid.tsv',
      arrayBuffer: async () => new TextEncoder().encode(validContents).buffer,
    } as File;
    fireEvent.change(csvInput, { target: { files: [validFile] } });
    expect(await screen.findByText('valid.tsv')).toBeTruthy();
    expect(screen.getByText('tab')).toBeTruthy();
    const planImport = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Plan import',
    });
    await waitFor(() => expect(planImport.disabled).toBe(false));
    fireEvent.click(planImport);
    await waitFor(() => expect(draftCalls).toBe(1));
    expect(recordLookupCalls).toBe(1);
    expect(importedMutations).toEqual([
      expect.objectContaining({
        id: 'rec_first',
        operations: [{ op: 'set', propertyKey: 'budget', value: 999.25 }],
      }),
    ]);
  });

  test('previews Select option rename, blocks unsafe delete, and drafts an exact merge', async () => {
    let draftedDesiredState: {
      sources?: Array<{
        properties?: Array<{ id?: string; options?: Array<{ id?: string }> }>;
      }>;
      recordMutations?: unknown[];
    } | null = null;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: NonNullable<typeof draftedDesiredState>;
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        return Response.json({
          ...queryResult(),
          matched: 1,
          returned: 1,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        draftedDesiredState = body.desiredState ?? null;
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_option', revision: hash },
        });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    render(<DatabaseTableDialog open onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByText('Manage Select options'));
    fireEvent.change(screen.getByLabelText('Select option name'), {
      target: { value: 'In progress' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Preview rename' }));
    const renamePreview = await screen.findByLabelText('Select option impact preview');
    expect(renamePreview.textContent).toContain('ready');
    expect(renamePreview.textContent).toContain('0 records');
    fireEvent.click(screen.getByRole('button', { name: 'Discard preview' }));

    fireEvent.click(screen.getByRole('button', { name: 'Preview delete' }));
    const deletePreview = await screen.findByLabelText('Select option impact preview');
    expect(deletePreview.textContent).toContain('blocked');
    expect(deletePreview.textContent).toContain('used by 1 record');
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Plan exact option change',
      }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Discard preview' }));

    fireEvent.click(screen.getByRole('button', { name: 'Preview merge' }));
    const mergePreview = await screen.findByLabelText('Select option impact preview');
    expect(mergePreview.textContent).toContain('ready');
    expect(mergePreview.textContent).toContain('1 records');
    fireEvent.click(screen.getByRole('button', { name: 'Plan exact option change' }));
    await waitFor(() => expect(draftedDesiredState).not.toBeNull());
    expect(draftedDesiredState?.recordMutations).toEqual([
      {
        id: 'rec_first',
        expectedRevision: hash,
        sourceKey: 'tasks',
        operations: [{ op: 'set', propertyKey: 'status', value: 'opt_done' }],
      },
    ]);
    const status = draftedDesiredState?.sources?.[0]?.properties?.find(
      (property) => property.id === 'prop_status',
    );
    expect(status?.options?.map((option) => option.id)).toEqual(['opt_done', 'opt_old']);
  });

  test('renders stable-ID columns and refreshes the selected snapshot on database changes', async () => {
    let queryCalls = 0;
    const openedRecords: string[] = [];
    const contextScopes: unknown[] = [];
    const clipboardWrite = mock(async () => {});
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        queryCalls += 1;
        const body = JSON.parse(String(init?.body)) as {
          query?: { page?: { cursor?: string } };
        };
        if (body.query?.page?.cursor === 'cursor_more') {
          return Response.json({
            ...queryResult(),
            returned: 1,
            isComplete: true,
            nextCursor: null,
            truncatedBy: null,
            records: [
              {
                id: 'rec_second',
                path: 'tasks/second.md',
                revision: hash,
                values: {
                  prop_title: 'Second task',
                  prop_status: 'opt_active',
                },
              },
            ],
          });
        }
        return Response.json(queryResult());
      }
      return Response.json({ detail: 'unexpected request' }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseTableDialog
        open={true}
        onOpenChange={() => {}}
        onOpenRecord={(path) => openedRecords.push(path)}
        onOpenContextInspector={(scope) => contextScopes.push(scope)}
      />,
    );
    expect(await screen.findByText('First task')).not.toBeNull();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Open URL for record rec_first').getAttribute('href')).toBe(
      'https://example.com/task',
    );
    expect(screen.getByLabelText('Open Email for record rec_first').getAttribute('href')).toBe(
      'mailto:owner@example.com',
    );
    expect(screen.getByLabelText('Open Phone for record rec_first').getAttribute('href')).toBe(
      'tel:+82212345678',
    );
    expect(screen.getByLabelText('Copy URL for record rec_first')).not.toBeNull();
    expect(screen.getByLabelText('Copy Email for record rec_first')).not.toBeNull();
    expect(screen.getByLabelText('Copy Phone for record rec_first')).not.toBeNull();
    expect(
      screen.getByText(
        new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: 'USD',
          useGrouping: true,
          minimumFractionDigits: 2,
        }).format(1234.5),
      ),
    ).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Copy URL for record rec_first'));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith('https://example.com/task'));
    expect(screen.getByText(/not all matching records are shown/)).not.toBeNull();
    expect(document.querySelector('[data-database-state="partial"]')).not.toBeNull();
    expect(document.querySelector('[data-record-id="rec_first"]')).not.toBeNull();
    expect(document.querySelector('[data-property-id="prop_status"]')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Open record rec_first'));
    expect(openedRecords).toEqual(['tasks/first.md']);
    fireEvent.click(screen.getByLabelText('Inspect context for record rec_first'));
    expect(contextScopes).toEqual([
      {
        databaseId: database.id,
        sourceId: source.id,
        recordId: 'rec_first',
      },
    ]);

    fireEvent.click(screen.getByText('Load more records'));
    expect(await screen.findByText('Second task')).not.toBeNull();
    expect(screen.queryByText('Load more records')).toBeNull();

    act(() => {
      emitDatabaseChanged({
        v: CC1_CONTRACT_VERSION,
        ch: CC1_CHANNEL_DATABASE_CHANGED,
        seq: 1,
        scope: 'records',
        reasons: ['record-update'],
        databaseIds: ['db_tasks'],
        sourceIds: ['ds_tasks'],
        recordIds: ['rec_first'],
        affectedIdsComplete: true,
        index: {
          state: 'idle',
          revision: hash,
          manifestRevision: hash,
          recordCount: 1,
          issueCount: 0,
          progress: null,
        },
      });
    });
    await waitFor(() => expect(queryCalls).toBe(3));
  });

  test('shows explicit loading and empty catalog states', async () => {
    let resolveCatalog: ((response: Response) => void) | undefined;
    globalThis.fetch = mock(
      () =>
        new Promise<Response>((resolve) => {
          resolveCatalog = resolve;
        }),
    ) as typeof fetch;
    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    expect(await screen.findByText('Loading databases')).not.toBeNull();
    expect(document.querySelector('[data-database-state="loading"]')).not.toBeNull();
    await act(async () => resolveCatalog?.(Response.json({ ...catalog(), candidates: [] })));
    expect(await screen.findByText('No databases yet.')).not.toBeNull();
    expect(document.querySelector('[data-database-state="empty"]')).not.toBeNull();
  });

  test('keeps page chrome mounted while a full-page database target is loading', async () => {
    globalThis.fetch = mock(() => new Promise<Response>(() => {})) as typeof fetch;
    render(
      <DatabaseTableDialog
        open
        presentation="page"
        initialTarget={{ databaseId: 'db_tasks', sourceId: 'ds_tasks' }}
        onOpenChange={() => {}}
      />,
    );

    expect(await screen.findByText('Loading databases')).not.toBeNull();
    expect(document.querySelector('[data-database-page-chrome]')).not.toBeNull();
    expect(document.querySelector('[data-database-state="loading"]')).not.toBeNull();
  });

  test('renders a missing full-page target with a back action instead of a generic retry', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json(
          { code: 'source_not_found', detail: 'The requested database source is gone.' },
          { status: 404 },
        );
      }
      if (path === '/api/databases/query') {
        return Response.json(
          { code: 'source_not_found', detail: 'The requested database source is gone.' },
          { status: 404 },
        );
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    const onOpenChange = mock(() => {});
    render(
      <DatabaseTableDialog
        open
        presentation="page"
        initialTarget={{ databaseId: 'db_missing', sourceId: 'ds_missing' }}
        onOpenChange={onOpenChange}
      />,
    );

    expect(await screen.findByText('Database page is unavailable')).not.toBeNull();
    expect(document.querySelector('[data-database-state="missing"]')).not.toBeNull();
    const back = screen.getByRole('button', { name: 'Back to databases' });
    expect(back).not.toBeNull();
    fireEvent.click(back);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('renders a permission-denied full-page target without offering an unsafe retry', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe' || path === '/api/databases/query') {
        return Response.json(
          {
            code: 'permission_denied',
            detail: 'This database is restricted to the project team.',
            recovery: { action: 'request_access' },
          },
          { status: 403 },
        );
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <DatabaseTableDialog
        open
        presentation="page"
        initialTarget={{ databaseId: 'db_private', sourceId: 'ds_private' }}
        onOpenChange={() => {}}
      />,
    );

    expect(await screen.findByText('Permission required')).not.toBeNull();
    expect(document.querySelector('[data-database-state="permission"]')).not.toBeNull();
    expect(
      screen.getByText('Request access or use fields available to your current policy.'),
    ).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to databases' })).toBeNull();
  });

  test('renders the database workspace as a route-level page without a modal overlay', async () => {
    let renameDesiredState: Record<string, unknown> | null = null;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') return Response.json(queryResult());
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        renameDesiredState = body.desiredState as Record<string, unknown>;
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_rename_database', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_rename_database',
            hash,
            draftId: 'draft_rename_database',
            draftRevision: hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: true,
            conflicts: [],
            approvals: [],
            risk: { level: 'low', reasons: [] },
            diff: { manifests: [], records: [], templates: [], policy: {} },
          },
        });
      }
      if (path === '/api/databases/commit') {
        return Response.json({
          mutationId: 'mut_rename_database',
          planId: 'plan_rename_database',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [],
          verification: { status: 'passed' },
          undoToken: 'undo_rename_database',
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    const onOpenChange = mock(() => {});
    render(
      <DatabaseTableDialog
        open
        presentation="page"
        initialTarget={{ databaseId: database.id, sourceId: source.id }}
        onOpenChange={onOpenChange}
      />,
    );
    await screen.findByRole('grid');
    const workspace = document.querySelector('[data-database-page-workspace]');
    expect(workspace).not.toBeNull();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    expect(document.querySelector('nav[aria-label="Databases"]')).not.toBeNull();
    expect(document.querySelector('[data-database-page-chrome]')?.textContent).toContain('Tasks');
    expect(screen.getByTestId('database-page-title').textContent).toBe('Tasks');
    expect(screen.getByTestId('database-page-icon')).not.toBeNull();
    const pageBody = workspace?.querySelector('[data-slot="dialog-body"]');
    expect(pageBody?.className).toContain('overflow-x-hidden');
    expect(pageBody?.className).toContain('overflow-y-auto');
    const tableScroll = screen.getByRole('grid').closest('[data-slot="table-container"]');
    expect(tableScroll?.className).toContain('overflow-auto');
    const viewTabs = screen.getByRole('navigation', { name: 'Database views' });
    expect(viewTabs.className).toContain('overflow-x-auto');
    expect(
      document.querySelector('[data-database-page-chrome]')?.firstElementChild?.className,
    ).toContain('flex-wrap');
    const favorite = screen.getByTestId('database-page-favorite');
    expect(favorite.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(favorite);
    expect(favorite.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(favorite);
    expect(favorite.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByTestId('database-page-title-value'));
    const titleInput = await screen.findByTestId('database-page-title-input');
    fireEvent.change(titleInput, { target: { value: 'Roadmap' } });
    fireEvent.keyDown(titleInput, { key: 'Enter' });
    await waitFor(() =>
      expect(renameDesiredState?.database).toMatchObject({ id: database.id, name: 'Roadmap' }),
    );
    expect(screen.queryByTestId('database-page-title-input')).toBeNull();
    fireEvent.click(screen.getByTestId('database-page-customize'));
    expect(await screen.findByRole('heading', { name: 'Customize database page' })).not.toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Database page icon' }), {
      target: { value: '🗂️' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Database page cover' }), {
      target: { value: 'assets/database-cover.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save appearance' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Commit change' }));
    await waitFor(() =>
      expect(renameDesiredState?.database).toMatchObject({
        id: database.id,
        icon: '🗂️',
        cover: 'assets/database-cover.png',
      }),
    );
    fireEvent.click(screen.getByTestId('database-page-back'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('renders the canonical database workspace in the caller canvas without a portal', async () => {
    let catalogCalls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) {
        catalogCalls += 1;
        return Response.json(catalog());
      }
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') return Response.json(queryResult());
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(
      <section data-testid="database-canvas-host">
        <DatabaseWorkspacePage
          open
          initialTarget={{ databaseId: database.id, sourceId: source.id }}
          onOpenChange={() => {}}
        />
      </section>,
    );

    const grid = await screen.findByRole('grid');
    const workspace = document.querySelector('[data-database-workspace]');
    expect(grid).not.toBeNull();
    expect(workspace?.closest('[data-testid="database-canvas-host"]')).not.toBeNull();
    expect(workspace?.getAttribute('data-database-page-workspace')).toBe('');
    expect(document.querySelector('nav[aria-label="Databases"]')).toBeNull();
    expect(catalogCalls).toBe(0);
    expect(document.querySelector('[data-slot="dialog-portal"]')).toBeNull();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
  });

  test('keeps the selected saved view in the full-page route hash', async () => {
    const savedView = {
      id: 'view_active',
      key: 'active',
      name: 'Active tasks',
      sourceId: source.id,
      layout: { type: 'table' as const, configuration: {} },
      sort: [],
      groups: [],
      projection: { propertyIds: ['prop_title'], body: 'hidden' as const },
    };
    const routedDatabase = { ...database, views: [savedView] };
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json({ ...description(), database: routedDatabase });
      }
      if (path === '/api/databases/query') return Response.json(queryResult());
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    render(
      <DatabaseTableDialog
        open
        presentation="page"
        initialTarget={{ databaseId: database.id, sourceId: source.id }}
        onOpenChange={() => {}}
      />,
    );
    await screen.findByRole('grid');
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Active tasks' }));
    });
    await waitFor(() =>
      expect(window.location.hash).toBe('#database/db_tasks/ds_tasks/view_active'),
    );
  });

  test('creates a blank database directly from the empty catalog', async () => {
    let desiredState: Record<string, unknown> | null = null;
    let commitAssertions: Record<string, unknown> | null = null;
    let committed = false;
    const createdSource = { ...source, id: 'ds_new', key: 'new_database', name: 'New Database' };
    const createdDatabase = {
      ...database,
      id: 'db_new',
      key: 'new_database',
      name: 'New Database',
      sources: [createdSource],
      views: [],
    };
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path.startsWith('/api/databases/catalog')) {
        return committed
          ? Response.json({
              ...catalog(),
              candidates: [
                {
                  ...catalog().candidates[0],
                  id: createdDatabase.id,
                  key: createdDatabase.key,
                  name: createdDatabase.name,
                  sources: [
                    {
                      ...catalog().candidates[0].sources[0],
                      id: createdSource.id,
                      key: createdSource.key,
                      name: createdSource.name,
                    },
                  ],
                },
              ],
            })
          : Response.json({ ...catalog(), candidates: [] });
      }
      if (path === '/api/databases/describe') {
        return Response.json({
          ...description(),
          database: createdDatabase,
          source: createdSource,
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          ...queryResult(),
          sourceId: createdSource.id,
          matched: 0,
          returned: 0,
          records: [],
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        desiredState = body.desiredState as Record<string, unknown>;
        return Response.json({
          action: 'create_draft',
          draft: {
            id: 'draft_create_database',
            revision: hash,
            normalized: { definition: createdDatabase },
          },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_create_database',
            hash,
            draftId: 'draft_create_database',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['db_new', 'ds_new'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [],
            affectedObjects: {
              databaseIds: ['db_new'],
              sourceIds: ['ds_new'],
              propertyIds: ['prop_title'],
              viewIds: ['view_table'],
              recordIds: [],
            },
            diff: {
              mode: 'exact',
              manifests: [
                {
                  path: '.ok/databases/new_database.yml',
                  before: null,
                  after: 'version: 1\n',
                  action: 'create',
                },
              ],
              records: [],
              templates: [],
              policy: {
                mode: 'review',
                allowedOperations: [],
                maxRecordsPerCommit: 1,
              },
            },
            risk: {
              level: 'medium',
              reasons: ['Creates a canonical database'],
            },
            conflicts: [],
            approvals: [{ code: 'create_database', reason: 'Canonical creation' }],
            postconditions: [],
            committable: true,
            requiresCommit: true,
          },
        });
      }
      if (path === '/api/databases/commit') {
        committed = true;
        commitAssertions = body.assertions as Record<string, unknown>;
        return Response.json({
          mutationId: 'mut_create_database',
          planId: 'plan_create_database',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [{ operation: 'create', path: '.ok/databases/new_database.yml' }],
          verification: { status: 'passed' },
          revisions: {
            gitHead: `sha1:${'b'.repeat(40)}`,
            snapshotRevision: hash,
          },
          auditReceipt: {},
          undoToken: 'undo_create_database.secret',
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    window.history.replaceState(null, '', '#database/new');
    render(
      <DatabaseTableDialog
        open
        presentation="page"
        initialAction="create"
        onOpenChange={() => {}}
      />,
    );
    fireEvent.change(await screen.findByLabelText('Database name'), {
      target: { value: 'New Database' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create database' }));

    expect(desiredState).toMatchObject({
      database: { key: 'new_database', name: 'New Database' },
      sampleRecords: [],
    });
    await waitFor(() =>
      expect(commitAssertions).toEqual({
        databaseAbsent: true,
        createdRecords: 0,
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('database-creation-ghost-review')).toBeNull());
    expect((await screen.findByTestId('database-page-title')).textContent).toContain(
      'New Database',
    );
    expect(screen.queryByLabelText('Database name')).toBeNull();
    expect(window.location.hash).toBe('#database/db_new/ds_new');
  });

  test('shows the resulting page preview while an agent-shaped creation plan awaits approval', async () => {
    const createdDefinition = {
      id: 'db_agent_preview',
      name: 'Launch tasks',
      sources: [{ id: 'ds_launch_tasks', name: 'Launch tasks' }],
      views: [{ id: 'view_table', sourceId: 'ds_launch_tasks' }],
    };
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path.startsWith('/api/databases/catalog')) {
        return Response.json({ ...catalog(), candidates: [] });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        return Response.json({
          action: 'create_draft',
          draft: {
            id: 'draft_agent_preview',
            revision: hash,
            normalized: { definition: createdDefinition },
          },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_agent_preview',
            hash,
            snapshotRevision: hash,
            committable: true,
            requiresCommit: true,
            conflicts: [],
            approvals: [{ code: 'create_database', reason: 'Canonical creation' }],
            risk: { level: 'medium', reasons: ['Creates a canonical database'] },
            diff: {
              manifests: [],
              records: [
                {
                  recordId: 'rec_agent_preview',
                  sourceId: 'ds_launch_tasks',
                  path: 'launch_tasks/ship.md',
                  action: 'create',
                  before: null,
                  after: { values: { title: 'Ship launch' }, body: 'Launch checklist\n' },
                },
              ],
              templates: [],
              policy: {},
            },
          },
        });
      }
      if (path === '/api/databases/commit') {
        return Response.json({
          mutationId: 'mut_agent_preview',
          planId: 'plan_agent_preview',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [{ operation: 'create', path: '.ok/databases/launch_tasks.yml' }],
          verification: { status: 'passed' },
          revisions: { gitHead: `sha1:${'b'.repeat(40)}`, snapshotRevision: hash },
          auditReceipt: {},
          undoToken: 'undo_agent_preview.secret',
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    const onOpenChange = mock(() => {});
    render(
      <DatabaseTableDialog
        open
        presentation="dialog"
        initialAction="create"
        onOpenChange={onOpenChange}
      />,
    );
    await screen.findByText('No databases yet.');
    fireEvent.click(screen.getByTestId('database-create-button'));
    fireEvent.click(await screen.findByText('Template'));
    fireEvent.change(screen.getByLabelText('Database name'), {
      target: { value: 'Launch tasks' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review creation' }));

    const preview = await screen.findByTestId('database-creation-resulting-page-preview');
    expect(preview.textContent).toContain('Page preview');
    expect(preview.textContent).toContain('Plan launch');
    expect(screen.getByTestId('database-atomic-approval-scope').textContent).toContain(
      'Create database',
    );
    expect(screen.getByTestId('database-atomic-approval-scope').textContent).toContain(
      'Selective approval is unavailable',
    );
    expect(screen.getByTestId('database-creation-ghost-review')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Commit creation' }));
    await waitFor(() =>
      expect(window.location.hash).toBe('#database/db_agent_preview/ds_launch_tasks/view_table'),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test('reopens a failed creation with the typed title available for retry', async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path.startsWith('/api/databases/catalog')) {
        return Response.json({ ...catalog(), candidates: [] });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        return Response.json({ detail: 'Database draft service unavailable' }, { status: 503 });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    await screen.findByText('No databases yet.');
    fireEvent.click(screen.getByTestId('database-create-button'));
    const titleInput = await screen.findByLabelText('Database name');
    fireEvent.change(titleInput, { target: { value: 'Retry database' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create database' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Database name') as HTMLInputElement).value).toBe(
        'Retry database',
      ),
    );
  });

  test('cancels an uncommitted page creation without planning or committing an orphan', async () => {
    let planCalls = 0;
    let commitCalls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) {
        return Response.json({ ...catalog(), candidates: [] });
      }
      if (path === '/api/databases/plan') planCalls += 1;
      if (path === '/api/databases/commit') commitCalls += 1;
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    const onCreationCancelled = mock(() => {});
    render(
      <DatabaseTableDialog
        open
        presentation="page"
        initialAction="create"
        onOpenChange={() => {}}
        onCreationCancelled={onCreationCancelled}
      />,
    );
    await screen.findByText('No databases yet.');
    fireEvent.click(screen.getByTestId('database-create-button'));
    const titleInput = await screen.findByLabelText('Database name');
    fireEvent.change(titleInput, { target: { value: 'Discarded database' } });
    fireEvent.keyDown(titleInput, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByLabelText('Database name')).toBeNull());
    expect(onCreationCancelled).toHaveBeenCalledTimes(1);
    expect(planCalls).toBe(0);
    expect(commitCalls).toBe(0);

    fireEvent.click(screen.getByTestId('database-create-button'));
    expect(((await screen.findByLabelText('Database name')) as HTMLInputElement).value).toBe(
      'Discarded database',
    );
  });

  test('opens read-only folder onboarding only after the manifest creation commits', async () => {
    let previewCalls = 0;
    const createdDatabase = {
      version: 1,
      id: 'db_research',
      key: 'research',
      name: 'Research',
      contract: {
        purpose: 'Manage Research',
        canonicality: 'canonical',
        vocabulary: ['research'],
        freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
        sensitivity: 'internal',
      },
      sources: [
        {
          id: 'ds_research',
          key: 'research',
          name: 'Research',
          recordMeaning: 'One Research record',
          folder: 'research/notes',
          includeSubfolders: true,
          properties: [
            {
              id: 'prop_title',
              key: 'title',
              name: 'Title',
              type: 'title',
              required: true,
            },
          ],
        },
      ],
      views: [],
      templates: [],
    };
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      if (path.startsWith('/api/databases/catalog')) {
        return Response.json({ ...catalog(), candidates: [] });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        return Response.json({
          action: 'create_draft',
          draft: {
            id: 'draft_create_folder_database',
            revision: hash,
            normalized: { definition: createdDatabase },
          },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_create_folder_database',
            hash,
            draftId: 'draft_create_folder_database',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['db_research', 'ds_research'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [],
            affectedObjects: {
              databaseIds: ['db_research'],
              sourceIds: ['ds_research'],
              propertyIds: ['prop_title'],
              viewIds: [],
              recordIds: [],
            },
            diff: {
              mode: 'exact',
              manifests: [
                {
                  path: '.ok/databases/research.yml',
                  before: null,
                  after: 'version: 1\n',
                  action: 'create',
                },
              ],
              records: [],
              templates: [],
              policy: {
                mode: 'review',
                allowedOperations: [],
                maxRecordsPerCommit: 1,
              },
            },
            risk: {
              level: 'medium',
              reasons: ['Creates a canonical database'],
            },
            conflicts: [],
            approvals: [{ code: 'create_database', reason: 'Canonical creation' }],
            postconditions: [],
            committable: true,
            requiresCommit: true,
          },
        });
      }
      if (path === '/api/databases/commit') {
        return Response.json({
          mutationId: 'mut_create_folder_database',
          planId: 'plan_create_folder_database',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [{ operation: 'create', path: '.ok/databases/research.yml' }],
          verification: { status: 'passed' },
          revisions: {
            gitHead: `sha1:${'b'.repeat(40)}`,
            snapshotRevision: hash,
          },
          auditReceipt: {},
          undoToken: 'undo_create_folder_database.secret',
        });
      }
      if (path === '/api/databases/task' && body.action === 'preview_import') {
        previewCalls += 1;
        return Response.json({
          action: 'preview_import',
          preview: {
            databaseId: 'db_research',
            sourceId: 'ds_research',
            sourceFolder: 'research/notes',
            items: [
              {
                path: 'research/notes/untitled.md',
                action: 'modify',
                reasons: [
                  {
                    code: 'required_property_missing',
                    message: 'Title is required.',
                  },
                ],
                plannedChanges: [
                  {
                    type: 'provide_required_property',
                    propertyId: 'prop_title',
                    propertyKey: 'title',
                  },
                ],
              },
            ],
            summary: { include: 0, exclude: 0, modify: 1, reject: 0 },
            complete: true,
            entryLimit: 100_000,
          },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    await screen.findByText('No databases yet.');
    fireEvent.click(screen.getByText('Create database'));
    fireEvent.click(await screen.findByText('Existing folder'));
    expect(screen.getByTestId('database-folder-migration-handoff').textContent).toContain(
      'Advanced migration review',
    );
    fireEvent.change(screen.getByLabelText('Database name'), {
      target: { value: 'Research' },
    });
    fireEvent.change(screen.getByLabelText('Content-relative folder'), {
      target: { value: 'research/notes' },
    });
    fireEvent.click(screen.getByText('Review creation'));
    await screen.findByTestId('database-creation-ghost-review');
    expect(screen.getByTestId('database-creation-human-plan-summary').textContent).toContain(
      'Schema: Create 1 database manifest',
    );
    expect(screen.getByText('Exact plan details')).toBeTruthy();
    expect(previewCalls).toBe(0);

    fireEvent.click(screen.getByText('Commit creation'));
    expect(await screen.findByText('Advanced migration: assign record identities')).not.toBeNull();
    expect(await screen.findByText('research/notes/untitled.md')).not.toBeNull();
    expect(previewCalls).toBe(1);
    expect(screen.getByTestId('database-source-identity-migration-steps')).not.toBeNull();
    expect((screen.getByText('Approve identity assignment') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(
      document.querySelector('[data-database-advanced-migration-flow="source-identity-migration"]'),
    ).not.toBeNull();
  });

  test('recovers an explicit offline state without treating it as an empty database', async () => {
    let online = false;
    globalThis.fetch = mock(async () => {
      if (!online) throw new TypeError('Failed to fetch');
      return Response.json({ ...catalog(), candidates: [] });
    }) as typeof fetch;
    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    expect(await screen.findByText('Database is offline')).not.toBeNull();
    expect(document.querySelector('[data-database-state="offline"]')).not.toBeNull();
    expect(screen.queryByText('No databases yet.')).toBeNull();

    online = true;
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('No databases yet.')).not.toBeNull();
  });

  test('keeps a successful database snapshot readable and explicitly stale after going offline', async () => {
    let online = true;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      if (!online) throw new TypeError('Failed to fetch');
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') return Response.json(queryResult());
      return Response.json({}, { status: 404 });
    }) as typeof fetch;
    const view = render(<DatabaseTableDialog open onOpenChange={() => {}} />);
    expect(await screen.findByText('First task')).toBeTruthy();

    online = false;
    view.rerender(<DatabaseTableDialog open={false} onOpenChange={() => {}} />);
    view.rerender(<DatabaseTableDialog open onOpenChange={() => {}} />);

    expect(await screen.findByText('Read-only cached database')).toBeTruthy();
    expect(screen.getByText('First task')).toBeTruthy();
    expect(document.querySelector('[data-database-state="offline-cache"]')?.textContent).toContain(
      queryResult().snapshotRevision,
    );
  });

  test('durably queues a preconditioned cell write when planning loses transport', async () => {
    const previousIndexedDb = globalThis.indexedDB;
    Object.assign(globalThis, { indexedDB: new IDBFactory() });
    emitBranchChanged('main');
    setServerInstanceId('server-one');
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') return Response.json(queryResult());
      if (path === '/api/databases/plan') throw new TypeError('Failed to fetch');
      return Response.json({}, { status: 404 });
    }) as typeof fetch;
    try {
      render(<DatabaseTableDialog open onOpenChange={() => {}} />);
      fireEvent.click(await screen.findByLabelText('Edit Title for record rec_first'));
      fireEvent.change(screen.getByLabelText('Edit Title'), { target: { value: 'Queued task' } });
      fireEvent.click(screen.getByLabelText('Save cell edit'));

      expect(await screen.findByText('Offline write queue')).toBeTruthy();
      expect(screen.getByText(/1 queued/)).toBeTruthy();
      const queued = await offlineDatabaseMutationStore.list();
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({
        databaseId: database.id,
        sourceId: source.id,
        branch: 'main',
        serverInstanceId: 'server-one',
        state: 'queued',
        recordMutations: [
          expect.objectContaining({
            id: 'rec_first',
            preconditions: [{ propertyKey: 'title', present: true, value: 'First task' }],
          }),
        ],
      });
    } finally {
      Object.assign(globalThis, { indexedDB: previousIndexedDb });
    }
  });

  test('distinguishes invalid schema, stale index, and permission states', async () => {
    let scenario: 'invalid_schema' | 'stale_index' | 'permission' = 'invalid_schema';
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        if (scenario === 'invalid_schema') {
          return Response.json({
            ...description(),
            database: { invalid: true },
          });
        }
        return Response.json(description());
      }
      if (path === '/api/databases/query') {
        if (scenario === 'stale_index') {
          return Response.json(
            {
              detail: 'Database record index is not current',
              code: 'stale_index',
              retryable: true,
              recovery: { action: 'rebuild_index' },
            },
            { status: 503 },
          );
        }
        if (scenario === 'permission') {
          return Response.json(
            {
              detail: 'The requested property is not readable',
              code: 'permission_denied',
              retryable: false,
              recovery: { action: 'request_access' },
            },
            { status: 403 },
          );
        }
        return Response.json(queryResult());
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    const rendered = render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    expect(await screen.findByText('Database schema is invalid')).not.toBeNull();
    expect(document.querySelector('[data-database-state="invalid_schema"]')).not.toBeNull();
    expect(screen.getByText('Reload schema')).not.toBeNull();

    scenario = 'stale_index';
    fireEvent.click(screen.getByText('Reload schema'));
    expect(await screen.findByText('Database index is not current')).not.toBeNull();
    expect(document.querySelector('[data-database-state="stale_index"]')).not.toBeNull();
    expect(screen.getByText('Check index again')).not.toBeNull();

    scenario = 'permission';
    fireEvent.click(screen.getByText('Check index again'));
    expect(await screen.findByText('Permission required')).not.toBeNull();
    expect(document.querySelector('[data-database-state="permission"]')).not.toBeNull();
    expect(screen.queryByText('Retry')).toBeNull();
    expect(screen.queryByText('Reload latest')).toBeNull();
    rendered.unmount();
  });

  test('shows a blocked exact plan as a conflict and reloads canonical state', async () => {
    let queryCalls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as { action?: string }) : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        queryCalls += 1;
        return Response.json(queryResult());
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_conflict', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_conflict',
            hash,
            draftId: 'draft_conflict',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['rec_first'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [],
            affectedObjects: {
              databaseIds: ['db_tasks'],
              sourceIds: ['ds_tasks'],
              propertyIds: ['prop_title'],
              viewIds: [],
              recordIds: ['rec_first'],
            },
            diff: {
              mode: 'exact',
              manifests: [],
              records: [],
              templates: [],
            },
            risk: { level: 'low', reasons: [] },
            conflictDomains: ['record_value'],
            conflicts: [
              {
                code: 'record_revision_changed',
                message: 'Record revision changed',
                targetId: 'rec_first',
              },
            ],
            approvals: [],
            postconditions: [],
            committable: false,
            requiresCommit: false,
          },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByLabelText('Edit Title for record rec_first'));
    fireEvent.change(screen.getByLabelText('Edit Title'), {
      target: { value: 'Changed task' },
    });
    fireEvent.click(screen.getByLabelText('Save cell edit'));
    expect(await screen.findByText('Resolve concurrent database changes')).not.toBeNull();
    expect(screen.getByText('Record revision changed')).not.toBeNull();
    expect(document.querySelector('[data-database-conflict-resolution]')).not.toBeNull();
    expect(screen.queryByText('Replan my change')).toBeNull();

    fireEvent.click(screen.getByText('Use latest state'));
    await waitFor(() => expect(queryCalls).toBe(2));
  });

  test('shows recoverable service failures without calling them offline', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({ detail: 'Database service is offline' }, { status: 503 }),
    ) as typeof fetch;
    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    expect(await screen.findByText('Database request failed')).not.toBeNull();
    expect(await screen.findByText('Database service is offline')).not.toBeNull();
    expect(document.querySelector('[data-database-state="error"]')).not.toBeNull();
  });

  test('keeps an invalid cell draft local and explains how to fix it', async () => {
    const requestedPaths: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const path = String(input);
      requestedPaths.push(path);
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') return Response.json(queryResult());
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByLabelText('Edit Title for record rec_first'));
    fireEvent.change(screen.getByLabelText('Edit Title'), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByLabelText('Save cell edit'));
    expect(await screen.findByText('Title cannot be empty')).not.toBeNull();
    expect(document.querySelector('[data-database-state="invalid_value"]')).not.toBeNull();
    expect(screen.getByLabelText('Edit Title')).not.toBeNull();
    expect(requestedPaths).not.toContain('/api/databases/plan');
  });

  test('saves a direct-safe edited value without a ghost-review interruption', async () => {
    let committed = false;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as { action?: string }) : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        const next = queryResult();
        if (committed && next.records[0]) next.records[0].values.prop_title = 'Changed task';
        return Response.json(next);
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_cell', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_cell',
            hash,
            draftId: 'draft_cell',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['db_tasks', 'ds_tasks', 'prop_title', 'rec_first'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [],
            affectedObjects: {
              databaseIds: ['db_tasks'],
              sourceIds: ['ds_tasks'],
              propertyIds: ['prop_title'],
              viewIds: [],
              recordIds: ['rec_first'],
            },
            diff: {
              mode: 'exact',
              manifests: [],
              records: [
                {
                  recordId: 'rec_first',
                  sourceId: 'ds_tasks',
                  path: 'tasks/first.md',
                  action: 'update',
                  before: { values: { prop_title: 'First task' }, body: '' },
                  after: { values: { prop_title: 'Changed task' }, body: '' },
                },
              ],
              templates: [],
              policy: {
                mode: 'review',
                allowedOperations: [],
                maxRecordsPerCommit: 1,
              },
            },
            risk: { level: 'low', reasons: [] },
            conflicts: [],
            approvals: [],
            postconditions: [],
            committable: true,
            requiresCommit: true,
          },
        });
      }
      if (path === '/api/databases/commit') {
        committed = true;
        return Response.json({
          mutationId: 'mut_cell',
          planId: 'plan_cell',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [],
          verification: { status: 'passed' },
          revisions: {
            gitHead: `sha1:${'b'.repeat(40)}`,
            snapshotRevision: hash,
          },
          auditReceipt: {},
          undoToken: 'undo_cell.secret',
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByLabelText('Edit Title for record rec_first'));
    const input = screen.getByLabelText('Edit Title');
    fireEvent.change(input, { target: { value: 'Changed task' } });
    fireEvent.click(screen.getByLabelText('Save cell edit'));

    await waitFor(() => expect(committed).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('database-ghost-review')).toBeNull());
    await waitFor(() => {
      expect(
        screen.getByTestId('database-save-indicator').getAttribute('data-database-save-state'),
      ).toBe('saved');
    });
    expect(screen.queryByText('Proposed · not saved')).toBeNull();
    expect(
      (await screen.findByText('Changed task')).closest('td')?.getAttribute('data-canonical'),
    ).toBe('true');
  });

  test('creates a new record directly and refreshes the canonical table', async () => {
    let commitCalls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as { action?: string }) : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        return Response.json({
          ...queryResult(),
          matched: commitCalls > 0 ? 1 : 0,
          returned: commitCalls > 0 ? 1 : 0,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          records:
            commitCalls > 0
              ? [
                  {
                    id: 'rec_created',
                    path: 'tasks/created.md',
                    revision: hash,
                    values: { prop_title: 'Created task' },
                  },
                ]
              : [],
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_create', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_create',
            hash,
            draftId: 'draft_create',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['db_tasks', 'ds_tasks', 'prop_title', 'rec_created'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [],
            affectedObjects: {
              databaseIds: ['db_tasks'],
              sourceIds: ['ds_tasks'],
              propertyIds: ['prop_title'],
              viewIds: [],
              recordIds: ['rec_created'],
            },
            diff: {
              mode: 'exact',
              manifests: [],
              records: [
                {
                  recordId: 'rec_created',
                  sourceId: 'ds_tasks',
                  path: 'tasks/created.md',
                  action: 'create',
                  before: null,
                  after: { values: { prop_title: 'Created task' }, body: '' },
                },
              ],
              templates: [],
              policy: {
                mode: 'review',
                allowedOperations: [],
                maxRecordsPerCommit: 1,
              },
            },
            risk: { level: 'low', reasons: [] },
            conflicts: [],
            approvals: [],
            postconditions: [],
            committable: true,
            requiresCommit: true,
          },
        });
      }
      if (path === '/api/databases/commit') {
        commitCalls += 1;
        return Response.json({
          mutationId: 'mut_create',
          planId: 'plan_create',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [],
          verification: { status: 'passed' },
          revisions: {
            gitHead: `sha1:${'b'.repeat(40)}`,
            snapshotRevision: hash,
          },
          auditReceipt: {},
          undoToken: 'undo_create.secret',
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    await screen.findByText('No records in this source.');
    const newRowTitle = screen.getByTestId('database-new-row-title');
    fireEvent.change(newRowTitle, {
      target: { value: 'Created task' },
    });
    fireEvent.keyDown(newRowTitle, { key: 'Enter' });
    await waitFor(() => expect(commitCalls).toBe(1));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('database-new-row-title')),
    );
    expect(
      (await screen.findByText('Created task')).closest('tr')?.getAttribute('data-canonical'),
    ).toBe('true');
    const escapeInput = screen.getByTestId('database-new-row-title');
    fireEvent.change(escapeInput, { target: { value: 'Discarded draft' } });
    fireEvent.keyDown(escapeInput, { key: 'Escape' });
    expect((escapeInput as HTMLInputElement).value).toBe('');
  });

  test('keeps deletion as a discardable ghost row until exact-plan commit', async () => {
    let commitCalls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as { action?: string }) : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        return Response.json(
          commitCalls > 0
            ? {
                ...queryResult(),
                matched: 0,
                returned: 0,
                isComplete: true,
                nextCursor: null,
                truncatedBy: null,
                records: [],
              }
            : {
                ...queryResult(),
                isComplete: true,
                nextCursor: null,
                truncatedBy: null,
              },
        );
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_delete', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_delete',
            hash,
            draftId: 'draft_delete',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['db_tasks', 'ds_tasks', 'prop_title', 'rec_first'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [
              {
                kind: 'delete_records',
                sourceId: 'ds_tasks',
                recordIds: ['rec_first'],
              },
            ],
            affectedObjects: {
              databaseIds: ['db_tasks'],
              sourceIds: ['ds_tasks'],
              propertyIds: ['prop_title'],
              viewIds: [],
              recordIds: ['rec_first'],
            },
            diff: {
              mode: 'exact',
              manifests: [],
              records: [
                {
                  recordId: 'rec_first',
                  sourceId: 'ds_tasks',
                  path: 'tasks/first.md',
                  action: 'delete',
                  before: {
                    revision: hash,
                    values: {
                      prop_title: 'First task',
                      prop_status: 'opt_active',
                    },
                    body: '',
                  },
                  after: null,
                },
              ],
              templates: [],
              policy: {
                mode: 'review',
                allowedOperations: [],
                maxRecordsPerCommit: 1,
              },
            },
            risk: {
              level: 'high',
              reasons: ['Deletes 1 canonical record(s)'],
            },
            conflicts: [],
            approvals: [
              {
                code: 'delete_record',
                required: true,
                reason: 'Destructive',
              },
            ],
            postconditions: [],
            committable: true,
            requiresCommit: true,
          },
        });
      }
      if (path === '/api/databases/commit') {
        commitCalls += 1;
        return Response.json({
          mutationId: 'mut_delete',
          planId: 'plan_delete',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [
            {
              operation: 'delete',
              path: 'content/tasks/first.md',
              before: {
                sha256: hash,
                gitBlob: `sha1:${'b'.repeat(40)}`,
                bytes: 100,
              },
              after: null,
            },
          ],
          verification: { status: 'passed' },
          revisions: {
            gitHead: `sha1:${'b'.repeat(40)}`,
            snapshotRevision: hash,
          },
          auditReceipt: {},
          undoToken: 'undo_delete.secret',
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    await screen.findByText('First task');
    fireEvent.click(screen.getByLabelText('Delete record rec_first'));
    expect(
      (await screen.findByText('Proposed deletion')).closest('tr')?.getAttribute('data-canonical'),
    ).toBe('false');
    expect(
      screen.getByText('Proposed deletion').closest('tr')?.getAttribute('data-proposed-deletion'),
    ).toBe('true');
    expect(screen.getByTestId('database-exact-change-scope').textContent).toContain(
      '1 record file(s), 0 manifest(s)',
    );
    expect(screen.getByTestId('database-human-plan-summary').textContent).toContain(
      'Data: Delete 1 record',
    );
    expect(screen.getByText('Exact plan details')).toBeTruthy();
    expect(screen.getByLabelText('Change risks').textContent).toContain(
      'Deletes 1 canonical record(s)',
    );
    expect(screen.getByText(/successful reversible commit exposes Undo last change/)).toBeTruthy();
    expect(commitCalls).toBe(0);

    fireEvent.click(screen.getByText('Discard'));
    await waitFor(() => expect(screen.queryByText('Proposed deletion')).toBeNull());
    expect(
      document.querySelector('[data-record-id="rec_first"]')?.getAttribute('data-canonical'),
    ).toBe('true');
    expect(commitCalls).toBe(0);

    fireEvent.click(screen.getByLabelText('Delete record rec_first'));
    fireEvent.click(await screen.findByText('Commit change'));
    await waitFor(() => expect(commitCalls).toBe(1));
    expect(await screen.findByText('No records in this source.')).not.toBeNull();
    expect(document.querySelector('[data-record-id="rec_first"]')).toBeNull();
  });

  test('duplicates through an exact source revision and shows a discardable ghost copy', async () => {
    let desiredCopies: unknown[] = [];
    let commitCalls = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: { recordCopies?: unknown[] };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') return Response.json(queryResult());
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        desiredCopies = body.desiredState?.recordCopies ?? [];
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_copy', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_copy',
            hash,
            draftId: 'draft_copy',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['rec_first', 'rec_copy'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [],
            affectedObjects: {
              databaseIds: ['db_tasks'],
              sourceIds: ['ds_tasks'],
              propertyIds: ['prop_title'],
              viewIds: [],
              recordIds: ['rec_copy'],
            },
            diff: {
              mode: 'exact',
              manifests: [],
              records: [
                {
                  recordId: 'rec_copy',
                  sourceId: 'ds_tasks',
                  path: 'tasks/copy.md',
                  action: 'create',
                  before: null,
                  after: {
                    values: { prop_title: 'First task copy' },
                    body: '',
                  },
                },
              ],
              templates: [],
              policy: {
                mode: 'review',
                allowedOperations: [],
                maxRecordsPerCommit: 1,
              },
            },
            risk: {
              level: 'medium',
              reasons: ['Creates 1 canonical record'],
            },
            conflicts: [],
            approvals: [],
            postconditions: [],
            committable: true,
            requiresCommit: true,
          },
        });
      }
      if (path === '/api/databases/commit') {
        commitCalls += 1;
        return Response.json({ detail: 'unexpected commit' }, { status: 500 });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    await screen.findByText('First task');
    fireEvent.click(screen.getByLabelText('Duplicate record rec_first'));
    await waitFor(() => expect(desiredCopies).toHaveLength(1));
    expect(desiredCopies).toEqual([
      expect.objectContaining({
        id: 'rec_first',
        expectedRevision: hash,
        title: 'First task copy',
      }),
    ]);
    expect(
      (await screen.findByText('First task copy')).closest('tr')?.getAttribute('data-canonical'),
    ).toBe('false');
    fireEvent.click(screen.getByText('Discard'));
    await waitFor(() => expect(screen.queryByText('First task copy')).toBeNull());
    expect(commitCalls).toBe(0);
  });

  test('loads archived records only on request and previews canonical restore', async () => {
    let desiredArchives: unknown[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            query?: { includeArchived?: boolean };
            desiredState?: { recordArchives?: unknown[] };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        const base = queryResult();
        return Response.json(
          body.query?.includeArchived
            ? {
                ...base,
                matched: 2,
                returned: 2,
                isComplete: true,
                nextCursor: null,
                truncatedBy: null,
                records: [
                  ...base.records,
                  {
                    id: 'rec_archived',
                    path: 'tasks/archived.md',
                    revision: hash,
                    archivedAt: '2026-07-20T01:02:03.000Z',
                    values: {
                      prop_title: 'Archived task',
                      prop_status: 'opt_active',
                    },
                  },
                ],
              }
            : base,
        );
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        desiredArchives = body.desiredState?.recordArchives ?? [];
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_restore', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_restore',
            hash,
            draftId: 'draft_restore',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['rec_archived'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [],
            affectedObjects: {
              databaseIds: ['db_tasks'],
              sourceIds: ['ds_tasks'],
              propertyIds: [],
              viewIds: [],
              recordIds: ['rec_archived'],
            },
            diff: {
              mode: 'exact',
              manifests: [],
              records: [
                {
                  recordId: 'rec_archived',
                  sourceId: 'ds_tasks',
                  path: 'tasks/archived.md',
                  action: 'update',
                  before: {
                    revision: hash,
                    values: { prop_title: 'Archived task' },
                    body: '',
                    archivedAt: '2026-07-20T01:02:03.000Z',
                  },
                  after: {
                    values: { prop_title: 'Archived task' },
                    body: '',
                    archivedAt: null,
                  },
                },
              ],
              templates: [],
              policy: {
                mode: 'review',
                allowedOperations: [],
                maxRecordsPerCommit: 1,
              },
            },
            risk: {
              level: 'medium',
              reasons: ['Updates 1 canonical record'],
            },
            conflicts: [],
            approvals: [],
            postconditions: [],
            committable: true,
            requiresCommit: true,
          },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    await screen.findByText('First task');
    expect(screen.queryByText('Archived task')).toBeNull();
    fireEvent.click(screen.getByText('Show archived'));
    expect(await screen.findByText('Archived task')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Restore record rec_archived'));
    await waitFor(() => expect(desiredArchives).toHaveLength(1));
    expect(desiredArchives).toEqual([
      expect.objectContaining({
        id: 'rec_archived',
        expectedRevision: hash,
        action: 'restore',
      }),
    ]);
    expect(await screen.findByText('Proposed restore')).not.toBeNull();
    fireEvent.click(screen.getByText('Discard'));
    await waitFor(() => expect(screen.queryByTestId('database-ghost-review')).toBeNull());
  });

  test('plans a compatible source move as one non-canonical row transition', async () => {
    let desiredMoves: unknown[] = [];
    const targetSource = {
      ...source,
      id: 'ds_archive',
      key: 'archive',
      name: 'Archive',
      folder: 'archive',
      properties: [
        {
          id: 'prop_archive_title',
          key: 'title',
          name: 'Title',
          type: 'title' as const,
        },
        {
          id: 'prop_archive_status',
          key: 'status',
          name: 'Status',
          type: 'select' as const,
          options: [{ id: 'opt_archive_active', key: 'active', name: 'Active' }],
        },
      ],
    };
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: { recordMoves?: unknown[] };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) {
        const value = catalog();
        value.candidates[0]?.sources.push({
          id: targetSource.id,
          key: targetSource.key,
          name: targetSource.name,
          recordMeaning: targetSource.recordMeaning,
          propertyCount: targetSource.properties.length,
        });
        return Response.json(value);
      }
      if (path === '/api/databases/describe') {
        return Response.json({
          ...description(),
          database: {
            ...database,
            sources: [source, targetSource],
            sourceMappings: [
              {
                sourceId: source.id,
                targetSourceId: targetSource.id,
                propertyMappings: [
                  {
                    sourcePropertyId: 'prop_title',
                    targetPropertyId: 'prop_archive_title',
                    optionMappings: [],
                  },
                  {
                    sourcePropertyId: 'prop_status',
                    targetPropertyId: 'prop_archive_status',
                    optionMappings: [
                      {
                        sourceOptionId: 'opt_active',
                        targetOptionId: 'opt_archive_active',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });
      }
      if (path === '/api/databases/query') return Response.json(queryResult());
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        desiredMoves = body.desiredState?.recordMoves ?? [];
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_move', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_move',
            hash,
            draftId: 'draft_move',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['rec_first', 'ds_tasks', 'ds_archive'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [],
            affectedObjects: {
              databaseIds: ['db_tasks'],
              sourceIds: ['ds_tasks', 'ds_archive'],
              propertyIds: [],
              viewIds: [],
              recordIds: ['rec_first'],
            },
            diff: {
              mode: 'exact',
              manifests: [],
              records: [
                {
                  recordId: 'rec_first',
                  sourceId: 'ds_archive',
                  beforeSourceId: 'ds_tasks',
                  path: 'tasks/first.md',
                  targetPath: 'archive/rec_first.md',
                  action: 'move',
                  before: {
                    revision: hash,
                    values: { prop_title: 'First task' },
                    body: '',
                  },
                  after: {
                    values: { prop_archive_title: 'First task' },
                    body: '',
                  },
                },
              ],
              templates: [],
              policy: {
                mode: 'review',
                allowedOperations: [],
                maxRecordsPerCommit: 1,
              },
            },
            risk: { level: 'medium', reasons: ['Moves 1 canonical record'] },
            conflicts: [],
            approvals: [],
            postconditions: [],
            committable: true,
            requiresCommit: true,
          },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    await screen.findByText('First task');
    fireEvent.click(screen.getByLabelText('Move record rec_first'));
    fireEvent.click(screen.getByLabelText('Move target source'));
    fireEvent.click(
      await screen.findByRole('option', {
        name: 'Archive · 2 mapped properties',
      }),
    );
    fireEvent.click(screen.getByText('Plan move'));
    await waitFor(() => expect(desiredMoves).toHaveLength(1));
    expect(desiredMoves).toEqual([
      expect.objectContaining({
        id: 'rec_first',
        expectedRevision: hash,
        sourceKey: 'tasks',
        targetSourceKey: 'archive',
      }),
    ]);
    expect(await screen.findByText('Proposed move')).not.toBeNull();
    expect(
      document.querySelector('[data-record-id="rec_first"]')?.getAttribute('data-canonical'),
    ).toBe('false');
    fireEvent.click(screen.getByText('Discard'));
    await waitFor(() => expect(screen.queryByTestId('database-ghost-review')).toBeNull());
  });

  test('previews a revision-bound bulk edit and restores it through exact undo', async () => {
    let committed = false;
    let undone = false;
    let draftedMutations: unknown[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: { recordMutations?: unknown[] };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') return Response.json(description());
      if (path === '/api/databases/query') {
        const changed = committed && !undone;
        return Response.json({
          ...queryResult(),
          matched: 2,
          returned: 2,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: {
                prop_title: changed ? 'Bulk changed' : 'First task',
                prop_status: 'opt_active',
              },
            },
            {
              id: 'rec_second',
              path: 'tasks/second.md',
              revision: hash,
              values: {
                prop_title: changed ? 'Bulk changed' : 'Second task',
                prop_status: 'opt_active',
              },
            },
          ],
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        draftedMutations = body.desiredState?.recordMutations ?? [];
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_bulk', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_bulk',
            hash,
            draftId: 'draft_bulk',
            draftRevision: hash,
            snapshotRevision: hash,
            createdAt: '2026-07-20T00:00:00.000Z',
            expiresAt: '2026-07-20T01:00:00.000Z',
            immutableTargetSet: ['db_tasks', 'ds_tasks', 'prop_title', 'rec_first', 'rec_second'],
            writeGuards: { permissions: [], querySnapshots: [] },
            targetResolutions: [],
            normalizedOperations: [],
            affectedObjects: {
              databaseIds: ['db_tasks'],
              sourceIds: ['ds_tasks'],
              propertyIds: ['prop_title'],
              viewIds: [],
              recordIds: ['rec_first', 'rec_second'],
            },
            diff: {
              mode: 'exact',
              manifests: [],
              records: [
                {
                  recordId: 'rec_first',
                  sourceId: 'ds_tasks',
                  path: 'tasks/first.md',
                  action: 'update',
                  before: {
                    revision: hash,
                    values: { prop_title: 'First task' },
                    body: '',
                  },
                  after: { values: { prop_title: 'Bulk changed' }, body: '' },
                },
                {
                  recordId: 'rec_second',
                  sourceId: 'ds_tasks',
                  path: 'tasks/second.md',
                  action: 'update',
                  before: {
                    revision: hash,
                    values: { prop_title: 'Second task' },
                    body: '',
                  },
                  after: { values: { prop_title: 'Bulk changed' }, body: '' },
                },
              ],
              templates: [],
              policy: {
                mode: 'review',
                allowedOperations: [],
                maxRecordsPerCommit: 2,
              },
            },
            risk: {
              level: 'medium',
              reasons: ['Updates 2 canonical records'],
            },
            conflicts: [],
            approvals: [],
            postconditions: [],
            committable: true,
            requiresCommit: true,
          },
        });
      }
      if (path === '/api/databases/commit') {
        committed = true;
        return Response.json({
          mutationId: 'mut_bulk',
          planId: 'plan_bulk',
          planHash: hash,
          idempotentReplay: false,
          actualDiff: [],
          verification: { status: 'passed' },
          revisions: {
            gitHead: `sha1:${'b'.repeat(40)}`,
            snapshotRevision: hash,
          },
          auditReceipt: {},
          undoToken: 'undo_bulk.secret',
        });
      }
      if (path === '/api/databases/undo') {
        if (body.action === 'apply') undone = true;
        if (body.action === 'redo_apply') undone = false;
        return Response.json({
          action: body.action,
          undoId: 'undo_bulk',
          mutationId: 'mut_bulk',
          canApply: true,
          idempotentReplay: false,
          expectedSnapshotRevision: hash,
          observedSnapshotRevision: hash,
          conflicts: [],
          receipt:
            body.action === 'apply' || body.action === 'redo_apply' ? { status: 'applied' } : null,
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    await screen.findByText('Second task');
    fireEvent.click(screen.getByLabelText('Select all loaded records'));
    expect(await screen.findByTestId('database-bulk-toolbar')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Bulk property'));
    fireEvent.click(await screen.findByRole('option', { name: 'Title' }));
    fireEvent.change(screen.getByLabelText('Bulk value'), {
      target: { value: 'Bulk changed' },
    });
    fireEvent.click(screen.getByText('Plan bulk edit'));

    await waitFor(() => expect(draftedMutations).toHaveLength(2));
    expect(draftedMutations).toEqual([
      expect.objectContaining({ id: 'rec_first', expectedRevision: hash }),
      expect.objectContaining({ id: 'rec_second', expectedRevision: hash }),
    ]);
    expect(await screen.findAllByText('Bulk changed')).toHaveLength(2);
    expect(
      document.querySelector('[data-record-id="rec_first"]')?.getAttribute('data-canonical'),
    ).toBe('false');
    expect(committed).toBe(false);

    fireEvent.click(screen.getByText('Commit change'));
    await waitFor(() => expect(committed).toBe(true));
    expect(await screen.findAllByText('Bulk changed')).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole('main'), { key: 'z', ctrlKey: true });
    await waitFor(() => expect(undone).toBe(true));
    expect(await screen.findByText('First task')).not.toBeNull();
    expect(screen.getByText('Second task')).not.toBeNull();
    expect(screen.queryByText('Undo last change')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('main').getAttribute('data-database-redo-available')).toBe('true'),
    );
    fireEvent.keyDown(screen.getByRole('main'), { key: 'z', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(undone).toBe(false));
    expect(await screen.findAllByText('Bulk changed')).toHaveLength(2);
  });

  test('plans Checkbox bulk toggle from each selected canonical value', async () => {
    let draftedMutations: Array<{
      operations?: Array<{ propertyKey?: string; value?: unknown }>;
    }> = [];
    const checkboxProperty = {
      id: 'prop_complete',
      key: 'complete',
      name: 'Complete',
      type: 'checkbox' as const,
    };
    const checkboxSource = {
      ...source,
      properties: [...source.properties, checkboxProperty],
    };
    const checkboxDatabase = { ...database, sources: [checkboxSource] };
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as {
            action?: string;
            desiredState?: { recordMutations?: typeof draftedMutations };
          })
        : {};
      if (path.startsWith('/api/databases/catalog')) return Response.json(catalog());
      if (path === '/api/databases/describe') {
        return Response.json({
          ...description(),
          database: checkboxDatabase,
          source: checkboxSource,
        });
      }
      if (path === '/api/databases/query') {
        return Response.json({
          ...queryResult(),
          matched: 2,
          returned: 2,
          isComplete: true,
          nextCursor: null,
          truncatedBy: null,
          records: [
            {
              id: 'rec_first',
              path: 'tasks/first.md',
              revision: hash,
              values: { prop_title: 'First task', prop_complete: true },
            },
            {
              id: 'rec_second',
              path: 'tasks/second.md',
              revision: hash,
              values: { prop_title: 'Second task', prop_complete: false },
            },
          ],
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_draft') {
        draftedMutations = body.desiredState?.recordMutations ?? [];
        return Response.json({
          action: 'create_draft',
          draft: { id: 'draft_toggle', revision: hash },
        });
      }
      if (path === '/api/databases/plan' && body.action === 'create_plan') {
        return Response.json({
          action: 'create_plan',
          plan: {
            id: 'plan_toggle',
            hash,
            snapshotRevision: hash,
            committable: false,
            requiresCommit: false,
            conflicts: [{ code: 'test_stop', message: 'Preview captured' }],
            approvals: [],
            diff: {
              mode: 'exact',
              manifests: [],
              records: [],
              templates: [],
            },
          },
        });
      }
      return Response.json({ detail: `unexpected request: ${path}` }, { status: 500 });
    }) as typeof fetch;

    render(<DatabaseTableDialog open={true} onOpenChange={() => {}} />);
    await screen.findByText('Second task');
    fireEvent.click(screen.getByLabelText('Select all loaded records'));
    fireEvent.click(screen.getByLabelText('Bulk property'));
    fireEvent.click(await screen.findByRole('option', { name: 'Complete' }));
    fireEvent.click(screen.getByText('Toggle selected'));
    await waitFor(() => expect(draftedMutations).toHaveLength(2));
    expect(draftedMutations.map((mutation) => mutation.operations)).toEqual([
      [{ op: 'set', propertyKey: 'complete', value: false }],
      [{ op: 'set', propertyKey: 'complete', value: true }],
    ]);
  });
});
