import { describe, expect, test } from 'bun:test';
import {
  databaseNumberVisualization,
  databaseNumberVisualizationProgress,
  formatDatabaseNumber,
} from './number-format.ts';
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
  test('provides stable visualization defaults and clamps progress to the configured scale', () => {
    const number = DatabasePropertySchema.parse({
      id: 'prop_score',
      key: 'score',
      name: 'Score',
      type: 'number',
    });
    expect(databaseNumberVisualization(number)).toEqual({
      style: 'number',
      color: 'green',
      denominator: 100,
      showValue: true,
    });
    expect(databaseNumberVisualizationProgress(24, 100)).toBe(0.24);
    expect(databaseNumberVisualizationProgress(-1, 100)).toBe(0);
    expect(databaseNumberVisualizationProgress(120, 100)).toBe(1);
  });

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
