import {
  type DatabaseAggregationResult,
  type DatabaseQuery,
  DatabaseQueryResultSchema,
  DatabaseQuerySchema,
} from './query.ts';
import type { DatabaseRecord, DatabaseValue } from './record.ts';
import type { DatabaseSource } from './schema.ts';
import { DatabaseSourceSchema } from './schema.ts';

export const DATABASE_QUERY_CONFORMANCE_VERSION = 1 as const;
export const DATABASE_QUERY_CONFORMANCE_DATABASE_ID = 'db_tasks';
export const DATABASE_QUERY_CONFORMANCE_SNAPSHOT_REVISION = 'snapshot:query-conformance-v1';

export const DATABASE_QUERY_CONFORMANCE_SOURCE: DatabaseSource = DatabaseSourceSchema.parse({
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One conformance task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
    {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select',
      options: [
        { id: 'opt_todo', key: 'todo', name: 'Todo' },
        { id: 'opt_done', key: 'done', name: 'Done' },
      ],
    },
  ],
});

export const DATABASE_QUERY_CONFORMANCE_RECORDS: readonly DatabaseRecord[] = [
  {
    id: 'rec_a',
    databaseId: DATABASE_QUERY_CONFORMANCE_DATABASE_ID,
    sourceId: DATABASE_QUERY_CONFORMANCE_SOURCE.id,
    path: 'tasks/a.md',
    revision: 'sha256:conformance-a',
    values: { prop_title: 'Alpha', prop_score: 2, prop_status: 'opt_todo' },
    body: 'Alpha body',
  },
  {
    id: 'rec_b',
    databaseId: DATABASE_QUERY_CONFORMANCE_DATABASE_ID,
    sourceId: DATABASE_QUERY_CONFORMANCE_SOURCE.id,
    path: 'tasks/b.md',
    revision: 'sha256:conformance-b',
    values: { prop_title: 'Beta', prop_score: 8, prop_status: 'opt_done' },
    body: 'Beta body',
  },
];

export interface DatabaseQueryConformanceObservation {
  sourceId: string;
  matched: number;
  returned: number;
  isComplete: boolean;
  cursorAvailable: boolean;
  truncatedBy: 'page_limit' | null;
  records: Array<{ id: string; values: Record<string, DatabaseValue> }>;
  aggregation: DatabaseAggregationResult | null;
}

export interface DatabaseQueryConformancePage {
  expected: DatabaseQueryConformanceObservation;
}

export interface DatabaseQueryConformanceCase {
  id: string;
  description: string;
  query: DatabaseQuery;
  pages: readonly DatabaseQueryConformancePage[];
}

const calculations: DatabaseAggregationResult['calculations'] = [
  { id: 'records', function: 'count_all', propertyId: null, value: 2, unit: 'count' },
  { id: 'score_sum', function: 'sum', propertyId: 'prop_score', value: 10, unit: 'number' },
];

const aggregation: DatabaseAggregationResult = {
  matched: 2,
  groupBy: [
    {
      propertyId: 'prop_status',
      direction: 'asc',
      arrayMode: 'set',
      includeEmpty: true,
    },
  ],
  calculations,
  totalGroups: 2,
  returnedGroups: 2,
  groupsComplete: true,
  truncatedBy: null,
  groups: [
    {
      level: 1,
      key: [{ propertyId: 'prop_status', value: 'opt_done' }],
      matched: 1,
      calculations: [
        { id: 'records', function: 'count_all', propertyId: null, value: 1, unit: 'count' },
        {
          id: 'score_sum',
          function: 'sum',
          propertyId: 'prop_score',
          value: 8,
          unit: 'number',
        },
      ],
    },
    {
      level: 1,
      key: [{ propertyId: 'prop_status', value: 'opt_todo' }],
      matched: 1,
      calculations: [
        { id: 'records', function: 'count_all', propertyId: null, value: 1, unit: 'count' },
        {
          id: 'score_sum',
          function: 'sum',
          propertyId: 'prop_score',
          value: 2,
          unit: 'number',
        },
      ],
    },
  ],
};

