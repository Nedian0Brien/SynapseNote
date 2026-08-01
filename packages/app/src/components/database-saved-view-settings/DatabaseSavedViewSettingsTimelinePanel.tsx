import { Trans } from '@lingui/react/macro';
import type {
  DatabaseSource,
  DatabaseTimelineViewConfiguration,
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

/** Owns timeline mapping, dependency, visibility, and limit controls. */
export function DatabaseSavedViewSettingsTimelinePanel({
  configuration,
  onChange,
  source,
}: {
  configuration: DatabaseTimelineViewConfiguration;
  onChange: (configuration: DatabaseTimelineViewConfiguration) => void;
  source: DatabaseSource;
}) {
  const dateProperties = source.properties.filter((property) => property.type === 'date');
  const startPropertyId =
    configuration.dateMapping.type === 'range'
      ? configuration.dateMapping.propertyId
      : configuration.dateMapping.startPropertyId;
  const endPropertyId =
    configuration.dateMapping.type === 'separate'
      ? configuration.dateMapping.endPropertyId
      : (dateProperties.find((property) => property.id !== startPropertyId)?.id ?? startPropertyId);
  const updateDateMapping = (dateMapping: DatabaseTimelineViewConfiguration['dateMapping']) =>
    onChange({ ...configuration, dateMapping });
  return (
    <section className="space-y-3" aria-label="Saved Timeline display settings">
      <strong>
        <Trans>Timeline dates and display</Trans>
      </strong>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          value={configuration.dateMapping.type}
          onValueChange={(type) =>
            updateDateMapping(
              type === 'range'
                ? { type: 'range', propertyId: startPropertyId }
                : { type: 'separate', startPropertyId, endPropertyId },
            )
          }
        >
          <SelectTrigger size="sm" aria-label="Timeline date mapping type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="range">One Date or range</SelectItem>
            <SelectItem value="separate" disabled={dateProperties.length < 2}>
              Separate start and end
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={startPropertyId}
          onValueChange={(propertyId) =>
            updateDateMapping(
              configuration.dateMapping.type === 'range'
                ? { type: 'range', propertyId }
                : { ...configuration.dateMapping, startPropertyId: propertyId },
            )
          }
        >
          <SelectTrigger size="sm" aria-label="Timeline start Date property">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dateProperties.map((property) => (
              <SelectItem key={property.id} value={property.id}>
                {property.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {configuration.dateMapping.type === 'separate' ? (
          <Select
            value={endPropertyId}
            onValueChange={(propertyId) =>
              updateDateMapping({
                type: 'separate',
                startPropertyId,
                endPropertyId: propertyId,
              })
            }
          >
            <SelectTrigger size="sm" aria-label="Timeline end Date property">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dateProperties
                .filter((property) => property.id !== startPropertyId)
                .map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : null}
        <Select
          value={configuration.scale}
          onValueChange={(scale) =>
            onChange({ ...configuration, scale: scale as typeof configuration.scale })
          }
        >
          <SelectTrigger size="sm" aria-label="Timeline scale">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hour">Hours</SelectItem>
            <SelectItem value="day">Days</SelectItem>
            <SelectItem value="week">Weeks</SelectItem>
            <SelectItem value="month">Months</SelectItem>
            <SelectItem value="quarter">Quarters</SelectItem>
            <SelectItem value="year">Years</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={configuration.dependencyPropertyId ?? 'none'}
          onValueChange={(dependencyPropertyId) =>
            onChange({
              ...configuration,
              ...(dependencyPropertyId === 'none' ? {} : { dependencyPropertyId }),
              ...(dependencyPropertyId === 'none' ? { dependencyPropertyId: undefined } : {}),
            })
          }
        >
          <SelectTrigger size="sm" aria-label="Timeline dependency Relation property">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No dependencies</SelectItem>
            {source.properties
              .filter(
                (property) => property.type === 'relation' && property.targetSourceId === source.id,
              )
              .map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <label htmlFor="timeline-load-limit" className="space-y-1 text-xs">
          <span>Load limit</span>
          <Input
            id="timeline-load-limit"
            type="number"
            min={1}
            max={500}
            value={configuration.loadLimit}
            aria-label="Timeline load limit"
            onChange={(event) =>
              onChange({ ...configuration, loadLimit: Number(event.currentTarget.value) })
            }
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <TimelineBooleanControl
          checked={configuration.showTable}
          label="Show table"
          ariaLabel="Timeline shows table"
          onChange={(showTable) => onChange({ ...configuration, showTable })}
        />
        <TimelineBooleanControl
          checked={configuration.showToday}
          label="Show today"
          ariaLabel="Timeline shows today"
          onChange={(showToday) => onChange({ ...configuration, showToday })}
        />
        <TimelineBooleanControl
          checked={configuration.showDependencies}
          label="Show dependencies"
          ariaLabel="Timeline shows dependencies"
          onChange={(showDependencies) => onChange({ ...configuration, showDependencies })}
        />
        <TimelineBooleanControl
          checked={configuration.noDateLane}
          label="No-date lane"
          ariaLabel="Timeline shows no-date lane"
          onChange={(noDateLane) => onChange({ ...configuration, noDateLane })}
        />
      </div>
    </section>
  );
}

function TimelineBooleanControl({
  ariaLabel,
  checked,
  label,
  onChange,
}: {
  ariaLabel: string;
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        aria-label={ariaLabel}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {label}
    </div>
  );
}
