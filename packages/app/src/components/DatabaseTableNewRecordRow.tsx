import { t } from '@lingui/core/macro';
import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import type { DatabaseTableGeometry } from '@/lib/database-table-geometry';
import type { DatabaseTableLayoutState } from '@/lib/database-table-layout';
import { cn } from '@/lib/utils';
import type { DatabaseTableProps } from './database-table-types';

export interface DatabaseTableNewRecordRowProps extends Pick<DatabaseTableProps, 'onCreateRecord'> {
  recordCount: number;
  properties: readonly DatabaseProperty[];
  layout: DatabaseTableLayoutState;
  notionSurface: boolean;
  geometry: DatabaseTableGeometry;
  mutationLocked: boolean;
  setEditError: (value: string | null) => void;
}

export function DatabaseTableNewRecordRow({
  recordCount,
  properties,
  layout,
  notionSurface,
  geometry,
  mutationLocked,
  setEditError,
  onCreateRecord,
}: DatabaseTableNewRecordRowProps) {
  return onCreateRecord ? (
    <TableRow
      aria-rowindex={recordCount + 2}
      data-new-record-row
      data-canonical="false"
      className={cn(
        'border-primary/30 border-dashed bg-primary/5',
        notionSurface && 'border-border/60 bg-transparent',
      )}
      style={notionSurface ? { height: 52 } : undefined}
    >
      {!notionSurface ? (
        <TableCell role="gridcell" aria-colindex={1} className="sticky left-0 z-20" />
      ) : null}
      {properties.map((property, index) => (
        <TableCell
          key={property.id}
          role="gridcell"
          aria-colindex={index + (notionSurface ? 1 : 2)}
          className={cn(
            index === 0 && 'sticky left-0 z-10 font-medium',
            layout.wrap ? 'whitespace-normal' : 'whitespace-nowrap',
            notionSurface && 'px-2 py-0',
          )}
          data-property-id={property.id}
          style={index === 0 ? { left: `${geometry.titleStickyInset}px` } : undefined}
        >
          {index === 0 && property.type === 'title' ? (
            <div
              className={cn('flex items-center', notionSurface && 'gap-1 text-muted-foreground')}
            >
              {notionSurface ? <Plus className="size-4 shrink-0" aria-hidden="true" /> : null}
              <Input
                data-testid="database-new-row-title"
                aria-label={notionSurface ? 'New page title' : 'New row title'}
                placeholder={notionSurface ? t`New page` : t`New record title`}
                disabled={mutationLocked}
                className={cn(
                  notionSurface ? 'h-[42px]' : 'h-8',
                  notionSurface &&
                    '!bg-transparent border-0 px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
                )}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return;
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const title = event.currentTarget.value.trim();
                    event.currentTarget.value = '';
                    setEditError(null);
                    onCreateRecord(title);
                  }
                  if (event.key === 'Escape') {
                    event.currentTarget.value = '';
                    setEditError(null);
                    event.currentTarget.blur();
                  }
                }}
              />
            </div>
          ) : null}
        </TableCell>
      ))}
      {notionSurface ? (
        <>
          <TableCell role="gridcell" aria-colindex={properties.length + 1} className="p-0">
            <span className="sr-only">{t`Press Enter to create page`}</span>
          </TableCell>
          <TableCell
            role="presentation"
            aria-hidden="true"
            className="pointer-events-none p-0"
            data-database-table-filler
          />
        </>
      ) : (
        <>
          <TableCell
            role="presentation"
            aria-hidden="true"
            className="pointer-events-none p-0"
            data-database-table-filler
          />
          <TableCell
            role="gridcell"
            aria-colindex={properties.length + 3}
            className="sticky right-0 z-10"
          >
            <span className="text-muted-foreground text-xs">{t`Press Enter to add`}</span>
          </TableCell>
        </>
      )}
    </TableRow>
  ) : null;
}
