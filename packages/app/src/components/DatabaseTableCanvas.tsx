import { Trans } from '@lingui/react/macro';
import type {
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { Table, TableCaption } from '@/components/ui/table';
import type { DatabaseTableGeometry } from '@/lib/database-table-geometry';
import type { DatabaseTableLayoutState } from '@/lib/database-table-layout';
import { cn } from '@/lib/utils';
import { DatabaseTableBody } from './DatabaseTableBody';
import { DatabaseTableColGroup } from './DatabaseTableColGroup';
import { DatabaseTableFooter } from './DatabaseTableFooter';
import type { DatabaseTableHeaderProps } from './DatabaseTableHeader';
import { DatabaseTableHeader } from './DatabaseTableHeader';
import type { DatabaseTableBodyProps } from './database-table-body-types';
import type { DatabaseTableProps } from './database-table-types';

export interface DatabaseTableCanvasProps {
  source: DatabaseSource;
  result: DatabaseQueryResult;
  properties: readonly DatabaseProperty[];
  tableRecords: readonly unknown[];
  layout: DatabaseTableLayoutState;
  geometry: DatabaseTableGeometry;
  notionSurface: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  setScrollTop: Dispatch<SetStateAction<number>>;
  setScrollLeft: Dispatch<SetStateAction<number>>;
  setViewportHeight: Dispatch<SetStateAction<number>>;
  updateViewState: (patch: { scrollTop?: number; scrollLeft?: number }) => void;
  headerProps: DatabaseTableHeaderProps;
  bodyProps: DatabaseTableBodyProps;
  footerProps: {
    calculations: NonNullable<DatabaseTableProps['calculations']>;
    properties: DatabaseTableProps['source']['properties'];
    result: DatabaseQueryResult;
    notionSurface: boolean;
    geometry: DatabaseTableGeometry;
  };
}

export function DatabaseTableCanvas({
  source,
  properties,
  tableRecords,
  layout,
  geometry,
  notionSurface,
  scrollContainerRef,
  setScrollTop,
  setScrollLeft,
  setViewportHeight,
  updateViewState,
  headerProps,
  bodyProps,
  footerProps,
}: DatabaseTableCanvasProps) {
  return (
    <Table
      role="grid"
      aria-label={`${source.name} database ${notionSurface ? 'pages' : 'records'}`}
      aria-multiselectable="true"
      aria-rowcount={tableRecords.length + 1}
      aria-colcount={properties.length + (notionSurface ? 2 : 3)}
      className={cn(
        'table-fixed',
        notionSurface && '[&_td]:px-3 [&_td]:py-0 [&_th]:h-10 [&_th]:px-3',
        layout.rowHeight === 'compact' && '[&_td]:py-1',
        layout.rowHeight === 'tall' && '[&_td]:py-5',
      )}
      data-database-inline-table={notionSurface ? '' : undefined}
      data-row-height={layout.rowHeight}
      style={{ width: '100%', minWidth: `${geometry.fixedContentWidth}px` }}
      containerClassName={cn(
        'max-h-[62vh] min-w-0 overflow-x-auto overflow-y-auto overscroll-x-contain',
        notionSurface ? 'touch-pan-x rounded-none border-0' : 'rounded-md border',
      )}
      containerProps={{
        'data-database-table-scroll-owner': '',
      }}
      containerRef={scrollContainerRef}
      onContainerScroll={(event) => {
        const nextScrollTop = event.currentTarget.scrollTop;
        const nextScrollLeft = event.currentTarget.scrollLeft;
        setScrollTop(nextScrollTop);
        setScrollLeft(nextScrollLeft);
        updateViewState({ scrollTop: nextScrollTop, scrollLeft: nextScrollLeft });
        setViewportHeight(event.currentTarget.clientHeight);
      }}
    >
      <TableCaption className="sr-only">
        {notionSurface ? <Trans>Database pages</Trans> : <Trans>Canonical database records</Trans>}
      </TableCaption>
      <DatabaseTableColGroup geometry={geometry} />
      <DatabaseTableHeader {...headerProps} />
      <DatabaseTableBody {...bodyProps} />
      <DatabaseTableFooter {...footerProps} />
    </Table>
  );
}
