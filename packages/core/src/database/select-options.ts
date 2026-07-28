import type { DatabaseValue } from './record.ts';
import type { DatabaseDefinition, DatabaseOption, DatabaseProperty } from './schema.ts';

/**
 * Properties whose values are chosen from a stable option list. `status` joins
 * `select`/`multi_select` here because its options ARE these options — it only
 * adds a `groupId` on each, and a rule that no group may be emptied.
 */
type OptionProperty = Extract<DatabaseProperty, { type: 'select' | 'multi_select' | 'status' }>;

/** True when this property partitions its options into fixed status groups. */
function isStatusProperty(
  property: OptionProperty,
): property is Extract<DatabaseProperty, { type: 'status' }> {
  return property.type === 'status';
}

/** Options left in `option`'s group once it is gone. */
function siblingsInGroup(property: OptionProperty, optionId: string): number {
  if (!isStatusProperty(property)) return Number.POSITIVE_INFINITY;
  const group = property.options.find((candidate) => candidate.id === optionId)?.groupId;
  if (group === undefined) return Number.POSITIVE_INFINITY;
  return property.options.filter(
    (candidate) => candidate.groupId === group && candidate.id !== optionId,
  ).length;
}

export type DatabaseSelectOptionChange =
  | { kind: 'rename'; optionId: string; name: string }
  | { kind: 'recolor'; optionId: string; color?: string }
  | { kind: 'reorder'; optionIds: readonly string[] }
  | { kind: 'archive'; optionId: string; archived: boolean }
  | { kind: 'merge'; sourceOptionId: string; targetOptionId: string }
  | { kind: 'delete'; optionId: string };

export interface DatabaseSelectOptionRecord {
  id: string;
  revision: string | null;
  values: Readonly<Record<string, DatabaseValue>>;
}

export interface DatabaseSelectOptionRecordChange {
  recordId: string;
  expectedRevision: string | null;
  /** Populated for a single-valued Select property. */
  beforeOptionId?: string;
  afterOptionId?: string;
  /** Populated for an array-valued Multi-select property. */
  beforeOptionIds?: readonly string[];
  afterOptionIds?: readonly string[];
}

export interface DatabaseSelectOptionConflict {
  code:
    | 'delete_in_use'
    | 'delete_default_in_use'
    | 'delete_view_in_use'
    | 'last_active_option'
    | 'last_group_option'
    | 'merge_target_archived';
  message: string;
  recordIds?: readonly string[];
  viewIds?: readonly string[];
}

export interface DatabaseSelectOptionPreview {
  canApply: boolean;
  definition: DatabaseDefinition;
  recordChanges: readonly DatabaseSelectOptionRecordChange[];
  affectedViewIds: readonly string[];
  defaultChanged: boolean;
  conflicts: readonly DatabaseSelectOptionConflict[];
}

function requireSelectProperty(
  definition: DatabaseDefinition,
  sourceId: string,
  propertyId: string,
): { sourceIndex: number; propertyIndex: number; property: OptionProperty } {
  const sourceIndex = definition.sources.findIndex((source) => source.id === sourceId);
  const source = definition.sources[sourceIndex];
  if (!source) throw new Error(`Unknown database source "${sourceId}"`);
  const propertyIndex = source.properties.findIndex((property) => property.id === propertyId);
  const property = source.properties[propertyIndex];
  if (!property) throw new Error(`Unknown database property "${propertyId}"`);
  if (
    property.type !== 'select' &&
    property.type !== 'multi_select' &&
    property.type !== 'status'
  ) {
    throw new Error(`Property "${propertyId}" is not Select, Multi-select, or Status`);
  }
  return { sourceIndex, propertyIndex, property };
}

function requireOption(property: OptionProperty, optionId: string): DatabaseOption {
  const option = property.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new Error(`Unknown Select option "${optionId}"`);
  return option;
}

function rewriteExact(value: unknown, before: string, after: string): unknown {
  if (value === before) return after;
  if (Array.isArray(value)) return value.map((entry) => rewriteExact(entry, before, after));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rewriteExact(entry, before, after)]),
    );
  }
  return value;
}

function containsExact(value: unknown, expected: string): boolean {
  if (value === expected) return true;
  if (Array.isArray(value)) return value.some((entry) => containsExact(entry, expected));
  return Boolean(
    value &&
      typeof value === 'object' &&
      Object.values(value).some((entry) => containsExact(entry, expected)),
  );
}

