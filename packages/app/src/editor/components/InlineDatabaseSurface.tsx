import { Trans } from '@lingui/react/macro';
import {
  DatabaseLinkedViewReferenceSchema,
  type DatabaseLinkedViewSettings,
} from '@nedian0brien/synapsenote-core';
import { Braces, ListChecks, X } from 'lucide-react';
import { DatabaseMigrationRecoveryPanel } from '@/components/DatabaseMigrationDialog';
import { Button } from '@/components/ui/button';
import { databaseUiProblemMessage } from '@/lib/database-ui-problem';
import { cn } from '@/lib/utils';
import { InlineDatabaseBlock } from './InlineDatabaseBlock';
import { InlineDatabaseCreationDialog } from './InlineDatabaseCreationDialog';
import { InlineDatabaseHeader } from './InlineDatabaseHeader';
import { InlineDatabaseOverlayHost } from './InlineDatabaseOverlayHost';
import { InlineDatabasePicker } from './InlineDatabasePicker';
import { InlineDatabaseToolbar } from './InlineDatabaseToolbar';
import { databaseViewTabActionToInitialAction } from './inline-database-utils';
import {
  type InlineDatabaseReference,
  useInlineDatabaseController,
} from './use-inline-database-controller';

export interface DatabaseViewProps {
  databaseId?: string;
  sourceId?: string;
  viewId?: string;
  viewOverrides?: DatabaseLinkedViewSettings;
  mode?: 'inline' | 'full-page';
  /** Fresh slash insertion can request an immediate blank inline table. */
  create?: 'blank';
}

export { databaseViewTabActionToInitialAction };

