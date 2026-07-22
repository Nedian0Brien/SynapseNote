import { Trans } from '@lingui/react/macro';
import type {
  DatabaseDateValue,
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import {
  canonicalizeDatabaseDateValue,
  DatabaseDateValueSchema,
  databaseDateEnd,
  databaseDateStart,
  databaseDateTimeToLocalInput,
  databaseLocalDateTimeToUtc,
  formatDatabaseDateValue,
  isDatabaseDateOnly,
} from '@nedian0brien/synapsenote-core';
import { Braces, ChevronLeft, ChevronRight, ExternalLink, GripHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DatabaseCalendarChange {
  record: ProjectedDatabaseRecord;
  changes: Array<{ property: DatabaseProperty; value: DatabaseValue | undefined }>;
}

type CalendarDragKind = 'move' | 'resize-start' | 'resize-end';

const CALENDAR_COLORS = {
  gray: 'border-gray-500/40 bg-gray-500/15',
  brown: 'border-amber-900/40 bg-amber-900/15',
  orange: 'border-orange-500/40 bg-orange-500/15',
  yellow: 'border-yellow-500/40 bg-yellow-400/20',
  green: 'border-green-500/40 bg-green-500/15',
  blue: 'border-blue-500/40 bg-blue-500/15',
  purple: 'border-purple-500/40 bg-purple-500/15',
  pink: 'border-pink-500/40 bg-pink-500/15',
  red: 'border-red-500/40 bg-red-500/15',
} as const;

function dateValue(value: unknown): DatabaseDateValue | null {
  const parsed = DatabaseDateValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function dayKeyAtEpoch(epoch: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epoch));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dayKeyForPoint(point: string, timeZone: string): string {
  return isDatabaseDateOnly(point) ? point : dayKeyAtEpoch(Date.parse(point), timeZone);
}

function dayKeyEpoch(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`);
}

function shiftDayKey(dayKey: string, amount: number): string {
  return new Date(dayKeyEpoch(dayKey) + amount * 86_400_000).toISOString().slice(0, 10);
}

function daysBetween(left: string, right: string): number {
  return Math.round((dayKeyEpoch(right) - dayKeyEpoch(left)) / 86_400_000);
}

function movePointToDay(point: string, targetDay: string, timeZone: string): string {
  if (isDatabaseDateOnly(point)) return targetDay;
  const local = databaseDateTimeToLocalInput(point, timeZone);
  return databaseLocalDateTimeToUtc(`${targetDay}${local.slice(10)}`, timeZone);
}

function shiftPointByDays(point: string, amount: number, timeZone: string): string {
  return movePointToDay(point, shiftDayKey(dayKeyForPoint(point, timeZone), amount), timeZone);
}

export function moveDatabaseCalendarDateValue(
  value: DatabaseDateValue,
  targetDay: string,
  timeZone: string,
): DatabaseDateValue {
  const start = databaseDateStart(value);
  const amount = daysBetween(dayKeyForPoint(start, timeZone), targetDay);
  if (typeof value === 'string') return shiftPointByDays(value, amount, timeZone);
  return canonicalizeDatabaseDateValue({
    ...value,
    start: shiftPointByDays(value.start, amount, timeZone),
    ...(value.end ? { end: shiftPointByDays(value.end, amount, timeZone) } : {}),
  });
}

function resizeDateValue(
  value: DatabaseDateValue,
  kind: 'resize-start' | 'resize-end',
  targetDay: string,
  timeZone: string,
): DatabaseDateValue | null {
  const start = databaseDateStart(value);
  const end = databaseDateEnd(value);
  const nextStart = kind === 'resize-start' ? movePointToDay(start, targetDay, timeZone) : start;
  const nextEnd = kind === 'resize-end' ? movePointToDay(end, targetDay, timeZone) : end;
  if (
    dayKeyEpoch(dayKeyForPoint(nextEnd, timeZone)) <
    dayKeyEpoch(dayKeyForPoint(nextStart, timeZone))
  ) {
    return null;
  }
  if (nextStart === nextEnd && typeof value === 'string') return nextStart;
  return canonicalizeDatabaseDateValue({
    ...(typeof value === 'string' ? {} : value),
    start: nextStart,
    end: nextEnd,
  });
}

function calendarDays(input: {
  anchor: string;
  display: 'month' | 'week';
  weekStartsOn: 'sunday' | 'monday';
  showWeekends: boolean;
}): string[] {
  const anchor = new Date(`${input.anchor}T00:00:00.000Z`);
  const weekOffset = input.weekStartsOn === 'monday' ? 1 : 0;
  const start = new Date(anchor);
  if (input.display === 'month') start.setUTCDate(1);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() - weekOffset + 7) % 7));
  const count = input.display === 'week' ? 7 : 42;
  return Array.from({ length: count }, (_, index) =>
    new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10),
  ).filter((day) => {
    if (input.showWeekends) return true;
    const weekDay = new Date(`${day}T00:00:00.000Z`).getUTCDay();
    return weekDay !== 0 && weekDay !== 6;
  });
}

function recordDayKeys(
  record: ProjectedDatabaseRecord,
  propertyId: string,
  timeZone: string,
): string[] {
  const value = dateValue(record.values[propertyId]);
  if (!value) return [];
  const start = dayKeyForPoint(databaseDateStart(value), timeZone);
  const end = dayKeyForPoint(databaseDateEnd(value), timeZone);
  const count = Math.min(3_660, Math.max(0, daysBetween(start, end)) + 1);
  return Array.from({ length: count }, (_, index) => shiftDayKey(start, index));
}

function recordTitle(source: DatabaseSource, record: ProjectedDatabaseRecord): string {
  const title = source.properties.find((property) => property.type === 'title');
  return title ? String(record.values[title.id] ?? 'Untitled') : 'Untitled';
}

function propertyLabel(
  property: DatabaseProperty,
  value: DatabaseValue | undefined,
  people: readonly ProjectedDatabasePerson[],
  relationRecords: readonly ProjectedDatabaseRelationRecord[],
): string {
  if (value === undefined || value === null || value === '') return '—';
  if (property.type === 'date') {
    const parsed = dateValue(value);
    return parsed ? formatDatabaseDateValue(parsed) : 'Invalid date';
  }
  if (
    property.type === 'select' ||
    property.type === 'multi_select' ||
    property.type === 'status'
  ) {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => property.options.find((option) => option.id === item)?.name ?? String(item))
      .join(', ');
  }
  if (property.type === 'person') {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => people.find((person) => person.id === item)?.name ?? String(item))
      .join(', ');
  }
  if (property.type === 'relation') {
    const values = Array.isArray(value) ? value : [value];
    return values
      .map((item) => relationRecords.find((record) => record.id === item)?.title ?? String(item))
      .join(', ');
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DatabaseCalendar({
  source,
  view,
  result,
  people = result.people ?? [],
  relationRecords = result.relationRecords ?? [],
  mutationLocked = false,
  onOpen,
  onOpenContextInspector,
  onChange,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  result: DatabaseQueryResult;
  people?: readonly ProjectedDatabasePerson[];
  relationRecords?: readonly ProjectedDatabaseRelationRecord[];
  mutationLocked?: boolean;
  onOpen?: (record: ProjectedDatabaseRecord) => void;
  onOpenContextInspector?: (record: ProjectedDatabaseRecord) => void;
  onChange?: (change: DatabaseCalendarChange) => void;
}) {
  'use no memo';
  const calendarTimeZone =
    view.layout.type === 'calendar' ? view.layout.configuration.timeZone : 'UTC';
  const [anchor, setAnchor] = useState(() => dayKeyAtEpoch(Date.now(), calendarTimeZone));
  const [dragging, setDragging] = useState<{
    recordId: string;
    kind: CalendarDragKind;
  } | null>(null);
  if (view.layout.type !== 'calendar') return null;
  const configuration = view.layout.configuration;
  const dateProperty = source.properties.find(
    (property) => property.id === configuration.datePropertyId,
  );
  if (!dateProperty || dateProperty.type !== 'date') {
    return (
      <div
        className="rounded border border-destructive/30 p-4 text-destructive text-sm"
        role="alert"
      >
        <Trans>This Calendar view has an invalid Date mapping.</Trans>
      </div>
    );
  }
  const days = calendarDays({
    anchor,
    display: configuration.display,
    weekStartsOn: configuration.weekStartsOn,
    showWeekends: configuration.showWeekends,
  });
  const today = dayKeyAtEpoch(Date.now(), configuration.timeZone);
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const cardProperties = view.projection.propertyIds
    .map((propertyId) => source.properties.find((property) => property.id === propertyId))
    .filter(
      (property): property is DatabaseProperty =>
        property !== undefined &&
        property.id !== titleProperty?.id &&
        property.id !== dateProperty.id,
    )
    .slice(0, 2);
  const rules = new Map((result.conditionalColors?.rules ?? []).map((rule) => [rule.id, rule]));
  const recordsByDay = new Map<string, ProjectedDatabaseRecord[]>();
  const unscheduled: ProjectedDatabaseRecord[] = [];
  for (const record of result.records) {
    const keys = recordDayKeys(record, dateProperty.id, configuration.timeZone);
    if (keys.length === 0) unscheduled.push(record);
    for (const key of keys) {
      const records = recordsByDay.get(key) ?? [];
      records.push(record);
      recordsByDay.set(key, records);
    }
  }

  const emitChange = (
    record: ProjectedDatabaseRecord,
    kind: CalendarDragKind,
    targetDay: string,
  ) => {
    if (!onChange || mutationLocked) return;
    const current = dateValue(record.values[dateProperty.id]);
    if (!current) return;
    const next =
      kind === 'move'
        ? moveDatabaseCalendarDateValue(current, targetDay, configuration.timeZone)
        : resizeDateValue(current, kind, targetDay, configuration.timeZone);
    if (!next) return;
    onChange({ record, changes: [{ property: dateProperty, value: next }] });
  };

  const moveAnchor = (amount: number) => {
    const date = new Date(`${anchor}T00:00:00.000Z`);
    if (configuration.display === 'month') {
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + amount);
    } else date.setUTCDate(date.getUTCDate() + amount * 7);
    setAnchor(date.toISOString().slice(0, 10));
  };
  const weekdayCount = configuration.showWeekends ? 7 : 5;

  return (
    <section className="space-y-3" aria-label={`${view.name} Calendar`} data-database-calendar>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>
          {new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'long',
            timeZone: 'UTC',
          }).format(new Date(`${anchor}T00:00:00.000Z`))}
        </strong>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Previous ${configuration.display}`}
            onClick={() => moveAnchor(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAnchor(today)}>
            <Trans>Today</Trans>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={`Next ${configuration.display}`}
            onClick={() => moveAnchor(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div
        className="grid overflow-hidden rounded-lg border"
        style={{ gridTemplateColumns: `repeat(${weekdayCount}, minmax(0, 1fr))` }}
      >
        {days.slice(0, weekdayCount).map((day) => (
          <div key={`heading:${day}`} className="border-b bg-muted/40 p-2 text-center text-xs">
            {new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(
              new Date(`${day}T00:00:00.000Z`),
            )}
          </div>
        ))}
        {days.map((day) => {
          const dayRecords = recordsByDay.get(day) ?? [];
          const shown = dayRecords.slice(0, configuration.cardLimitPerDay);
          const inAnchorMonth = day.slice(0, 7) === anchor.slice(0, 7);
          return (
            <fieldset
              key={day}
              className={cn(
                'min-h-32 space-y-1 border-b border-r p-1.5',
                !inAnchorMonth &&
                  configuration.display === 'month' &&
                  'bg-muted/20 text-muted-foreground',
                day === today && 'ring-1 ring-primary ring-inset',
              )}
              aria-label={day}
              data-calendar-day={day}
              onDragOver={(event) => {
                if (dragging && !mutationLocked) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const active = dragging;
                setDragging(null);
                const record = result.records.find(
                  (candidate) => candidate.id === active?.recordId,
                );
                if (active && record) emitChange(record, active.kind, day);
              }}
            >
              <legend className="px-1 font-medium text-xs">{Number(day.slice(-2))}</legend>
              {shown.map((record) => {
                const value = dateValue(record.values[dateProperty.id]);
                if (!value) return null;
                const recordDays = recordDayKeys(record, dateProperty.id, configuration.timeZone);
                const isStart = recordDays[0] === day;
                const isEnd = recordDays.at(-1) === day;
                const ruleId = result.conditionalColors?.records[record.id]?.pageRuleId;
                const rule = ruleId ? rules.get(ruleId) : undefined;
                return (
                  <article
                    key={record.id}
                    className={cn(
                      'rounded border bg-background p-1 text-xs shadow-sm',
                      rule ? CALENDAR_COLORS[rule.color] : undefined,
                    )}
                    draggable={!mutationLocked && !!onChange}
                    data-calendar-card={record.id}
                    data-calendar-span={`${isStart ? 'start' : 'middle'}:${isEnd ? 'end' : 'middle'}`}
                    data-conditional-color={rule?.color}
                    onDragStart={() => setDragging({ recordId: record.id, kind: 'move' })}
                    onDragEnd={() => setDragging(null)}
                  >
                    <div className="flex items-center gap-1">
                      {isStart ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          draggable={!mutationLocked && !!onChange}
                          aria-label={`Resize start for ${record.id}`}
                          onClick={() => emitChange(record, 'resize-start', shiftDayKey(day, -1))}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            setDragging({ recordId: record.id, kind: 'resize-start' });
                          }}
                        >
                          <GripHorizontal />
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto min-w-0 flex-1 justify-start truncate p-0 text-xs"
                        onClick={() => onOpen?.(record)}
                      >
                        {recordTitle(source, record)}
                      </Button>
                      {onOpen ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Open record ${record.id}`}
                          onClick={() => onOpen(record)}
                        >
                          <ExternalLink />
                        </Button>
                      ) : null}
                      {onOpenContextInspector ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Inspect context for record ${record.id}`}
                          disabled={mutationLocked}
                          onClick={() => onOpenContextInspector(record)}
                        >
                          <Braces aria-hidden="true" />
                        </Button>
                      ) : null}
                      {isEnd ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          draggable={!mutationLocked && !!onChange}
                          aria-label={`Resize end for ${record.id}`}
                          onClick={() => emitChange(record, 'resize-end', shiftDayKey(day, 1))}
                          onDragStart={(event) => {
                            event.stopPropagation();
                            setDragging({ recordId: record.id, kind: 'resize-end' });
                          }}
                        >
                          <GripHorizontal />
                        </Button>
                      ) : null}
                    </div>
                    {isStart
                      ? cardProperties.map((property) => (
                          <div key={property.id} className="flex gap-1 text-[0.7rem]">
                            <span className="text-muted-foreground">{property.name}</span>
                            <span className="ml-auto min-w-0 truncate">
                              {propertyLabel(
                                property,
                                record.values[property.id],
                                people,
                                relationRecords,
                              )}
                            </span>
                          </div>
                        ))
                      : null}
                  </article>
                );
              })}
              {dayRecords.length > shown.length ? (
                <p className="text-muted-foreground text-xs">
                  +{dayRecords.length - shown.length} more
                </p>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      {unscheduled.length > 0 ? (
        <p className="text-muted-foreground text-xs" role="status">
          {unscheduled.length} records have no {dateProperty.name} date.
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {configuration.timeZone} · {configuration.display} view
      </p>
    </section>
  );
}