function rewriteOptionReference(
  value: unknown,
  source: Pick<DatabaseOption, 'id' | 'key'>,
  target: Pick<DatabaseOption, 'id' | 'key'>,
): unknown {
  return rewriteExact(rewriteExact(value, source.id, target.id), source.key, target.key);
}

function canonicalOptionIds(value: unknown, property: OptionProperty): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'string') return [];
    const option = property.options.find(
      (candidate) => candidate.id === entry || candidate.key === entry,
    );
    return option ? [option.id] : [];
  });
}

function mergeMultiSelectValue(
  value: unknown,
  property: OptionProperty,
  source: DatabaseOption,
  target: DatabaseOption,
): string[] {
  const result: string[] = [];
  for (const optionId of canonicalOptionIds(value, property)) {
    const nextId = optionId === source.id ? target.id : optionId;
    if (!result.includes(nextId)) result.push(nextId);
  }
  return result;
}

function defaultReferencesOption(
  value: unknown,
  property: OptionProperty,
  option: DatabaseOption,
): boolean {
  if (property.type === 'multi_select') {
    return Array.isArray(value) && value.some((entry) => entry === option.key);
  }
  return value === option.key;
}

function rewriteDefaultOptionReference(
  value: unknown,
  property: OptionProperty,
  source: DatabaseOption,
  target: DatabaseOption,
): string | string[] | unknown {
  if (property.type === 'multi_select' && Array.isArray(value)) {
    const result: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      const next = entry === source.key ? target.key : entry;
      if (!result.includes(next)) result.push(next);
    }
    return result;
  }
  return value === source.key ? target.key : value;
}

function containsOptionReference(
  value: unknown,
  option: Pick<DatabaseOption, 'id' | 'key'>,
): boolean {
  return containsExact(value, option.id) || containsExact(value, option.key);
}

function activeOptionCount(options: readonly DatabaseOption[]): number {
  return options.filter((option) => option.archived !== true).length;
}

/**
 * Compile one Select option lifecycle action into a deterministic schema and
 * record-impact preview. The compiler never mutates its inputs and refuses a
 * destructive delete while any canonical record, default, or saved view still
 * references the stable option identity.
 */
