import * as Y from 'yjs';

import { FieldType } from '@/application/database-yjs/database.type';
import { getDateCellStr, parseChecklistData, parseSelectOptionTypeOptions } from '@/application/database-yjs/fields';
import { User, YDatabaseCell, YDatabaseField, YjsDatabaseKey } from '@/application/types';

import { Cell, DateTimeCell, FileMediaCell, FileMediaCellData } from './cell.type';

export function parseYDatabaseCommonCellToCell(cell: YDatabaseCell): Cell {
  return {
    createdAt: Number(cell.get(YjsDatabaseKey.created_at)),
    lastModified: Number(cell.get(YjsDatabaseKey.last_modified)),
    fieldType: parseInt(cell.get(YjsDatabaseKey.field_type)) as FieldType,
    data: cell.get(YjsDatabaseKey.data),
  };
}

export function parseYDatabaseCellToCell(cell: YDatabaseCell): Cell {
  const cellType = parseInt(cell.get(YjsDatabaseKey.field_type));

  let value = parseYDatabaseCommonCellToCell(cell);

  if (cellType === FieldType.DateTime) {
    value = parseYDatabaseDateTimeCellToCell(cell);
  }

  if (cellType === FieldType.FileMedia) {
    value = parseYDatabaseFileMediaCellToCell(cell);
  }

  if (cellType === FieldType.Relation) {
    value = parseYDatabaseRelationCellToCell(cell);
  }

  return value;
}

export function parseYDatabaseDateTimeCellToCell(cell: YDatabaseCell): DateTimeCell {
  let data = cell.get(YjsDatabaseKey.data);

  if (typeof data !== 'string' && typeof data !== 'number') {
    data = '';
  } else {
    data = String(data);
  }

  return {
    ...parseYDatabaseCommonCellToCell(cell),
    data,
    fieldType: FieldType.DateTime,
    endTimestamp: cell.get(YjsDatabaseKey.end_timestamp),
    includeTime: cell.get(YjsDatabaseKey.include_time),
    isRange: cell.get(YjsDatabaseKey.is_range),
    reminderId: cell.get(YjsDatabaseKey.reminder_id),
  };
}

export function parseYDatabaseFileMediaCellToCell(cell: YDatabaseCell): FileMediaCell {
  const data = cell.get(YjsDatabaseKey.data) as Y.Array<string>;

  if (!data || !(data instanceof Y.Array<string>)) {
    return {
      ...parseYDatabaseCommonCellToCell(cell),
      data: [],
      fieldType: FieldType.FileMedia,
    } as FileMediaCell;
  }

  // Convert YArray<string> to FileMediaCellData
  const dataJson = data.toJSON().map((item: string) => JSON.parse(item)) as FileMediaCellData;

  return {
    ...parseYDatabaseCommonCellToCell(cell),
    data: dataJson,
    fieldType: FieldType.FileMedia,
  };
}

export function parseYDatabaseRelationCellToCell(cell: YDatabaseCell): Cell {
  const data = cell.get(YjsDatabaseKey.data) as Y.Array<string>;

  if (!data || !(data instanceof Y.Array<string>)) {
    return {
      ...parseYDatabaseCommonCellToCell(cell),
      fieldType: FieldType.Relation,
      data: null,
    };
  }

  return {
    ...parseYDatabaseCommonCellToCell(cell),
    fieldType: FieldType.Relation,
    data: data,
  };
}

export function getCellDataText(cell: YDatabaseCell, field: YDatabaseField, currentUser?: User): string {
  const type = parseInt(field.get(YjsDatabaseKey.type));

  switch (type) {
    case FieldType.SingleSelect:
    case FieldType.MultiSelect: {
      const data = cell.get(YjsDatabaseKey.data);
      const options = parseSelectOptionTypeOptions(field)?.options || [];

      if (typeof data === 'string') {
        return (
          data
            .split(',')
            .map((item) => options?.find((option) => option?.id === item)?.name)
            .filter((item) => item)
            .join(',') || ''
        );
      }

      return '';
    }

    case FieldType.Checklist: {
      const cellData = cell.get(YjsDatabaseKey.data);

      if (typeof cellData === 'string') {
        const { options = [], selectedOptionIds = [] } = parseChecklistData(cellData) || {};

        return JSON.stringify({
          tasks: options.map((option) => ({
            id: option.id,
            name: option.name,
            checked: selectedOptionIds.includes(option.id),
          })),
          progress: {
            completed: selectedOptionIds.length,
            total: options.length,
          },
        });
      }

      return '';
    }

    case FieldType.DateTime: {
      const dateCell = parseYDatabaseDateTimeCellToCell(cell);

      return getDateCellStr({ cell: dateCell, field, currentUser });
    }

    case FieldType.CreatedTime:
    case FieldType.LastEditedTime:
    case FieldType.Relation:
      return '';

    default: {
      const data = cell.get(YjsDatabaseKey.data);

      if (typeof data === 'string' || typeof data === 'number') {
        return String(data);
      }

      return '';
    }
  }
}
