import type {
  DatabaseCalculationFunction,
  DatabaseProperty,
  DatabasePropertyType,
} from '@nedian0brien/synapsenote-core';
import {
  AlertCircle,
  CalendarDays,
  CheckSquare2,
  Clock3,
  FileText,
  Hash,
  Link2,
  type LucideIcon,
  Mail,
  MapPin,
  MoveRight,
  Paperclip,
  Pencil,
  Phone,
  Settings2,
  ShieldCheck,
  Sigma,
  Tags,
  Type,
  UserRound,
  Users,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableHead } from '@/components/ui/table';
import { databasePropertyTypeLabel } from '@/lib/database-property-copy';
import type { DatabaseTableGeometry } from '@/lib/database-table-geometry';
import type { DatabaseTableLayoutState } from '@/lib/database-table-layout';
import { cn } from '@/lib/utils';
import { DatabasePropertyMenu } from './DatabasePropertyMenu';
import type { DatabaseTableHeaderProps } from './DatabaseTableHeader';

const DATABASE_PROPERTY_TYPE_ICONS: Record<DatabasePropertyType, LucideIcon> = {
  title: Type,
  text: FileText,
  number: Hash,
  checkbox: CheckSquare2,
  date: CalendarDays,
  select: Tags,
  status: Tags,
  multi_select: Tags,
  url: Link2,
  email: Mail,
  phone: Phone,
  created_time: Clock3,
  last_edited_time: Clock3,
  created_by: UserRound,
  last_edited_by: UserRound,
  verification: ShieldCheck,
  button: Settings2,
  unique_id: Hash,
  place: MapPin,
  person: Users,
  files: Paperclip,
  relation: Workflow,
  formula: Sigma,
  rollup: Sigma,
};

function DatabasePropertyTypeIcon({ type, label }: { type: DatabasePropertyType; label: string }) {
  if (type === 'title') {
    return (
      <span
        className="mr-1.5 inline-flex h-4 min-w-5 shrink-0 items-center justify-start font-semibold text-muted-foreground/80 text-xs tracking-tight"
        title={label}
        aria-hidden="true"
        data-database-property-type-icon={type}
      >
        Aa
      </span>
    );
  }
  const Icon = DATABASE_PROPERTY_TYPE_ICONS[type];
  return (
    <span
      className="mr-1 inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/75"
      title={label}
      data-database-property-type-icon={type}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </span>
  );
}

type PropertyHeaderCellCallbacks = Pick<
  DatabaseTableHeaderProps,
  | 'databaseId'
  | 'viewId'
  | 'source'
  | 'onAddProperty'
  | 'onOpenPropertySort'
  | 'onOpenPropertyFilter'
  | 'onOpenPropertyContextInspector'
  | 'onOpenAgentScope'
  | 'onConfigureComputedProperty'
  | 'onConfigureUniqueIdProperty'
  | 'onConfigurePlaceProperty'
  | 'onConfigureButtonProperty'
  | 'onConfigureSelectProperty'
  | 'onConvertProperty'
  | 'onManageProperties'
  | 'onRenameProperty'
  | 'onDuplicateProperty'
  | 'onRemoveProperty'
  | 'onCalculationChange'
>;

export interface DatabasePropertyHeaderCellProps extends PropertyHeaderCellCallbacks {
  property: DatabaseProperty;
  index: number;
  layout: DatabaseTableLayoutState;
  visibleLayoutPropertyIds: readonly string[];
  notionSurface: boolean;
  mutationLocked: boolean;
  calculations: Readonly<Record<string, DatabaseCalculationFunction>>;
  computedErrorSummaries: ReadonlyMap<string, { count: number; codes: ReadonlySet<string> }>;
  updatePropertyLayout: DatabaseTableHeaderProps['updatePropertyLayout'];
  openPropertyInsert: DatabaseTableHeaderProps['openPropertyInsert'];
  openPropertyRename: DatabaseTableHeaderProps['openPropertyRename'];
  geometry: DatabaseTableGeometry;
}

