import {
  type DatabaseLinkedViewSettings,
  type DatabaseProperty,
  type DatabaseQuery,
  type DatabaseQueryResult,
  DatabaseQueryResultSchema,
  type FormulaComputedResult,
  FormulaComputedResultSchema,
  type ProjectedDatabaseRecord,
  ProjectedDatabaseRecordSchema,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';
import { withDatabaseReadRetry } from './database-read-retry.ts';

export interface DatabaseQueryClientInput {
  databaseId: string;
  sourceId: string;
  viewId?: string;
  viewOverrides?: DatabaseLinkedViewSettings;
  query?: DatabaseQuery;
}

export interface DatabaseQueryClientOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

export class DatabaseQueryClientError extends Error {
  readonly status: number;
  readonly problem: unknown;

  constructor(message: string, options: { status: number; problem?: unknown }) {
    super(message);
    this.name = 'DatabaseQueryClientError';
    this.status = options.status;
    this.problem = options.problem;
  }
}

const DatabaseRecordLookupResponseSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    record: ProjectedDatabaseRecordSchema,
  })
  .strict();

export interface DatabaseRecordLookupResult {
  databaseId: string;
  sourceId: string;
  manifestRevision: string;
  indexRevision: string;
  record: ProjectedDatabaseRecord;
}

type ComputedProperty = Extract<DatabaseProperty, { type: 'formula' | 'rollup' }>;

const DatabaseComputedPropertyPreviewResponseSchema = z
  .object({
    databaseId: z.string().startsWith('db_'),
    sourceId: z.string().startsWith('ds_'),
    recordId: z.string().startsWith('rec_'),
    propertyId: z.string().startsWith('prop_'),
    manifestRevision: z.string().min(1),
    indexRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    evaluatedAt: z.string().datetime({ offset: true }),
    permissionRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    result: FormulaComputedResultSchema,
  })
  .strict();

export interface DatabaseComputedPropertyPreviewResult {
  databaseId: string;
  sourceId: string;
  recordId: string;
  propertyId: string;
  manifestRevision: string;
  indexRevision: string;
  evaluatedAt: string;
  permissionRevision: string;
  result: FormulaComputedResult;
}

export function appendDatabaseQueryPage(
  current: DatabaseQueryResult,
  next: DatabaseQueryResult,
): DatabaseQueryResult {
  if (current.sourceId !== next.sourceId || current.snapshotRevision !== next.snapshotRevision) {
    throw new DatabaseQueryClientError(
      'Database page does not belong to the current source snapshot',
      { status: 409, problem: { current, next } },
    );
  }
  if (current.matched !== next.matched) {
    throw new DatabaseQueryClientError('Database page changed its matched record count', {
      status: 409,
      problem: { currentMatched: current.matched, nextMatched: next.matched },
    });
  }
  const ids = new Set(current.records.map((record) => record.id));
  const duplicate = next.records.find((record) => ids.has(record.id));
  if (duplicate) {
    throw new DatabaseQueryClientError('Database page overlaps a previously loaded record', {
      status: 409,
      problem: { recordId: duplicate.id },
    });
  }
  const mergeById = <T extends { id: string }>(
    currentItems: readonly T[] | undefined,
    nextItems: readonly T[] | undefined,
  ): T[] | undefined => {
    if (!currentItems && !nextItems) return undefined;
    return [
      ...new Map(
        [...(currentItems ?? []), ...(nextItems ?? [])].map((item) => [item.id, item]),
      ).values(),
    ];
  };
  if (
    current.conditionalColors &&
    next.conditionalColors &&
    JSON.stringify(current.conditionalColors.rules) !== JSON.stringify(next.conditionalColors.rules)
  ) {
    throw new DatabaseQueryClientError('Database page changed its conditional color rules', {
      status: 409,
      problem: { current: current.conditionalColors.rules, next: next.conditionalColors.rules },
    });
  }
  return {
    ...next,
    records: [...current.records, ...next.records],
    returned: current.returned + next.returned,
    people: mergeById(current.people, next.people),
    relationRecords: mergeById(current.relationRecords, next.relationRecords),
    fileStates:
      current.fileStates || next.fileStates
        ? { ...current.fileStates, ...next.fileStates }
        : undefined,
    conditionalColors:
      current.conditionalColors || next.conditionalColors
        ? {
            rules: next.conditionalColors?.rules ?? current.conditionalColors?.rules ?? [],
            records: {
              ...current.conditionalColors?.records,
              ...next.conditionalColors?.records,
            },
          }
        : undefined,
    groupMemberships:
      current.groupMemberships || next.groupMemberships
        ? { ...current.groupMemberships, ...next.groupMemberships }
        : undefined,
  };
}

