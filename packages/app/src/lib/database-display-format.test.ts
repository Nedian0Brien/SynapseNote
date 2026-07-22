import { describe, expect, test } from 'bun:test';
import {
  compareDatabaseDisplayLabels,
  formatDatabaseCurrency,
  formatDatabaseDateTime,
  formatDatabaseNumber,
  formatDatabaseRelativeTime,
} from './database-display-format';

describe('database display localization', () => {
  test('formats the same canonical values for distinct display locales', () => {
    expect(formatDatabaseNumber(1234.5, undefined, 'en-US')).toBe('1,234.5');
    expect(formatDatabaseNumber(1234.5, undefined, 'de-DE')).toBe('1.234,5');
    expect(formatDatabaseCurrency(12.5, 'EUR', 'de-DE')).toContain('12,50');
    expect(
      formatDatabaseDateTime(
        '2026-07-21T00:00:00.000Z',
        { dateStyle: 'medium', timeZone: 'UTC' },
        'ko-KR',
      ),
    ).toContain('2026');
    expect(formatDatabaseRelativeTime(-1, 'day', 'en-US')).toBe('yesterday');
  });

  test('uses a locale collator only for presentation ordering', () => {
    expect(['Item 10', 'item 2'].sort((a, b) => compareDatabaseDisplayLabels(a, b, 'en'))).toEqual([
      'item 2',
      'Item 10',
    ]);
  });
});
