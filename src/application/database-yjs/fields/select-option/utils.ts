import { FieldType, SelectOptionColor } from '@/application/database-yjs';
import { YDatabaseCell, YjsDatabaseKey } from '@/application/types';
import { nanoid } from 'nanoid';
import * as Y from 'yjs';

export function createSelectOptionCell (fieldId: string, type: FieldType, data: string) {
  const cell = new Y.Map() as YDatabaseCell;

  cell.set(YjsDatabaseKey.id, fieldId);
  cell.set(YjsDatabaseKey.data, data);
  cell.set(YjsDatabaseKey.field_type, Number(type));
  cell.set(YjsDatabaseKey.created_at, Date.now());
  cell.set(YjsDatabaseKey.last_modified, Date.now());

  return cell;
}

export function generateOptionId () {
  return nanoid(6);
}

export function getColorByOption (text: string): SelectOptionColor {
  if (!text || text.length === 0) {
    const colors = Object.values(SelectOptionColor);

    return colors[Math.floor(Math.random() * colors.length)];
  }

  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }

  hash = Math.abs(hash);

  const colors = Object.values(SelectOptionColor);
  const colorIndex = hash % 10;

  return colors[colorIndex];
}