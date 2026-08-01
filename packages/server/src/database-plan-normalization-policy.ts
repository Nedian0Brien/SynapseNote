/** Owns pure desired-state normalization and relation convergence policy. */
import {
  canonicalizeDatabaseDateValue,
  canonicalizeDatabasePlaceValue,
  type DatabaseDefinition,
  type DatabaseDocumentId,
  DatabaseFilesValueSchema,
  type DatabaseFileValue,
  type DatabaseFilter,
  type DatabasePerson,
  DatabaseRecordIdSchema,
  type DatabaseRecordPageLayoutOverride,
  databaseFileIdentity,
  findDatabasePersonByReference,
  isSafeDatabaseAssetPath,
  isSafeDatabaseExternalFileUrl,
  validateDatabasePropertyConstraints,
} from '@nedian0brien/synapsenote-core';
import type { DatabaseNormalizedRecordMutationOperation } from './database-plan-artifacts.ts';
import type { DatabaseDesiredStateDraft } from './database-plan-draft-contracts.ts';

export function normalizeDatabaseFilter(
  filter: unknown,
  propertyIds: ReadonlyMap<string, string>,
  propertiesById: ReadonlyMap<string, DatabaseDefinition['sources'][number]['properties'][number]>,
  people: readonly DatabasePerson[],
): DatabaseFilter {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    throw new Error('View filter must be an object');
  }
  const value = filter as Record<string, unknown>;
  if (Array.isArray(value.and)) {
    return {
      and: value.and.map((entry) =>
        normalizeDatabaseFilter(entry, propertyIds, propertiesById, people),
      ),
    };
  }
  if (Array.isArray(value.or)) {
    return {
      or: value.or.map((entry) =>
        normalizeDatabaseFilter(entry, propertyIds, propertiesById, people),
      ),
    };
  }
  if (value.not !== undefined) {
    return { not: normalizeDatabaseFilter(value.not, propertyIds, propertiesById, people) };
  }
  const explicitPropertyId = String(value.propertyId ?? '');
  const propertyKey = String(value.propertyKey ?? '');
  const propertyId = [...propertyIds.values()].includes(explicitPropertyId)
    ? explicitPropertyId
    : propertyIds.get(propertyKey);
  if (!propertyId) throw new Error(`Unknown view filter property key "${propertyKey}"`);
  const property = propertiesById.get(propertyId);
  if (!property) throw new Error(`Unknown view filter property ID "${propertyId}"`);
  const normalizeOptionReference = (entry: unknown): unknown => {
    if (property.type === 'person') {
      const person = findDatabasePersonByReference(people, entry);
      if (!person) throw new Error(`Unknown or ambiguous view filter person "${String(entry)}"`);
      return person.id;
    }
    if (
      property.type !== 'select' &&
      property.type !== 'status' &&
      property.type !== 'multi_select'
    ) {
      return entry;
    }
    const option = resolveDatabaseOption(property, entry);
    if (!option) throw new Error(`Unknown view filter option "${String(entry)}"`);
    return option.id;
  };
  const filterValue = Array.isArray(value.value)
    ? value.value.map(normalizeOptionReference)
    : normalizeOptionReference(value.value);
  return {
    propertyId,
    operator: value.operator as 'eq',
    ...(value.operator === 'is_empty' || value.operator === 'is_not_empty'
      ? {}
      : { value: filterValue as string }),
  } as DatabaseFilter;
}

export function resolveDatabaseOption(
  property: Extract<
    DatabaseDefinition['sources'][number]['properties'][number],
    { type: 'select' | 'status' | 'multi_select' }
  >,
  value: unknown,
) {
  const stableMatch = property.options.find(
    (candidate) => candidate.id === value || candidate.key === value,
  );
  if (stableMatch) return stableMatch;
  const nameMatches = property.options.filter((candidate) => candidate.name === value);
  if (nameMatches.length > 1) {
    throw new Error(`ambiguous option name "${String(value)}"`);
  }
  return nameMatches[0];
}

