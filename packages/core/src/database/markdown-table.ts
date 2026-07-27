/**
 * Versioned, source-preserving Markdown owner-table primitives for database v2.
 *
 * This module deliberately does not know about the filesystem or a database
 * manifest. It parses one Markdown source, binds one owner marker to the
 * immediately following GFM table, and exposes byte ranges that a transaction
 * layer can splice without reserializing unrelated prose.
 */

import {
  parseSerializedDatabaseDateValue,
  serializeDatabaseDateValue,
  type DatabaseDateValue,
} from './date.ts';

export const DATABASE_MARKDOWN_OWNER_MARKER_VERSION = 2 as const;
export const DATABASE_MARKDOWN_OWNER_MARKER_NAME = 'synapsenote:database' as const;

export type DatabaseMarkdownOwnerMarkerVersion =
  typeof DATABASE_MARKDOWN_OWNER_MARKER_VERSION;

export interface DatabaseMarkdownOwnerMarker {
  version: DatabaseMarkdownOwnerMarkerVersion;
  databaseId: string;
  sourceId: string;
  blockId: string;
  columns: readonly string[];
}

export interface DatabaseMarkdownSourceRange {
  start: number;
  end: number;
}

export interface DatabaseMarkdownTableCell {
  rowIndex: number;
  columnIndex: number;
  /** The complete cell segment, including source padding but not the delimiters. */
  range: DatabaseMarkdownSourceRange;
  /** The decoded-value range, excluding source padding. */
  valueRange: DatabaseMarkdownSourceRange;
  raw: string;
  value: string;
}

export interface DatabaseMarkdownTableRow {
  rowIndex: number;
  range: DatabaseMarkdownSourceRange;
  cells: readonly DatabaseMarkdownTableCell[];
}

export interface ParsedDatabaseMarkdownOwner {
  marker: DatabaseMarkdownOwnerMarker;
  markerRange: DatabaseMarkdownSourceRange;
  tableRange: DatabaseMarkdownSourceRange;
  header: DatabaseMarkdownTableRow;
  delimiter: DatabaseMarkdownTableRow;
  rows: readonly DatabaseMarkdownTableRow[];
}

export type DatabaseMarkdownOwnerParseErrorCode =
  | 'marker_missing'
  | 'marker_malformed'
  | 'marker_unknown_field'
  | 'marker_invalid_version'
  | 'marker_invalid_field'
  | 'table_missing'
  | 'table_invalid_header'
  | 'table_invalid_delimiter'
  | 'table_column_count'
  | 'table_invalid_row';

export interface DatabaseMarkdownOwnerParseError {
  ok: false;
  code: DatabaseMarkdownOwnerParseErrorCode;
  message: string;
  range?: DatabaseMarkdownSourceRange;
}

export type ParseDatabaseMarkdownOwnerResult =
  | { ok: true; owner: ParsedDatabaseMarkdownOwner }
  | DatabaseMarkdownOwnerParseError;

const IDENTIFIER_RE = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const COLUMN_IDENTIFIER_RE = /^(?:prop|sys)_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const EMPTY_LINE_RE = /^[ \t]*(?:\r?\n|$)$/;

function lineEnd(source: string, start: number): number {
  const newline = source.indexOf('\n', start);
  return newline === -1 ? source.length : newline + 1;
}

function lineWithoutEnding(source: string, start: number, end: number): string {
  const raw = source.slice(start, end);
  return raw.endsWith('\n') ? raw.slice(0, -1).endsWith('\r') ? raw.slice(0, -2) : raw.slice(0, -1) : raw;
}

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function decodeGfmCell(source: string): string {
  return source.trim().replace(/\\([\\|])/g, '$1');
}

/** Encode one logical value into a single GFM cell without its delimiters. */
export function encodeDatabaseMarkdownCellText(value: string): string {
  if (value.includes('\0')) throw new Error('A Markdown table cell cannot contain a NUL byte');
  if (value.includes('\r') || value.includes('\n')) {
    throw new Error('A Markdown table cell cannot contain a line break');
  }
  return value.replaceAll('\\', '\\\\').replaceAll('|', '\\|');
}

