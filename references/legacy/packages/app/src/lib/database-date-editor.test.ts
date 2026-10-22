import { describe, expect, test } from 'bun:test';
import {
  createDatabaseDateEditorState,
  databaseDateEditorValue,
  setDatabaseDateEditorTimeMode,
} from './database-date-editor.ts';

describe('database date editor model', () => {
  test('keeps compact all-day dates compact', () => {
    const state = createDatabaseDateEditorState('2026-07-20', 'Asia/Seoul');
    expect(state).toMatchObject({ start: '2026-07-20', hasTime: false, endEnabled: false });
    expect(databaseDateEditorValue(state)).toBe('2026-07-20');
  });

  test('round-trips ranges, timezone, and reminders through local controls', () => {
    const value = {
      start: '2026-07-20T00:00:00Z',
      end: '2026-07-20T01:00:00Z',
      timeZone: 'Asia/Seoul',
      reminder: { anchor: 'end' as const, minutesBefore: 15 },
    };
    const state = createDatabaseDateEditorState(value, 'UTC');
    expect(state).toMatchObject({
      start: '2026-07-20T09:00:00',
      end: '2026-07-20T10:00:00',
      timeZone: 'Asia/Seoul',
      reminderAnchor: 'end',
      reminderMinutesBefore: '15',
    });
    expect(databaseDateEditorValue(state)).toEqual({
      ...value,
      start: '2026-07-20T00:00:00.000Z',
      end: '2026-07-20T01:00:00.000Z',
    });
  });

  test('preserves an explicit timezone on an all-day range', () => {
    const value = {
      start: '2026-07-20',
      end: '2026-07-22',
      timeZone: 'Asia/Seoul',
    };
    expect(databaseDateEditorValue(createDatabaseDateEditorState(value, 'UTC'))).toEqual(value);
  });

  test('switches precision explicitly and rejects invalid ranges and reminders', () => {
    const state = createDatabaseDateEditorState('2026-07-20', 'UTC');
    expect(setDatabaseDateEditorTimeMode(state, true).start).toBe('2026-07-20T09:00:00');
    expect(() =>
      databaseDateEditorValue({ ...state, endEnabled: true, end: '2026-07-19' }),
    ).toThrow('end cannot be before start');
    expect(() =>
      databaseDateEditorValue({
        ...state,
        reminderEnabled: true,
        reminderMinutesBefore: '-1',
      }),
    ).toThrow();
  });
});
