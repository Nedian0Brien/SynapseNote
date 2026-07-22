import type {
  DatabaseProperty,
  DatabaseSource,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import {
  databaseRecordValueToClipboard,
  databaseValueFromClipboard,
  databaseValueToClipboard,
} from './database-tsv.ts';

export const DATABASE_CSV_RECORD_ID_HEADER = 'record_id';
export const DATABASE_CSV_IMPORT_RECORD_LIMIT = 100;

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function encodeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Strict RFC 4180-style CSV parser with quoted comma/newline and doubled-quote support. */
export function parseDelimited(input: string, delimiter: ',' | '\t' | ';'): string[][] {
  if (input === '') throw new Error('CSV is empty');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let afterQuote = false;
  const finishCell = () => {
    row.push(cell);
    cell = '';
    afterQuote = false;
  };
  const finishRow = () => {
    finishCell();
    rows.push(row);
    row = [];
  };
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (afterQuote && character !== delimiter && character !== '\r' && character !== '\n') {
      throw new Error('CSV has characters after a closing quote');
    }
    if (character === '"' && cell === '') {
      quoted = true;
    } else if (character === delimiter) {
      finishCell();
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      finishRow();
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unterminated quoted cell');
  if (cell !== '' || row.length > 0 || !/[\r\n]$/.test(input)) finishRow();
  const width = rows[0]?.length ?? 0;
  if (width === 0 || rows.some((candidate) => candidate.length !== width)) {
    throw new Error('CSV rows must have the same number of columns');
  }
  return rows;
}

export function parseCsv(input: string): string[][] {
  return parseDelimited(input, ',');
}

export function databaseRecordsToCsv(input: {
  source: DatabaseSource;
  records: readonly ProjectedDatabaseRecord[];
  properties?: readonly DatabaseProperty[];
  people?: readonly ProjectedDatabasePerson[];
}): string {
  const properties = input.properties ?? input.source.properties;
  return encodeCsv([
    [DATABASE_CSV_RECORD_ID_HEADER, ...properties.map((property) => property.key)],
    ...input.records.map((record) => [
      record.id,
      ...properties.map((property) =>
        databaseRecordValueToClipboard(property, record, input.people),
      ),
    ]),
  ]);
}

interface ParsedDatabaseCsv {
  headers: string[];
  properties: DatabaseProperty[];
  rows: Array<{ recordId: string; cells: string[] }>;
}

function parseDatabaseCsv(
  source: DatabaseSource,
  contents: string,
  delimiter: ',' | '\t' | ';' = ',',
): ParsedDatabaseCsv {
  const [headers, ...rows] = parseDelimited(contents, delimiter);
  if (headers?.[0]) headers[0] = headers[0].replace(/^\uFEFF/, '');
  if (!headers || headers[0] !== DATABASE_CSV_RECORD_ID_HEADER) {
    throw new Error(`CSV first column must be ${DATABASE_CSV_RECORD_ID_HEADER}`);
  }
  if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique');
  if (headers.length < 2) throw new Error('CSV must include at least one property column');
  const properties = headers.slice(1).map((header) => {
    const matches = source.properties.filter(
      (property) => property.id === header || property.key === header || property.name === header,
    );
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? `CSV header "${header}" does not match a database property`
          : `CSV header "${header}" is ambiguous`,
      );
    }
    const property = matches[0];
    if (!property) throw new Error(`CSV property "${header}" is unavailable`);
    return property;
  });
  if (new Set(properties.map((property) => property.id)).size !== properties.length) {
    throw new Error('CSV maps more than one column to the same property');
  }
  if (rows.length > DATABASE_CSV_IMPORT_RECORD_LIMIT) {
    throw new Error(`CSV import is limited to ${DATABASE_CSV_IMPORT_RECORD_LIMIT} records`);
  }
  const parsedRows = rows.map(([recordId = '', ...cells]) => ({ recordId, cells }));
  if (parsedRows.some((row) => row.recordId === ''))
    throw new Error('CSV record_id cannot be empty');
  if (new Set(parsedRows.map((row) => row.recordId)).size !== parsedRows.length) {
    throw new Error('CSV record_id values must be unique');
  }
  return { headers: headers.slice(1), properties, rows: parsedRows };
}

export function databaseCsvRecordIds(source: DatabaseSource, csv: string): string[] {
  return parseDatabaseCsv(source, csv).rows.map((row) => row.recordId);
}

export function databaseDelimitedRecordIds(
  source: DatabaseSource,
  contents: string,
  delimiter: ',' | '\t' | ';',
): string[] {
  return parseDatabaseCsv(source, contents, delimiter).rows.map((row) => row.recordId);
}

export type DatabaseImportEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';
export type DatabaseImportDelimiter = ',' | '\t' | ';';

export interface DatabaseImportInspection {
  encoding: DatabaseImportEncoding;
  delimiter: DatabaseImportDelimiter;
  delimiterLabel: 'comma' | 'tab' | 'semicolon';
  contents: string;
  rowCount: number;
  mappings: Array<{
    header: string;
    propertyId: string;
    propertyName: string;
    propertyType: string;
  }>;
  emptyValueCount: number;
  dateValueCount: number;
  optionValueCount: number;
  issues: Array<{ row: number; header: string; message: string }>;
  preview: Array<{ recordId: string; values: Record<string, string> }>;
}

