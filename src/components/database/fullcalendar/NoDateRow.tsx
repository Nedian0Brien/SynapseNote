import { Draggable } from '@fullcalendar/interaction';
import { useEffect, useRef } from 'react';

import { useCellSelector, useDatabaseContext } from '@/application/database-yjs';
import { ReactComponent as DragIcon } from '@/assets/icons/drag.svg';
import { Cell } from '@/components/database/components/cell';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface NoDateRowProps {
  rowId: string;
  primaryFieldId: string;
  isWeekView: boolean;
}

export function NoDateRow({ rowId, primaryFieldId, isWeekView }: NoDateRowProps) {
  const toRow = useDatabaseContext()?.navigateToRow;
  const cell = useCellSelector({
    rowId,
    fieldId: primaryFieldId || '',
  });

  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = dragRef.current;

    if (!element) return;

    console.debug('🎯 Creating optimized Draggable for rowId:', rowId);

    // Create individual Draggable for this row with performance optimizations
    const draggable = new Draggable(element, {
      eventData: {
        title: cell?.data?.toString() || '',
        duration: isWeekView ? '01:00' : undefined,
        extendedProps: {
          rowId: rowId,
        },
      },
    });

    console.debug('✅ Optimized Draggable created for rowId:', rowId);

    return () => {
      console.debug('🎯 Destroying optimized Draggable for rowId:', rowId);
      draggable.destroy();
    };
  }, [rowId, cell?.data, isWeekView]);

  return (
    <div
      ref={dragRef}
      data-row-id={rowId}
      className={cn(
        'hover:scale-1 group flex h-[36px] w-full items-center gap-2 px-2 py-1 hover:bg-transparent hover:shadow-none',
        'fc-event fc-nodate-event' // Required for FullCalendar dragging
      )}
    >
      <div className={cn('flex cursor-grab items-center justify-center')}>
        <DragIcon className='h-5 w-5 text-icon-secondary' />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onMouseDownCapture={(e) => {
              e.stopPropagation();
              e.preventDefault();
              toRow?.(rowId);
            }}
            className='flex h-[28px] flex-1 cursor-pointer items-center truncate rounded-300 bg-surface-container-layer-01 px-2 text-sm hover:bg-surface-container-layer-02'
          >
            <Cell
              wrap={false}
              style={{
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
              readOnly
              cell={cell}
              placeholder='Empty'
              rowId={rowId}
              fieldId={primaryFieldId}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{`Click to open ${cell?.data?.toString() || 'event'}`}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export default NoDateRow;
