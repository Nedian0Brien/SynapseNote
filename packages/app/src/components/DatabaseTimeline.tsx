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
  databaseDateEndEpoch,
  databaseDateStart,
  databaseDateStartEpoch,
  formatDatabaseDateValue,
  isDatabaseDateOnly,
} from '@nedian0brien/synapsenote-core';
import { Braces, ExternalLink, GripHorizontal, MoveLeft, MoveRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DatabaseTimelineChange {
  record: ProjectedDatabaseRecord;
  changes: Array<{ property: DatabaseProperty; value: DatabaseValue | undefined }>;
}

type TimelineScale = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
type TimelineDragKind = 'move' | 'resize-start' | 'resize-end';

interface TimelineSpan {
  start: number;
  end: number;
  startPoint: string;
  endPoint: string;
}

interface TimelineLane {
  key: string;
  label: string;
  recordIds: Set<string>;
}

const TIMELINE_COLORS = {
  gray: 'bg-gray-500 text-white',
  brown: 'bg-amber-900 text-white',
  orange: 'bg-orange-500 text-white',
  yellow: 'bg-yellow-400 text-black',
  green: 'bg-green-600 text-white',
  blue: 'bg-blue-600 text-white',
  purple: 'bg-purple-600 text-white',
  pink: 'bg-pink-600 text-white',
  red: 'bg-red-600 text-white',
} as const;

function dateValue(value: unknown): DatabaseDateValue | null {
  const parsed = DatabaseDateValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function recordSpan(
  record: ProjectedDatabaseRecord,
  configuration: Extract<DatabaseView['layout'], { type: 'timeline' }>['configuration'],
): TimelineSpan | null {
  const mapping = configuration.dateMapping;
  if (mapping.type === 'range') {
    const value = dateValue(record.values[mapping.propertyId]);
    if (!value) return null;
    return {
      start: databaseDateStartEpoch(value),
      end: databaseDateEndEpoch(value),
      startPoint: databaseDateStart(value),
      endPoint: databaseDateEnd(value),
    };
  }
  const startValue = dateValue(record.values[mapping.startPropertyId]);
  if (!startValue) return null;
  const endValue = dateValue(record.values[mapping.endPropertyId]);
  return {
    start: databaseDateStartEpoch(startValue),
    end: endValue ? databaseDateEndEpoch(endValue) : databaseDateStartEpoch(startValue),
    startPoint: databaseDateStart(startValue),
    endPoint: endValue ? databaseDateEnd(endValue) : databaseDateStart(startValue),
  };
}

function shiftPoint(point: string, amount: number): string {
  const shifted = new Date(
    Date.parse(isDatabaseDateOnly(point) ? `${point}T00:00:00.000Z` : point),
  );
  shifted.setTime(shifted.getTime() + amount);
  return isDatabaseDateOnly(point) ? shifted.toISOString().slice(0, 10) : shifted.toISOString();
}

function shiftDateValue(value: DatabaseDateValue, amount: number): DatabaseDateValue {
  if (typeof value === 'string') return shiftPoint(value, amount);
  return canonicalizeDatabaseDateValue({
    ...value,
    start: shiftPoint(value.start, amount),
    ...(value.end ? { end: shiftPoint(value.end, amount) } : {}),
  });
}

function pointAt(epoch: number, template: string): string {
  const date = new Date(epoch);
  return isDatabaseDateOnly(template) ? date.toISOString().slice(0, 10) : date.toISOString();
}

function localToday(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resizedRangeValue(
  value: DatabaseDateValue,
  start: string,
  end: string,
): DatabaseDateValue {
  if (start === end && typeof value === 'string') return start;
  const base = typeof value === 'string' ? {} : value;
  return canonicalizeDatabaseDateValue({ ...base, start, end });
}

function floorScale(epoch: number, scale: TimelineScale): number {
  const date = new Date(epoch);
  if (scale === 'hour') date.setUTCMinutes(0, 0, 0);
  else {
    date.setUTCHours(0, 0, 0, 0);
    if (scale === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    if (scale === 'month' || scale === 'quarter' || scale === 'year') date.setUTCDate(1);
    if (scale === 'quarter') date.setUTCMonth(Math.floor(date.getUTCMonth() / 3) * 3);
    if (scale === 'year') date.setUTCMonth(0);
  }
  return date.getTime();
}

function addScale(epoch: number, scale: TimelineScale, amount: number): number {
  const date = new Date(epoch);
  if (scale === 'hour') date.setUTCHours(date.getUTCHours() + amount);
  if (scale === 'day') date.setUTCDate(date.getUTCDate() + amount);
  if (scale === 'week') date.setUTCDate(date.getUTCDate() + amount * 7);
  if (scale === 'month' || scale === 'quarter' || scale === 'year') {
    const originalDay = date.getUTCDate();
    date.setUTCDate(1);
    if (scale === 'month') date.setUTCMonth(date.getUTCMonth() + amount);
    if (scale === 'quarter') date.setUTCMonth(date.getUTCMonth() + amount * 3);
    if (scale === 'year') date.setUTCFullYear(date.getUTCFullYear() + amount);
    const daysInTargetMonth = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  }
  return date.getTime();
}

function scaleLabel(epoch: number, scale: TimelineScale): string {
  const date = new Date(epoch);
  if (scale === 'hour')
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  if (scale === 'year') return String(date.getUTCFullYear());
  if (scale === 'month' || scale === 'quarter')
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(date);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function groupLabel(
  property: DatabaseProperty,
  value: DatabaseValue | null,
  people: readonly ProjectedDatabasePerson[],
  relationRecords: readonly ProjectedDatabaseRelationRecord[],
): string {
  if (value === null || value === '') return `No ${property.name}`;
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
  if (
    property.type === 'person' ||
    property.type === 'created_by' ||
    property.type === 'last_edited_by'
  ) {
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
  return String(value);
}

function timelineLanes(input: {
  view: DatabaseView;
  source: DatabaseSource;
  result: DatabaseQueryResult;
  people: readonly ProjectedDatabasePerson[];
  relationRecords: readonly ProjectedDatabaseRelationRecord[];
}): TimelineLane[] {
  if (input.view.groups.length === 0) {
    return [
      {
        key: '__all__',
        label: '',
        recordIds: new Set(input.result.records.map((record) => record.id)),
      },
    ];
  }
  const lanes = new Map<string, TimelineLane>();
  for (const record of input.result.records) {
    const memberships = input.result.groupMemberships?.[record.id] ?? [];
    for (const membership of memberships) {
      const labels = membership.map((part, index) => {
        const property = input.source.properties.find(
          (candidate) => candidate.id === part.propertyId,
        );
        return property
          ? groupLabel(property, part.value, input.people, input.relationRecords)
          : (input.view.groups[index]?.propertyId ?? 'Unknown group');
      });
      const key = JSON.stringify(membership.map((part) => part.value));
      const lane = lanes.get(key) ?? {
        key,
        label: labels.join(' / '),
        recordIds: new Set<string>(),
      };
      lane.recordIds.add(record.id);
      lanes.set(key, lane);
    }
  }
  return lanes.size > 0
    ? [...lanes.values()]
    : [
        {
          key: '__ungrouped__',
          label: 'Ungrouped',
          recordIds: new Set(input.result.records.map((record) => record.id)),
        },
      ];
}

function titleForRecord(source: DatabaseSource, record: ProjectedDatabaseRecord): string {
  const title = source.properties.find((property) => property.type === 'title');
  return title ? String(record.values[title.id] ?? 'Untitled') : 'Untitled';
}

function projectedValue(
  property: DatabaseProperty,
  value: DatabaseValue | undefined,
  people: readonly ProjectedDatabasePerson[],
  relationRecords: readonly ProjectedDatabaseRelationRecord[],
): string {
  if (value === undefined || value === null || value === '') return '—';
  if (property.type === 'date') {
    const date = dateValue(value);
    return date ? formatDatabaseDateValue(date) : 'Invalid date';
  }
  if (typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
  return groupLabel(property, value, people, relationRecords);
}

export function DatabaseTimeline({
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
  onChange?: (change: DatabaseTimelineChange) => void;
}) {
  'use no memo';
  const [dragging, setDragging] = useState<{
    recordId: string;
    kind: TimelineDragKind;
  } | null>(null);
  if (view.layout.type !== 'timeline') return null;
  const configuration = view.layout.configuration;
  const spans = new Map(
    result.records.flatMap((record) => {
      const span = recordSpan(record, configuration);
      return span ? [[record.id, span] as const] : [];
    }),
  );
  const scheduled = result.records.filter((record) => spans.has(record.id));
  const unscheduled = result.records.filter((record) => !spans.has(record.id));
  const now = Date.now();
  const bounds = [...spans.values()].flatMap((span) => [span.start, span.end]);
  const first = floorScale(Math.min(now, ...bounds), configuration.scale);
  const last = floorScale(Math.max(now, ...bounds), configuration.scale);
  const windowStart = addScale(first, configuration.scale, -1);
  const desiredEnd = addScale(last, configuration.scale, 2);
  const columns: number[] = [];
  for (
    let epoch = windowStart;
    epoch < desiredEnd && columns.length < 120;
    epoch = addScale(epoch, configuration.scale, 1)
  ) {
    columns.push(epoch);
  }
  if (columns.length < 2) columns.push(addScale(windowStart, configuration.scale, 1));
  const windowEnd = addScale(columns.at(-1) ?? windowStart, configuration.scale, 1);
  const columnFor = (epoch: number) => {
    const exact = columns.findIndex(
      (column, index) => epoch >= column && epoch < (columns[index + 1] ?? windowEnd),
    );
    return Math.max(0, exact < 0 ? (epoch < windowStart ? 0 : columns.length - 1) : exact);
  };
  const lanes = timelineLanes({ view, source, result, people, relationRecords });
  const mapping = configuration.dateMapping;
  const dateProperties =
    mapping.type === 'range'
      ? [source.properties.find((property) => property.id === mapping.propertyId)]
      : [
          source.properties.find((property) => property.id === mapping.startPropertyId),
          source.properties.find((property) => property.id === mapping.endPropertyId),
        ];
  if (dateProperties.some((property) => !property || property.type !== 'date')) {
    return (
      <div
        className="rounded border border-destructive/30 p-4 text-destructive text-sm"
        role="alert"
      >
        <Trans>This Timeline view has an invalid Date mapping.</Trans>
      </div>
    );
  }
  const titleProperty = source.properties.find((property) => property.type === 'title');
  const tableProperties = view.projection.propertyIds
    .map((propertyId) => source.properties.find((property) => property.id === propertyId))
    .filter(
      (property): property is DatabaseProperty =>
        property !== undefined &&
        property.id !== titleProperty?.id &&
        !dateProperties.some((dateProperty) => dateProperty?.id === property.id),
    )
    .slice(0, 2);
  const conditionalRules = new Map(
    (result.conditionalColors?.rules ?? []).map((rule) => [rule.id, rule]),
  );
  const emitChange = (
    record: ProjectedDatabaseRecord,
    kind: TimelineDragKind,
    targetEpoch: number,
  ) => {
    const span = spans.get(record.id);
    if (!span || !onChange || mutationLocked) return;
    if (kind === 'resize-start' && targetEpoch > span.end) return;
    if (kind === 'resize-end' && targetEpoch < span.start) return;
    const changes: DatabaseTimelineChange['changes'] = [];
    if (mapping.type === 'range') {
      const property = dateProperties[0];
      if (!property) return;
      const current = dateValue(record.values[mapping.propertyId]);
      if (!current) return;
      if (kind === 'move') {
        changes.push({ property, value: shiftDateValue(current, targetEpoch - span.start) });
      } else {
        const nextStart =
          kind === 'resize-start' ? pointAt(targetEpoch, span.startPoint) : span.startPoint;
        const nextEnd = kind === 'resize-end' ? pointAt(targetEpoch, span.endPoint) : span.endPoint;
        changes.push({ property, value: resizedRangeValue(current, nextStart, nextEnd) });
      }
    } else {
      const startProperty = dateProperties[0];
      const endProperty = dateProperties[1];
      if (!startProperty || !endProperty) return;
      const currentStart = dateValue(record.values[mapping.startPropertyId]);
      const currentEnd = dateValue(record.values[mapping.endPropertyId]);
      if (!currentStart) return;
      if (kind === 'move') {
        const amount = targetEpoch - span.start;
        changes.push({ property: startProperty, value: shiftDateValue(currentStart, amount) });
        if (currentEnd)
          changes.push({ property: endProperty, value: shiftDateValue(currentEnd, amount) });
      } else if (kind === 'resize-start') {
        changes.push({ property: startProperty, value: pointAt(targetEpoch, span.startPoint) });
      } else {
        changes.push({ property: endProperty, value: pointAt(targetEpoch, span.endPoint) });
      }
    }
    onChange({ record, changes });
  };

  const scheduleToday = (record: ProjectedDatabaseRecord) => {
    if (!onChange || mutationLocked) return;
    const today = localToday();
    if (mapping.type === 'range') {
      const property = dateProperties[0];
      if (property) onChange({ record, changes: [{ property, value: today }] });
    } else {
      const property = dateProperties[0];
      if (property) onChange({ record, changes: [{ property, value: today }] });
    }
  };

  const gridTemplateColumns = `repeat(${columns.length}, minmax(5rem, 1fr))`;
  const todayPosition = ((now - windowStart) / Math.max(1, windowEnd - windowStart)) * 100;

  return (
    <section className="space-y-3" aria-label={`${view.name} Timeline`} data-database-timeline>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {configuration.scale} · {scheduled.length} scheduled
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            document
              .querySelector<HTMLElement>('[data-timeline-today]')
              ?.scrollIntoView?.({ inline: 'center' });
          }}
        >
          <Trans>Today</Trans>
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-[56rem]">
          <div
            className={cn(
              'grid border-b bg-muted/40',
              configuration.showTable && 'grid-cols-[16rem_1fr]',
            )}
          >
            {configuration.showTable ? (
              <div className="border-r p-2 font-medium">Records</div>
            ) : null}
            <div className="grid" style={{ gridTemplateColumns }}>
              {columns.map((epoch) => (
                <Button
                  key={epoch}
                  type="button"
                  variant="ghost"
                  className="h-10 rounded-none border-r px-1 text-muted-foreground text-xs"
                  aria-label={`Move dragged timeline item to ${new Date(epoch).toISOString()}`}
                  onClick={() => {}}
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
                    if (active && record) emitChange(record, active.kind, epoch);
                  }}
                >
                  {scaleLabel(epoch, configuration.scale)}
                </Button>
              ))}
            </div>
          </div>
          {lanes.map((lane) => {
            const laneRecords = scheduled.filter((record) => lane.recordIds.has(record.id));
            return (
              <section key={lane.key} aria-label={lane.label || 'Timeline records'}>
                {lane.label ? (
                  <header className="border-b bg-muted/20 px-3 py-2 font-medium text-sm">
                    {lane.label}
                  </header>
                ) : null}
                {laneRecords.map((record) => {
                  const span = spans.get(record.id);
                  if (!span) return null;
                  const startColumn = columnFor(span.start);
                  const endColumn = Math.max(startColumn, columnFor(span.end));
                  const dependencies = configuration.dependencyPropertyId
                    ? record.values[configuration.dependencyPropertyId]
                    : undefined;
                  const dependencyIds = Array.isArray(dependencies)
                    ? dependencies.filter((value): value is string => typeof value === 'string')
                    : typeof dependencies === 'string'
                      ? [dependencies]
                      : [];
                  const pageRuleId = result.conditionalColors?.records[record.id]?.pageRuleId;
                  const pageRule = pageRuleId ? conditionalRules.get(pageRuleId) : undefined;
                  return (
                    <div
                      key={record.id}
                      className={cn(
                        'grid min-h-14 border-b',
                        configuration.showTable && 'grid-cols-[16rem_1fr]',
                      )}
                      data-timeline-record={record.id}
                    >
                      {configuration.showTable ? (
                        <div className="min-w-0 space-y-1 border-r p-2">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto min-w-0 flex-1 justify-start truncate p-0"
                              data-record-title-link={record.id}
                              onClick={() => onOpen?.(record)}
                            >
                              {titleForRecord(source, record)}
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
                          </div>
                          {tableProperties.map((property) => (
                            <div key={property.id} className="flex gap-2 text-xs">
                              <span className="text-muted-foreground">{property.name}</span>
                              <span className="ml-auto max-w-28 truncate">
                                {projectedValue(
                                  property,
                                  record.values[property.id],
                                  people,
                                  relationRecords,
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div
                        className="relative grid items-center px-1"
                        style={{ gridTemplateColumns }}
                      >
                        {configuration.showToday && todayPosition >= 0 && todayPosition <= 100 ? (
                          <span
                            className="pointer-events-none absolute inset-y-0 z-10 border-red-500 border-l"
                            style={{ left: `${todayPosition}%` }}
                            data-timeline-today
                          />
                        ) : null}
                        {configuration.showDependencies
                          ? dependencyIds.flatMap((dependencyId) => {
                              const dependency = spans.get(dependencyId);
                              if (!dependency) return [];
                              const from = columnFor(dependency.end);
                              const to = startColumn;
                              const left = (Math.min(from, to) / columns.length) * 100;
                              const width =
                                (Math.max(1, Math.abs(to - from)) / columns.length) * 100;
                              return [
                                <span
                                  key={dependencyId}
                                  className="pointer-events-none absolute top-1/2 z-0 border-blue-500/60 border-t"
                                  style={{ left: `${left}%`, width: `${width}%` }}
                                  data-timeline-dependency={`${dependencyId}:${record.id}`}
                                  title={`${dependencyId} precedes ${record.id}`}
                                >
                                  <span className="absolute -right-1 -top-2 text-blue-500">→</span>
                                </span>,
                              ];
                            })
                          : null}
                        <article
                          className={cn(
                            'z-20 flex h-9 items-center gap-1 overflow-hidden rounded bg-primary px-1 text-primary-foreground text-xs shadow-sm',
                            pageRule ? TIMELINE_COLORS[pageRule.color] : undefined,
                          )}
                          style={{ gridColumn: `${startColumn + 1} / ${endColumn + 2}` }}
                          draggable={!mutationLocked && !!onChange}
                          data-timeline-bar={record.id}
                          data-conditional-color={pageRule?.color}
                          onDragStart={() => setDragging({ recordId: record.id, kind: 'move' })}
                          onDragEnd={() => setDragging(null)}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-primary-foreground hover:text-primary"
                            draggable={!mutationLocked && !!onChange}
                            aria-label={`Resize start for ${record.id}`}
                            onClick={() =>
                              emitChange(
                                record,
                                'resize-start',
                                addScale(span.start, configuration.scale, -1),
                              )
                            }
                            onDragStart={(event) => {
                              event.stopPropagation();
                              setDragging({ recordId: record.id, kind: 'resize-start' });
                            }}
                          >
                            <GripHorizontal />
                          </Button>
                          {onOpen ? (
                            <Button
                              type="button"
                              variant="link"
                              className="h-auto min-w-0 flex-1 justify-start truncate p-0 text-primary-foreground hover:text-primary"
                              data-record-title-link={record.id}
                              onClick={() => onOpen(record)}
                            >
                              {titleForRecord(source, record)}
                            </Button>
                          ) : (
                            <span className="min-w-0 flex-1 truncate">
                              {titleForRecord(source, record)}
                            </span>
                          )}
                          {onOpenContextInspector ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className="text-primary-foreground hover:text-primary"
                              aria-label={`Inspect context for record ${record.id}`}
                              disabled={mutationLocked}
                              onClick={() => onOpenContextInspector(record)}
                            >
                              <Braces aria-hidden="true" />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-primary-foreground hover:text-primary"
                            aria-label={`Move ${record.id} earlier`}
                            onClick={() =>
                              emitChange(
                                record,
                                'move',
                                addScale(span.start, configuration.scale, -1),
                              )
                            }
                          >
                            <MoveLeft />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-primary-foreground hover:text-primary"
                            aria-label={`Move ${record.id} later`}
                            onClick={() =>
                              emitChange(
                                record,
                                'move',
                                addScale(span.start, configuration.scale, 1),
                              )
                            }
                          >
                            <MoveRight />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="text-primary-foreground hover:text-primary"
                            draggable={!mutationLocked && !!onChange}
                            aria-label={`Resize end for ${record.id}`}
                            onClick={() =>
                              emitChange(
                                record,
                                'resize-end',
                                addScale(span.end, configuration.scale, 1),
                              )
                            }
                            onDragStart={(event) => {
                              event.stopPropagation();
                              setDragging({ recordId: record.id, kind: 'resize-end' });
                            }}
                          >
                            <GripHorizontal />
                          </Button>
                        </article>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
          {configuration.noDateLane && unscheduled.length > 0 ? (
            <section aria-label="No date lane" data-timeline-no-date>
              <header className="border-b bg-muted/20 px-3 py-2 font-medium text-sm">
                <Trans>No date</Trans>
              </header>
              {unscheduled.map((record) => (
                <div key={record.id} className="flex min-h-12 items-center gap-2 border-b p-2">
                  {onOpen ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto min-w-0 flex-1 justify-start truncate p-0 text-left"
                      data-record-title-link={record.id}
                      onClick={() => onOpen(record)}
                    >
                      {titleForRecord(source, record)}
                    </Button>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">
                      {titleForRecord(source, record)}
                    </span>
                  )}
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mutationLocked || !onChange}
                    onClick={() => scheduleToday(record)}
                  >
                    <Trans>Schedule today</Trans>
                  </Button>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </div>
      {columns.length === 120 && desiredEnd > windowEnd ? (
        <p className="text-muted-foreground text-xs" role="status">
          <Trans>The visible Timeline window is limited to 120 intervals.</Trans>
        </p>
      ) : null}
    </section>
  );
}
