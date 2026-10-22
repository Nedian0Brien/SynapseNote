import type {
  DatabaseDefinition,
  DatabaseQueryResult,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';

export const DATABASE_JSON_EXPORT_SCHEMA = 'synapsenote.database-export' as const;
export const DATABASE_JSON_EXPORT_VERSION = 1 as const;

export interface DatabaseJsonExportInput {
  database: DatabaseDefinition;
  source: DatabaseSource;
  manifestRevision: string;
  schemaRevision: string;
  indexRevision: string;
  result: DatabaseQueryResult;
  scope: 'current' | 'all';
}

/**
 * Serialize one complete, permission-filtered query snapshot without replacing
 * stable IDs with labels. The trailing newline keeps the artifact friendly to
 * Git and command-line tools while JSON field order remains deterministic.
 */
export function databaseSnapshotToJson(input: DatabaseJsonExportInput): string {
  if (input.result.sourceId !== input.source.id) {
    throw new Error('JSON export snapshot belongs to a different source');
  }
  if (!input.result.isComplete || input.result.nextCursor !== null) {
    throw new Error('JSON export requires a complete query snapshot');
  }
  if (
    input.result.returned !== input.result.records.length ||
    input.result.matched !== input.result.returned
  ) {
    throw new Error('JSON export record count does not match its snapshot receipt');
  }

  return `${JSON.stringify(
    {
      schema: DATABASE_JSON_EXPORT_SCHEMA,
      version: DATABASE_JSON_EXPORT_VERSION,
      scope: input.scope,
      database: {
        id: input.database.id,
        key: input.database.key,
        name: input.database.name,
      },
      source: {
        id: input.source.id,
        key: input.source.key,
        name: input.source.name,
        recordMeaning: input.source.recordMeaning,
        properties: structuredClone(input.source.properties),
      },
      revisions: {
        manifest: input.manifestRevision,
        schema: input.schemaRevision,
        index: input.indexRevision,
        snapshot: input.result.snapshotRevision,
      },
      result: {
        matched: input.result.matched,
        returned: input.result.returned,
        complete: true,
        indexFreshness: input.result.indexFreshness,
      },
      records: structuredClone(input.result.records),
    },
    null,
    2,
  )}\n`;
}
