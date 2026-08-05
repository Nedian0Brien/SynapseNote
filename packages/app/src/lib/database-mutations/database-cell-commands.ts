import type {
  DatabaseProperty,
  DatabaseValue,
  ProjectedDatabasePerson,
} from '@nedian0brien/synapsenote-core';
import {
  canonicalizeDatabasePlaceValue,
  DatabaseFilesValueSchema,
  DatabaseRecordIdSchema,
  isValidDatabaseEmail,
  isValidDatabasePhone,
  isValidDatabaseUrl,
  parseSerializedDatabaseDateValue,
  validateDatabasePropertyConstraints,
} from '@nedian0brien/synapsenote-core';
export function parseDatabaseCellDraft(
  property: DatabaseProperty,
  draft: string,
  people: readonly ProjectedDatabasePerson[] = [],
): DatabaseValue | undefined {
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
    throw new Error(
      property.type === 'unique_id'
        ? `${property.name} is an allocated read-only property`
        : `${property.name} is a derived read-only property`,
    );
  }
  const constrained = <T extends DatabaseValue>(value: T): T => {
    const issue = validateDatabasePropertyConstraints(property, value);
    if (issue) throw new Error(`${property.name} ${issue}`);
    return value;
  };
  if (draft === '') {
    // Title remains a required property, but an explicitly stored empty string
    // is a valid user-facing label. Stable record IDs and record paths own the
    // internal identity independently of the visible Title value.
    if (property.type === 'title') return '';
    if (property.required) {
      throw new Error(`${property.name} cannot be empty`);
    }
    return undefined;
  }
  if (property.type === 'number') {
    const value = Number(draft);
    if (!Number.isFinite(value)) throw new Error(`${property.name} must be a finite number`);
    return constrained(value);
  }
  if (property.type === 'url' && !isValidDatabaseUrl(draft)) {
    throw new Error(`${property.name} must be an HTTP or HTTPS URL`);
  }
  if (property.type === 'email' && !isValidDatabaseEmail(draft)) {
    throw new Error(`${property.name} must be a valid email address`);
  }
  if (property.type === 'phone' && !isValidDatabasePhone(draft)) {
    throw new Error(`${property.name} must be a dialable phone number`);
  }
  if (property.type === 'checkbox') {
    if (draft !== 'true' && draft !== 'false') {
      throw new Error(`${property.name} must be checked or unchecked`);
    }
    return draft === 'true';
  }
  if (property.type === 'date') {
    try {
      return constrained(parseSerializedDatabaseDateValue(draft));
    } catch (cause) {
      throw new Error(
        `${property.name} ${cause instanceof Error ? cause.message : 'requires a valid date'}`,
      );
    }
  }
  if (property.type === 'select' || property.type === 'status') {
    if (!property.options.some((option) => option.id === draft && option.archived !== true)) {
      throw new Error(`${property.name} requires a valid option`);
    }
    return draft;
  }
  if (property.type === 'multi_select') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid option list`);
    }
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (value) =>
          typeof value === 'string' && property.options.some((option) => option.id === value),
      )
    ) {
      throw new Error(`${property.name} requires a valid option list`);
    }
    return [...new Set(parsed)];
  }
  if (property.type === 'person') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid person list`);
    }
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (value) => typeof value === 'string' && people.some((person) => person.id === value),
      ) ||
      (property.required && parsed.length === 0) ||
      (!property.multiple && parsed.length > 1)
    ) {
      throw new Error(`${property.name} requires declared people within its cardinality`);
    }
    return [...new Set(parsed)];
  }
  if (property.type === 'files') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid file list`);
    }
    const files = DatabaseFilesValueSchema.safeParse(parsed);
    if (!files.success || (property.required && files.data.length === 0)) {
      throw new Error(`${property.name} requires unique safe local assets or HTTP(S) URLs`);
    }
    return files.data;
  }
  if (property.type === 'place') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid JSON place object`);
    }
    try {
      return constrained(canonicalizeDatabasePlaceValue(parsed));
    } catch {
      throw new Error(
        `${property.name} requires a label or address, valid coordinates, precision, and source`,
      );
    }
  }
  if (property.type === 'relation') {
    if (property.cardinality === 'one') {
      if (!DatabaseRecordIdSchema.safeParse(draft).success) {
        throw new Error(`${property.name} requires one stable record ID`);
      }
      return constrained(draft);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      throw new Error(`${property.name} requires a valid record ID list`);
    }
    if (
      !Array.isArray(parsed) ||
      parsed.some((recordId) => !DatabaseRecordIdSchema.safeParse(recordId).success) ||
      new Set(parsed).size !== parsed.length ||
      (property.required && parsed.length === 0)
    ) {
      throw new Error(`${property.name} requires unique record IDs within its cardinality`);
    }
    return constrained(parsed);
  }
  return constrained(draft);
}

export function isDatabaseCellEditable(property: DatabaseProperty): boolean {
  return [
    'title',
    'text',
    'number',
    'checkbox',
    'select',
    'status',
    'multi_select',
    'person',
    'files',
    'relation',
    'url',
    'email',
    'phone',
    'date',
    'place',
  ].includes(property.type);
}

export { createDatabaseTablePasteDesiredState } from './database-bulk-commands';
// Cell edits and paste are record-scoped desired-state commands. Keep their
// ergonomic cell-command import while the implementations live with the
// record mutation builders.
export { createDatabaseCellMutationDesiredState } from './database-record-commands';
