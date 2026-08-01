import type {
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseSourceMapping,
  DatabaseView,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useEffectEvent } from 'react';
import type { DatabasePageAppearance } from '@/components/DatabasePageAppearanceDialog';
import type { DatabaseViewTabAction } from '@/components/DatabaseViewTabMenu';
import type { DatabaseAgentScope } from '@/components/handoff/database-agent-scope';
import { subscribeToDatabaseAgentRunChanged } from '@/lib/database-agent-run-events';
import type { DatabaseDescription } from '@/lib/database-catalog-client';
import {
  createDatabasePageAppearanceDesiredState,
  createDatabasePageTitleDesiredState,
  createDatabaseViewLifecycleChangeDesiredState,
} from '@/lib/database-mutations/database-view-commands';
import {
  databasePageTargetToHash,
  navigateToDatabaseHash,
  navigateToDatabaseRecordPath,
} from '@/lib/database-navigation';
import { updateDatabaseRecordPeek } from '@/lib/database-overlay-store';
import { requestOpenDatabaseRecord } from '@/lib/database-record-open-command';
import { classifyDatabaseUiProblem } from '@/lib/database-ui-problem';
import {
  databaseBrowserLoadedRecordLimit,
  databaseBrowserNextPageLimit,
} from '@/lib/database-view-bounds';
import { duplicateDatabaseView } from '@/lib/database-view-lifecycle';
import { saveDatabaseLastOpenedView } from '@/lib/database-view-state';
import { subscribeToDatabaseChanged } from '@/lib/documents-events';
import type { DatabaseWorkspaceReadModel } from '@/lib/use-database-workspace-read-model';
import type { DatabaseSelectProperty, LoadStatus } from './DatabaseTableGrid';
import { databaseSchemaMutationPolicy, isDatabaseSelectProperty } from './DatabaseTableGrid';
import type { DatabaseTableDialogProps } from './database-workspace-types';
import type { useDatabaseWorkspaceControllerState } from './use-database-workspace-controller-state';
import type { useDatabaseWorkspaceMutationCommands } from './useDatabaseWorkspaceMutationCommands';

type DatabaseWorkspaceControllerState = ReturnType<typeof useDatabaseWorkspaceControllerState>;
type DatabaseWorkspaceMutationCommands = ReturnType<typeof useDatabaseWorkspaceMutationCommands>;

export interface DatabaseWorkspaceViewCommandsContext
  extends Pick<
    DatabaseWorkspaceControllerState,
    | 'selectedViewId'
    | 'pageStatus'
    | 'setPageStatus'
    | 'setPageCursor'
    | 'setRefresh'
    | 'locallyHandledRecordIdsRef'
    | 'mutationStatus'
    | 'optionId'
    | 'optimisticViewOrder'
    | 'selection'
    | 'agentScopeOverride'
    | 'setAgentMenuOpen'
    | 'setSelectedViewId'
    | 'setTableCalculations'
    | 'setFilterDialogOpen'
    | 'setViewSettingsOpen'
    | 'setViewManagerOpen'
    | 'setSelectedRecordIds'
    | 'pageTitleDraft'
    | 'setPageTitleEditing'
    | 'setMutationError'
    | 'setViewRenameTarget'
    | 'setPageError'
    | 'undoStatus'
    | 'redoStatus'
    | 'lastUndoToken'
    | 'lastRedoToken'
    | 'setGhost'
    | 'setMutationStatus'
    | 'setButtonPlan'
    | 'setButtonStatus'
    | 'setOptimisticViewOrder'
    | 'setDraggedViewId'
    | 'setDragOverViewId'
    | 'optionPropertyId'
    | 'setOptionPropertyId'
    | 'setOptionId'
    | 'setOptionName'
    | 'setOptionColor'
    | 'setOptionMergeTargetId'
    | 'setOptionPreview'
    | 'setSelectOptionsOpen'
    | 'computedPropertyId'
    | 'uniqueIdPropertyId'
    | 'placePropertyId'
    | 'buttonPropertyId'
    | 'conversionPropertyId'
    | 'selectedRecordIds'
    | 'setAgentScopeOverride'
    | 'setPropertyFilterTargetId'
    | 'setPropertySortTargetId'
    | 'viewRenameTarget'
    | 'setAppearanceOpen'
    | 'preserveSelectionOnRefreshRef'
  > {
  description: DatabaseDescription | null;
  result: DatabaseQueryResult | null;
  commitDefaultViewChange: DatabaseWorkspaceMutationCommands['commitDefaultViewChange'];
  databasePageTitle: string;
  runMutation: DatabaseWorkspaceMutationCommands['runMutation'];
  isPagePresentation: boolean;
  open: boolean;
  onOpenChange: DatabaseTableDialogProps['onOpenChange'];
  redoLastChange: () => void;
  undoLastChange: () => void;
  reviewResolver: DatabaseWorkspaceControllerState['reviewResolverRef'];
  catalogStatus: DatabaseWorkspaceReadModel['catalogStatus'];
  tableStatus: LoadStatus;
}

