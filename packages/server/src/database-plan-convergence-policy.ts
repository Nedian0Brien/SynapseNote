/** Owns pure canonicalization and convergence predicates for database plan compilation. */
import { createHash } from 'node:crypto';
import {
  type DatabaseDefinition,
  encodeDatabaseMarkdownCellText,
  serializeDatabaseMarkdownOwnerMarker,
} from '@nedian0brien/synapsenote-core';

export function stableDatabasePlanValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableDatabasePlanValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableDatabasePlanValue(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashDatabasePlanValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableDatabasePlanValue(value)).digest('hex')}`;
}

export function compactDatabasePlanUuid(generateUuid: () => string): string {
  return generateUuid().replaceAll('-', '');
}

export function databasePlanExpiry(now: Date, ttlSeconds: number): string {
  return new Date(now.getTime() + ttlSeconds * 1_000).toISOString();
}

export function cloneDatabasePlanValue<T>(value: T): T {
  return structuredClone(value);
}

export function createEmptyDatabaseMarkdownOwnerTable(
  definition: DatabaseDefinition,
  source: DatabaseDefinition['sources'][number],
): string {
  const storage = source.storage;
  if (!storage || storage.kind !== 'markdown_table') {
    throw new Error(`Source "${source.id}" has no Markdown owner-table storage`);
  }
  const marker = serializeDatabaseMarkdownOwnerMarker({
    version: 2,
    databaseId: definition.id,
    sourceId: source.id,
    blockId: storage.owner.blockId,
    columns: storage.storedPropertyIds,
  });
  const headers = storage.storedPropertyIds.map((propertyId) => {
    const name =
      source.properties.find((property) => property.id === propertyId)?.name ?? propertyId;
    return encodeDatabaseMarkdownCellText(name.replace(/[\r\n]+/gu, ' '));
  });
  const row = (values: readonly string[]) => `| ${values.join(' | ')} |`;
  return [marker, '', row(headers), row(headers.map(() => '---')), ''].join('\n');
}

export function databasePlanErrorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export function sameDatabasePlanValue(left: unknown, right: unknown): boolean {
  return stableDatabasePlanValue(left) === stableDatabasePlanValue(right);
}

export function databasePlanObjectMap(definition: DatabaseDefinition | null): Map<string, unknown> {
  const objects = new Map<string, unknown>();
  if (!definition) return objects;
  for (const person of definition.people) objects.set(person.id, person);
  for (const source of definition.sources) {
    objects.set(source.id, source);
    for (const property of source.properties) objects.set(property.id, property);
  }
  for (const view of definition.views) objects.set(view.id, view);
  for (const template of definition.templates) objects.set(template.id, template);
  for (const button of definition.buttons) objects.set(button.id, button);
  for (const automation of definition.automations) objects.set(automation.id, automation);
  return objects;
}

export function databasePropertyStorageShape(
  property: DatabaseDefinition['sources'][number]['properties'][number],
): unknown {
  return {
    id: property.id,
    key: property.key,
    type: property.type,
    required: property.required,
    constraints: property.semantics.constraints,
    defaultValue: property.semantics.defaultValue,
    ...(property.type === 'select' || property.type === 'status' || property.type === 'multi_select'
      ? {
          options: property.options
            .map((option) => ({ id: option.id, key: option.key }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        }
      : {}),
    ...(property.type === 'relation'
      ? {
          targetSourceId: property.targetSourceId,
          cardinality: property.cardinality,
          pairedPropertyId: property.pairedPropertyId,
        }
      : {}),
    ...(property.type === 'person' ? { multiple: property.multiple } : {}),
    ...(property.type === 'formula' ? { source: property.source, ast: property.ast } : {}),
    ...(property.type === 'rollup'
      ? {
          relationPropertyId: property.relationPropertyId,
          targetPropertyId: property.targetPropertyId,
          function: property.function,
          targetValueType: property.targetValueType,
          targetItemType: property.targetItemType,
        }
      : {}),
    ...(property.type === 'button'
      ? {
          label: property.label,
          confirmation: property.confirmation,
          actions: property.actions,
        }
      : {}),
    ...(property.type === 'unique_id' ? { storage: 'positive_integer' } : {}),
    ...(property.type === 'place' ? { storage: 'place_v1' } : {}),
  };
}

export function databaseOptionStorageMatches(
  current: Extract<
    DatabaseDefinition['sources'][number]['properties'][number],
    { type: 'select' | 'status' | 'multi_select' }
  >,
  desired: Extract<
    DatabaseDefinition['sources'][number]['properties'][number],
    { type: 'select' | 'status' | 'multi_select' }
  >,
  optionId: string,
): boolean {
  const before = current.options.find((option) => option.id === optionId);
  const after = desired.options.find((option) => option.id === optionId);
  return Boolean(before && after && before.key === after.key);
}

export function databaseRecordNeedsSourceRewrite(
  current: DatabaseDefinition['sources'][number],
  desired: DatabaseDefinition['sources'][number],
  values: Readonly<Record<string, unknown>>,
): boolean {
  if (
    current.folder !== desired.folder ||
    current.includeSubfolders !== desired.includeSubfolders
  ) {
    return true;
  }
  const desiredProperties = new Map(desired.properties.map((property) => [property.id, property]));
  for (const before of current.properties) {
    const value = values[before.id];
    const after = desiredProperties.get(before.id);
    if (!after) {
      if (value !== undefined) return true;
      continue;
    }
    if (
      sameDatabasePlanValue(
        databasePropertyStorageShape(before),
        databasePropertyStorageShape(after),
      )
    )
      continue;
    if (value === undefined) {
      if (after.required) return true;
      continue;
    }
    if (
      before.type === 'select' &&
      after.type === 'select' &&
      typeof value === 'string' &&
      before.key === after.key &&
      sameDatabasePlanValue(before.semantics, after.semantics) &&
      databaseOptionStorageMatches(before, after, value)
    ) {
      continue;
    }
    if (
      before.type === 'status' &&
      after.type === 'status' &&
      typeof value === 'string' &&
      before.key === after.key &&
      sameDatabasePlanValue(before.semantics, after.semantics) &&
      databaseOptionStorageMatches(before, after, value)
    ) {
      continue;
    }
    if (
      before.type === 'multi_select' &&
      after.type === 'multi_select' &&
      Array.isArray(value) &&
      before.key === after.key &&
      sameDatabasePlanValue(before.semantics, after.semantics) &&
      value.every(
        (optionId) =>
          typeof optionId === 'string' && databaseOptionStorageMatches(before, after, optionId),
      )
    ) {
      continue;
    }
    return true;
  }
  const currentIds = new Set(current.properties.map((property) => property.id));
  return desired.properties.some(
    (property) =>
      (property.required || property.type === 'unique_id') &&
      !currentIds.has(property.id) &&
      values[property.id] === undefined,
  );
}

export function databaseSourceNeedsRecordRewrite(
  current: DatabaseDefinition['sources'][number],
  desired: DatabaseDefinition['sources'][number],
): boolean {
  if (
    current.folder !== desired.folder ||
    current.includeSubfolders !== desired.includeSubfolders
  ) {
    return true;
  }
  const currentProperties = new Map(current.properties.map((property) => [property.id, property]));
  const desiredPropertyIds = new Set(desired.properties.map((property) => property.id));
  if (current.properties.some((property) => !desiredPropertyIds.has(property.id))) return true;
  return desired.properties.some((property) => {
    const before = currentProperties.get(property.id);
    if (!before) return property.required || property.type === 'unique_id';
    return !sameDatabasePlanValue(
      databasePropertyStorageShape(before),
      databasePropertyStorageShape(property),
    );
  });
}

export function databaseRecordNeedsPersonRewrite(
  current: DatabaseDefinition,
  desired: DatabaseDefinition,
  sourceId: string,
  values: Readonly<Record<string, unknown>>,
): boolean {
  const currentSource = current.sources.find((source) => source.id === sourceId);
  if (!currentSource) return false;
  const currentPeople = new Map(current.people.map((person) => [person.id, person.key] as const));
  const desiredPeople = new Map(desired.people.map((person) => [person.id, person.key] as const));
  for (const property of currentSource.properties) {
    if (property.type !== 'person') continue;
    const value = values[property.id];
    if (!Array.isArray(value)) continue;
    if (
      value.some(
        (personId) =>
          typeof personId === 'string' &&
          currentPeople.get(personId) !== desiredPeople.get(personId),
      )
    ) {
      return true;
    }
  }
  return false;
}