/** Typed browser/SDK-style adapter for the canonical database query endpoint. */
export async function queryDatabase(
  input: DatabaseQueryClientInput,
  options: DatabaseQueryClientOptions = {},
): Promise<DatabaseQueryResult> {
  return withDatabaseReadRetry(
    async () => {
      const fetchImplementation = options.fetch ?? globalThis.fetch;
      const response = await fetchImplementation('/api/databases/query', {
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
            : `Database query failed with HTTP ${response.status}`;
        throw new DatabaseQueryClientError(detail, { status: response.status, problem: body });
      }

      const parsed = DatabaseQueryResultSchema.safeParse(body);
      if (!parsed.success) {
        throw new DatabaseQueryClientError('Database query returned an invalid response', {
          status: response.status,
          problem: { issues: parsed.error.issues },
        });
      }
      if (parsed.data.sourceId !== input.sourceId) {
        throw new DatabaseQueryClientError('Database query returned a different source', {
          status: response.status,
          problem: { requestedSourceId: input.sourceId, returnedSourceId: parsed.data.sourceId },
        });
      }
      return parsed.data;
    },
    { signal: options.signal },
  );
}

/** Fetch one permission-filtered record by its stable ID in O(1) index lookup time. */
export async function fetchDatabaseRecord(
  input: { databaseId: string; sourceId: string; recordId: string },
  options: DatabaseQueryClientOptions = {},
): Promise<DatabaseRecordLookupResult> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/record', {
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
        : `Database record lookup failed with HTTP ${response.status}`;
    throw new DatabaseQueryClientError(detail, {
      status: response.status,
      problem: body,
    });
  }
  const parsed = DatabaseRecordLookupResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new DatabaseQueryClientError('Database record lookup returned an invalid response', {
      status: 502,
      problem: { issues: parsed.error.issues },
    });
  }
  if (
    parsed.data.databaseId !== input.databaseId ||
    parsed.data.sourceId !== input.sourceId ||
    parsed.data.record.id !== input.recordId
  ) {
    throw new DatabaseQueryClientError('Database record lookup returned a different record', {
      status: 502,
      problem: parsed.data,
    });
  }
  return parsed.data;
}

/** Preview an unsaved Formula/Rollup candidate without mutating canonical state. */
export async function previewDatabaseComputedProperty(
  input: {
    databaseId: string;
    sourceId: string;
    recordId: string;
    property: ComputedProperty;
  },
  options: DatabaseQueryClientOptions = {},
): Promise<DatabaseComputedPropertyPreviewResult> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/computed-preview', {
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
        : `Database computed property preview failed with HTTP ${response.status}`;
    throw new DatabaseQueryClientError(detail, { status: response.status, problem: body });
  }
  const parsed = DatabaseComputedPropertyPreviewResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new DatabaseQueryClientError(
      'Database computed property preview returned an invalid response',
      { status: 502, problem: { issues: parsed.error.issues } },
    );
  }
  if (
    parsed.data.databaseId !== input.databaseId ||
    parsed.data.sourceId !== input.sourceId ||
    parsed.data.recordId !== input.recordId ||
    parsed.data.propertyId !== input.property.id
  ) {
    throw new DatabaseQueryClientError(
      'Database computed property preview returned a different target',
      { status: 502, problem: parsed.data },
    );
  }
  return parsed.data;
}
