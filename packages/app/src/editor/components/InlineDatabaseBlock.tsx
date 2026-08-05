import type {
  DatabaseLinkedViewSettings,
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { AlertCircle } from 'lucide-react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { DatabaseBoard } from '@/components/DatabaseBoard';
import { DatabaseCalendar } from '@/components/DatabaseCalendar';
import { DatabaseChart } from '@/components/DatabaseChart';
import { DatabaseDashboard } from '@/components/DatabaseDashboard';
import { DatabaseFeed } from '@/components/DatabaseFeed';
import { DatabaseForm } from '@/components/DatabaseForm';
import { DatabaseGallery } from '@/components/DatabaseGallery';
import { DatabaseList } from '@/components/DatabaseList';
import { DatabaseMap } from '@/components/DatabaseMap';
import type {
  DatabaseInitialRecordAction,
  DatabaseTableViewState,
} from '@/components/DatabaseTableGrid';
import { DatabaseTable } from '@/components/DatabaseTableGrid';
import { DatabaseTimeline } from '@/components/DatabaseTimeline';
import type { DatabaseAgentScope } from '@/components/handoff/database-agent-scope';
import { Button } from '@/components/ui/button';
import type { DatabaseReadModelState } from '@/lib/database-read-model';
import type { DatabasePasteChange } from '@/lib/database-tsv';
import { databaseUiProblemMessage } from '@/lib/database-ui-problem';
import { cn } from '@/lib/utils';
import {
  applyInlineManualRecordOrder,
  mergeInlineManualRecordOrder,
} from './inline-database-utils';

type InlineDatabaseReference = {
  data: { databaseId: string; sourceId: string; viewId: string; mode: 'inline' | 'full-page' };
};

export interface InlineDatabaseBlockProps {
  state: DatabaseReadModelState;
  reference: InlineDatabaseReference;
  linkedSource: DatabaseSource | null;
  activeLinkedView?: DatabaseView;
  renderedResult: DatabaseQueryResult | null;
  inlineOptimisticCellValues: ReadonlyMap<string, DatabaseValue | undefined>;
  searchNeedle: string;
  inlineMutationLocked: boolean;
  focusInlineNewRecordRequest: number | null;
  inlineSelectedRecordIds: Set<string>;
  inlineTableViewStatesRef: MutableRefObject<Map<string, DatabaseTableViewState>>;
  inlineTableViewStates: ReadonlyMap<string, DatabaseTableViewState>;
  setInlineTableViewStates: Dispatch<SetStateAction<Map<string, DatabaseTableViewState>>>;
  localViewOverrides: DatabaseLinkedViewSettings | undefined;
  onOpenRecord: (record: ProjectedDatabaseRecord) => void;
  onApplyViewChanges: (
    record: ProjectedDatabaseRecord,
    changes: readonly { property: DatabaseProperty; value: DatabaseValue | undefined }[],
  ) => void;
  onSetInitialRecordAction: (action: DatabaseInitialRecordAction) => void;
  onSetFullDatabaseOpen: (open: boolean) => void;
  onSetContextInspectorScope: (scope: { recordId?: string; propertyIds?: string[] }) => void;
  onSetInlineSelectedRecordIds: (ids: Set<string>) => void;
  onPersistLinkedViewOverrides: (next: DatabaseLinkedViewSettings) => void;
  onEditInlineCell: (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    value: DatabaseValue | undefined,
  ) => void;
  onCreateInlineSelectOption: (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'select' | 'multi_select' }>,
    name: string,
    selectedOptionIds: readonly string[],
  ) => boolean;
  onReorderInlineSelectOptions: (
    property: Extract<DatabaseProperty, { type: 'select' | 'multi_select' }>,
    optionIds: readonly string[],
  ) => boolean;
  onCreateInlineRecord: (title: string) => void;
  onPasteInlineCells: (changes: readonly DatabasePasteChange[]) => void;
  onOpenInlineAgentScope: (scope: DatabaseAgentScope) => void;
  onAddInlineProperty: (input: { name: string; type: DatabaseProperty['type'] }) => void;
  onOpenInlineDatabaseSurface: (
    surface: 'properties' | 'options',
    propertyId?: string,
    options?: { advanced?: boolean },
  ) => void;
  onSetReplacementPickerOpen: (open: boolean) => void;
  onRefresh: () => void;
}

