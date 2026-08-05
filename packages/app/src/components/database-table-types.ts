import type {
  DatabaseCalculationFunction,
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseTableViewConfiguration,
  DatabaseValue,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseAgentScope } from '@/components/handoff/database-agent-scope';
import type { DatabaseGhostState } from '@/lib/database-mutation-client';
import type { DatabasePasteChange } from '@/lib/database-tsv';

export interface DatabaseTableSelection {
  databaseId: string;
  sourceId: string;
}

export interface DatabaseTableTarget extends DatabaseTableSelection {
  viewId?: string;
}

export type DatabaseInitialRecordAction =
  | { kind: 'create' }
  | {
      kind: 'duplicate' | 'move' | 'archive' | 'restore' | 'delete';
      recordId: string;
    }
  | {
      kind: 'transition';
      recordId: string;
      changes: Array<{ propertyId: string; value?: DatabaseValue }>;
    };

export interface DatabaseCellMenu {
  row: number;
  column: number;
  x: number;
  y: number;
}

export interface DatabaseRowMenu {
  recordId: string;
  recordLabel: string;
  anchor: HTMLButtonElement;
}

export type DatabaseSelectProperty = Extract<DatabaseProperty, { type: 'select' | 'multi_select' }>;
export type LoadStatus = 'idle' | 'loading' | 'success' | 'error';

export function isDatabaseSelectProperty(
  property: DatabaseProperty,
): property is DatabaseSelectProperty {
  return property.type === 'select' || property.type === 'multi_select';
}

export const DATABASE_EXPORT_RECORD_LIMIT = 10_000;
/** Distinguishes native row reordering from the grid's TSV cell drag payload. */
export const DATABASE_RECORD_DRAG_MIME = 'application/x-synapsenote-database-record';
/** Keeps the interactive grid DOM bounded even for imported wide schemas. */
export const DATABASE_TABLE_RENDERED_COLUMN_LIMIT = 100;

export type DatabaseTableViewState = {
  scrollTop: number;
  /** Horizontal offset for the view's single table viewport. */
  scrollLeft: number;
  focusedCell?: { recordId: string; propertyId: string };
};

export interface DatabaseCreatedRecordFocusRequest {
  recordId: string;
  requestId: number;
}

export interface DatabaseTableProps {
  /** Canonical database ID; optional only for isolated component harnesses. */
  databaseId?: string;
  viewId?: string | null;
  source: DatabaseSource;
  result: DatabaseQueryResult;
  people?: readonly ProjectedDatabasePerson[];
  relationRecords?: readonly ProjectedDatabaseRelationRecord[];
  /** Keep the primary table surface document-native; advanced layout controls stay secondary. */
  notionSurface?: boolean;
  ghost?: DatabaseGhostState | null;
  /** Direct-safe human edits shown locally while the canonical commit settles. */
  optimisticCellValues?: ReadonlyMap<string, DatabaseValue | undefined>;
  mutationLocked?: boolean;
  /** Temporary local filter text used by an inline Notion-style search. */
  searchQuery?: string;
  /** Focus the title-cell affordance after an inline block finishes creation. */
  autoFocusNewRecord?: boolean;
  /** Monotonic request token used to restore focus after a committed table-row create. */
  focusNewRecordRequest?: number | null;
  /** Identifies a committed blank row whose title editor should receive keyboard focus. */
  focusCreatedRecordRequest?: DatabaseCreatedRecordFocusRequest | null;
  selectedRecordIds?: ReadonlySet<string>;
  calculations?: Readonly<Record<string, DatabaseCalculationFunction>>;
  viewPropertyIds?: readonly string[];
  viewConfiguration?: DatabaseTableViewConfiguration;
  onEdit?: (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    value: DatabaseValue | undefined,
  ) => void;
  onCreateSelectOption?: (
    record: ProjectedDatabaseRecord,
    property: DatabaseSelectProperty,
    name: string,
    selectedOptionIds: readonly string[],
  ) => boolean;
  onReorderSelectOptions?: (
    property: DatabaseSelectProperty,
    optionIds: readonly string[],
  ) => boolean;
  onDelete?: (record: ProjectedDatabaseRecord) => void;
  onDuplicate?: (record: ProjectedDatabaseRecord) => void;
  onArchive?: (record: ProjectedDatabaseRecord, action: 'archive' | 'restore') => void;
  onRequestMove?: (record: ProjectedDatabaseRecord) => void;
  onOpen?: (record: ProjectedDatabaseRecord) => void;
  onOpenContextInspector?: (record: ProjectedDatabaseRecord) => void;
  onOpenPropertyContextInspector?: (property: DatabaseProperty) => void;
  onOpenAgentScope?: (scope: DatabaseAgentScope) => void;
  onCreateRecord?: (title: string) => void;
  onSelectionChange?: (recordIds: Set<string>) => void;
  /** Persist the visible record order after a native row-handle drag. */
  onReorderRecords?: (recordIds: readonly string[]) => void;
  onPaste?: (changes: readonly DatabasePasteChange[]) => void;
  onCalculationChange?: (
    propertyId: string,
    calculation: DatabaseCalculationFunction | null,
  ) => void;
  onRelationSearch?: (
    property: Extract<DatabaseProperty, { type: 'relation' }>,
    query: string,
  ) => Promise<readonly ProjectedDatabaseRelationRecord[]>;
  onConfigureComputedProperty?: (
    property: Extract<DatabaseProperty, { type: 'formula' | 'rollup' }>,
  ) => void;
  onConfigureUniqueIdProperty?: (
    property: Extract<DatabaseProperty, { type: 'unique_id' }>,
  ) => void;
  onConfigurePlaceProperty?: (property: Extract<DatabaseProperty, { type: 'place' }>) => void;
  onConfigureSelectProperty?: (property: DatabaseSelectProperty) => void;
  onConvertProperty?: (property: DatabaseProperty) => void;
  onOpenPropertySort?: (property: DatabaseProperty) => void;
  onOpenPropertyFilter?: (property: DatabaseProperty) => void;
  onViewPropertyIdsChange?: (propertyIds: readonly string[]) => void;
  onDuplicateProperty?: (property: DatabaseProperty) => void;
  onAddProperty?: (input: {
    name: string;
    type: DatabasePropertyType;
    insertBeforePropertyId?: string;
    insertAfterPropertyId?: string;
  }) => void;
  onInvokeButton?: (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'button' }>,
  ) => void;
  onVerificationAction?: (
    record: ProjectedDatabaseRecord,
    property: Extract<DatabaseProperty, { type: 'verification' }>,
    action: 'verify' | 'renew' | 'unverify',
  ) => void;
  onManageProperties?: (propertyId?: string) => void;
  /** In the document-native table, rename a property from its header menu. */
  onRenameProperty?: (property: DatabaseProperty, name: string) => void;
  onRemoveProperty?: (property: DatabaseProperty) => void;
  initialViewState?: DatabaseTableViewState;
  onViewStateChange?: (state: DatabaseTableViewState) => void;
}
