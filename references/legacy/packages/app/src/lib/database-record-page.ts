import type {
  DatabasePerson,
  DatabaseProperty,
  DatabaseValue,
  FrontmatterValue,
  StoredDatabaseRecordMetadata,
} from '@nedian0brien/synapsenote-core';
import {
  canonicalizeDatabaseDateValue,
  StoredDatabaseRecordMetadataSchema,
  validateDatabasePropertyConstraints,
} from '@nedian0brien/synapsenote-core';
import { isDatabaseCellEditable, parseDatabaseCellDraft } from './database-cell-mutation.ts';

export function databaseRecordMetadata(
  map: Readonly<Record<string, FrontmatterValue>>,
): StoredDatabaseRecordMetadata | null {
  const parsed = StoredDatabaseRecordMetadataSchema.safeParse(map._sn);
  return parsed.success ? parsed.data : null;
}

/**
 * Convert the human-readable YAML representation used by the normal document
 * property panel into the stable-ID value representation expected by database
 * mutations.
 */
export function databaseValueFromFrontmatter(
  property: DatabaseProperty,
  value: FrontmatterValue,
  people: readonly DatabasePerson[] = [],
): DatabaseValue {
  if (!isDatabaseCellEditable(property)) {
    throw new Error(`${property.name} cannot be edited from the document property panel yet`);
  }

  let draft: string;
  if (property.type === 'select' || property.type === 'status') {
    if (typeof value !== 'string') throw new Error(`${property.name} requires a valid option`);
    const option = property.options.find((candidate) => candidate.key === value);
    if (!option) throw new Error(`${property.name} requires a valid option`);
    draft = option.id;
  } else if (property.type === 'multi_select') {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error(`${property.name} requires a valid option list`);
    }
    const optionIds = value.map((key) => {
      const option = property.options.find((candidate) => candidate.key === key);
      if (!option) throw new Error(`${property.name} requires a valid option list`);
      return option.id;
    });
    draft = JSON.stringify(optionIds);
  } else if (property.type === 'person') {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw new Error(`${property.name} requires a valid person list`);
    }
    const personIds = value.map((key) => {
      const person = people.find((candidate) => candidate.key === key || candidate.id === key);
      if (!person) throw new Error(`${property.name} requires declared people`);
      return person.id;
    });
    draft = JSON.stringify(personIds);
  } else if (property.type === 'files') {
    if (!Array.isArray(value)) throw new Error(`${property.name} requires a valid file list`);
    draft = JSON.stringify(value);
  } else if (property.type === 'relation') {
    if (property.cardinality === 'one') {
      if (typeof value !== 'string') throw new Error(`${property.name} requires one record ID`);
      draft = value;
    } else {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        throw new Error(`${property.name} requires a record ID list`);
      }
      draft = JSON.stringify(value);
    }
  } else if (property.type === 'checkbox') {
    if (typeof value !== 'boolean')
      throw new Error(`${property.name} must be checked or unchecked`);
    draft = String(value);
  } else if (property.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${property.name} must be a finite number`);
    }
    draft = String(value);
  } else if (property.type === 'date') {
    try {
      const date = canonicalizeDatabaseDateValue(value);
      const constraintIssue = validateDatabasePropertyConstraints(property, date);
      if (constraintIssue) throw new Error(`${property.name} ${constraintIssue}`);
      return date;
    } catch {
      throw new Error(`${property.name} requires a valid date value`);
    }
  } else {
    if (typeof value !== 'string') throw new Error(`${property.name} must be text`);
    draft = value;
  }

  const parsed = parseDatabaseCellDraft(property, draft, people);
  if (parsed === undefined) throw new Error(`${property.name} cannot be empty`);
  const constraintIssue = validateDatabasePropertyConstraints(property, parsed);
  if (constraintIssue) throw new Error(`${property.name} ${constraintIssue}`);
  return parsed;
}
