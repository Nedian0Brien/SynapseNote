import { FieldType, useCellSelector, useFieldSelector, useReadOnly } from '@/application/database-yjs';
import { Cell as CellType, CellProps } from '@/application/database-yjs/cell.type';
import { YjsDatabaseKey } from '@/application/types';
import ChecklistCell from '@/components/database/components/database-row/checklist/ChecklistCell';
import FileMediaCell from '@/components/database/components/database-row/file-media/FileMediaCell';
import { cn } from '@/lib/utils';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Cell from 'src/components/database/components/cell/Cell';

function RowPropertyCell ({ fieldId, rowId }: {
  fieldId: string;
  rowId: string;
}) {
  const cell = useCellSelector({
    fieldId,
    rowId,
  });
  const { t } = useTranslation();

  const readOnly = useReadOnly();
  const { field } = useFieldSelector(fieldId);
  const fieldType = Number(field?.get(YjsDatabaseKey.type)) as FieldType;

  const [hovering, setHovering] = React.useState<boolean>(false);
  const [editing, setEditing] = React.useState<boolean>(false);

  const isChecklist = fieldType === FieldType.Checklist;
  const isFileMedia = fieldType === FieldType.FileMedia;
  const CellComponent = useMemo(() => {
    if (isChecklist) {
      return ChecklistCell;
    }

    if (isFileMedia) {
      return FileMediaCell;
    }

    return Cell;
  }, [isChecklist, isFileMedia]) as React.FC<CellProps<CellType>>;

  return (
    <div
      onClick={() => {
        if (readOnly) return;
        setEditing(true);
      }}
      onMouseEnter={() => {
        if (readOnly) return;
        setHovering(true);
      }}
      onMouseLeave={() => {
        if (readOnly) return;
        setHovering(false);
      }}
      className={cn('flex rounded-300 px-2 text-sm h-fit min-h-[36px] relative flex-1 flex-wrap items-center overflow-x-hidden py-2 pr-1', !readOnly && !isChecklist && 'hover:bg-fill-content-hover cursor-pointer')}
    >
      <CellComponent
        cell={cell}
        placeholder={t('grid.row.textPlaceholder')}
        fieldId={fieldId}
        rowId={rowId}
        readOnly={readOnly}
        isHovering={hovering}
        editing={editing}
        setEditing={setEditing}
        wrap={true}
        {...([
          FieldType.LastEditedTime,
          FieldType.CreatedTime,
        ].includes(fieldType) ? {
          attrName: fieldType === FieldType.LastEditedTime ? YjsDatabaseKey.last_modified : YjsDatabaseKey.created_at,
        } : undefined)}
      />
    </div>
  );
}

export default RowPropertyCell;