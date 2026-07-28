import type {
  DatabaseCalculationFunction,
  DatabaseSelectOptionChange,
  DatabaseSelectOptionPreview,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import type {
  DatabaseButtonPlan,
  DatabaseDesiredStateDraftInput,
  DatabasePlanArtifact,
} from '@nedian0brien/synapsenote-server';
import { useEffect, useRef, useState } from 'react';
import type { DatabaseAgentScope } from '@/components/handoff/database-agent-scope';
import type { DatabaseImportInspection } from '@/lib/database-csv';
import type { DatabaseGhostState } from '@/lib/database-mutation-client';
import type { OfflineDatabaseMutation } from '@/lib/database-offline-mutation-queue';
import type { DatabaseSourceOnboardingTarget } from '@/lib/database-onboarding-client';
import type { DatabasePropertyDeletionPreview } from '@/lib/database-property-deletion';
import type { DatabaseUiProblem } from '@/lib/database-ui-problem';
import { useDatabaseRefreshScheduler } from '@/lib/use-database-refresh-scheduler';
import type { DatabaseTableSelection, DatabaseTableViewState } from './DatabaseTableGrid';

export interface UseDatabaseWorkspaceControllerStateOptions {
  initialDatabaseId?: string;
  initialSourceId?: string;
  initialViewId?: string;
  initialSelectedRecordIds?: readonly string[];
  restoreInitial?: boolean;
}

export function useDatabaseWorkspaceControllerState({
  initialDatabaseId,
  initialSourceId,
  initialViewId,
  initialSelectedRecordIds,
  restoreInitial = false,
}: UseDatabaseWorkspaceControllerStateOptions) {
  'use no memo';
  const [selection, setSelection] = useState<DatabaseTableSelection | null>(() =>
    initialDatabaseId && initialSourceId
      ? { databaseId: initialDatabaseId, sourceId: initialSourceId }
      : null,
  );
  const { refreshKey: refresh, setRefresh, refreshNow } = useDatabaseRefreshScheduler();
  const [ghost, setGhost] = useState<DatabaseGhostState | null>(null);
  const [mutationStatus, setMutationStatus] = useState<
    'idle' | 'planning' | 'review' | 'committing'
  >('idle');
  const [mutationReviewMode, setMutationReviewMode] = useState<'required' | 'automatic'>(
    'required',
  );
  const [mutationProgressVisible, setMutationProgressVisible] = useState(true);
  const [saveFeedback, setSaveFeedback] = useState<'saved' | 'queued' | 'failed' | null>(null);
  const [optimisticCellValues, setOptimisticCellValues] = useState<
    Map<string, DatabaseValue | undefined>
  >(() => new Map());
  const [recordPatches, setRecordPatches] = useState<
    Map<string, { record: ProjectedDatabaseRecord; snapshotRevision: string }>
  >(() => new Map());
  const [mutationError, setMutationError] = useState<DatabaseUiProblem | null>(null);
  const [mutationConflict, setMutationConflict] = useState<{
    plan: DatabasePlanArtifact;
    replan?: () => void;
  } | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<OfflineDatabaseMutation[]>([]);
  const [offlineQueueMessage, setOfflineQueueMessage] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [pageError, setPageError] = useState<DatabaseUiProblem | null>(null);
  const [pageCursor, setPageCursor] = useState<string | null>(null);
  const [newRecordOpen, setNewRecordOpen] = useState(false);
  const [newRecordTemplateId, setNewRecordTemplateId] = useState('__auto__');
  const [newRecordFocusRequest, setNewRecordFocusRequest] = useState<number | null>(null);
  const [creationOpen, setCreationOpen] = useState(false);
  const [creationInstanceKey, setCreationInstanceKey] = useState(0);
  const [creationPreview, setCreationPreview] = useState<DatabaseDesiredStateDraftInput | null>(
    null,
  );
  const [onboardingTarget, setOnboardingTarget] = useState<DatabaseSourceOnboardingTarget | null>(
    null,
  );
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [newRecordTitle, setNewRecordTitle] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(
    () => new Set(initialSelectedRecordIds ?? []),
  );
  const [bulkPropertyId, setBulkPropertyId] = useState('');
  const [bulkDraft, setBulkDraft] = useState('');
  const [relationCandidates, setRelationCandidates] = useState<ProjectedDatabaseRelationRecord[]>(
    [],
  );
  const [lastUndoToken, setLastUndoToken] = useState<string | null>(null);
  const [undoStatus, setUndoStatus] = useState<'idle' | 'checking' | 'applying'>('idle');
  const [lastRedoToken, setLastRedoToken] = useState<string | null>(null);
  const [redoStatus, setRedoStatus] = useState<'idle' | 'checking' | 'applying'>('idle');
  const [showArchived, setShowArchived] = useState(restoreInitial);
  const [moveRecord, setMoveRecord] = useState<ProjectedDatabaseRecord | null>(null);
  const [moveTargetSourceId, setMoveTargetSourceId] = useState('');
  const [tableCalculations, setTableCalculations] = useState<
    Record<string, DatabaseCalculationFunction>
  >({});
  const [selectedViewId, setSelectedViewId] = useState(initialViewId ?? '');
  const [agentScopeOverride, setAgentScopeOverride] = useState<DatabaseAgentScope | null>(null);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [optimisticViewOrder, setOptimisticViewOrder] = useState<readonly string[] | null>(null);
  const [draggedViewId, setDraggedViewId] = useState<string | null>(null);
  const [dragOverViewId, setDragOverViewId] = useState<string | null>(null);
  const [pageFavorite, setPageFavorite] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [pageTitleEditing, setPageTitleEditing] = useState(false);
  const [pageTitleDraft, setPageTitleDraft] = useState('');
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [propertyFilterTargetId, setPropertyFilterTargetId] = useState<string | null>(null);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [propertySortTargetId, setPropertySortTargetId] = useState<string | null>(null);
  const [viewManagerOpen, setViewManagerOpen] = useState(false);
  const [viewRenameTarget, setViewRenameTarget] = useState<DatabaseView | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [csvStatus, setCsvStatus] = useState<
    'idle' | 'exporting-current' | 'exporting-all' | 'exporting-json' | 'importing'
  >('idle');
  const [importPreview, setImportPreview] = useState<{
    filename: string;
    inspection: DatabaseImportInspection;
  } | null>(null);
  const [optionPropertyId, setOptionPropertyId] = useState('');
  const [optionId, setOptionId] = useState('');
  const [optionName, setOptionName] = useState('');
  const [optionColor, setOptionColor] = useState('');
  const [optionMergeTargetId, setOptionMergeTargetId] = useState('');
  const [selectOptionsOpen, setSelectOptionsOpen] = useState(false);
  const [optionStatus, setOptionStatus] = useState<'idle' | 'loading'>('idle');
  const [computedPropertyId, setComputedPropertyId] = useState<string | null>(null);
  const [uniqueIdPropertyId, setUniqueIdPropertyId] = useState<string | null>(null);
  const [placePropertyId, setPlacePropertyId] = useState<string | null>(null);
  const [buttonPropertyId, setButtonPropertyId] = useState<string | null>(null);
  const [conversionPropertyId, setConversionPropertyId] = useState<string | null>(null);
  const [propertiesDialogOpen, setPropertiesDialogOpen] = useState(false);
  const [propertiesDialogRenameId, setPropertiesDialogRenameId] = useState<string | null>(null);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [propertiesRemoveStatus, setPropertiesRemoveStatus] = useState<'idle' | 'loading'>('idle');
  const [propertyDeletionPreview, setPropertyDeletionPreview] =
    useState<DatabasePropertyDeletionPreview | null>(null);
  const [buttonPlan, setButtonPlan] = useState<DatabaseButtonPlan | null>(null);
  const [buttonStatus, setButtonStatus] = useState<'idle' | 'planning' | 'committing'>('idle');
  const [optionPreview, setOptionPreview] = useState<{
    change: DatabaseSelectOptionChange;
    preview: DatabaseSelectOptionPreview;
    desiredState: DatabaseDesiredStateDraftInput | null;
  } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const pageTitleInputRef = useRef<HTMLInputElement>(null);
  const initialCreationActionHandledRef = useRef(false);
  const reviewResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const handledInitialRecordActionRef = useRef<string | null>(null);
  const handledInitialTablePasteRef = useRef<string | null>(null);
  const handledInitialDatabaseSurfaceRef = useRef<string | null>(null);
  const handledInitialSelectedRecordIdsRef = useRef<string | null>(null);
  const selectedRecordIdsRef = useRef(selectedRecordIds);
  useEffect(() => {
    selectedRecordIdsRef.current = selectedRecordIds;
  }, [selectedRecordIds]);
  const handleSelectionChange = (next: Set<string>) => {
    selectedRecordIdsRef.current = next;
    setSelectedRecordIds(next);
  };
  const preserveSelectionOnRefreshRef = useRef(false);
  const queueReconciliationRunningRef = useRef(false);
  const locallyHandledRecordIdsRef = useRef(new Map<string, number>());
  const tableViewStatesRef = useRef(new Map<string, DatabaseTableViewState>());
  const [tableViewStates, setTableViewStates] = useState(
    () => new Map<string, DatabaseTableViewState>(),
  );

  return {
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
    buttonPropertyId,
    setButtonPropertyId,
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
  };
}
