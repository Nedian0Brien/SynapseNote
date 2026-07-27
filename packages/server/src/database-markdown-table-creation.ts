/**
 * Shared planning/commit helpers for rows created in a v2 owner table.
 *
 * A v2 row is a normal Markdown document plus one owner-table row.  Keeping
 * the path and document-id rules here prevents the planner, commit engine,
 * templates, and UI from inventing slightly different storage layouts.
 */

import {
  createDatabaseDocumentId,
  type DatabaseDefinition,
  type DatabaseDocumentId,
  type DatabaseSource,
} from '@nedian0brien/synapsenote-core';

export interface DatabaseMarkdownTableCreationSample {
  id: string;
  sourceId: string;
  values: Readonly<Record<string, unknown>>;
  body: string;
  documentId?: DatabaseDocumentId;
}

function titleText(
  source: DatabaseSource,
  sample: Pick<DatabaseMarkdownTableCreationSample, 'values'>,
): string {
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const value = titleProperty ? sample.values[titleProperty.id] : undefined;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}

/** Return a stable, human-readable filename without silently suffixing collisions. */
export function databaseMarkdownTableDocumentPath(
  database: Pick<DatabaseDefinition, 'key'>,
  source: DatabaseSource,
  sample: DatabaseMarkdownTableCreationSample,
): string {
  const title = titleText(source, sample);
  const slug = title
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 160);
  const fallback = `${database.key}-${source.key}-${sample.id.replace(/^rec_/u, '').slice(0, 12)}`;
  return `${slug || fallback}.md`;
}

/** Build the linked document body; the writer adds only `_sn.document_id`. */
export function databaseMarkdownTableDocumentMarkdown(
  source: DatabaseSource,
  sample: DatabaseMarkdownTableCreationSample,
): string {
  const title = titleText(source, sample) || 'Untitled';
  const body = sample.body.replace(/^\s+/u, '').replace(/\s+$/u, '');
  return body ? `# ${title}\n\n${body}\n` : `# ${title}\n`;
}

export function databaseMarkdownTableDocumentId(
  sample: DatabaseMarkdownTableCreationSample,
  generateUuid: () => string,
): DatabaseDocumentId {
  return sample.documentId ?? createDatabaseDocumentId(generateUuid);
}