export function normalizeDatabaseSampleValue(
  property: DatabaseDefinition['sources'][number]['properties'][number],
  value: unknown,
  people: readonly DatabasePerson[],
  options: { allowInactivePeople?: boolean } = {},
): unknown {
  const constrained = (candidate: unknown): unknown => {
    const issue = validateDatabasePropertyConstraints(property, candidate);
    if (issue) throw new Error(issue);
    return candidate;
  };
  switch (property.type) {
    case 'title':
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      if (typeof value !== 'string') throw new Error('expected a string');
      return constrained(value);
    case 'date':
      try {
        return constrained(canonicalizeDatabaseDateValue(value));
      } catch {
        throw new Error('expected an ISO date/timestamp or canonical date range object');
      }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw new Error('expected a number');
      return constrained(value);
    case 'checkbox':
      if (typeof value !== 'boolean') throw new Error('expected a boolean');
      return constrained(value);
    case 'select':
    case 'status': {
      const option = resolveDatabaseOption(property, value);
      if (!option) throw new Error('expected a declared option key, name, or ID');
      if (option.archived === true) throw new Error(`option "${option.name}" is archived`);
      return constrained(option.id);
    }
    case 'multi_select': {
      if (!Array.isArray(value)) throw new Error('expected an array of option keys, names, or IDs');
      const normalized = value.map((entry) => {
        const option = resolveDatabaseOption(property, entry);
        if (!option) throw new Error(`unknown option "${String(entry)}"`);
        if (option.archived === true) throw new Error(`option "${option.name}" is archived`);
        return option.id;
      });
      if (new Set(normalized).size !== normalized.length) throw new Error('duplicate option');
      return constrained(normalized);
    }
    case 'person': {
      if (!Array.isArray(value)) throw new Error('expected an array of person keys, names, or IDs');
      if (property.required && value.length === 0) throw new Error('expected at least one person');
      if (!property.multiple && value.length > 1) throw new Error('expected at most one person');
      const normalized = value.map((entry) => {
        const person = findDatabasePersonByReference(people, entry);
        if (!person) throw new Error(`unknown or ambiguous person "${String(entry)}"`);
        if (!person.active && options.allowInactivePeople !== true) {
          throw new Error(`person "${person.name}" is inactive`);
        }
        return person.id;
      });
      if (new Set(normalized).size !== normalized.length) throw new Error('duplicate person');
      return constrained(normalized);
    }
    case 'files': {
      const parsed = DatabaseFilesValueSchema.safeParse(value);
      if (!parsed.success) {
        throw new Error('expected an ordered list of unique local asset or external URL objects');
      }
      if (property.required && parsed.data.length === 0) {
        throw new Error('expected at least one file');
      }
      return constrained(parsed.data);
    }
    case 'place':
      try {
        return constrained(canonicalizeDatabasePlaceValue(value));
      } catch {
        throw new Error(
          'expected a place object with label or address, lat, lon, precision, and source',
        );
      }
    case 'relation':
      if (property.cardinality === 'one') {
        if (!DatabaseRecordIdSchema.safeParse(value).success)
          throw new Error('expected a record ID');
        return constrained(value);
      }
      if (
        !Array.isArray(value) ||
        value.some((entry) => !DatabaseRecordIdSchema.safeParse(entry).success)
      ) {
        throw new Error('expected an array of record IDs');
      }
      if (property.required && value.length === 0) {
        throw new Error('expected at least one related record');
      }
      if (new Set(value).size !== value.length) throw new Error('duplicate related record');
      return constrained(value);
    case 'formula':
    case 'rollup':
    case 'created_time':
    case 'last_edited_time':
    case 'created_by':
    case 'last_edited_by':
    case 'verification':
    case 'button':
    case 'unique_id':
      throw new Error(`${property.type} properties are derived and read-only`);
  }
}

