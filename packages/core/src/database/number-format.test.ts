import { describe, expect, test } from 'bun:test';
import { formatDatabaseNumber } from './number-format.ts';
import { DatabasePropertySchema } from './schema.ts';

function property(style: string, options: Record<string, unknown>) {
  return DatabasePropertySchema.parse({
    id: 'prop_amount',
    key: 'amount',
    name: 'Amount',
    type: 'number',
    semantics: {
      constraints: { unique: false },
      inferencePolicy: 'explicit_only',
      sensitivity: 'inherit',
      format: { style, options },
    },
  });
}

describe('formatDatabaseNumber', () => {
  test('formats precision, grouping, and signed values without changing storage', () => {
    const number = property('decimal', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
      signDisplay: 'always',
    });
    expect(formatDatabaseNumber(1234.5, number, 'en-US')).toBe('+1,234.50');
    expect(formatDatabaseNumber(-1234.5, number, 'en-US')).toBe('-1,234.50');
  });

  test('formats percent, currency, standard units, and custom units', () => {
    expect(
      formatDatabaseNumber(0.125, property('percent', { maximumFractionDigits: 1 }), 'en-US'),
    ).toBe('12.5%');
    expect(
      formatDatabaseNumber(
        42,
        property('currency', { currency: 'USD', minimumFractionDigits: 2 }),
        'en-US',
      ),
    ).toBe('$42.00');
    expect(formatDatabaseNumber(3, property('unit', { unit: 'kilometer' }), 'en-US')).toBe('3 km');
    expect(
      formatDatabaseNumber(
        0.42,
        property('custom', { multiplier: 100, prefix: '≈', suffix: ' pts' }),
        'en-US',
      ),
    ).toBe('≈42 pts');
  });
});
