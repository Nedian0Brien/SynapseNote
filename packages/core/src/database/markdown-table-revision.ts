import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { ParsedDatabaseMarkdownOwner, DatabaseMarkdownTableCell, DatabaseMarkdownTableRow } from './markdown-table.ts';

function hash(value: string): string {
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(value)))}`;
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
    .join(',')}}`;
}

/** Full byte revision used as the optimistic owner-document precondition. */
export function databaseMarkdownOwnerRevision(markdown: string): string {
  return hash(markdown);
}

/** Revision of marker/schema/header structure; prose and row values are excluded. */
export function databaseMarkdownTableStructureRevision(owner: ParsedDatabaseMarkdownOwner): string {
  return hash(stable({
    marker: owner.marker,
    header: owner.header.cells.map((cell) => cell.value),
    delimiter: owner.delimiter.cells.map((cell) => cell.value),
  }));
}

/** Semantic row revision; whitespace/alignment changes do not invalidate it. */
export function databaseMarkdownTableRowRevision(row: DatabaseMarkdownTableRow): string {
  return hash(stable({ values: row.cells.map((cell) => cell.value) }));
}

/** Semantic cell revision. Invalid raw values include their exact source bytes. */
export function databaseMarkdownTableCellRevision(cell: DatabaseMarkdownTableCell): string {
  return hash(stable({ value: cell.value, raw: cell.raw.trim() }));
}

/** Revision of a linked document's complete Markdown bytes. */
export function databaseMarkdownDocumentRevision(markdown: string): string {
  return hash(markdown);
}

export interface DatabaseMarkdownRevisionSet {
  manifest: string;
  owner: string;
  table: string;
  rows: Readonly<Record<string, string>>;
  cells: Readonly<Record<string, string>>;
  documents: Readonly<Record<string, string>>;
  derived: string | null;
}

export interface CreateDatabaseMarkdownRevisionSetInput {
  manifestRevision: string;
  ownerMarkdown: string;
  owner: ParsedDatabaseMarkdownOwner;
  rowKeys?: readonly string[];
  documentRevisions?: Readonly<Record<string, string>>;
  derivedRevision?: string | null;
}

/** Build all storage-layer revisions from one parsed owner snapshot. */
export function createDatabaseMarkdownRevisionSet(
  input: CreateDatabaseMarkdownRevisionSetInput,
): DatabaseMarkdownRevisionSet {
  const rowKeys = input.rowKeys ?? input.owner.rows.map((row) => String(row.rowIndex));
  const rows: Record<string, string> = {};
  const cells: Record<string, string> = {};
  for (const [index, row] of input.owner.rows.entries()) {
    const key = rowKeys[index] ?? String(index);
    rows[key] = databaseMarkdownTableRowRevision(row);
    for (const cell of row.cells) cells[`${key}:${cell.columnIndex}`] = databaseMarkdownTableCellRevision(cell);
  }
  return {
    manifest: input.manifestRevision,
    owner: databaseMarkdownOwnerRevision(input.ownerMarkdown),
    table: databaseMarkdownTableStructureRevision(input.owner),
    rows,
    cells,
    documents: { ...(input.documentRevisions ?? {}) },
    derived: input.derivedRevision ?? null,
  };
}
