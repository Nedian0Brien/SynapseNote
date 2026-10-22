import type { DatabaseCalculationFunction, DatabaseQuery } from '@nedian0brien/synapsenote-core';
import { useEffect, useState } from 'react';
import type { DatabaseCatalogCandidate } from './database-catalog-client';
import { fetchDatabaseCatalog } from './database-catalog-client';
import { cacheDatabaseCatalog, readCachedDatabaseCatalog } from './database-offline-cache';
import { type DatabaseReadModelState, useDatabaseReadModel } from './database-read-model';
import { classifyDatabaseUiProblem, type DatabaseUiProblem } from './database-ui-problem';

interface DatabaseWorkspaceSelection {
  databaseId: string;
  sourceId: string;
}

export interface DatabaseWorkspaceReadModelOptions {
  open: boolean;
  canvas: boolean;
  selection: DatabaseWorkspaceSelection | null;
  selectedViewId: string;
  showArchived: boolean;
  calculations?: Readonly<Record<string, DatabaseCalculationFunction>>;
  queryOverrides?: Pick<DatabaseQuery, 'sort' | 'aggregate' | 'page'>;
  pageCursor?: string | null;
  offlineCacheKey?: string | null;
  refreshKey: number;
}

export interface DatabaseWorkspaceReadModel {
  candidates: DatabaseCatalogCandidate[];
  catalogStatus: 'idle' | 'loading' | 'success' | 'error';
  catalogProblem: DatabaseUiProblem | null;
  state: DatabaseReadModelState;
}

/**
 * Canonical workspace read composition. Catalog discovery remains separate
 * from the selected source read, while description/query/retry/cache/stale
 * semantics are delegated to the same read model used by inline blocks.
 */
export function useDatabaseWorkspaceReadModel(
  options: DatabaseWorkspaceReadModelOptions,
): DatabaseWorkspaceReadModel {
  const [candidates, setCandidates] = useState<DatabaseCatalogCandidate[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [catalogProblem, setCatalogProblem] = useState<DatabaseUiProblem | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey intentionally retries catalog discovery when the user presses Retry.
  useEffect(() => {
    if (!options.open || options.canvas) return;
    const controller = new AbortController();
    setCatalogStatus('loading');
    setCatalogProblem(null);
    void fetchDatabaseCatalog({ signal: controller.signal })
      .then((catalog) => {
        if (controller.signal.aborted) return;
        cacheDatabaseCatalog(catalog.candidates);
        setCandidates(catalog.candidates);
        setCatalogStatus('success');
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const problem = classifyDatabaseUiProblem(cause, 'Unable to load databases');
        const cached = problem.kind === 'offline' ? readCachedDatabaseCatalog() : null;
        if (cached) setCandidates(cached.candidates);
        setCatalogProblem(problem);
        setCatalogStatus('error');
      });
    return () => controller.abort();
  }, [options.canvas, options.open, options.refreshKey]);

  const state = useDatabaseReadModel(
    options.open && options.selection
      ? {
          databaseId: options.selection.databaseId,
          sourceId: options.selection.sourceId,
          ...(options.selectedViewId ? { viewId: options.selectedViewId } : {}),
          mode: options.canvas ? 'full-page' : 'inline',
          showArchived: options.showArchived,
          pageCursor: options.pageCursor,
          ...(options.calculations ? { calculations: options.calculations } : {}),
          ...(options.queryOverrides ? { queryOverrides: options.queryOverrides } : {}),
          ...(options.offlineCacheKey ? { offlineCacheKey: options.offlineCacheKey } : {}),
          refreshKey: options.refreshKey,
        }
      : null,
  );

  return { candidates, catalogStatus, catalogProblem, state };
}
