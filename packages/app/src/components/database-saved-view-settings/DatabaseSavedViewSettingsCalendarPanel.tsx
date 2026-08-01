import { Trans } from '@lingui/react/macro';
import type {
  DatabaseCalendarViewConfiguration,
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

/** Owns calendar date mapping and visual-range controls. */
export function DatabaseSavedViewSettingsCalendarPanel({
  configuration,
  onChange,
  source,
}: {
  configuration: DatabaseCalendarViewConfiguration;
  onChange: (configuration: DatabaseCalendarViewConfiguration) => void;
  source: DatabaseSource;
}) {
  const dateProperties = source.properties.filter((property) => property.type === 'date');
  return (
    <section className="space-y-3" aria-label="Saved Calendar display settings">
      <strong>
        <Trans>Calendar dates and display</Trans>
      </strong>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          value={configuration.datePropertyId}
          onValueChange={(datePropertyId) => onChange({ ...configuration, datePropertyId })}
        >
          <SelectTrigger size="sm" aria-label="Calendar Date property">
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
        <Select
          value={configuration.display}
          onValueChange={(display) =>
            onChange({ ...configuration, display: display as typeof configuration.display })
          }
        >
          <SelectTrigger size="sm" aria-label="Calendar display range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="week">Week</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={configuration.weekStartsOn}
          onValueChange={(weekStartsOn) =>
            onChange({
              ...configuration,
              weekStartsOn: weekStartsOn as typeof configuration.weekStartsOn,
            })
          }
        >
          <SelectTrigger size="sm" aria-label="Calendar week starts on">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monday">Monday</SelectItem>
            <SelectItem value="sunday">Sunday</SelectItem>
          </SelectContent>
        </Select>
        <label htmlFor="calendar-time-zone" className="space-y-1 text-xs">
          <span>Time zone</span>
          <Input
            id="calendar-time-zone"
            value={configuration.timeZone}
            aria-label="Calendar time zone"
            onChange={(event) =>
              onChange({ ...configuration, timeZone: event.currentTarget.value })
            }
          />
        </label>
        <label htmlFor="calendar-card-limit" className="space-y-1 text-xs">
          <span>Cards shown per day</span>
          <Input
            id="calendar-card-limit"
            type="number"
            min={1}
            max={100}
            value={configuration.cardLimitPerDay}
            aria-label="Calendar cards per day limit"
            onChange={(event) =>
              onChange({ ...configuration, cardLimitPerDay: Number(event.currentTarget.value) })
            }
          />
        </label>
        <div className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox
            checked={configuration.showWeekends}
            aria-label="Calendar shows weekends"
            onCheckedChange={(checked) =>
              onChange({ ...configuration, showWeekends: checked === true })
            }
          />
          <Trans>Show weekends</Trans>
        </div>
      </div>
    </section>
  );
}
