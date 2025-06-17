import * as Y from 'yjs';

import { FieldType, SortCondition } from '@/application/database-yjs/database.type';
import { parseChecklistData, parseSelectOptionCellData } from '@/application/database-yjs/fields';
import { Row } from '@/application/database-yjs/selector';
import {
  RowId,
  YDatabaseField,
  YDatabaseFields,
  YDatabaseRow,
  YDatabaseSorts,
  YDoc,
  YjsDatabaseKey,
  YjsEditorKey,
} from '@/application/types';
import { getChecked } from '@/application/database-yjs/fields/checkbox/utils';

type SortableValue = string | number | object | boolean | undefined;

export function sortBy(rows: Row[], sorts: YDatabaseSorts, fields: YDatabaseFields, rowMetas: Record<RowId, YDoc>) {
  const sortArray = sorts.toArray();

  if (sortArray.length === 0 || Object.keys(rowMetas).length === 0 || fields.size === 0) return rows;

  // Define collator for Unicode string comparison
  // Can adjust parameters based on application needs, such as locale, sensitivity, etc.
  const collator = new Intl.Collator(undefined, {
    sensitivity: 'base', // Do not distinguish between uppercase and lowercase letters and accents
    numeric: true, // Use numeric sorting, such as "2" before "10"
    usage: 'sort', // Used specifically for sorting
  });

  // Create a function for comparison
  const compare = (a: SortableValue, b: SortableValue, order: string): number => {
    if (a === undefined && b === undefined) return 0;
    // undefined value is placed at the end
    if (a === undefined) return order === 'asc' ? 1 : -1;
    if (b === undefined) return order === 'asc' ? -1 : 1;

    // Handle strings
    if (typeof a === 'string' && typeof b === 'string') {
      return order === 'asc' ? collator.compare(a, b) : collator.compare(b, a);
    }

    // Handle other types
    if (order === 'asc') {
      return a < b ? -1 : a > b ? 1 : 0;
    } else {
      return a > b ? -1 : a < b ? 1 : 0;
    }
  };

  // Prepare sort data, pre-calculate all values to avoid multiple calculations
  const sortData = rows.map((row) => {
    const values = sortArray.map((sort) => {
      const fieldId = sort.get(YjsDatabaseKey.field_id);

      if (!fieldId) return '';

      const field = fields.get(fieldId);
      const fieldType = Number(field.get(YjsDatabaseKey.type));

      const rowId = row.id;
      const rowMeta = rowMetas[rowId];
      const meta = rowMeta?.getMap(YjsEditorKey.data_section).get(YjsEditorKey.database_row) as YDatabaseRow;

      const defaultData = parseCellDataForSort(field, '', Number(sort.get(YjsDatabaseKey.condition)));

      if (!meta) return defaultData;

      if (fieldType === FieldType.LastEditedTime) {
        return meta.get(YjsDatabaseKey.last_modified);
      }

      if (fieldType === FieldType.CreatedTime) {
        return meta.get(YjsDatabaseKey.created_at);
      }

      const cells = meta.get(YjsDatabaseKey.cells);
      const cell = cells.get(fieldId);
      const data = cell?.get(YjsDatabaseKey.data);

      if (!cell || !data) return defaultData;
      return parseCellDataForSort(field, data, Number(sort.get(YjsDatabaseKey.condition)));
    });

    return { row, values };
  });

  sortData.sort((a, b) => {
    for (let i = 0; i < sortArray.length; i++) {
      const order = Number(sortArray[i].get(YjsDatabaseKey.condition)) === SortCondition.Descending ? 'desc' : 'asc';
      const result = compare(a.values[i], b.values[i], order);

      if (result !== 0) return result;
    }

    return 0;
  });

  return sortData.map((item) => item.row);
}

function dealWithUnicode(data: string) {
  const hasUnicode = /[^\x20-\x7E]/.test(data);

  if (hasUnicode) {
    const emojiRegex = /\p{Emoji}/u;
    const emojiMatch = data.match(emojiRegex);

    if (emojiMatch && emojiMatch[0] !== data) {
      const textOnly = data.replace(emojiRegex, '').trim();

      return textOnly;
    } else if (emojiMatch && emojiMatch[0] === data) {
      return data;
    } else {
      return data;
    }
  }

  return data;
}

export function parseCellDataForSort(
  field: YDatabaseField,
  data: string | boolean | number | object | Y.Array<string>,
  condition: SortCondition
) {
  const fieldType = Number(field.get(YjsDatabaseKey.type));

  switch (fieldType) {
    case FieldType.RichText:
    case FieldType.URL: {
      if (data) {
        return dealWithUnicode(data as string);
      }

      if (condition === SortCondition.Descending) {
        return '\u0000';
      } else {
        return '\uFFFF';
      }
    }

    case FieldType.Number:
      if (data) {
        return typeof data === 'string' && !isNaN(parseInt(data)) ? parseInt(data) : data;
      }

      if (condition === SortCondition.Descending) {
        return -Infinity;
      } else {
        return Infinity;
      }

    case FieldType.Checkbox:
      return getChecked(data as string);

    case FieldType.SingleSelect:
    case FieldType.MultiSelect:
      if (data) {
        const parsedData = parseSelectOptionCellData(field, data as string);

        if (typeof parsedData === 'string') {
          return dealWithUnicode(parsedData);
        }

        return parsedData;
      }

      if (condition === SortCondition.Descending) {
        return '\u0000';
      } else {
        return '\uFFFF';
      }

    case FieldType.Checklist: {
      const percentage = parseChecklistData(data as string)?.percentage;

      if (percentage !== undefined) {
        return percentage;
      }

      if (condition === SortCondition.Descending) {
        return -Infinity;
      } else {
        return Infinity;
      }
    }

    case FieldType.DateTime: {
      if (data) {
        return Number(data);
      }

      if (condition === SortCondition.Descending) {
        return -Infinity;
      } else {
        return Infinity;
      }
    }

    case FieldType.Relation:
      return '';
  }
}
