import * as Y from 'yjs';

import { FieldType } from '@/application/database-yjs';
import { YDatabaseField, YjsDatabaseKey } from '@/application/types';

export function createTextField (id: string) {
  const field = new Y.Map() as YDatabaseField;

  field.set(YjsDatabaseKey.name, 'Text');
  field.set(YjsDatabaseKey.id, id);
  field.set(YjsDatabaseKey.type, FieldType.RichText);

  return field;
}

export function createDateTimeField(fieldId: string) {
  const field = new Y.Map() as YDatabaseField;

  field.set(YjsDatabaseKey.name, 'Date');
  field.set(YjsDatabaseKey.id, fieldId);
  field.set(YjsDatabaseKey.type, FieldType.DateTime);
  
  return field;
}