import { useCallback, useMemo } from 'react';
import * as Y from 'yjs';

import { RelationCell as RelationCellType, RelationCellData } from '@/application/database-yjs/cell.type';
import { useUpdateCellDispatch } from '@/application/database-yjs/dispatch';
import NoDatabaseSelectedContent from '@/components/database/components/cell/relation/NoDatabaseSelectedContent';
import RelationCellMenuContent from '@/components/database/components/cell/relation/RelationCellMenuContent';
import { useRelationData } from '@/components/database/components/property/relation/useRelationData';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

function RelationCellMenu ({
  cell,
  fieldId,
  rowId,
  open,
  onOpenChange,
}: {
  cell?: RelationCellType;
  fieldId: string;
  rowId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const data = cell?.data;
  const relationRowIds = useMemo(() => (data?.toJSON() as RelationCellData) ?? [], [data]);

  const {
    loading,
    relations,
    selectedView,
    setSelectedView,
    onUpdateDatabaseId,
    views,
    relatedDatabaseId,
  } = useRelationData(fieldId);

  const updateCell = useUpdateCellDispatch(rowId, fieldId);

  const onAddRelationRowId = useCallback((rowId: string) => {
    const newData = new Y.Array<string>();

    if (data) {
      newData.push(data.toArray());
    }

    newData.push([rowId]);

    updateCell(newData);

  }, [data, updateCell]);
  const onRemoveRelationRowId = useCallback((rowId: string) => {
    const newData = new Y.Array<string>();

    if (data) {
      newData.push(data.toArray().filter((id) => id !== rowId));
    }

    updateCell(newData);
  }, [data, updateCell]);

  const handleCloseMenu = useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
    >
      <PopoverTrigger
        style={{
          zIndex: open ? 1 : -1,
        }}
        onPointerDown={() => {
          onOpenChange?.(false);
        }}
        className={'absolute left-0 top-0 w-full h-full z-[-1]'}
      />
      <PopoverContent
        avoidCollisions={true}
        side={'bottom'}
        align={'start'}
        onOpenAutoFocus={e => e.preventDefault()}
        onCloseAutoFocus={e => e.preventDefault()}
        className={'max-w-[320px] overflow-hidden'}
      >
        {!relatedDatabaseId ? <NoDatabaseSelectedContent
          loading={loading}
          views={views}
          onSelect={(view) => {
            setSelectedView(view);
            const databaseId = Object.entries(relations || []).find(([, id]) => id === view.view_id)?.[0];

            if (databaseId) {
              onUpdateDatabaseId(databaseId);
            }
          }}
        /> : <RelationCellMenuContent
          relationRowIds={relationRowIds}
          selectedView={selectedView}
          relatedDatabaseId={relatedDatabaseId}
          loading={loading}
          onAddRelationRowId={onAddRelationRowId}
          onRemoveRelationRowId={onRemoveRelationRowId}
          onClose={handleCloseMenu}
        />}
      </PopoverContent>
    </Popover>
  );
}

export default RelationCellMenu;