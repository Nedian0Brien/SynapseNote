import type { DatabaseDateValue } from '@nedian0brien/synapsenote-core';
import {
  canonicalDatabaseTimeZone,
  canonicalizeDatabaseDateValue,
  databaseDateEnd,
  databaseDateStart,
  databaseDateTimeToLocalInput,
  databaseLocalDateTimeToUtc,
  isDatabaseDateOnly,
} from '@nedian0brien/synapsenote-core';

export interface DatabaseDateEditorState {
  start: string;
  hasTime: boolean;
  endEnabled: boolean;
  end: string;
  timeZone: string;
  timeZoneExplicit: boolean;
  reminderEnabled: boolean;
  reminderAnchor: 'start' | 'end';
  reminderMinutesBefore: string;
}

export function createDatabaseDateEditorState(
  value: DatabaseDateValue,
  fallbackTimeZone: string,
): DatabaseDateEditorState {
  const canonical = canonicalizeDatabaseDateValue(value);
  const start = databaseDateStart(canonical);
  const end = databaseDateEnd(canonical);
  const object = typeof canonical === 'string' ? null : canonical;
  const timeZone =
    object?.timeZone ?? canonicalDatabaseTimeZone(fallbackTimeZone) ?? fallbackTimeZone;
  const hasTime = !isDatabaseDateOnly(start);
  return {
    start: hasTime ? databaseDateTimeToLocalInput(start, timeZone) : start,
    hasTime,
    endEnabled: object?.end !== undefined,
    end: hasTime ? databaseDateTimeToLocalInput(end, timeZone) : end,
    timeZone,
    timeZoneExplicit: object?.timeZone !== undefined,
    reminderEnabled: object?.reminder !== undefined,
    reminderAnchor: object?.reminder?.anchor ?? 'start',
    reminderMinutesBefore: String(object?.reminder?.minutesBefore ?? 30),
  };
}

export function databaseDateEditorValue(state: DatabaseDateEditorState): DatabaseDateValue {
  const start = state.hasTime
    ? databaseLocalDateTimeToUtc(state.start, state.timeZone)
    : state.start;
  const end = state.endEnabled
    ? state.hasTime
      ? databaseLocalDateTimeToUtc(state.end, state.timeZone)
      : state.end
    : undefined;
  const reminderMinutes = Number(state.reminderMinutesBefore);
  return canonicalizeDatabaseDateValue(
    end === undefined && !state.hasTime && !state.reminderEnabled && !state.timeZoneExplicit
      ? start
      : {
          start,
          ...(end === undefined ? {} : { end }),
          ...(state.hasTime || state.reminderEnabled || state.timeZoneExplicit
            ? { timeZone: state.timeZone }
            : {}),
          ...(state.reminderEnabled
            ? {
                reminder: {
                  anchor: state.reminderAnchor,
                  minutesBefore: reminderMinutes,
                },
              }
            : {}),
        },
  );
}

export function setDatabaseDateEditorTimeMode(
  state: DatabaseDateEditorState,
  hasTime: boolean,
): DatabaseDateEditorState {
  if (state.hasTime === hasTime) return state;
  return {
    ...state,
    hasTime,
    timeZoneExplicit: state.timeZoneExplicit || hasTime,
    start: hasTime ? `${state.start.slice(0, 10)}T09:00:00` : state.start.slice(0, 10),
    end: hasTime ? `${state.end.slice(0, 10)}T09:00:00` : state.end.slice(0, 10),
  };
}
