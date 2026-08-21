import { Trans } from '@lingui/react/macro';
import type {
  DatabaseCalculationFunction,
  DatabaseProperty,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { databaseCalculationFunctionsForProperty } from '@nedian0brien/synapsenote-core';
import {
  Braces,
  ChevronLeft,
  ChevronRight,
  Copy,
  MoreHorizontalIcon,
  MoveRight,
  Pencil,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { moveDatabaseTableProperty } from '@/lib/database-table-layout';
import { DatabaseNumberPropertyMenu } from './DatabaseNumberPropertyMenu';
import { type DatabaseTableProps, isDatabaseSelectProperty } from './database-table-types';

export interface DatabasePropertyMenuProps
  extends Pick<
    DatabaseTableProps,
    | 'onOpenPropertySort'
    | 'onOpenPropertyFilter'
    | 'onOpenPropertyContextInspector'
    | 'onOpenAgentScope'
    | 'onConfigureSelectProperty'
    | 'onConfigureNumberProperty'
    | 'onConvertProperty'
    | 'onManageProperties'
    | 'onRenameProperty'
    | 'onDuplicateProperty'
    | 'onRemoveProperty'
    | 'onCalculationChange'
  > {
  databaseId: string;
  viewId: string | null;
  source: DatabaseSource;
  property: DatabaseProperty;
  propertyVisible: boolean;
  layoutPropertyIndex: number;
  visibleLayoutPropertyIds: readonly string[];
  notionSurface: boolean;
  mutationLocked: boolean;
  calculations: Readonly<Record<string, DatabaseCalculationFunction>>;
  updatePropertyLayout: (
    update: (
      current: import('@/lib/database-table-layout').DatabaseTableLayoutState,
    ) => import('@/lib/database-table-layout').DatabaseTableLayoutState,
  ) => void;
  openPropertyInsert: (property: DatabaseProperty, position: 'before' | 'after') => void;
  openPropertyRename: (property: DatabaseProperty) => void;
  onAddProperty: DatabaseTableProps['onAddProperty'];
  /** Optional full-header trigger used by the document-native table. */
  trigger?: ReactNode;
}

export function DatabasePropertyMenu({
  databaseId,
  viewId,
  source,
  property,
  propertyVisible,
  layoutPropertyIndex,
  visibleLayoutPropertyIds,
  notionSurface,
  mutationLocked,
  calculations,
  updatePropertyLayout,
  openPropertyInsert,
  openPropertyRename,
  onAddProperty,
  onOpenPropertySort,
  onOpenPropertyFilter,
  onOpenPropertyContextInspector,
  onOpenAgentScope,
  onConfigureSelectProperty,
  onConfigureNumberProperty,
  onConvertProperty,
  onManageProperties,
  onRenameProperty,
  onDuplicateProperty,
  onRemoveProperty,
  onCalculationChange,
  trigger,
}: DatabasePropertyMenuProps) {
  const [open, setOpen] = useState(false);
  const calculationOptions = databaseCalculationFunctionsForProperty(property);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={
              notionSurface
                ? 'ml-1 opacity-0 transition-opacity group-hover/column:opacity-100 group-focus-within/column:opacity-100 focus-visible:opacity-100'
                : 'ml-1'
            }
            aria-label={`Property options for ${property.name}`}
            disabled={mutationLocked}
            data-property-menu-trigger={property.id}
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{property.name}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={propertyVisible}
          disabled={property.type === 'title'}
          onCheckedChange={(checked) =>
            updatePropertyLayout((current) => ({
              ...current,
              hiddenPropertyIds:
                checked === true
                  ? current.hiddenPropertyIds.filter((id) => id !== property.id)
                  : [...new Set([...current.hiddenPropertyIds, property.id])],
            }))
          }
        >
          <Trans>Show column</Trans>
        </DropdownMenuCheckboxItem>
        <DropdownMenuItem
          disabled={property.type === 'title' || layoutPropertyIndex <= 1}
          onSelect={() =>
            updatePropertyLayout((current) => moveDatabaseTableProperty(current, property.id, -1))
          }
        >
          <ChevronLeft aria-hidden="true" />
          <Trans>Move left</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={
            property.type === 'title' ||
            layoutPropertyIndex < 0 ||
            layoutPropertyIndex >= visibleLayoutPropertyIds.length - 1
          }
          onSelect={() =>
            updatePropertyLayout((current) => moveDatabaseTableProperty(current, property.id, 1))
          }
        >
          <ChevronRight aria-hidden="true" />
          <Trans>Move right</Trans>
        </DropdownMenuItem>
        {notionSurface && onAddProperty ? (
          <>
            <DropdownMenuItem
              disabled={property.type === 'title' || mutationLocked}
              onSelect={() => window.setTimeout(() => openPropertyInsert(property, 'before'), 20)}
            >
              <ChevronLeft aria-hidden="true" />
              <Trans>Insert left</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={mutationLocked}
              onSelect={() => window.setTimeout(() => openPropertyInsert(property, 'after'), 20)}
            >
              <ChevronRight aria-hidden="true" />
              <Trans>Insert right</Trans>
            </DropdownMenuItem>
          </>
        ) : null}
        {onOpenPropertySort ? (
          <DropdownMenuItem onSelect={() => onOpenPropertySort(property)}>
            <Trans>Sort by property</Trans>
          </DropdownMenuItem>
        ) : null}
        {onOpenPropertyFilter ? (
          <DropdownMenuItem onSelect={() => onOpenPropertyFilter(property)}>
            <Trans>Filter by property</Trans>
          </DropdownMenuItem>
        ) : null}
        {calculationOptions.length > 0 && onCalculationChange ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Trans>Calculate</Trans>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={calculations[property.id] ?? 'none'}
                onValueChange={(value) =>
                  onCalculationChange(
                    property.id,
                    value === 'none' ? null : (value as DatabaseCalculationFunction),
                  )
                }
              >
                <DropdownMenuRadioItem value="none">
                  <Trans>No calculation</Trans>
                </DropdownMenuRadioItem>
                {calculationOptions.map((calculation) => (
                  <DropdownMenuRadioItem key={calculation} value={calculation}>
                    {calculation.replaceAll('_', ' ')}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuSeparator />
        {onOpenPropertyContextInspector ? (
          <DropdownMenuItem onSelect={() => onOpenPropertyContextInspector(property)}>
            <Braces aria-hidden="true" />
            <Trans>Inspect property context</Trans>
          </DropdownMenuItem>
        ) : null}
        {onOpenAgentScope ? (
          <DropdownMenuItem
            onSelect={() =>
              onOpenAgentScope({
                databaseId,
                sourceId: source.id,
                ...(viewId ? { viewId } : {}),
                propertyIds: [property.id],
              })
            }
          >
            <Sparkles aria-hidden="true" />
            <Trans>Ask agent about property</Trans>
          </DropdownMenuItem>
        ) : null}
        {isDatabaseSelectProperty(property) && onConfigureSelectProperty ? (
          <DropdownMenuItem onSelect={() => onConfigureSelectProperty(property)}>
            <Settings2 aria-hidden="true" />
            <Trans>Configure options</Trans>
          </DropdownMenuItem>
        ) : null}
        {property.type === 'number' && onConfigureNumberProperty ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Settings2 aria-hidden="true" />
              <Trans>Number display</Trans>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-auto p-0">
              <DatabaseNumberPropertyMenu
                property={property}
                disabled={mutationLocked}
                onApply={(numberProperty, visualization) => {
                  onConfigureNumberProperty(numberProperty, visualization);
                  setOpen(false);
                }}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuItem
          disabled={
            !(notionSurface && onRenameProperty) &&
            !(onManageProperties && property.type !== 'title')
          }
          onSelect={() => {
            if (notionSurface && onRenameProperty) {
              window.setTimeout(() => openPropertyRename(property), 20);
            } else {
              onManageProperties?.(property.id);
            }
          }}
        >
          <Pencil aria-hidden="true" />
          <Trans>Rename or configure property</Trans>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!onConvertProperty || mutationLocked}
          onSelect={() => onConvertProperty?.(property)}
        >
          <MoveRight aria-hidden="true" />
          <Trans>Change property type</Trans>
        </DropdownMenuItem>
        {onDuplicateProperty ? (
          <DropdownMenuItem
            disabled={property.type === 'title' || mutationLocked}
            onSelect={() => onDuplicateProperty(property)}
          >
            <Copy aria-hidden="true" />
            <Trans>Duplicate property</Trans>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={property.type === 'title' || !onRemoveProperty || mutationLocked}
          onSelect={() => onRemoveProperty?.(property)}
        >
          <Trash2 aria-hidden="true" />
          <Trans>Delete property</Trans>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
