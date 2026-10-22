import { Trans, useLingui } from '@lingui/react/macro';
import type {
  DatabaseCalculationFunction,
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { databaseCalculationFunctionsForProperty } from '@nedian0brien/synapsenote-core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { databasePropertyTypeLabel } from '@/lib/database-property-copy';
import {
  type DatabaseTableLayoutState,
  moveDatabaseTableProperty,
} from '@/lib/database-table-layout';
import { cn } from '@/lib/utils';
import {
  DATABASE_TABLE_RENDERED_COLUMN_LIMIT,
  type DatabaseTableProps,
} from './database-table-types';

export interface DatabaseTableControlsProps
  extends Pick<DatabaseTableProps, 'onManageProperties' | 'onCalculationChange'> {
  propertyRenameTarget: DatabaseProperty | null;
  propertyRenameDraft: string;
  setPropertyRenameDraft: Dispatch<SetStateAction<string>>;
  closePropertyRename: () => void;
  submitPropertyRename: () => void;
  notionSurface: boolean;
  mutationLocked: boolean;
  layout: DatabaseTableLayoutState;
  setLayout: Dispatch<SetStateAction<DatabaseTableLayoutState>>;
  allProperties: readonly DatabaseProperty[];
  updatePropertyLayout: (
    update: (current: DatabaseTableLayoutState) => DatabaseTableLayoutState,
  ) => void;
  calculations: Readonly<Record<string, DatabaseCalculationFunction>>;
  gridAnnouncement: string;
  editError: string | null;
  result: DatabaseQueryResult;
  ghost: { diff: { records: readonly { action: string; sourceId: string }[] } } | null;
  source: DatabaseSource;
  searchQuery: string;
  omittedColumnCount: number;
}

export function DatabaseTableControls({
  propertyRenameTarget,
  propertyRenameDraft,
  setPropertyRenameDraft,
  closePropertyRename,
  submitPropertyRename,
  notionSurface,
  mutationLocked,
  layout,
  setLayout,
  allProperties,
  updatePropertyLayout,
  calculations,
  gridAnnouncement,
  editError,
  result,
  ghost,
  source,
  searchQuery,
  omittedColumnCount,
  onManageProperties,
  onCalculationChange,
}: DatabaseTableControlsProps) {
  const { t } = useLingui();
  return (
    <>
      {propertyRenameTarget ? (
        <Popover
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closePropertyRename();
          }}
        >
          <PopoverAnchor asChild>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-2 left-1/2 size-px"
            />
          </PopoverAnchor>
          <PopoverContent align="center" className="w-72">
            <div className="grid gap-3">
              <div>
                <h3 className="font-medium text-sm">Edit property</h3>
                <p className="mt-1 text-muted-foreground text-xs">
                  Change the name without leaving this table.
                </p>
              </div>
              <Input
                autoFocus
                value={propertyRenameDraft}
                aria-label={`Property name for ${propertyRenameTarget.name}`}
                onChange={(event) => setPropertyRenameDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitPropertyRename();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closePropertyRename();
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                Type: {databasePropertyTypeLabel(propertyRenameTarget.type)}
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={closePropertyRename}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!propertyRenameDraft.trim() || mutationLocked}
                  onClick={submitPropertyRename}
                >
                  Save
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
      {!notionSurface ? (
        <details
          className="mb-2 rounded-md border bg-muted/10 p-2"
          data-testid="table-layout-controls"
        >
          <summary className="cursor-pointer select-none font-medium text-sm">
            <Trans>Table layout and calculations</Trans>
          </summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {onManageProperties ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onManageProperties()}
                >
                  <Trans>Manage properties</Trans>
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant={layout.wrap ? 'secondary' : 'outline'}
                aria-pressed={layout.wrap}
                onClick={() => setLayout((current) => ({ ...current, wrap: !current.wrap }))}
              >
                <Trans>Wrap cells</Trans>
              </Button>
              <Select
                value={layout.rowHeight}
                onValueChange={(rowHeight: 'compact' | 'standard' | 'tall') =>
                  setLayout((current) => ({ ...current, rowHeight }))
                }
              >
                <SelectTrigger size="sm" className="w-36" aria-label="Table row height">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="tall">Tall</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              {layout.propertyIds.map((propertyId, propertyIndex) => {
                const property = allProperties.find((candidate) => candidate.id === propertyId);
                if (!property) return null;
                const title = property.type === 'title';
                const shown = !layout.hiddenPropertyIds.includes(property.id);
                const allowedCalculations = databaseCalculationFunctionsForProperty(property);
                return (
                  <div
                    key={property.id}
                    className="grid items-center gap-2 rounded border bg-background p-2 sm:grid-cols-[minmax(8rem,1fr)_auto_minmax(8rem,12rem)_minmax(10rem,14rem)]"
                    data-layout-property-id={property.id}
                  >
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <Checkbox
                        checked={shown}
                        disabled={title}
                        aria-label={`Show ${property.name} column`}
                        onCheckedChange={(checked) =>
                          updatePropertyLayout((current) => ({
                            ...current,
                            hiddenPropertyIds:
                              checked === true
                                ? current.hiddenPropertyIds.filter((id) => id !== property.id)
                                : [...new Set([...current.hiddenPropertyIds, property.id])],
                          }))
                        }
                      />
                      <span className="truncate">{property.name}</span>
                      {title ? <Badge variant="gray">Frozen</Badge> : null}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Move ${property.name} left`}
                        disabled={title || propertyIndex <= 1}
                        onClick={() =>
                          updatePropertyLayout((current) =>
                            moveDatabaseTableProperty(current, property.id, -1),
                          )
                        }
                      >
                        <ChevronLeft />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Move ${property.name} right`}
                        disabled={title || propertyIndex >= layout.propertyIds.length - 1}
                        onClick={() =>
                          updatePropertyLayout((current) =>
                            moveDatabaseTableProperty(current, property.id, 1),
                          )
                        }
                      >
                        <ChevronRight />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="sr-only">{`Width of ${property.name}`}</span>
                      <Input
                        type="range"
                        min={120}
                        max={480}
                        step={20}
                        value={layout.widths[property.id] ?? 180}
                        aria-label={`Width of ${property.name}`}
                        onChange={(event) =>
                          setLayout((current) => ({
                            ...current,
                            widths: {
                              ...current.widths,
                              [property.id]: Number(event.currentTarget.value),
                            },
                          }))
                        }
                      />
                      <span>{layout.widths[property.id] ?? 180}px</span>
                    </div>
                    <Select
                      value={calculations[property.id] ?? 'none'}
                      onValueChange={(value) =>
                        onCalculationChange?.(
                          property.id,
                          value === 'none' ? null : (value as DatabaseCalculationFunction),
                        )
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={`Calculation for ${property.name}`}
                        disabled={!onCalculationChange}
                      >
                        <SelectValue placeholder="No calculation" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No calculation</SelectItem>
                        {allowedCalculations.map((calculation) => (
                          <SelectItem key={calculation} value={calculation}>
                            {calculation.replaceAll('_', ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      ) : null}
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="database-grid-announcement"
      >
        {gridAnnouncement}
      </p>
      {editError ? (
        <div
          className="mb-2 text-destructive text-xs"
          role="alert"
          data-database-state="invalid_value"
        >
          {editError}
        </div>
      ) : null}
      {result.records.length === 0 &&
      !ghost?.diff.records.some(
        (record) => record.action === 'create' && record.sourceId === source.id,
      ) ? (
        <div
          className={cn(
            'mb-2 text-muted-foreground text-sm',
            notionSurface
              ? searchQuery.trim()
                ? 'px-1 text-xs'
                : 'sr-only'
              : 'rounded-md border border-dashed p-3',
          )}
          data-database-state="empty"
        >
          {notionSurface && searchQuery.trim() ? (
            <Trans>No pages match “{searchQuery}”.</Trans>
          ) : notionSurface ? (
            <Trans>No pages in this source.</Trans>
          ) : (
            <Trans>No records in this source.</Trans>
          )}{' '}
          <span className="text-xs">
            {notionSurface ? t`Use the row below to add a page.` : t`Use the last row to add one.`}
          </span>
        </div>
      ) : null}
      {omittedColumnCount > 0 ? (
        <div
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"
          role="status"
          data-testid="database-column-limit"
        >
          <Trans>
            This table shows the first {DATABASE_TABLE_RENDERED_COLUMN_LIMIT} visible properties;
            hide or reorder properties to view the remaining {omittedColumnCount}.
          </Trans>
        </div>
      ) : null}
    </>
  );
}
