import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { z } from 'zod';
import type {
  DatabaseMarkdownTableCell,
  DatabaseMarkdownTableRow,
  ParsedDatabaseMarkdownOwner,
} from './markdown-table.ts';

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
  return hash(
    stable({
      marker: owner.marker,
      header: owner.header.cells.map((cell) => cell.value),
      delimiter: owner.delimiter.cells.map((cell) => cell.value),
    }),
  );
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

/** Revisions that a v2 record transport must carry together. */
export interface DatabaseMarkdownRecordRevisionSet {
  owner: string;
  table: string;
  row: string;
  cells: Readonly<Record<string, string>>;
  document: string;
}

export const DatabaseMarkdownRecordRevisionSetSchema = z
  .object({
    owner: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    table: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    row: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    cells: z.record(z.string(), z.string().regex(/^sha256:[a-f0-9]{64}$/)),
    document: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

/**
 * The two revisions in a record's set that describe the OWNER rather than the
 * row: identical for every row of one projection, and each a hash over the
 * whole table.
 *
 * Recomputing them per row made projecting a 318-row source hash ~6MB of
 * markdown to produce two values, which is most of the cost of applying a
 * single-row write. Callers that project more than one row compute this once
 * and hand it down; the shape exists so that hoisting is a parameter rather
 * than a caller reaching for the two helpers and assembling them by hand.
 */
export interface DatabaseMarkdownOwnerScopedRevisions {
  owner: string;
  table: string;
}

export function createDatabaseMarkdownOwnerScopedRevisions(
  ownerMarkdown: string,
  owner: ParsedDatabaseMarkdownOwner,
): DatabaseMarkdownOwnerScopedRevisions {
  return {
    owner: databaseMarkdownOwnerRevision(ownerMarkdown),
    table: databaseMarkdownTableStructureRevision(owner),
  };
}

export function createDatabaseMarkdownRecordRevisionSet(input: {
  ownerMarkdown: string;
  owner: ParsedDatabaseMarkdownOwner;
  rowIndex: number;
  documentMarkdown: string;
  /** Precomputed owner-scoped pair; derived from the owner when omitted. */
  ownerScoped?: DatabaseMarkdownOwnerScopedRevisions;
}): DatabaseMarkdownRecordRevisionSet {
  const row = input.owner.rows[input.rowIndex];
  if (!row) throw new Error(`Database table row ${input.rowIndex} was not found`);
  const ownerScoped =
    input.ownerScoped ??
    createDatabaseMarkdownOwnerScopedRevisions(input.ownerMarkdown, input.owner);
  return {
    owner: ownerScoped.owner,
    table: ownerScoped.table,
    row: databaseMarkdownTableRowRevision(row),
    cells: Object.fromEntries(
      row.cells.map((cell) => [
        input.owner.marker.columns[cell.columnIndex] ?? String(cell.columnIndex),
        databaseMarkdownTableCellRevision(cell),
      ]),
    ),
    document: databaseMarkdownDocumentRevision(input.documentMarkdown),
  };
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
    for (const cell of row.cells)
      cells[`${key}:${cell.columnIndex}`] = databaseMarkdownTableCellRevision(cell);
  }
  return {
    manifest: input.manifestRevision,
    owner: databaseMarkdownOwnerRevision(input.ownerMarkdown),
    table: databaseMarkdownTableStructureRevision(input.owner),
    rows,
    cells,
    documents: { ...input.documentRevisions },
    derived: input.derivedRevision ?? null,
  };
}