export function applyDatabaseRecordMutation(
  source: DatabaseDefinition['sources'][number],
  people: readonly DatabasePerson[],
  record: { values: Readonly<Record<string, unknown>>; body: string },
  mutation: DatabaseDesiredStateDraft['recordMutations'][number],
): {
  values: Readonly<Record<string, unknown>>;
  body: string;
  operations: readonly DatabaseNormalizedRecordMutationOperation[];
} {
  const values: Record<string, unknown> = structuredClone(record.values);
  let body = record.body;
  const normalized: DatabaseNormalizedRecordMutationOperation[] = [];
  const propertyFor = (key: string) => {
    const property = source.properties.find((candidate) => candidate.key === key);
    if (!property) throw new Error(`Record mutation has unknown property key "${key}"`);
    return property;
  };

  for (const operation of mutation.operations) {
    switch (operation.op) {
      case 'set': {
        const property = propertyFor(operation.propertyKey);
        const value = normalizeDatabaseSampleValue(property, operation.value, people, {
          allowInactivePeople: property.type === 'person',
        });
        if (property.type === 'person' && Array.isArray(value)) {
          const current = values[property.id];
          const existing = new Set(Array.isArray(current) ? current.map(String) : []);
          const newlyAssignedInactive = value.find((personId) => {
            const person = people.find((candidate) => candidate.id === personId);
            return person?.active === false && !existing.has(personId);
          });
          if (newlyAssignedInactive) {
            const person = people.find((candidate) => candidate.id === newlyAssignedInactive);
            throw new Error(`person "${person?.name ?? newlyAssignedInactive}" is inactive`);
          }
        }
        values[property.id] = value;
        normalized.push({ kind: 'set', propertyId: property.id, value });
        break;
      }
      case 'unset': {
        const property = propertyFor(operation.propertyKey);
        if (property.required) {
          throw new Error(`Required property "${property.key}" cannot be unset`);
        }
        delete values[property.id];
        normalized.push({ kind: 'unset', propertyId: property.id });
        break;
      }
      case 'add':
      case 'remove': {
        const property = propertyFor(operation.propertyKey);
        if (
          property.type !== 'multi_select' &&
          property.type !== 'person' &&
          property.type !== 'files'
        ) {
          throw new Error(`${operation.op} requires a multi_select, person, or files property`);
        }
        if (property.type === 'files') {
          const current = values[property.id];
          const next = current === undefined ? [] : DatabaseFilesValueSchema.parse(current);
          let identity: string;
          let file: DatabaseFileValue | undefined;
          if (operation.op === 'add') {
            const normalized = DatabaseFilesValueSchema.parse([operation.value]);
            file = normalized[0];
            if (!file) throw new Error('add requires one valid file object');
            identity = databaseFileIdentity(file);
          } else if (typeof operation.value === 'string') {
            if (
              !isSafeDatabaseAssetPath(operation.value) &&
              !isSafeDatabaseExternalFileUrl(operation.value)
            ) {
              throw new Error('remove requires a safe local path or external URL');
            }
            identity = operation.value;
          } else {
            const normalized = DatabaseFilesValueSchema.parse([operation.value]);
            const target = normalized[0];
            if (!target) throw new Error('remove requires one valid file source');
            identity = databaseFileIdentity(target);
          }
          const existingIndex = next.findIndex(
            (candidate) => databaseFileIdentity(candidate) === identity,
          );
          if (operation.op === 'add' && existingIndex < 0 && file) next.push(file);
          if (operation.op === 'remove' && existingIndex >= 0) next.splice(existingIndex, 1);
          if (property.required && next.length === 0) {
            throw new Error(`Required property "${property.key}" cannot remove its last file`);
          }
          values[property.id] = next;
          normalized.push({ kind: operation.op, propertyId: property.id, value: identity });
          break;
        }
        const [optionId] = normalizeDatabaseSampleValue(property, [operation.value], people, {
          allowInactivePeople: operation.op === 'remove',
        }) as string[];
        if (!optionId) throw new Error(`${operation.op} requires one declared option`);
        const current = values[property.id];
        if (current !== undefined && !Array.isArray(current)) {
          throw new Error(`Property "${property.key}" does not contain an option array`);
        }
        const next = Array.isArray(current) ? current.map(String) : [];
        if (operation.op === 'add') {
          if (!next.includes(optionId)) next.push(optionId);
        } else {
          const index = next.indexOf(optionId);
          if (index >= 0) next.splice(index, 1);
        }
        values[property.id] = next;
        normalized.push({ kind: operation.op, propertyId: property.id, value: optionId });
        break;
      }
      case 'increment': {
        const property = propertyFor(operation.propertyKey);
        if (property.type !== 'number') throw new Error('increment requires a number property');
        const current = values[property.id];
        if (typeof current !== 'number' || !Number.isFinite(current)) {
          throw new Error(`Property "${property.key}" has no finite number to increment`);
        }
        const next = current + operation.by;
        if (!Number.isFinite(next)) throw new Error('increment result is not finite');
        values[property.id] = next;
        normalized.push({ kind: 'increment', propertyId: property.id, by: operation.by });
        break;
      }
      case 'append': {
        if (!operation.propertyKey) {
          body += operation.value;
          normalized.push({ kind: 'append', propertyId: null, value: operation.value });
          break;
        }
        const property = propertyFor(operation.propertyKey);
        if (property.type !== 'text' && property.type !== 'title') {
          throw new Error(
            'append requires a text/title property or an omitted propertyKey for body',
          );
        }
        const current = values[property.id];
        if (current !== undefined && typeof current !== 'string') {
          throw new Error(`Property "${property.key}" does not contain text`);
        }
        values[property.id] = `${current ?? ''}${operation.value}`;
        normalized.push({
          kind: 'append',
          propertyId: property.id,
          value: operation.value,
        });
        break;
      }
      case 'link':
      case 'unlink': {
        const property = propertyFor(operation.propertyKey);
        if (property.type !== 'relation') {
          throw new Error(`${operation.op} requires a relation property`);
        }
        if (property.cardinality === 'one') {
          if (operation.op === 'link') {
            values[property.id] = operation.recordId;
          } else if (values[property.id] === operation.recordId) {
            if (property.required) {
              throw new Error(`Required relation "${property.key}" cannot be unlinked`);
            }
            delete values[property.id];
          }
        } else {
          const current = values[property.id];
          if (current !== undefined && !Array.isArray(current)) {
            throw new Error(`Relation "${property.key}" does not contain a record-ID array`);
          }
          const next = Array.isArray(current) ? current.map(String) : [];
          if (operation.op === 'link') {
            if (!next.includes(operation.recordId)) next.push(operation.recordId);
          } else {
            const index = next.indexOf(operation.recordId);
            if (index >= 0) next.splice(index, 1);
          }
          if (property.required && next.length === 0) {
            throw new Error(`Required relation "${property.key}" cannot be empty`);
          }
          values[property.id] = next;
        }
        normalized.push({
          kind: operation.op,
          propertyId: property.id,
          recordId: operation.recordId,
        });
        break;
      }
    }
  }
  for (const property of source.properties) {
    if (
      property.type === 'formula' ||
      property.type === 'rollup' ||
      property.type === 'created_time' ||
      property.type === 'last_edited_time' ||
      property.type === 'created_by' ||
      property.type === 'last_edited_by' ||
      property.type === 'verification' ||
      property.type === 'button' ||
      property.type === 'unique_id'
    ) {
      continue;
    }
    if (property.required && values[property.id] === undefined) {
      throw new Error(`Record mutation leaves required property "${property.key}" unset`);
    }
    if (values[property.id] !== undefined) {
      values[property.id] = normalizeDatabaseSampleValue(property, values[property.id], people, {
        allowInactivePeople: true,
      });
    }
  }
  return { values, body, operations: normalized };
}

