import React, { memo, useCallback, useMemo } from 'react';

import { Row, useReadOnly } from '@/application/database-yjs';
import CardList, { CardType, RenderCard } from '@/components/database/components/board/column/CardList';
import ColumnHeaderPrimitive from '@/components/database/components/board/column/ColumnHeaderPrimitive';
import { useCardsDrag } from '@/components/database/components/board/column/useCardsDrag';
import { StateType, useColumnHeaderDrag } from '@/components/database/components/board/column/useColumnHeaderDrag';
import { DropColumnIndicator } from '@/components/database/components/board/drag-and-drop/DropColumnIndicator';

import { ColumnDragContext } from '../drag-and-drop/column-context';

export interface ColumnProps {
  id: string;
  rows: Row[];
  fieldId: string;
  addCardBefore: (id: string) => void;
  groupId: string;
}

export const Column = memo(
  ({ id, rows, fieldId, addCardBefore, groupId }: ColumnProps) => {
    const readOnly = useReadOnly();

    const data: RenderCard[] = useMemo(() => {
      const cards = rows.map((row) => ({
        type: CardType.CARD,
        id: row.id,
      }));

      if (!readOnly) {
        cards.push({
          type: CardType.NEW_CARD,
          id: 'new_card',
        });
      }

      return cards;
    }, [rows, readOnly]);

    const { columnRef, headerRef, state, isDragging } = useColumnHeaderDrag(id);
    const [scrollerContainer, setScrollerContainer] = React.useState<HTMLDivElement | null>(null);
    const { contextValue, columnInnerRef } = useCardsDrag(id, rows, scrollerContainer);

    const getCards = useCallback(
      (_columnId: string): Row[] => {
        return rows;
      },
      [rows]
    );

    return (
      <ColumnDragContext.Provider value={contextValue}>
        <div data-column-id={id} className={'relative h-full w-[256px]'} ref={columnInnerRef}>
          <div
            style={{
              opacity: isDragging ? 0.4 : 1,
              pointerEvents: isDragging ? 'none' : undefined,
            }}
            ref={columnRef}
            className={'flex w-[256px] min-w-[256px] flex-col items-center pt-2'}
          >
            <ColumnHeaderPrimitive
              rowCount={rows.length}
              id={id}
              fieldId={fieldId}
              ref={headerRef}
              style={{
                cursor: readOnly ? 'default' : isDragging ? 'grabbing' : 'grab',
              }}
              addCardBefore={addCardBefore}
              getCards={getCards}
              groupId={groupId}
            />

            <CardList
              columnId={id}
              data={data}
              fieldId={fieldId}
              setScrollElement={setScrollerContainer}
            
            />
          </div>
          {state.type === StateType.IS_COLUMN_OVER && state.closestEdge && (
            <DropColumnIndicator edge={state.closestEdge} />
          )}
        </div>
      </ColumnDragContext.Provider>
    );
  },
  (prev, next) => JSON.stringify(prev) === JSON.stringify(next)
);