function splitGfmRow(source: string, lineStart: number, lineEnd: number): DatabaseMarkdownTableCell[] {
  const line = lineWithoutEnding(source, lineStart, lineEnd);
  const cells: DatabaseMarkdownTableCell[] = [];
  let contentStart = lineStart;
  let contentEnd = lineStart + line.length;
  if (line.startsWith('|')) contentStart += 1;
  if (line.endsWith('|') && !isEscaped(line, line.length - 1)) contentEnd -= 1;

  let segmentStart = contentStart;
  const content = source.slice(contentStart, contentEnd);
  for (let index = 0; index <= content.length; index += 1) {
    const atEnd = index === content.length;
    if (!atEnd && (content[index] !== '|' || isEscaped(content, index))) continue;
    const segmentEnd = contentStart + index;
    const raw = source.slice(segmentStart, segmentEnd);
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    const valueStart = segmentStart + leading;
    const valueEnd = Math.max(valueStart, segmentEnd - trailing);
    cells.push({
      rowIndex: -1,
      columnIndex: cells.length,
      range: { start: segmentStart, end: segmentEnd },
      valueRange: { start: valueStart, end: valueEnd },
      raw,
      value: decodeGfmCell(source.slice(valueStart, valueEnd)),
    });
    segmentStart = segmentEnd + 1;
  }
  return cells;
}

function createRow(
  source: string,
  rowIndex: number,
  start: number,
  end: number,
): DatabaseMarkdownTableRow {
  const cells = splitGfmRow(source, start, end).map((cell, columnIndex) => ({
    ...cell,
    rowIndex,
    columnIndex,
  }));
  return { rowIndex, range: { start, end }, cells };
}

function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') || trimmed.includes('|');
}

function isDelimiterCell(value: string): boolean {
  return /^:?-{3,}:?$/.test(value.trim());
}

function invalid(
  code: DatabaseMarkdownOwnerParseErrorCode,
  message: string,
  range?: DatabaseMarkdownSourceRange,
): DatabaseMarkdownOwnerParseError {
  return { ok: false, code, message, ...(range ? { range } : {}) };
}

interface MarkerMatch {
  index: number;
  body: string;
  length: number;
}

function findOwnerMarker(source: string): MarkerMatch | null {
  let cursor = 0;
  let fence: { character: '`' | '~'; length: number } | null = null;
  while (cursor < source.length) {
    const end = lineEnd(source, cursor);
    const line = lineWithoutEnding(source, cursor, end);
    const logicalLine = cursor === 0 ? line.replace(/^\uFEFF/, '') : line;
    const opening = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (
        new RegExp(`^[ \\t]{0,3}\\${fence.character}{${fence.length},}[ \\t]*$`).test(line)
      ) {
        fence = null;
      }
      cursor = end;
      continue;
    }
    if (opening) {
      fence = { character: opening[1]![0] as '`' | '~', length: opening[1]!.length };
      cursor = end;
      continue;
    }
    if (!/^[ \t]{0,3}<!--[ \t]*synapsenote:database[ \t]*$/.test(logicalLine)) {
      cursor = end;
      continue;
    }
    const markerStart = cursor + (line.length - logicalLine.length);
    const firstLineEnd = end;
    let closingStart = firstLineEnd;
    while (closingStart < source.length) {
      const closingEnd = lineEnd(source, closingStart);
      const closingLine = lineWithoutEnding(source, closingStart, closingEnd);
      if (/^[ \t]{0,3}-->[ \t]*$/.test(closingLine)) {
        return {
          index: markerStart,
          body: source.slice(firstLineEnd, closingStart).replace(/\r?\n$/, ''),
          length: closingEnd - markerStart,
        };
      }
      closingStart = closingEnd;
    }
    return null;
  }
  return null;
}

