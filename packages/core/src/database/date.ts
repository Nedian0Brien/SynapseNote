import { z } from 'zod';

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;

export function isDatabaseDateOnly(value: string): boolean {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isDatabaseDateTime(value: string): boolean {
  const match = DATE_TIME_RE.exec(value);
  if (!match) return false;
  if (!isDatabaseDateOnly(`${match[1]}-${match[2]}-${match[3]}`)) return false;
  const offset = match[8];
  if (offset !== 'Z' && /[+-]14:(?!00)/.test(offset)) return false;
  return Number.isFinite(Date.parse(value));
}

export function isDatabaseDatePoint(value: string): boolean {
  return isDatabaseDateOnly(value) || isDatabaseDateTime(value);
}

export function canonicalDatabaseTimeZone(value: string): string | null {
  if (/^[+-]\d{2}:\d{2}$/.test(value)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export const DatabaseDateReminderSchema = z
  .object({
    anchor: z.enum(['start', 'end']).default('start'),
    minutesBefore: z.number().int().min(0).max(525_600),
  })
  .strict();

export type DatabaseDateReminder = z.infer<typeof DatabaseDateReminderSchema>;

export const DatabaseDateRangeValueSchema = z
  .object({
    start: z.string().refine(isDatabaseDatePoint, 'start must be an ISO 8601 date or timestamp'),
    end: z
      .string()
      .refine(isDatabaseDatePoint, 'end must be an ISO 8601 date or timestamp')
      .optional(),
    timeZone: z
      .string()
      .min(1)
      .refine((value) => canonicalDatabaseTimeZone(value) !== null, 'timeZone must be an IANA zone')
      .optional(),
    reminder: DatabaseDateReminderSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.end === undefined && value.timeZone === undefined && value.reminder === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Use the compact ISO string form when no range, timezone, or reminder is present',
      });
    }
    if (value.end !== undefined) {
      const startIsDate = isDatabaseDateOnly(value.start);
      const endIsDate = isDatabaseDateOnly(value.end);
      if (startIsDate !== endIsDate) {
        ctx.addIssue({
          code: 'custom',
          path: ['end'],
          message: 'start and end must use the same date precision',
        });
      } else if (databaseDatePointEpoch(value.end) < databaseDatePointEpoch(value.start)) {
        ctx.addIssue({ code: 'custom', path: ['end'], message: 'end cannot be before start' });
      }
    }
    if (value.reminder?.anchor === 'end' && value.end === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['reminder', 'anchor'],
        message: 'An end-anchored reminder requires an end date',
      });
    }
    if (
      value.reminder !== undefined &&
      isDatabaseDateOnly(
        value.reminder.anchor === 'end' ? (value.end ?? value.start) : value.start,
      ) &&
      value.timeZone === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['timeZone'],
        message: 'An all-day reminder requires an IANA timezone',
      });
    }
  });

export type DatabaseDateRangeValue = z.infer<typeof DatabaseDateRangeValueSchema>;
export type DatabaseDateValue = string | DatabaseDateRangeValue;

export const DatabaseDateValueSchema: z.ZodType<DatabaseDateValue> = z.union([
  z.string().refine(isDatabaseDatePoint, 'Date must be an ISO 8601 date or timestamp'),
  DatabaseDateRangeValueSchema,
]);

export function canonicalizeDatabaseDateValue(value: unknown): DatabaseDateValue {
  const parsed = DatabaseDateValueSchema.parse(value);
  if (typeof parsed === 'string') return parsed;
  return {
    start: parsed.start,
    ...(parsed.end === undefined ? {} : { end: parsed.end }),
    ...(parsed.timeZone === undefined
      ? {}
      : { timeZone: canonicalDatabaseTimeZone(parsed.timeZone) ?? parsed.timeZone }),
    ...(parsed.reminder === undefined
      ? {}
      : {
          reminder: {
            anchor: parsed.reminder.anchor,
            minutesBefore: parsed.reminder.minutesBefore,
          },
        }),
  };
}

export function databaseDateStart(value: DatabaseDateValue): string {
  return typeof value === 'string' ? value : value.start;
}

export function databaseDateEnd(value: DatabaseDateValue): string {
  return typeof value === 'string' ? value : (value.end ?? value.start);
}

export function databaseDatePointEpoch(value: string): number {
  if (isDatabaseDateOnly(value)) return Date.parse(`${value}T00:00:00.000Z`);
  return Date.parse(value);
}

export function databaseDateStartEpoch(value: DatabaseDateValue): number {
  return databaseDatePointEpoch(databaseDateStart(value));
}

export function databaseDateEndEpoch(value: DatabaseDateValue): number {
  return databaseDatePointEpoch(databaseDateEnd(value));
}

export function serializeDatabaseDateValue(value: DatabaseDateValue): string {
  const canonical = canonicalizeDatabaseDateValue(value);
  return typeof canonical === 'string' ? canonical : JSON.stringify(canonical);
}