export function previewDatabaseSelectOptionChange(input: {
  definition: DatabaseDefinition;
  sourceId: string;
  propertyId: string;
  records: readonly DatabaseSelectOptionRecord[];
  change: DatabaseSelectOptionChange;
}): DatabaseSelectOptionPreview {
  const next = structuredClone(input.definition);
  const {
    sourceIndex,
    propertyIndex,
    property: currentProperty,
  } = requireSelectProperty(input.definition, input.sourceId, input.propertyId);
  const nextSource = next.sources[sourceIndex];
  const nextPropertyCandidate = nextSource?.properties[propertyIndex];
  if (
    !nextSource ||
    !nextPropertyCandidate ||
    (nextPropertyCandidate.type !== 'select' &&
      nextPropertyCandidate.type !== 'multi_select' &&
      nextPropertyCandidate.type !== 'status')
  ) {
    throw new Error('Select option preview could not clone the target property');
  }
  const nextProperty = nextPropertyCandidate;
  const conflicts: DatabaseSelectOptionConflict[] = [];
  const recordChanges: DatabaseSelectOptionRecordChange[] = [];
  const affectedViewIds: string[] = [];
  let defaultChanged = false;

  if (input.change.kind === 'reorder') {
    const expected = new Set(currentProperty.options.map((option) => option.id));
    if (
      input.change.optionIds.length !== expected.size ||
      new Set(input.change.optionIds).size !== expected.size ||
      input.change.optionIds.some((optionId) => !expected.has(optionId))
    ) {
      throw new Error('Select option reorder must contain every stable option ID exactly once');
    }
    const byId = new Map(nextProperty.options.map((option) => [option.id, option]));
    nextProperty.options = input.change.optionIds.map((optionId) => {
      const option = byId.get(optionId);
      if (!option) throw new Error(`Unknown Select option "${optionId}"`);
      return option;
    });
  } else if (input.change.kind === 'merge') {
    if (input.change.sourceOptionId === input.change.targetOptionId) {
      throw new Error('A Select option cannot be merged into itself');
    }
    const sourceOption = requireOption(currentProperty, input.change.sourceOptionId);
    const targetOption = requireOption(currentProperty, input.change.targetOptionId);
    if (targetOption.archived === true) {
      conflicts.push({
        code: 'merge_target_archived',
        message: `Select option "${targetOption.name}" must be restored before it can receive a merge`,
      });
    }
    for (const record of input.records) {
      const recordValue = record.values[input.propertyId];
      if (!containsOptionReference(recordValue, sourceOption)) continue;
      if (currentProperty.type === 'multi_select') {
        recordChanges.push({
          recordId: record.id,
          expectedRevision: record.revision,
          beforeOptionIds: canonicalOptionIds(recordValue, currentProperty),
          afterOptionIds: mergeMultiSelectValue(
            recordValue,
            currentProperty,
            sourceOption,
            targetOption,
          ),
        });
      } else {
        recordChanges.push({
          recordId: record.id,
          expectedRevision: record.revision,
          beforeOptionId: sourceOption.id,
          afterOptionId: targetOption.id,
        });
      }
    }
    for (const [index, view] of next.views.entries()) {
      if (!containsOptionReference(view, sourceOption)) continue;
      next.views[index] = rewriteOptionReference(view, sourceOption, targetOption) as typeof view;
      affectedViewIds.push(view.id);
    }
    if (defaultReferencesOption(nextProperty.semantics?.defaultValue, nextProperty, sourceOption)) {
      nextProperty.semantics.defaultValue = rewriteDefaultOptionReference(
        nextProperty.semantics.defaultValue,
        nextProperty,
        sourceOption,
        targetOption,
      ) as typeof nextProperty.semantics.defaultValue;
      defaultChanged = true;
    }
    if (siblingsInGroup(currentProperty, sourceOption.id) === 0) {
      conflicts.push({
        code: 'last_group_option',
        message: `Status option "${sourceOption.name}" is the last one in its group`,
      });
    }
    nextProperty.options = nextProperty.options.filter((option) => option.id !== sourceOption.id);
  } else {
    const option = requireOption(currentProperty, input.change.optionId);
    const nextOption = requireOption(nextProperty, input.change.optionId);
    if (input.change.kind === 'rename') {
      const name = input.change.name.trim();
      if (!name) throw new Error('Select option name cannot be empty');
      nextOption.name = name;
    } else if (input.change.kind === 'recolor') {
      const color = input.change.color?.trim();
      if (color) nextOption.color = color;
      else delete nextOption.color;
    } else if (input.change.kind === 'archive') {
      if (
        input.change.archived &&
        option.archived !== true &&
        activeOptionCount(nextProperty.options) <= 1
      ) {
        conflicts.push({
          code: 'last_active_option',
          message: 'A Select property must retain at least one active option',
        });
      }
      if (input.change.archived) nextOption.archived = true;
      else delete nextOption.archived;
    } else {
      const recordIds = input.records
        .filter((record) => containsOptionReference(record.values[input.propertyId], option))
        .map((record) => record.id)
        .sort();
      const viewIds = next.views
        .filter((view) => containsOptionReference(view, option))
        .map((view) => view.id)
        .sort();
      if (recordIds.length > 0) {
        conflicts.push({
          code: 'delete_in_use',
          message: `Select option "${option.name}" is used by ${recordIds.length} record(s)`,
          recordIds,
        });
      }
      if (defaultReferencesOption(nextProperty.semantics?.defaultValue, nextProperty, option)) {
        conflicts.push({
          code: 'delete_default_in_use',
          message: `Select option "${option.name}" is the property default`,
        });
      }
      if (viewIds.length > 0) {
        conflicts.push({
          code: 'delete_view_in_use',
          message: `Select option "${option.name}" is referenced by ${viewIds.length} saved view(s)`,
          viewIds,
        });
      }
      if (
        nextProperty.options.length <= 1 ||
        (option.archived !== true && activeOptionCount(nextProperty.options) <= 1)
      ) {
        conflicts.push({
          code: 'last_active_option',
          message: 'A Select property must retain at least one active option',
        });
      }
      // A Status board has three fixed groups and the manifest requires each to
      // hold at least one option, so emptying one would produce a schema the
      // server refuses. Report it here, where the user can still choose
      // differently, rather than at commit.
      if (siblingsInGroup(currentProperty, option.id) === 0) {
        conflicts.push({
          code: 'last_group_option',
          message: `Status option "${option.name}" is the last one in its group`,
        });
      }
      nextProperty.options = nextProperty.options.filter((candidate) => candidate.id !== option.id);
    }
  }

  return {
    canApply: conflicts.length === 0,
    definition: next,
    recordChanges,
    affectedViewIds: affectedViewIds.sort(),
    defaultChanged,
    conflicts,
  };
}
