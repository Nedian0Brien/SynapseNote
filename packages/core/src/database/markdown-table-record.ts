import { createDatabaseMarkdownRecordId } from './document-identity.ts';
import {
  type DatabaseMarkdownCellPropertyType,
  type DatabaseMarkdownCellValue,
  type DatabaseMarkdownDocumentLink,
  decodeDatabaseMarkdownCell,
  type ParsedDatabaseMarkdownOwner,
  parseDatabaseMarkdownOwner,
} from './markdown-table.ts';
import type { DatabaseMarkdownDocumentLinkResolution } from './markdown-table-links.ts';
import type { DatabaseProperty, DatabaseRecordId, DatabaseSource } from './schema.ts';
import type { DatabaseDocumentId } from './stable-ids.ts';

export interface DatabaseMarkdownDocumentResolution {
  path: string;
  documentId: DatabaseDocumentId;
}

export interface DatabaseMarkdownOwnerCellIssue {
  rowIndex: number;
  columnIndex: number;
  propertyId: string;
  raw: string;
  code: string;
  message: string;
}

export interface DatabaseMarkdownOwnerRow {
  rowIndex: number;
  range: { start: number; end: number };
  recordId: DatabaseRecordId | null;
  documentId: DatabaseDocumentId | null;
  documentPath: string | null;
  documentLink: DatabaseMarkdownDocumentLink | null;
  values: Readonly<Record<string, DatabaseMarkdownCellValue | null>>;
  issues: readonly DatabaseMarkdownOwnerCellIssue[];
}

export type DatabaseMarkdownOwnerMaterializationErrorCode =
  | 'invalid_owner'
  | 'storage_mismatch'
  | 'unknown_property'
  | 'unsupported_property'
  | 'broken_document_link'
  | 'duplicate_document';

export interface DatabaseMarkdownOwnerMaterializationError {
  code: DatabaseMarkdownOwnerMaterializationErrorCode;
  rowIndex?: number;
  columnIndex?: number;
  message: string;
}

export interface MaterializeDatabaseMarkdownOwnerInput {
  databaseId: string;
  source: DatabaseSource;
  markdown: string;
  resolveDocument: (
    link: DatabaseMarkdownDocumentLink,
  ) => DatabaseMarkdownDocumentResolution | null;
  /** Optional shared resolver. When supplied, its diagnostic code is preserved. */
  resolveDocumentLink?: (
    link: DatabaseMarkdownDocumentLink,
  ) => DatabaseMarkdownDocumentLinkResolution;
}

export interface MaterializedDatabaseMarkdownOwner {
  owner: ParsedDatabaseMarkdownOwner;
  rows: readonly DatabaseMarkdownOwnerRow[];
  errors: readonly DatabaseMarkdownOwnerMaterializationError[];
}

/**
 * Property types that occupy a column in a v2 owner table. Their complement —
 * formula, rollup, the four created/last-edited metadata types, verification,
 * and button — is computed or governed elsewhere and lives only in the
 * manifest, so adding one of those never reshapes the table.
 *
 * This is the single source for that partition. Callers that need the other
 * half ask `isStoredDatabasePropertyType` rather than restating the list;
 * `markdown-table-record.test.ts` asserts the two halves still cover every
 * declared property type, so a new type cannot land in neither.
 */
export const DATABASE_STORED_PROPERTY_TYPES: ReadonlySet<DatabaseProperty['type']> = new Set<
  DatabaseProperty['type']
>([
  'title',
  'text',
  'number',
  'checkbox',
  'date',
  'select',
  'status',
  'multi_select',
  'url',
  'email',
  'phone',
  'person',
  'files',
  'relation',
  'unique_id',
  'place',
]);

/** True when a property of this type is stored as an owner-table column. */
export function isStoredDatabasePropertyType(
  type: DatabaseProperty['type'],
): type is DatabaseMarkdownCellPropertyType {
  return DATABASE_STORED_PROPERTY_TYPES.has(type);
}

/**
 * The owner-table column order a source's schema implies, as property IDs.
 *
 * This is what `source.storage.storedPropertyIds` must equal, and the reason it
 * is derived rather than read: a schema change arrives carrying the PREVIOUS
 * storage block (clients edit `properties` and leave `storage` alone), so
 * comparing the stored field against itself would never notice a new column.
 */
export function databaseStoredPropertyIds(source: DatabaseSource): readonly string[] {
  return source.properties
    .filter((property) => isStoredDatabasePropertyType(property.type))
    .map((property) => property.id);
}

function isCodecPropertyType(
  type: DatabaseProperty['type'],
): type is DatabaseMarkdownCellPropertyType {
  return isStoredDatabasePropertyType(type);
}

function documentResolution(
  input: MaterializeDatabaseMarkdownOwnerInput,
  link: DatabaseMarkdownDocumentLink,
): DatabaseMarkdownDocumentResolution | null {
  return input.resolveDocument(link);
}

