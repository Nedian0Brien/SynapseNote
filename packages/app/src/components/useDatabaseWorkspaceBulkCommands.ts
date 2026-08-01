import type {
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseView,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { useEffect, useEffectEvent } from 'react';
import type { DatabaseBoardTransition } from '@/components/DatabaseBoard';
import type { DatabaseCalendarChange } from '@/components/DatabaseCalendar';
import type { DatabaseTimelineChange } from '@/components/DatabaseTimeline';
import type { DatabaseDescription } from '@/lib/database-catalog-client';
import {
  createDatabaseBulkCellMutationDesiredState,
  createDatabaseBulkCheckboxToggleDesiredState,
  createDatabaseTablePasteDesiredState,
  isDatabaseCellEditable,
  parseDatabaseCellDraft,
} from '@/lib/database-cell-mutation';
import { databaseRecordsToCsv } from '@/lib/database-csv';
import type { databaseSnapshotToJson } from '@/lib/database-json';
import { appendDatabaseQueryPage, queryDatabase } from '@/lib/database-query-client';
import { type DatabasePasteChange, databaseRecordsToTsv } from '@/lib/database-tsv';
import { classifyDatabaseUiProblem } from '@/lib/database-ui-problem';
import type { DatabaseSelectProperty } from './DatabaseTableGrid';

import {
  DATABASE_EXPORT_RECORD_LIMIT,
  downloadTextFile,
  isDatabaseSelectProperty,
} from './DatabaseTableGrid';

import type { DatabaseTableDialogProps } from './database-workspace-types';
import type { useDatabaseWorkspaceControllerState } from './use-database-workspace-controller-state';
import type { useDatabaseWorkspaceMutationCommands } from './useDatabaseWorkspaceMutationCommands';

type DatabaseWorkspaceControllerState = ReturnType<typeof useDatabaseWorkspaceControllerState>;
type DatabaseWorkspaceMutationCommands = ReturnType<typeof useDatabaseWorkspaceMutationCommands>;

export interface DatabaseWorkspaceBulkCommandsContext
  extends Pick<
    DatabaseWorkspaceControllerState,
    | 'selectedRecordIds'
    | 'bulkPropertyId'
    | 'bulkDraft'
    | 'setMutationError'
    | 'mutationStatus'
    | 'setSelectedRecordIds'
    | 'setPropertiesDialogRenameId'
    | 'setPropertiesDialogOpen'
    | 'setViewRenameTarget'
    | 'setViewManagerOpen'
    | 'setFilterDialogOpen'
    | 'setViewSettingsOpen'
    | 'selection'
    | 'showArchived'
    | 'csvStatus'
    | 'setCsvStatus'
  > {
  description: DatabaseDescription | null;
  result: DatabaseQueryResult | null;
  runMutation: DatabaseWorkspaceMutationCommands['runMutation'];
  initialTablePaste: readonly DatabasePasteChange[] | undefined;
  handledInitialTablePaste: DatabaseWorkspaceControllerState['handledInitialTablePasteRef'];
  open: boolean;
  initialDatabaseSurface: DatabaseTableDialogProps['initialDatabaseSurface'];
  initialViewAction: DatabaseTableDialogProps['initialViewAction'];
  initialPropertyId: string | undefined;
  handledInitialDatabaseSurface: DatabaseWorkspaceControllerState['handledInitialDatabaseSurfaceRef'];
  openSelectOptions: (property: DatabaseSelectProperty) => void;
  commitDefaultViewChange: DatabaseWorkspaceMutationCommands['commitDefaultViewChange'];
  initialSelectedRecordIds: readonly string[] | undefined;
  handledInitialSelectedRecordIds: DatabaseWorkspaceControllerState['handledInitialSelectedRecordIdsRef'];
  databaseSnapshotToJson: typeof databaseSnapshotToJson;
}

export function useDatabaseWorkspaceBulkCommands(
  context: DatabaseWorkspaceBulkCommandsContext & Record<string, unknown>,
) {
  const {
    description,
    result,
    selectedRecordIds,
    bulkPropertyId,
    bulkDraft,
    setMutationError,
    mutationStatus,
    runMutation,
    setSelectedRecordIds,
    initialTablePaste,
    handledInitialTablePaste: handledInitialTablePasteRef,
    open,
    initialDatabaseSurface,
    initialViewAction,
    initialPropertyId,
    handledInitialDatabaseSurface: handledInitialDatabaseSurfaceRef,
    setPropertiesDialogRenameId,
    setPropertiesDialogOpen,
    openSelectOptions,
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
  } = context;

  const bulkProperty = description?.source?.properties.find(
    (property: DatabaseProperty) =>
      property.id === bulkPropertyId && isDatabaseCellEditable(property),
  );

  const planBulkEdit = () => {
    if (!description?.source || !result || !bulkProperty || mutationStatus !== 'idle') return;
    try {
      const records = result.records.filter((record: ProjectedDatabaseRecord) =>
        selectedRecordIds.has(record.id),
      );
      const value = parseDatabaseCellDraft(bulkProperty, bulkDraft, description.database.people);
      runMutation(
        createDatabaseBulkCellMutationDesiredState({
          database: description.database,
          source: description.source,
          records,
          property: bulkProperty,
          value,
        }),
        'ui-record-bulk',
        'Bulk database edit failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the bulk edit'));
    }
  };

  const planBulkCheckboxToggle = () => {
    if (
      !description?.source ||
      !result ||
      bulkProperty?.type !== 'checkbox' ||
      mutationStatus !== 'idle'
    ) {
      return;
    }
    try {
      const records = result.records.filter((record: ProjectedDatabaseRecord) =>
        selectedRecordIds.has(record.id),
      );
      runMutation(
        createDatabaseBulkCheckboxToggleDesiredState({
          database: description.database,
          source: description.source,
          records,
          property: bulkProperty,
        }),
        'ui-checkbox-toggle',
        'Bulk checkbox toggle failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the checkbox toggle'));
    }
  };

  const planTablePaste = useEffectEvent((changes: readonly DatabasePasteChange[]) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: description.database,
          source: description.source,
          changes,
        }),
        'ui-table-paste',
        'Database TSV paste failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the TSV paste'));
    }
  });

  // Action IDs are ref-backed so StrictMode and catalog refresh cannot replay
  // a one-shot handoff; they are intentionally not effect dependencies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref-backed one-shot action guard
  useEffect(() => {
    if (!open || !initialTablePaste?.length || !description?.source || !result) return;
    const actionKey = initialTablePaste
      .map(
        (change: DatabasePasteChange) =>
          `${change.record.id}:${change.property.id}:${JSON.stringify(change.value)}`,
      )
      .join('|');
    if (handledInitialTablePasteRef.current === actionKey) return;
    handledInitialTablePasteRef.current = actionKey;
    planTablePaste(initialTablePaste);
  }, [open, initialTablePaste, description, result]);

  // The surface key is consumed once per refresh-shaped action handoff.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref-backed one-shot action guard
  useEffect(() => {
    if (!open || !initialDatabaseSurface || !description?.source) return;
    const initialActionKey = initialViewAction
      ? `${initialViewAction.kind}:${initialViewAction.viewId}`
      : '';
    const surfaceKey = `${initialDatabaseSurface}:${initialPropertyId ?? ''}:${initialActionKey}`;
    if (handledInitialDatabaseSurfaceRef.current === surfaceKey) return;
    handledInitialDatabaseSurfaceRef.current = surfaceKey;
    if (initialDatabaseSurface === 'properties') {
      setPropertiesDialogRenameId(initialPropertyId ?? null);
      setPropertiesDialogOpen(true);
      return;
    }
    if (initialDatabaseSurface === 'options') {
      const property = description.source.properties.find(
        (candidate: DatabaseProperty): candidate is DatabaseSelectProperty =>
          candidate.id === initialPropertyId && isDatabaseSelectProperty(candidate),
      );
      if (property) {
        openSelectOptions(property);
      } else {
        setMutationError(
          classifyDatabaseUiProblem(
            new Error('The selected property no longer supports database options.'),
            'Unable to open property options',
          ),
        );
      }
      return;
    }
    if (initialDatabaseSurface === 'view-manager') {
      const view = initialViewAction
        ? description.database.views.find(
            (candidate: DatabaseView) => candidate.id === initialViewAction.viewId,
          )
        : undefined;
      if (initialViewAction?.kind === 'rename' && view) {
        setViewRenameTarget(view);
        return;
      }
      if (initialViewAction?.kind === 'make-default' && view) {
        commitDefaultViewChange(view.id);
        return;
      }
      if (initialViewAction?.kind === 'clear-default' && view) {
        commitDefaultViewChange();
        return;
      }
      setViewManagerOpen(true);
      return;
    }
    if (initialDatabaseSurface === 'filters') {
      setFilterDialogOpen(true);
      return;
    }
    setViewSettingsOpen(true);
  }, [
    open,
    initialDatabaseSurface,
    initialViewAction,
    initialPropertyId,
    description,
    result,
    setPropertiesDialogOpen,
    setFilterDialogOpen,
    setViewSettingsOpen,
    setViewRenameTarget,
    setPropertiesDialogRenameId,
    setViewManagerOpen,
    openSelectOptions,
    commitDefaultViewChange,
  ]);

  // Selection handoffs are keyed by a ref to prevent duplicate application.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref-backed one-shot action guard
  useEffect(() => {
    if (!open || !initialSelectedRecordIds?.length || !result) return;
    const selectionKey = initialSelectedRecordIds.join('|');
    if (handledInitialSelectedRecordIdsRef.current === selectionKey) return;
    handledInitialSelectedRecordIdsRef.current = selectionKey;
    const available = new Set(result.records.map((record: ProjectedDatabaseRecord) => record.id));
    setSelectedRecordIds(
      new Set(initialSelectedRecordIds.filter((recordId: string) => available.has(recordId))),
    );
  }, [open, initialSelectedRecordIds, result, setSelectedRecordIds]);

  const planBoardTransition = (transition: DatabaseBoardTransition) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: description.database,
          source: description.source,
          changes: transition.changes.map((change) => ({
            record: transition.record,
            property: change.property,
            value: change.value,
          })),
        }),
        'ui-board-transition',
        'Board transition failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the Board transition'));
    }
  };

  const planTimelineChange = (change: DatabaseTimelineChange) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: description.database,
          source: description.source,
          changes: change.changes.map((item) => ({
            record: change.record,
            property: item.property,
            value: item.value,
          })),
        }),
        'ui-timeline-date-change',
        'Timeline date change failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the Timeline change'));
    }
  };

  const planCalendarChange = (change: DatabaseCalendarChange) => {
    if (!description?.source || mutationStatus !== 'idle') return;
    try {
      runMutation(
        createDatabaseTablePasteDesiredState({
          database: description.database,
          source: description.source,
          changes: change.changes.map((item) => ({
            record: change.record,
            property: item.property,
            value: item.value,
          })),
        }),
        'ui-calendar-date-change',
        'Calendar date change failed',
      );
    } catch (cause) {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to prepare the Calendar change'));
    }
  };

  const copySelectedRecords = () => {
    if (!description?.source || !result || selectedRecordIds.size === 0) return;
    if (!navigator.clipboard?.writeText) {
      setMutationError(
        classifyDatabaseUiProblem(new Error('Clipboard access is unavailable'), 'Copy failed'),
      );
      return;
    }
    const records = result.records.filter((record: ProjectedDatabaseRecord) =>
      selectedRecordIds.has(record.id),
    );
    const tsv = databaseRecordsToTsv({
      source: description.source,
      records,
      people: description.database.people,
    });
    void navigator.clipboard.writeText(tsv).catch((cause: unknown) => {
      setMutationError(classifyDatabaseUiProblem(cause, 'Unable to copy selected records'));
    });
  };

  const collectDatabaseSnapshot = async (scope: 'current' | 'all') => {
    if (!selection) throw new Error('Select a database source first');
    let exported: DatabaseQueryResult | null = null;
    let cursor: string | undefined;
    do {
      const page = await queryDatabase({
        ...selection,
        query: {
          sort: [],
          includeArchived: scope === 'all' ? true : showArchived,
          page: { limit: 500, ...(cursor ? { cursor } : {}) },
        },
      });
      exported = exported ? appendDatabaseQueryPage(exported, page) : page;
      if (exported.returned > DATABASE_EXPORT_RECORD_LIMIT) {
        throw new Error(
          `A complete browser snapshot is limited to ${DATABASE_EXPORT_RECORD_LIMIT} records; narrow the source first`,
        );
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    if (!exported) throw new Error('Database query returned no snapshot');
    if (!exported.isComplete || exported.nextCursor !== null) {
      throw new Error('Database query did not return a complete snapshot');
    }
    return exported;
  };

  const exportDatabase = (format: 'csv' | 'json', scope: 'current' | 'all') => {
    if (!selection || !description?.source || csvStatus !== 'idle') return;
    const selectedSource = description.source;
    const selectedDescription = description;
    setCsvStatus(
      format === 'json'
        ? 'exporting-json'
        : scope === 'all'
          ? 'exporting-all'
          : 'exporting-current',
    );
    setMutationError(null);
    void (async () => {
      const exported = await collectDatabaseSnapshot(scope);
      const sourceFilename = selectedSource.key.replaceAll(/[^a-zA-Z0-9_-]/g, '-');
      const scopeFilename = scope === 'all' ? 'all' : 'current';
      if (format === 'csv') {
        downloadTextFile(
          databaseRecordsToCsv({
            source: selectedSource,
            records: exported.records,
            people: selectedDescription.database.people,
          }),
          `${sourceFilename}-${scopeFilename}.csv`,
          'text/csv;charset=utf-8',
        );
      } else {
        downloadTextFile(
          databaseSnapshotToJson({
            database: selectedDescription.database,
            source: selectedSource,
            manifestRevision: selectedDescription.manifestRevision,
            schemaRevision: selectedDescription.schemaRevision,
            indexRevision: selectedDescription.index.revision,
            result: exported,
            scope,
          }),
          `${sourceFilename}-${scopeFilename}.json`,
          'application/json;charset=utf-8',
        );
      }
    })()
      .catch((cause: unknown) => {
        setMutationError(classifyDatabaseUiProblem(cause, 'Unable to export database data'));
      })
      .finally(() => setCsvStatus('idle'));
  };

  return {
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
  };
}