function decodeDatabaseImport(bytes: Uint8Array): {
  encoding: DatabaseImportEncoding;
  contents: string;
} {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', contents: new TextDecoder('utf-8').decode(bytes.subarray(3)) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return {
      encoding: 'utf-16le',
      contents: new TextDecoder('utf-16le').decode(bytes.subarray(2)),
    };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      encoding: 'utf-16be',
      contents: new TextDecoder('utf-16be').decode(bytes.subarray(2)),
    };
  }
  try {
    return {
      encoding: 'utf-8',
      contents: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    };
  } catch {
    return { encoding: 'windows-1252', contents: new TextDecoder('windows-1252').decode(bytes) };
  }
}

function detectDelimiter(contents: string, filename: string): DatabaseImportDelimiter {
  const candidates: DatabaseImportDelimiter[] = filename.toLowerCase().endsWith('.tsv')
    ? ['\t', ',', ';']
    : [',', '\t', ';'];
  let best: { delimiter: DatabaseImportDelimiter; width: number } | null = null;
  for (const delimiter of candidates) {
    try {
      const rows = parseDelimited(contents, delimiter);
      const width = rows[0]?.length ?? 0;
      if (width >= 2 && (!best || width > best.width)) best = { delimiter, width };
    } catch {
      // Another delimiter may still produce a valid rectangular file.
    }
  }
  if (!best) throw new Error('Unable to detect a comma, tab, or semicolon delimiter');
  return best.delimiter;
}

export function inspectDatabaseImport(input: {
  source: DatabaseSource;
  people?: readonly ProjectedDatabasePerson[];
  bytes: Uint8Array;
  filename: string;
}): DatabaseImportInspection {
  const decoded = decodeDatabaseImport(input.bytes);
  const delimiter = detectDelimiter(decoded.contents, input.filename);
  const parsed = parseDatabaseCsv(input.source, decoded.contents, delimiter);
  const mappings = parsed.properties.map((property, index) => ({
    header: parsed.headers[index] ?? property.key,
    propertyId: property.id,
    propertyName: property.name,
    propertyType: property.type,
  }));
  const issues: DatabaseImportInspection['issues'] = [];
  const preview: DatabaseImportInspection['preview'] = [];
  let emptyValueCount = 0;
  let dateValueCount = 0;
  let optionValueCount = 0;
  for (const [rowIndex, row] of parsed.rows.entries()) {
    const values: Record<string, string> = {};
    for (const [columnIndex, property] of parsed.properties.entries()) {
      const cell = row.cells[columnIndex] ?? '';
      if (cell === '') emptyValueCount += 1;
      if (cell !== '' && property.type === 'date') dateValueCount += 1;
      if (
        cell !== '' &&
        (property.type === 'select' ||
          property.type === 'status' ||
          property.type === 'multi_select')
      ) {
        optionValueCount += 1;
      }
      try {
        const value = databaseValueFromClipboard(property, cell, input.people);
        values[property.key] = databaseValueToClipboard(property, value, input.people);
      } catch (cause) {
        issues.push({
          row: rowIndex + 2,
          header: property.key,
          message: cause instanceof Error ? cause.message : 'Invalid value',
        });
      }
    }
    if (preview.length < 5) preview.push({ recordId: row.recordId, values });
  }
  return {
    encoding: decoded.encoding,
    delimiter,
    delimiterLabel: delimiter === ',' ? 'comma' : delimiter === '\t' ? 'tab' : 'semicolon',
    contents: decoded.contents,
    rowCount: parsed.rows.length,
    mappings,
    emptyValueCount,
    dateValueCount,
    optionValueCount,
    issues,
    preview,
  };
}

export interface DatabaseCsvImportChange {
  record: ProjectedDatabaseRecord;
  property: DatabaseProperty;
  value: ReturnType<typeof databaseValueFromClipboard>;
}

export function planDatabaseCsvImport(input: {
  source: DatabaseSource;
  people?: readonly ProjectedDatabasePerson[];
  csv: string;
  records: readonly ProjectedDatabaseRecord[];
}): DatabaseCsvImportChange[] {
  return planDatabaseDelimitedImport({
    source: input.source,
    people: input.people,
    contents: input.csv,
    delimiter: ',',
    records: input.records,
  });
}

export function planDatabaseDelimitedImport(input: {
  source: DatabaseSource;
  people?: readonly ProjectedDatabasePerson[];
  contents: string;
  delimiter: ',' | '\t' | ';';
  records: readonly ProjectedDatabaseRecord[];
}): DatabaseCsvImportChange[] {
  const parsed = parseDatabaseCsv(input.source, input.contents, input.delimiter);
  const records = new Map(input.records.map((record) => [record.id, record]));
  const changes: DatabaseCsvImportChange[] = [];
  for (const row of parsed.rows) {
    const record = records.get(row.recordId);
    if (!record) throw new Error(`CSV record ${row.recordId} is unavailable`);
    for (const [index, property] of parsed.properties.entries()) {
      changes.push({
        record,
        property,
        value: databaseValueFromClipboard(property, row.cells[index] ?? '', input.people),
      });
    }
  }
  return changes;
}