export function InlineDatabaseBlock(props: InlineDatabaseBlockProps) {
  const {
    state,
    reference,
    linkedSource,
    activeLinkedView,
    renderedResult,
    inlineOptimisticCellValues,
    searchNeedle,
    inlineMutationLocked,
    focusInlineNewRecordRequest,
    inlineSelectedRecordIds,
    inlineTableViewStatesRef,
    inlineTableViewStates,
    setInlineTableViewStates,
    localViewOverrides,
    onOpenRecord,
    onApplyViewChanges,
    onSetInitialRecordAction,
    onSetFullDatabaseOpen,
    onSetContextInspectorScope,
    onSetInlineSelectedRecordIds,
    onPersistLinkedViewOverrides,
    onEditInlineCell,
    onCreateInlineSelectOption,
    onReorderInlineSelectOptions,
    onCreateInlineRecord,
    onPasteInlineCells,
    onOpenInlineAgentScope,
    onAddInlineProperty,
    onOpenInlineDatabaseSurface,
    onSetReplacementPickerOpen,
    onRefresh,
  } = props;
  const tableOwnsScroll = activeLinkedView?.layout.type === 'table';
  const manualOrderEnabled =
    activeLinkedView?.layout.type === 'table' && activeLinkedView.sort.length === 0;
  const tableResult =
    renderedResult && manualOrderEnabled
      ? applyInlineManualRecordOrder(renderedResult, localViewOverrides?.manualRecordIds)
      : renderedResult;
  return (
    <>
      {state.status === 'loading' ? (
        <div
          className="min-h-28"
          aria-hidden="true"
          data-database-state="pending"
          data-testid="database-view-pending"
        />
      ) : state.status === 'error' ? (
        <div
          className="flex min-h-32 flex-wrap items-center gap-3 p-4 text-destructive text-sm"
          role="alert"
          data-testid="database-view-error"
          data-database-view-error-kind={state.problem.kind}
          data-database-view-retryable={String(state.problem.retryable)}
        >
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-medium">
                {state.problem.kind === 'missing'
                  ? 'Linked database view is unavailable'
                  : state.problem.kind === 'permission'
                    ? 'Permission required'
                    : state.problem.kind === 'offline'
                      ? 'Database is offline'
                      : state.problem.kind === 'invalid_schema'
                        ? 'Database setup needs attention'
                        : state.problem.kind === 'stale_index'
                          ? 'Database is still updating'
                          : state.problem.kind === 'conflict'
                            ? 'Database changed elsewhere'
                            : 'Database request failed'}
              </div>
              <p className="mt-0.5 break-words opacity-90">
                {databaseUiProblemMessage(state.problem)}
              </p>
              {state.problem.kind === 'permission' ? (
                <p className="mt-1 opacity-90">
                  Request access or use fields available to your current policy.
                </p>
              ) : null}
            </div>
          </div>
          {state.problem.kind === 'missing' ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSetReplacementPickerOpen(true)}
            >
              Choose replacement
            </Button>
          ) : state.problem.kind !== 'permission' &&
            (state.problem.retryable || state.problem.kind === 'conflict') ? (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
              {state.problem.kind === 'stale_index'
                ? 'Check again'
                : state.problem.kind === 'invalid_schema'
                  ? 'Reload database setup'
                  : state.problem.kind === 'conflict'
                    ? 'Reload latest'
                    : 'Retry'}
            </Button>
          ) : null}
        </div>
      ) : linkedSource && activeLinkedView ? (
        <div
          className={cn(
            tableOwnsScroll ? 'px-3 pt-0 pb-3' : 'p-3',
            !tableOwnsScroll && 'overflow-auto',
            !tableOwnsScroll && reference.data.mode === 'inline' && 'max-h-[36rem]',
          )}
          data-database-inline-content
        >
          {activeLinkedView.layout.type === 'form' ? (
            <DatabaseForm
              databaseId={state.description.database.id}
              source={linkedSource}
              view={activeLinkedView}
              people={state.description.database.people}
            />
          ) : activeLinkedView.layout.type === 'dashboard' ? (
            <DatabaseDashboard
              databaseId={state.description.database.id}
              database={state.description.database}
              view={activeLinkedView}
              notionSurface
              onOpen={onOpenRecord}
            />
          ) : !renderedResult ? null : activeLinkedView.layout.type === 'board' ? (
            <DatabaseBoard
              source={linkedSource}
              view={activeLinkedView}
              result={renderedResult}
              people={state.description.database.people}
              onOpen={onOpenRecord}
              onOpenContextInspector={(record) =>
                onSetContextInspectorScope({ recordId: record.id })
              }
              onTransition={(transition) => {
                onApplyViewChanges(transition.record, transition.changes);
              }}
              mutationLocked={inlineMutationLocked}
              notionSurface
              onDuplicate={(record) => {
                onSetInitialRecordAction({ kind: 'duplicate', recordId: record.id });
                onSetFullDatabaseOpen(true);
              }}
              onArchive={(record, action) => {
                onSetInitialRecordAction({ kind: action, recordId: record.id });
                onSetFullDatabaseOpen(true);
              }}
              onRequestMove={(record) => {
                onSetInitialRecordAction({ kind: 'move', recordId: record.id });
                onSetFullDatabaseOpen(true);
              }}
              onDelete={(record) => {
                onSetInitialRecordAction({ kind: 'delete', recordId: record.id });
                onSetFullDatabaseOpen(true);
              }}
            />
          ) : activeLinkedView.layout.type === 'timeline' ? (
            <DatabaseTimeline
              source={linkedSource}
              view={activeLinkedView}
              result={renderedResult}
              people={state.description.database.people}
              onOpen={onOpenRecord}
              onOpenContextInspector={(record) =>
                onSetContextInspectorScope({ recordId: record.id })
              }
              onChange={(change) => {
                onApplyViewChanges(change.record, change.changes);
              }}
              notionSurface
              mutationLocked={inlineMutationLocked}
            />
          ) : activeLinkedView.layout.type === 'calendar' ? (
            <DatabaseCalendar
              source={linkedSource}
              view={activeLinkedView}
              result={renderedResult}
              people={state.description.database.people}
              onOpen={onOpenRecord}
              onOpenContextInspector={(record) =>
                onSetContextInspectorScope({ recordId: record.id })
              }
              onChange={(change) => {
                onApplyViewChanges(change.record, change.changes);
              }}
              notionSurface
              mutationLocked={inlineMutationLocked}
            />
          ) : activeLinkedView.layout.type === 'list' ? (
            <DatabaseList
              source={linkedSource}
              view={activeLinkedView}
              result={renderedResult}
              people={state.description.database.people}
              notionSurface
              onOpen={onOpenRecord}
              onOpenContextInspector={(record) =>
                onSetContextInspectorScope({ recordId: record.id })
              }
            />
          ) : activeLinkedView.layout.type === 'gallery' ? (
            <DatabaseGallery
              source={linkedSource}
              view={activeLinkedView}
              result={renderedResult}
              people={state.description.database.people}
              notionSurface
              onOpen={onOpenRecord}
              onOpenContextInspector={(record) =>
                onSetContextInspectorScope({ recordId: record.id })
              }
            />
          ) : activeLinkedView.layout.type === 'chart' ? (
            <DatabaseChart
              source={linkedSource}
              view={activeLinkedView}
              result={renderedResult}
              people={state.description.database.people}
              notionSurface
              onOpen={onOpenRecord}
              onOpenContextInspector={(record) =>
                onSetContextInspectorScope({ recordId: record.id })
              }
            />
          ) : activeLinkedView.layout.type === 'map' ? (
            <DatabaseMap
              source={linkedSource}
              view={activeLinkedView}
              result={renderedResult}
              notionSurface
              onOpen={onOpenRecord}
              onOpenContextInspector={(record) =>
                onSetContextInspectorScope({ recordId: record.id })
              }
            />
          ) : activeLinkedView.layout.type === 'feed' ? (
            <DatabaseFeed
              source={linkedSource}
              view={activeLinkedView}
              result={renderedResult}
              people={state.description.database.people}
              notionSurface
              onOpen={onOpenRecord}
              onOpenContextInspector={(record) =>
                onSetContextInspectorScope({ recordId: record.id })
              }
            />
          ) : (
            <DatabaseTable
              source={linkedSource}
              databaseId={state.description.database.id}
              viewId={activeLinkedView.id}
              result={tableResult ?? renderedResult}
              people={state.description.database.people}
              notionSurface
              optimisticCellValues={inlineOptimisticCellValues}
              searchQuery={searchNeedle}
              mutationLocked={inlineMutationLocked}
              focusNewRecordRequest={
                reference.data.mode === 'inline' ? focusInlineNewRecordRequest : null
              }
              selectedRecordIds={inlineSelectedRecordIds}
              initialViewState={inlineTableViewStates.get(activeLinkedView.id)}
              onViewStateChange={(nextState) => {
                inlineTableViewStatesRef.current.set(activeLinkedView.id, nextState);
                setInlineTableViewStates((current) => {
                  const next = new Map(current);
                  next.set(activeLinkedView.id, nextState);
                  return next;
                });
              }}
              viewPropertyIds={activeLinkedView.projection.propertyIds}
              viewConfiguration={
                activeLinkedView.layout.type === 'table'
                  ? activeLinkedView.layout.configuration
                  : undefined
              }
              onViewPropertyIdsChange={(propertyIds) => {
                // A linked block owns its visible column projection. Keep
                // table-edge hide/reorder actions in the block's stable
                // viewOverrides instead of the canonical view or an
                // ephemeral component layout, so a refresh preserves the
                // Notion-style per-block view configuration.
                onPersistLinkedViewOverrides({
                  ...localViewOverrides,
                  projection: {
                    ...activeLinkedView.projection,
                    propertyIds: [...propertyIds],
                  },
                });
              }}
              onOpen={onOpenRecord}
              onEdit={onEditInlineCell}
              onCreateSelectOption={onCreateInlineSelectOption}
              onReorderSelectOptions={onReorderInlineSelectOptions}
              onCreateRecord={onCreateInlineRecord}
              onPaste={onPasteInlineCells}
              onSelectionChange={onSetInlineSelectedRecordIds}
              onReorderRecords={
                manualOrderEnabled
                  ? (recordIds) => {
                      onPersistLinkedViewOverrides({
                        ...localViewOverrides,
                        manualRecordIds: mergeInlineManualRecordOrder(
                          localViewOverrides?.manualRecordIds,
                          recordIds,
                        ),
                      });
                    }
                  : undefined
              }
              onOpenContextInspector={(record) =>
                onSetContextInspectorScope({ recordId: record.id })
              }
              onOpenPropertyContextInspector={(property) =>
                onSetContextInspectorScope({ propertyIds: [property.id] })
              }
              onOpenAgentScope={onOpenInlineAgentScope}
              onAddProperty={onAddInlineProperty}
              onConfigureSelectProperty={(property) =>
                onOpenInlineDatabaseSurface('options', property.id)
              }
              onManageProperties={(propertyId) =>
                onOpenInlineDatabaseSurface('properties', propertyId)
              }
              onRemoveProperty={() =>
                onOpenInlineDatabaseSurface('properties', undefined, { advanced: true })
              }
              onDuplicate={(record) => {
                onSetInitialRecordAction({ kind: 'duplicate', recordId: record.id });
                onSetFullDatabaseOpen(true);
              }}
              onArchive={(record, action) => {
                onSetInitialRecordAction({ kind: action, recordId: record.id });
                onSetFullDatabaseOpen(true);
              }}
              onRequestMove={(record) => {
                onSetInitialRecordAction({ kind: 'move', recordId: record.id });
                onSetFullDatabaseOpen(true);
              }}
              onDelete={(record) => {
                onSetInitialRecordAction({ kind: 'delete', recordId: record.id });
                onSetFullDatabaseOpen(true);
              }}
            />
          )}
        </div>
      ) : null}
    </>
  );
}
