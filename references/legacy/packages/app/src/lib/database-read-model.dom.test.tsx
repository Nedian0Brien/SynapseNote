import { afterEach, describe, expect, mock, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { DatabaseDescription } from './database-catalog-client';
import { resetDatabaseLinkedViewCacheForTests } from './database-linked-view-cache';
import {
  type DatabaseReadModelTarget,
  databaseLinkedViewCacheKey,
  useDatabaseReadModel,
} from './database-read-model';
import { DATABASE_READ_MAX_ATTEMPTS } from './database-read-retry';

const originalFetch = globalThis.fetch;
const revision = `sha256:${'b'.repeat(64)}`;

function description(suffix: string): DatabaseDescription {
  const source = {
    id: `ds_read_model_${suffix}`,
    key: `read-model-${suffix}`,
    name: 'Read model source',
    recordMeaning: 'One read model row',
    folder: 'read-model',
    includeSubfolders: true,
    properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' as const }],
  };
  const view = {
    id: `view_read_model_${suffix}`,
    key: `read-model-${suffix}`,
    name: 'Read model view',
    sourceId: source.id,
    layout: { type: 'table' as const, configuration: { rowHeight: 'compact' as const } },
    sort: [],
    groups: [],
    projection: { propertyIds: ['prop_title'], body: 'hidden' as const },
  };
  const database = DatabaseDefinitionSchema.parse({
    version: 1,
    id: `db_read_model_${suffix}`,
    key: `read-model-${suffix}`,
    name: 'Read model database',
    contract: {
      purpose: 'Exercise the shared read model',
      canonicality: 'canonical',
      vocabulary: ['read'],
      freshness: { expectation: 'realtime', maxAgeSeconds: 60 },
      sensitivity: 'internal',
    },
    sources: [source],
    views: [view],
  });
  return {
    manifestRevision: revision,
    schemaRevision: revision,
    database,
    source,
    index: {
      state: 'idle',
      revision,
      manifestRevision: revision,
      recordCount: 0,
      issueCount: 0,
      progress: null,
      lastRebuiltAt: '2026-07-20T00:00:00.000Z',
      lastIncrementalAt: null,
      lastError: null,
    },
    allowedOperations: ['describe', 'query'],
  };
}

function queryResult(sourceId: string) {
  return {
    sourceId,
    snapshotRevision: revision,
    matched: 0,
    returned: 0,
    isComplete: true,
    nextCursor: null,
    truncatedBy: null,
    indexFreshness: 'snapshot' as const,
    records: [],
    aggregation: null,
  };
}

function Harness({ target }: { target: DatabaseReadModelTarget }) {
  const state = useDatabaseReadModel(target);
  return (
    <div
      data-testid="read-model-state"
      data-status={state.status}
      data-refreshing={state.status === 'ready' ? String(state.refreshing) : undefined}
      data-refresh-problem={state.status === 'ready' ? state.refreshProblem?.kind : undefined}
      data-resolved-view={state.status === 'ready' ? state.resolvedViewId : undefined}
    >
      {state.status === 'ready'
        ? `${state.description.database.id}:${state.result?.records.map((record) => record.id).join(',') ?? 'none'}:${state.result?.nextCursor ?? 'done'}`
        : state.status}
    </div>
  );
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetDatabaseLinkedViewCacheForTests();
});

