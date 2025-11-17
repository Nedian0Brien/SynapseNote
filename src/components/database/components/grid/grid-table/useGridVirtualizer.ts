import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { PADDING_END, useDatabaseContext } from '@/application/database-yjs';
import { RenderColumn } from '@/components/database/components/grid/grid-column';
import { RenderRow } from '@/components/database/components/grid/grid-row';
import { getScrollParent } from '@/components/global-comment/utils';
import { getPlatform } from '@/utils/platform';

const MIN_HEIGHT = 36;

export const PADDING_INLINE = getPlatform().isMobile ? 21 : 96;

const logDebug = (...args: Parameters<typeof console.debug>) => {
  if (import.meta.env.DEV) {
    console.debug(...args);
  }
};

export function useGridVirtualizer({ data, columns }: { columns: RenderColumn[]; data: RenderRow[] }) {
  const { isDocumentBlock, paddingStart, paddingEnd } = useDatabaseContext();
  const parentRef = useRef<HTMLDivElement | null>(null);

  const parentOffsetRef = useRef(0);
  const [parentOffset, setParentOffset] = useState(0);

  const updateParentOffset = useCallback(() => {
    if (!parentRef.current) return;

    const nextOffset = parentRef.current.getBoundingClientRect()?.top ?? 0;
    if (nextOffset === parentOffsetRef.current) return;

    parentOffsetRef.current = nextOffset;
    setParentOffset(nextOffset);
    logDebug('[GridVirtualizer] parent offset updated', {
      nextOffset,
      scrollMarginBeforeRender: parentOffset,
    });
  }, [parentOffset]);

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
    scrollMargin: parentOffset,
    getScrollElement,
    getItemKey: (index) => data[index].rowId || data[index].type,
    paddingStart: 0,
    paddingEnd: isDocumentBlock ? 0 : PADDING_END,
  });

  // Monitor scroll element changes to recalculate offset
  useLayoutEffect(() => {
    const scrollElement = getScrollElement();

    if (!scrollElement || !isDocumentBlock) {
      logDebug('[GridVirtualizer] skip observing resize', {
        hasScrollElement: !!scrollElement,
        isDocumentBlock,
      });
      return;
    }

    logDebug('[GridVirtualizer] observing scroll element for resize', {
      tagName: scrollElement.tagName,
      className: scrollElement.className,
    });

    const observer = new ResizeObserver((entries) => {
      updateParentOffset();
      logDebug('[GridVirtualizer] resize observed; recalculating offset', {
        entries: entries.map((entry) => ({
          target: entry.target instanceof HTMLElement ? entry.target.tagName : 'unknown',
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })),
      });
    });

    observer.observe(scrollElement);
    updateParentOffset();

    return () => {
      observer.disconnect();
      logDebug('[GridVirtualizer] resize observer disconnected');
    };
  }, [getScrollElement, updateParentOffset, isDocumentBlock]);

  const getColumn = useCallback((index: number) => columns[index], [columns]);
  const getColumnWidth = useCallback((index: number) => getColumn(index).width, [getColumn]);

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
    scrollMarginTop: parentOffset,
  };
}
