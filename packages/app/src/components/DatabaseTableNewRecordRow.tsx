import { t } from '@lingui/core/macro';
import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="database-new-row-create"
              aria-label={notionSurface ? 'Add new page' : 'Add new record'}
              disabled={mutationLocked}
              className={cn(
                'w-full justify-start px-0 font-normal text-muted-foreground',
                notionSurface ? 'h-[42px]' : 'h-8',
              )}
              onClick={() => {
                setEditError(null);
                onCreateRecord('');
              }}
            >
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              {notionSurface ? t`New page` : t`New record`}
            </Button>
          ) : null}
        </TableCell>
      ))}
      {notionSurface ? (
        <>
          <TableCell role="gridcell" aria-colindex={properties.length + 1} className="p-0" />
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
            <span className="text-muted-foreground text-xs">{t`Click to add`}</span>
          </TableCell>
        </>
      )}
    </TableRow>
  ) : null;
}
