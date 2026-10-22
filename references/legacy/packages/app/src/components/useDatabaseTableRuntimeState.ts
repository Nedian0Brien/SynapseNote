import { useLingui } from '@lingui/react/macro';
import type { ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';
import { useEffect } from 'react';
import { useDatabasePresenceTarget, useRemoteDatabasePresence } from '@/lib/database-presence';
import { createDatabaseTableGeometry } from '@/lib/database-table-geometry';
import { databaseTableRowHeightPixels } from '@/lib/database-table-layout';
import type { DatabaseTableProps } from './database-table-types';
import {
  initialCellDraft,
  normalizedCellRange,
  projectedGhostValues,
} from './database-table-utils';
import { createDatabaseTableVirtualRows } from './database-table-virtual-rows';
import { useDatabaseTableInteractionState } from './useDatabaseTableInteractionState';
import { useDatabaseTableLayoutModel } from './useDatabaseTableLayoutModel';
import { useDatabaseTableViewState } from './useDatabaseTableViewState';

const EMPTY_SELECTED_RECORD_IDS = new Set<string>();

type RuntimeStateOptions = Pick<
  DatabaseTableProps,
  | 'databaseId'
  | 'viewId'
  | 'source'
  | 'notionSurface'
  | 'result'
  | 'ghost'
  | 'mutationLocked'
  | 'selectedRecordIds'
  | 'viewPropertyIds'
  | 'viewConfiguration'
  | 'initialViewState'
  | 'onViewStateChange'
  | 'onViewPropertyIdsChange'
  | 'onCreateRecord'
  | 'autoFocusNewRecord'
  | 'focusNewRecordRequest'
  | 'focusCreatedRecordRequest'
>;

/**
 * State and derived table model shared by the canonical and inline renderers.
 * Keeping geometry, focus, virtualization, and grid drafts together prevents
 * the composition component from becoming a second workspace controller.
 */
export function useDatabaseTableRuntimeState({
  databaseId = '',
  viewId = null,
  source,
  notionSurface = false,
  result,
  ghost = null,
  mutationLocked = false,
  selectedRecordIds,
  viewPropertyIds,
  viewConfiguration,
  initialViewState,
  onViewStateChange,
  onViewPropertyIdsChange,
  onCreateRecord,
  autoFocusNewRecord = false,
  focusNewRecordRequest = null,
  focusCreatedRecordRequest = null,
}: RuntimeStateOptions) {
  const { i18n, t } = useLingui();
  const personLabels = { agent: t`agent`, inactive: t`inactive` };
  const missingFileLabel = t`missing`;
  const {
    allProperties,
    layout,
    setLayout,
    sourcePropertyIdsKey,
    visibleLayoutPropertyIds,
    visibleProperties,
    properties,
    updatePropertyLayout,
  } = useDatabaseTableLayoutModel({
    source,
    viewPropertyIds,
    viewConfiguration,
    onViewPropertyIdsChange,
  });
  const geometry = createDatabaseTableGeometry({
    surfaceMode: notionSurface ? 'inline' : 'canonical',
    properties,
    layout,
  });
  const titleProperty = allProperties.find((property) => property.type === 'title');
  const omittedColumnCount = visibleProperties.length - properties.length;
  const computedErrorSummaries = new Map<string, { count: number; codes: ReadonlySet<string> }>();
  for (const record of result.records) {
    for (const property of allProperties) {
      if (property.type !== 'formula' && property.type !== 'rollup') continue;
      const computedResult = record.computedResults?.[property.id];
      if (computedResult?.kind !== 'error') continue;
      const current = computedErrorSummaries.get(property.id);
      const codes = new Set(current?.codes ?? []);
      codes.add(computedResult.problem.code);
      computedErrorSummaries.set(property.id, {
        count: (current?.count ?? 0) + 1,
        codes,
      });
    }
  }
  const canonicalIds = new Set(result.records.map((record) => record.id));
  const conditionalColorRules = new Map(
    (result.conditionalColors?.rules ?? []).map((rule) => [rule.id, rule] as const),
  );
  const tableRecords: Array<{ record: ProjectedDatabaseRecord; ghostCreated: boolean }> = [
    ...result.records.map((record) => ({ record, ghostCreated: false })),
    ...(ghost?.diff.records ?? [])
      .filter(
        (record) =>
          record.action === 'create' &&
          record.after !== null &&
          record.sourceId === source.id &&
          !canonicalIds.has(record.recordId),
      )
      .map((record) => ({
        record: {
          id: record.recordId,
          path: record.path,
          revision: null,
          values: projectedGhostValues(record.after?.values ?? {}),
        },
        ghostCreated: true,
      })),
  ];
  const {
    editing,
    setEditing,
    editError,
    setEditError,
    addPropertyOpen,
    setAddPropertyOpen,
    newPropertyName,
    setNewPropertyName,
    newPropertyType,
    setNewPropertyType,
    propertyInsertTarget,
    setPropertyInsertTarget,
    propertyRenameTarget,
    setPropertyRenameTarget,
    propertyRenameDraft,
    setPropertyRenameDraft,
    cellRange,
    setCellRange,
    gridAnnouncement,
    setGridAnnouncement,
    cellMenu,
    setCellMenu,
    rowMenu,
    setRowMenu,
    cellMenuRef,
    rowMenuRef,
    editFocusRef,
  } = useDatabaseTableInteractionState();
  useDatabasePresenceTarget(
    editing && databaseId
      ? {
          databaseId,
          sourceId: source.id,
          recordId: editing.recordId,
          propertyId: editing.propertyId,
          viewId,
          scope: 'cell',
          operation: 'editing',
        }
      : null,
  );
  const remotePresence = useRemoteDatabasePresence();
  const {
    scrollTop,
    viewportHeight,
    setScrollTop,
    setScrollLeft,
    setViewportHeight,
    tableHostRef,
    scrollContainerRef,
    viewStateRef,
    autoFocusNewRecordConsumedRef,
    focusCreatedRecordConsumedRef,
    restoredViewStateRef,
    updateViewState,
  } = useDatabaseTableViewState({ initialViewState, onViewStateChange });

  const resultRecordIdsKey = result.records.map((record) => record.id).join('\0');
  const renderedPropertyIdsKey = properties.map((property) => property.id).join('\0');
  // Schema and query results now update a mounted table instead of replacing
  // it. Reconcile only state whose stable target disappeared; valid edits,
  // focus, scroll, and dialogs survive a revision-only refresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: serialized stable IDs intentionally define the reconciliation boundary.
  useEffect(() => {
    const recordIds = new Set(result.records.map((record) => record.id));
    const propertyIds = new Set(allProperties.map((property) => property.id));
    setEditing((current) =>
      current && recordIds.has(current.recordId) && propertyIds.has(current.propertyId)
        ? current
        : null,
    );
    setPropertyRenameTarget((current) => {
      if (!current) return null;
      return allProperties.find((property) => property.id === current.id) ?? null;
    });
    setPropertyInsertTarget((current) =>
      current && propertyIds.has(current.propertyId) ? current : null,
    );
    setCellMenu((current) =>
      current && current.row < result.records.length && current.column < properties.length
        ? current
        : null,
    );
    setRowMenu((current) =>
      current && recordIds.has(current.recordId) && current.anchor.isConnected ? current : null,
    );
    setCellRange((current) =>
      current &&
      current.focusRow < result.records.length &&
      current.anchorRow < result.records.length &&
      current.focusColumn < properties.length &&
      current.anchorColumn < properties.length
        ? current
        : null,
    );
    const focusedCell = viewStateRef.current.focusedCell;
    if (
      focusedCell &&
      (!recordIds.has(focusedCell.recordId) || !propertyIds.has(focusedCell.propertyId))
    ) {
      const { focusedCell: _removed, ...nextViewState } = viewStateRef.current;
      viewStateRef.current = nextViewState;
      onViewStateChange?.(nextViewState);
    }
  }, [resultRecordIdsKey, sourcePropertyIdsKey, renderedPropertyIdsKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: announcement setters are stable state dispatchers.
  useEffect(() => {
    if (editing) {
      const property = properties.find((candidate) => candidate.id === editing.propertyId);
      setGridAnnouncement(
        `Editing ${property?.name ?? 'cell'}. Press Enter to save or Escape to cancel.`,
      );
      return;
    }
    if (!cellRange) return;
    const normalized = normalizedCellRange(cellRange);
    const selectedCount =
      (normalized.rowEnd - normalized.rowStart + 1) *
      (normalized.columnEnd - normalized.columnStart + 1);
    const property = properties[cellRange.focusColumn];
    setGridAnnouncement(
      `Row ${cellRange.focusRow + 1}, ${property?.name ?? `Column ${cellRange.focusColumn + 1}`}. ${selectedCount} cell${selectedCount === 1 ? '' : 's'} selected.`,
    );
  }, [cellRange, editing, properties]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the menu ref is stable and only the menu target drives focus.
  useEffect(() => {
    if (!cellMenu) return;
    cellMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [cellMenu]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restoration intentionally runs once per initial view-state identity.
  useEffect(() => {
    if (!initialViewState || restoredViewStateRef.current) return;
    let frame = 0;
    frame = requestAnimationFrame(() => {
      restoredViewStateRef.current = true;
      const container = scrollContainerRef.current;
      if (container) {
        const hasVerticalGeometry = container.scrollHeight > container.clientHeight;
        const hasHorizontalGeometry = container.scrollWidth > container.clientWidth;
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
        const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
        const nextScrollTop = hasVerticalGeometry
          ? Math.min(Math.max(0, initialViewState.scrollTop), maxScrollTop)
          : Math.max(0, initialViewState.scrollTop);
        const nextScrollLeft = hasHorizontalGeometry
          ? Math.min(Math.max(0, initialViewState.scrollLeft ?? 0), maxScrollLeft)
          : Math.max(0, initialViewState.scrollLeft ?? 0);
        container.scrollTop = nextScrollTop;
        container.scrollLeft = nextScrollLeft;
        setScrollTop(nextScrollTop);
        setScrollLeft(nextScrollLeft);
        updateViewState({ scrollTop: nextScrollTop, scrollLeft: nextScrollLeft });
      }
      if (
        autoFocusNewRecord ||
        focusNewRecordRequest !== null ||
        focusCreatedRecordRequest !== null
      )
        return;
      const focusedCell = initialViewState.focusedCell;
      if (!focusedCell) return;
      const rowIndex = result.records.findIndex((record) => record.id === focusedCell.recordId);
      const columnIndex = properties.findIndex(
        (property) => property.id === focusedCell.propertyId,
      );
      if (rowIndex < 0 || columnIndex < 0) return;
      tableHostRef.current
        ?.querySelector<HTMLElement>(
          `[data-database-cell-row="${rowIndex}"][data-database-cell-column="${columnIndex}"]`,
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    autoFocusNewRecord,
    focusCreatedRecordRequest,
    focusNewRecordRequest,
    initialViewState,
    properties,
    result.records,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: ref-backed focus request is consumed once per request.
  useEffect(() => {
    if (focusNewRecordRequest === null && !autoFocusNewRecord) {
      autoFocusNewRecordConsumedRef.current = null;
      return;
    }
    if (focusCreatedRecordRequest !== null) return;
    const focusRequest = autoFocusNewRecord
      ? 'inline'
      : focusNewRecordRequest === null || focusNewRecordRequest === undefined
        ? null
        : focusNewRecordRequest;
    if (
      focusRequest === null ||
      autoFocusNewRecordConsumedRef.current === focusRequest ||
      mutationLocked ||
      !onCreateRecord
    ) {
      return;
    }
    let frame = 0;
    frame = window.requestAnimationFrame(() => {
      const button = tableHostRef.current?.querySelector<HTMLButtonElement>(
        '[data-testid="database-new-row-create"]',
      );
      if (!button || mutationLocked) return;
      button.focus();
      autoFocusNewRecordConsumedRef.current = focusRequest;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    autoFocusNewRecord,
    focusCreatedRecordRequest,
    focusNewRecordRequest,
    mutationLocked,
    onCreateRecord,
  ]);

  // A committed blank-page create carries its stable record identity so the
  // table can open the exact Title editor after the canonical refresh lands.
  // biome-ignore lint/correctness/useExhaustiveDependencies: serialized record IDs and the request identity define this handoff boundary.
  useEffect(() => {
    if (!focusCreatedRecordRequest) return;
    const focusToken = `${focusCreatedRecordRequest.recordId}:${focusCreatedRecordRequest.requestId}`;
    if (focusCreatedRecordConsumedRef.current === focusToken || mutationLocked) return;
    const record = result.records.find(
      (candidate) => candidate.id === focusCreatedRecordRequest.recordId,
    );
    const renderedTitleProperty = properties.find((property) => property.type === 'title');
    if (!record || !renderedTitleProperty) return;

    const rowIndex = result.records.findIndex((candidate) => candidate.id === record.id);
    const rowHeight = notionSurface
      ? layout.rowHeight === 'tall'
        ? 72
        : layout.rowHeight === 'compact'
          ? 30
          : 34
      : databaseTableRowHeightPixels(layout.rowHeight);
    const container = scrollContainerRef.current;
    if (container && rowIndex >= 0) {
      const rowTop = rowIndex * rowHeight;
      const rowBottom = rowTop + rowHeight;
      const viewportBottom = container.scrollTop + container.clientHeight;
      if (rowTop < container.scrollTop || rowBottom > viewportBottom) {
        const nextScrollTop = Math.max(0, rowBottom - container.clientHeight);
        container.scrollTop = nextScrollTop;
        setScrollTop(nextScrollTop);
        updateViewState({ scrollTop: nextScrollTop });
      }
    }

    setEditError(null);
    const draft = initialCellDraft(renderedTitleProperty, record.values[renderedTitleProperty.id]);
    setEditing({
      recordId: record.id,
      propertyId: renderedTitleProperty.id,
      draft,
      initialDraft: draft,
    });
    focusCreatedRecordConsumedRef.current = focusToken;
  }, [
    focusCreatedRecordRequest,
    mutationLocked,
    notionSurface,
    properties,
    resultRecordIdsKey,
    sourcePropertyIdsKey,
  ]);

  const allLoadedSelected =
    result.records.length > 0 &&
    result.records.every((record) =>
      (selectedRecordIds ?? EMPTY_SELECTED_RECORD_IDS).has(record.id),
    );

  const rowHeightPixels = notionSurface
    ? layout.rowHeight === 'tall'
      ? 72
      : layout.rowHeight === 'compact'
        ? 30
        : 34
    : databaseTableRowHeightPixels(layout.rowHeight);
  const virtualRows = createDatabaseTableVirtualRows({
    tableRecords,
    rowHeightPixels,
    scrollTop,
    viewportHeight,
    virtualizationThreshold: ghost ? Number.POSITIVE_INFINITY : 40,
  });

  return {
    i18n,
    personLabels,
    missingFileLabel,
    allProperties,
    layout,
    setLayout,
    visibleLayoutPropertyIds,
    properties,
    geometry,
    titleProperty,
    omittedColumnCount,
    computedErrorSummaries,
    tableRecords,
    conditionalColorRules,
    editing,
    setEditing,
    remotePresence,
    editError,
    setEditError,
    addPropertyOpen,
    setAddPropertyOpen,
    newPropertyName,
    setNewPropertyName,
    newPropertyType,
    setNewPropertyType,
    propertyInsertTarget,
    setPropertyInsertTarget,
    propertyRenameTarget,
    setPropertyRenameTarget,
    propertyRenameDraft,
    setPropertyRenameDraft,
    cellRange,
    setCellRange,
    gridAnnouncement,
    setGridAnnouncement,
    cellMenu,
    setCellMenu,
    rowMenu,
    setRowMenu,
    scrollTop,
    setScrollTop,
    setScrollLeft,
    setViewportHeight,
    tableHostRef,
    scrollContainerRef,
    cellMenuRef,
    rowMenuRef,
    editFocusRef,
    viewStateRef,
    updateViewState,
    allLoadedSelected,
    rowHeightPixels,
    ...virtualRows,
    updatePropertyLayout,
  };
}