export function useDatabaseWorkspaceViewCommands(
  context: DatabaseWorkspaceViewCommandsContext & Record<string, unknown>,
) {
  const {
    description,
    selectedViewId,
    pageStatus,
    setPageStatus,
    setPageCursor,
    result,
    setRefresh,
    locallyHandledRecordIdsRef,
    mutationStatus,
    optionId,
    optimisticViewOrder,
    selection,
    agentScopeOverride,
    setAgentMenuOpen,
    setSelectedViewId,
    setTableCalculations,
    setFilterDialogOpen,
    setViewSettingsOpen,
    setViewManagerOpen,
    setSelectedRecordIds,
    commitDefaultViewChange,
    pageTitleDraft,
    setPageTitleEditing,
    databasePageTitle,
    setMutationError,
    runMutation,
    isPagePresentation,
    open,
    preserveSelectionOnRefreshRef,
    onOpenChange,
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
    setOptionPreview,
    setSelectOptionsOpen,
    computedPropertyId,
    uniqueIdPropertyId,
    placePropertyId,
    buttonPropertyId,
    conversionPropertyId,
    selectedRecordIds,
    setAgentScopeOverride,
    setPropertyFilterTargetId,
    setPropertySortTargetId,
    viewRenameTarget,
    setAppearanceOpen,
  } = context;

  const requestedViewLayout = description?.database.views.find(
    (view: DatabaseView) => view.id === selectedViewId,
  )?.layout.type;
  const loadedRecordLimit = databaseBrowserLoadedRecordLimit(requestedViewLayout);

  const loadMore = () => {
    if (!selection || !result?.nextCursor || pageStatus === 'loading') return;
    const nextPageLimit = databaseBrowserNextPageLimit(requestedViewLayout, result.records.length);
    if (nextPageLimit === 0) return;
    setPageStatus('loading');
    setPageError(null);
    setPageCursor(result.nextCursor);
  };
  const handleDatabaseShortcut = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    const isUndo = key === 'z' && !event.shiftKey;
    const isRedo = (key === 'z' && event.shiftKey) || key === 'y';
    if (!isUndo && !isRedo) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT')
    ) {
      return;
    }
    if (
      mutationStatus !== 'idle' ||
      undoStatus !== 'idle' ||
      redoStatus !== 'idle' ||
      (isUndo && !lastUndoToken) ||
      (isRedo && !lastRedoToken)
    ) {
      return;
    }
    event.preventDefault();
    if (isRedo) redoLastChange();
    else if (lastUndoToken) undoLastChange();
  };

  useEffect(() => {
    if (!open) return;
    return subscribeToDatabaseChanged((payload) => {
      const now = Date.now();
      const locallyHandledRecordChange =
        payload.scope === 'records' &&
        payload.affectedIdsComplete &&
        payload.recordIds.length > 0 &&
        payload.recordIds.every((recordId) => {
          const startedAt = locallyHandledRecordIdsRef.current.get(recordId);
          return startedAt !== undefined && now - startedAt < 5_000;
        });
      if (locallyHandledRecordChange) {
        for (const recordId of payload.recordIds) {
          locallyHandledRecordIdsRef.current.delete(recordId);
        }
        return;
      }
      if (
        payload.scope === 'workspace' ||
        !selection ||
        payload.databaseIds.includes(selection.databaseId)
      ) {
        setPageCursor(null);
        setRefresh((value: number) => value + 1);
      }
    });
  }, [locallyHandledRecordIdsRef, open, selection, setPageCursor, setRefresh]);

  useEffect(() => {
    if (!open) return;
    return subscribeToDatabaseAgentRunChanged((detail) => {
      if (
        !selection ||
        detail.databaseIds.length === 0 ||
        detail.databaseIds.includes(selection.databaseId)
      ) {
        preserveSelectionOnRefreshRef.current = true;
        setPageCursor(null);
        setRefresh((value: number) => value + 1);
      }
    });
  }, [open, selection, preserveSelectionOnRefreshRef, setPageCursor, setRefresh]);

  useEffect(() => {
    if (open) return;
    reviewResolverRef.current?.(false);
    reviewResolverRef.current = null;
    setGhost(null);
    setMutationStatus('idle');
    setButtonPlan(null);
    setButtonStatus('idle');
    setSelectedRecordIds(new Set());
    setOptimisticViewOrder(null);
    setDraggedViewId(null);
    setDragOverViewId(null);
  }, [
    open,
    setOptimisticViewOrder,
    setSelectedRecordIds,
    setDraggedViewId,
    setMutationStatus,
    setDragOverViewId,
    setButtonStatus,
    setGhost,
    setButtonPlan,
    reviewResolverRef,
  ]);

  const loading = catalogStatus === 'loading' || tableStatus === 'loading';
  const selectProperties = description?.source?.properties.filter(isDatabaseSelectProperty) ?? [];
  const selectedOptionProperty = selectProperties.find(
    (property: DatabaseSelectProperty) => property.id === optionPropertyId,
  );
  const selectedOption = selectedOptionProperty?.options.find(
    (option: DatabaseSelectProperty['options'][number]) => option.id === optionId,
  );
  const selectedOptionTypeLabel =
    selectedOptionProperty?.type === 'multi_select' ? 'Multi-select' : 'Select';
  const openSelectOptions = useEffectEvent((property: DatabaseSelectProperty) => {
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
  });
  const computedProperty = description?.source?.properties.find(
    (
      property: DatabaseProperty,
    ): property is Extract<DatabaseProperty, { type: 'formula' | 'rollup' }> =>
      property.id === computedPropertyId &&
      (property.type === 'formula' || property.type === 'rollup'),
  );
  const uniqueIdProperty = description?.source?.properties.find(
    (property: DatabaseProperty): property is Extract<DatabaseProperty, { type: 'unique_id' }> =>
      property.id === uniqueIdPropertyId && property.type === 'unique_id',
  );
  const placeProperty = description?.source?.properties.find(
    (property: DatabaseProperty): property is Extract<DatabaseProperty, { type: 'place' }> =>
      property.id === placePropertyId && property.type === 'place',
  );
  const buttonProperty = description?.source?.properties.find(
    (property: DatabaseProperty): property is Extract<DatabaseProperty, { type: 'button' }> =>
      property.id === buttonPropertyId && property.type === 'button',
  );
  const conversionProperty = description?.source?.properties.find(
    (property: DatabaseProperty) => property.id === conversionPropertyId,
  );
  const canonicalSourceViews =
    description?.database.views.filter(
      (view: DatabaseView) => view.sourceId === description.source?.id,
    ) ?? [];
  const sourceViews = optimisticViewOrder
    ? [
        ...optimisticViewOrder.flatMap((viewId: string) =>
          canonicalSourceViews.filter((view: DatabaseView) => view.id === viewId),
        ),
        ...canonicalSourceViews.filter(
          (view: DatabaseView) => !optimisticViewOrder.includes(view.id),
        ),
      ]
    : canonicalSourceViews;
  const selectedView = sourceViews.find((view: DatabaseView) => view.id === selectedViewId);
  const defaultAgentScope: DatabaseAgentScope | null = selection
    ? {
        databaseId: selection.databaseId,
        sourceId: selection.sourceId,
        ...(selectedView?.id ? { viewId: selectedView.id } : {}),
        ...(selectedRecordIds.size > 0 ? { recordIds: [...selectedRecordIds] } : {}),
      }
    : null;
  const activeAgentScope = agentScopeOverride ?? defaultAgentScope;
  const openDatabaseAgentScope = (scope: DatabaseAgentScope) => {
    setAgentScopeOverride(scope);
    setAgentMenuOpen(true);
  };
  const handleAgentMenuChange = (nextOpen: boolean) => {
    setAgentMenuOpen(nextOpen);
    if (!nextOpen) setAgentScopeOverride(null);
  };
  const selectView = (viewId: string) => {
    const nextViewId = viewId === '__all__' ? '' : viewId;
    setPageCursor(null);
    setSelectedViewId(nextViewId);
    saveDatabaseLastOpenedView(
      description?.database.id ?? '',
      description?.source?.id ?? selection?.sourceId ?? '',
      nextViewId,
    );
    if (isPagePresentation && selection) {
      navigateToDatabaseHash(
        databasePageTargetToHash({
          databaseId: selection.databaseId,
          sourceId: selection.sourceId,
          ...(nextViewId ? { viewId: nextViewId } : {}),
        }),
      );
    }
    setFilterDialogOpen(false);
    setViewSettingsOpen(false);
    setPropertyFilterTargetId(null);
    setPropertySortTargetId(null);
    setTableCalculations({});
  };
  const commitSavedViewLifecycleChange = (
    change: Parameters<typeof createDatabaseViewLifecycleChangeDesiredState>[0]['change'],
    idempotencyPrefix: string,
  ): boolean => {
    if (!description?.source || mutationStatus !== 'idle') return false;
    try {
      runMutation(
        createDatabaseViewLifecycleChangeDesiredState({
          database: description.database,
          source: description.source,
          change,
        }),
        `ui-view-${idempotencyPrefix}`,
        'Saved view change failed',
        change.kind === 'delete'
          ? undefined
          : { policy: { operation: 'view', actor: 'human', principalId: 'user:local' } },
      );
      return true;
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare saved view change'));
      return false;
    }
  };
  const handleSavedViewTabAction = (view: DatabaseView, action: DatabaseViewTabAction) => {
    switch (action) {
      case 'filters':
        setFilterDialogOpen(true);
        return;
      case 'settings':
        setViewSettingsOpen(true);
        return;
      case 'rename':
        setViewRenameTarget(view);
        return;
      case 'duplicate':
        commitSavedViewLifecycleChange(
          {
            kind: 'duplicate',
            view: duplicateDatabaseView({
              view,
              existingViews: sourceViews,
              uuid: crypto.randomUUID(),
            }),
          },
          'duplicate',
        );
        return;
      case 'favorite':
        commitSavedViewLifecycleChange(
          { kind: 'favorite', viewId: view.id, favorite: view.favorite !== true },
          'favorite',
        );
        return;
      case 'move-left':
        reorderSavedView(view.id, -1);
        return;
      case 'move-right':
        reorderSavedView(view.id, 1);
        return;
      case 'make-default':
        commitDefaultViewChange(view.id);
        return;
      case 'clear-default':
        commitDefaultViewChange();
        return;
      case 'delete':
        commitSavedViewLifecycleChange({ kind: 'delete', viewId: view.id }, 'delete');
        return;
      case 'manage':
        setViewManagerOpen(true);
        return;
    }
  };
  const reviewViewRename = (name: string) => {
    if (!viewRenameTarget) return;
    if (
      commitSavedViewLifecycleChange(
        { kind: 'rename', viewId: viewRenameTarget.id, name },
        'rename',
      )
    ) {
      setViewRenameTarget(null);
    }
  };
  const reorderSavedView = (viewId: string, direction: -1 | 1) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    const currentIndex = sourceViews.findIndex((view: DatabaseView) => view.id === viewId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sourceViews.length) return;
    const nextOrder = sourceViews.map((view: DatabaseView) => view.id);
    const [moving] = nextOrder.splice(currentIndex, 1);
    if (moving) nextOrder.splice(targetIndex, 0, moving);
    setOptimisticViewOrder(nextOrder);
    try {
      runMutation(
        createDatabaseViewLifecycleChangeDesiredState({
          database: description.database,
          source: description.source,
          change: { kind: 'reorder', viewId, direction },
        }),
        'ui-view-reorder',
        'Saved view reorder failed',
        {
          policy: { operation: 'view', actor: 'human', principalId: 'user:local' },
          onNotCommitted: () => setOptimisticViewOrder(null),
          onFailed: () => setOptimisticViewOrder(null),
        },
      );
    } catch (cause) {
      setOptimisticViewOrder(null);
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare saved view reorder'));
    }
  };
  const reorderSavedViewTo = (viewId: string, targetViewId: string) => {
    if (
      !description?.source ||
      mutationStatus !== 'idle' ||
      viewId === targetViewId ||
      !sourceViews.some((view: DatabaseView) => view.id === viewId) ||
      !sourceViews.some((view: DatabaseView) => view.id === targetViewId)
    ) {
      return;
    }
    const currentIndex = sourceViews.findIndex((view: DatabaseView) => view.id === viewId);
    const targetIndex = sourceViews.findIndex((view: DatabaseView) => view.id === targetViewId);
    if (currentIndex < 0 || targetIndex < 0) return;
    const nextOrder = sourceViews.map((view: DatabaseView) => view.id);
    const [moving] = nextOrder.splice(currentIndex, 1);
    if (moving) nextOrder.splice(targetIndex, 0, moving);
    setOptimisticViewOrder(nextOrder);
    try {
      runMutation(
        createDatabaseViewLifecycleChangeDesiredState({
          database: description.database,
          source: description.source,
          change: { kind: 'reorder-to', viewId, targetViewId },
        }),
        'ui-view-reorder-drag',
        'Saved view reorder failed',
        {
          policy: { operation: 'view', actor: 'human', principalId: 'user:local' },
          onNotCommitted: () => setOptimisticViewOrder(null),
          onFailed: () => setOptimisticViewOrder(null),
        },
      );
    } catch (cause) {
      setOptimisticViewOrder(null);
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare saved view reorder'));
    }
    setDraggedViewId(null);
    setDragOverViewId(null);
  };
  const commitPageTitle = () => {
    if (!description?.source || mutationStatus !== 'idle') return;
    const nextTitle = pageTitleDraft.trim();
    if (!nextTitle) {
      setMutationError(
        classifyDatabaseUiProblem(new Error('A database page title is required'), 'Rename failed'),
      );
      return;
    }
    if (nextTitle === databasePageTitle) {
      setPageTitleEditing(false);
      return;
    }
    try {
      runMutation(
        createDatabasePageTitleDesiredState({
          database: description.database,
          source: description.source,
          name: nextTitle,
        }),
        'ui-database-page-title',
        'Database page rename failed',
        {
          policy: { operation: 'title', actor: 'human', principalId: 'user:local' },
          onCommitted: () => setPageTitleEditing(false),
        },
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the page rename'));
    }
  };
  const commitPageAppearance = (appearance: DatabasePageAppearance) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    // Close the editor before the schema mutation enters review so the parent
    // page's ghost proposal and its explicit commit controls remain visible.
    setAppearanceOpen(false);
    try {
      runMutation(
        createDatabasePageAppearanceDesiredState({
          database: description.database,
          source: description.source,
          icon: appearance.icon,
          cover: appearance.cover,
        }),
        'ui-database-page-appearance',
        'Database page appearance update failed',
        {
          policy: databaseSchemaMutationPolicy,
          onCommitted: () => setAppearanceOpen(false),
        },
      );
    } catch (cause) {
      setMutationError(
        classifyDatabaseUiProblem(cause, 'Unable to prepare the page appearance update'),
      );
    }
  };
  const openRecord = (record: ProjectedDatabaseRecord) => {
    if (!description?.source || !selection) return;
    const outcome = requestOpenDatabaseRecord({
      database: description.database,
      source: description.source,
      view: selectedView,
      record,
      recordPaths: result?.records.map((item: ProjectedDatabaseRecord) => item.path) ?? [],
      origin: 'workspace',
      notionSurface: isPagePresentation,
      onNavigateRecord: (path) => {
        const nextRecord = result?.records.find(
          (candidate: ProjectedDatabaseRecord) => candidate.path === path,
        );
        if (nextRecord) {
          updateDatabaseRecordPeek({ record: nextRecord });
          return;
        }
        navigateToDatabaseRecordPath(path);
      },
    });
    if (outcome.status === 'full_page') onOpenChange(false);
  };

  const compatibleMoveTargets = description?.source
    ? description.database.sources.flatMap((targetSource: DatabaseSource) => {
        const mapping = (description.database.sourceMappings ?? []).find(
          (candidate: DatabaseSourceMapping) =>
            candidate.sourceId === description.source?.id &&
            candidate.targetSourceId === targetSource.id,
        );
        return mapping ? [{ source: targetSource, mapping }] : [];
      })
    : [];

  return {
    requestedViewLayout,
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
    buttonProperty,
    conversionProperty,
    canonicalSourceViews,
    sourceViews,
    selectedView,
    defaultAgentScope,
    activeAgentScope,
    openDatabaseAgentScope,
    handleAgentMenuChange,
    selectView,
    commitSavedViewLifecycleChange,
    handleSavedViewTabAction,
    reviewViewRename,
    reorderSavedView,
    reorderSavedViewTo,
    commitPageTitle,
    commitPageAppearance,
    openRecord,
    compatibleMoveTargets,
  };
}