/** Materialize owner-table rows into a storage-neutral typed read model. */
export function materializeDatabaseMarkdownOwner(
  input: MaterializeDatabaseMarkdownOwnerInput,
):
  | MaterializedDatabaseMarkdownOwner
  | { errors: readonly DatabaseMarkdownOwnerMaterializationError[] } {
  const parsed = parseDatabaseMarkdownOwner(input.markdown);
  if (!parsed.ok) {
    return {
      errors: [
        {
          code: 'invalid_owner',
          message: `${parsed.code}: ${parsed.message}`,
        },
      ],
    };
  }
  const storage = input.source.storage;
  if (!storage || storage.kind !== 'markdown_table') {
    return {
      errors: [
        {
          code: 'storage_mismatch',
          message: `Source "${input.source.id}" does not declare v2 Markdown owner-table storage`,
        },
      ],
    };
  }
  const errors: DatabaseMarkdownOwnerMaterializationError[] = [];
  if (
    parsed.owner.marker.databaseId !== input.databaseId ||
    parsed.owner.marker.sourceId !== input.source.id ||
    parsed.owner.marker.blockId !== storage.owner.blockId ||
    parsed.owner.marker.columns.join('\0') !== storage.storedPropertyIds.join('\0')
  ) {
    errors.push({
      code: 'storage_mismatch',
      message: 'Owner marker does not match the v2 manifest storage binding',
    });
  }

  const properties = new Map(input.source.properties.map((property) => [property.id, property]));
  const rows: DatabaseMarkdownOwnerRow[] = [];
  const seenDocuments = new Set<string>();

  for (const row of parsed.owner.rows) {
    const values: Record<string, DatabaseMarkdownCellValue | null> = {};
    const issues: DatabaseMarkdownOwnerCellIssue[] = [];
    let documentLink: DatabaseMarkdownDocumentLink | null = null;
    let documentId: DatabaseDocumentId | null = null;
    let documentPath: string | null = null;
    let recordId: DatabaseRecordId | null = null;

    for (const cell of row.cells) {
      const propertyId = storage.storedPropertyIds[cell.columnIndex];
      const property = propertyId ? properties.get(propertyId) : undefined;
      if (!propertyId || !property) {
        errors.push({
          code: 'unknown_property',
          rowIndex: row.rowIndex,
          columnIndex: cell.columnIndex,
          message: `Owner column ${cell.columnIndex} is not defined by source schema`,
        });
        continue;
      }
      if (!isCodecPropertyType(property.type)) {
        errors.push({
          code: 'unsupported_property',
          rowIndex: row.rowIndex,
          columnIndex: cell.columnIndex,
          message: `Property "${propertyId}" of type "${property.type}" cannot be stored in v2 table`,
        });
        continue;
      }
      // Decode from the encoded source segment exactly once. `cell.value` is
      // already GFM-unescaped by the structural parser; feeding it back into
      // the codec would turn a literal backslash escape into a different value.
      const decoded = decodeDatabaseMarkdownCell(property.type, cell.raw);
      if (!decoded.ok) {
        issues.push({
          rowIndex: row.rowIndex,
          columnIndex: cell.columnIndex,
          propertyId,
          raw: cell.raw,
          code: decoded.code,
          message: decoded.message,
        });
        continue;
      }
      values[propertyId] = decoded.value;
      if (cell.columnIndex === 0) {
        const candidate = decoded.value;
        if (
          !candidate ||
          Array.isArray(candidate) ||
          typeof candidate !== 'object' ||
          !('kind' in candidate) ||
          candidate.kind !== 'wikilink'
        ) {
          issues.push({
            rowIndex: row.rowIndex,
            columnIndex: cell.columnIndex,
            propertyId,
            raw: cell.raw,
            code: 'invalid_wikilink',
            message: 'The first owner-table cell must resolve to one document wikilink',
          });
          continue;
        }
        documentLink = decoded.value as DatabaseMarkdownDocumentLink;
        const linkResolution = input.resolveDocumentLink?.(documentLink);
        if (linkResolution && !linkResolution.ok) {
          errors.push({
            code: 'broken_document_link',
            rowIndex: row.rowIndex,
            columnIndex: cell.columnIndex,
            message: `${linkResolution.code}: ${linkResolution.message}`,
          });
          continue;
        }
        const resolved =
          linkResolution?.ok && linkResolution.candidate
            ? {
                path: linkResolution.candidate.path,
                documentId: linkResolution.candidate.documentId as DatabaseDocumentId,
              }
            : documentResolution(input, documentLink);
        if (!resolved) {
          errors.push({
            code: 'broken_document_link',
            rowIndex: row.rowIndex,
            columnIndex: cell.columnIndex,
            message: `Document link "${documentLink.target}" could not be resolved`,
          });
          continue;
        }
        documentId = resolved.documentId;
        documentPath = resolved.path;
        recordId = createDatabaseMarkdownRecordId(input.source.id, documentId);
        if (seenDocuments.has(documentId)) {
          errors.push({
            code: 'duplicate_document',
            rowIndex: row.rowIndex,
            columnIndex: cell.columnIndex,
            message: `Document "${documentId}" appears in more than one row of source "${input.source.id}"`,
          });
        }
        seenDocuments.add(documentId);
      }
    }
    rows.push({
      rowIndex: row.rowIndex,
      range: row.range,
      recordId,
      documentId,
      documentPath,
      documentLink,
      values,
      issues,
    });
  }

  return { owner: parsed.owner, rows, errors };
}
