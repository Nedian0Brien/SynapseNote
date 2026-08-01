import { useEffect } from 'react';
import { resolvePageCover, resolvePageIcon } from '@/components/page-header-utils';
import { isDatabasePageFavorite } from '@/lib/database-navigation';
import { databaseOfflineCacheKey } from '@/lib/database-offline-cache';
import { offlineDatabaseMutationStore } from '@/lib/database-offline-mutation-queue';
import { useDatabasePresenceTarget, useRemoteDatabasePresence } from '@/lib/database-presence';
import { classifyDatabaseUiProblem } from '@/lib/database-ui-problem';
import { loadDatabaseLastOpenedView, saveDatabaseLastOpenedView } from '@/lib/database-view-state';
import { useDatabaseWorkspaceReadModel } from '@/lib/use-database-workspace-read-model';
import { isDatabaseSelectProperty, type LoadStatus } from './DatabaseTableGrid';
import { databaseTableAggregate } from './database-table-utils';
import { resolveDatabaseWorkspaceSelectedViewId } from './database-workspace-controller-boundaries';
import type { DatabaseTableDialogProps } from './database-workspace-types';
import type { useDatabaseWorkspaceControllerState } from './use-database-workspace-controller-state';

type WorkspaceState = ReturnType<typeof useDatabaseWorkspaceControllerState>;

