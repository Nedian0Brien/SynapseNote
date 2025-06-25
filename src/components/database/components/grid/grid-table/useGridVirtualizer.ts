import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useRef } from 'react';

import { PADDING_END, useDatabaseContext } from '@/application/database-yjs';
import { RenderColumn } from '@/components/database/components/grid/grid-column';
import { RenderRow } from '@/components/database/components/grid/grid-row';
import { getScrollParent } from '@/components/global-comment/utils';
import { getPlatform } from '@/utils/platform';

const MIN_HEIGHT = 36;

export const PADDING_INLINE = getPlatform().isMobile ? 21 : 96;

export function useGridVirtualizer({ data, columns }: { columns: RenderColumn[]; data: RenderRow[] }) {
  const { isDocumentBlock } = useDatabaseContext();
  const parentRef = useRef<HTMLDivElement | null>(null);

  const parentOffsetRef = useRef(0);

  const updateParentOffset = useCallback(() => {
    if (parentRef.current) {
      parentOffsetRef.current = parentRef.current.getBoundingClientRect()?.top ?? 0;
    }
  }, []);

  useLayoutEffect(() => {
    updateParentOffset();
  }, [updateParentOffset]);

  const getScrollElement = useCallback(() => {
    if (!parentRef.current) return null;
    return parentRef.current.closest('.appflowy-scroll-container') || getScrollParent(parentRef.current);
  }, [parentRef]);

  const virtualizer = useVirtualizer({
    count: data.length,
    estimateSize: () => MIN_HEIGHT,
    overscan: 10,
    scrollMargin: parentOffsetRef.current,
    getScrollElement,
    getItemKey: (index) => data[index].rowId || data[index].type,
    paddingStart: 0,
    paddingEnd: isDocumentBlock ? 0 : PADDING_END,
  });

  // Monitor scroll element changes to recalculate offset
  useLayoutEffect(() => {
    const scrollElement = getScrollElement();

    if (!scrollElement || !isDocumentBlock) return;

    scrollElement.addEventListener('resize', updateParentOffset);

    return () => {
      scrollElement.removeEventListener('resize', updateParentOffset);
    };
  }, [getScrollElement, updateParentOffset, isDocumentBlock]);

  const getColumn = useCallback((index: number) => columns[index], [columns]);
  const getColumnWidth = useCallback((index: number) => getColumn(index).width, [getColumn]);

  const { paddingStart, paddingEnd } = useDatabaseContext();

  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getColumnWidth,
    overscan: 5,
    paddingStart: paddingStart || PADDING_INLINE,
    paddingEnd: paddingEnd || PADDING_INLINE,
    getItemKey: (index) => columns[index].fieldId || columns[index].type,
  });

  return {
    parentRef,
    virtualizer,
    columnVirtualizer,
    scrollMarginTop: parentOffsetRef.current,
  };
}
