import { Trans } from '@lingui/react/macro';
import { Loader2 } from 'lucide-react';
import { DatabaseBoard } from '@/components/DatabaseBoard';
import { DatabaseCalendar } from '@/components/DatabaseCalendar';
import { DatabaseChart } from '@/components/DatabaseChart';
import { DatabaseDashboard } from '@/components/DatabaseDashboard';
import { DatabaseFeed } from '@/components/DatabaseFeed';
import { DatabaseForm } from '@/components/DatabaseForm';
import { DatabaseGallery } from '@/components/DatabaseGallery';
import { DatabaseList } from '@/components/DatabaseList';
import { DatabaseMap } from '@/components/DatabaseMap';
import { DatabaseTimeline } from '@/components/DatabaseTimeline';
import { Button } from '@/components/ui/button';
import { DatabaseTable } from './DatabaseTableGrid';
import type { DatabaseWorkspaceRenderContext } from './database-workspace-context';

export function DatabaseWorkspaceViewRenderer({
  context,
}: {
  context: DatabaseWorkspaceRenderContext;
}) {
  const {
    result,
    selectedView,
    description,
    isPagePresentation,
    relationCandidates,
    mutationStatus,
    buttonStatus,
    selectedRecordIds,
    setMoveRecord,
    openRecord,
    onOpenContextInspector,
    loadedRecordLimit,
    pageStatus,
    selectedViewId,
    ghost,
    duplicateRecord,
    changeArchiveState,
    compatibleMoveTargets,
    setMoveTargetSourceId,
    deleteRecord,
    optimisticCellValues,
    tableViewStatesRef,
    tableViewStates,
    setTableViewStates,
    tableViewStateKey,
    offlineCachedAt,
    planBoardTransition,
    planTimelineChange,
    planCalendarChange,
    newRecordFocusRequest,
    tableCalculations,
    editCell,
    createAndAssignSelectOption,
    reorderSelectOptions,
    changeVerification,
    openDatabaseAgentScope,
    createRecord,
    handleSelectionChange,
    planTablePaste,
    setTableCalculations,
    searchRelationCandidates,
    setComputedPropertyId,
    setUniqueIdPropertyId,
    setPlacePropertyId,
    openSelectOptions,
    setConversionPropertyId,
    setPropertySortTargetId,
    setViewSettingsOpen,
    setPropertyFilterTargetId,
    setFilterDialogOpen,
    commitSavedViewConfiguration,
    duplicateSchemaProperty,
    planButton,
    addSchemaProperty,
    setPropertiesDialogRenameId,
    setPropertiesDialogOpen,
    renameSchemaProperty,
    removeSchemaProperty,
    loadMore,
  } = context;

  // DatabaseWorkspaceSuccessContent only mounts this renderer once
  // `description?.source` resolves. Restating that precondition here makes the
  // invariant visible to every branch below instead of leaving it implicit.
  if (!description?.source) return null;

  if (selectedView?.layout.type === 'form') {
    return (
      <DatabaseForm
        key={`${description.source.id}:${selectedView.id}`}
        databaseId={description.database.id}
        source={description.source}
        view={selectedView}
        people={description.database.people}
      />
    );
  }

  if (selectedView?.layout.type === 'dashboard') {
    return (
      <DatabaseDashboard
        key={`${description.database.id}:${selectedView.id}`}
        databaseId={description.database.id}
        database={description.database}
        view={selectedView}
        notionSurface={isPagePresentation}
        onOpen={openRecord}
      />
    );
  }

  if (!result) return null;

  return (
    <>
      {result.records.length === 0 &&
      selectedView?.layout.type !== 'board' &&
      selectedView?.layout.type !== 'timeline' &&
      selectedView?.layout.type !== 'calendar' &&
      selectedView?.layout.type !== 'list' &&
      selectedView?.layout.type !== 'gallery' &&
      selectedView?.layout.type !== 'chart' &&
      selectedView?.layout.type !== 'feed' &&
      selectedView?.layout.type !== 'table' &&
      selectedView?.layout.type !== undefined &&
      !ghost?.diff.records.some(
        (record) => record.action === 'create' && record.sourceId === description.source?.id,
      ) ? (
        <div
          className="flex min-h-64 items-center justify-center rounded-md border border-dashed text-muted-foreground text-sm"
          data-database-state="empty"
        >
          {isPagePresentation ? (
            <Trans>No pages in this source.</Trans>
          ) : (
            <Trans>No records in this source.</Trans>
          )}
        </div>
      ) : selectedView?.layout.type === 'board' ? (
        <DatabaseBoard
          key={`${description.source.id}:${selectedView.id}`}
          source={description.source}
          view={selectedView}
          result={result}
          people={description.database.people}
          notionSurface={isPagePresentation}
          relationRecords={[
            ...new Map(
              [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                record.id,
                record,
              ]),
            ).values(),
          ]}
          mutationLocked={
            mutationStatus !== 'idle' || buttonStatus !== 'idle' || offlineCachedAt !== null
          }
          onTransition={planBoardTransition}
          onDuplicate={duplicateRecord}
          onArchive={changeArchiveState}
          onRequestMove={
            compatibleMoveTargets.length > 0
              ? (record) => {
                  setMoveRecord(record);
                  setMoveTargetSourceId('');
                }
              : undefined
          }
          onDelete={deleteRecord}
          onOpen={openRecord}
        />
      ) : selectedView?.layout.type === 'timeline' ? (
        <DatabaseTimeline
          key={`${description.source.id}:${selectedView.id}`}
          source={description.source}
          view={selectedView}
          result={result}
          people={description.database.people}
          notionSurface={isPagePresentation}
          relationRecords={[
            ...new Map(
              [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                record.id,
                record,
              ]),
            ).values(),
          ]}
          mutationLocked={mutationStatus !== 'idle' || buttonStatus !== 'idle'}
          onChange={planTimelineChange}
          onOpen={openRecord}
        />
      ) : selectedView?.layout.type === 'calendar' ? (
        <DatabaseCalendar
          key={`${description.source.id}:${selectedView.id}`}
          source={description.source}
          view={selectedView}
          result={result}
          people={description.database.people}
          notionSurface={isPagePresentation}
          relationRecords={[
            ...new Map(
              [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                record.id,
                record,
              ]),
            ).values(),
          ]}
          mutationLocked={mutationStatus !== 'idle' || buttonStatus !== 'idle'}
          onChange={planCalendarChange}
          onOpen={openRecord}
        />
      ) : selectedView?.layout.type === 'list' ? (
        <DatabaseList
          key={`${description.source.id}:${selectedView.id}`}
          source={description.source}
          view={selectedView}
          result={result}
          people={description.database.people}
          notionSurface={isPagePresentation}
          relationRecords={[
            ...new Map(
              [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                record.id,
                record,
              ]),
            ).values(),
          ]}
          onOpen={openRecord}
          onOpenContextInspector={
            onOpenContextInspector
              ? (record) => {
                  if (!description.source) return;
                  onOpenContextInspector({
                    databaseId: description.database.id,
                    sourceId: description.source.id,
                    ...(selectedViewId ? { viewId: selectedViewId } : {}),
                    recordId: record.id,
                  });
                }
              : undefined
          }
        />
      ) : selectedView?.layout.type === 'gallery' ? (
        <DatabaseGallery
          key={`${description.source.id}:${selectedView.id}`}
          source={description.source}
          view={selectedView}
          result={result}
          people={description.database.people}
          relationRecords={[
            ...new Map(
              [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                record.id,
                record,
              ]),
            ).values(),
          ]}
          onOpen={openRecord}
        />
      ) : selectedView?.layout.type === 'chart' ? (
        <DatabaseChart
          key={`${description.source.id}:${selectedView.id}`}
          source={description.source}
          view={selectedView}
          result={result}
          people={description.database.people}
          notionSurface={isPagePresentation}
          relationRecords={[
            ...new Map(
              [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                record.id,
                record,
              ]),
            ).values(),
          ]}
          onOpen={openRecord}
        />
      ) : selectedView?.layout.type === 'map' ? (
        <DatabaseMap
          key={`${description.source.id}:${selectedView.id}`}
          source={description.source}
          view={selectedView}
          result={result}
          notionSurface={isPagePresentation}
          onOpen={openRecord}
        />
      ) : selectedView?.layout.type === 'feed' ? (
        <DatabaseFeed
          key={`${description.source.id}:${selectedView.id}`}
          source={description.source}
          view={selectedView}
          result={result}
          people={description.database.people}
          notionSurface={isPagePresentation}
          onOpen={openRecord}
        />
      ) : (
        <DatabaseTable
          key={`${description.source.id}:${selectedView?.id ?? 'all'}`}
          source={description.source}
          databaseId={description.database.id}
          viewId={selectedView?.id ?? null}
          result={result}
          people={description.database.people}
          notionSurface={isPagePresentation}
          relationRecords={[
            ...new Map(
              [...relationCandidates, ...(result.relationRecords ?? [])].map((record) => [
                record.id,
                record,
              ]),
            ).values(),
          ]}
          ghost={ghost}
          optimisticCellValues={optimisticCellValues}
          mutationLocked={mutationStatus !== 'idle' || buttonStatus !== 'idle'}
          focusNewRecordRequest={newRecordFocusRequest}
          selectedRecordIds={selectedRecordIds}
          calculations={tableCalculations}
          initialViewState={tableViewStates.get(tableViewStateKey)}
          onViewStateChange={(state) => {
            tableViewStatesRef.current.set(tableViewStateKey, state);
            setTableViewStates((current: ReadonlyMap<string, typeof state>) => {
              const next = new Map(current);
              next.set(tableViewStateKey, state);
              return next;
            });
          }}
          viewPropertyIds={selectedView?.projection.propertyIds}
          viewConfiguration={
            selectedView?.layout.type === 'table' ? selectedView.layout.configuration : undefined
          }
          onEdit={editCell}
          onCreateSelectOption={createAndAssignSelectOption}
          onReorderSelectOptions={reorderSelectOptions}
          onVerificationAction={changeVerification}
          onDelete={deleteRecord}
          onDuplicate={duplicateRecord}
          onArchive={changeArchiveState}
          onRequestMove={
            compatibleMoveTargets.length > 0
              ? (record) => {
                  setMoveRecord(record);
                  setMoveTargetSourceId('');
                }
              : undefined
          }
          onOpen={openRecord}
          onOpenContextInspector={
            onOpenContextInspector
              ? (record) => {
                  if (!description.source) return;
                  onOpenContextInspector({
                    databaseId: description.database.id,
                    sourceId: description.source.id,
                    ...(selectedViewId ? { viewId: selectedViewId } : {}),
                    recordId: record.id,
                  });
                }
              : undefined
          }
          onOpenPropertyContextInspector={
            onOpenContextInspector
              ? (property) => {
                  if (!description.source) return;
                  onOpenContextInspector({
                    databaseId: description.database.id,
                    sourceId: description.source.id,
                    ...(selectedViewId ? { viewId: selectedViewId } : {}),
                    propertyIds: [property.id],
                  });
                }
              : undefined
          }
          onOpenAgentScope={openDatabaseAgentScope}
          onCreateRecord={(title) => createRecord(title, { focusAfterCreate: true })}
          onSelectionChange={handleSelectionChange}
          onPaste={planTablePaste}
          onCalculationChange={(propertyId, calculation) =>
            setTableCalculations((current) => {
              if (calculation === null) {
                const next = { ...current };
                delete next[propertyId];
                return next;
              }
              return { ...current, [propertyId]: calculation };
            })
          }
          onRelationSearch={searchRelationCandidates}
          onConfigureComputedProperty={(property) => setComputedPropertyId(property.id)}
          onConfigureUniqueIdProperty={(property) => setUniqueIdPropertyId(property.id)}
          onConfigurePlaceProperty={(property) => setPlacePropertyId(property.id)}
          onConfigureSelectProperty={openSelectOptions}
          onConvertProperty={(property) => setConversionPropertyId(property.id)}
          onOpenPropertySort={(property) => {
            setPropertySortTargetId(property.id);
            setViewSettingsOpen(true);
          }}
          onOpenPropertyFilter={(property) => {
            setPropertyFilterTargetId(property.id);
            setFilterDialogOpen(true);
          }}
          onViewPropertyIdsChange={
            selectedView
              ? (propertyIds) => {
                  commitSavedViewConfiguration(
                    {
                      ...selectedView,
                      projection: {
                        ...selectedView.projection,
                        propertyIds: [...propertyIds],
                      },
                    },
                    'ui-view-property-projection',
                    'Saved view property visibility change failed',
                  );
                }
              : undefined
          }
          onDuplicateProperty={duplicateSchemaProperty}
          onInvokeButton={planButton}
          onAddProperty={(input) =>
            addSchemaProperty(input, {
              operation: 'property-create',
              actor: 'human',
              principalId: 'user:local',
            })
          }
          onManageProperties={(propertyId) => {
            setPropertiesDialogRenameId(propertyId ?? null);
            setPropertiesDialogOpen(true);
          }}
          onRenameProperty={renameSchemaProperty}
          onRemoveProperty={removeSchemaProperty}
        />
      )}
      {result.nextCursor && result.records.length < loadedRecordLimit ? (
        <div className="flex justify-center pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={pageStatus === 'loading'}
            onClick={loadMore}
          >
            {pageStatus === 'loading' ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : null}
            {isPagePresentation ? <Trans>Load more pages</Trans> : <Trans>Load more records</Trans>}
          </Button>
        </div>
      ) : null}
      {result.nextCursor && result.records.length >= loadedRecordLimit ? (
        <div className="rounded-md border px-3 py-2 text-muted-foreground text-sm" role="status">
          <Trans>
            This view keeps at most {loadedRecordLimit.toLocaleString()} loaded{' '}
            {isPagePresentation ? 'pages' : 'records'} in memory. Narrow the filters or open another
            saved view to continue.
          </Trans>
        </div>
      ) : null}
    </>
  );
}