function parseMarker(
  body: string,
  range: DatabaseMarkdownSourceRange,
): DatabaseMarkdownOwnerMarker | DatabaseMarkdownOwnerParseError {
  const values = new Map<string, string>();
  for (const [index, rawLine] of body.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === '') continue;
    const separator = line.indexOf('=');
    if (separator <= 0) {
      return invalid(
        'marker_malformed',
        `Database marker line ${index + 1} must use key=value syntax`,
        range,
      );
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!['version', 'database', 'source', 'block', 'columns'].includes(key)) {
      return invalid('marker_unknown_field', `Unknown database marker field "${key}"`, range);
    }
    if (values.has(key)) {
      return invalid('marker_malformed', `Database marker field "${key}" is duplicated`, range);
    }
    values.set(key, value);
  }

  const version = Number(values.get('version'));
  if (version !== DATABASE_MARKDOWN_OWNER_MARKER_VERSION) {
    return invalid(
      'marker_invalid_version',
      `Database owner marker version must be ${DATABASE_MARKDOWN_OWNER_MARKER_VERSION}`,
      range,
    );
  }
  const databaseId = values.get('database');
  const sourceId = values.get('source');
  const blockId = values.get('block');
  const columnsValue = values.get('columns');
  if (!databaseId || !IDENTIFIER_RE.test(databaseId)) {
    return invalid('marker_invalid_field', 'Database marker has an invalid database ID', range);
  }
  if (!sourceId || !IDENTIFIER_RE.test(sourceId)) {
    return invalid('marker_invalid_field', 'Database marker has an invalid source ID', range);
  }
  if (!blockId || !IDENTIFIER_RE.test(blockId)) {
    return invalid('marker_invalid_field', 'Database marker has an invalid block ID', range);
  }
  if (!columnsValue) {
    return invalid('marker_invalid_field', 'Database marker must declare columns', range);
  }
  const columns = columnsValue.split(',').map((column) => column.trim());
  if (
    columns.length === 0 ||
    columns.some((column) => !COLUMN_IDENTIFIER_RE.test(column)) ||
    new Set(columns).size !== columns.length
  ) {
    return invalid('marker_invalid_field', 'Database marker columns must be unique stable IDs', range);
  }
  return {
    version: DATABASE_MARKDOWN_OWNER_MARKER_VERSION,
    databaseId,
    sourceId,
    blockId,
    columns,
  };
}

/** Parse the owner marker and its immediately following GFM table. */
export function parseDatabaseMarkdownOwner(source: string): ParseDatabaseMarkdownOwnerResult {
  const markerMatch = findOwnerMarker(source);
  if (!markerMatch) {
    return invalid('marker_missing', 'No SynapseNote database owner marker was found');
  }
  const markerStart = markerMatch.index;
  const markerEnd = markerStart + markerMatch.length;
  const marker = parseMarker(markerMatch.body, { start: markerStart, end: markerEnd });
  if ('ok' in marker) return marker;

  let cursor = markerEnd;
  while (cursor < source.length) {
    const end = lineEnd(source, cursor);
    if (!EMPTY_LINE_RE.test(source.slice(cursor, end))) break;
    cursor = end;
  }
  if (cursor >= source.length) {
    return invalid('table_missing', 'Database owner marker is not followed by a GFM table', {
      start: markerStart,
      end: markerEnd,
    });
  }

  const headerEnd = lineEnd(source, cursor);
  const header = createRow(source, 0, cursor, headerEnd);
  if (header.cells.length !== marker.columns.length || header.cells.length === 0) {
    return invalid(
      'table_invalid_header',
      `Database owner table has ${header.cells.length} header columns; marker declares ${marker.columns.length}`,
      header.range,
    );
  }
  const delimiterStart = headerEnd;
  const delimiterEnd = lineEnd(source, delimiterStart);
  const delimiter = createRow(source, 0, delimiterStart, delimiterEnd);
  if (
    delimiter.cells.length !== marker.columns.length ||
    delimiter.cells.some((cell) => !isDelimiterCell(cell.value))
  ) {
    return invalid(
      'table_invalid_delimiter',
      'The row after a database owner table header must be a GFM delimiter row',
      delimiter.range,
    );
  }

  const rows: DatabaseMarkdownTableRow[] = [];
  let rowCursor = delimiterEnd;
  while (rowCursor < source.length) {
    const end = lineEnd(source, rowCursor);
    const line = lineWithoutEnding(source, rowCursor, end);
    if (line.trim() === '' || !isTableLine(line)) break;
    const row = createRow(source, rows.length, rowCursor, end);
    if (row.cells.length !== marker.columns.length) {
      return invalid(
        'table_column_count',
        `Database owner row has ${row.cells.length} columns; marker declares ${marker.columns.length}`,
        row.range,
      );
    }
    rows.push(row);
    rowCursor = end;
  }

  return {
    ok: true,
    owner: {
      marker,
      markerRange: { start: markerStart, end: markerEnd },
      tableRange: { start: header.range.start, end: rows.at(-1)?.range.end ?? delimiter.range.end },
      header,
      delimiter,
      rows,
    },
  };
}