export function InlineDatabaseSurface({
  databaseId,
  sourceId,
  viewId,
  viewOverrides,
  mode,
  create,
}: DatabaseViewProps) {
  'use no memo';
  const reference = DatabaseLinkedViewReferenceSchema.safeParse({
    databaseId,
    sourceId,
    viewId,
    ...(viewOverrides ? { viewOverrides } : {}),
    ...(mode ? { mode } : {}),
  });
  const controller = useInlineDatabaseController({
    reference: reference as InlineDatabaseReference,
    databaseId,
    sourceId,
    viewId,
    mode,
  });
  const {
    state,
    localViewOverrides,
    fullDatabaseOpen,
    setFullDatabaseOpen,
    showArchived,
    setShowArchived,
    initialRecordAction,
    setInitialRecordAction,
    initialTablePaste,
    setInitialTablePaste,
    initialDatabaseSurface,
    setInitialDatabaseSurface,
    initialViewAction,
    setInitialViewAction,
    initialPropertyId,
    setInitialPropertyId,
    initialSelectedRecordIds,
    setInitialSelectedRecordIds,
    linkedViewSettingsOpen,
    setLinkedViewSettingsOpen,
    linkedFilterOpen,
    setLinkedFilterOpen,
    linkedSortTargetId,
    setLinkedSortTargetId,
    linkedFilterTargetId,
    setLinkedFilterTargetId,
    replacementPickerOpen,
    setReplacementPickerOpen,
    inlineContextInspectorScope,
    setInlineContextInspectorScope,
    inlineAgentMenuOpen,
    inlineCreationOpen,
    setInlineCreationOpen,
    inlineViewManagerOpen,
    setInlineViewManagerOpen,
    inlineSettingsOpen,
    setInlineSettingsOpen,
    inlineActionsMenuOpen,
    setInlineActionsMenuOpen,
    inlineViewManagerInitialAction,
    setInlineViewManagerInitialAction,
    inlineTitleEditing,
    setInlineTitleEditing,
    inlineTitleDraft,
    setInlineTitleDraft,
    inlineSearchOpen,
    setInlineSearchOpen,
    inlineSearchQuery,
    setInlineSearchQuery,
    focusInlineNewRecordRequest,
    setFocusInlineNewRecordRequest,
    inlineSaveFeedback,
    inlineOptimisticCellValues,
    inlineSelectedRecordIds,
    setInlineSelectedRecordIds,
    inlineTableViewStatesRef,
    inlineTableViewStates,
    setInlineTableViewStates,
    inlineOverlayState,
    inlineFilterOpen: inlineOverlayFilterOpen,
    inlineSortOpen: inlineOverlaySortOpen,
    inlinePropertiesOpen: inlineOverlayPropertiesOpen,
    inlineFilterTargetId: inlineOverlayFilterTargetId,
    inlineSortTargetId: inlineOverlaySortTargetId,
    inlineMutationStatus,
    inlineMutationError,
    errorKind: inlineMutationErrorKind,
    inlineUndoToken,
    inlineUndoStatus,
    inlineRedoToken,
    inlineRedoStatus,
    undoInlineMutation,
    redoInlineMutation,
    linkedSource,
    linkedDatabase,
    activeLinkedView,
    inlineVisiblePropertyIds,
    inlineViewActionsLabel,
    inlineSearchLabel,
    inlineOpenDatabaseLabel,
    inlineAgentLabel,
    inlineNewViewLabel,
    linkedDatabaseRegionLabel,
    linkedSourceViews,
    activeInlineAgentScope,
    openInlineAgentScope,
    handleInlineAgentMenuChange,
    renderedResult,
    searchNeedle,
    loadMoreInlineSearch,
    applyReference,
    persistLinkedViewOverrides,
    setInlineMode,
    removeLinkedView,
    openRecord,
    handleInlineViewTabAction,
    commitInlineTitle,
    editInlineCell,
    createAndAssignInlineSelectOption,
    reorderInlineSelectOptions,
    createInlineRecord,
    addInlineProperty,
    applyInlineViewChanges,
    pasteInlineCells,
    openInlineDatabaseSurface,
    linkedViewSettingsFromView,
    commitInlineViewChange,
    commitInlineDefaultViewChange,
    handleInlineHistoryKeyDown,
    refreshNow,
  } = controller;
  const inlineFilterOpen = inlineOverlayFilterOpen;
  const inlineSortOpen = inlineOverlaySortOpen;
  const inlinePropertiesOpen = inlineOverlayPropertiesOpen;
  const inlineSortTargetId = inlineOverlaySortTargetId;
  const inlineFilterTargetId = inlineOverlayFilterTargetId;
  if (!reference.success) {
    const autoCreateBlank = create === 'blank';
    return (
      <>
        {!inlineCreationOpen && !autoCreateBlank ? (
          <InlineDatabasePicker
            onSelected={applyReference}
            onCreateBlank={() => setInlineCreationOpen(true)}
          />
        ) : null}
        <InlineDatabaseCreationDialog
          open={inlineCreationOpen || autoCreateBlank}
          autoStart={autoCreateBlank}
          onOpenChange={setInlineCreationOpen}
          onCreated={(next) => applyReference(next, { focusNewRecord: true })}
        />
      </>
    );
  }

  const inlineSelectionToolbar =
    inlineSelectedRecordIds.size > 0 ? (
      <div
        className="flex h-9 max-w-full animate-in items-stretch overflow-hidden rounded-md border border-border bg-popover text-sm shadow-sm fade-in-0 slide-in-from-left-1 duration-150 motion-reduce:animate-none"
        data-testid="inline-selection-toolbar"
        data-database-inline-selection-toolbar
        role="status"
      >
        <span className="flex items-center whitespace-nowrap border-r border-border px-3 font-medium text-primary">
          {inlineSelectedRecordIds.size} selected
        </span>
        <fieldset className="flex items-stretch border-0 p-0" aria-label="Selected page actions">
          <legend className="sr-only">Selected page actions</legend>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-auto w-9 rounded-none border-r border-border text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
            aria-label="Open bulk actions"
            title="Open bulk actions"
            onClick={() => {
              setInitialSelectedRecordIds([...inlineSelectedRecordIds]);
              setFullDatabaseOpen(true);
            }}
          >
            <ListChecks aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-auto w-9 rounded-none border-r border-border text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
            aria-label="Inspect selected context"
            title="Inspect selected context"
            onClick={() =>
              setInlineContextInspectorScope({ recordIds: [...inlineSelectedRecordIds] })
            }
          >
            <Braces aria-hidden="true" />
            <span className="sr-only">
              <Trans>Inspect selected context</Trans>
            </span>
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="h-auto w-9 rounded-none text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
            aria-label="Clear selection"
            title="Clear selection"
            onClick={() => setInlineSelectedRecordIds(new Set())}
          >
            <X aria-hidden="true" />
            <span className="sr-only">Clear selection</span>
          </Button>
        </fieldset>
      </div>
    ) : undefined;

  const inlineHeaderToolbar = (
    <InlineDatabaseToolbar
      state={state}
      activeLinkedView={activeLinkedView}
      linkedSource={linkedSource}
      linkedSourceViews={linkedSourceViews}
      activeInlineAgentScope={activeInlineAgentScope}
      inlineAgentLabel={inlineAgentLabel}
      inlineAgentMenuOpen={inlineAgentMenuOpen}
      onInlineAgentMenuChange={handleInlineAgentMenuChange}
      inlineViewActionsLabel={inlineViewActionsLabel}
      inlineOpenDatabaseLabel={inlineOpenDatabaseLabel}
      inlineSearchLabel={inlineSearchLabel}
      inlineFilterOpen={inlineFilterOpen}
      inlineFilterTargetId={inlineFilterTargetId}
      inlineSortOpen={inlineSortOpen}
      inlineSortTargetId={inlineSortTargetId}
      inlinePropertiesOpen={inlinePropertiesOpen}
      inlineVisiblePropertyIds={inlineVisiblePropertyIds}
      inlineSearchOpen={inlineSearchOpen}
      setInlineSearchOpen={setInlineSearchOpen}
      inlineSearchQuery={inlineSearchQuery}
      setInlineSearchQuery={setInlineSearchQuery}
      searchNeedle={searchNeedle}
      renderedResult={renderedResult}
      onLoadMore={loadMoreInlineSearch}
      reference={reference}
      showArchived={showArchived}
      setShowArchived={setShowArchived}
      setInlineContextInspectorScope={setInlineContextInspectorScope}
      setReplacementPickerOpen={setReplacementPickerOpen}
      setInlineMode={setInlineMode}
      openInlineAgentScope={openInlineAgentScope}
      openInlineDatabaseSurface={openInlineDatabaseSurface}
      inlineViewManagerOpen={inlineViewManagerOpen}
      inlineSettingsOpen={inlineSettingsOpen}
      onInlineSettingsOpenChange={setInlineSettingsOpen}
      inlineActionsMenuOpen={inlineActionsMenuOpen}
      onInlineActionsMenuOpenChange={setInlineActionsMenuOpen}
      inlineViewManagerInitialAction={inlineViewManagerInitialAction}
      inlineMutationBusy={
        inlineMutationStatus !== 'idle' ||
        inlineUndoStatus !== 'idle' ||
        inlineRedoStatus !== 'idle'
      }
      canUndo={Boolean(inlineUndoToken)}
      canRedo={Boolean(inlineRedoToken)}
      inlineUndoStatus={inlineUndoStatus}
      inlineRedoStatus={inlineRedoStatus}
      undoInlineMutation={undoInlineMutation}
      redoInlineMutation={redoInlineMutation}
      onInlineViewManagerOpenChange={(nextOpen) => {
        setInlineViewManagerOpen(nextOpen);
        if (!nextOpen) setInlineViewManagerInitialAction(undefined);
      }}
      onInlineViewChange={commitInlineViewChange}
      onInlineDefaultViewChange={commitInlineDefaultViewChange}
      onInlineViewSelect={(nextViewId) => {
        applyReference({
          databaseId: reference.data.databaseId,
          sourceId: reference.data.sourceId,
          viewId: nextViewId,
        });
        setInlineViewManagerOpen(false);
        setInlineViewManagerInitialAction(undefined);
      }}
      focusInlineNewRecord={() => setFocusInlineNewRecordRequest((current) => (current ?? 0) + 1)}
      persistLinkedViewOverrides={(next) =>
        persistLinkedViewOverrides(next ? { ...localViewOverrides, ...next } : undefined)
      }
      addInlineProperty={addInlineProperty}
      onOpenAdvancedProperties={(propertyId) => {
        inlineOverlayState.close();
        setInitialDatabaseSurface('properties');
        setInitialPropertyId(propertyId);
        setFullDatabaseOpen(true);
      }}
      removeLinkedView={removeLinkedView}
      onOpenFilterAdvanced={(propertyId) => {
        inlineOverlayState.close();
        setLinkedFilterTargetId(propertyId);
        setLinkedFilterOpen(true);
      }}
      onFilterOpenChange={(nextOpen) => {
        if (nextOpen) inlineOverlayState.openFilter(inlineFilterTargetId);
        else inlineOverlayState.close();
      }}
      onSortOpenChange={(nextOpen) => {
        if (nextOpen) inlineOverlayState.openSort(inlineSortTargetId);
        else inlineOverlayState.close();
      }}
      onPropertiesOpenChange={(nextOpen) => {
        if (nextOpen) inlineOverlayState.openProperties();
        else inlineOverlayState.close();
      }}
      onRefresh={refreshNow}
    />
  );
  return (
    <section
      className={cn(
        'relative my-4 bg-background',
        reference.data.mode === 'inline'
          ? 'database-inline-surface overflow-visible'
          : 'overflow-hidden rounded-lg border',
        reference.data.mode === 'full-page' &&
          'relative left-1/2 w-[min(96vw,90rem)] -translate-x-1/2',
      )}
      contentEditable={false}
      onKeyDown={handleInlineHistoryKeyDown}
      tabIndex={-1}
      aria-label={linkedDatabaseRegionLabel}
      aria-busy={state.status === 'loading'}
      data-database-view-state={state.status}
      data-database-id={reference.data.databaseId}
      data-source-id={reference.data.sourceId}
      data-view-id={reference.data.viewId}
      data-view-mode={reference.data.mode}
      data-database-layout={activeLinkedView?.layout.type}
      data-database-inline-surface={reference.data.mode === 'inline' ? '' : undefined}
    >
      <InlineDatabaseHeader
        state={state}
        reference={reference}
        linkedDatabase={linkedDatabase}
        linkedSource={linkedSource}
        linkedSourceViews={linkedSourceViews}
        activeLinkedView={activeLinkedView}
        inlineNewViewLabel={inlineNewViewLabel}
        inlineTitleEditing={inlineTitleEditing}
        inlineTitleDraft={inlineTitleDraft}
        inlineMutationStatus={inlineMutationStatus}
        inlineUndoStatus={inlineUndoStatus}
        inlineRedoStatus={inlineRedoStatus}
        setInlineTitleDraft={setInlineTitleDraft}
        setInlineTitleEditing={setInlineTitleEditing}
        commitInlineTitle={commitInlineTitle}
        applyReference={applyReference}
        handleInlineViewTabAction={handleInlineViewTabAction}
        openInlineDatabaseSurface={openInlineDatabaseSurface}
        toolbar={inlineHeaderToolbar}
        selectionToolbar={inlineSelectionToolbar}
      />

      {state.status === 'ready' && state.refreshProblem ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-900 text-xs dark:text-amber-100"
          role="status"
          data-testid={
            state.refreshProblem.kind === 'offline'
              ? 'database-view-stale'
              : 'database-view-refresh-problem'
          }
          data-database-view-refresh-problem={state.refreshProblem.kind}
        >
          <span>
            Refresh paused · {databaseUiProblemMessage(state.refreshProblem)} The current view is
            still available.
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={refreshNow}>
            Retry
          </Button>
        </div>
      ) : state.status === 'ready' && state.stale ? (
        <div
          className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-900 text-xs dark:text-amber-100"
          role="status"
          data-testid="database-view-stale"
          data-database-view-stale="true"
        >
          Offline or unavailable · showing the last verified snapshot. The view will refresh when
          the connection returns.
        </div>
      ) : null}
      {inlineMutationStatus === 'saving' ? (
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          data-testid="inline-saving-feedback"
        >
          Saving inline database change
        </div>
      ) : null}
      {inlineSaveFeedback ? (
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          data-testid="inline-save-feedback"
        >
          {inlineSaveFeedback === 'saved'
            ? 'Saved'
            : inlineSaveFeedback === 'undone'
              ? 'Undone'
              : 'Redone'}
        </div>
      ) : null}
      {inlineMutationError ? (
        <>
          <div
            className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-destructive text-xs"
            role="alert"
          >
            {inlineMutationError}
          </div>
          {inlineMutationErrorKind === 'migration_required' &&
          reference.success &&
          state.status === 'ready' ? (
            <div className="px-4 py-2">
              <DatabaseMigrationRecoveryPanel
                databaseId={reference.data.databaseId}
                expectedManifestRevision={state.description.manifestRevision}
              />
            </div>
          ) : null}
        </>
      ) : null}
      {replacementPickerOpen ? (
        <div className="p-3">
          {!inlineCreationOpen ? (
            <InlineDatabasePicker
              message="Choose a different database or saved view. Existing pages remain shared."
              onSelected={applyReference}
              onCreateBlank={() => setInlineCreationOpen(true)}
            />
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setReplacementPickerOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <InlineDatabaseBlock
          state={state}
          reference={reference}
          linkedSource={linkedSource}
          activeLinkedView={activeLinkedView}
          renderedResult={renderedResult}
          inlineOptimisticCellValues={inlineOptimisticCellValues}
          searchNeedle={searchNeedle}
          inlineMutationLocked={
            inlineMutationStatus !== 'idle' ||
            inlineUndoStatus !== 'idle' ||
            inlineRedoStatus !== 'idle'
          }
          focusInlineNewRecordRequest={focusInlineNewRecordRequest}
          inlineSelectedRecordIds={inlineSelectedRecordIds}
          inlineTableViewStatesRef={inlineTableViewStatesRef}
          inlineTableViewStates={inlineTableViewStates}
          setInlineTableViewStates={setInlineTableViewStates}
          localViewOverrides={localViewOverrides}
          onOpenRecord={openRecord}
          onApplyViewChanges={applyInlineViewChanges}
          onSetInitialRecordAction={(action) => setInitialRecordAction(action)}
          onSetFullDatabaseOpen={setFullDatabaseOpen}
          onSetContextInspectorScope={(scope) => setInlineContextInspectorScope(scope)}
          onSetInlineSelectedRecordIds={(ids) => setInlineSelectedRecordIds(ids)}
          onPersistLinkedViewOverrides={(next) => persistLinkedViewOverrides(next)}
          onEditInlineCell={editInlineCell}
          onCreateInlineSelectOption={createAndAssignInlineSelectOption}
          onReorderInlineSelectOptions={reorderInlineSelectOptions}
          onCreateInlineRecord={createInlineRecord}
          onPasteInlineCells={pasteInlineCells}
          onOpenInlineAgentScope={openInlineAgentScope}
          onAddInlineProperty={addInlineProperty}
          onOpenInlineDatabaseSurface={(surface, propertyId) =>
            openInlineDatabaseSurface(surface, propertyId)
          }
          onSetReplacementPickerOpen={setReplacementPickerOpen}
          onRefresh={refreshNow}
        />
      )}

      <InlineDatabaseOverlayHost
        state={state}
        reference={reference}
        linkedSource={linkedSource}
        linkedDatabase={linkedDatabase}
        activeLinkedView={activeLinkedView}
        localViewOverrides={localViewOverrides}
        persistLinkedViewOverrides={persistLinkedViewOverrides}
        linkedViewSettingsFromView={linkedViewSettingsFromView}
        inlineCreationOpen={inlineCreationOpen}
        setInlineCreationOpen={setInlineCreationOpen}
        applyReference={applyReference}
        linkedFilterOpen={linkedFilterOpen}
        setLinkedFilterOpen={setLinkedFilterOpen}
        linkedFilterTargetId={linkedFilterTargetId}
        setLinkedFilterTargetId={setLinkedFilterTargetId}
        linkedViewSettingsOpen={linkedViewSettingsOpen}
        setLinkedViewSettingsOpen={setLinkedViewSettingsOpen}
        linkedSortTargetId={linkedSortTargetId}
        setLinkedSortTargetId={setLinkedSortTargetId}
        inlineContextInspectorScope={inlineContextInspectorScope}
        setInlineContextInspectorScope={setInlineContextInspectorScope}
        fullDatabaseOpen={fullDatabaseOpen}
        setFullDatabaseOpen={setFullDatabaseOpen}
        initialRecordAction={initialRecordAction}
        setInitialRecordAction={setInitialRecordAction}
        initialTablePaste={initialTablePaste}
        setInitialTablePaste={setInitialTablePaste}
        initialDatabaseSurface={initialDatabaseSurface}
        setInitialDatabaseSurface={setInitialDatabaseSurface}
        initialViewAction={initialViewAction}
        setInitialViewAction={setInitialViewAction}
        initialPropertyId={initialPropertyId}
        setInitialPropertyId={setInitialPropertyId}
        initialSelectedRecordIds={initialSelectedRecordIds}
        setInitialSelectedRecordIds={setInitialSelectedRecordIds}
      />
    </section>
  );
}
