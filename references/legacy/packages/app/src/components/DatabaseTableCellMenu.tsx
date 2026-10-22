import { Trans } from '@lingui/react/macro';
import type {
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import {
  Archive,
  Braces,
  Copy,
  ExternalLink,
  MoveRight,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { isDatabaseCellEditable } from '@/lib/database-cell-mutation';
import type { DatabaseCellMenu, DatabaseTableProps } from './database-table-types';
import { displayValue } from './database-table-utils';

export const DatabaseTableCellMenu = ({
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
  locale,
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
}: {
  cellMenu: DatabaseCellMenu | null;
  databaseId: string;
  source: DatabaseSource;
  viewId: string | null;
  cellMenuRef: RefObject<HTMLDivElement | null>;
  tableHostRef: RefObject<HTMLDivElement | null>;
  result: DatabaseQueryResult;
  properties: readonly DatabaseProperty[];
  titleProperty: DatabaseProperty | undefined;
  people: readonly ProjectedDatabasePerson[];
  relationRecords: readonly ProjectedDatabaseRelationRecord[];
  personLabels: { agent: string; inactive: string };
  missingFileLabel: string;
  locale: string;
  notionSurface: boolean;
  mutationLocked: boolean;
  onEdit?: DatabaseTableProps['onEdit'];
  onOpen?: DatabaseTableProps['onOpen'];
  onOpenContextInspector?: DatabaseTableProps['onOpenContextInspector'];
  onOpenAgentScope?: DatabaseTableProps['onOpenAgentScope'];
  onDuplicate?: DatabaseTableProps['onDuplicate'];
  onArchive?: DatabaseTableProps['onArchive'];
  onRequestMove?: DatabaseTableProps['onRequestMove'];
  onDelete?: DatabaseTableProps['onDelete'];
  beginEdit: (record: ProjectedDatabaseRecord, property: DatabaseProperty) => void;
  copyCellRange: (row: number, column: number) => void;
  setCellMenu: (value: DatabaseCellMenu | null) => void;
}) =>
  cellMenu
    ? (() => {
        const record = result.records[cellMenu.row];
        const property = properties[cellMenu.column];
        if (!record || !property) return null;
        const cellRecordTitle = titleProperty
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
        const cellRecordLabel =
          notionSurface && cellRecordTitle && cellRecordTitle !== '—' ? cellRecordTitle : record.id;
        const cellPropertyActionLabel = (action: string) =>
          notionSurface ? `${action} ${property.name} for page ${cellRecordLabel}` : action;
        const cellRecordActionLabel = (action: string) =>
          notionSurface ? `${action.replace('record', 'page')} ${cellRecordLabel}` : action;
        const close = () => setCellMenu(null);
        return (
          <div
            ref={cellMenuRef}
            role="menu"
            aria-label={
              notionSurface
                ? `Database cell actions for ${cellRecordLabel} · ${property.name}`
                : 'Database cell actions'
            }
            className="fixed z-[100] min-w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: cellMenu.x, top: cellMenu.y }}
            onKeyDown={(event) => {
              const items = [
                ...event.currentTarget.querySelectorAll<HTMLElement>(
                  '[role="menuitem"]:not([disabled])',
                ),
              ];
              if (event.key === 'Escape') {
                event.preventDefault();
                close();
                tableHostRef.current
                  ?.querySelector<HTMLElement>(
                    `[data-database-cell-row="${cellMenu.row}"][data-database-cell-column="${cellMenu.column}"]`,
                  )
                  ?.focus();
                return;
              }
              if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const current = Math.max(0, items.indexOf(document.activeElement as HTMLElement));
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : event.key === 'ArrowDown'
                      ? (current + 1) % items.length
                      : (current - 1 + items.length) % items.length;
              items[next]?.focus();
            }}
          >
            <Button
              role="menuitem"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              aria-label={cellPropertyActionLabel('Copy selected cells')}
              onClick={() => {
                copyCellRange(cellMenu.row, cellMenu.column);
                close();
              }}
            >
              <Copy /> <Trans>Copy selected cells</Trans>
            </Button>
            <Button
              role="menuitem"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              aria-label={
                notionSurface
                  ? `Edit ${property.name} for ${notionSurface ? 'page' : 'record'} ${cellRecordLabel}`
                  : 'Edit cell'
              }
              disabled={mutationLocked || !onEdit || !isDatabaseCellEditable(property)}
              onClick={() => {
                beginEdit(record, property);
                close();
              }}
            >
              <Pencil /> <Trans>Edit cell</Trans>
            </Button>
            {onOpen ? (
              <Button
                role="menuitem"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                aria-label={cellRecordActionLabel('Open record')}
                disabled={mutationLocked}
                onClick={() => {
                  onOpen(record);
                  close();
                }}
              >
                <ExternalLink />{' '}
                {notionSurface ? <Trans>Open page</Trans> : <Trans>Open record</Trans>}
              </Button>
            ) : null}
            {onOpenContextInspector ? (
              <Button
                role="menuitem"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                aria-label={
                  notionSurface ? `Inspect context for page ${cellRecordLabel}` : undefined
                }
                disabled={mutationLocked}
                onClick={() => {
                  onOpenContextInspector(record);
                  close();
                }}
              >
                <Braces />
                {notionSurface ? (
                  <Trans>Inspect page context</Trans>
                ) : (
                  <Trans>Inspect record context</Trans>
                )}
              </Button>
            ) : null}
            {onOpenAgentScope ? (
              <Button
                role="menuitem"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                aria-label={notionSurface ? `Ask agent about page ${cellRecordLabel}` : undefined}
                disabled={mutationLocked}
                onClick={() => {
                  onOpenAgentScope({
                    databaseId,
                    sourceId: source.id,
                    ...(viewId ? { viewId } : {}),
                    recordId: record.id,
                  });
                  close();
                }}
              >
                <Sparkles />
                {notionSurface ? (
                  <Trans>Ask agent about page</Trans>
                ) : (
                  <Trans>Ask agent about record</Trans>
                )}
              </Button>
            ) : null}
            {onDuplicate ? (
              <Button
                role="menuitem"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                aria-label={cellRecordActionLabel('Duplicate record')}
                disabled={mutationLocked}
                onClick={() => {
                  onDuplicate(record);
                  close();
                }}
              >
                <Copy />
                {notionSurface ? <Trans>Duplicate page</Trans> : <Trans>Duplicate record</Trans>}
              </Button>
            ) : null}
            {onArchive ? (
              <Button
                role="menuitem"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                aria-label={cellRecordActionLabel(
                  record.archivedAt ? 'Restore record' : 'Archive record',
                )}
                disabled={mutationLocked}
                onClick={() => {
                  onArchive(record, record.archivedAt ? 'restore' : 'archive');
                  close();
                }}
              >
                {record.archivedAt ? <RotateCcw /> : <Archive />}
                {record.archivedAt ? (
                  notionSurface ? (
                    <Trans>Restore page</Trans>
                  ) : (
                    <Trans>Restore record</Trans>
                  )
                ) : notionSurface ? (
                  <Trans>Archive page</Trans>
                ) : (
                  <Trans>Archive record</Trans>
                )}
              </Button>
            ) : null}
            {onRequestMove ? (
              <Button
                role="menuitem"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                aria-label={cellRecordActionLabel('Move record')}
                disabled={mutationLocked}
                onClick={() => {
                  onRequestMove(record);
                  close();
                }}
              >
                <MoveRight />
                {notionSurface ? <Trans>Move page</Trans> : <Trans>Move record</Trans>}
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                role="menuitem"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-destructive"
                aria-label={cellRecordActionLabel('Delete record')}
                disabled={mutationLocked}
                onClick={() => {
                  onDelete(record);
                  close();
                }}
              >
                <Trash2 />
                {notionSurface ? <Trans>Delete page</Trans> : <Trans>Delete record</Trans>}
              </Button>
            ) : null}
          </div>
        );
      })()
    : null;
