import type {
  DatabaseProperty,
  DatabaseSource,
  DatabaseValue,
  FormulaComputedResult,
  FormulaPersistedRuntimeValue,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import {
  formatDatabaseUniqueId,
  serializeDatabaseDateValue,
  serializeDatabasePlaceValue,
} from '@nedian0brien/synapsenote-core';
import { isDatabaseCellEditable, parseDatabaseCellDraft } from './database-cell-mutation.ts';

function tsvCell(value: string): string {
  return /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function encodeTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(tsvCell).join('\t')).join('\n');
}

/** Parse quoted TSV, including embedded tabs, newlines, CRLF, and doubled quotes. */
export function parseTsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === '\t') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('TSV contains an unterminated quoted cell');
  if (cell !== '' || row.length > 0 || rows.length === 0) {
    row.push(cell);
    rows.push(row);
  }
  const width = rows[0]?.length ?? 0;
  if (rows.some((candidate) => candidate.length !== width)) {
    throw new Error('TSV rows must have the same number of columns');
  }
  return rows;
}

export function databaseValueToClipboard(
  property: DatabaseProperty,
  value: DatabaseValue | undefined,
  people: readonly ProjectedDatabasePerson[] = [],
): string {
  if (value === undefined) return '';
  if (
    property.type === 'date' ||
    property.type === 'created_time' ||
    property.type === 'last_edited_time'
  ) {
    return serializeDatabaseDateValue(value as Parameters<typeof serializeDatabaseDateValue>[0]);
  }
  if (property.type === 'checkbox') return value === true ? 'true' : 'false';
  if (property.type === 'unique_id' && typeof value === 'number') {
    return formatDatabaseUniqueId(property.prefix, value);
  }
  if (property.type === 'place' && value && typeof value === 'object' && !Array.isArray(value)) {
    return serializeDatabasePlaceValue(value as never);
  }
  if ((property.type === 'select' || property.type === 'status') && typeof value === 'string') {
    return property.options.find((option) => option.id === value)?.key ?? value;
  }
  if (property.type === 'multi_select' && Array.isArray(value)) {
    return JSON.stringify(
      value.map((entry) => property.options.find((option) => option.id === entry)?.key ?? entry),
    );
  }
  if (property.type === 'person' && Array.isArray(value)) {
    return JSON.stringify(
      value.map((entry) => people.find((person) => person.id === entry)?.key ?? entry),
    );
  }
  if (property.type === 'files' && Array.isArray(value)) return JSON.stringify(value);
  if (property.type === 'verification' && typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function computedRuntimeValueToClipboard(value: FormulaPersistedRuntimeValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.map((entry) => {
        if (entry === null || typeof entry !== 'object') return entry;
        if (Array.isArray(entry)) return entry;
        if (entry.kind === 'date') return entry.value;
        return entry.id;
      }),
    );
  }
  if (value.kind === 'date') return value.value;
  return value.id;
}

function databaseComputedResultToClipboard(result: FormulaComputedResult): string {
  return result.kind === 'error'
    ? `#ERROR(${result.problem.code}): ${result.problem.message}`
    : computedRuntimeValueToClipboard(result.value);
}

export function databaseRecordValueToClipboard(
  property: DatabaseProperty,
  record: ProjectedDatabaseRecord,
  people: readonly ProjectedDatabasePerson[] = [],
): string {
  const computed = record.computedResults?.[property.id];
  const invalid = record.invalidValues?.[property.id];
  if (invalid !== undefined) {
    const issue = record.issues?.find((candidate) => candidate.propertyId === property.id);
    const serialized = typeof invalid === 'string' ? invalid : JSON.stringify(invalid);
    return `#INVALID${issue ? `(${issue.code})` : ''}: ${serialized}`;
  }
  return computed && (property.type === 'formula' || property.type === 'rollup')
    ? databaseComputedResultToClipboard(computed)
    : databaseValueToClipboard(property, record.values[property.id], people);
}

function optionId(
  property: Extract<DatabaseProperty, { type: 'select' | 'status' | 'multi_select' }>,
  token: string,
): string {
  const exact = property.options.filter(
    (option) => option.id === token || option.key === token || option.name === token,
  );
  if (exact.length !== 1) {
    throw new Error(
      exact.length === 0
        ? `${property.name} has no option matching "${token}"`
        : `${property.name} option "${token}" is ambiguous`,
    );
  }
  const match = exact.at(0);
  if (!match) throw new Error(`${property.name} option "${token}" is unavailable`);
  if (match.archived === true) {
    throw new Error(`${property.name} option "${token}" is archived`);
  }
  return match.id;
}

