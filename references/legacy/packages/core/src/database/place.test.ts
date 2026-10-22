import { describe, expect, test } from 'bun:test';
import {
  canonicalizeDatabasePlaceValue,
  DatabasePlaceValueSchema,
  databasePlaceSearchText,
  serializeDatabasePlaceValue,
} from './place.ts';
import { queryDatabaseRecords } from './query.ts';
import type { DatabaseRecord } from './record.ts';
import { DatabasePropertySchema, DatabaseSourceSchema } from './schema.ts';

describe('Database Place', () => {
  test('requires a label or address and provider provenance for searched places', () => {
    expect(
      DatabasePlaceValueSchema.safeParse({
        label: '',
        address: '',
        lat: 37.5,
        lon: 127,
        precision: 'exact',
        source: 'manual',
      }).success,
    ).toBe(false);
    expect(
      DatabasePlaceValueSchema.safeParse({
        label: 'Seoul',
        address: '',
        lat: 37.5,
        lon: 127,
        precision: 'exact',
        source: 'search',
      }).success,
    ).toBe(false);
  });

  test('physically removes hidden coordinate precision for approximate values', () => {
    const place = canonicalizeDatabasePlaceValue({
      label: 'Private meeting area',
      address: 'Jongno-gu, Seoul',
      lat: 37.5729381,
      lon: 126.9793579,
      precision: 'approximate',
      source: 'manual',
    });
    expect(place).toMatchObject({ lat: 37.57, lon: 126.98, precision: 'approximate' });
    expect(serializeDatabasePlaceValue(place)).not.toContain('572938');
  });

  test('defines fail-closed external lookup and map defaults', () => {
    expect(
      DatabasePropertySchema.parse({
        id: 'prop_place',
        key: 'place',
        name: 'Place',
        type: 'place',
      }),
    ).toMatchObject({ externalSearch: 'disabled', externalMap: 'disabled' });
  });

  test('filters and sorts by the stable label/address text projection', () => {
    const source = DatabaseSourceSchema.parse({
      id: 'ds_places',
      key: 'places',
      name: 'Places',
      recordMeaning: 'One place',
      folder: 'places',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        { id: 'prop_place', key: 'place', name: 'Place', type: 'place' },
      ],
    });
    const make = (id: string, label: string, address: string): DatabaseRecord => ({
      id,
      databaseId: 'db_places',
      sourceId: source.id,
      path: `places/${id}.md`,
      revision: `rev:${id}`,
      values: {
        prop_title: id,
        prop_place: canonicalizeDatabasePlaceValue({
          label,
          address,
          lat: 37.5,
          lon: 127,
          source: 'manual',
          precision: 'exact',
        }),
      },
      body: '',
    });
    const result = queryDatabaseRecords({
      source,
      records: [make('rec_b', 'Busan office', 'Busan'), make('rec_a', 'Seoul office', 'Jongno')],
      snapshotRevision: 'snapshot:places',
      query: {
        where: { propertyId: 'prop_place', operator: 'contains', value: 'jongno' },
        sort: [{ propertyId: 'prop_place', direction: 'asc' }],
      },
    });
    expect(result.records.map((record) => record.id)).toEqual(['rec_a']);
    expect(databasePlaceSearchText(result.records[0]?.values.prop_place as never)).toBe(
      'Seoul office · Jongno',
    );
  });
});