/** Owns source/catalog reads and their read-only workspace projections. */
export function useDatabaseWorkspaceReadLifecycle({
  props,
  state,
  isPagePresentation,
  isCanvasPresentation,
  defaultPageTitle,
}: {
  props: DatabaseTableDialogProps;
  state: WorkspaceState;
  isPagePresentation: boolean;
  isCanvasPresentation: boolean;
  defaultPageTitle: string;
}) {
  const { open, initialTarget, initialAction } = props;
  const {
    selection,
    setSelection,
    refresh,
    setRefresh,
    selectedViewId,
    setSelectedViewId,
    showArchived,
    tableCalculations,
    pageCursor,
    recordPatches,
    setRecordPatches,
    locallyHandledRecordIdsRef,
    setOptionPropertyId,
    setOptionId,
    setOptionName,
    setOptionColor,
    setOptionMergeTargetId,
    setOptionPreview,
    offlineQueue,
    filterDialogOpen,
    viewSettingsOpen,
    viewManagerOpen,
    selectOptionsOpen,
    templatesOpen,
    automationsOpen,
    permissionsOpen,
    propertyDeletionPreview,
    computedPropertyId,
    uniqueIdPropertyId,
    placePropertyId,
    buttonPropertyId,
    conversionPropertyId,
    mutationStatus,
    initialCreationActionHandledRef,
    setCreationOpen,
    setOfflineQueue,
    setMutationError,
    setPageCursor,
    setPageStatus,
    setPageError,
    saveFeedback,
    setSaveFeedback,
    setOptimisticCellValues,
    setPropertyDeletionPreview,
    setPageFavorite,
    pageTitleEditing,
    setPageTitleDraft,
    pageTitleInputRef,
  } = state;
  const offlineCacheKey = selection
    ? databaseOfflineCacheKey({
        ...selection,
        viewId: selectedViewId,
        showArchived,
        calculations: tableCalculations,
      })
    : null;
  const tableViewStateKey = `${selection?.sourceId ?? ''}:${selectedViewId || '__all__'}`;
  const workspaceRead = useDatabaseWorkspaceReadModel({
    open,
    canvas: isCanvasPresentation,
    selection,
    selectedViewId,
    showArchived,
    queryOverrides: {
      sort: [],
      aggregate: databaseTableAggregate(tableCalculations),
      page: { limit: 100 },
    },
    pageCursor,
    offlineCacheKey,
    refreshKey: refresh,
  });
  const { candidates, catalogStatus, catalogProblem } = workspaceRead;
  const readState = workspaceRead.state;
  const description = readState.status === 'ready' ? readState.description : null;
  const readResult = readState.status === 'ready' ? readState.result : null;
  const latestRecordPatch = [...recordPatches.values()].at(-1);
  const result =
    readResult && recordPatches.size > 0
      ? {
          ...readResult,
          snapshotRevision: latestRecordPatch?.snapshotRevision ?? readResult.snapshotRevision,
          records: readResult.records.map(
            (record) => recordPatches.get(record.id)?.record ?? record,
          ),
        }
      : readResult;
  const tableStatus: LoadStatus =
    readState.status === 'loading'
      ? 'loading'
      : readState.status === 'error'
        ? 'error'
        : readState.status === 'ready'
          ? 'success'
          : 'idle';
  const offlineCachedAt =
    readState.status === 'ready' && readState.stale ? (readState.cachedAt ?? null) : null;
  const refreshProblem = readState.status === 'ready' ? (readState.refreshProblem ?? null) : null;
  const error = readState.status === 'error' ? readState.problem : catalogProblem;
  const initialDatabaseId = initialTarget?.databaseId;
  const initialSourceId = initialTarget?.sourceId;
  const initialViewId = initialTarget?.viewId;

  useEffect(() => {
    setRecordPatches((current) => (current.size === 0 ? current : new Map()));
    locallyHandledRecordIdsRef.current.clear();
  }, [locallyHandledRecordIdsRef, setRecordPatches]);

  useEffect(() => {
    if (!open || !selection || !description?.source) return;
    const availableViewIds = description.database.views
      .filter((view) => view.sourceId === description.source?.id)
      .map((view) => view.id);
    const preferredViewId = resolveDatabaseWorkspaceSelectedViewId({
      selectedViewId,
      availableViewIds,
      persistedViewId: loadDatabaseLastOpenedView(
        selection.databaseId,
        selection.sourceId,
        availableViewIds,
      ),
      defaultViewId: description.source.defaultViewId,
    });
    if (preferredViewId === selectedViewId) return;
    setSelectedViewId(preferredViewId);
    if (!selectedViewId && preferredViewId && isPagePresentation) {
      saveDatabaseLastOpenedView(selection.databaseId, selection.sourceId, preferredViewId);
    }
  }, [description, isPagePresentation, open, selectedViewId, selection, setSelectedViewId]);

  useEffect(() => {
    if (!description?.source) return;
    const firstSelect = description.source.properties.find(isDatabaseSelectProperty);
    const firstOption = firstSelect?.options[0];
    setOptionPropertyId(firstSelect?.id ?? '');
    setOptionId(firstOption?.id ?? '');
    setOptionName(firstOption?.name ?? '');
    setOptionColor(firstOption?.color ?? '');
    setOptionMergeTargetId(
      firstSelect?.options.find(
        (option) => option.id !== firstOption?.id && option.archived !== true,
      )?.id ?? '',
    );
    setOptionPreview(null);
  }, [
    description,
    setOptionColor,
    setOptionMergeTargetId,
    setOptionPropertyId,
    setOptionPreview,
    setOptionName,
    setOptionId,
  ]);

  useEffect(() => {
    if (isCanvasPresentation || candidates.length === 0) return;
    setSelection((current) => {
      if (
        current &&
        candidates.some(
          (database) =>
            database.id === current.databaseId &&
            database.sources.some((source) => source.id === current.sourceId),
        )
      ) {
        return current;
      }
      const database = candidates[0];
      const source = database?.sources[0];
      return database && source ? { databaseId: database.id, sourceId: source.id } : null;
    });
  }, [candidates, isCanvasPresentation, setSelection]);

  const databasePageTitle =
    description?.source?.name ?? description?.database.name ?? defaultPageTitle;
  const databasePageIcon = resolvePageIcon(description?.database.icon);
  const databasePageCover = resolvePageCover(description?.database.cover);
  const scopedOfflineQueue = selection
    ? offlineQueue.filter(
        (item) => item.databaseId === selection.databaseId && item.sourceId === selection.sourceId,
      )
    : [];
  const remotePresence = useRemoteDatabasePresence();
  const schemaSurfaceOpen =
    filterDialogOpen ||
    viewSettingsOpen ||
    viewManagerOpen ||
    selectOptionsOpen ||
    templatesOpen ||
    automationsOpen ||
    permissionsOpen ||
    propertyDeletionPreview !== null ||
    computedPropertyId !== null ||
    uniqueIdPropertyId !== null ||
    placePropertyId !== null ||
    buttonPropertyId !== null ||
    conversionPropertyId !== null;
  useDatabasePresenceTarget(
    open && selection && (schemaSurfaceOpen || mutationStatus !== 'idle')
      ? {
          databaseId: selection.databaseId,
          sourceId: selection.sourceId,
          recordId: null,
          propertyId: null,
          viewId: selectedViewId || null,
          scope: 'schema',
          operation:
            mutationStatus === 'committing'
              ? 'committing'
              : mutationStatus === 'planning' || mutationStatus === 'review'
                ? 'planning'
                : 'editing',
        }
      : null,
  );

  useEffect(() => {
    if (!open || !initialDatabaseId || !initialSourceId) return;
    setSelection({ databaseId: initialDatabaseId, sourceId: initialSourceId });
    setSelectedViewId(initialViewId ?? '');
  }, [open, initialDatabaseId, initialSourceId, initialViewId, setSelectedViewId, setSelection]);

  useEffect(() => {
    if (!open) {
      initialCreationActionHandledRef.current = false;
      setCreationOpen(false);
      return;
    }
    if (initialAction === 'create' && !initialCreationActionHandledRef.current) {
      initialCreationActionHandledRef.current = true;
      setCreationOpen(true);
    }
  }, [open, initialAction, setCreationOpen, initialCreationActionHandledRef]);

  useEffect(() => {
    if (!open || typeof indexedDB === 'undefined') return;
    let active = true;
    void offlineDatabaseMutationStore
      .list()
      .then((items) => {
        if (active) setOfflineQueue(items);
      })
      .catch((cause: unknown) => {
        if (active) {
          setMutationError(
            classifyDatabaseUiProblem(cause, 'Unable to read queued database writes'),
          );
        }
      });
    return () => {
      active = false;
    };
  }, [open, setMutationError, setOfflineQueue]);

  useEffect(() => {
    if (!open) return;
    const handleOnline = () => setRefresh((current) => current + 1);
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [open, setRefresh]);

  useEffect(() => {
    setPageCursor(null);
    setPageStatus('idle');
    setPageError(null);
  }, [setPageStatus, setPageError, setPageCursor]);

  useEffect(() => {
    if (!saveFeedback) return;
    const timeout = window.setTimeout(() => setSaveFeedback(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [saveFeedback, setSaveFeedback]);

  useEffect(() => {
    if (readState.status === 'loading') {
      setPageStatus('loading');
      return;
    }
    if (readState.status === 'error') {
      setPageStatus('error');
      setPageError(readState.problem);
      return;
    }
    setPageStatus('idle');
    setPageError(null);
  }, [readState, setPageStatus, setPageError]);

  useEffect(() => {
    void open;
    void selection?.databaseId;
    void selection?.sourceId;
    void selectedViewId;
    setOptimisticCellValues(new Map());
    setRecordPatches(new Map());
    locallyHandledRecordIdsRef.current.clear();
    setPropertyDeletionPreview(null);
  }, [
    open,
    selection?.databaseId,
    selection?.sourceId,
    selectedViewId,
    setPropertyDeletionPreview,
    setOptimisticCellValues,
    setRecordPatches,
    locallyHandledRecordIdsRef,
  ]);

  useEffect(() => {
    const favoriteDatabaseId = selection?.databaseId;
    const favoriteSourceId = selection?.sourceId;
    if (!favoriteDatabaseId || !favoriteSourceId) {
      setPageFavorite(false);
      return;
    }
    setPageFavorite(
      isDatabasePageFavorite({ databaseId: favoriteDatabaseId, sourceId: favoriteSourceId }),
    );
  }, [selection, setPageFavorite]);

  useEffect(() => {
    if (!pageTitleEditing) setPageTitleDraft(databasePageTitle);
  }, [databasePageTitle, pageTitleEditing, setPageTitleDraft]);

  useEffect(() => {
    if (pageTitleEditing) pageTitleInputRef.current?.focus();
  }, [pageTitleEditing, pageTitleInputRef]);

  return {
    candidates,
    catalogStatus,
    description,
    result,
    tableStatus,
    error,
    offlineCachedAt,
    refreshProblem,
    tableViewStateKey,
    scopedOfflineQueue,
    remotePresence,
    databasePageTitle,
    databasePageIcon,
    databasePageCover,
  };
}
