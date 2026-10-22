import type {
  DatabaseCalculationFunction,
  DatabaseLinkedViewSettings,
  DatabaseQuery,
  DatabaseQueryResult,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { applyDatabaseLinkedViewSettings } from '@nedian0brien/synapsenote-core';
import { useEffect, useRef, useState } from 'react';
import { type DatabaseDescription, describeDatabase } from './database-catalog-client';
import { readDatabaseLinkedView, rememberDatabaseLinkedView } from './database-linked-view-cache';
import { cacheDatabaseSnapshot, readCachedDatabaseSnapshot } from './database-offline-cache';
import { appendDatabaseQueryPage, queryDatabase } from './database-query-client';
import {
  classifyDatabaseUiProblem,
  type DatabaseUiProblem,
  databaseProblemRetryAfterMs,
} from './database-ui-problem';

/**
 * Self-recovery budget for a read that lands on a still-settling index.
 *
 * `withDatabaseReadRetry` already absorbs the short window inside one read. A
 * second canonical commit can reopen that window after the in-read budget is
 * spent, which leaves the surface holding the last verified snapshot and a
 * problem the Data Plane marked recoverable. Nothing else re-reads, so without
 * this the user has to press the recovery action to see their own committed
 * edit. Retry a bounded number of times, then keep the visible action as the
 * final fallback.
 *
 * The budget is deliberately generous: verification is fast on an idle machine
 * but can take many seconds on a loaded one, and giving up early is exactly the
 * failure this exists to prevent. The delay cap keeps a condition that never
 * settles at a cheap slow poll rather than a spin, and the recoverable banner
 * with its explicit action stays visible for the whole window.
 */
const SETTLE_RETRY_MAX_ATTEMPTS = 8;
const SETTLE_RETRY_INITIAL_DELAY_MS = 250;
const SETTLE_RETRY_MAX_DELAY_MS = 3_000;

function isSelfRecoverableReadProblem(problem: DatabaseUiProblem): boolean {
  return problem.kind === 'stale_index' && problem.retryable;
}

export interface DatabaseReadModelTarget {
  databaseId: string;
  sourceId: string;
  /** A missing view ID means the source-level “all records/pages” view. */
  viewId?: string;
  viewOverrides?: DatabaseLinkedViewSettings;
  mode?: 'inline' | 'full-page';
  showArchived?: boolean;
  search?: string;
  /** Cursor for an additional page of the same server-side search/view query. */
  pageCursor?: string | null;
  /** Optional workspace-only query details; inline callers keep defaults. */
  queryOverrides?: Pick<DatabaseQuery, 'sort' | 'aggregate' | 'page'>;
  calculations?: Readonly<Record<string, DatabaseCalculationFunction>>;
  offlineCacheKey?: string | null;
  refreshKey?: number;
}

export type DatabaseReadModelState =
  | { status: 'loading' }
  | { status: 'error'; problem: DatabaseUiProblem }
  | {
      status: 'ready';
      description: DatabaseDescription;
      result: DatabaseQueryResult | null;
      /** Saved view that produced the visible result. It may trail the requested
       * view briefly while a same-source view transition is in flight. */
      resolvedViewId?: string;
      stale: boolean;
      refreshing: boolean;
      cachedAt?: number;
      /** A non-blocking failure from refreshing an already compatible surface. */
      refreshProblem?: DatabaseUiProblem;
    };

type DatabaseReadyReadModelState = Extract<DatabaseReadModelState, { status: 'ready' }>;

/** Remove presentation-only ordering before cache identity and server query. */
function databaseServerLinkedViewSettings(
  settings: DatabaseLinkedViewSettings | undefined,
): DatabaseLinkedViewSettings | undefined {
  if (!settings?.manualRecordIds) return settings;
  const serverSettings = { ...settings };
  delete serverSettings.manualRecordIds;
  return Object.keys(serverSettings).length > 0 ? serverSettings : undefined;
}

export function databaseLinkedViewCacheKey(input: DatabaseReadModelTarget): string {
  return [
    input.databaseId,
    input.sourceId,
    input.viewId,
    JSON.stringify(databaseServerLinkedViewSettings(input.viewOverrides) ?? null),
    input.mode ?? 'inline',
    input.showArchived ? 'archived' : 'active',
    input.search?.trim().toLocaleLowerCase() ?? '',
    input.pageCursor ?? '',
    JSON.stringify(input.queryOverrides ?? null),
  ].join('\0');
}

function databaseLinkedViewSurfaceKey(input: DatabaseReadModelTarget): string {
  return [input.databaseId, input.sourceId, input.mode ?? 'inline'].join('\0');
}

function databaseLinkedViewResultKey(input: DatabaseReadModelTarget): string {
  return [input.databaseId, input.sourceId, input.viewId ?? '__all__', input.mode ?? 'inline'].join(
    '\0',
  );
}

export function resolveDatabaseLinkedView(
  view: DatabaseView,
  settings?: DatabaseLinkedViewSettings,
): DatabaseView {
  try {
    return applyDatabaseLinkedViewSettings(view, settings);
  } catch {
    // A stale block-local projection must not blank the whole linked view.
    return view;
  }
}

function linkedViewProblem(cause: unknown): DatabaseUiProblem {
  const message =
    cause instanceof Error ? cause.message : 'Unable to load the linked database view';
  if (/linked database source no longer exists|linked saved view no longer exists/i.test(message)) {
    return { kind: 'missing', message, retryable: false };
  }
  return classifyDatabaseUiProblem(cause, message);
}

function isAbortError(cause: unknown): boolean {
  return (
    (cause instanceof DOMException && cause.name === 'AbortError') ||
    (cause instanceof Error && cause.name === 'AbortError')
  );
}

/**
 * Shared description/query state machine for inline blocks and the canonical
 * workspace. The hook intentionally exposes a read model, not setters: every
 * refresh is keyed, abortable, cache-aware, and stale-while-refresh.
 */
export function useDatabaseReadModel(
  target: DatabaseReadModelTarget | null,
): DatabaseReadModelState {
  const requestKey = target ? databaseLinkedViewCacheKey(target) : null;
  const [initial] = useState(() => {
    const cached = requestKey ? readDatabaseLinkedView(requestKey) : null;
    const surfaceKey = target ? databaseLinkedViewSurfaceKey(target) : null;
    const resultKey = target ? databaseLinkedViewResultKey(target) : null;
    const readyState: DatabaseReadyReadModelState | null = cached
      ? {
          status: 'ready',
          description: cached.description,
          result: cached.result,
          ...(target?.viewId ? { resolvedViewId: target.viewId } : {}),
          stale: false,
          refreshing: true,
          cachedAt: cached.touchedAt,
        }
      : null;
    return { cached, surfaceKey, resultKey, readyState };
  });
  const [state, setState] = useState<DatabaseReadModelState>(
    initial.readyState ?? { status: 'loading' },
  );
  const surfaceKeyRef = useRef<string | null>(initial.surfaceKey);
  const readyStateRef = useRef<{
    surfaceKey: string;
    state: DatabaseReadyReadModelState;
  } | null>(
    initial.readyState && initial.surfaceKey
      ? { surfaceKey: initial.surfaceKey, state: initial.readyState }
      : null,
  );
  const lastResultRef = useRef<{
    resultKey: string;
    search: string;
    description: DatabaseDescription;
    result: DatabaseQueryResult;
  } | null>(
    initial.cached?.result && initial.resultKey
      ? {
          resultKey: initial.resultKey,
          search: target?.search?.trim() ?? '',
          description: initial.cached.description,
          result: initial.cached.result,
        }
      : null,
  );
  const refreshKey = target?.refreshKey ?? 0;
  const [settleKey, setSettleKey] = useState(0);
  const settleAttemptRef = useRef(0);
  const settleScopeRef = useRef<string | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  // requestKey is the canonical serialized target identity. Depending on the
  // target object itself would restart the read on every parent render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: requestKey, refreshKey, and settleKey cover every target field and intentionally control this effect.
  useEffect(() => {
    const clearSettleTimer = () => {
      if (settleTimerRef.current === null) return;
      globalThis.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    };
    // A new target or an explicit user refresh starts a fresh recovery budget;
    // a settle retry of the same read keeps spending the current one.
    const settleScope = `${requestKey ?? ''}|${refreshKey}`;
    if (settleScopeRef.current !== settleScope) {
      settleScopeRef.current = settleScope;
      settleAttemptRef.current = 0;
    }
    const scheduleSettleRetry = (cause: unknown, problem: DatabaseUiProblem) => {
      if (!isSelfRecoverableReadProblem(problem)) return;
      if (settleAttemptRef.current >= SETTLE_RETRY_MAX_ATTEMPTS) return;
      const attempt = settleAttemptRef.current;
      settleAttemptRef.current = attempt + 1;
      const backoffMs = Math.min(
        SETTLE_RETRY_INITIAL_DELAY_MS * 2 ** attempt,
        SETTLE_RETRY_MAX_DELAY_MS,
      );
      // The Data Plane states how long the condition needs; honour it as a
      // floor so a retry does not spend the budget on the same answer.
      const serverDelayMs = databaseProblemRetryAfterMs(cause) ?? 0;
      clearSettleTimer();
      settleTimerRef.current = globalThis.setTimeout(
        () => {
          settleTimerRef.current = null;
          setSettleKey((current) => current + 1);
        },
        Math.min(Math.max(backoffMs, serverDelayMs), SETTLE_RETRY_MAX_DELAY_MS),
      );
    };
    if (!target || !requestKey) {
      surfaceKeyRef.current = null;
      readyStateRef.current = null;
      lastResultRef.current = null;
      settleAttemptRef.current = 0;
      clearSettleTimer();
      setState({ status: 'loading' });
      return;
    }
    const controller = new AbortController();
    const cacheKey = requestKey;
    const surfaceKey = databaseLinkedViewSurfaceKey(target);
    const resultKey = databaseLinkedViewResultKey(target);
    const search = target.search?.trim() ?? '';
    const pageCursor = target.pageCursor ?? undefined;
    const previousPage =
      pageCursor &&
      lastResultRef.current?.resultKey === resultKey &&
      lastResultRef.current.search === search &&
      lastResultRef.current.result.nextCursor === pageCursor
        ? lastResultRef.current
        : null;
    setState((current) =>
      current.status === 'ready' && surfaceKeyRef.current === surfaceKey
        ? { ...current, refreshing: true, refreshProblem: undefined }
        : { status: 'loading' },
    );
    surfaceKeyRef.current = surfaceKey;
    const effectiveOverrides = databaseServerLinkedViewSettings(target.viewOverrides);
    void describeDatabase(
      { databaseId: target.databaseId, sourceId: target.sourceId },
      { signal: controller.signal },
    )
      .then(async (description) => {
        if (controller.signal.aborted) return;
        if (!description.source || description.source.id !== target.sourceId) {
          throw new Error('The linked database source no longer exists');
        }
        const selectedView = target.viewId
          ? description.database.views.find(
              (view) => view.id === target.viewId && view.sourceId === target.sourceId,
            )
          : undefined;
        if (target.viewId && !selectedView) {
          throw new Error('The linked saved view no longer exists in this source');
        }
        const effectiveView = selectedView
          ? resolveDatabaseLinkedView(selectedView, effectiveOverrides)
          : undefined;
        const result =
          effectiveView?.layout.type === 'form' || effectiveView?.layout.type === 'dashboard'
            ? null
            : await queryDatabase(
                {
                  databaseId: target.databaseId,
                  sourceId: target.sourceId,
                  ...(target.viewId ? { viewId: target.viewId } : {}),
                  ...(effectiveOverrides ? { viewOverrides: effectiveOverrides } : {}),
                  query: {
                    ...(search ? { search } : {}),
                    ...(target.queryOverrides?.sort
                      ? { sort: target.queryOverrides.sort }
                      : { sort: [] }),
                    includeArchived: target.showArchived === true,
                    ...(target.queryOverrides?.aggregate
                      ? { aggregate: target.queryOverrides.aggregate }
                      : {}),
                    page: {
                      ...(target.queryOverrides?.page ?? {
                        limit: target.mode === 'inline' ? 25 : 100,
                      }),
                      ...(pageCursor ? { cursor: pageCursor } : {}),
                    },
                  },
                },
                { signal: controller.signal },
              );
        if (controller.signal.aborted) return;
        const mergedResult =
          previousPage && result ? appendDatabaseQueryPage(previousPage.result, result) : result;
        if (mergedResult) {
          lastResultRef.current = {
            resultKey,
            search,
            description,
            result: mergedResult,
          };
        }
        if (target.offlineCacheKey && mergedResult) {
          cacheDatabaseSnapshot(target.offlineCacheKey, {
            description,
            result: mergedResult,
          });
        }
        rememberDatabaseLinkedView(cacheKey, { description, result: mergedResult });
        const nextState: DatabaseReadyReadModelState = {
          status: 'ready',
          description,
          result: mergedResult,
          ...(target.viewId ? { resolvedViewId: target.viewId } : {}),
          stale: false,
          refreshing: false,
        };
        readyStateRef.current = { surfaceKey, state: nextState };
        // A verified read ends the settling window, so the next one starts with
        // a full recovery budget.
        settleAttemptRef.current = 0;
        clearSettleTimer();
        setState(nextState);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        const problem = linkedViewProblem(cause);
        // Authorization changes revoke the continuity contract. A previously
        // verified snapshot must not remain visible after the server denies
        // the current read, even when it came from the same source.
        if (problem.kind === 'permission') {
          readyStateRef.current = null;
          lastResultRef.current = null;
          setState({ status: 'error', problem });
          return;
        }
        const lastReady = readyStateRef.current;
        if (lastReady?.surfaceKey === surfaceKey) {
          const nextState: DatabaseReadyReadModelState = {
            ...lastReady.state,
            stale: true,
            refreshing: false,
            refreshProblem: problem,
          };
          readyStateRef.current = { surfaceKey, state: nextState };
          setState(nextState);
          // The surface is showing the last verified snapshot behind a
          // recoverable problem. Re-read so a commit that is still verifying
          // resolves on its own instead of stranding the user's own edit
          // behind the recovery action.
          scheduleSettleRetry(cause, problem);
          return;
        }
        const cached = readDatabaseLinkedView(cacheKey);
        if (cached && problem.kind === 'offline') {
          const nextState: DatabaseReadyReadModelState = {
            status: 'ready',
            description: cached.description,
            result: cached.result,
            stale: true,
            refreshing: false,
            cachedAt: cached.touchedAt,
          };
          readyStateRef.current = { surfaceKey, state: nextState };
          setState(nextState);
          return;
        }
        const offlineSnapshot = target.offlineCacheKey
          ? readCachedDatabaseSnapshot(target.offlineCacheKey)
          : null;
        if (offlineSnapshot && problem.kind === 'offline') {
          const nextState: DatabaseReadyReadModelState = {
            status: 'ready',
            description: offlineSnapshot.description,
            result: offlineSnapshot.result,
            stale: true,
            refreshing: false,
            cachedAt: offlineSnapshot.cachedAt,
          };
          readyStateRef.current = { surfaceKey, state: nextState };
          setState(nextState);
          return;
        }
        setState({ status: 'error', problem });
        scheduleSettleRetry(cause, problem);
      });
    return () => {
      controller.abort();
      clearSettleTimer();
    };
  }, [requestKey, refreshKey, settleKey]);

  return state;
}
