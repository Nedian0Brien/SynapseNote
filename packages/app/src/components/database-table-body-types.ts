import type {
  DatabaseConditionalColorResultRule,
  DatabasePresenceEntry,
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseValue,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import type * as React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { DatabaseGhostState } from '@/lib/database-mutation-client';
import type { DatabaseTableGeometry } from '@/lib/database-table-geometry';
import type { DatabaseTableLayoutState } from '@/lib/database-table-layout';
import type { DatabaseTableCellEditing } from './database-table-cell-types';
import type { DatabaseTableProps } from './database-table-types';
import type { DatabaseCellRange } from './database-table-utils';

export interface DatabaseTableBodyProps
  extends Pick<
    DatabaseTableProps,
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
    | 'onCreateRecord'
    | 'onSelectionChange'
    | 'onReorderRecords'
    | 'onPaste'
    | 'onRelationSearch'
    | 'onInvokeButton'
    | 'onVerificationAction'
  > {
  databaseId: string;
  viewId: string | null;
  source: DatabaseSource;
  result: DatabaseQueryResult;
  people: readonly ProjectedDatabasePerson[];
  relationRecords: readonly ProjectedDatabaseRelationRecord[];
  notionSurface: boolean;
  ghost: DatabaseGhostState | null;
  optimisticCellValues: ReadonlyMap<string, DatabaseValue | undefined> | undefined;
  mutationLocked: boolean;
  properties: readonly DatabaseProperty[];
  titleProperty: DatabaseProperty | undefined;
  personLabels: { agent: string; inactive: string };
  missingFileLabel: string;
  layout: DatabaseTableLayoutState;
  geometry: DatabaseTableGeometry;
  conditionalColorRules: ReadonlyMap<string, DatabaseConditionalColorResultRule>;
  selectedRecordIds: ReadonlySet<string>;
  tableRecords: readonly { record: ProjectedDatabaseRecord; ghostCreated: boolean }[];
  renderedRecords: readonly {
    record: ProjectedDatabaseRecord;
    ghostCreated: boolean;
    rowIndex: number;
  }[];
  virtualized: boolean;
  virtualStart: number;
  virtualEnd: number;
  rowHeightPixels: number;
  cellRange: DatabaseCellRange | null;
  setCellRange: Dispatch<SetStateAction<DatabaseCellRange | null>>;
  setCellMenu: Dispatch<
    SetStateAction<{ row: number; column: number; x: number; y: number } | null>
  >;
  setGridAnnouncement: Dispatch<SetStateAction<string>>;
  setEditError: Dispatch<SetStateAction<string | null>>;
  editing: DatabaseTableCellEditing | null;
  setEditing: Dispatch<SetStateAction<DatabaseTableCellEditing | null>>;
  remotePresence: readonly DatabasePresenceEntry[];
  locale: string;
  rangeTsv: (row: number, column: number) => string;
  applyTsvAtCell: (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    tsv: string,
  ) => void;
  focusCell: (row: number, column: number, extend: boolean) => void;
  beginEdit: (record: ProjectedDatabaseRecord, property: DatabaseProperty) => void;
  saveEdit: (record: ProjectedDatabaseRecord, property: DatabaseProperty) => void;
  cancelEdit: (record: ProjectedDatabaseRecord, property: DatabaseProperty) => void;
  updateViewState: (patch: { focusedCell?: { recordId: string; propertyId: string } }) => void;
  reorderEnabled: boolean;
  draggedRecordId: string | null;
  dropTarget: { recordId: string; edge: 'before' | 'after' } | null;
  clearRowDrag: () => void;
  startRecordDrag: (recordId: string) => void;
  onRowDragOver: (
    record: ProjectedDatabaseRecord,
    event: React.DragEvent<HTMLTableRowElement>,
  ) => void;
  onRowDragLeave: (
    record: ProjectedDatabaseRecord,
    event: React.DragEvent<HTMLTableRowElement>,
  ) => void;
  onRowDrop: (record: ProjectedDatabaseRecord, event: React.DragEvent<HTMLTableRowElement>) => void;
}
