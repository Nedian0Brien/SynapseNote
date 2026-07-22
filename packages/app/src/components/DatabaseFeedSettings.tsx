import { Trans } from '@lingui/react/macro';
import type { DatabaseFeedViewConfiguration, DatabaseSource } from '@nedian0brien/synapsenote-core';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function DatabaseFeedSettings({
  source,
  value,
  onChange,
}: {
  source: DatabaseSource;
  value: DatabaseFeedViewConfiguration;
  onChange: (value: DatabaseFeedViewConfiguration) => void;
}) {
  const chronologyProperties = source.properties.filter((property) =>
    ['date', 'created_time', 'last_edited_time'].includes(property.type),
  );
  const authorProperties = source.properties.filter((property) =>
    ['person', 'created_by', 'last_edited_by'].includes(property.type),
  );
  return (
    <section className="space-y-3" aria-label="Saved Feed settings">
      <strong>
        <Trans>Feed layout</Trans>
      </strong>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <span>Chronology</span>
          <Select
            value={value.chronologyPropertyId}
            onValueChange={(chronologyPropertyId) => onChange({ ...value, chronologyPropertyId })}
          >
            <SelectTrigger aria-label="Feed chronology property">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {chronologyProperties.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 text-sm">
          <span>Author identity</span>
          <Select
            value={value.authorPropertyId ?? 'none'}
            onValueChange={(authorPropertyId) =>
              onChange({
                ...value,
                authorPropertyId: authorPropertyId === 'none' ? undefined : authorPropertyId,
              })
            }
          >
            <SelectTrigger aria-label="Feed author identity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Source name</SelectItem>
              {authorProperties.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 text-sm">
          <span>Card density</span>
          <Select
            value={value.density}
            onValueChange={(density) =>
              onChange({ ...value, density: density as 'compact' | 'comfortable' })
            }
          >
            <SelectTrigger aria-label="Feed card density">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compact">Compact</SelectItem>
              <SelectItem value="comfortable">Comfortable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label htmlFor="feed-page-limit" className="space-y-1 text-sm">
          <span>Page limit</span>
          <Input
            type="number"
            id="feed-page-limit"
            min={1}
            max={100}
            value={value.loadLimit}
            onChange={(event) =>
              onChange({
                ...value,
                loadLimit: Math.max(1, Math.min(100, Number(event.currentTarget.value) || 1)),
              })
            }
          />
        </label>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          aria-label="Show projected properties"
          checked={value.showProperties}
          onCheckedChange={(checked) => onChange({ ...value, showProperties: checked === true })}
        />
        Show projected properties
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          aria-label="Track read items in this app session"
          checked={value.readTracking === 'session'}
          onCheckedChange={(checked) =>
            onChange({ ...value, readTracking: checked === true ? 'session' : 'none' })
          }
        />
        Track read items in this app session
      </div>
      <p className="text-muted-foreground text-xs">
        Session read state stays on this device and is not synced or reported as a durable view
        count.
      </p>
    </section>
  );
}
