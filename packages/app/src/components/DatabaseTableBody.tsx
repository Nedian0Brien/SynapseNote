import { TableBody } from '@/components/ui/table';
import { DatabaseTableNewRecordRow } from './DatabaseTableNewRecordRow';
import { DatabaseTableRecordRow } from './DatabaseTableRecordRow';
import { DatabaseTableVirtualSpacerRow } from './DatabaseTableVirtualSpacerRow';
import type { DatabaseTableBodyProps } from './database-table-body-types';
export function DatabaseTableBody({
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
  onCreateRecord,
  onSelectionChange,
  onPaste,
  onRelationSearch,
  onInvokeButton,
  onVerificationAction,
  draggedRecordId,
  dropTarget,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
}: DatabaseTableBodyProps) {
  const structuralColumnCount = properties.length + (notionSurface ? 2 : 3);

  return (
    <TableBody>
      {virtualized && virtualStart > 0 ? (
        <DatabaseTableVirtualSpacerRow
          colSpan={structuralColumnCount}
          height={virtualStart * rowHeightPixels}
        />
      ) : null}
      {renderedRecords.map(({ record, ghostCreated, rowIndex }) => (
        <DatabaseTableRecordRow
          key={record.id}
          databaseId={databaseId}
          viewId={viewId}
          source={source}
          result={result}
          people={people}
          relationRecords={relationRecords}
          notionSurface={notionSurface}
          ghost={ghost}
          optimisticCellValues={optimisticCellValues}
          mutationLocked={mutationLocked}
          properties={properties}
          personLabels={personLabels}
          missingFileLabel={missingFileLabel}
          layout={layout}
          conditionalColorRules={conditionalColorRules}
          geometry={geometry}
          selectedRecordIds={selectedRecordIds}
          rowHeightPixels={rowHeightPixels}
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
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onArchive={onArchive}
          onRequestMove={onRequestMove}
          onOpen={onOpen}
          onOpenContextInspector={onOpenContextInspector}
          onOpenAgentScope={onOpenAgentScope}
          onSelectionChange={onSelectionChange}
          onPaste={onPaste}
          onRelationSearch={onRelationSearch}
          onInvokeButton={onInvokeButton}
          onVerificationAction={onVerificationAction}
          record={record}
          ghostCreated={ghostCreated}
          rowIndex={rowIndex}
          dragging={draggedRecordId === record.id}
          dropEdge={dropTarget?.recordId === record.id ? dropTarget.edge : null}
          onRowDragOver={(event) => onRowDragOver(record, event)}
          onRowDragLeave={(event) => onRowDragLeave(record, event)}
          onRowDrop={(event) => onRowDrop(record, event)}
        />
      ))}
      {virtualized && virtualEnd < tableRecords.length ? (
        <DatabaseTableVirtualSpacerRow
          colSpan={structuralColumnCount}
          height={(tableRecords.length - virtualEnd) * rowHeightPixels}
        />
      ) : null}
      <DatabaseTableNewRecordRow
        recordCount={tableRecords.length}
        properties={properties}
        layout={layout}
        notionSurface={notionSurface}
        geometry={geometry}
        mutationLocked={mutationLocked}
        setEditError={setEditError}
        onCreateRecord={onCreateRecord}
      />
    </TableBody>
  );
}
