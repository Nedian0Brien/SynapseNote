import type {
  DatabaseMarkdownTableMutationInput,
  DatabaseMarkdownTableMutationRequest,
} from '@nedian0brien/synapsenote-server';
import type { DatabaseSource } from '@nedian0brien/synapsenote-core';
import {
  DatabaseMutationClientError,
  type DatabaseMutationClientOptions,
} from './database-mutation-client.ts';

export interface DatabaseMarkdownTableMutationResponse {
  operation: DatabaseMarkdownTableMutationRequest['operation'];
  changed: boolean;
  receipt: Record<string, unknown>;
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DatabaseMutationClientError(message, { status: 502, problem: value });
  }
  return value as Record<string, unknown>;
}

/**
 * The browser's only direct v2 table mutation adapter. UI callers supply an
 * exact optimistic revision and never patch Markdown or a v1 record file.
 */
export async function mutateDatabaseMarkdownTable(
  input: DatabaseMarkdownTableMutationRequest,
  options: DatabaseMutationClientOptions = {},
): Promise<DatabaseMarkdownTableMutationResponse> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/markdown-table/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
        ? body.detail
        : `Markdown owner-table mutation failed with HTTP ${response.status}`;
    throw new DatabaseMutationClientError(detail, { status: response.status, problem: body });
  }
  const result = object(body, 'Markdown owner-table mutation returned an invalid response');
  if (
    result.operation !== input.operation ||
    typeof result.changed !== 'boolean' ||
    result.receipt === null ||
    typeof result.receipt !== 'object' ||
    Array.isArray(result.receipt)
  ) {
    throw new DatabaseMutationClientError(
      'Markdown owner-table mutation returned an incomplete receipt',
      { status: 502, problem: result },
    );
  }
  return {
    operation: result.operation as DatabaseMarkdownTableMutationRequest['operation'],
    changed: result.changed,
    receipt: result.receipt as Record<string, unknown>,
  };
}

export function createMarkdownTableCellMutation(
  input: Extract<DatabaseMarkdownTableMutationInput, { databaseId: string; propertyId: string }>,
): DatabaseMarkdownTableMutationRequest {
  return { operation: 'update_cell', input } as DatabaseMarkdownTableMutationRequest;
}

export function createMarkdownTableRowCreateMutation(input: {
  databaseId: string;
  sourceId: string;
  documentPath: string;
  documentMarkdown: string;
  values?: Readonly<Record<string, unknown>>;
  expectedOwnerRevision: string;
}): DatabaseMarkdownTableMutationRequest {
  return { operation: 'create_row', input } as DatabaseMarkdownTableMutationRequest;
}

export function createMarkdownTableRowDeleteMutation(input: {
  databaseId: string;
  sourceId: string;
  recordId: string;
  expectedOwnerRevision: string;
  expectedRowRevision?: string;
}): DatabaseMarkdownTableMutationRequest {
  return { operation: 'delete_row', input } as DatabaseMarkdownTableMutationRequest;
}

/** Copy a row only when the caller explicitly selects a new document identity. */
export function createMarkdownTableRowCopyMutation(input: {
  databaseId: string;
  sourceId: string;
  recordId: string;
  mode: 'duplicate_document' | 'linked_view';
  documentPath: string;
  documentId?: string;
  expectedOwnerRevision: string;
  expectedRowRevision?: string;
}): DatabaseMarkdownTableMutationRequest {
  return { operation: 'copy_row', input } as DatabaseMarkdownTableMutationRequest;
}

export function createMarkdownTableTitleMutation(input: {
  databaseId: string;
  sourceId: string;
  recordId: string;
  title: string;
  expectedOwnerRevision: string;
  expectedDocumentRevision?: string;
}): DatabaseMarkdownTableMutationRequest {
  return { operation: 'update_title', input } as DatabaseMarkdownTableMutationRequest;
}

export function createMarkdownTableDocumentMoveMutation(input: {
  databaseId: string;
  sourceId: string;
  recordId: string;
  newDocumentPath: string;
  expectedOwnerRevision: string;
  expectedDocumentRevision?: string;
}): DatabaseMarkdownTableMutationRequest {
  return { operation: 'move_document', input } as DatabaseMarkdownTableMutationRequest;
}

export function createMarkdownTableLifecycleMutation(input: {
  databaseId: string;
  sourceId: string;
  recordId: string;
  archived?: boolean;
  pageLayoutOverride?: Record<string, unknown> | null;
  expectedOwnerRevision: string;
  expectedManifestRevision?: string;
}): DatabaseMarkdownTableMutationRequest {
  return { operation: 'update_lifecycle', input } as DatabaseMarkdownTableMutationRequest;
}

/** Build the user-visible document path without introducing a generated folder. */
export function markdownTableDocumentPath(sourceFolder: string, title: string): string {
  const slug = title
    .trim()
    .replace(/\s+/gu, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^[-.]+|[-.]+$/gu, '')
    .slice(0, 160);
  const basename = `${slug || 'untitled'}.md`;
  return sourceFolder === '.' || sourceFolder === '' ? basename : `${sourceFolder}/${basename}`;
}

/** Minimal normal Markdown document; the server adds `_sn.document_id` losslessly. */
export function markdownTableDocumentMarkdown(title: string, body = ''): string {
  const heading = title.trim().replace(/[\r\n]+/gu, ' ');
  const trimmedBody = body.trim();
  return `# ${heading}\n${trimmedBody ? `\n${trimmedBody}\n` : '\n'}`;
}

/** Resolve only defaults that the v2 codec can encode without a reviewed plan. */
export function markdownTableDefaultValues(source: DatabaseSource): Record<string, unknown> {
  const storage = source.storage;
  if (!storage || storage.kind !== 'markdown_table') {
    throw new Error('The selected source is not a Markdown owner table');
  }
  const values: Record<string, unknown> = {};
  for (const propertyId of storage.storedPropertyIds) {
    const property = source.properties.find((candidate) => candidate.id === propertyId);
    if (!property) throw new Error(`Stored property "${propertyId}" is not defined by the source`);
    if (property.type === 'title') continue;
    if (property.type === 'unique_id') {
      throw new Error('A v2 row with a Unique ID property requires an explicit reviewed allocation');
    }
    const defaultValue = property.semantics.defaultValue;
    if (property.required && defaultValue === undefined) {
      throw new Error(`Required property "${property.name}" has no default value`);
    }
    if (defaultValue !== undefined) {
      if (property.type === 'person' || property.type === 'relation') {
        throw new Error(`Default wikilinks for "${property.name}" require an explicit row plan`);
      }
      values[property.id] = structuredClone(defaultValue);
    }
  }
  return values;
}
