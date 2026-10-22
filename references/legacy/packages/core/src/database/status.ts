import type {
  DatabaseProperty,
  DatabaseStatusCategory,
  DatabaseStatusGroup,
  DatabaseStatusOption,
} from './schema.ts';

export type DatabaseStatusProperty = Extract<DatabaseProperty, { type: 'status' }>;

export const DATABASE_DEFAULT_STATUS_BLUEPRINT = Object.freeze([
  Object.freeze({
    group: Object.freeze({ key: 'todo', name: 'To-do', category: 'todo' as const }),
    options: Object.freeze([Object.freeze({ key: 'not_started', name: 'Not started' })]),
  }),
  Object.freeze({
    group: Object.freeze({
      key: 'in_progress',
      name: 'In progress',
      category: 'in_progress' as const,
    }),
    options: Object.freeze([Object.freeze({ key: 'in_progress', name: 'In progress' })]),
  }),
  Object.freeze({
    group: Object.freeze({ key: 'complete', name: 'Complete', category: 'complete' as const }),
    options: Object.freeze([Object.freeze({ key: 'done', name: 'Done' })]),
  }),
]);

export interface DatabaseStatusResolution {
  option: DatabaseStatusOption;
  group: DatabaseStatusGroup;
  category: DatabaseStatusCategory;
  progress: 0 | 0.5 | 1;
  complete: boolean;
}

export interface DatabaseStatusBoardGroup {
  group: DatabaseStatusGroup;
  options: readonly DatabaseStatusOption[];
  progress: 0 | 0.5 | 1;
}

export function databaseStatusCategoryProgress(category: DatabaseStatusCategory): 0 | 0.5 | 1 {
  if (category === 'todo') return 0;
  if (category === 'in_progress') return 0.5;
  return 1;
}

export function resolveDatabaseStatus(
  property: DatabaseStatusProperty,
  optionId: string,
): DatabaseStatusResolution | null {
  const option = property.options.find((candidate) => candidate.id === optionId);
  if (!option) return null;
  const group = property.groups.find((candidate) => candidate.id === option.groupId);
  if (!group) return null;
  const progress = databaseStatusCategoryProgress(group.category);
  return {
    option,
    group,
    category: group.category,
    progress,
    complete: group.category === 'complete',
  };
}

export function databaseStatusBoardGroups(
  property: DatabaseStatusProperty,
): readonly DatabaseStatusBoardGroup[] {
  return property.groups.map((group) => ({
    group,
    options: property.options.filter((option) => option.groupId === group.id),
    progress: databaseStatusCategoryProgress(group.category),
  }));
}

export function databaseDefaultStatusOption(
  property: DatabaseStatusProperty,
): DatabaseStatusOption {
  const defaultKey = property.semantics.defaultValue;
  const option =
    typeof defaultKey === 'string'
      ? property.options.find((candidate) => candidate.key === defaultKey)
      : property.options.find((candidate) => candidate.archived !== true);
  if (!option || option.archived === true) {
    throw new Error(`Status property "${property.id}" requires an active default option`);
  }
  return option;
}
