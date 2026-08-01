import { Trans } from '@lingui/react/macro';
import type { DatabaseMapViewConfiguration, DatabaseSource } from '@nedian0brien/synapsenote-core';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Owns map location, privacy, marker, and bounded-loading settings. */
export function DatabaseSavedViewSettingsMapPanel({
  configuration,
  onChange,
  source,
}: {
  configuration: DatabaseMapViewConfiguration;
  onChange: (configuration: DatabaseMapViewConfiguration) => void;
  source: DatabaseSource;
}) {
  const selectedPlace = source.properties.find(
    (property) => property.id === configuration.placePropertyId,
  );
  const allowsExternalTiles =
    selectedPlace?.type === 'place' && selectedPlace.externalMap === 'explicit';
  return (
    <section className="space-y-3" aria-label="Saved Map display settings">
      <strong>
        <Trans>Map locations and privacy</Trans>
      </strong>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          value={configuration.placePropertyId}
          onValueChange={(placePropertyId) => onChange({ ...configuration, placePropertyId })}
        >
          <SelectTrigger size="sm" aria-label="Map Place property">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {source.properties
              .filter((property) => property.type === 'place')
              .map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={configuration.basemap}
          onValueChange={(basemap) =>
            onChange({ ...configuration, basemap: basemap as typeof configuration.basemap })
          }
        >
          <SelectTrigger size="sm" aria-label="Map basemap">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local">Private local map</SelectItem>
            <SelectItem value="openstreetmap" disabled={!allowsExternalTiles}>
              OpenStreetMap tiles
            </SelectItem>
          </SelectContent>
        </Select>
        <label htmlFor="map-initial-zoom" className="space-y-1 text-xs">
          <span>Initial zoom</span>
          <Input
            id="map-initial-zoom"
            type="number"
            min={0}
            max={18}
            value={configuration.initialZoom}
            aria-label="Map initial zoom"
            onChange={(event) =>
              onChange({ ...configuration, initialZoom: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label htmlFor="map-cluster-radius" className="space-y-1 text-xs">
          <span>Cluster radius</span>
          <Input
            id="map-cluster-radius"
            type="number"
            min={24}
            max={120}
            value={configuration.clusterRadius}
            disabled={!configuration.clustering}
            aria-label="Map cluster radius"
            onChange={(event) =>
              onChange({ ...configuration, clusterRadius: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label htmlFor="map-load-limit" className="space-y-1 text-xs">
          <span>Marker limit</span>
          <Input
            id="map-load-limit"
            type="number"
            min={1}
            max={100}
            value={configuration.loadLimit}
            aria-label="Map marker limit"
            onChange={(event) =>
              onChange({ ...configuration, loadLimit: Number(event.currentTarget.value) })
            }
          />
        </label>
      </div>
      <p className="text-muted-foreground text-xs">
        The local map makes no network requests. External tiles are available only when the selected
        Place property explicitly permits external maps.
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <MapBooleanControl
          checked={configuration.clustering}
          label="Cluster nearby markers"
          onChange={(clustering) => onChange({ ...configuration, clustering })}
        />
        <MapBooleanControl
          checked={configuration.showLabels}
          label="Show marker labels"
          onChange={(showLabels) => onChange({ ...configuration, showLabels })}
        />
        <MapBooleanControl
          checked={configuration.showMissingLocations}
          label="Show missing locations"
          onChange={(showMissingLocations) => onChange({ ...configuration, showMissingLocations })}
        />
      </div>
    </section>
  );
}

function MapBooleanControl({
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
        aria-label={label}
        onCheckedChange={(value) => onChange(value === true)}
      />
      {label}
    </div>
  );
}