export function parseSerializedDatabaseDateValue(value: string): DatabaseDateValue {
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error('Date object must be valid JSON');
    }
    return canonicalizeDatabaseDateValue(parsed);
  }
  return canonicalizeDatabaseDateValue(trimmed);
}

function civilDateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function relativeUnit(milliseconds: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const absolute = Math.abs(milliseconds);
  if (absolute < 60_000) return { value: Math.round(milliseconds / 1_000), unit: 'second' };
  if (absolute < 3_600_000) return { value: Math.round(milliseconds / 60_000), unit: 'minute' };
  if (absolute < 86_400_000) return { value: Math.round(milliseconds / 3_600_000), unit: 'hour' };
  if (absolute < 2_592_000_000)
    return { value: Math.round(milliseconds / 86_400_000), unit: 'day' };
  if (absolute < 31_536_000_000)
    return { value: Math.round(milliseconds / 2_592_000_000), unit: 'month' };
  return { value: Math.round(milliseconds / 31_536_000_000), unit: 'year' };
}

export interface FormatDatabaseDateOptions {
  locale?: string;
  timeZone?: string;
  now?: Date;
  relative?: boolean;
}

export function formatDatabaseDateValue(
  value: DatabaseDateValue,
  options: FormatDatabaseDateOptions = {},
): string {
  const canonical = canonicalizeDatabaseDateValue(value);
  const start = databaseDateStart(canonical);
  const end = databaseDateEnd(canonical);
  const locale = options.locale ?? 'en';
  const timeZone =
    (typeof canonical === 'string' ? undefined : canonical.timeZone) ??
    options.timeZone ??
    databaseDatePointOffsetZone(start);
  if (options.relative) {
    const now = options.now ?? new Date();
    const difference = isDatabaseDateOnly(start)
      ? databaseDatePointEpoch(start) - databaseDatePointEpoch(civilDateInZone(now, timeZone))
      : databaseDatePointEpoch(start) - now.getTime();
    const relative = relativeUnit(difference);
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
      relative.value,
      relative.unit,
    );
  }
  const dateOnly = isDatabaseDateOnly(start);
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: dateOnly ? 'UTC' : timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' as const }),
  });
  const formattedStart = formatter.format(new Date(databaseDatePointEpoch(start)));
  if (end === start) return formattedStart;
  return `${formattedStart} – ${formatter.format(new Date(databaseDatePointEpoch(end)))}`;
}

function databaseDatePointOffsetZone(value: string): string {
  if (isDatabaseDateOnly(value) || value.endsWith('Z')) return 'UTC';
  return value.slice(-6);
}

export function databaseDateReminderAt(value: DatabaseDateRangeValue): number | null {
  if (!value.reminder) return null;
  const anchor = value.reminder.anchor === 'end' ? (value.end ?? value.start) : value.start;
  const anchorEpoch =
    isDatabaseDateOnly(anchor) && value.timeZone
      ? databaseDateOnlyEpochInZone(anchor, value.timeZone)
      : databaseDatePointEpoch(anchor);
  return anchorEpoch - value.reminder.minutesBefore * 60_000;
}

function zonedDateTimeParts(epoch: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(epoch));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}

export function databaseDateTimeToLocalInput(value: string, timeZone: string): string {
  if (!isDatabaseDateTime(value)) throw new Error('Date-time must include an explicit offset');
  const canonicalZone = canonicalDatabaseTimeZone(timeZone);
  if (!canonicalZone) throw new Error('Timezone must be a valid IANA zone');
  return zonedDateTimeParts(Date.parse(value), canonicalZone);
}

export function databaseLocalDateTimeToUtc(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (!match || !isDatabaseDateOnly(`${match[1]}-${match[2]}-${match[3]}`)) {
    throw new Error('Local date-time must use YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss');
  }
  const canonicalZone = canonicalDatabaseTimeZone(timeZone);
  if (!canonicalZone) throw new Error('Timezone must be a valid IANA zone');
  const local = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? '00'}`;
  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0),
  );
  const offsetAt = (epoch: number) =>
    Date.parse(`${zonedDateTimeParts(epoch, canonicalZone)}Z`) - epoch;
  const offsets = new Set<number>();
  for (const delta of [-86_400_000, -43_200_000, 0, 43_200_000, 86_400_000]) {
    offsets.add(offsetAt(target + delta));
  }
  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((epoch) => zonedDateTimeParts(epoch, canonicalZone) === local);
  if (candidates.length === 0) {
    throw new Error('Local date-time does not exist in the selected timezone');
  }
  return new Date(Math.min(...candidates)).toISOString();
}

function databaseDateOnlyEpochInZone(value: string, timeZone: string): number {
  const [year, month, day] = value.split('-').map(Number);
  const target = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const offsetAt = (epoch: number) => {
    const parts = formatter.formatToParts(new Date(epoch));
    const number = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);
    return (
      Date.UTC(
        number('year'),
        number('month') - 1,
        number('day'),
        number('hour'),
        number('minute'),
        number('second'),
      ) - epoch
    );
  };
  let epoch = target - offsetAt(target);
  epoch = target - offsetAt(epoch);
  return epoch;
}
