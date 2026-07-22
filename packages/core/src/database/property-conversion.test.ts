import { describe, expect, test } from 'bun:test';
import {
  DATABASE_PROPERTY_CONVERSION_MATRIX,
  previewDatabasePropertyConversion,
} from './property-conversion.ts';
import { DATABASE_PROPERTY_TYPES, DatabasePropertySchema } from './schema.ts';

describe('database property conversion matrix', () => {
  test('classifies every ordered v1 property-type pair explicitly', () => {
    expect(Object.keys(DATABASE_PROPERTY_CONVERSION_MATRIX).sort()).toEqual(
      [...DATABASE_PROPERTY_TYPES].sort(),
    );
    for (const from of DATABASE_PROPERTY_TYPES) {
      expect(Object.keys(DATABASE_PROPERTY_CONVERSION_MATRIX[from]).sort()).toEqual(
        [...DATABASE_PROPERTY_TYPES].sort(),
      );
      expect(DATABASE_PROPERTY_CONVERSION_MATRIX[from][from].kind).toBe('identity');
      expect(Object.isFrozen(DATABASE_PROPERTY_CONVERSION_MATRIX[from][from])).toBe(true);
    }
    expect(DATABASE_PROPERTY_CONVERSION_MATRIX.formula.text.kind).toBe('blocked');
    expect(DATABASE_PROPERTY_CONVERSION_MATRIX.place.text.kind).toBe('lossy');
    expect(DATABASE_PROPERTY_CONVERSION_MATRIX.text.place.kind).toBe('conditional');
  });

  test('previews conditional failures without partial conversion and retains exact rollback values', () => {
    const source = DatabasePropertySchema.parse({
      id: 'prop_value',
      key: 'value',
      name: 'Value',
      type: 'text',
    });
    const target = DatabasePropertySchema.parse({
      id: 'prop_value',
      key: 'value',
      name: 'Value',
      type: 'number',
      semantics: {
        constraints: { unique: false, min: 0, max: 10 },
        inferencePolicy: 'explicit_only',
        sensitivity: 'inherit',
      },
    });
    const preview = previewDatabasePropertyConversion({
      sourceProperty: source,
      targetProperty: target,
      records: [
        { id: 'rec_ok', revision: 'rev:1', value: '4.5' },
        { id: 'rec_bad', revision: 'rev:2', value: '1,000' },
        { id: 'rec_range', revision: 'rev:3', value: '11' },
      ],
    });
    expect(preview.committable).toBe(false);
    expect(preview.summary).toEqual({ total: 3, empty: 0, converted: 1, lossy: 0, blocked: 2 });
    expect(preview.changes[0]).toMatchObject({ outcome: 'converted', after: 4.5 });
    expect(preview.changes[1]).toMatchObject({
      outcome: 'blocked',
      reason: 'Value is not a canonical number',
    });
    expect(preview.rollbackValues).toEqual({ rec_ok: '4.5', rec_bad: '1,000', rec_range: '11' });
  });

  test('maps options by stable key and makes multi-to-single ambiguity explicit', () => {
    const source = DatabasePropertySchema.parse({
      id: 'prop_state',
      key: 'state',
      name: 'State',
      type: 'multi_select',
      options: [
        { id: 'opt_old_open', key: 'open', name: 'Open' },
        { id: 'opt_old_done', key: 'done', name: 'Done' },
      ],
    });
    const target = DatabasePropertySchema.parse({
      id: 'prop_state',
      key: 'state',
      name: 'State',
      type: 'select',
      options: [
        { id: 'opt_new_open', key: 'open', name: 'To do' },
        { id: 'opt_new_done', key: 'done', name: 'Complete' },
      ],
    });
    const preview = previewDatabasePropertyConversion({
      sourceProperty: source,
      targetProperty: target,
      records: [
        { id: 'rec_one', revision: 'rev:1', value: ['opt_old_open'] },
        { id: 'rec_many', revision: 'rev:2', value: ['opt_old_open', 'opt_old_done'] },
      ],
    });
    expect(preview.changes[0]).toMatchObject({ outcome: 'converted', after: 'opt_new_open' });
    expect(preview.changes[1]).toMatchObject({ outcome: 'blocked' });
  });

  test('marks structured flattening as lossy while preserving a reversible source snapshot', () => {
    const source = DatabasePropertySchema.parse({
      id: 'prop_place',
      key: 'place',
      name: 'Place',
      type: 'place',
    });
    const target = DatabasePropertySchema.parse({
      id: 'prop_place',
      key: 'place',
      name: 'Place',
      type: 'text',
    });
    const value = {
      label: 'City Hall',
      address: 'Seoul',
      lat: 37.57,
      lon: 126.98,
      precision: 'approximate',
      source: 'manual',
    };
    const preview = previewDatabasePropertyConversion({
      sourceProperty: source,
      targetProperty: target,
      records: [{ id: 'rec_place', revision: 'rev:1', value }],
    });
    expect(preview.committable).toBe(false);
    expect(preview.requiresLossyApproval).toBe(true);
    expect(preview.summary.lossy).toBe(1);
    expect(preview.changes[0]?.after).toBe(JSON.stringify(value));
    expect(preview.rollbackValues.rec_place).toEqual(value);
    expect(
      previewDatabasePropertyConversion({
        sourceProperty: source,
        targetProperty: target,
        records: [{ id: 'rec_place', revision: 'rev:1', value }],
        allowLossy: true,
      }).committable,
    ).toBe(true);
  });
});