export function DatabasePropertyHeaderCell({
  property,
  index,
  layout,
  visibleLayoutPropertyIds,
  notionSurface,
  mutationLocked,
  calculations,
  computedErrorSummaries,
  geometry,
  updatePropertyLayout,
  openPropertyInsert,
  openPropertyRename,
  ...menuCallbacks
}: DatabasePropertyHeaderCellProps) {
  const layoutPropertyIndex = visibleLayoutPropertyIds.indexOf(property.id);
  const propertyVisible = !layout.hiddenPropertyIds.includes(property.id);
  const propertyTypeLabel = databasePropertyTypeLabel(property.type);
  const computedErrorSummary = computedErrorSummaries.get(property.id);
  return (
    <TableHead
      aria-colindex={index + (notionSurface ? 1 : 2)}
      dir="auto"
      className={cn(
        'group/column',
        index === 0 && 'sticky left-0 z-30 bg-background',
        notionSurface && '!font-sans !normal-case tracking-normal text-[13px]',
      )}
      data-property-id={property.id}
      aria-label={notionSurface ? `${property.name}${propertyTypeLabel}` : undefined}
      style={index === 0 ? { left: `${geometry.titleStickyInset}px` } : undefined}
    >
      <div className="flex min-w-0 max-w-full items-center overflow-hidden">
        {notionSurface ? (
          <DatabasePropertyMenu
            {...menuCallbacks}
            onAddProperty={menuCallbacks.onAddProperty}
            property={property}
            propertyVisible={propertyVisible}
            layoutPropertyIndex={layoutPropertyIndex}
            visibleLayoutPropertyIds={visibleLayoutPropertyIds}
            notionSurface={notionSurface}
            mutationLocked={mutationLocked}
            calculations={calculations}
            updatePropertyLayout={updatePropertyLayout}
            openPropertyInsert={openPropertyInsert}
            openPropertyRename={openPropertyRename}
            trigger={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto min-w-0 flex-1 justify-start truncate rounded-none px-0 py-0.5 text-left font-inherit text-foreground hover:bg-transparent"
                aria-label={`Property options for ${property.name}`}
                disabled={mutationLocked}
                data-property-menu-trigger={property.id}
                data-property-header-trigger={property.id}
              >
                <DatabasePropertyTypeIcon type={property.type} label={propertyTypeLabel} />
                <span className="min-w-0 truncate" data-database-property-name>
                  {property.name}
                </span>
              </Button>
            }
          />
        ) : (
          <span className="min-w-0 flex-1 truncate" data-database-property-name>
            {property.name}
          </span>
        )}
        <span className={cn('ml-2 normal-case text-[10px] opacity-60', notionSurface && 'sr-only')}>
          {propertyTypeLabel}
        </span>
        {computedErrorSummary ? (
          <span
            className="ml-1 inline-flex items-center gap-0.5 text-destructive"
            role="img"
            aria-label={`${property.name}: ${computedErrorSummary.count} computed error${computedErrorSummary.count === 1 ? '' : 's'} in loaded ${notionSurface ? 'pages' : 'records'}`}
            title={`${[...computedErrorSummary.codes].join(', ')} in ${computedErrorSummary.count} loaded ${notionSurface ? 'page' : 'record'}${computedErrorSummary.count === 1 ? '' : 's'}`}
            data-computed-error-count={computedErrorSummary.count}
            data-computed-error-codes={[...computedErrorSummary.codes].join(',')}
            data-computed-error-scope="loaded-records"
          >
            <AlertCircle className="size-3.5" aria-hidden="true" />
            <span aria-hidden="true">{computedErrorSummary.count}</span>
          </span>
        ) : null}
        {(property.type === 'formula' || property.type === 'rollup') &&
        menuCallbacks.onConfigureComputedProperty ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              'ml-1',
              notionSurface &&
                'opacity-0 transition-opacity group-hover/column:opacity-100 group-focus-within/column:opacity-100 focus-visible:opacity-100',
            )}
            aria-label={`Configure ${property.name} ${propertyTypeLabel}`}
            onClick={() => menuCallbacks.onConfigureComputedProperty?.(property)}
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : null}
        {property.type === 'unique_id' && menuCallbacks.onConfigureUniqueIdProperty ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              'ml-1',
              notionSurface &&
                'opacity-0 transition-opacity group-hover/column:opacity-100 group-focus-within/column:opacity-100 focus-visible:opacity-100',
            )}
            aria-label={`Configure ${property.name} Unique ID`}
            onClick={() => menuCallbacks.onConfigureUniqueIdProperty?.(property)}
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : null}
        {property.type === 'place' && menuCallbacks.onConfigurePlaceProperty ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              'ml-1',
              notionSurface &&
                'opacity-0 transition-opacity group-hover/column:opacity-100 group-focus-within/column:opacity-100 focus-visible:opacity-100',
            )}
            aria-label={`Configure ${property.name} Place privacy`}
            onClick={() => menuCallbacks.onConfigurePlaceProperty?.(property)}
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : null}
        {property.type === 'button' && menuCallbacks.onConfigureButtonProperty ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              'ml-1',
              notionSurface &&
                'opacity-0 transition-opacity group-hover/column:opacity-100 group-focus-within/column:opacity-100 focus-visible:opacity-100',
            )}
            aria-label={`Configure ${property.name} Button`}
            onClick={() => menuCallbacks.onConfigureButtonProperty?.(property)}
          >
            <Pencil aria-hidden="true" />
          </Button>
        ) : null}
        {menuCallbacks.onConvertProperty ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              'ml-1',
              notionSurface &&
                'opacity-0 transition-opacity group-hover/column:opacity-100 group-focus-within/column:opacity-100 focus-visible:opacity-100',
            )}
            aria-label={`Convert ${property.name} property type`}
            disabled={mutationLocked}
            onClick={() => menuCallbacks.onConvertProperty?.(property)}
          >
            <MoveRight aria-hidden="true" />
          </Button>
        ) : null}
        {!notionSurface ? (
          <DatabasePropertyMenu
            {...menuCallbacks}
            onAddProperty={menuCallbacks.onAddProperty}
            property={property}
            propertyVisible={propertyVisible}
            layoutPropertyIndex={layoutPropertyIndex}
            visibleLayoutPropertyIds={visibleLayoutPropertyIds}
            notionSurface={notionSurface}
            mutationLocked={mutationLocked}
            calculations={calculations}
            updatePropertyLayout={updatePropertyLayout}
            openPropertyInsert={openPropertyInsert}
            openPropertyRename={openPropertyRename}
          />
        ) : null}
      </div>
    </TableHead>
  );
}
