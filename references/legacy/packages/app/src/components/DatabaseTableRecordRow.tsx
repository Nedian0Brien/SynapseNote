import type { ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';
import { Check } from 'lucide-react';
import type { DragEventHandler } from 'react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { DatabaseTableDataCell } from './DatabaseTableDataCell';
import { DatabaseTableRowActions } from './DatabaseTableRowActions';
import type { DatabaseTableBodyProps } from './database-table-body-types';
import { DATABASE_CONDITIONAL_COLOR_CLASSES, displayValue } from './database-table-utils';

export interface DatabaseTableRecordRowProps
  extends Pick<
    DatabaseTableBodyProps,
    | 'databaseId'
    | 'viewId'
    | 'source'
    | 'result'
    | 'people'
    | 'relationRecords'
    | 'notionSurface'
    | 'ghost'
    | 'optimisticCellValues'
    | 'mutationLocked'
    | 'properties'
    | 'personLabels'
    | 'missingFileLabel'
    | 'layout'
    | 'conditionalColorRules'
    | 'geometry'
    | 'selectedRecordIds'
    | 'rowHeightPixels'
    | 'cellRange'
    | 'setCellRange'
    | 'setCellMenu'
    | 'setGridAnnouncement'
    | 'setEditError'
    | 'editing'
    | 'setEditing'
    | 'remotePresence'
    | 'locale'
    | 'rangeTsv'
    | 'applyTsvAtCell'
    | 'focusCell'
    | 'beginEdit'
    | 'saveEdit'
    | 'cancelEdit'
    | 'updateViewState'
    | 'onEdit'
    | 'onCreateSelectOption'
    | 'onReorderSelectOptions'
    | 'onDelete'
    | 'onDuplicate'
    | 'onArchive'
    | 'onRequestMove'
    | 'onOpen'
    | 'onOpenContextInspector'
    | 'onOpenAgentScope'
    | 'onSelectionChange'
    | 'onPaste'
    | 'onRelationSearch'
    | 'onInvokeButton'
    | 'onVerificationAction'
  > {
  record: ProjectedDatabaseRecord;
  ghostCreated: boolean;
  rowIndex: number;
  dragging: boolean;
  dropEdge: 'before' | 'after' | null;
  onRowDragOver?: DragEventHandler<HTMLTableRowElement>;
  onRowDragLeave?: DragEventHandler<HTMLTableRowElement>;
  onRowDrop?: DragEventHandler<HTMLTableRowElement>;
}

export function DatabaseTableRecordRow({
  databaseId,
  viewId,
  source,
  result,
  people,
  relationRecords,
  notionSurface,
  ghost,
  optimisticCellValues,
  mutationLocked,
  properties,
  personLabels,
  missingFileLabel,
  layout,
  conditionalColorRules,
  geometry,
  selectedRecordIds,
  rowHeightPixels,
  cellRange,
  setCellRange,
  setCellMenu,
  setGridAnnouncement,
  setEditError,
  editing,
  setEditing,
  remotePresence,
  locale,
  rangeTsv,
  applyTsvAtCell,
  focusCell,
  beginEdit,
  saveEdit,
  cancelEdit,
  updateViewState,
  onEdit,
  onCreateSelectOption,
  onReorderSelectOptions,
  onDelete,
  onDuplicate,
  onArchive,
  onRequestMove,
  onOpen,
  onOpenContextInspector,
  onOpenAgentScope,
  onSelectionChange,
  onPaste,
  onRelationSearch,
  onInvokeButton,
  onVerificationAction,
  record,
  ghostCreated,
  rowIndex,
  dragging,
  dropEdge,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
}: DatabaseTableRecordRowProps) {
  const titleProperty = properties.find((property) => property.type === 'title');
  const recordTitle = titleProperty
    ? displayValue(
        titleProperty,
        record.values[titleProperty.id],
        people,
        relationRecords,
        personLabels,
        result.fileStates,
        missingFileLabel,
        locale,
      ).trim()
    : '';
  const recordLabel = notionSurface && recordTitle && recordTitle !== '—' ? recordTitle : record.id;
  const recordActionLabel = (action: string) =>
    `${action} ${notionSurface ? 'page' : 'record'} ${recordLabel}`;
  const conditionalColorRecord = result.conditionalColors?.records[record.id];
  const pageColorRule = conditionalColorRecord?.pageRuleId
    ? conditionalColorRules.get(conditionalColorRecord.pageRuleId)
    : undefined;
  const proposedRecord = ghost?.diff.records.find((candidate) => candidate.recordId === record.id);
  const proposedDeletion = proposedRecord?.action === 'delete';
  const proposedArchiveAction =
    proposedRecord?.action === 'update' &&
    proposedRecord.before?.archivedAt !== proposedRecord.after?.archivedAt
      ? proposedRecord.after?.archivedAt
        ? 'archive'
        : 'restore'
      : null;
  const proposedMove = proposedRecord?.action === 'move';
  const nonCanonical = ghostCreated || proposedRecord !== undefined;
  const rowOpen = notionSurface ? onOpen : undefined;
  const toggleSelection = () => {
    const next = new Set(selectedRecordIds);
    if (next.has(record.id)) next.delete(record.id);
    else next.add(record.id);
    onSelectionChange?.(next);
  };
  const selectionButton =
    !notionSurface && !ghostCreated ? (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={recordActionLabel('Select')}
        aria-checked={selectedRecordIds.has(record.id)}
        role="checkbox"
        data-slot="checkbox"
        data-state={selectedRecordIds.has(record.id) ? 'checked' : 'unchecked'}
        className={
          notionSurface
            ? 'pointer-events-auto h-5 w-4 shrink-0 rounded-sm border-0 bg-transparent p-0 text-muted-foreground opacity-0 shadow-none transition-opacity hover:bg-muted hover:text-foreground group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:opacity-100'
            : 'size-4 shrink-0 rounded border border-input p-0 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground'
        }
        disabled={!onSelectionChange || mutationLocked || proposedRecord !== undefined}
        onClick={toggleSelection}
      >
        {selectedRecordIds.has(record.id) ? <Check className="size-3" /> : null}
      </Button>
    ) : null;
  const rowActions = (
    <DatabaseTableRowActions
      databaseId={databaseId}
      viewId={viewId}
      source={source}
      record={record}
      recordLabel={recordLabel}
      notionSurface={notionSurface}
      mutationLocked={mutationLocked}
      ghostCreated={ghostCreated}
      proposedRecord={proposedRecord}
      proposedDeletion={proposedDeletion}
      proposedArchiveAction={proposedArchiveAction}
      proposedMove={proposedMove}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onArchive={onArchive}
      onRequestMove={onRequestMove}
      onOpen={rowOpen}
      onOpenContextInspector={onOpenContextInspector}
      onOpenAgentScope={onOpenAgentScope}
    />
  );

  return (
    <TableRow
      aria-rowindex={rowIndex + 2}
      aria-selected={selectedRecordIds.has(record.id)}
      data-record-id={record.id}
      data-record-label={recordLabel}
      data-database-machine-object="record"
      data-canonical={nonCanonical ? 'false' : 'true'}
      data-proposed-deletion={proposedDeletion ? 'true' : undefined}
      data-database-row-dragging={dragging ? 'true' : undefined}
      data-database-row-drop-edge={dropEdge ?? undefined}
      data-conditional-color={pageColorRule?.color}
      data-conditional-color-rule={pageColorRule?.id}
      className={cn(
        notionSurface && 'group/row',
        pageColorRule && DATABASE_CONDITIONAL_COLOR_CLASSES[pageColorRule.color],
        nonCanonical && 'border-primary/40 border-dashed bg-primary/5',
        proposedDeletion && 'opacity-70',
        dragging && 'opacity-45',
      )}
      style={{ height: rowHeightPixels }}
      onDragOver={onRowDragOver}
      onDragLeave={onRowDragLeave}
      onDrop={onRowDrop}
    >
      {!notionSurface ? (
        <TableCell
          role="gridcell"
          aria-colindex={1}
          className={cn(
            'relative sticky left-0 z-20 bg-background',
            pageColorRule && DATABASE_CONDITIONAL_COLOR_CLASSES[pageColorRule.color],
          )}
        >
          {selectionButton}
        </TableCell>
      ) : null}
      {properties.map((property, propertyIndex) => (
        <DatabaseTableDataCell
          key={property.id}
          databaseId={databaseId}
          source={source}
          result={result}
          people={people}
          relationRecords={relationRecords}
          notionSurface={notionSurface}
          optimisticCellValues={optimisticCellValues}
          mutationLocked={mutationLocked}
          personLabels={personLabels}
          missingFileLabel={missingFileLabel}
          layout={layout}
          conditionalColorRules={conditionalColorRules}
          cellRange={cellRange}
          setCellRange={setCellRange}
          setCellMenu={setCellMenu}
          setGridAnnouncement={setGridAnnouncement}
          setEditError={setEditError}
          editing={editing}
          setEditing={setEditing}
          remotePresence={remotePresence}
          locale={locale}
          rangeTsv={rangeTsv}
          applyTsvAtCell={applyTsvAtCell}
          focusCell={focusCell}
          beginEdit={beginEdit}
          saveEdit={saveEdit}
          cancelEdit={cancelEdit}
          updateViewState={updateViewState}
          onEdit={onEdit}
          onCreateSelectOption={onCreateSelectOption}
          onReorderSelectOptions={onReorderSelectOptions}
          onPaste={onPaste}
          onRelationSearch={onRelationSearch}
          onInvokeButton={onInvokeButton}
          onVerificationAction={onVerificationAction}
          onOpen={onOpen}
          record={record}
          property={property}
          propertyIndex={propertyIndex}
          rowIndex={rowIndex}
          ghostCreated={ghostCreated}
          proposedRecord={proposedRecord}
          proposedDeletion={proposedDeletion}
          proposedMove={proposedMove}
          recordLabel={recordLabel}
          geometry={geometry}
          trailingContent={notionSurface && propertyIndex === 0 ? rowActions : undefined}
        />
      ))}
      {notionSurface ? (
        <>
          <TableCell
            role="gridcell"
            aria-colindex={properties.length + 1}
            className="p-0"
            data-database-actions-column
          />
          <TableCell
            role="presentation"
            aria-hidden="true"
            className="pointer-events-none p-0"
            data-database-table-filler
          />
        </>
      ) : (
        <>
          <TableCell
            role="presentation"
            aria-hidden="true"
            className="pointer-events-none p-0"
            data-database-table-filler
          />
          <TableCell
            role="gridcell"
            aria-colindex={properties.length + 3}
            className="sticky right-0 z-10 text-right"
            data-database-actions-column
          >
            {rowActions}
          </TableCell>
        </>
      )}
    </TableRow>
  );
}