export const DATABASE_QUERY_CONFORMANCE_CASES: readonly DatabaseQueryConformanceCase[] = [
  {
    id: 'nested-filter-sort-projection-aggregate-pagination-v1',
    description:
      'Nested boolean filtering, deterministic multi-key sorting, projection, full-match aggregation, and cursor continuation',
    query: DatabaseQuerySchema.parse({
      where: {
        or: [
          {
            and: [
              { propertyId: 'prop_score', operator: 'gte', value: 2 },
              { not: { propertyId: 'prop_title', operator: 'starts_with', value: 'Z' } },
            ],
          },
          { propertyId: 'prop_status', operator: 'eq', value: 'opt_done' },
        ],
      },
      sort: [
        { propertyId: 'prop_score', direction: 'desc' },
        { propertyId: 'prop_title', direction: 'asc' },
      ],
      select: ['prop_title', 'prop_status'],
      aggregate: {
        groupBy: [{ propertyId: 'prop_status' }],
        calculations: [
          { id: 'records', function: 'count_all' },
          { id: 'score_sum', function: 'sum', propertyId: 'prop_score' },
        ],
      },
      page: { limit: 1 },
    }),
    pages: [
      {
        expected: {
          sourceId: 'ds_tasks',
          matched: 2,
          returned: 1,
          isComplete: false,
          cursorAvailable: true,
          truncatedBy: 'page_limit',
          records: [{ id: 'rec_b', values: { prop_title: 'Beta', prop_status: 'opt_done' } }],
          aggregation,
        },
      },
      {
        expected: {
          sourceId: 'ds_tasks',
          matched: 2,
          returned: 1,
          isComplete: true,
          cursorAvailable: false,
          truncatedBy: null,
          records: [{ id: 'rec_a', values: { prop_title: 'Alpha', prop_status: 'opt_todo' } }],
          aggregation,
        },
      },
    ],
  },
  {
    id: 'definitive-no-match-empty-aggregation-v1',
    description: 'Definitive empty results retain complete counts and typed aggregate identities',
    query: DatabaseQuerySchema.parse({
      where: {
        and: [
          { propertyId: 'prop_score', operator: 'gt', value: 100 },
          { propertyId: 'prop_status', operator: 'eq', value: 'opt_todo' },
        ],
      },
      select: ['prop_title'],
      aggregate: {
        calculations: [
          { id: 'records', function: 'count_all' },
          { id: 'score_average', function: 'average', propertyId: 'prop_score' },
        ],
      },
    }),
    pages: [
      {
        expected: {
          sourceId: 'ds_tasks',
          matched: 0,
          returned: 0,
          isComplete: true,
          cursorAvailable: false,
          truncatedBy: null,
          records: [],
          aggregation: {
            matched: 0,
            groupBy: [],
            calculations: [
              {
                id: 'records',
                function: 'count_all',
                propertyId: null,
                value: 0,
                unit: 'count',
              },
              {
                id: 'score_average',
                function: 'average',
                propertyId: 'prop_score',
                value: null,
                unit: 'number',
              },
            ],
            totalGroups: 0,
            returnedGroups: 0,
            groupsComplete: true,
            truncatedBy: null,
            groups: [],
          },
        },
      },
    ],
  },
];

export interface DatabaseQueryConformanceAdapterInput {
  databaseId: string;
  sourceId: string;
  query: DatabaseQuery;
}

export type DatabaseQueryConformanceAdapter = (
  input: DatabaseQueryConformanceAdapterInput,
) => unknown | Promise<unknown>;

export interface DatabaseQueryConformanceCaseReport {
  id: string;
  passed: boolean;
  failures: string[];
}

export interface DatabaseQueryConformanceReport {
  version: typeof DATABASE_QUERY_CONFORMANCE_VERSION;
  passed: boolean;
  cases: DatabaseQueryConformanceCaseReport[];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function observe(value: unknown): {
  observation: DatabaseQueryConformanceObservation;
  cursor: string | null;
  snapshotRevision: string;
} {
  const parsed = DatabaseQueryResultSchema.parse(value);
  return {
    observation: {
      sourceId: parsed.sourceId,
      matched: parsed.matched,
      returned: parsed.returned,
      isComplete: parsed.isComplete,
      cursorAvailable: parsed.nextCursor !== null,
      truncatedBy: parsed.truncatedBy,
      records: parsed.records.map((record) => ({ id: record.id, values: record.values })),
      aggregation: parsed.aggregation,
    },
    cursor: parsed.nextCursor,
    snapshotRevision: parsed.snapshotRevision,
  };
}

/** Run the public v1 vectors against any core, HTTP, UI, MCP, or SDK adapter. */
export async function runDatabaseQueryConformance(
  adapter: DatabaseQueryConformanceAdapter,
): Promise<DatabaseQueryConformanceReport> {
  const reports: DatabaseQueryConformanceCaseReport[] = [];
  for (const scenario of DATABASE_QUERY_CONFORMANCE_CASES) {
    const failures: string[] = [];
    const seenRecordIds = new Set<string>();
    let cursor: string | null = null;
    let snapshotRevision: string | null = null;
    for (const [pageIndex, page] of scenario.pages.entries()) {
      try {
        const query = DatabaseQuerySchema.parse({
          ...scenario.query,
          page: {
            ...scenario.query.page,
            ...(cursor ? { cursor } : {}),
          },
        });
        const result = observe(
          await adapter({
            databaseId: DATABASE_QUERY_CONFORMANCE_DATABASE_ID,
            sourceId: DATABASE_QUERY_CONFORMANCE_SOURCE.id,
            query,
          }),
        );
        if (stableJson(result.observation) !== stableJson(page.expected)) {
          failures.push(
            `page ${pageIndex + 1} mismatch: expected ${stableJson(page.expected)}, received ${stableJson(result.observation)}`,
          );
        }
        if (snapshotRevision !== null && result.snapshotRevision !== snapshotRevision) {
          failures.push(`page ${pageIndex + 1} changed snapshot revision during continuation`);
        }
        snapshotRevision = result.snapshotRevision;
        for (const record of result.observation.records) {
          if (seenRecordIds.has(record.id)) {
            failures.push(`page ${pageIndex + 1} repeated record ${record.id}`);
          }
          seenRecordIds.add(record.id);
        }
        cursor = result.cursor;
      } catch (error) {
        failures.push(
          `page ${pageIndex + 1} threw ${error instanceof Error ? error.message : String(error)}`,
        );
        break;
      }
    }
    if (cursor !== null) failures.push('final expected page still returned a continuation cursor');
    reports.push({ id: scenario.id, passed: failures.length === 0, failures });
  }
  return {
    version: DATABASE_QUERY_CONFORMANCE_VERSION,
    passed: reports.every((report) => report.passed),
    cases: reports,
  };
}
