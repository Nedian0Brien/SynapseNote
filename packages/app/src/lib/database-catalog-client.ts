import {
  type DatabaseDefinition,
  DatabaseDefinitionSchema,
  type DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { z } from 'zod';

const RevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const CATALOG_RETRY_DELAY_MS = 50;
const CATALOG_MAX_ATTEMPTS = 3;

export const DatabaseCatalogCandidateSchema = z
  .object({
    id: z.string().startsWith('db_'),
    key: z.string().min(1),
    name: z.string().min(1),
    purpose: z.string().min(1),
    sources: z.array(
      z
        .object({
          id: z.string().startsWith('ds_'),
          key: z.string().min(1),
          name: z.string().min(1),
          recordMeaning: z.string().min(1),
          propertyCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    viewCount: z.number().int().nonnegative(),
    relationCount: z.number().int().nonnegative(),
    score: z.number().nonnegative(),
    matchedBy: z.array(z.string()),
  })
  .passthrough();

const DatabaseCatalogResponseSchema = z
  .object({
    query: z.string().nullable(),
    manifestRevision: z.string().min(1),
    catalogRevision: RevisionSchema,
    complete: z.literal(true),
    candidates: z.array(DatabaseCatalogCandidateSchema),
  })
  .strict();

const DatabaseIndexStatusSchema = z
  .object({
    state: z.enum(['idle', 'rebuilding', 'error']),
    revision: z.string().min(1),
    manifestRevision: z.string().min(1),
    recordCount: z.number().int().nonnegative(),
    issueCount: z.number().int().nonnegative(),
    progress: z
      .object({
        discovered: z.number().int().nonnegative(),
        processed: z.number().int().nonnegative(),
      })
      .strict()
      .nullable(),
    lastRebuiltAt: z.string().nullable(),
    lastIncrementalAt: z.string().nullable(),
    lastError: z
      .object({ code: z.literal('rebuild_failed'), message: z.string().min(1) })
      .strict()
      .nullable(),
  })
  .strict();

const DatabaseDescriptionSchema = z
  .object({
    manifestRevision: z.string().min(1),
    schemaRevision: RevisionSchema,
    database: DatabaseDefinitionSchema,
    source: z.unknown().nullable(),
    index: DatabaseIndexStatusSchema,
    allowedOperations: z.array(z.string()),
  })
  .strict()
  .transform((value, context) => {
    const source = value.source
      ? value.database.sources.find(
          (candidate) =>
            typeof value.source === 'object' &&
            value.source !== null &&
            'id' in value.source &&
            candidate.id === value.source.id,
        )
      : null;
    if (value.source !== null && !source) {
      context.addIssue({ code: 'custom', path: ['source'], message: 'Unknown described source' });
      return z.NEVER;
    }
    return { ...value, source };
  });

export type DatabaseCatalogCandidate = z.infer<typeof DatabaseCatalogCandidateSchema>;
export interface DatabaseCatalogResult {
  query: string | null;
  manifestRevision: string;
  catalogRevision: string;
  complete: true;
  candidates: DatabaseCatalogCandidate[];
}
export interface DatabaseDescription {
  manifestRevision: string;
  schemaRevision: string;
  database: DatabaseDefinition;
  source: DatabaseSource | null;
  index: z.infer<typeof DatabaseIndexStatusSchema>;
  allowedOperations: string[];
}

export class DatabaseCatalogClientError extends Error {
  readonly status: number;
  readonly problem: unknown;

  constructor(message: string, status: number, problem?: unknown) {
    super(message);
    this.name = 'DatabaseCatalogClientError';
    this.status = status;
    this.problem = problem;
  }
}

async function responseBody(response: Response, operation: string): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string'
        ? body.detail
        : `Database ${operation} failed with HTTP ${response.status}`;
    throw new DatabaseCatalogClientError(message, response.status, body);
  }
  return body;
}

function waitForCatalogRetry(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason ?? new DOMException('The operation was aborted', 'AbortError'),
    );
  }
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, CATALOG_RETRY_DELAY_MS);
    const onAbort = () => {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function fetchDatabaseCatalog(
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal; query?: string } = {},
): Promise<DatabaseCatalogResult> {
  const parameters = new URLSearchParams();
  if (options.query?.trim()) parameters.set('q', options.query.trim());
  const suffix = parameters.size > 0 ? `?${parameters}` : '';
  for (let attempt = 0; ; attempt += 1) {
    const response = await (options.fetch ?? globalThis.fetch)(`/api/databases/catalog${suffix}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: options.signal,
    });
    try {
      const parsed = DatabaseCatalogResponseSchema.safeParse(
        await responseBody(response, 'catalog'),
      );
      if (!parsed.success) {
        throw new DatabaseCatalogClientError('Database catalog returned an invalid response', 502, {
          issues: parsed.error.issues,
        });
      }
      return parsed.data;
    } catch (error) {
      // A catalog read can overlap the short manifest/index transaction window
      // immediately after creating a database. Give that transient 409 a small
      // bounded settling window so a usable sidebar does not flash a destructive
      // error while the index catches up.
      if (
        !(error instanceof DatabaseCatalogClientError) ||
        error.status !== 409 ||
        attempt >= CATALOG_MAX_ATTEMPTS - 1
      ) {
        throw error;
      }
      await waitForCatalogRetry(options.signal);
    }
  }
}

export async function describeDatabase(
  input: { databaseId: string; sourceId?: string },
  options: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): Promise<DatabaseDescription> {
  const response = await (options.fetch ?? globalThis.fetch)('/api/databases/describe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  const parsed = DatabaseDescriptionSchema.safeParse(await responseBody(response, 'description'));
  if (!parsed.success) {
    throw new DatabaseCatalogClientError('Database description returned an invalid response', 502, {
      issues: parsed.error.issues,
    });
  }
  return parsed.data as DatabaseDescription;
}