export function serializeDatabaseMarkdownOwnerMarker(marker: DatabaseMarkdownOwnerMarker): string {
  if (marker.version !== DATABASE_MARKDOWN_OWNER_MARKER_VERSION) {
    throw new Error(`Unsupported database owner marker version ${marker.version}`);
  }
  if (
    !IDENTIFIER_RE.test(marker.databaseId) ||
    !IDENTIFIER_RE.test(marker.sourceId) ||
    !IDENTIFIER_RE.test(marker.blockId) ||
    marker.columns.length === 0 ||
    marker.columns.some((column) => !COLUMN_IDENTIFIER_RE.test(column)) ||
    new Set(marker.columns).size !== marker.columns.length
  ) {
    throw new Error('Cannot serialize an invalid database owner marker');
  }
  return [
    '<!-- synapsenote:database',
    `version=${marker.version}`,
    `database=${marker.databaseId}`,
    `source=${marker.sourceId}`,
    `block=${marker.blockId}`,
    `columns=${marker.columns.join(',')}`,
    '-->',
  ].join('\n');
}

export function replaceDatabaseMarkdownTableCell(
  source: string,
  owner: ParsedDatabaseMarkdownOwner,
  rowIndex: number,
  columnIndex: number,
  encodedValue: string,
): string {
  if (encodedValue.includes('\r') || encodedValue.includes('\n')) {
    throw new Error('A replacement database cell cannot contain a line break');
  }
  const row = owner.rows[rowIndex];
  const cell = row?.cells[columnIndex];
  if (!cell) throw new Error(`Database table cell ${rowIndex}:${columnIndex} was not found`);
  return (
    source.slice(0, cell.valueRange.start) +
    encodedValue +
    source.slice(cell.valueRange.end)
  );
}

function tableLineEnding(source: string, owner: ParsedDatabaseMarkdownOwner): '\n' | '\r\n' {
  const candidates = [owner.header.range, owner.delimiter.range, ...owner.rows.map((row) => row.range)];
  for (const range of candidates) {
    const line = source.slice(range.start, range.end);
    if (line.endsWith('\r\n')) return '\r\n';
    if (line.endsWith('\n')) return '\n';
  }
  return source.includes('\r\n') ? '\r\n' : '\n';
}

function encodedTableRow(encodedValues: readonly string[], eol: '\n' | '\r\n'): string {
  if (encodedValues.length === 0) throw new Error('A database table row must contain at least one cell');
  if (encodedValues.some((value) => value.includes('\r') || value.includes('\n'))) {
    throw new Error('A replacement database row cannot contain a line break');
  }
  return `| ${encodedValues.join(' | ')} |${eol}`;
}

/** Replace one complete owner-table row while preserving all other source bytes. */
export function replaceDatabaseMarkdownTableRow(
  source: string,
  owner: ParsedDatabaseMarkdownOwner,
  rowIndex: number,
  encodedValues: readonly string[],
): string {
  const row = owner.rows[rowIndex];
  if (!row) throw new Error(`Database table row ${rowIndex} was not found`);
  if (encodedValues.length !== owner.marker.columns.length) {
    throw new Error(`Database table row must contain ${owner.marker.columns.length} cells`);
  }
  return source.slice(0, row.range.start) + encodedTableRow(encodedValues, tableLineEnding(source, owner)) + source.slice(row.range.end);
}

/** Insert a new owner-table row at a deterministic position without reserializing the table. */
export function insertDatabaseMarkdownTableRow(
  source: string,
  owner: ParsedDatabaseMarkdownOwner,
  rowIndex: number,
  encodedValues: readonly string[],
): string {
  if (rowIndex < 0 || rowIndex > owner.rows.length || !Number.isInteger(rowIndex)) {
    throw new Error(`Database table insertion row ${rowIndex} is out of range`);
  }
  if (encodedValues.length !== owner.marker.columns.length) {
    throw new Error(`Database table row must contain ${owner.marker.columns.length} cells`);
  }
  const insertion = owner.rows[rowIndex]?.range.start ?? owner.tableRange.end;
  return source.slice(0, insertion) + encodedTableRow(encodedValues, tableLineEnding(source, owner)) + source.slice(insertion);
}