export function databaseValueFromClipboard(
  property: DatabaseProperty,
  cell: string,
  people: readonly ProjectedDatabasePerson[] = [],
): DatabaseValue | undefined {
  if (!isDatabaseCellEditable(property)) {
    throw new Error(`${property.name} cannot be pasted in Table View yet`);
  }
  if (property.type === 'select' || property.type === 'status') {
    if (cell === '') return parseDatabaseCellDraft(property, '');
    return parseDatabaseCellDraft(property, optionId(property, cell));
  }
  if (property.type === 'multi_select') {
    if (cell === '') return [];
    let tokens: unknown;
    try {
      tokens = JSON.parse(cell);
    } catch {
      tokens = cell.split(',').map((value) => value.trim());
    }
    if (!Array.isArray(tokens) || !tokens.every((value) => typeof value === 'string')) {
      throw new Error(`${property.name} requires an option list`);
    }
    return parseDatabaseCellDraft(
      property,
      JSON.stringify(tokens.map((token) => optionId(property, token))),
    );
  }
  if (property.type === 'person') {
    if (cell === '') return [];
    let tokens: unknown;
    try {
      tokens = JSON.parse(cell);
    } catch {
      tokens = cell.split(',').map((value) => value.trim());
    }
    if (!Array.isArray(tokens) || !tokens.every((value) => typeof value === 'string')) {
      throw new Error(`${property.name} requires a person list`);
    }
    const ids = tokens.map((token) => {
      const matches = people.filter(
        (person) => person.id === token || person.key === token || person.name === token,
      );
      if (matches.length !== 1) {
        throw new Error(
          matches.length === 0
            ? `${property.name} has no person matching "${token}"`
            : `${property.name} person "${token}" is ambiguous`,
        );
      }
      const person = matches[0];
      if (!person) throw new Error(`${property.name} person "${token}" is unavailable`);
      if (!person.active) throw new Error(`${property.name} person "${token}" is inactive`);
      return person.id;
    });
    return parseDatabaseCellDraft(property, JSON.stringify(ids), people);
  }
  if (property.type === 'files') {
    return parseDatabaseCellDraft(property, cell === '' ? '[]' : cell);
  }
  if (property.type === 'relation' && property.cardinality === 'many') {
    return parseDatabaseCellDraft(property, cell === '' ? '[]' : cell);
  }
  if (property.type === 'checkbox') {
    const normalized = cell.trim().toLocaleLowerCase();
    const value =
      normalized === 'true' || normalized === 'yes' || normalized === '1'
        ? 'true'
        : normalized === 'false' || normalized === 'no' || normalized === '0'
          ? 'false'
          : cell;
    return parseDatabaseCellDraft(property, value);
  }
  return parseDatabaseCellDraft(property, cell);
}

export function databaseRecordsToTsv(input: {
  source: DatabaseSource;
  records: readonly ProjectedDatabaseRecord[];
  people?: readonly ProjectedDatabasePerson[];
  properties?: readonly DatabaseProperty[];
  includeHeader?: boolean;
}): string {
  const properties = input.properties ?? input.source.properties;
  const rows: string[][] = [];
  if (input.includeHeader !== false) rows.push(properties.map((property) => property.name));
  for (const record of input.records) {
    rows.push(
      properties.map((property) => databaseRecordValueToClipboard(property, record, input.people)),
    );
  }
  return encodeTsv(rows);
}

export function databaseRangeToTsv(input: {
  records: readonly ProjectedDatabaseRecord[];
  properties: readonly DatabaseProperty[];
  people?: readonly ProjectedDatabasePerson[];
  rowStart: number;
  rowEnd: number;
  columnStart: number;
  columnEnd: number;
}): string {
  const rowStart = Math.min(input.rowStart, input.rowEnd);
  const rowEnd = Math.max(input.rowStart, input.rowEnd);
  const columnStart = Math.min(input.columnStart, input.columnEnd);
  const columnEnd = Math.max(input.columnStart, input.columnEnd);
  if (
    rowStart < 0 ||
    columnStart < 0 ||
    rowEnd >= input.records.length ||
    columnEnd >= input.properties.length
  ) {
    throw new Error('Database cell range is outside the loaded table');
  }
  return encodeTsv(
    input.records
      .slice(rowStart, rowEnd + 1)
      .map((record) =>
        input.properties
          .slice(columnStart, columnEnd + 1)
          .map((property) => databaseRecordValueToClipboard(property, record, input.people)),
      ),
  );
}

export interface DatabasePasteChange {
  record: ProjectedDatabaseRecord;
  property: DatabaseProperty;
  value: DatabaseValue | undefined;
}

export function planDatabaseTsvPaste(input: {
  source: DatabaseSource;
  people?: readonly ProjectedDatabasePerson[];
  properties?: readonly DatabaseProperty[];
  records: readonly ProjectedDatabaseRecord[];
  anchorRecordId: string;
  anchorPropertyId: string;
  tsv: string;
}): DatabasePasteChange[] {
  const rows = parseTsv(input.tsv);
  const properties = input.properties ?? input.source.properties;
  const rowStart = input.records.findIndex((record) => record.id === input.anchorRecordId);
  const columnStart = properties.findIndex((property) => property.id === input.anchorPropertyId);
  if (rowStart < 0 || columnStart < 0) throw new Error('Paste anchor is no longer available');
  if (rowStart + rows.length > input.records.length) {
    throw new Error('Pasted rows exceed the loaded record range');
  }
  const width = rows[0]?.length ?? 0;
  if (columnStart + width > properties.length) {
    throw new Error('Pasted columns exceed the database property range');
  }
  const changes: DatabasePasteChange[] = [];
  for (const [rowOffset, row] of rows.entries()) {
    const record = input.records[rowStart + rowOffset];
    if (!record) throw new Error('Pasted row is unavailable');
    for (const [columnOffset, cell] of row.entries()) {
      const property = properties[columnStart + columnOffset];
      if (!property) throw new Error('Pasted property is unavailable');
      changes.push({
        record,
        property,
        value: databaseValueFromClipboard(property, cell, input.people),
      });
    }
  }
  return changes;
}
