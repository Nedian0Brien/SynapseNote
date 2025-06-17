import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FieldType, useCellSelector, useFieldWrap, useReadOnly } from '@/application/database-yjs';
import { Cell as CellType, CellProps } from '@/application/database-yjs/cell.type';
import { useFieldSelector } from '@/application/database-yjs/selector';
import { FieldId, YjsDatabaseKey } from '@/application/types';
import { Cell } from '@/components/database/components/cell';
import { PrimaryCell } from '@/components/database/components/cell/primary';
import { useGridContext } from '@/components/database/grid/useGridContext';
import { cn } from '@/lib/utils';

export interface GridCellProps {
  rowId: string;
  fieldId: FieldId;
  columnIndex: number;
  rowIndex: number;
}

export function GridRowCell({ rowId, fieldId }: GridCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { field } = useFieldSelector(fieldId);
  const fieldType = Number(field?.get(YjsDatabaseKey.type));
  const readOnly = useReadOnly();
  const isPrimary = field?.get(YjsDatabaseKey.is_primary);
  const cell = useCellSelector({
    rowId,
    fieldId,
  });
 
  const { activeCell, setActiveCell } = useGridContext();

  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const cellEl = ref.current;

    if (!cellEl) return;

    const gridRowCell = cellEl.closest('.grid-row-cell');

    if (!gridRowCell) return;

    const handleMouseEnter = () => {
      setHovered(true);
    };

    const handleMouseLeave = () => {
      setHovered(false);
    };

    gridRowCell.addEventListener('mouseenter', handleMouseEnter);

    gridRowCell.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      gridRowCell.removeEventListener('mouseenter', handleMouseEnter);
      gridRowCell.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const Component = useMemo(() => {
    if (isPrimary) {
      return PrimaryCell;
    }

    return Cell;
  }, [isPrimary]) as React.FC<CellProps<CellType>>;

  const wrap = useFieldWrap(fieldId);

  const isActive = activeCell?.rowId === rowId && activeCell?.fieldId === fieldId;

  const setEditing = useCallback(
    (status: boolean) => {
      if (status) {
        setActiveCell({
          rowId,
          fieldId,
        });
      } else {
        setActiveCell(undefined);
      }
    },
    [fieldId, rowId, setActiveCell]
  );

  const paddingVertical = useMemo(() => {
    switch (fieldType) {
      case FieldType.SingleSelect:
      case FieldType.MultiSelect:
        return 'py-[7px]';
      case FieldType.FileMedia:
        return 'py-1';
      default:
        return 'py-2';
    }
  }, [fieldType]);

  if (!field) return null;

  return (
    <div ref={ref} className={cn('grid-cell flex w-full items-start overflow-hidden px-2 text-sm', paddingVertical)}>
      <Component
        cell={cell}
        rowId={rowId}
        fieldId={fieldId}
        readOnly={readOnly}
        editing={isActive}
        setEditing={setEditing}
        isHovering={hovered}
        wrap={wrap}
      />
    </div>
  );
}

export default GridRowCell;
