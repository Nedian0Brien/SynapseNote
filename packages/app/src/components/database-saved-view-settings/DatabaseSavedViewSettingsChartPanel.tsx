import { Trans } from '@lingui/react/macro';
import type {
  DatabaseChartViewConfiguration,
  DatabaseSource,
} from '@nedian0brien/synapsenote-core';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Owns chart dimension, measure, label, and bounded drill-through controls. */
export function DatabaseSavedViewSettingsChartPanel({
  configuration,
  onChange,
  source,
}: {
  configuration: DatabaseChartViewConfiguration;
  onChange: (configuration: DatabaseChartViewConfiguration) => void;
  source: DatabaseSource;
}) {
  type ChartMeasureFunction = Extract<
    DatabaseChartViewConfiguration['measure'],
    { type: 'property' }
  >['function'];
  const dimensionProperties = source.properties.filter(
    (property) => !['button', 'files', 'place', 'rollup'].includes(property.type),
  );
  const dimension = configuration.dimension ?? {
    propertyId: dimensionProperties[0]?.id ?? '',
    arrayMode: 'each' as const,
  };
  const measurePropertyId =
    configuration.measure.type === 'property' ? configuration.measure.propertyId : 'none';
  const measureFunction =
    configuration.measure.type === 'property' ? configuration.measure.function : 'count_values';
  const updateMeasure = (
    propertyId: string,
    functionName: ChartMeasureFunction = measureFunction as ChartMeasureFunction,
  ) =>
    onChange({
      ...configuration,
      measure:
        propertyId === 'none'
          ? { type: 'count' }
          : { type: 'property', propertyId, function: functionName },
    });
  return (
    <section className="space-y-3" aria-label="Saved Chart display settings">
      <strong>
        <Trans>Chart dimensions and measure</Trans>
      </strong>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          value={configuration.chartType}
          onValueChange={(chartType) =>
            onChange({ ...configuration, chartType: chartType as typeof configuration.chartType })
          }
        >
          <SelectTrigger size="sm" aria-label="Chart type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="vertical_bar">Vertical bar</SelectItem>
            <SelectItem value="horizontal_bar">Horizontal bar</SelectItem>
            <SelectItem value="line">Line</SelectItem>
            <SelectItem value="donut">Donut</SelectItem>
            <SelectItem value="number">Number</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={dimension.propertyId}
          disabled={configuration.chartType === 'number'}
          onValueChange={(propertyId) =>
            onChange({ ...configuration, dimension: { ...dimension, propertyId } })
          }
        >
          <SelectTrigger size="sm" aria-label="Chart dimension">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dimensionProperties.map((property) => (
              <SelectItem key={property.id} value={property.id}>
                {property.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={configuration.seriesPropertyId ?? 'none'}
          disabled={configuration.chartType === 'number' || configuration.chartType === 'donut'}
          onValueChange={(seriesPropertyId) =>
            onChange({
              ...configuration,
              ...(seriesPropertyId === 'none'
                ? { seriesPropertyId: undefined }
                : { seriesPropertyId }),
            })
          }
        >
          <SelectTrigger size="sm" aria-label="Chart series dimension">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No series</SelectItem>
            {dimensionProperties
              .filter((property) => property.id !== dimension.propertyId)
              .map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={measurePropertyId}
          onValueChange={(propertyId) => {
            const property = source.properties.find((item) => item.id === propertyId);
            const functionName =
              property &&
              property.type !== 'number' &&
              !['count_values', 'count_unique'].includes(measureFunction)
                ? 'count_values'
                : measureFunction;
            updateMeasure(propertyId, functionName);
          }}
        >
          <SelectTrigger size="sm" aria-label="Chart measure property">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Record count</SelectItem>
            {source.properties
              .filter((property) => property.type !== 'button')
              .map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={measureFunction}
          disabled={measurePropertyId === 'none'}
          onValueChange={(functionName) =>
            updateMeasure(measurePropertyId, functionName as ChartMeasureFunction)
          }
        >
          <SelectTrigger size="sm" aria-label="Chart aggregation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="count_values">Count values</SelectItem>
            <SelectItem value="count_unique">Count unique</SelectItem>
            {source.properties.find((property) => property.id === measurePropertyId)?.type ===
            'number'
              ? ['sum', 'average', 'median', 'min', 'max', 'range'].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value[0]?.toUpperCase()}
                    {value.slice(1)}
                  </SelectItem>
                ))
              : null}
          </SelectContent>
        </Select>
        <Select
          value={dimension.arrayMode}
          disabled={configuration.chartType === 'number'}
          onValueChange={(arrayMode) =>
            onChange({
              ...configuration,
              dimension: { ...dimension, arrayMode: arrayMode as typeof dimension.arrayMode },
            })
          }
        >
          <SelectTrigger size="sm" aria-label="Chart multi-value grouping">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="each">Each value</SelectItem>
            <SelectItem value="set">Whole set</SelectItem>
          </SelectContent>
        </Select>
        <ChartLimitControl
          id="chart-group-limit"
          label="Group limit"
          ariaLabel="Chart group limit"
          max={200}
          value={configuration.groupLimit}
          onChange={(groupLimit) => onChange({ ...configuration, groupLimit })}
        />
        <ChartLimitControl
          id="chart-load-limit"
          label="Drill-through row limit"
          ariaLabel="Chart drill-through row limit"
          max={500}
          value={configuration.loadLimit}
          onChange={(loadLimit) => onChange({ ...configuration, loadLimit })}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <ChartBooleanControl
          checked={configuration.showLegend}
          label="Legend"
          onChange={(showLegend) => onChange({ ...configuration, showLegend })}
        />
        <ChartBooleanControl
          checked={configuration.showLabels}
          label="Value labels"
          onChange={(showLabels) => onChange({ ...configuration, showLabels })}
        />
        <ChartBooleanControl
          checked={configuration.showAxisNames}
          label="Axis names"
          onChange={(showAxisNames) => onChange({ ...configuration, showAxisNames })}
        />
      </div>
    </section>
  );
}

function ChartLimitControl({
  ariaLabel,
  id,
  label,
  max,
  onChange,
  value,
}: {
  ariaLabel: string;
  id: string;
  label: string;
  max: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label htmlFor={id} className="space-y-1 text-xs">
      <span>{label}</span>
      <Input
        id={id}
        type="number"
        min={1}
        max={max}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ChartBooleanControl({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        aria-label={`Show Chart ${label.toLowerCase()}`}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {label}
    </div>
  );
}
