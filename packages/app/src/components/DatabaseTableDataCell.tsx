import { useLingui } from '@lingui/react/macro';
import type { DatabaseValue, ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';
import { projectDatabaseRichText } from '@nedian0brien/synapsenote-core';
import { TableCell } from '@/components/ui/table';
import { isDatabaseCellEditable } from '@/lib/database-cell-mutation';
import type { DatabaseTableGeometry } from '@/lib/database-table-geometry';
import { cn } from '@/lib/utils';
import { DatabaseTableCellContent } from './DatabaseTableCellContent';
import type { DatabaseTableBodyProps } from './database-table-body-types';
import {
  cellIsInRange,
  DATABASE_CONDITIONAL_COLOR_CLASSES,
  displayComputedResult,
  displayValue,
  invalidExternalValueText,
  normalizedCellRange,
} from './database-table-utils';

export interface DatabaseTableDataCellProps
  extends Pick<
    DatabaseTableBodyProps,
    | 'databaseId'
    | 'source'
    | 'result'
    | 'people'
    | 'relationRecords'
    | 'notionSurface'
    | 'optimisticCellValues'
    | 'mutationLocked'
    | 'personLabels'
    | 'missingFileLabel'
    | 'layout'
    | 'conditionalColorRules'
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
    | 'onPaste'
    | 'onRelationSearch'
    | 'onInvokeButton'
    | 'onVerificationAction'
    | 'onOpen'
  > {
  record: ProjectedDatabaseRecord;
  property: DatabaseTableBodyProps['properties'][number];
  propertyIndex: number;
  rowIndex: number;
  ghostCreated: boolean;
  proposedRecord: DatabaseTableDataCellProposedRecord | undefined;
  proposedDeletion: boolean;
  proposedMove: boolean;
  recordLabel: string;
  geometry: DatabaseTableGeometry;
  trailingContent?: import('react').ReactNode;
}

type DatabaseTableDataCellProposedRecord = NonNullable<
  DatabaseTableBodyProps['ghost']
>['diff']['records'][number];

export function DatabaseTableDataCell({
  databaseId,
  source,
  result,
  people,
  relationRecords,
  notionSurface,
  optimisticCellValues,
  mutationLocked,
  personLabels,
  missingFileLabel,
  layout,
  conditionalColorRules,
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
  onPaste,
  onRelationSearch,
  onInvokeButton,
  onVerificationAction,
  onOpen,
  record,
  property,
  propertyIndex,
  rowIndex,
  ghostCreated,
  proposedRecord,
  proposedDeletion,
  proposedMove,
  recordLabel,
  geometry,
  trailingContent,
}: DatabaseTableDataCellProps) {
  const { t } = useLingui();
  const conditionalColorRecord = result.conditionalColors?.records[record.id];
  const pageColorRule = conditionalColorRecord?.pageRuleId
    ? conditionalColorRules.get(conditionalColorRecord.pageRuleId)
    : undefined;
  const beforeValue = proposedRecord?.before?.values[property.id];
  const afterValue = proposedRecord?.after?.values[property.id];
  const proposed =
    proposedRecord !== undefined &&
    (proposedDeletion || JSON.stringify(beforeValue) !== JSON.stringify(afterValue));
  const optimisticKey = `${record.id}:${property.id}`;
  const baseValue = optimisticCellValues?.has(optimisticKey)
    ? optimisticCellValues.get(optimisticKey)
    : record.values[property.id];
  const shownValue =
    proposedDeletion || proposedMove ? baseValue : proposed ? afterValue : baseValue;
  const propertyColorRuleId = conditionalColorRecord?.propertyRuleIds?.[property.id];
  const propertyColorRule = propertyColorRuleId
    ? conditionalColorRules.get(propertyColorRuleId)
    : undefined;
  const effectiveColorRule = propertyColorRule ?? pageColorRule;
  const computedResult =
    property.type === 'formula' || property.type === 'rollup'
      ? record.computedResults?.[property.id]
      : undefined;
  const verificationProjection =
    property.type === 'verification' ? record.verificationProjections?.[property.id] : undefined;
  const invalidValue = record.invalidValues?.[property.id];
  const invalidIssue = record.issues?.find((issue) => issue.propertyId === property.id);
  const invalidValueText =
    invalidValue === undefined ? null : invalidExternalValueText(invalidValue);
  const shownText =
    invalidValueText !== null
      ? t`Invalid preserved value: ${invalidValueText}${
          invalidIssue ? ` · ${invalidIssue.message}` : ''
        }`
      : computedResult
        ? displayComputedResult(computedResult)
        : property.type === 'verification'
          ? (verificationProjection?.status ?? 'unverified')
          : property.type === 'text' && typeof shownValue === 'string'
            ? !proposed && record.textProjections?.[property.id]
              ? record.textProjections[property.id].plainText
              : projectDatabaseRichText(shownValue).plainText
            : displayValue(
                property,
                shownValue,
                people,
                relationRecords,
                personLabels,
                result.fileStates,
                missingFileLabel,
                locale,
              );
  const cellEditing = editing?.recordId === record.id && editing.propertyId === property.id;
  const cellPresence = remotePresence.filter(
    (entry) =>
      entry.databaseId === databaseId &&
      entry.sourceId === source.id &&
      entry.scope === 'cell' &&
      entry.recordId === record.id &&
      entry.propertyId === property.id,
  );

  return (
    <TableCell
      role="gridcell"
      aria-colindex={propertyIndex + (notionSurface ? 1 : 2)}
      dir="auto"
      className={cn(
        layout.wrap
          ? 'break-words whitespace-normal'
          : 'overflow-hidden truncate whitespace-nowrap',
        onEdit &&
          !mutationLocked &&
          !ghostCreated &&
          !proposed &&
          isDatabaseCellEditable(property) &&
          'cursor-pointer',
        propertyIndex === 0 && 'sticky left-0 z-10 bg-background font-medium',
        notionSurface && propertyIndex === 0 && 'relative pr-16',
        effectiveColorRule && DATABASE_CONDITIONAL_COLOR_CLASSES[effectiveColorRule.color],
        cellIsInRange(cellRange, rowIndex, propertyIndex) &&
          (notionSurface
            ? 'bg-muted/35'
            : 'outline -outline-offset-2 outline-2 outline-primary/70'),
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
        proposed && 'border-primary/40 border-x border-dashed bg-primary/5 text-primary',
        invalidValue !== undefined && 'bg-destructive/5 text-destructive',
      )}
      data-property-id={property.id}
      style={propertyIndex === 0 ? { left: `${geometry.titleStickyInset}px` } : undefined}
      data-database-machine-object="property"
      data-conditional-color={effectiveColorRule?.color}
      data-conditional-color-rule={effectiveColorRule?.id}
      data-canonical={proposed ? 'false' : 'true'}
      title={shownText}
      data-computed-state={computedResult?.kind}
      data-computed-error-code={
        computedResult?.kind === 'error' ? computedResult.problem.code : undefined
      }
      data-computed-error-message={
        computedResult?.kind === 'error' ? computedResult.problem.message : undefined
      }
      data-invalid-preserved={invalidValue !== undefined ? 'true' : undefined}
      tabIndex={
        ghostCreated
          ? -1
          : cellRange
            ? cellRange.focusRow === rowIndex && cellRange.focusColumn === propertyIndex
              ? 0
              : -1
            : rowIndex === 0 && propertyIndex === 0
              ? 0
              : -1
      }
      aria-selected={cellIsInRange(cellRange, rowIndex, propertyIndex)}
      draggable={!ghostCreated && !cellEditing}
      data-database-cell-row={rowIndex}
      data-database-cell-column={propertyIndex}
      data-database-cell-selected={
        cellIsInRange(cellRange, rowIndex, propertyIndex) ? 'true' : undefined
      }
      data-database-cell-editing={cellEditing ? 'true' : undefined}
      onFocus={() => {
        setEditError(null);
        const selectedCount = cellRange
          ? (() => {
              const normalized = normalizedCellRange(cellRange);
              return (
                (normalized.rowEnd - normalized.rowStart + 1) *
                (normalized.columnEnd - normalized.columnStart + 1)
              );
            })()
          : 1;
        setGridAnnouncement(
          `Row ${rowIndex + 1}, ${property.name}. ${selectedCount} cell${selectedCount === 1 ? '' : 's'} selected.`,
        );
        updateViewState({ focusedCell: { recordId: record.id, propertyId: property.id } });
        setCellRange(
          (current) =>
            current ?? {
              anchorRow: rowIndex,
              anchorColumn: propertyIndex,
              focusRow: rowIndex,
              focusColumn: propertyIndex,
            },
        );
      }}
      onClick={(event) => {
        event.stopPropagation();
        setCellMenu(null);
        const next = {
          anchorRow: event.shiftKey && cellRange ? cellRange.anchorRow : rowIndex,
          anchorColumn: event.shiftKey && cellRange ? cellRange.anchorColumn : propertyIndex,
          focusRow: rowIndex,
          focusColumn: propertyIndex,
        };
        const normalized = normalizedCellRange(next);
        const selectedCount =
          (normalized.rowEnd - normalized.rowStart + 1) *
          (normalized.columnEnd - normalized.columnStart + 1);
        setCellRange(next);
        setGridAnnouncement(
          `Row ${rowIndex + 1}, ${property.name}. ${selectedCount} cell${selectedCount === 1 ? '' : 's'} selected.`,
        );
        const interactiveElement =
          event.target instanceof Element
            ? event.target.closest(
                'a, button, input, textarea, select, [contenteditable="true"], [role="button"], [role="checkbox"], [role="combobox"], [role="link"]',
              )
            : null;
        const interactiveTarget =
          interactiveElement !== null && event.currentTarget.contains(interactiveElement);
        if (!event.shiftKey && !cellEditing && !ghostCreated && !proposed && !interactiveTarget) {
          beginEdit(record, property);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!cellIsInRange(cellRange, rowIndex, propertyIndex)) {
          setCellRange({
            anchorRow: rowIndex,
            anchorColumn: propertyIndex,
            focusRow: rowIndex,
            focusColumn: propertyIndex,
          });
        }
        setCellMenu({
          row: rowIndex,
          column: propertyIndex,
          x: event.clientX,
          y: event.clientY,
        });
      }}
      onKeyDown={(event) => {
        if (cellEditing) return;
        if (event.key === 'Escape') {
          setCellMenu(null);
          return;
        }
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          setCellMenu({
            row: rowIndex,
            column: propertyIndex,
            x: bounds.left,
            y: bounds.bottom,
          });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          beginEdit(record, property);
          return;
        }
        const offsets: Record<string, readonly [number, number]> = {
          ArrowUp: [-1, 0],
          ArrowDown: [1, 0],
          ArrowLeft: [0, -1],
          ArrowRight: [0, 1],
        };
        const offset = offsets[event.key];
        if (!offset) return;
        event.preventDefault();
        focusCell(rowIndex + offset[0], propertyIndex + offset[1], event.shiftKey);
      }}
      onCopy={(event) => {
        if (cellEditing) return;
        event.preventDefault();
        event.clipboardData.setData('text/plain', rangeTsv(rowIndex, propertyIndex));
      }}
      onPaste={(event) => {
        if (
          cellEditing ||
          !onPaste ||
          mutationLocked ||
          ghostCreated ||
          (event.target instanceof HTMLElement &&
            event.target.closest('input, textarea, [contenteditable="true"]'))
        ) {
          return;
        }
        event.preventDefault();
        applyTsvAtCell(record, property, event.clipboardData.getData('text/plain'));
      }}
      onDragStart={(event) => {
        if (ghostCreated || cellEditing) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('text/plain', rangeTsv(rowIndex, propertyIndex));
      }}
      onDragOver={(event) => {
        if (!onPaste || mutationLocked || ghostCreated || cellEditing) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (!onPaste || mutationLocked || ghostCreated || cellEditing) return;
        event.preventDefault();
        applyTsvAtCell(record, property, event.dataTransfer.getData('text/plain'));
      }}
    >
      <DatabaseTableCellContent
        property={property}
        record={record}
        people={people}
        relationRecords={relationRecords}
        fileStates={result.fileStates}
        personLabels={personLabels}
        missingFileLabel={missingFileLabel}
        notionSurface={notionSurface}
        mutationLocked={mutationLocked}
        ghostCreated={ghostCreated}
        recordLabel={recordLabel}
        proposed={proposed}
        proposedRecord={proposedRecord}
        shownValue={shownValue as DatabaseValue | undefined}
        shownText={shownText}
        computedResult={computedResult}
        verificationProjection={verificationProjection}
        editing={editing}
        cellEditing={cellEditing}
        cellPresence={cellPresence}
        onEdit={onEdit}
        onCreateSelectOption={onCreateSelectOption}
        onReorderSelectOptions={onReorderSelectOptions}
        onRelationSearch={onRelationSearch}
        onInvokeButton={onInvokeButton}
        onVerificationAction={onVerificationAction}
        onOpen={onOpen}
        onBeginEdit={beginEdit}
        onSaveEdit={saveEdit}
        onCancelEdit={cancelEdit}
        setEditing={setEditing}
      />
      {trailingContent}
    </TableCell>
  );
}
