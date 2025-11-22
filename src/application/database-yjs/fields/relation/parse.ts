import { YDatabaseField } from '@/application/types';

import { getTypeOptions } from '../type_option';

import { RelationTypeOption } from './relation.type';

export function parseRelationTypeOption(field: YDatabaseField) {
  const relationTypeOption = getTypeOptions(field)?.toJSON();

  return relationTypeOption as RelationTypeOption;
}
