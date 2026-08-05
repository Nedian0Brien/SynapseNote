import type {
  DatabasePresenceEntry,
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseValue,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import type { Dispatch, SetStateAction } from 'react';
import { DatabasePresenceBadges } from '@/components/DatabasePresenceBadges';
import { DatabaseTableCellDisplayContent } from './DatabaseTableCellDisplayContent';
import { DatabaseTableCellEditingContent } from './DatabaseTableCellEditingContent';
import type { DatabaseTableCellEditing } from './database-table-cell-types';
import type { DatabaseTableProps } from './database-table-types';

type ComputedResult = NonNullable<ProjectedDatabaseRecord['computedResults']>[string];
type VerificationProjection = NonNullable<
  ProjectedDatabaseRecord['verificationProjections']
>[string];

export interface DatabaseTableCellContentProps
  extends Pick<
    DatabaseTableProps,
    | 'onEdit'
    | 'onCreateSelectOption'
    | 'onReorderSelectOptions'
    | 'onRelationSearch'
    | 'onInvokeButton'
    | 'onVerificationAction'
    | 'onOpen'
  > {
  property: DatabaseProperty;
  record: ProjectedDatabaseRecord;
  people: readonly ProjectedDatabasePerson[];
  relationRecords: readonly ProjectedDatabaseRelationRecord[];
  fileStates: DatabaseQueryResult['fileStates'];
  personLabels: { agent: string; inactive: string };
  missingFileLabel: string;
  notionSurface: boolean;
  mutationLocked: boolean;
  ghostCreated: boolean;
  recordLabel: string;
  proposed: boolean;
  proposedRecord: { action: string } | undefined;
  shownValue: DatabaseValue | undefined;
  shownText: string;
  computedResult: ComputedResult | undefined;
  verificationProjection: VerificationProjection | undefined;
  editing: DatabaseTableCellEditing | null;
  cellEditing: boolean;
  cellPresence: readonly DatabasePresenceEntry[];
  onBeginEdit: (record: ProjectedDatabaseRecord, property: DatabaseProperty) => void;
  onSaveEdit: (
    record: ProjectedDatabaseRecord,
    property: DatabaseProperty,
    draftOverride?: string,
  ) => void;
  onCancelEdit: (record: ProjectedDatabaseRecord, property: DatabaseProperty) => void;
  setEditing: Dispatch<SetStateAction<DatabaseTableCellEditing | null>>;
}

/** Dispatches editing and read-only family renderers without owning geometry or mutations. */
export function DatabaseTableCellContent({
  property,
  record,
  people,
  relationRecords,
  fileStates,
  personLabels,
  missingFileLabel,
  notionSurface,
  mutationLocked,
  ghostCreated,
  recordLabel,
  proposed,
  proposedRecord,
  shownValue,
  shownText,
  computedResult,
  verificationProjection,
  editing,
  cellEditing,
  cellPresence,
  onEdit,
  onCreateSelectOption,
  onReorderSelectOptions,
  onRelationSearch,
  onInvokeButton,
  onVerificationAction,
  onOpen,
  onBeginEdit,
  onSaveEdit,
  onCancelEdit,
  setEditing,
}: DatabaseTableCellContentProps) {
  return (
    <>
      <DatabasePresenceBadges entries={cellPresence} scope="cell" />
      {cellEditing && editing ? (
        <DatabaseTableCellEditingContent
          property={property}
          record={record}
          notionSurface={notionSurface}
          people={people}
          relationRecords={relationRecords}
          fileStates={fileStates}
          personLabels={personLabels}
          recordLabel={recordLabel}
          editing={editing}
          onRelationSearch={onRelationSearch}
          onCreateSelectOption={onCreateSelectOption}
          onReorderSelectOptions={onReorderSelectOptions}
          onOpen={onOpen}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          setEditing={setEditing}
        />
      ) : (
        <DatabaseTableCellDisplayContent
          property={property}
          record={record}
          people={people}
          relationRecords={relationRecords}
          fileStates={fileStates}
          personLabels={personLabels}
          missingFileLabel={missingFileLabel}
          notionSurface={notionSurface}
          mutationLocked={mutationLocked}
          ghostCreated={ghostCreated}
          recordLabel={recordLabel}
          proposed={proposed}
          proposedRecord={proposedRecord}
          shownValue={shownValue}
          shownText={shownText}
          computedResult={computedResult}
          verificationProjection={verificationProjection}
          onEdit={onEdit}
          onRelationSearch={onRelationSearch}
          onInvokeButton={onInvokeButton}
          onVerificationAction={onVerificationAction}
          onOpen={onOpen}
          onBeginEdit={onBeginEdit}
        />
      )}
    </>
  );
}