export type DatabaseRelationProperty = Extract<
  DatabaseDefinition['sources'][number]['properties'][number],
  { type: 'relation' }
>;

export interface MutableNormalizedSampleRecord {
  id: string;
  sourceId: string;
  values: Record<string, unknown>;
  body: string;
  expectedRevision: string | null;
  documentId?: DatabaseDocumentId;
  archivedAt?: string | null;
  pageLayoutOverride?: DatabaseRecordPageLayoutOverride | null;
}

export function databaseRelationIds(property: DatabaseRelationProperty, value: unknown): string[] {
  if (value === undefined) return [];
  return property.cardinality === 'many' && Array.isArray(value)
    ? value.map(String)
    : [String(value)];
}

export function reconcileDatabasePairedRelationSamples(
  definition: DatabaseDefinition,
  currentDefinition: DatabaseDefinition | null,
  initialSamples: readonly MutableNormalizedSampleRecord[],
  getIndexedRecord: (recordId: string) => {
    id: string;
    databaseId: string;
    sourceId: string;
    values: Readonly<Record<string, unknown>>;
    body: string;
    revision?: string | null;
    archivedAt?: string | null;
    pageLayoutOverride?: DatabaseRecordPageLayoutOverride;
  } | null,
): {
  samples: MutableNormalizedSampleRecord[];
  inverseMutations: Array<{
    recordId: string;
    sourceId: string;
    operations: DatabaseNormalizedRecordMutationOperation[];
  }>;
} {
  const samples = initialSamples.map((sample) => ({
    ...sample,
    values: structuredClone(sample.values),
  }));
  const explicitSampleIds = new Set(samples.map((sample) => sample.id));
  if (explicitSampleIds.size !== samples.length) return { samples, inverseMutations: [] };
  const initialValues = new Map(
    samples.map((sample) => [sample.id, structuredClone(sample.values)] as const),
  );
  const sampleById = new Map(samples.map((sample) => [sample.id, sample] as const));
  const sourceById = new Map(definition.sources.map((source) => [source.id, source] as const));
  const currentPropertyById = new Map(
    (currentDefinition?.sources ?? []).flatMap((source) =>
      source.properties.map((property) => [property.id, property] as const),
    ),
  );
  const propertyById = new Map(
    definition.sources.flatMap((source) =>
      source.properties.map((property) => [property.id, property] as const),
    ),
  );
  const inverseOperations = new Map<string, DatabaseNormalizedRecordMutationOperation[]>();

  const ensureSample = (recordId: string, sourceId: string): MutableNormalizedSampleRecord => {
    const planned = sampleById.get(recordId);
    if (planned) {
      if (planned.sourceId !== sourceId) {
        throw new Error(`Paired relation target "${recordId}" belongs to the wrong source`);
      }
      return planned;
    }
    const indexed = getIndexedRecord(recordId);
    if (
      !indexed ||
      indexed.databaseId !== definition.id ||
      indexed.sourceId !== sourceId ||
      !indexed.revision
    ) {
      throw new Error(
        `Paired relation target "${recordId}" must resolve to a revision-bound record in source "${sourceId}"`,
      );
    }
    const synthesized: MutableNormalizedSampleRecord = {
      id: indexed.id,
      sourceId: indexed.sourceId,
      values: structuredClone(indexed.values),
      body: indexed.body,
      expectedRevision: indexed.revision,
      archivedAt: indexed.archivedAt ?? null,
      ...(indexed.pageLayoutOverride
        ? { pageLayoutOverride: structuredClone(indexed.pageLayoutOverride) }
        : {}),
    };
    samples.push(synthesized);
    sampleById.set(recordId, synthesized);
    return synthesized;
  };

  type EdgeAction = {
    action: 'add' | 'remove';
    property: DatabaseRelationProperty;
    recordId: string;
    targetId: string;
  };
  const pending: EdgeAction[] = [];
  const actionByEdge = new Map<string, EdgeAction['action']>();
  const edgeKey = (
    property: DatabaseRelationProperty,
    recordId: string,
    targetId: string,
  ): string => {
    if (!property.pairedPropertyId) throw new Error('Paired relation metadata is missing');
    return property.id.localeCompare(property.pairedPropertyId) < 0
      ? `${property.id}:${recordId}|${property.pairedPropertyId}:${targetId}`
      : `${property.pairedPropertyId}:${targetId}|${property.id}:${recordId}`;
  };
  const enqueue = (edge: EdgeAction): void => {
    const key = edgeKey(edge.property, edge.recordId, edge.targetId);
    const current = actionByEdge.get(key);
    if (current && current !== edge.action) {
      throw new Error(`Paired relation edge "${key}" has contradictory requested changes`);
    }
    if (current) return;
    actionByEdge.set(key, edge.action);
    pending.push(edge);
  };

  for (const sample of samples) {
    const source = sourceById.get(sample.sourceId);
    const indexed = getIndexedRecord(sample.id);
    if (!source) continue;
    for (const property of source.properties) {
      if (property.type !== 'relation' || !property.pairedPropertyId) continue;
      const currentProperty = currentPropertyById.get(property.id);
      const before = new Set(
        indexed?.sourceId === sample.sourceId &&
          currentProperty?.type === 'relation' &&
          currentProperty.pairedPropertyId === property.pairedPropertyId
          ? databaseRelationIds(property, indexed.values[property.id])
          : [],
      );
      const after = new Set(databaseRelationIds(property, sample.values[property.id]));
      for (const targetId of before) {
        if (!after.has(targetId))
          enqueue({ action: 'remove', property, recordId: sample.id, targetId });
      }
      for (const targetId of after) {
        if (!before.has(targetId))
          enqueue({ action: 'add', property, recordId: sample.id, targetId });
      }
    }
  }

  const recordInverse = (
    sample: MutableNormalizedSampleRecord,
    operation: DatabaseNormalizedRecordMutationOperation,
  ): void => {
    const operations = inverseOperations.get(sample.id) ?? [];
    if (
      !operations.some(
        (candidate) =>
          candidate.kind === operation.kind &&
          'propertyId' in candidate &&
          'propertyId' in operation &&
          candidate.propertyId === operation.propertyId &&
          'recordId' in candidate &&
          'recordId' in operation &&
          candidate.recordId === operation.recordId,
      )
    ) {
      operations.push(operation);
      inverseOperations.set(sample.id, operations);
    }
  };
  const mutateMembership = (
    sample: MutableNormalizedSampleRecord,
    property: DatabaseRelationProperty,
    relatedRecordId: string,
    present: boolean,
  ): void => {
    const explicitlyPreserves = (): boolean => {
      const desired = initialValues.get(sample.id);
      return Boolean(
        explicitSampleIds.has(sample.id) &&
          desired &&
          databaseRelationIds(property, desired[property.id]).includes(relatedRecordId),
      );
    };
    if (property.cardinality === 'one') {
      const current = databaseRelationIds(property, sample.values[property.id])[0];
      if (present) {
        if (current && current !== relatedRecordId) {
          const explicitlyDesired = initialValues.get(sample.id);
          if (
            explicitSampleIds.has(sample.id) &&
            explicitlyDesired &&
            databaseRelationIds(property, explicitlyDesired[property.id])[0] === current
          ) {
            throw new Error(
              `Paired relation "${property.id}" on record "${sample.id}" explicitly preserves "${current}" and cannot also link "${relatedRecordId}"`,
            );
          }
          enqueue({
            action: 'remove',
            property,
            recordId: sample.id,
            targetId: current,
          });
        }
        sample.values[property.id] = relatedRecordId;
      } else if (current === relatedRecordId) {
        if (explicitlyPreserves()) {
          throw new Error(
            `Paired relation "${property.id}" on record "${sample.id}" explicitly preserves "${relatedRecordId}" and cannot unlink it`,
          );
        }
        delete sample.values[property.id];
      }
      return;
    }
    const next = databaseRelationIds(property, sample.values[property.id]);
    const index = next.indexOf(relatedRecordId);
    if (present && index < 0) next.push(relatedRecordId);
    if (!present && index >= 0) {
      if (explicitlyPreserves()) {
        throw new Error(
          `Paired relation "${property.id}" on record "${sample.id}" explicitly preserves "${relatedRecordId}" and cannot unlink it`,
        );
      }
      next.splice(index, 1);
    }
    sample.values[property.id] = next;
  };

  for (let index = 0; index < pending.length; index += 1) {
    const edge = pending[index];
    if (!edge?.property.pairedPropertyId) continue;
    const pairedProperty = propertyById.get(edge.property.pairedPropertyId);
    if (!pairedProperty || pairedProperty.type !== 'relation') {
      throw new Error(`Paired relation property "${edge.property.pairedPropertyId}" is missing`);
    }
    const sourceRecord = ensureSample(edge.recordId, pairedProperty.targetSourceId);
    const targetRecord = ensureSample(edge.targetId, edge.property.targetSourceId);
    const present = edge.action === 'add';
    mutateMembership(sourceRecord, edge.property, targetRecord.id, present);
    mutateMembership(targetRecord, pairedProperty, sourceRecord.id, present);
    recordInverse(targetRecord, {
      kind: present ? 'link' : 'unlink',
      propertyId: pairedProperty.id,
      recordId: sourceRecord.id,
    });
  }

  for (const sample of samples) {
    const source = sourceById.get(sample.sourceId);
    if (!source) continue;
    for (const property of source.properties) {
      if (property.type !== 'relation' || !property.pairedPropertyId) continue;
      const value = sample.values[property.id];
      if (value === undefined) {
        if (property.required) {
          throw new Error(
            `Paired relation update leaves required property "${property.key}" unset`,
          );
        }
        continue;
      }
      sample.values[property.id] = normalizeDatabaseSampleValue(
        property,
        value,
        definition.people,
        {
          allowInactivePeople: true,
        },
      );
    }
  }

  return {
    samples,
    inverseMutations: [...inverseOperations.entries()].map(([recordId, operations]) => {
      const sample = sampleById.get(recordId);
      if (!sample) throw new Error(`Paired relation sample "${recordId}" is missing`);
      return { recordId, sourceId: sample.sourceId, operations };
    }),
  };
}