describe('useDatabaseReadModel', () => {
  test('does not refetch when only client-side manual row order changes', () => {
    const target = {
      databaseId: 'db_manual_order',
      sourceId: 'ds_manual_order',
      viewId: 'view_manual_order',
      viewOverrides: { projection: { propertyIds: ['prop_title'], body: 'hidden' as const } },
    };
    expect(
      databaseLinkedViewCacheKey({
        ...target,
        viewOverrides: { ...target.viewOverrides, manualRecordIds: ['rec_two', 'rec_one'] },
      }),
    ).toBe(databaseLinkedViewCacheKey(target));
  });

  test('keeps the last ready snapshot visible while a refresh is in flight', async () => {
    const initial = description('refresh');
    let describeCalls = 0;
    let releaseRefresh: (() => void) | undefined;
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        describeCalls += 1;
        if (describeCalls === 1) return Promise.resolve(Response.json(initial));
        return new Promise<Response>((resolve) => {
          releaseRefresh = () => resolve(Response.json(initial));
        });
      }
      if (path === '/api/databases/query') {
        return Promise.resolve(Response.json(queryResult(initial.source?.id ?? '')));
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;
    const target: DatabaseReadModelTarget = {
      databaseId: initial.database.id,
      sourceId: initial.source?.id ?? '',
      viewId: initial.database.views[0]?.id ?? '',
      mode: 'inline',
    };
    const { rerender } = render(<Harness target={target} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-status')).toBe('ready'),
    );
    rerender(<Harness target={{ ...target, refreshKey: 1 }} />);
    await waitFor(() => {
      const surface = screen.getByTestId('read-model-state');
      expect(surface.getAttribute('data-status')).toBe('ready');
      expect(surface.getAttribute('data-refreshing')).toBe('true');
      expect(surface.textContent).toContain(`${initial.database.id}:`);
    });
    act(() => releaseRefresh?.());
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-refreshing')).toBe('false'),
    );
  });

  test('keeps the same ready surface visible while switching saved views in one source', async () => {
    const initial = description('view-switch');
    const firstView = initial.database.views[0];
    if (!firstView || !initial.source) throw new Error('view-switch fixture is incomplete');
    const secondView = {
      ...firstView,
      id: `${firstView.id}_secondary`,
      key: `${firstView.key}-secondary`,
      name: 'Second read model view',
    };
    const twoViewDescription: DatabaseDescription = {
      ...initial,
      database: DatabaseDefinitionSchema.parse({
        ...initial.database,
        views: [firstView, secondView],
      }),
    };
    let describeCalls = 0;
    let releaseSecondDescription: (() => void) | undefined;
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        describeCalls += 1;
        if (describeCalls === 1) return Promise.resolve(Response.json(twoViewDescription));
        return new Promise<Response>((resolve) => {
          releaseSecondDescription = () => resolve(Response.json(twoViewDescription));
        });
      }
      if (path === '/api/databases/query') {
        const body = JSON.parse(String(init?.body)) as { viewId?: string };
        const second = body.viewId === secondView.id;
        return Promise.resolve(
          Response.json({
            ...queryResult(initial.source.id),
            matched: 1,
            returned: 1,
            records: [
              {
                id: second ? 'rec_second_view' : 'rec_first_view',
                path: `read-model/${second ? 'second' : 'first'}.md`,
                revision,
                values: { prop_title: second ? 'Second view row' : 'First view row' },
              },
            ],
          }),
        );
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;
    const firstTarget: DatabaseReadModelTarget = {
      databaseId: initial.database.id,
      sourceId: initial.source.id,
      viewId: firstView.id,
      mode: 'inline',
    };
    const { rerender } = render(<Harness target={firstTarget} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').textContent).toContain('rec_first_view'),
    );
    const surface = screen.getByTestId('read-model-state');

    rerender(<Harness target={{ ...firstTarget, viewId: secondView.id }} />);
    await waitFor(() => {
      expect(screen.getByTestId('read-model-state')).toBe(surface);
      expect(surface.getAttribute('data-status')).toBe('ready');
      expect(surface.getAttribute('data-refreshing')).toBe('true');
      expect(surface.getAttribute('data-resolved-view')).toBe(firstView.id);
      expect(surface.textContent).toContain('rec_first_view');
    });

    act(() => releaseSecondDescription?.());
    await waitFor(() => {
      expect(surface.getAttribute('data-refreshing')).toBe('false');
      expect(surface.getAttribute('data-resolved-view')).toBe(secondView.id);
      expect(surface.textContent).toContain('rec_second_view');
    });
  });

  test('keeps the last ready snapshot after a failed refresh and clears the problem on retry', async () => {
    const initial = description('failed-refresh');
    let describeCalls = 0;
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        describeCalls += 1;
        if (describeCalls === 2) {
          return Promise.resolve(
            Response.json(
              {
                type: 'https://synapsenote.local/problems/stale-target',
                title: 'Database changed',
                status: 409,
                detail: 'The database changed while refreshing',
              },
              { status: 409 },
            ),
          );
        }
        return Promise.resolve(Response.json(initial));
      }
      if (path === '/api/databases/query') {
        return Promise.resolve(Response.json(queryResult(initial.source?.id ?? '')));
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;
    const target: DatabaseReadModelTarget = {
      databaseId: initial.database.id,
      sourceId: initial.source?.id ?? '',
      viewId: initial.database.views[0]?.id ?? '',
      mode: 'inline',
    };
    const { rerender } = render(<Harness target={target} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-status')).toBe('ready'),
    );
    const readySurface = screen.getByTestId('read-model-state');

    rerender(<Harness target={{ ...target, refreshKey: 1 }} />);
    await waitFor(() => {
      const surface = screen.getByTestId('read-model-state');
      expect(surface).toBe(readySurface);
      expect(surface.getAttribute('data-status')).toBe('ready');
      expect(surface.getAttribute('data-refreshing')).toBe('false');
      expect(surface.getAttribute('data-refresh-problem')).toBe('conflict');
      expect(surface.textContent).toContain(`${initial.database.id}:`);
    });

    rerender(<Harness target={{ ...target, refreshKey: 2 }} />);
    await waitFor(() => {
      const surface = screen.getByTestId('read-model-state');
      expect(surface).toBe(readySurface);
      expect(surface.getAttribute('data-status')).toBe('ready');
      expect(surface.getAttribute('data-refresh-problem')).toBeNull();
    });
  });

  test('re-reads on its own until a still-settling index resolves', async () => {
    const initial = description('settling-index');
    let describeCalls = 0;
    // Phase-driven, not call-indexed: once the refresh starts, fail exactly one
    // full in-read retry budget so the settling problem reaches the read model
    // instead of being absorbed inside a single read. That is the state a second
    // canonical commit produces. Counting absolute calls instead ties the
    // fixture to how many describes the initial mount happens to issue — when
    // that shifted, the window landed off by one, every failure was absorbed,
    // and the test asserted a state it could no longer reach.
    let settling = false;
    let settlingFailures = 0;
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        describeCalls += 1;
        if (settling && settlingFailures < DATABASE_READ_MAX_ATTEMPTS) {
          settlingFailures += 1;
          return Promise.resolve(
            Response.json(
              {
                type: 'https://synapsenote.local/problems/transaction-in-progress',
                title: 'Database is still updating',
                status: 409,
                detail: 'A canonical commit is still being verified',
                code: 'transaction_in_progress',
                retryable: true,
                recovery: { action: 'retry', retryAfterMs: 0 },
              },
              { status: 409 },
            ),
          );
        }
        return Promise.resolve(Response.json(initial));
      }
      if (path === '/api/databases/query') {
        return Promise.resolve(Response.json(queryResult(initial.source?.id ?? '')));
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;
    const target: DatabaseReadModelTarget = {
      databaseId: initial.database.id,
      sourceId: initial.source?.id ?? '',
      viewId: initial.database.views[0]?.id ?? '',
      mode: 'inline',
    };
    const { rerender } = render(<Harness target={target} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-status')).toBe('ready'),
    );

    const describesBeforeRefresh = describeCalls;
    settling = true;
    rerender(<Harness target={{ ...target, refreshKey: 1 }} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-refresh-problem')).toBe(
        'stale_index',
      ),
    );

    // No user action and no new refreshKey: the surface must recover by itself,
    // otherwise a committed edit stays hidden behind the recovery button.
    await waitFor(() => {
      const surface = screen.getByTestId('read-model-state');
      expect(surface.getAttribute('data-status')).toBe('ready');
      expect(surface.getAttribute('data-refresh-problem')).toBeNull();
    });
    // The budget was spent AND the surface re-read past it on its own — the
    // point of the test. Anchored to the pre-refresh count so it stays exact
    // however many describes the initial mount issues.
    expect(settlingFailures).toBe(DATABASE_READ_MAX_ATTEMPTS);
    expect(describeCalls).toBeGreaterThan(describesBeforeRefresh + DATABASE_READ_MAX_ATTEMPTS);
  });

  test('uses the blocking error state when the first read has no compatible snapshot', async () => {
    const initial = description('initial-failure');
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      if (String(input) === '/api/databases/describe') {
        return Promise.resolve(
          Response.json({ detail: 'Unable to describe database' }, { status: 500 }),
        );
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;

    render(
      <Harness
        target={{
          databaseId: initial.database.id,
          sourceId: initial.source?.id ?? '',
          viewId: initial.database.views[0]?.id ?? '',
          mode: 'inline',
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-status')).toBe('error'),
    );
  });

  test('keeps the current linked view visible while block-local settings reload', async () => {
    const initial = description('settings-refresh');
    let describeCalls = 0;
    let releaseSettingsRefresh: (() => void) | undefined;
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        describeCalls += 1;
        if (describeCalls === 1) return Promise.resolve(Response.json(initial));
        return new Promise<Response>((resolve) => {
          releaseSettingsRefresh = () => resolve(Response.json(initial));
        });
      }
      if (path === '/api/databases/query') {
        return Promise.resolve(Response.json(queryResult(initial.source?.id ?? '')));
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;
    const target: DatabaseReadModelTarget = {
      databaseId: initial.database.id,
      sourceId: initial.source?.id ?? '',
      viewId: initial.database.views[0]?.id ?? '',
      mode: 'inline',
    };
    const { rerender } = render(<Harness target={target} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-status')).toBe('ready'),
    );

    rerender(
      <Harness
        target={{
          ...target,
          viewOverrides: {
            projection: { propertyIds: ['prop_title'], body: 'hidden' },
          },
        }}
      />,
    );

    await waitFor(() => {
      const surface = screen.getByTestId('read-model-state');
      expect(surface.getAttribute('data-status')).toBe('ready');
      expect(surface.getAttribute('data-refreshing')).toBe('true');
      expect(surface.textContent).toContain(`${initial.database.id}:`);
    });
    act(() => releaseSettingsRefresh?.());
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-refreshing')).toBe('false'),
    );
  });

  test('keeps the current linked view visible while archived pages reload', async () => {
    const initial = description('archive-refresh');
    let describeCalls = 0;
    let releaseArchiveRefresh: (() => void) | undefined;
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        describeCalls += 1;
        if (describeCalls === 1) return Promise.resolve(Response.json(initial));
        return new Promise<Response>((resolve) => {
          releaseArchiveRefresh = () => resolve(Response.json(initial));
        });
      }
      if (path === '/api/databases/query') {
        return Promise.resolve(Response.json(queryResult(initial.source?.id ?? '')));
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;
    const target: DatabaseReadModelTarget = {
      databaseId: initial.database.id,
      sourceId: initial.source?.id ?? '',
      viewId: initial.database.views[0]?.id ?? '',
      mode: 'inline',
    };
    const { rerender } = render(<Harness target={target} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-status')).toBe('ready'),
    );

    rerender(<Harness target={{ ...target, showArchived: true }} />);

    await waitFor(() => {
      const surface = screen.getByTestId('read-model-state');
      expect(surface.getAttribute('data-status')).toBe('ready');
      expect(surface.getAttribute('data-refreshing')).toBe('true');
    });
    act(() => releaseArchiveRefresh?.());
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-refreshing')).toBe('false'),
    );
  });

  test('ignores an out-of-order response from an aborted target', async () => {
    const first = description('first');
    const second = description('second');
    let releaseFirst: (() => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        firstSignal ??= init?.signal as AbortSignal | undefined;
        const id = firstSignal === init?.signal ? first.database.id : second.database.id;
        if (id === first.database.id) {
          return new Promise<Response>((resolve) => {
            releaseFirst = () => resolve(Response.json(first));
          });
        }
        return Promise.resolve(Response.json(second));
      }
      if (path === '/api/databases/query') {
        return Promise.resolve(
          Response.json(queryResult(second.source?.id ?? first.source?.id ?? '')),
        );
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;
    const firstTarget: DatabaseReadModelTarget = {
      databaseId: first.database.id,
      sourceId: first.source?.id ?? '',
      viewId: first.database.views[0]?.id ?? '',
      mode: 'inline',
    };
    const secondTarget: DatabaseReadModelTarget = {
      databaseId: second.database.id,
      sourceId: second.source?.id ?? '',
      viewId: second.database.views[0]?.id ?? '',
      mode: 'inline',
    };
    const { rerender } = render(<Harness target={firstTarget} />);
    rerender(<Harness target={secondTarget} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').textContent).toContain(
        `${second.database.id}:`,
      ),
    );
    act(() => releaseFirst?.());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(firstSignal?.aborted).toBe(true);
    expect(screen.getByTestId('read-model-state').textContent).toContain(`${second.database.id}:`);
  });

  test('coalesces repeated refreshes and lets only the latest response win', async () => {
    const current = description('refresh-coalesce');
    let describeCalls = 0;
    const signals: AbortSignal[] = [];
    let releaseFirst: (() => void) | undefined;
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/databases/describe') {
        describeCalls += 1;
        const signal = init?.signal as AbortSignal;
        signals.push(signal);
        if (describeCalls === 1) return Promise.resolve(Response.json(current));
        if (describeCalls === 2) {
          return new Promise<Response>((resolve) => {
            releaseFirst = () => resolve(Response.json(current));
          });
        }
        return Promise.resolve(Response.json(current));
      }
      if (path === '/api/databases/query') {
        return Promise.resolve(Response.json(queryResult(current.source?.id ?? '')));
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;
    const target: DatabaseReadModelTarget = {
      databaseId: current.database.id,
      sourceId: current.source?.id ?? '',
      viewId: current.database.views[0]?.id ?? '',
      mode: 'inline',
    };
    const { rerender } = render(<Harness target={target} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').getAttribute('data-status')).toBe('ready'),
    );
    rerender(<Harness target={{ ...target, refreshKey: 1 }} />);
    rerender(<Harness target={{ ...target, refreshKey: 2 }} />);
    await waitFor(() => expect(describeCalls).toBe(3));
    expect(signals[1]?.aborted).toBe(true);
    act(() => releaseFirst?.());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('read-model-state').getAttribute('data-status')).toBe('ready');
    expect(signals[2]?.aborted).toBe(false);
  });

  test('appends a server-backed search page without replacing the first page', async () => {
    const initial = description('pagination');
    let queryCalls = 0;
    globalThis.fetch = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/databases/describe') return Promise.resolve(Response.json(initial));
      if (path === '/api/databases/query') {
        queryCalls += 1;
        const body = JSON.parse(String(init?.body)) as { query?: { page?: { cursor?: string } } };
        if (queryCalls === 1) {
          expect(body.query?.page?.cursor).toBeUndefined();
          return Promise.resolve(
            Response.json({
              ...queryResult(initial.source?.id ?? ''),
              matched: 2,
              returned: 1,
              isComplete: false,
              nextCursor: 'cursor-1',
              truncatedBy: 'page_limit',
              records: [
                {
                  id: 'rec_first',
                  path: 'read-model/first.md',
                  revision,
                  values: { prop_title: 'First result' },
                },
              ],
            }),
          );
        }
        expect(body.query?.page?.cursor).toBe('cursor-1');
        return Promise.resolve(
          Response.json({
            ...queryResult(initial.source?.id ?? ''),
            matched: 2,
            returned: 1,
            records: [
              {
                id: 'rec_second',
                path: 'read-model/second.md',
                revision,
                values: { prop_title: 'Second result' },
              },
            ],
          }),
        );
      }
      return Promise.resolve(Response.json({ detail: 'unexpected request' }, { status: 500 }));
    }) as typeof fetch;
    const target: DatabaseReadModelTarget = {
      databaseId: initial.database.id,
      sourceId: initial.source?.id ?? '',
      viewId: initial.database.views[0]?.id ?? '',
      mode: 'inline',
      search: 'result',
    };
    const { rerender } = render(<Harness target={target} />);
    await waitFor(() =>
      expect(screen.getByTestId('read-model-state').textContent).toContain('rec_first'),
    );
    rerender(<Harness target={{ ...target, pageCursor: 'cursor-1' }} />);
    await waitFor(() => {
      const text = screen.getByTestId('read-model-state').textContent ?? '';
      expect(text).toContain('rec_first,rec_second');
      expect(text.endsWith(':done')).toBe(true);
    });
  });
});
