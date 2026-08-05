import type {
  DatabaseProperty,
  DatabaseValue,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { useEffect, useState } from 'react';
import { isDatabaseCellEditable, parseDatabaseCellDraft } from '@/lib/database-cell-mutation';
import { databaseRangeToTsv, planDatabaseTsvPaste } from '@/lib/database-tsv';
import { nextDatabasePropertyName } from './DatabasePropertyInsertPopover';
import { DatabaseTableComposition } from './DatabaseTableComposition';
import type { DatabaseTableProps } from './database-table-types';
import {
  cellIsInRange,
  errorMessage,
  initialCellDraft,
  invalidExternalValueText,
  normalizedCellRange,
} from './database-table-utils';
import { useDatabaseTableReorder } from './useDatabaseTableReorder';
import { useDatabaseTableRuntimeState } from './useDatabaseTableRuntimeState';

export {
  DatabaseAtomicApprovalScope,
  DatabaseStateNotice,
  databaseSchemaMutationPolicy,
  downloadTextFile,
  searchDatabaseRelationRecords,
} from './DatabaseTablePrimitives';

/**
 * Runtime orchestrator: composes state-model outputs, mutation commands, and
 * the stable table composition. Rendering details live in the canvas, header,
 * record-row, and cell modules; this module owns only their prop wiring.
 */
export function DatabaseTable({
  databaseId = '',
  viewId = null,
  source,
  result,
  people = result.people ?? [],
  relationRecords = result.relationRecords ?? [],
  notionSurface = false,
  ghost = null,
  optimisticCellValues,
  mutationLocked = false,
  searchQuery = '',
  autoFocusNewRecord = false,
  focusNewRecordRequest = null,
  focusCreatedRecordRequest = null,
  selectedRecordIds = new Set<string>(),
  calculations = {},
  viewPropertyIds,
  viewConfiguration,
  onEdit,
  onCreateSelectOption,
  onReorderSelectOptions,
  onDelete,
  onDuplicate,
  onArchive,
  onRequestMove,
  onOpen,
  onOpenContextInspector,
  onOpenPropertyContextInspector,
  onOpenAgentScope,
  onCreateRecord,
  onSelectionChange,
  onReorderRecords,
  onPaste,
  onCalculationChange,
  onRelationSearch,
  onConfigureComputedProperty,
  onConfigureUniqueIdProperty,
  onConfigurePlaceProperty,
  onConfigureSelectProperty,
  onConvertProperty,
  onOpenPropertySort,
  onOpenPropertyFilter,
  onViewPropertyIdsChange,
  onDuplicateProperty,
  onAddProperty,
  onInvokeButton,
  onVerificationAction,
  onManageProperties,
  onRenameProperty,
  onRemoveProperty,
  initialViewState,
  onViewStateChange,
}: DatabaseTableProps) {
  'use no memo';
  const {
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
    setScrollTop,
    setScrollLeft,
    setViewportHeight,
    tableHostRef,
    scrollContainerRef,
    cellMenuRef,
    rowMenuRef,
    editFocusRef,
    updateViewState,
    allLoadedSelected,
    rowHeightPixels,
    virtualized,
    virtualStart,
    virtualEnd,
    renderedRecords,
    updatePropertyLayout,
  } = useDatabaseTableRuntimeState({
    databaseId,
    viewId,
    source,
    notionSurface,
    result,
    ghost,
    mutationLocked,
    selectedRecordIds,
    viewPropertyIds,
    viewConfiguration,
    initialViewState,
    onViewStateChange,
    onViewPropertyIdsChange,
    onCreateRecord,
    autoFocusNewRecord,
    focusNewRecordRequest,
    focusCreatedRecordRequest,
  });
  const reorder = useDatabaseTableReorder({
    result,
    onReorderRecords,
    mutationLocked,
    ghost,
    setGridAnnouncement,
  });
  const hasRowMenuActions = Boolean(
    onOpen ||
      onOpenContextInspector ||
      onOpenAgentScope ||
      onDuplicate ||
      onArchive ||
      onRequestMove ||
      onDelete,
  );
  const [pendingPropertyRequest, setPendingPropertyRequest] = useState<{
    name: string;
    type: DatabaseProperty['type'];
    existingPropertyIds: ReadonlySet<string>;
  } | null>(null);
  const [recentlySavedCellValues, setRecentlySavedCellValues] = useState<
    ReadonlyMap<string, DatabaseValue | undefined>
  >(new Map());

  const displayedCellValues =
    recentlySavedCellValues.size === 0
      ? optimisticCellValues
      : new Map([...(optimisticCellValues ?? []), ...recentlySavedCellValues]);

  // Closing an editor and publishing the workspace's optimistic mutation are
  // separate React updates. Retain the parsed value locally until either the
  // parent optimistic layer or the refreshed canonical record contains it, so
  // the previous value cannot flash between those updates.
  useEffect(() => {
    setRecentlySavedCellValues((current) => {
      if (current.size === 0) return current;
      const next = new Map(current);
      for (const [key, value] of current) {
        const optimisticSettled =
          optimisticCellValues?.has(key) &&
          JSON.stringify(optimisticCellValues.get(key)) === JSON.stringify(value);
        const canonicalSettled = result.records.some((record) =>
          source.properties.some(
            (property) =>
              `${record.id}:${property.id}` === key &&
              JSON.stringify(record.values[property.id]) === JSON.stringify(value),
          ),
        );
        if (optimisticSettled || canonicalSettled) next.delete(key);
      }
      return next.size === current.size ? current : next;
    });
  }, [optimisticCellValues, result.records, source.properties]);

  // Keep the Notion-style picker open until the canonical schema contains the
  // requested property. A mutation may settle before the refresh scheduler
  // publishes the new description; closing on submit made a successful click
  // look like a no-op and made failures impossible to retry in context.
  useEffect(() => {
    if (!addPropertyOpen) {
      if (pendingPropertyRequest) setPendingPropertyRequest(null);
      return;
    }
    const pending = pendingPropertyRequest;
    if (!pending) return;
    const committed = allProperties.some(
      (property) =>
        !pending.existingPropertyIds.has(property.id) &&
        property.name === pending.name &&
        property.type === pending.type,
    );
    if (!committed) return;
    setPendingPropertyRequest(null);
    setAddPropertyOpen(false);
    setPropertyInsertTarget(null);
    setNewPropertyName(nextDatabasePropertyName(newPropertyType, allProperties));
  }, [
    addPropertyOpen,
    allProperties,
    pendingPropertyRequest,
    setAddPropertyOpen,
    setNewPropertyName,
    setPropertyInsertTarget,
    newPropertyType,
  ]);
  const beginEdit = (record: ProjectedDatabaseRecord, property: DatabaseProperty) => {
    const current = record.values[property.id];
    const invalid = record.invalidValues?.[property.id];
    if (!onEdit || mutationLocked || !isDatabaseCellEditable(property)) return;
    setEditError(null);
    const draft =
      invalid === undefined
        ? initialCellDraft(property, current)
        : invalidExternalValueText(invalid);
    setEditing({
      recordId: record.id,
      propertyId: property.id,
      draft,
      initialDraft: draft,
    });
    setGridAnnouncement(`Editing ${property.name}. Press Enter to save or Escape to cancel.`);
  };

  const rememberEditFocus = (record: ProjectedDatabaseRecord, property: DatabaseProperty) => {
    editFocusRef.current = { recordId: record.id, propertyId: property.id };
  };

  const cancelEdit = (record: ProjectedDatabaseRecord, property: DatabaseProperty) => {
    rememberEditFocus(record, property);
    setEditing(null);
    setEditError(null);
    setGridAnnouncement(`Edit cancelled for ${property.name}.`);
  };

  const saveEdit = (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    draftOverride?: string,
  ) => {
    if (!editing || editing.recordId !== record.id || editing.propertyId !== property.id) return;
    try {
      const value = parseDatabaseCellDraft(property, draftOverride ?? editing.draft, people);
      rememberEditFocus(record, property);
      setRecentlySavedCellValues((current) => {
        const next = new Map(current);
        next.set(`${record.id}:${property.id}`, value);
        return next;
      });
      setEditing(null);
      setEditError(null);
      onEdit?.(record, property, value);
      setGridAnnouncement(`Edit saved for ${property.name}.`);
    } catch (cause) {
      setEditError(errorMessage(cause, 'Invalid cell value'));
    }
  };

  // The first pointer interaction outside an active cell editor only closes
  // that editor. Capture it at the window boundary so neither another cell nor
  // an unrelated control can also handle the same interaction. Portaled
  // surfaces owned by an editor opt in through the shared data attribute.
  useEffect(() => {
    if (!editing) return;
    let dismissed = false;

    const isInsideEditor = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest('[data-database-cell-editing="true"], [data-database-cell-editor-surface]'),
      );
    const blockEvent = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const dismissEditor = () => {
      if (dismissed) return;
      dismissed = true;
      const record = result.records.find((candidate) => candidate.id === editing.recordId);
      const property = properties.find((candidate) => candidate.id === editing.propertyId);
      if (!record || !property) {
        setEditing(null);
        setEditError(null);
        return;
      }
      editFocusRef.current = { recordId: record.id, propertyId: property.id };
      if (editing.draft === editing.initialDraft) {
        setEditing(null);
        setEditError(null);
        setGridAnnouncement(`Edit cancelled for ${property.name}.`);
        return;
      }
      try {
        const value = parseDatabaseCellDraft(property, editing.draft, people);
        setRecentlySavedCellValues((current) => {
          const next = new Map(current);
          next.set(`${record.id}:${property.id}`, value);
          return next;
        });
        setEditing(null);
        setEditError(null);
        onEdit?.(record, property, value);
        setGridAnnouncement(`Edit saved for ${property.name}.`);
      } catch (cause) {
        setEditError(errorMessage(cause, 'Invalid cell value'));
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (isInsideEditor(event.target)) return;
      blockEvent(event);

      // Pointer cancellation does not consistently suppress the subsequent
      // synthetic click in every browser. Keep a short-lived capture fence even
      // if the state update unmounts this effect before that click arrives.
      const blockFollowingClick = (clickEvent: MouseEvent) => blockEvent(clickEvent);
      window.addEventListener('click', blockFollowingClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', blockFollowingClick, true), 500);
      dismissEditor();
    };
    const handleClickWithoutPointer = (event: MouseEvent) => {
      if (dismissed || isInsideEditor(event.target)) return;
      blockEvent(event);
      dismissEditor();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('click', handleClickWithoutPointer, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('click', handleClickWithoutPointer, true);
    };
  }, [
    editFocusRef,
    editing,
    onEdit,
    people,
    properties,
    result.records,
    setEditError,
    setEditing,
    setGridAnnouncement,
  ]);

  const createSelectOption = (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'select' | 'multi_select' }>,
    name: string,
    selectedOptionIds: readonly string[],
  ): boolean => {
    if (!onCreateSelectOption || mutationLocked) return false;
    const started = onCreateSelectOption(record, property, name, selectedOptionIds);
    if (!started) return false;
    rememberEditFocus(record, property);
    setEditing(null);
    setEditError(null);
    setGridAnnouncement(`Created and selected ${name} for ${property.name}.`);
    return true;
  };

  // The focus target is intentionally ref-backed: it is populated by the
  // preceding edit event and consumed once after the committed row remounts.
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref-backed focus restoration is event-scoped
  useEffect(() => {
    const pending = editFocusRef.current;
    if (editing || !pending) return;
    const rowIndex = result.records.findIndex((record) => record.id === pending.recordId);
    const columnIndex = properties.findIndex((property) => property.id === pending.propertyId);
    if (rowIndex < 0 || columnIndex < 0) {
      editFocusRef.current = null;
      return;
    }
    const selector = `[data-database-cell-row="${rowIndex}"][data-database-cell-column="${columnIndex}"]`;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        tableHostRef.current?.querySelector<HTMLElement>(selector)?.focus();
        editFocusRef.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [editing, properties, result.records]);

  const focusCell = (rowIndex: number, columnIndex: number, extend: boolean) => {
    if (
      rowIndex < 0 ||
      rowIndex >= result.records.length ||
      columnIndex < 0 ||
      columnIndex >= properties.length
    ) {
      return;
    }
    const nextRange = {
      anchorRow: extend && cellRange ? cellRange.anchorRow : rowIndex,
      anchorColumn: extend && cellRange ? cellRange.anchorColumn : columnIndex,
      focusRow: rowIndex,
      focusColumn: columnIndex,
    };
    setCellRange(nextRange);
    const normalized = normalizedCellRange(nextRange);
    const selectedCount =
      (normalized.rowEnd - normalized.rowStart + 1) *
      (normalized.columnEnd - normalized.columnStart + 1);
    setGridAnnouncement(
      `Row ${rowIndex + 1}, ${properties[columnIndex]?.name ?? `Column ${columnIndex + 1}`}. ${selectedCount} cell${selectedCount === 1 ? '' : 's'} selected.`,
    );
    const focusRenderedCell = () =>
      tableHostRef.current
        ?.querySelector<HTMLElement>(
          `[data-database-cell-row="${rowIndex}"][data-database-cell-column="${columnIndex}"]`,
        )
        ?.focus();
    if (virtualized && (rowIndex < virtualStart || rowIndex >= virtualEnd)) {
      const nextScrollTop = rowIndex * rowHeightPixels;
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = nextScrollTop;
      setScrollTop(nextScrollTop);
      requestAnimationFrame(focusRenderedCell);
      return;
    }
    focusRenderedCell();
  };

  const rangeTsv = (fallbackRow: number, fallbackColumn: number): string => {
    const range = cellIsInRange(cellRange, fallbackRow, fallbackColumn)
      ? cellRange
      : {
          anchorRow: fallbackRow,
          anchorColumn: fallbackColumn,
          focusRow: fallbackRow,
          focusColumn: fallbackColumn,
        };
    if (!range) return '';
    return databaseRangeToTsv({
      records: result.records,
      properties,
      people,
      ...normalizedCellRange(range),
    });
  };

  const applyTsvAtCell = (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    tsv: string,
  ) => {
    if (!onPaste || mutationLocked) return;
    try {
      const changes = planDatabaseTsvPaste({
        source,
        people,
        properties,
        records: result.records,
        anchorRecordId: record.id,
        anchorPropertyId: property.id,
        tsv,
      });
      setEditError(null);
      onPaste(changes);
    } catch (cause) {
      setEditError(errorMessage(cause, 'Invalid TSV paste'));
    }
  };

  const copyCellRange = (row: number, column: number) => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(rangeTsv(row, column));
  };

  const submitAddProperty = () => {
    const name = newPropertyName.trim();
    if (!onAddProperty || !name || mutationLocked) return;
    setPendingPropertyRequest({
      name,
      type: newPropertyType,
      existingPropertyIds: new Set(allProperties.map((property) => property.id)),
    });
    onAddProperty({
      name,
      type: newPropertyType,
      ...(propertyInsertTarget?.position === 'before'
        ? { insertBeforePropertyId: propertyInsertTarget.propertyId }
        : propertyInsertTarget?.position === 'after'
          ? { insertAfterPropertyId: propertyInsertTarget.propertyId }
          : {}),
    });
  };

  const openPropertyInsert = (property: DatabaseProperty, position: 'before' | 'after') => {
    setNewPropertyName(nextDatabasePropertyName(newPropertyType, allProperties));
    setPropertyInsertTarget({ propertyId: property.id, position });
    setAddPropertyOpen(true);
  };

  const openPropertyRename = (property: DatabaseProperty) => {
    setPropertyRenameTarget(property);
    setPropertyRenameDraft(property.name);
  };

  const closePropertyRename = () => {
    setPropertyRenameTarget(null);
    setPropertyRenameDraft('');
  };

  const submitPropertyRename = () => {
    const property = propertyRenameTarget;
    const name = propertyRenameDraft.trim();
    if (!property || !name || !onRenameProperty || mutationLocked) {
      return;
    }
    onRenameProperty(property, name);
    closePropertyRename();
  };

  const tableHeaderProps = {
    databaseId,
    viewId,
    source,
    properties,
    allProperties,
    layout,
    visibleLayoutPropertyIds,
    notionSurface,
    mutationLocked,
    calculations,
    computedErrorSummaries,
    recordIds: result.records.map((record) => record.id),
    allLoadedSelected,
    geometry,
    addPropertyOpen,
    setAddPropertyOpen,
    newPropertyName,
    setNewPropertyName,
    newPropertyType,
    setNewPropertyType,
    propertyInsertTarget,
    setPropertyInsertTarget,
    updatePropertyLayout,
    openPropertyInsert,
    openPropertyRename,
    submitAddProperty,
    onAddProperty,
    onOpenPropertySort,
    onOpenPropertyFilter,
    onOpenPropertyContextInspector,
    onOpenAgentScope,
    onConfigureComputedProperty,
    onConfigureUniqueIdProperty,
    onConfigurePlaceProperty,
    onConfigureSelectProperty,
    onConvertProperty,
    onManageProperties,
    onRenameProperty,
    onDuplicateProperty,
    onRemoveProperty,
    onCalculationChange,
    onSelectionChange,
  };

  const tableBodyProps = {
    databaseId,
    viewId,
    source,
    result,
    people,
    relationRecords,
    notionSurface,
    ghost,
    optimisticCellValues: displayedCellValues,
    mutationLocked,
    properties,
    titleProperty,
    personLabels,
    missingFileLabel,
    layout,
    geometry,
    conditionalColorRules,
    selectedRecordIds,
    tableRecords,
    renderedRecords,
    virtualized,
    virtualStart,
    virtualEnd,
    rowHeightPixels,
    cellRange,
    setCellRange,
    setCellMenu,
    setGridAnnouncement,
    setEditError,
    editing,
    setEditing,
    remotePresence,
    locale: i18n.locale,
    rangeTsv,
    applyTsvAtCell,
    focusCell,
    beginEdit,
    saveEdit,
    cancelEdit,
    updateViewState,
    onEdit,
    onCreateSelectOption: createSelectOption,
    onReorderSelectOptions,
    onDelete,
    onDuplicate,
    onArchive,
    onRequestMove,
    onOpen,
    onOpenContextInspector,
    onOpenAgentScope,
    onCreateRecord,
    onSelectionChange,
    onReorderRecords,
    onPaste,
    onRelationSearch,
    onInvokeButton,
    onVerificationAction,
    reorderEnabled: reorder.reorderEnabled,
    draggedRecordId: reorder.draggedRecordId,
    dropTarget: reorder.dropTarget,
    clearRowDrag: reorder.clearRowDrag,
    startRecordDrag: reorder.startRecordDrag,
    onRowDragOver: reorder.onRowDragOver,
    onRowDragLeave: reorder.onRowDragLeave,
    onRowDrop: reorder.onRowDrop,
  };

  return (
    <DatabaseTableComposition
      notionSurface={notionSurface}
      tableHostRef={tableHostRef}
      controlsProps={{
        propertyRenameTarget,
        propertyRenameDraft,
        setPropertyRenameDraft,
        closePropertyRename,
        submitPropertyRename,
        notionSurface,
        mutationLocked,
        layout,
        setLayout,
        allProperties,
        updatePropertyLayout,
        calculations,
        gridAnnouncement,
        editError,
        result,
        ghost,
        source,
        searchQuery,
        omittedColumnCount,
        onManageProperties,
        onCalculationChange,
      }}
      canvasProps={{
        source,
        result,
        properties,
        tableRecords,
        layout,
        notionSurface,
        geometry,
        scrollContainerRef,
        setScrollTop,
        setScrollLeft,
        setViewportHeight,
        updateViewState,
        headerProps: tableHeaderProps,
        bodyProps: tableBodyProps,
        footerProps: {
          calculations: calculations ?? {},
          properties,
          result,
          notionSurface,
          geometry,
        },
      }}
      interactionProps={{
        enabled: notionSurface,
        tableHostRef,
        scrollContainerRef,
        mutationLocked,
        reorderEnabled: reorder.reorderEnabled,
        canCreatePage: Boolean(onCreateRecord),
        selectedRecordIds,
        rowMenuRecordId: rowMenu?.recordId,
        onAddPage: onCreateRecord ? () => onCreateRecord('') : undefined,
        onToggleSelection: onSelectionChange
          ? (recordId) => {
              const next = new Set(selectedRecordIds);
              if (next.has(recordId)) next.delete(recordId);
              else next.add(recordId);
              onSelectionChange(next);
            }
          : undefined,
        onOpenRecordMenu: hasRowMenuActions
          ? (recordId, recordLabel, anchor) => {
              setCellMenu(null);
              setRowMenu((current) => {
                if (current?.recordId === recordId) return null;
                return { recordId, recordLabel, anchor };
              });
            }
          : undefined,
        onRecordDragStart: (recordId) => reorder.startRecordDrag(recordId),
        onRecordDragEnd: reorder.clearRowDrag,
      }}
      cellMenuProps={{
        cellMenu,
        databaseId,
        source,
        viewId,
        cellMenuRef,
        tableHostRef,
        result,
        properties,
        titleProperty,
        people,
        relationRecords,
        personLabels,
        missingFileLabel,
        locale: i18n.locale,
        notionSurface,
        mutationLocked,
        onEdit,
        onOpen,
        onOpenContextInspector,
        onOpenAgentScope,
        onDuplicate,
        onArchive,
        onRequestMove,
        onDelete,
        beginEdit,
        copyCellRange,
        setCellMenu,
      }}
      rowMenuProps={{
        rowMenu,
        rowMenuRef,
        databaseId,
        source,
        viewId,
        result,
        mutationLocked,
        onOpen,
        onOpenContextInspector,
        onOpenAgentScope,
        onDuplicate,
        onArchive,
        onRequestMove,
        onDelete,
        setRowMenu,
      }}
    />
  );
}
