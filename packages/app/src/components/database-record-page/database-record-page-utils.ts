import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { FrontmatterSnapshot } from '@nedian0brien/synapsenote-core';
import { readFmKeys, readFmRegionWithError } from '@nedian0brien/synapsenote-core';
import { DatabaseCatalogClientError } from '@/lib/database-catalog-client';
import { DatabaseQueryClientError } from '@/lib/database-query-client';

export function readInitialSnapshot(provider: HocuspocusProvider): FrontmatterSnapshot {
  const source = provider.document.getText('source').toString();
  const { map, parseError } = readFmRegionWithError(source);
  return { map, keys: readFmKeys(source), parseError };
}

export type DatabaseRecordPageProblemKind = 'missing' | 'permission' | 'error';

export interface DatabaseRecordPageProblem {
  kind: DatabaseRecordPageProblemKind;
  message: string;
}

export function databaseRecordPageProblem(cause: unknown): DatabaseRecordPageProblem {
  const status =
    cause instanceof DatabaseCatalogClientError || cause instanceof DatabaseQueryClientError
      ? cause.status
      : null;
  return {
    kind: status === 404 ? 'missing' : status === 403 ? 'permission' : 'error',
    message: cause instanceof Error ? cause.message : 'The database page could not be loaded',
  };
}
