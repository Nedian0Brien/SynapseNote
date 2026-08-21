import { Trans } from '@lingui/react/macro';
import type {
  DatabaseCalculationFunction,
  DatabaseProperty,
  DatabasePropertyType,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { Plus } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { DatabaseTableGeometry } from '@/lib/database-table-geometry';
import type { DatabaseTableLayoutState } from '@/lib/database-table-layout';
import { cn } from '@/lib/utils';
import { DatabasePropertyHeaderCell } from './DatabasePropertyHeaderCell';
import { DatabasePropertyInsertPopover } from './DatabasePropertyInsertPopover';
import type { DatabaseTableProps } from './database-table-types';

export interface DatabaseTableHeaderProps
  extends Pick<
    DatabaseTableProps,
    | 'onAddProperty'
    | 'onOpenPropertySort'
    | 'onOpenPropertyFilter'
    | 'onOpenPropertyContextInspector'
    | 'onOpenAgentScope'
    | 'onConfigureComputedProperty'
    | 'onConfigureUniqueIdProperty'
    | 'onConfigurePlaceProperty'
    | 'onConfigureSelectProperty'
    | 'onConfigureNumberProperty'
    | 'onConvertProperty'
    | 'onManageProperties'
    | 'onRenameProperty'
    | 'onDuplicateProperty'
    | 'onRemoveProperty'
    | 'onCalculationChange'
    | 'onSelectionChange'
  > {
  databaseId: string;
  viewId: string | null;
  source: DatabaseSource;
  properties: readonly DatabaseProperty[];
  allProperties: readonly DatabaseProperty[];
  layout: DatabaseTableLayoutState;
  visibleLayoutPropertyIds: readonly string[];
  notionSurface: boolean;
  mutationLocked: boolean;
  calculations: Readonly<Record<string, DatabaseCalculationFunction>>;
  computedErrorSummaries: ReadonlyMap<string, { count: number; codes: ReadonlySet<string> }>;
  recordIds: readonly string[];
  allLoadedSelected: boolean;
  geometry: DatabaseTableGeometry;
  addPropertyOpen: boolean;
  setAddPropertyOpen: Dispatch<SetStateAction<boolean>>;
  newPropertyName: string;
  setNewPropertyName: Dispatch<SetStateAction<string>>;
  newPropertyType: DatabasePropertyType;
  setNewPropertyType: Dispatch<SetStateAction<DatabasePropertyType>>;
  propertyInsertTarget: { propertyId: string; position: 'before' | 'after' } | null;
  setPropertyInsertTarget: Dispatch<
    SetStateAction<{ propertyId: string; position: 'before' | 'after' } | null>
  >;
  updatePropertyLayout: (
    update: (current: DatabaseTableLayoutState) => DatabaseTableLayoutState,
  ) => void;
  openPropertyInsert: (property: DatabaseProperty, position: 'before' | 'after') => void;
  openPropertyRename: (property: DatabaseProperty) => void;
  submitAddProperty: () => void;
}

export function DatabaseTableHeader({
  databaseId,
  viewId,
  source,
  properties,
  allProperties,
  layout,
  geometry,
  visibleLayoutPropertyIds,
  notionSurface,
  mutationLocked,
  calculations,
  computedErrorSummaries,
  recordIds,
  allLoadedSelected,
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
  onConfigureNumberProperty,
  onConvertProperty,
  onManageProperties,
  onRenameProperty,
  onDuplicateProperty,
  onRemoveProperty,
  onCalculationChange,
  onSelectionChange,
}: DatabaseTableHeaderProps) {
  const selectionCheckbox = (
    <Checkbox
      checked={allLoadedSelected}
      aria-label={notionSurface ? 'Select all loaded pages' : 'Select all loaded records'}
      className={
        notionSurface
          ? 'pointer-events-auto bg-background opacity-0 transition-opacity group-hover/header:opacity-100 group-focus-within/header:opacity-100 focus-visible:opacity-100 data-checked:opacity-100'
          : undefined
      }
      disabled={!onSelectionChange || mutationLocked || recordIds.length === 0}
      onCheckedChange={(checked) =>
        onSelectionChange?.(checked === true ? new Set(recordIds) : new Set())
      }
    />
  );
  const fillerColumn = (
    <TableHead
      role="presentation"
      aria-hidden="true"
      className="pointer-events-none p-0"
      data-database-table-filler
    />
  );
  const actionsColumn = (
    <TableHead
      className={cn(
        notionSurface
          ? 'bg-background/95 p-0 text-left'
          : 'sticky right-0 z-30 bg-background text-right',
      )}
      aria-colindex={properties.length + (notionSurface ? 1 : 3)}
      data-database-actions-column
    >
      <span className={notionSurface ? 'sr-only' : undefined}>
        <Trans>Actions</Trans>
      </span>
      {notionSurface && onAddProperty ? (
        <DatabasePropertyInsertPopover
          open={addPropertyOpen}
          setOpen={setAddPropertyOpen}
          mutationLocked={mutationLocked}
          propertyInsertTarget={propertyInsertTarget}
          setPropertyInsertTarget={setPropertyInsertTarget}
          newPropertyName={newPropertyName}
          setNewPropertyName={setNewPropertyName}
          newPropertyType={newPropertyType}
          setNewPropertyType={setNewPropertyType}
          properties={allProperties}
          submitAddProperty={submitAddProperty}
          showLabel
        />
      ) : onManageProperties ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ml-1"
          aria-label="Add property"
          disabled={mutationLocked}
          onClick={() => onManageProperties()}
        >
          <Plus aria-hidden="true" />
        </Button>
      ) : null}
    </TableHead>
  );
  return (
    <TableHeader
      className={cn(
        'sticky top-0 z-20 bg-background',
        notionSurface && 'bg-background/95 [&_tr]:border-border/60',
      )}
    >
      <TableRow noHover aria-rowindex={1} className={notionSurface ? 'group/header' : undefined}>
        {!notionSurface ? (
          <TableHead
            className={cn('group/column relative sticky left-0 z-40 bg-background')}
            aria-colindex={1}
          >
            {selectionCheckbox}
          </TableHead>
        ) : null}
        {properties.map((property, index) => (
          <DatabasePropertyHeaderCell
            key={property.id}
            property={property}
            index={index}
            layout={layout}
            visibleLayoutPropertyIds={visibleLayoutPropertyIds}
            notionSurface={notionSurface}
            mutationLocked={mutationLocked}
            calculations={calculations}
            computedErrorSummaries={computedErrorSummaries}
            geometry={geometry}
            databaseId={databaseId}
            viewId={viewId}
            source={source}
            updatePropertyLayout={updatePropertyLayout}
            openPropertyInsert={openPropertyInsert}
            openPropertyRename={openPropertyRename}
            onAddProperty={onAddProperty}
            onOpenPropertySort={onOpenPropertySort}
            onOpenPropertyFilter={onOpenPropertyFilter}
            onOpenPropertyContextInspector={onOpenPropertyContextInspector}
            onOpenAgentScope={onOpenAgentScope}
            onConfigureComputedProperty={onConfigureComputedProperty}
            onConfigureUniqueIdProperty={onConfigureUniqueIdProperty}
            onConfigurePlaceProperty={onConfigurePlaceProperty}
            onConfigureSelectProperty={onConfigureSelectProperty}
            onConfigureNumberProperty={onConfigureNumberProperty}
            onConvertProperty={onConvertProperty}
            onManageProperties={onManageProperties}
            onRenameProperty={onRenameProperty}
            onDuplicateProperty={onDuplicateProperty}
            onRemoveProperty={onRemoveProperty}
            onCalculationChange={onCalculationChange}
          />
        ))}
        {notionSurface ? (
          <>
            {actionsColumn}
            {fillerColumn}
          </>
        ) : (
          <>
            {fillerColumn}
            {actionsColumn}
          </>
        )}
      </TableRow>
    </TableHeader>
  );
}