/** Delete one owner-table row while preserving the marker, header, and all prose bytes. */
export function deleteDatabaseMarkdownTableRow(
  source: string,
  owner: ParsedDatabaseMarkdownOwner,
  rowIndex: number,
): string {
  const row = owner.rows[rowIndex];
  if (!row) throw new Error(`Database table row ${rowIndex} was not found`);
  return source.slice(0, row.range.start) + source.slice(row.range.end);
}

export interface DatabaseMarkdownDocumentLink {
  kind: 'wikilink';
  target: string;
  alias?: string;
}

const WIKILINK_RE = /^\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]$/;

function encodeWikilink(value: DatabaseMarkdownDocumentLink): string {
  if (!value.target || value.target.includes('\0') || value.target.includes(']')) {
    throw new Error('A wikilink target is invalid');
  }
  if (value.alias !== undefined && (value.alias === '' || value.alias.includes(']'))) {
    throw new Error('A wikilink alias is invalid');
  }
  const raw = `[[${value.target}${value.alias === undefined ? '' : `|${value.alias}`}]]`;
  return encodeDatabaseMarkdownCellText(raw);
}

function decodeWikilink(value: string): DatabaseMarkdownDocumentLink | null {
  const match = WIKILINK_RE.exec(value.trim());
  if (!match) return null;
  return { kind: 'wikilink', target: match[1], ...(match[2] ? { alias: match[2] } : {}) };
}

function canonicalJson(value: unknown): string | undefined {
  return JSON.stringify(value);
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export type DatabaseMarkdownCellPropertyType =
  | 'title'
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'select'
  | 'status'
  | 'multi_select'
  | 'url'
  | 'email'
  | 'phone'
  | 'person'
  | 'files'
  | 'relation'
  | 'unique_id'
  | 'place';

export type DatabaseMarkdownCellValue =
  | string
  | number
  | boolean
  | string[]
  | DatabaseDateValue
  | DatabaseMarkdownDocumentLink
  | DatabaseMarkdownDocumentLink[]
  | Record<string, unknown>
  | Record<string, unknown>[];

export type DatabaseMarkdownCellCodecErrorCode =
  | 'null_not_allowed'
  | 'invalid_type'
  | 'invalid_value'
  | 'invalid_json'
  | 'invalid_wikilink';

export interface DatabaseMarkdownCellCodecError {
  ok: false;
  code: DatabaseMarkdownCellCodecErrorCode;
  message: string;
}

export type EncodeDatabaseMarkdownCellResult =
  | { ok: true; text: string }
  | DatabaseMarkdownCellCodecError;

export type DecodeDatabaseMarkdownCellResult =
  | { ok: true; value: DatabaseMarkdownCellValue | null }
  | DatabaseMarkdownCellCodecError;

function codecError(
  code: DatabaseMarkdownCellCodecErrorCode,
  message: string,
): DatabaseMarkdownCellCodecError {
  return { ok: false, code, message };
}

function encodeJsonCell(value: unknown): EncodeDatabaseMarkdownCellResult {
  try {
    const json = canonicalJson(value);
    if (json === undefined) return codecError('invalid_json', 'Value cannot be serialized as JSON');
    return { ok: true, text: encodeDatabaseMarkdownCellText(json) };
  } catch (error) {
    return codecError('invalid_json', error instanceof Error ? error.message : String(error));
  }
}

/** Encode a typed v2 stored value using the canonical cell codec. */
export function encodeDatabaseMarkdownCell(
  propertyType: DatabaseMarkdownCellPropertyType,
  value: unknown,
): EncodeDatabaseMarkdownCellResult {
  if (value === null || value === undefined) return { ok: true, text: '' };
  if (propertyType === 'title') {
    if (typeof value === 'object' && value !== null && 'kind' in value) {
      const link = value as DatabaseMarkdownDocumentLink;
      if (link.kind !== 'wikilink') return codecError('invalid_wikilink', 'Title must be a wikilink');
      try {
        return { ok: true, text: encodeWikilink(link) };
      } catch (error) {
        return codecError('invalid_wikilink', error instanceof Error ? error.message : String(error));
      }
    }
    return codecError('invalid_wikilink', 'Title cells must contain a document wikilink');
  }
  if (propertyType === 'relation' || propertyType === 'person') {
    const links = Array.isArray(value) ? value : [value];
    if (!links.every((item) => item && typeof item === 'object' && (item as { kind?: string }).kind === 'wikilink')) {
      return codecError('invalid_wikilink', `${propertyType} cells must contain wikilinks`);
    }
    try {
      return {
        ok: true,
        text: links.map((item) => encodeWikilink(item as DatabaseMarkdownDocumentLink)).join(', '),
      };
    } catch (error) {
      return codecError('invalid_wikilink', error instanceof Error ? error.message : String(error));
    }
  }
  switch (propertyType) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'status':
      return typeof value === 'string'
        ? { ok: true, text: encodeDatabaseMarkdownCellText(value) }
        : codecError('invalid_type', `${propertyType} cells must contain strings`);
    case 'number':
    case 'unique_id':
      return typeof value === 'number' && Number.isFinite(value)
        ? { ok: true, text: String(value) }
        : codecError('invalid_type', `${propertyType} cells must contain finite numbers`);
    case 'checkbox':
      return typeof value === 'boolean'
        ? { ok: true, text: value ? '[x]' : '[ ]' }
        : codecError('invalid_type', 'Checkbox cells must contain booleans');
    case 'date':
      try {
        return { ok: true, text: encodeDatabaseMarkdownCellText(serializeDatabaseDateValue(value as DatabaseDateValue)) };
      } catch (error) {
        return codecError('invalid_value', error instanceof Error ? error.message : String(error));
      }
    case 'multi_select':
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        return codecError('invalid_type', 'Multi-select cells must contain string arrays');
      }
      if (new Set(value).size !== value.length) return codecError('invalid_value', 'Multi-select values must be unique');
      return encodeJsonCell(value);
    case 'files':
    case 'place':
      return encodeJsonCell(value);
  }
}

