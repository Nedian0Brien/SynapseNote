import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseDatabaseManifestYaml } from './manifest.ts';
import { DatabaseSourceSchema, DatabaseMarkdownOwnerStorageSchema } from './schema.ts';

const fixture = parseDatabaseManifestYaml(
  readFileSync(new URL('./fixtures/v1/database.yml', import.meta.url), 'utf8'),
);

if (!fixture.ok) throw new Error(fixture.error);

describe('DatabaseMarkdownOwnerStorageSchema', () => {
  test('accepts a v2 owner binding with the Title property first', () => {
    const source = fixture.definition.sources[0];
    const title = source.properties.find((property) => property.type === 'title');
    if (!title) throw new Error('fixture must have a title property');
    const storedPropertyIds = [title.id, source.properties[1]?.id].filter(
      (value): value is string => value !== undefined,
    );
    const storage = DatabaseMarkdownOwnerStorageSchema.parse({
      kind: 'markdown_table',
      formatVersion: 2,
      owner: { path: 'orders.md', blockId: 'dbb_orders_primary' },
      titlePropertyId: title.id,
      storedPropertyIds,
    });
    expect(storage.storedPropertyIds).toEqual(storedPropertyIds);
    expect(DatabaseSourceSchema.safeParse({ ...source, storage }).success).toBe(true);
  });

  test('rejects a v2 owner whose first column is not the source Title', () => {
    const source = fixture.definition.sources[0];
    const title = source.properties.find((property) => property.type === 'title');
    const other = source.properties.find((property) => property.type !== 'title');
    if (!title || !other) throw new Error('fixture must have scalar and title properties');
    const result = DatabaseSourceSchema.safeParse({
      ...source,
      storage: {
        kind: 'markdown_table',
        formatVersion: 2,
        owner: { path: 'orders.md', blockId: 'dbb_orders_primary' },
        titlePropertyId: title.id,
        storedPropertyIds: [other.id, title.id],
      },
    });
    expect(result.success).toBe(false);
  });

  test('rejects duplicate or unsafe owner metadata', () => {
    expect(
      DatabaseMarkdownOwnerStorageSchema.safeParse({
        kind: 'markdown_table',
        formatVersion: 2,
        owner: { path: '../orders.md', blockId: 'dbb_orders_primary' },
        titlePropertyId: 'prop_title',
        storedPropertyIds: ['prop_title'],
      }).success,
    ).toBe(false);
    expect(
      DatabaseMarkdownOwnerStorageSchema.safeParse({
        kind: 'markdown_table',
        formatVersion: 2,
        owner: { path: 'orders.md', blockId: 'dbb_orders_primary' },
        titlePropertyId: 'prop_title',
        storedPropertyIds: ['prop_title', 'prop_title'],
      }).success,
    ).toBe(false);
  });

  test('rejects every derived or audit property from canonical stored columns', () => {
    const source = fixture.definition.sources[0];
    const title = source.properties.find((property) => property.type === 'title');
    if (!title) throw new Error('fixture must have a title property');
    const formula = {
      id: 'prop_formula',
      key: 'formula',
      name: 'Formula',
      type: 'formula' as const,
      source: '1',
      ast: {
        language: 'synapse-formula-1' as const,
        version: 1 as const,
        resultType: 'number' as const,
        expression: { type: 'literal' as const, valueType: 'number' as const, value: 1 },
      },
    };
    const result = DatabaseSourceSchema.safeParse({
      ...source,
      properties: [...source.properties, formula],
      storage: {
        kind: 'markdown_table',
        formatVersion: 2,
        owner: { path: 'orders.md', blockId: 'dbb_orders_primary' },
        titlePropertyId: title.id,
        storedPropertyIds: [title.id, formula.id],
      },
    });
    expect(result.success).toBe(false);
  });
});
