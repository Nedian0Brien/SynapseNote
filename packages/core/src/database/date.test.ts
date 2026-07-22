import { describe, expect, test } from 'bun:test';
import {
  canonicalizeDatabaseDateValue,
  DatabaseDateValueSchema,
  databaseDateReminderAt,
  databaseDateTimeToLocalInput,
  databaseLocalDateTimeToUtc,
  formatDatabaseDateValue,
  isDatabaseDateOnly,
  isDatabaseDateTime,
  parseSerializedDatabaseDateValue,
  serializeDatabaseDateValue,
} from './date.ts';
import { DatabaseSourceSchema } from './schema.ts';

describe('database date value contract', () => {
  test('accepts strict calendar dates and offset-bearing timestamps only', () => {
    expect(isDatabaseDateOnly('2028-02-29')).toBe(true);
    expect(isDatabaseDateOnly('2027-02-29')).toBe(false);
    expect(isDatabaseDateTime('2026-07-20T09:15:00+09:00')).toBe(true);
    expect(isDatabaseDateTime('2026-07-20T09:15:00')).toBe(false);
    expect(isDatabaseDateTime('2026-07-20T24:00:00Z')).toBe(false);
    expect(isDatabaseDateTime('2026-07-20T09:15:00+14:30')).toBe(false);
  });

  test('validates ranges, timezones, precision, and reminder anchors', () => {
    expect(
      DatabaseDateValueSchema.safeParse({
        start: '2026-07-20',
        end: '2026-07-22',
        timeZone: 'Asia/Seoul',
        reminder: { anchor: 'end', minutesBefore: 30 },
      }).success,
    ).toBe(true);
    expect(
      DatabaseDateValueSchema.safeParse({ start: '2026-07-22', end: '2026-07-20' }).success,
    ).toBe(false);
    expect(
      DatabaseDateValueSchema.safeParse({
        start: '2026-07-20',
        end: '2026-07-20T09:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      DatabaseDateValueSchema.safeParse({
        start: '2026-07-20T09:00:00+09:00',
        timeZone: '+09:00',
      }).success,
    ).toBe(false);
    expect(
      DatabaseDateValueSchema.safeParse({
        start: '2026-07-20',
        reminder: { anchor: 'start', minutesBefore: 10 },
      }).success,
    ).toBe(false);
    expect(
      DatabaseDateValueSchema.safeParse({
        start: '2026-07-20T09:00:00Z',
        reminder: { anchor: 'end', minutesBefore: 10 },
      }).success,
    ).toBe(false);
  });

  test('uses one stable locale-independent serialized representation', () => {
    const value = canonicalizeDatabaseDateValue({
      reminder: { minutesBefore: 60, anchor: 'start' },
      timeZone: 'Asia/Seoul',
      end: '2026-07-20T10:00:00+09:00',
      start: '2026-07-20T09:00:00+09:00',
    });
    const serialized = serializeDatabaseDateValue(value);
    expect(serialized).toBe(
      '{"start":"2026-07-20T09:00:00+09:00","end":"2026-07-20T10:00:00+09:00","timeZone":"Asia/Seoul","reminder":{"anchor":"start","minutesBefore":60}}',
    );
    expect(parseSerializedDatabaseDateValue(serialized)).toEqual(value);
    expect(serializeDatabaseDateValue('2026-07-20')).toBe('2026-07-20');
  });

  test('formats absolute and relative display with explicit locale and timezone', () => {
    expect(
      formatDatabaseDateValue('2026-07-21', {
        locale: 'en',
        timeZone: 'Asia/Seoul',
        now: new Date('2026-07-20T12:00:00Z'),
        relative: true,
      }),
    ).toBe('tomorrow');
    const range = formatDatabaseDateValue(
      { start: '2026-07-20', end: '2026-07-22', timeZone: 'Asia/Seoul' },
      { locale: 'en-US' },
    );
    expect(range).toContain('Jul 20, 2026');
    expect(range).toContain('Jul 22, 2026');
    expect(formatDatabaseDateValue('2026-07-20T09:00:00+09:00', { locale: 'en-US' })).toContain(
      '9:00 AM',
    );
  });

  test('resolves all-day reminders at local midnight instead of UTC midnight', () => {
    const reminderAt = databaseDateReminderAt({
      start: '2026-07-20',
      timeZone: 'Asia/Seoul',
      reminder: { anchor: 'start', minutesBefore: 30 },
    });
    expect(new Date(reminderAt ?? 0).toISOString()).toBe('2026-07-19T14:30:00.000Z');
  });

  test('round-trips local date-time controls through an explicit IANA timezone', () => {
    expect(databaseDateTimeToLocalInput('2026-07-20T00:00:00Z', 'Asia/Seoul')).toBe(
      '2026-07-20T09:00:00',
    );
    expect(databaseLocalDateTimeToUtc('2026-07-20T09:00', 'Asia/Seoul')).toBe(
      '2026-07-20T00:00:00.000Z',
    );
    expect(() => databaseLocalDateTimeToUtc('2026-03-08T02:30', 'America/New_York')).toThrow(
      'does not exist',
    );
    expect(databaseLocalDateTimeToUtc('2026-11-01T01:30', 'America/New_York')).toBe(
      '2026-11-01T05:30:00.000Z',
    );
  });

  test('admits canonical structured defaults in the manifest property contract', () => {
    const source = DatabaseSourceSchema.parse({
      id: 'ds_events',
      key: 'events',
      name: 'Events',
      recordMeaning: 'One event',
      folder: 'events',
      properties: [
        { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
        {
          id: 'prop_when',
          key: 'when',
          name: 'When',
          type: 'date',
          semantics: {
            constraints: { unique: false },
            inferencePolicy: 'explicit_only',
            sensitivity: 'inherit',
            defaultValue: {
              start: '2026-07-20',
              end: '2026-07-21',
              timeZone: 'Asia/Seoul',
            },
          },
        },
      ],
    });
    expect(source.properties[1]?.semantics.defaultValue).toEqual({
      start: '2026-07-20',
      end: '2026-07-21',
      timeZone: 'Asia/Seoul',
    });
  });
});