function decodeWikilinks(value: string): DatabaseMarkdownDocumentLink[] | null {
  const parts = value.split(/\s*,\s*/).filter(Boolean);
  const links = parts.map(decodeWikilink);
  return links.every((link): link is DatabaseMarkdownDocumentLink => link !== null) ? links : null;
}

/** Decode one canonical or accepted v2 Markdown cell into typed storage state. */
export function decodeDatabaseMarkdownCell(
  propertyType: DatabaseMarkdownCellPropertyType,
  source: string,
): DecodeDatabaseMarkdownCellResult {
  const value = decodeGfmCell(source);
  if (value === '') return { ok: true, value: null };
  if (propertyType === 'title') {
    const link = decodeWikilink(value);
    return link
      ? { ok: true, value: link }
      : codecError('invalid_wikilink', 'Title cells must contain one document wikilink');
  }
  if (propertyType === 'relation' || propertyType === 'person') {
    const links = decodeWikilinks(value);
    if (!links || links.length === 0) return codecError('invalid_wikilink', `${propertyType} cells must contain wikilinks`);
    return { ok: true, value: links.length === 1 ? links[0] : links };
  }
  switch (propertyType) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'status':
      return { ok: true, value };
    case 'number':
    case 'unique_id': {
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
        return codecError('invalid_value', `${propertyType} cell is not a canonical decimal number`);
      }
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? { ok: true, value: parsed }
        : codecError('invalid_value', `${propertyType} cell is not finite`);
    }
    case 'checkbox':
      return value === '[x]'
        ? { ok: true, value: true }
        : value === '[ ]'
          ? { ok: true, value: false }
          : codecError('invalid_value', 'Checkbox cells must be [x] or [ ]');
    case 'date':
      try {
        return { ok: true, value: parseSerializedDatabaseDateValue(value) };
      } catch (error) {
        return codecError('invalid_value', error instanceof Error ? error.message : String(error));
      }
    case 'multi_select': {
      const parsed = parseJson(value);
      if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
        return codecError('invalid_json', 'Multi-select cell must be a JSON string array');
      }
      if (new Set(parsed).size !== parsed.length) return codecError('invalid_value', 'Multi-select values must be unique');
      return { ok: true, value: parsed };
    }
    case 'files':
    case 'place': {
      const parsed = parseJson(value);
      if (parsed === undefined || parsed === null || typeof parsed !== 'object') {
        return codecError('invalid_json', `${propertyType} cell must contain a JSON object or array`);
      }
      return { ok: true, value: parsed as Record<string, unknown> | Record<string, unknown>[] };
    }
  }
}
