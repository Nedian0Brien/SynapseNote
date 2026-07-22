import { Trans } from '@lingui/react/macro';
import type {
  DatabaseAggregationGroup,
  DatabaseProperty,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseValue,
  DatabaseView,
  ProjectedDatabasePerson,
  ProjectedDatabaseRecord,
  ProjectedDatabaseRelationRecord,
} from '@nedian0brien/synapsenote-core';
import { Braces } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDatabaseNumber } from '@/lib/database-display-format';
import { cn } from '@/lib/utils';

const SERIES_CLASSES = [
  { fill: 'fill-chart-1', stroke: 'stroke-chart-1', background: 'bg-chart-1' },
  { fill: 'fill-chart-2', stroke: 'stroke-chart-2', background: 'bg-chart-2' },
  { fill: 'fill-chart-3', stroke: 'stroke-chart-3', background: 'bg-chart-3' },
  { fill: 'fill-chart-4', stroke: 'stroke-chart-4', background: 'bg-chart-4' },
  { fill: 'fill-chart-5', stroke: 'stroke-chart-5', background: 'bg-chart-5' },
] as const;

function propertyValueLabel(
  property: DatabaseProperty | undefined,
  value: DatabaseValue | null,
  people: readonly ProjectedDatabasePerson[],
  relationRecords: readonly ProjectedDatabaseRelationRecord[],
): string {
  if (value === null || value === '') return 'Empty';
  if (!property) return String(value);
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
  if (property.type === 'checkbox') return value === true ? 'Checked' : 'Unchecked';
  if (property.type === 'date' && typeof value === 'object' && !Array.isArray(value)) {
    return String('start' in value ? value.start : value);
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function calculationValue(group: DatabaseAggregationGroup): number {
  const value = group.calculations.find((item) => item.id === 'chart_measure')?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatMeasure(value: number, unit: string | undefined): string {
  if (unit === 'percentage') return `${formatDatabaseNumber(value, { maximumFractionDigits: 1 })}%`;
  return formatDatabaseNumber(value, { maximumFractionDigits: 2 });
}

function keyIdentity(key: DatabaseAggregationGroup['key']): string {
  return JSON.stringify(key);
}

function groupContainsRecord(
  result: DatabaseQueryResult,
  recordId: string,
  group: DatabaseAggregationGroup,
): boolean {
  if (group.key.length === 0) return true;
  const target = keyIdentity(group.key);
  return (result.groupMemberships?.[recordId] ?? []).some((membership) => {
    const comparable = membership.slice(0, group.key.length);
    return keyIdentity(comparable) === target;
  });
}

interface ChartPoint {
  category: string;
  series: string;
  value: number;
  group: DatabaseAggregationGroup;
}

export function DatabaseChart({
  source,
  view,
  result,
  people = result.people ?? [],
  relationRecords = result.relationRecords ?? [],
  onOpen,
  onOpenContextInspector,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  result: DatabaseQueryResult;
  people?: readonly ProjectedDatabasePerson[];
  relationRecords?: readonly ProjectedDatabaseRelationRecord[];
  onOpen?: (record: ProjectedDatabaseRecord) => void;
  onOpenContextInspector?: (record: ProjectedDatabaseRecord) => void;
}) {
  'use no memo';
  const chartDescriptionId = useId();
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(() => new Set());
  const [drillGroup, setDrillGroup] = useState<DatabaseAggregationGroup | null>(null);
  if (view.layout.type !== 'chart') return null;
  const configuration = view.layout.configuration;
  const aggregation = result.aggregation;
  const dimensionProperty = configuration.dimension
    ? source.properties.find((property) => property.id === configuration.dimension?.propertyId)
    : undefined;
  const seriesProperty = configuration.seriesPropertyId
    ? source.properties.find((property) => property.id === configuration.seriesPropertyId)
    : undefined;
  const measurePropertyId =
    configuration.measure.type === 'property' ? configuration.measure.propertyId : undefined;
  const measureProperty = measurePropertyId
    ? source.properties.find((property) => property.id === measurePropertyId)
    : undefined;
  const groupLevel = configuration.seriesPropertyId ? 2 : 1;
  const points: ChartPoint[] = (aggregation?.groups ?? [])
    .filter((group) => group.level === groupLevel)
    .map((group) => ({
      category: propertyValueLabel(
        dimensionProperty,
        group.key[0]?.value ?? null,
        people,
        relationRecords,
      ),
      series: configuration.seriesPropertyId
        ? propertyValueLabel(seriesProperty, group.key[1]?.value ?? null, people, relationRecords)
        : 'Records',
      value: calculationValue(group),
      group,
    }));
  const categories = [...new Set(points.map((point) => point.category))];
  const series = [...new Set(points.map((point) => point.series))];
  const visibleSeries = series.filter((item) => !hiddenSeries.has(item));
  const visiblePoints = points.filter((point) => !hiddenSeries.has(point.series));
  const measureUnit =
    aggregation?.groups
      .flatMap((group) => group.calculations)
      .find((calculation) => calculation.id === 'chart_measure')?.unit ??
    aggregation?.calculations.find((calculation) => calculation.id === 'chart_measure')?.unit;
  const measureName =
    configuration.measure.type === 'count'
      ? 'Record count'
      : `${configuration.measure.function.replaceAll('_', ' ')} of ${measureProperty?.name ?? configuration.measure.propertyId}`;
  const drillRecords = drillGroup
    ? result.records.filter((record) => groupContainsRecord(result, record.id, drillGroup))
    : [];
  const titleProperty = source.properties.find((property) => property.type === 'title');

  if (!aggregation) {
    return (
      <div
        className="rounded border border-destructive/30 p-4 text-destructive text-sm"
        role="alert"
      >
        <Trans>Chart aggregation is unavailable.</Trans>
      </div>
    );
  }
  if (aggregation.matched === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-muted-foreground text-sm">
        <Trans>No data matches this Chart view.</Trans>
      </div>
    );
  }

  const toggleSeries = (name: string) =>
    setHiddenSeries((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <section className="space-y-3" aria-label={`${view.name} Chart`} data-database-chart>
      {aggregation.truncatedBy === 'group_limit' ? (
        <p className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
          Showing {aggregation.returnedGroups.toLocaleString()} of{' '}
          {aggregation.totalGroups.toLocaleString()} groups.
        </p>
      ) : null}
      {configuration.chartType === 'number' ? (
        <Button
          type="button"
          variant="outline"
          className="flex min-h-56 w-full flex-col items-center justify-center rounded-xl bg-card p-8 text-card-foreground"
          onClick={() => {
            const synthetic: DatabaseAggregationGroup = {
              level: 1,
              key: [],
              matched: aggregation.matched,
              calculations: aggregation.calculations,
            };
            setDrillGroup(synthetic);
          }}
        >
          <span className="text-muted-foreground text-sm">{measureName}</span>
          <strong className="mt-2 text-5xl tabular-nums">
            {formatMeasure(
              Number(
                aggregation.calculations.find((item) => item.id === 'chart_measure')?.value ?? 0,
              ),
              measureUnit,
            )}
          </strong>
          <span className="mt-3 text-muted-foreground text-xs">Open drill-through</span>
        </Button>
      ) : points.length === 0 ? (
        <div className="rounded border border-dashed p-8 text-center text-muted-foreground text-sm">
          <Trans>No grouped values are available for this Chart.</Trans>
        </div>
      ) : configuration.chartType === 'donut' ? (
        <DonutChart
          points={visiblePoints}
          showLabels={configuration.showLabels}
          unit={measureUnit}
          onDrillThrough={setDrillGroup}
          descriptionId={chartDescriptionId}
        />
      ) : (
        <CartesianChart
          type={configuration.chartType}
          categories={categories}
          series={visibleSeries}
          points={visiblePoints}
          showLabels={configuration.showLabels}
          showAxisNames={configuration.showAxisNames}
          dimensionName={dimensionProperty?.name ?? 'Dimension'}
          measureName={measureName}
          unit={measureUnit}
          onDrillThrough={setDrillGroup}
          descriptionId={chartDescriptionId}
        />
      )}
      <p id={chartDescriptionId} className="sr-only">
        {measureName}.{' '}
        {visiblePoints.length === 0
          ? 'No chart values.'
          : visiblePoints
              .map(
                (point) =>
                  `${point.category}, ${point.series}: ${formatMeasure(point.value, measureUnit)}`,
              )
              .join('; ')}
      </p>
      {configuration.showLegend && series.length > 0 ? (
        <fieldset className="flex flex-wrap justify-center gap-2" aria-label="Chart legend">
          <legend className="sr-only">Chart legend</legend>
          {series.map((name, index) => (
            <Button
              key={name}
              type="button"
              size="sm"
              variant={hiddenSeries.has(name) ? 'ghost' : 'outline'}
              aria-pressed={!hiddenSeries.has(name)}
              onClick={() => toggleSeries(name)}
            >
              <span
                className={cn(
                  'size-2.5 rounded-sm',
                  SERIES_CLASSES[index % SERIES_CLASSES.length]?.background,
                )}
              />
              {name}
            </Button>
          ))}
        </fieldset>
      ) : null}

      <Dialog open={drillGroup !== null} onOpenChange={(open) => !open && setDrillGroup(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <Trans>Chart drill-through</Trans>
            </DialogTitle>
            <DialogDescription>
              {drillGroup?.key
                .map((part) =>
                  propertyValueLabel(
                    source.properties.find((property) => property.id === part.propertyId),
                    part.value,
                    people,
                    relationRecords,
                  ),
                )
                .join(' / ') || 'All matching records'}
              {' · '}
              {drillGroup?.matched.toLocaleString()} matched
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-2">
            {drillRecords.length === 0 ? (
              <p className="rounded border border-dashed p-4 text-muted-foreground text-sm">
                No matching records are present in this bounded result page.
              </p>
            ) : (
              drillRecords.map((record) => (
                <div key={record.id} className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-w-0 flex-1 justify-between py-3 text-left"
                    onClick={() => onOpen?.(record)}
                  >
                    <span>
                      {titleProperty
                        ? String(record.values[titleProperty.id] ?? 'Untitled')
                        : 'Untitled'}
                    </span>
                    <span className="text-muted-foreground text-xs">Open record</span>
                  </Button>
                  {onOpenContextInspector ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Inspect context for record ${record.id}`}
                      onClick={() => onOpenContextInspector(record)}
                    >
                      <Braces aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              ))
            )}
            {drillGroup && drillRecords.length < drillGroup.matched ? (
              <p className="text-muted-foreground text-xs">
                Showing {drillRecords.length.toLocaleString()} loaded records of{' '}
                {drillGroup.matched.toLocaleString()} matched. The view load limit is{' '}
                {configuration.loadLimit.toLocaleString()}.
              </p>
            ) : null}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CartesianChart({
  type,
  categories,
  series,
  points,
  showLabels,
  showAxisNames,
  dimensionName,
  measureName,
  unit,
  onDrillThrough,
  descriptionId,
}: {
  type: 'vertical_bar' | 'horizontal_bar' | 'line';
  categories: readonly string[];
  series: readonly string[];
  points: readonly ChartPoint[];
  showLabels: boolean;
  showAxisNames: boolean;
  dimensionName: string;
  measureName: string;
  unit: string | undefined;
  onDrillThrough: (group: DatabaseAggregationGroup) => void;
  descriptionId: string;
}) {
  const width = 900;
  const height = 420;
  const margin = { top: 28, right: 24, bottom: showAxisNames ? 70 : 50, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = points.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const y = (value: number) => margin.top + ((max - value) / span) * plotHeight;
  const x = (value: number) => margin.left + ((value - min) / span) * plotWidth;
  const zeroY = y(0);
  const zeroX = x(0);
  const categorySize =
    (type === 'horizontal_bar' ? plotHeight : plotWidth) / Math.max(categories.length, 1);
  const seriesSize = categorySize / Math.max(series.length, 1);
  const pointFor = (category: string, seriesName: string) =>
    points.find((point) => point.category === category && point.series === seriesName);
  return (
    <div className="overflow-x-auto rounded-lg border bg-card p-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[42rem]"
        role="img"
        aria-label="Database chart"
        aria-describedby={descriptionId}
      >
        <line
          x1={margin.left}
          x2={width - margin.right}
          y1={type === 'horizontal_bar' ? height - margin.bottom : zeroY}
          y2={type === 'horizontal_bar' ? height - margin.bottom : zeroY}
          className="stroke-border"
        />
        <line
          x1={type === 'horizontal_bar' ? zeroX : margin.left}
          x2={type === 'horizontal_bar' ? zeroX : margin.left}
          y1={margin.top}
          y2={height - margin.bottom}
          className="stroke-border"
        />
        {type === 'line'
          ? series.map((seriesName, seriesIndex) => {
              const seriesPoints = categories.flatMap((category, categoryIndex) => {
                const point = pointFor(category, seriesName);
                return point
                  ? [
                      {
                        ...point,
                        x: margin.left + categorySize * (categoryIndex + 0.5),
                        y: y(point.value),
                      },
                    ]
                  : [];
              });
              return (
                <g key={seriesName}>
                  <polyline
                    points={seriesPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="none"
                    className={cn(
                      'stroke-[3]',
                      SERIES_CLASSES[seriesIndex % SERIES_CLASSES.length]?.stroke,
                    )}
                  />
                  {seriesPoints.map((point) => (
                    <g key={keyIdentity(point.group.key)}>
                      <title>{`${point.category} · ${point.series}: ${formatMeasure(point.value, unit)}`}</title>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={6}
                        className={SERIES_CLASSES[seriesIndex % SERIES_CLASSES.length]?.fill}
                      />
                      {showLabels ? (
                        <text
                          x={point.x}
                          y={point.y - 10}
                          textAnchor="middle"
                          className="fill-foreground text-[11px]"
                        >
                          {formatMeasure(point.value, unit)}
                        </text>
                      ) : null}
                    </g>
                  ))}
                </g>
              );
            })
          : categories.flatMap((category, categoryIndex) =>
              series.flatMap((seriesName, seriesIndex) => {
                const point = pointFor(category, seriesName);
                if (!point) return [];
                const thickness = Math.max(2, seriesSize * 0.72);
                const categoryOffset = categoryIndex * categorySize + seriesIndex * seriesSize;
                const horizontal = type === 'horizontal_bar';
                const barX = horizontal
                  ? Math.min(zeroX, x(point.value))
                  : margin.left + categoryOffset + seriesSize * 0.14;
                const barY = horizontal
                  ? margin.top + categoryOffset + seriesSize * 0.14
                  : Math.min(zeroY, y(point.value));
                const barWidth = horizontal ? Math.abs(x(point.value) - zeroX) : thickness;
                const barHeight = horizontal ? thickness : Math.abs(y(point.value) - zeroY);
                return [
                  <g key={keyIdentity(point.group.key)}>
                    <title>{`${point.category} · ${point.series}: ${formatMeasure(point.value, unit)}`}</title>
                    <rect
                      x={barX}
                      y={barY}
                      width={Math.max(1, barWidth)}
                      height={Math.max(1, barHeight)}
                      rx={3}
                      className={SERIES_CLASSES[seriesIndex % SERIES_CLASSES.length]?.fill}
                    />
                    {showLabels ? (
                      <text
                        x={horizontal ? barX + barWidth + 5 : barX + barWidth / 2}
                        y={horizontal ? barY + barHeight / 2 + 4 : barY - 5}
                        textAnchor={horizontal ? 'start' : 'middle'}
                        className="fill-foreground text-[11px]"
                      >
                        {formatMeasure(point.value, unit)}
                      </text>
                    ) : null}
                  </g>,
                ];
              }),
            )}
        {categories.map((category, index) => (
          <text
            key={category}
            x={
              type === 'horizontal_bar'
                ? margin.left - 8
                : margin.left + categorySize * (index + 0.5)
            }
            y={
              type === 'horizontal_bar'
                ? margin.top + categorySize * (index + 0.5) + 4
                : height - margin.bottom + 18
            }
            textAnchor={type === 'horizontal_bar' ? 'end' : 'middle'}
            className="fill-muted-foreground text-[11px]"
          >
            {category.length > 16 ? `${category.slice(0, 15)}…` : category}
          </text>
        ))}
        {showAxisNames ? (
          <>
            <text
              x={width / 2}
              y={height - 12}
              textAnchor="middle"
              className="fill-muted-foreground text-xs"
            >
              {type === 'horizontal_bar' ? measureName : dimensionName}
            </text>
            <text
              x={14}
              y={height / 2}
              textAnchor="middle"
              transform={`rotate(-90 14 ${height / 2})`}
              className="fill-muted-foreground text-xs"
            >
              {type === 'horizontal_bar' ? dimensionName : measureName}
            </text>
          </>
        ) : null}
      </svg>
      <ChartDrillButtons points={points} unit={unit} onDrillThrough={onDrillThrough} />
    </div>
  );
}

function DonutChart({
  points,
  showLabels,
  unit,
  onDrillThrough,
  descriptionId,
}: {
  points: readonly ChartPoint[];
  showLabels: boolean;
  unit: string | undefined;
  onDrillThrough: (group: DatabaseAggregationGroup) => void;
  descriptionId: string;
}) {
  const positive = points.filter((point) => point.value > 0);
  const total = positive.reduce((sum, point) => sum + point.value, 0);
  if (total <= 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-muted-foreground text-sm">
        Donut charts require positive values.
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-2">
      <svg
        viewBox="0 0 420 360"
        className="mx-auto max-h-[26rem]"
        role="img"
        aria-label="Database donut chart"
        aria-describedby={descriptionId}
      >
        <g transform="rotate(-90 210 170)">
          {positive.map((point, index) => {
            const length = (point.value / total) * 100;
            const start =
              (positive.slice(0, index).reduce((sum, item) => sum + item.value, 0) / total) * 100;
            return (
              <g key={keyIdentity(point.group.key)}>
                <circle
                  cx={210}
                  cy={170}
                  r={110}
                  fill="none"
                  strokeWidth={60}
                  pathLength={100}
                  strokeDasharray={`${length} ${100 - length}`}
                  strokeDashoffset={-start}
                  className={cn(
                    'cursor-pointer',
                    SERIES_CLASSES[index % SERIES_CLASSES.length]?.stroke,
                  )}
                >
                  <title>{`${point.category}: ${formatMeasure(point.value, unit)}`}</title>
                </circle>
              </g>
            );
          })}
        </g>
        <text x={210} y={164} textAnchor="middle" className="fill-muted-foreground text-xs">
          Total
        </text>
        <text
          x={210}
          y={190}
          textAnchor="middle"
          className="fill-foreground text-2xl font-semibold"
        >
          {formatMeasure(total, unit)}
        </text>
        {showLabels
          ? positive.slice(0, 8).map((point, index) => (
              <text
                key={keyIdentity(point.group.key)}
                x={20}
                y={300 + index * 14}
                className="fill-foreground text-[10px]"
              >
                {point.category}: {formatMeasure(point.value, unit)}
              </text>
            ))
          : null}
      </svg>
      <ChartDrillButtons points={positive} unit={unit} onDrillThrough={onDrillThrough} />
    </div>
  );
}

function ChartDrillButtons({
  points,
  unit,
  onDrillThrough,
}: {
  points: readonly ChartPoint[];
  unit: string | undefined;
  onDrillThrough: (group: DatabaseAggregationGroup) => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-1 border-t pt-2">
      {points.map((point) => (
        <Button
          key={keyIdentity(point.group.key)}
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`${point.category}, ${point.series}: ${formatMeasure(point.value, unit)}`}
          onClick={() => onDrillThrough(point.group)}
        >
          {point.category}: {formatMeasure(point.value, unit)}
        </Button>
      ))}
    </div>
  );
}
