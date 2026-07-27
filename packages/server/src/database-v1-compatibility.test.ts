import { describe, expect, test } from 'bun:test';
import { DatabaseDefinitionSchema } from '@nedian0brien/synapsenote-core';
import {
  DATABASE_V1_COMPATIBILITY_POLICY,
  isV1Database,
  v1MigrationRequiredMessage,
  v1MutationIsBlocked,
} from './database-v1-compatibility.ts';

function definition(version: 1 | 2) {
  return DatabaseDefinitionSchema.parse({
    version,
    id: 'db_compatibility',
    key: 'compatibility',
    name: 'Compatibility',
    contract: {
      purpose: 'Compatibility policy fixture',
      canonicality: 'canonical',
      vocabulary: ['compatibility'],
      freshness: { expectation: 'daily' },
      sensitivity: 'internal',
    },
    sources: [
      {
        id: 'ds_compatibility',
        key: 'compatibility',
        name: 'Compatibility',
        recordMeaning: 'One compatibility record',
        folder: version === 1 ? 'compatibility' : '.',
        ...(version === 2
          ? {
              storage: {
                kind: 'markdown_table' as const,
                formatVersion: 2 as const,
                owner: { path: 'compatibility.md', blockId: 'dbb_compatibility_primary' },
                titlePropertyId: 'prop_title',
                storedPropertyIds: ['prop_title'],
              },
            }
          : {}),
        properties: [{ id: 'prop_title', key: 'title', name: 'Title', type: 'title' }],
      },
    ],
  });
}

describe('v1 compatibility boundary', () => {
  test('keeps the default writer and product policy explicit', () => {
    expect(DATABASE_V1_COMPATIBILITY_POLICY).toMatchObject({
      defaultWriteVersion: 2,
      read: true,
      export: true,
      migrationWriter: true,
      importWriter: true,
      productWriter: false,
    });
    expect(v1MutationIsBlocked('product')).toBe(true);
    expect(v1MutationIsBlocked('migration')).toBe(false);
    expect(v1MutationIsBlocked('import')).toBe(false);
  });

  test('classifies only v1 sources as migration-required', () => {
    expect(isV1Database(definition(1))).toBe(true);
    expect(isV1Database(definition(2))).toBe(false);
    expect(v1MigrationRequiredMessage('The selected source')).toContain('v1→v2');
    expect(v1MigrationRequiredMessage('The selected source')).not.toContain('/Users/');
  });
});
