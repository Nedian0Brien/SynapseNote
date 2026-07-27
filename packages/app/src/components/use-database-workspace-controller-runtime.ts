import { useLingui } from '@lingui/react/macro';
import { previewDatabaseSelectOptionChange } from '@nedian0brien/synapsenote-core';
import { useEffect } from 'react';
import { resolvePageCover, resolvePageIcon } from '@/components/page-header-utils';
import { getBranchSnapshot } from '@/lib/current-branch-store';
import { describeDatabase } from '@/lib/database-catalog-client';
import {
  createDatabaseBulkCellMutationDesiredState,
  createDatabaseBulkCheckboxToggleDesiredState,
  createDatabaseCellMutationDesiredState,
  createDatabaseDefaultViewChangeDesiredState,
  createDatabasePageAppearanceDesiredState,
  createDatabasePageTitleDesiredState,
  createDatabaseRecordArchiveDesiredState,
  createDatabaseRecordCopyDesiredState,
  createDatabaseRecordDeletionDesiredState,
  createDatabaseRecordDesiredState,
  createDatabaseRecordMoveDesiredState,
  createDatabaseSelectOptionChangeDesiredState,
  createDatabaseTablePasteDesiredState,
  createDatabaseViewConfigurationChangeDesiredState,
  rebaseQueuedDatabaseRecordMutations,
} from '@/lib/database-cell-mutation';
import {
  databaseDelimitedRecordIds,
  inspectDatabaseImport,
  planDatabaseDelimitedImport,
} from '@/lib/database-csv';
import { databaseSnapshotToJson } from '@/lib/database-json';
import {
  applyDatabaseUiRedo,
  applyDatabaseUiUndo,
  createDatabaseButtonPlan,
  createDatabaseVerificationPlan,
  DatabasePlanExecutionError,
  executeDatabaseButtonPlan,
  executeDatabaseUiMutation,
  executeReviewedDatabasePlan,
  previewDatabaseUiRedo,
  previewDatabaseUiUndo,
} from '@/lib/database-mutation-client';
import { databaseUiMutationReviewMode } from '@/lib/database-mutation-policy';
import { isDatabasePageFavorite } from '@/lib/database-navigation';
import { databaseOfflineCacheKey } from '@/lib/database-offline-cache';
import {
  createOfflineDatabaseMutation,
  enqueueOfflineDatabaseMutation,
  offlineDatabaseMutationStore,
  offlineQueueableRecordMutations,
  reconcileOfflineDatabaseMutations,
} from '@/lib/database-offline-mutation-queue';
import { useDatabasePresenceTarget, useRemoteDatabasePresence } from '@/lib/database-presence';
import { appendDatabaseQueryPage } from '@/lib/database-query-client';
import { databaseRecordsToTsv } from '@/lib/database-tsv';
import { classifyDatabaseUiProblem, databaseConflictProblem } from '@/lib/database-ui-problem';
import {
  databaseBrowserLoadedRecordLimit,
  databaseBrowserNextPageLimit,
} from '@/lib/database-view-bounds';
import { loadDatabaseLastOpenedView, saveDatabaseLastOpenedView } from '@/lib/database-view-state';
import { getServerInstanceId } from '@/lib/server-instance-store';
import { useDatabaseWorkspaceReadModel } from '@/lib/use-database-workspace-read-model';
import type { DatabaseSelectProperty, LoadStatus } from './DatabaseTableGrid';
import {
  downloadTextFile,
  isDatabaseSelectProperty,
  searchDatabaseRelationRecords,
} from './DatabaseTableGrid';
import { databaseTableAggregate } from './database-table-utils';
import type { DatabaseTableDialogProps } from './database-workspace-types';
import { useDatabaseWorkspaceControllerState } from './use-database-workspace-controller-state';
import { useDatabaseWorkspaceBulkCommands } from './useDatabaseWorkspaceBulkCommands';
import { useDatabaseWorkspaceMutationCommands } from './useDatabaseWorkspaceMutationCommands';
import { useDatabaseWorkspaceRecordCommands } from './useDatabaseWorkspaceRecordCommands';
import { useDatabaseWorkspaceSchemaCommands } from './useDatabaseWorkspaceSchemaCommands';
import { useDatabaseWorkspaceViewCommands } from './useDatabaseWorkspaceViewCommands';

