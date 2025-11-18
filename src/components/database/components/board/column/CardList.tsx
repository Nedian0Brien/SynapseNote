import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useMemo, useCallback, useRef, useLayoutEffect } from 'react';

import { PADDING_END } from '@/application/database-yjs';
import { useBoardContext } from '@/components/database/board/BoardProvider';
import { Card } from '@/components/database/components/board/card';
import { cn } from '@/lib/utils';

export enum CardType {
  CARD = 'card',
  NEW_CARD = 'new_card',
}

export interface RenderCard {
  type: CardType;
  id: string;
}

// Threshold for enabling virtualization - only virtualize when cards exceed this count
// This prevents scroll jumping issues for small lists while maintaining performance for large ones
const VIRTUALIZATION_THRESHOLD = 100;

function CardList({
  data,
  fieldId,
  columnId,
  setScrollElement,
  virtualizationThreshold = VIRTUALIZATION_THRESHOLD,
}: {
  columnId: string;
  data: RenderCard[];
  fieldId: string;
  setScrollElement?: (element: HTMLDivElement | null) => void;
  virtualizationThreshold?: number;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const parentOffsetRef = useRef(0);
  const { creatingColumnId, setCreatingColumnId } = useBoardContext();

  const isCreating = useMemo(() => {
    return creatingColumnId === columnId;
  }, [creatingColumnId, columnId]);

  const setIsCreating = useCallback(
    (isCreating: boolean) => {
      if (isCreating) {
        setCreatingColumnId(columnId);
      } else {
        setCreatingColumnId(null);
      }
    },
    [columnId, setCreatingColumnId]
  );

  // Determine if we should use virtualization based on data size
  const shouldVirtualize = data.length > virtualizationThreshold;

  useLayoutEffect(() => {
    if (shouldVirtualize) {
      parentOffsetRef.current = parentRef.current?.getBoundingClientRect()?.top ?? 0;
    }
  }, [shouldVirtualize]);

  // Only use virtualization for large datasets to prevent scroll jumping on small lists
  const getScrollElement = useCallback(() => {
    if (!shouldVirtualize || !parentRef.current) return null;
    // For large lists, attach to parent container (local scroll) instead of document scroll
    // This prevents scroll jumping when Board mounts
    return parentRef.current;
  }, [shouldVirtualize]);

  const virtualizer = useVirtualizer({
    count: data.length,
    scrollMargin: shouldVirtualize ? parentOffsetRef.current : 0,
    overscan: 5,
    getScrollElement,
    estimateSize: () => 36,
    paddingStart: 0,
    paddingEnd: PADDING_END,
    getItemKey: (index) => data[index].id || String(index),
    enabled: shouldVirtualize,
  });

  const items = shouldVirtualize ? virtualizer.getVirtualItems() : data.map((row, index) => ({ index, key: row.id }));

  return (
    <div
      ref={parentRef}
      className='appflowy-custom-scroller w-full'
      style={{
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          height: shouldVirtualize ? virtualizer.getTotalSize() : undefined,
          width: '100%',
          position: shouldVirtualize ? 'relative' : undefined,
          paddingBottom: shouldVirtualize ? undefined : PADDING_END,
        }}
      >
        {items.map((item) => {
          const index = item.index;
          const row = data[index];
          const { id, type } = row;

          if (shouldVirtualize) {
            // Virtualized rendering for large lists
            return (
              <div
                key={item.key}
                data-index={index}
                ref={virtualizer.measureElement}
                className={cn('w-full px-2 py-[3px]', isCreating && 'transform transition-all duration-150 ease-in-out')}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  transform: `translateY(${(item as any).start - virtualizer.options.scrollMargin}px)`,
                  paddingTop: index === 0 ? 10 : undefined,
                }}
              >
                <Card
                  type={type}
                  rowId={id}
                  groupFieldId={fieldId}
                  setIsCreating={setIsCreating}
                  isCreating={isCreating}
                  columnId={columnId}
                  beforeId={data[index - 1]?.id}
                />
              </div>
            );
          } else {
            // Direct rendering for small lists (prevents scroll jumping)
            return (
              <div
                key={item.key}
                data-index={index}
                className={cn('w-full px-2 py-[3px]', isCreating && 'transform transition-all duration-150 ease-in-out')}
                style={{
                  paddingTop: index === 0 ? 10 : undefined,
                }}
              >
                <Card
                  type={type}
                  rowId={id}
                  groupFieldId={fieldId}
                  setIsCreating={setIsCreating}
                  isCreating={isCreating}
                  columnId={columnId}
                  beforeId={data[index - 1]?.id}
                />
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}

export default memo(CardList);