export function useDatabaseWorkspaceController(props: DatabaseTableDialogProps) {
  'use no memo';
  const {
    open,
    onOpenChange,
    onOpenContextInspector,
    onOpenAgentRuns,
    onCreationCancelled,
    initialTarget,
    initialAction,
    creationExperience = 'admin',
    initialRecordAction,
    initialTablePaste,
    initialDatabaseSurface,
    initialViewAction,
    initialPropertyId,
    initialSelectedRecordIds,
    presentation = 'dialog',
  } = props;
  const { t } = useLingui();
  const isPagePresentation = presentation !== 'dialog';
  const isCanvasPresentation = presentation === 'canvas';
  const _WorkspaceBody = isPagePresentation ? 'div' : 'main';
  const itemNoun = isPagePresentation ? 'page' : 'record';
  const initialDatabaseId = initialTarget?.databaseId;
  const initialSourceId = initialTarget?.sourceId;
  const initialViewId = initialTarget?.viewId;
  const personLabels = { agent: t`agent`, inactive: t`inactive` };
  const workspaceState = useDatabaseWorkspaceControllerState({
    initialDatabaseId,
    initialSourceId,
    initialViewId,
    initialSelectedRecordIds,
    restoreInitial: initialRecordAction?.kind === 'restore',
  });
  const {
    selection,
    setSelection,
    refresh,
    setRefresh,
    refreshNow,
    ghost,
    setGhost,
    mutationStatus,
    setMutationStatus,
    mutationReviewMode,
    setMutationReviewMode,
    mutationProgressVisible,
    setMutationProgressVisible,
    saveFeedback,
    setSaveFeedback,
    optimisticCellValues,
    setOptimisticCellValues,
    recordPatches,
    setRecordPatches,
    mutationError,
    setMutationError,
    mutationConflict,
    setMutationConflict,
    offlineQueue,
    setOfflineQueue,
    offlineQueueMessage,
    setOfflineQueueMessage,
    pageStatus,
    setPageStatus,
    pageError,
    setPageError,
    pageCursor,
    setPageCursor,
    newRecordOpen,
    setNewRecordOpen,
    newRecordTemplateId,
    setNewRecordTemplateId,
    newRecordFocusRequest,
    setNewRecordFocusRequest,
    creationOpen,
    setCreationOpen,
    creationInstanceKey,
    setCreationInstanceKey,
    creationPreview,
    setCreationPreview,
    onboardingTarget,
    setOnboardingTarget,
    onboardingOpen,
    setOnboardingOpen,
    newRecordTitle,
    setNewRecordTitle,
    selectedRecordIds,
    setSelectedRecordIds,
    bulkPropertyId,
    setBulkPropertyId,
    bulkDraft,
    setBulkDraft,
    relationCandidates,
    setRelationCandidates,
    lastUndoToken,
    setLastUndoToken,
    undoStatus,
    setUndoStatus,
    lastRedoToken,
    setLastRedoToken,
    redoStatus,
    setRedoStatus,
    showArchived,
    setShowArchived,
    moveRecord,
    setMoveRecord,
    moveTargetSourceId,
    setMoveTargetSourceId,
    tableCalculations,
    setTableCalculations,
    selectedViewId,
    setSelectedViewId,
    agentScopeOverride,
    setAgentScopeOverride,
    agentMenuOpen,
    setAgentMenuOpen,
    optimisticViewOrder,
    setOptimisticViewOrder,
    draggedViewId,
    setDraggedViewId,
    dragOverViewId,
    setDragOverViewId,
    pageFavorite,
    setPageFavorite,
    appearanceOpen,
    setAppearanceOpen,
    pageTitleEditing,
    setPageTitleEditing,
    pageTitleDraft,
    setPageTitleDraft,
    filterDialogOpen,
    setFilterDialogOpen,
    propertyFilterTargetId,
    setPropertyFilterTargetId,
    viewSettingsOpen,
    setViewSettingsOpen,
    propertySortTargetId,
    setPropertySortTargetId,
    viewManagerOpen,
    setViewManagerOpen,
    viewRenameTarget,
    setViewRenameTarget,
    templatesOpen,
    setTemplatesOpen,
    automationsOpen,
    setAutomationsOpen,
    permissionsOpen,
    setPermissionsOpen,
    csvStatus,
    setCsvStatus,
    importPreview,
    setImportPreview,
    optionPropertyId,
    setOptionPropertyId,
    optionId,
    setOptionId,
    optionName,
    setOptionName,
    optionColor,
    setOptionColor,
    optionMergeTargetId,
    setOptionMergeTargetId,
    selectOptionsOpen,
    setSelectOptionsOpen,
    optionStatus,
    setOptionStatus,
    computedPropertyId,
    setComputedPropertyId,
    uniqueIdPropertyId,
    setUniqueIdPropertyId,
    placePropertyId,
    setPlacePropertyId,
    conversionPropertyId,
    setConversionPropertyId,
    propertiesDialogOpen,
    setPropertiesDialogOpen,
    propertiesDialogRenameId,
    setPropertiesDialogRenameId,
    propertiesError,
    setPropertiesError,
    propertiesRemoveStatus,
    setPropertiesRemoveStatus,
    propertyDeletionPreview,
    setPropertyDeletionPreview,
    buttonPlan,
    setButtonPlan,
    buttonStatus,
    setButtonStatus,
    optionPreview,
    setOptionPreview,
    csvInputRef,
    pageTitleInputRef,
    initialCreationActionHandledRef,
    reviewResolverRef,
    handledInitialRecordActionRef,
    handledInitialTablePasteRef,
    handledInitialDatabaseSurfaceRef,
    handledInitialSelectedRecordIdsRef,
    selectedRecordIdsRef,
    handleSelectionChange,
    preserveSelectionOnRefreshRef,
    queueReconciliationRunningRef,
    locallyHandledRecordIdsRef,
    tableViewStatesRef,
    tableViewStates,
    setTableViewStates,
  } = workspaceState;
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
  const candidates = workspaceRead.candidates;
  const catalogStatus = workspaceRead.catalogStatus;
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
  const error = readState.status === 'error' ? readState.problem : workspaceRead.catalogProblem;

  useEffect(() => {
    setRecordPatches((current) => (current.size === 0 ? current : new Map()));
    locallyHandledRecordIdsRef.current.clear();
  }, [locallyHandledRecordIdsRef, setRecordPatches]);

  // A canonical database page always has an active saved view when one is
  // available. The read model intentionally starts with an unscoped query so
  // it can hydrate the source description; resolve the persisted/default view
  // as soon as that description is ready, then let the read model re-query the
  // selected view. Keeping this transition here preserves the old workspace
  // contract without coupling the shared read model to page preferences.
  useEffect(() => {
    if (!open || !selection || !description?.source) return;
    const availableViewIds = description.database.views
      .filter((view) => view.sourceId === description.source?.id)
      .map((view) => view.id);
    if (selectedViewId && !availableViewIds.includes(selectedViewId)) {
      setSelectedViewId('');
      return;
    }
    if (selectedViewId || availableViewIds.length === 0) return;
    const preferredViewId =
      loadDatabaseLastOpenedView(selection.databaseId, selection.sourceId, availableViewIds) ??
      description.source.defaultViewId ??
      availableViewIds[0] ??
      '';
    if (!preferredViewId) return;
    setSelectedViewId(preferredViewId);
    if (isPagePresentation) {
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
    description?.source?.name ??
    description?.database.name ??
    (initialAction === 'create' ? t`New database` : t`Database`);
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
    setSelection({
      databaseId: initialDatabaseId,
      sourceId: initialSourceId,
    });
    setSelectedViewId(initialViewId ?? '');
  }, [open, initialDatabaseId, initialSourceId, initialViewId, setSelectedViewId, setSelection]);

  useEffect(() => {
    if (!open) {
      initialCreationActionHandledRef.current = false;
      // The creation dialog is a child surface. Clear its local state when
      // the parent route/modal closes so a canonical page transition cannot
      // leave the reviewed admin form portaled over the destination (and so a
      // later admin open always starts from a fresh form).
      setCreationOpen(false);
      return;
    }
    if (initialAction === 'create' && !initialCreationActionHandledRef.current) {
      initialCreationActionHandledRef.current = true;
      setCreationOpen(true);
    }
  }, [
    open,
    initialAction,
    setCreationOpen,
    initialCreationActionHandledRef.current,
    initialCreationActionHandledRef,
  ]);

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
  }, [pageTitleEditing, pageTitleInputRef.current?.focus]);

  // These small read-only projections are needed by command hooks that run
  // before the view command hook is assembled. The view hook recomputes and
  // returns the same projections for rendering; keeping this preflight copy
  // avoids a temporal dependency between independent command domains.
  const commandSelectProperties =
    description?.source?.properties.filter(isDatabaseSelectProperty) ?? [];
  const commandSelectedOptionProperty = commandSelectProperties.find(
    (property) => property.id === optionPropertyId,
  );
  const commandSelectedOption = commandSelectedOptionProperty?.options.find(
    (option) => option.id === optionId,
  );
  const commandCanonicalSourceViews =
    description?.database.views.filter((view) => view.sourceId === description.source?.id) ?? [];
  const commandSourceViews = optimisticViewOrder
    ? [
        ...optimisticViewOrder.flatMap((viewId) =>
          commandCanonicalSourceViews.filter((view) => view.id === viewId),
        ),
        ...commandCanonicalSourceViews.filter((view) => !optimisticViewOrder.includes(view.id)),
      ]
    : commandCanonicalSourceViews;
  const commandSelectedView = commandSourceViews.find((view) => view.id === selectedViewId);
  const commandOpenSelectOptions = (property: DatabaseSelectProperty) => {
    const firstOption = property.options[0];
    setOptionPropertyId(property.id);
    setOptionId(firstOption?.id ?? '');
    setOptionName(firstOption?.name ?? '');
    setOptionColor(firstOption?.color ?? '');
    setOptionMergeTargetId(
      property.options.find((option) => option.id !== firstOption?.id && option.archived !== true)
        ?.id ?? '',
    );
    setOptionPreview(null);
    setSelectOptionsOpen(true);
  };

  const mutationCommands = useDatabaseWorkspaceMutationCommands({
    open,
    reviewResolver: reviewResolverRef,
    setMutationStatus,
    description,
    searchDatabaseRelationRecords,
    setRelationCandidates,
    setMutationError,
    setMutationConflict,
    setOfflineQueueMessage,
    setSaveFeedback,
    setMutationProgressVisible,
    databaseUiMutationReviewMode,
    setMutationReviewMode,
    executeDatabaseUiMutation,
    setGhost,
    setLastUndoToken,
    setLastRedoToken,
    setSelectedRecordIds,
    setRefresh,
    setOptimisticCellValues,
    setRecordPatches,
    locallyHandledRecordIdsRef,
    selection,
    getBranchSnapshot,
    getServerInstanceId,
    offlineQueueableRecordMutations,
    createOfflineDatabaseMutation,
    enqueueOfflineDatabaseMutation,
    offlineDatabaseMutationStore,
    setOfflineQueue,
    queueReconciliationRunning: queueReconciliationRunningRef,
    offlineQueue,
    classifyDatabaseUiProblem,
    DatabasePlanExecutionError,
    reconcileOfflineDatabaseMutations,
    describeDatabase,
    rebaseQueuedDatabaseRecordMutations,
    databaseConflictProblem,
    createDatabaseViewConfigurationChangeDesiredState,
    createDatabaseDefaultViewChangeDesiredState,
    executeReviewedDatabasePlan,
    createDatabaseButtonPlan,
    executeDatabaseButtonPlan,
    buttonStatus,
    setButtonStatus,
    setButtonPlan,
    buttonPlan,
    mutationStatus,
  });
  const {
    finishReview,
    searchRelationCandidates,
    runMutation,
    runMarkdownTable,
    commitSavedViewConfiguration,
    commitDefaultViewChange,
    discardQueuedWrites,
    runReviewedPlan,
    planButton,
    planDatabaseActionButton,
    commitButton,
  } = mutationCommands;
  const recordCommands = useDatabaseWorkspaceRecordCommands({
    description,
    mutationStatus,
    setOptimisticCellValues,
    runMutation,
    runMarkdownTable,
    setMutationError,
    classifyDatabaseUiProblem,
    createDatabaseCellMutationDesiredState,
    createDatabaseVerificationPlan,
    setMutationStatus,
    executeReviewedDatabasePlan,
    reviewResolver: reviewResolverRef,
    setGhost,
    databaseConflictProblem,
    setLastUndoToken,
    setLastRedoToken,
    setRefresh,
    newRecordTitle,
    newRecordTemplateId,
    selectedView: commandSelectedView,
    tableCalculations,
    itemNoun,
    setNewRecordOpen,
    setNewRecordTitle,
    setNewRecordFocusRequest,
    setMoveRecord,
    setMoveTargetSourceId,
    moveRecord,
    moveTargetSourceId,
    createDatabaseRecordDesiredState,
    createDatabaseRecordDeletionDesiredState,
    createDatabaseRecordCopyDesiredState,
    createDatabaseRecordArchiveDesiredState,
    createDatabaseRecordMoveDesiredState,
    open,
    initialRecordAction,
    result,
    handledInitialRecordAction: handledInitialRecordActionRef,
  });
  const {
    editCell,
    createAndAssignSelectOption,
    reorderSelectOptions,
    changeVerification,
    createRecord,
    deleteRecord,
    duplicateRecord,
    changeArchiveState,
    planMove,
  } = recordCommands;
  const bulkCommands = useDatabaseWorkspaceBulkCommands({
    description,
    result,
    selectedRecordIds,
    bulkPropertyId,
    bulkDraft,
    setBulkDraft,
    setBulkPropertyId,
    setMutationError,
    classifyDatabaseUiProblem,
    mutationStatus,
    runMutation,
    createDatabaseBulkCellMutationDesiredState,
    createDatabaseBulkCheckboxToggleDesiredState,
    createDatabaseTablePasteDesiredState,
    relationCandidates,
    searchRelationCandidates,
    setSelectedRecordIds,
    setRefresh,
    selectedView: commandSelectedView,
    initialDatabaseSurface,
    initialViewAction,
    initialPropertyId,
    handledInitialDatabaseSurface: handledInitialDatabaseSurfaceRef,
    setPropertiesDialogRenameId,
    setPropertiesDialogOpen,
    openSelectOptions: commandOpenSelectOptions,
    setViewRenameTarget,
    commitDefaultViewChange,
    setViewManagerOpen,
    setFilterDialogOpen,
    setViewSettingsOpen,
    initialSelectedRecordIds,
    handledInitialSelectedRecordIds: handledInitialSelectedRecordIdsRef,
    selection,
    showArchived,
    csvStatus,
    setCsvStatus,
    databaseSnapshotToJson,
    initialTablePaste,
    handledInitialTablePaste: handledInitialTablePasteRef,
    open,
    databaseRecordsToTsv,
    downloadTextFile,
  });
  const {
    bulkProperty,
    planBulkEdit,
    planBulkCheckboxToggle,
    planTablePaste,
    planBoardTransition,
    planTimelineChange,
    planCalendarChange,
    copySelectedRecords,
    collectDatabaseSnapshot,
    exportDatabase,
  } = bulkCommands;
  const schemaCommands = useDatabaseWorkspaceSchemaCommands({
    selectedOption: commandSelectedOption,
    selectedOptionProperty: commandSelectedOptionProperty,
    optionName,
    optionColor,
    optionMergeTargetId,
    setOptionPreview,
    setOptionStatus,
    previewDatabaseSelectOptionChange,
    description,
    setMutationError,
    classifyDatabaseUiProblem,
    optionPreview,
    runMutation,
    createDatabaseSelectOptionChangeDesiredState,
    setPropertyDeletionPreview,
    setPropertiesError,
    setPropertiesRemoveStatus,
    propertiesRemoveStatus,
    mutationStatus,
    setMutationStatus,
    result,
    csvStatus,
    setCsvStatus,
    importPreview,
    setImportPreview,
    databaseDelimitedRecordIds,
    inspectDatabaseImport,
    planDatabaseDelimitedImport,
    databaseRecordsToTsv,
    databaseSnapshotToJson,
    downloadTextFile,
    setLastUndoToken,
    setLastRedoToken,
    lastUndoToken,
    lastRedoToken,
    applyDatabaseUiUndo,
    applyDatabaseUiRedo,
    previewDatabaseUiUndo,
    previewDatabaseUiRedo,
    executeDatabaseUiMutation,
    selection,
    runReviewedPlan,
    optionStatus,
    optionPropertyId,
    collectDatabaseSnapshot,
    selectedView: commandSelectedView,
    setPropertiesDialogOpen,
    setPropertiesDialogRenameId,
    undoStatus,
    setUndoStatus,
    setSelectedRecordIds,
    setRefresh,
    setOptimisticViewOrder,
    redoStatus,
    setRedoStatus,
  });
  const {
    prepareSelectOptionChange,
    planSelectOptionChange,
    addSchemaProperty,
    duplicateSchemaProperty,
    renameSchemaProperty,
    removeSchemaProperty,
    commitPropertyDeletionPreview,
    reorderSchemaProperties,
    inspectImportFile,
    commitImportPreview,
    undoLastChange,
    redoLastChange,
  } = schemaCommands;
  const viewCommands = useDatabaseWorkspaceViewCommands({
    description,
    selectedViewId,
    databaseBrowserLoadedRecordLimit,
    databaseBrowserNextPageLimit,
    pageStatus,
    setPageStatus,
    pageCursor,
    setPageCursor,
    result,
    appendDatabaseQueryPage,
    setRefresh,
    locallyHandledRecordIdsRef,
    mutationStatus,
    buttonStatus,
    isCanvasPresentation,
    optionId,
    optimisticViewOrder,
    selection,
    agentScopeOverride,
    setAgentScopeOverride,
    setOptionPreview,
    setFilterDialogOpen,
    setViewSettingsOpen,
    setViewManagerOpen,
    setPropertyDeletionPreview,
    setPropertiesDialogOpen,
    setSelectedRecordIds,
    saveDatabaseLastOpenedView,
    commitSavedViewConfiguration,
    commitDefaultViewChange,
    setAgentMenuOpen,
    setSelectedViewId,
    setTableCalculations,
    tableViewStatesRef,
    tableViewStateKey,
    tableCalculations,
    showArchived,
    pageTitleDraft,
    setPageTitleEditing,
    databasePageTitle,
    pageFavorite,
    setPageFavorite,
    setViewRenameTarget,
    setPageError,
    undoStatus,
    redoStatus,
    lastUndoToken,
    lastRedoToken,
    redoLastChange,
    undoLastChange,
    reviewResolver: reviewResolverRef,
    setGhost,
    setMutationStatus,
    setButtonPlan,
    setButtonStatus,
    setOptimisticViewOrder,
    setDraggedViewId,
    setDragOverViewId,
    catalogStatus,
    tableStatus,
    optionPropertyId,
    setOptionPropertyId,
    setOptionId,
    setOptionName,
    setOptionColor,
    setOptionMergeTargetId,
    setSelectOptionsOpen,
    computedPropertyId,
    uniqueIdPropertyId,
    placePropertyId,
    conversionPropertyId,
    selectedRecordIds,
    setPropertyFilterTargetId,
    setPropertySortTargetId,
    viewRenameTarget,
    setAppearanceOpen,
    setMutationError,
    runMutation,
    createDatabasePageTitleDesiredState,
    createDatabasePageAppearanceDesiredState,
    databaseConflictProblem,
    isPagePresentation,
    open,
    initialViewAction,
    initialPropertyId,
    initialDatabaseSurface,
    handledInitialDatabaseSurface: handledInitialDatabaseSurfaceRef,
    handledInitialSelectedRecordIds: handledInitialSelectedRecordIdsRef,
    initialSelectedRecordIds,
    preserveSelectionOnRefreshRef,
    initialAction,
    initialTarget,
    onOpenChange,
    setPageTitleDraft,
    pageTitleInputRef,
    setMoveRecord,
    moveRecord,
    editCell,
    createAndAssignSelectOption,
    reorderSelectOptions,
    changeVerification,
    deleteRecord,
    duplicateRecord,
    changeArchiveState,
    planTablePaste,
    searchRelationCandidates,
    planBoardTransition,
    planTimelineChange,
    planCalendarChange,
    setMoveTargetSourceId,
    createRecord,
    setComputedPropertyId,
    setUniqueIdPropertyId,
    setPlacePropertyId,
    setConversionPropertyId,
    onOpenContextInspector,
    onOpenAgentRuns,
    setPropertiesDialogRenameId,
  });
  const {
    loadedRecordLimit,
    loadMore,
    handleDatabaseShortcut,
    loading,
    selectProperties,
    selectedOptionProperty,
    selectedOption,
    selectedOptionTypeLabel,
    openSelectOptions,
    computedProperty,
    uniqueIdProperty,
    placeProperty,
    conversionProperty,
    sourceViews,
    selectedView,
    activeAgentScope,
    openDatabaseAgentScope,
    handleAgentMenuChange,
    selectView,
    handleSavedViewTabAction,
    reorderSavedViewTo,
    commitPageTitle,
    commitPageAppearance,
    reviewViewRename,
    openRecord,
    compatibleMoveTargets,
  } = viewCommands;
  const workspaceRenderContext = {
    open,
    presentation,
    isPagePresentation,
    isCanvasPresentation,
    onOpenChange,
    onOpenAgentRuns,
    onOpenContextInspector,
    onCreationCancelled,
    description,
    result,
    selection,
    selectedView,
    selectedViewId,
    sourceViews,
    candidates,
    catalogStatus,
    tableStatus,
    error,
    refreshProblem,
    offlineCachedAt,
    ghost,
    creationPreview,
    creationOpen,
    creationInstanceKey,
    onboardingOpen,
    setOnboardingOpen,
    onboardingTarget,
    setOnboardingTarget,
    mutationStatus,
    mutationReviewMode,
    mutationProgressVisible,
    mutationError,
    mutationConflict,
    pageError,
    saveFeedback,
    setMutationError,
    setMutationConflict,
    setRefresh,
    refreshNow,
    setSelection,
    setSelectedViewId,
    setTableCalculations,
    tableCalculations,
    tableViewStatesRef,
    tableViewStates,
    setTableViewStates,
    finishReview,
    scopedOfflineQueue,
    offlineQueueMessage,
    discardQueuedWrites,
    setCreationOpen,
    setCreationPreview,
    setCreationInstanceKey,
    setPageTitleDraft,
    setPageTitleEditing,
    setNewRecordTitle,
    setNewRecordOpen,
    setNewRecordTemplateId,
    newRecordOpen,
    newRecordTitle,
    newRecordTemplateId,
    createRecord,
    pageTitleEditing,
    databasePageTitle,
    pageTitleDraft,
    databasePageIcon,
    databasePageCover,
    pageTitleInputRef,
    commitPageTitle,
    commitPageAppearance,
    pageFavorite,
    setPageFavorite,
    setAppearanceOpen,
    appearanceOpen,
    activeAgentScope,
    agentMenuOpen,
    handleAgentMenuChange,
    openDatabaseAgentScope,
    setAgentMenuOpen,
    loading,
    selectedRecordIds,
    selectedRecordIdsRef,
    setSelectedRecordIds,
    handleSelectionChange,
    lastUndoToken,
    undoStatus,
    undoLastChange,
    lastRedoToken,
    redoStatus,
    redoLastChange,
    csvInputRef,
    csvStatus,
    inspectImportFile,
    exportDatabase,
    importPreview,
    setImportPreview,
    commitImportPreview,
    selectProperties,
    selectedOptionProperty,
    selectedOption,
    selectOptionsOpen,
    setSelectOptionsOpen,
    optionPropertyId,
    optionId,
    optionName,
    optionColor,
    optionMergeTargetId,
    optionStatus,
    selectedOptionTypeLabel,
    setOptionPropertyId,
    setOptionId,
    setOptionName,
    setOptionColor,
    setOptionMergeTargetId,
    setOptionPreview,
    prepareSelectOptionChange,
    optionPreview,
    planSelectOptionChange,
    moveRecord,
    setMoveRecord,
    moveTargetSourceId,
    setMoveTargetSourceId,
    compatibleMoveTargets,
    planMove,
    copySelectedRecords,
    bulkPropertyId,
    setBulkPropertyId,
    relationCandidates,
    personLabels,
    searchRelationCandidates,
    bulkProperty,
    bulkDraft,
    setBulkDraft,
    planBulkEdit,
    planBulkCheckboxToggle,
    filterDialogOpen,
    setFilterDialogOpen,
    propertyFilterTargetId,
    setPropertyFilterTargetId,
    viewSettingsOpen,
    setViewSettingsOpen,
    propertySortTargetId,
    setPropertySortTargetId,
    viewManagerOpen,
    setViewManagerOpen,
    viewRenameTarget,
    setViewRenameTarget,
    reviewViewRename,
    initialViewAction,
    templatesOpen,
    setTemplatesOpen,
    automationsOpen,
    setAutomationsOpen,
    permissionsOpen,
    setPermissionsOpen,
    propertiesDialogOpen,
    setPropertiesDialogOpen,
    propertiesDialogRenameId,
    setPropertiesDialogRenameId,
    propertiesError,
    setPropertiesError,
    propertiesRemoveStatus,
    propertyDeletionPreview,
    setPropertyDeletionPreview,
    commitPropertyDeletionPreview,
    computedProperty,
    computedPropertyId,
    setComputedPropertyId,
    uniqueIdProperty,
    uniqueIdPropertyId,
    setUniqueIdPropertyId,
    placeProperty,
    placePropertyId,
    setPlacePropertyId,
    conversionProperty,
    conversionPropertyId,
    setConversionPropertyId,
    buttonPlan,
    buttonStatus,
    setButtonPlan,
    planButton,
    planDatabaseActionButton,
    commitButton,
    planBoardTransition,
    planTimelineChange,
    planCalendarChange,
    planTablePaste,
    editCell,
    createAndAssignSelectOption,
    reorderSelectOptions,
    changeVerification,
    deleteRecord,
    duplicateRecord,
    changeArchiveState,
    openSelectOptions,
    optimisticCellValues,
    newRecordFocusRequest,
    tableViewStateKey,
    runMutation,
    runReviewedPlan,
    commitSavedViewConfiguration,
    selectView,
    draggedViewId,
    dragOverViewId,
    setDraggedViewId,
    setDragOverViewId,
    reorderSavedViewTo,
    handleSavedViewTabAction,
    addSchemaProperty,
    duplicateSchemaProperty,
    renameSchemaProperty,
    removeSchemaProperty,
    reorderSchemaProperties,
    openRecord,
    pageStatus,
    loadMore,
    loadedRecordLimit,
    remotePresence,
    showArchived,
    setShowArchived,
  };
  return {
    workspaceRenderContext,
    open,
    onOpenChange,
    onCreationCancelled,
    initialAction,
    creationExperience,
    presentation,
    isPagePresentation,
    isCanvasPresentation,
    databasePageCover,
    selection,
    selectedView,
    lastRedoToken,
    handleDatabaseShortcut,
  };
}
