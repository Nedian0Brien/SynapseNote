import { Trans } from '@lingui/react/macro';
import type {
  DatabasePlaceValue,
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { AlertTriangle, Braces, LocateFixed, Minus, Plus } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatDatabaseNumber } from '@/lib/database-display-format';

const MAP_WIDTH = 960;
const MAP_HEIGHT = 540;
const TILE_SIZE = 256;

export interface DatabaseMapMarker {
  record: ProjectedDatabaseRecord;
  place: DatabasePlaceValue;
  x: number;
  y: number;
}

export interface DatabaseMapCluster {
  id: string;
  x: number;
  y: number;
  markers: DatabaseMapMarker[];
}

function mercatorPoint(lat: number, lon: number) {
  const limitedLat = Math.max(-85.051129, Math.min(85.051129, lat));
  const sine = Math.sin((limitedLat * Math.PI) / 180);
  return {
    x: (lon + 180) / 360,
    y: 0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI),
  };
}

function longitudeForWorldX(x: number): number {
  return (((x % 1) + 1) % 1) * 360 - 180;
}

function latitudeForWorldY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

export function clusterDatabaseMapMarkers(
  markers: readonly DatabaseMapMarker[],
  radius: number,
): DatabaseMapCluster[] {
  const cells = new Map<string, DatabaseMapMarker[]>();
  for (const marker of [...markers].sort((a, b) => a.record.id.localeCompare(b.record.id))) {
    const key = `${Math.floor(marker.x / radius)}:${Math.floor(marker.y / radius)}`;
    const current = cells.get(key) ?? [];
    current.push(marker);
    cells.set(key, current);
  }
  return [...cells.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, members]) => ({
      id: `${key}:${members.map((marker) => marker.record.id).join(',')}`,
      x: members.reduce((sum, marker) => sum + marker.x, 0) / members.length,
      y: members.reduce((sum, marker) => sum + marker.y, 0) / members.length,
      markers: members,
    }));
}

function titleForRecord(source: DatabaseSource, record: ProjectedDatabaseRecord): string {
  const titleProperty = source.properties.find((property) => property.type === 'title');
  return titleProperty ? String(record.values[titleProperty.id] ?? 'Untitled') : 'Untitled';
}

export function DatabaseMap({
  source,
  view,
  result,
  onOpen,
  onOpenContextInspector,
}: {
  source: DatabaseSource;
  view: DatabaseView;
  result: DatabaseQueryResult;
  onOpen?: (record: ProjectedDatabaseRecord) => void;
  onOpenContextInspector?: (record: ProjectedDatabaseRecord) => void;
}) {
  if (view.layout.type !== 'map') return null;
  return (
    <DatabaseMapContent
      source={source}
      view={{ ...view, layout: view.layout }}
      result={result}
      onOpen={onOpen}
      onOpenContextInspector={onOpenContextInspector}
    />
  );
}

function DatabaseMapContent({
  source,
  view,
  result,
  onOpen,
  onOpenContextInspector,
}: {
  source: DatabaseSource;
  view: DatabaseView & {
    layout: Extract<DatabaseView['layout'], { type: 'map' }>;
  };
  result: DatabaseQueryResult;
  onOpen?: (record: ProjectedDatabaseRecord) => void;
  onOpenContextInspector?: (record: ProjectedDatabaseRecord) => void;
}) {
  'use no memo';
  const mapDescriptionId = useId();
  const configuration = view.layout.configuration;
  const placeProperty = source.properties.find(
    (property) => property.id === configuration.placePropertyId && property.type === 'place',
  );
  const located = result.records.flatMap((record) => {
    const value = record.values[configuration.placePropertyId];
    return value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'lat' in value &&
      'lon' in value
      ? [{ record, place: value as DatabasePlaceValue }]
      : [];
  });
  const missing = result.records.filter(
    (record) => !located.some((item) => item.record.id === record.id),
  );
  const fittedCenter = (() => {
    if (configuration.initialCenter) return configuration.initialCenter;
    if (located.length === 0) return { lat: 0, lon: 0 };
    return {
      lat: located.reduce((sum, item) => sum + item.place.lat, 0) / located.length,
      lon: located.reduce((sum, item) => sum + item.place.lon, 0) / located.length,
    };
  })();
  const [center, setCenter] = useState(fittedCenter);
  const [zoom, setZoom] = useState(configuration.initialZoom);
  const [providerFailed, setProviderFailed] = useState(false);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; centerX: number; centerY: number } | null>(null);

  if (!placeProperty) {
    return (
      <div
        className="rounded border border-destructive/30 p-4 text-destructive text-sm"
        role="alert"
      >
        <Trans>This Map view has an invalid Place mapping.</Trans>
      </div>
    );
  }

  const centerWorld = mercatorPoint(center.lat, center.lon);
  const worldSize = TILE_SIZE * 2 ** zoom;
  const markers: DatabaseMapMarker[] = located.map((item) => {
    const point = mercatorPoint(item.place.lat, item.place.lon);
    let deltaX = point.x - centerWorld.x;
    if (deltaX > 0.5) deltaX -= 1;
    if (deltaX < -0.5) deltaX += 1;
    return {
      ...item,
      x: MAP_WIDTH / 2 + deltaX * worldSize,
      y: MAP_HEIGHT / 2 + (point.y - centerWorld.y) * worldSize,
    };
  });
  const clusters = configuration.clustering
    ? clusterDatabaseMapMarkers(markers, configuration.clusterRadius)
    : markers.map((marker) => ({
        id: marker.record.id,
        x: marker.x,
        y: marker.y,
        markers: [marker],
      }));
  const tiles = [] as Array<{ key: string; x: number; y: number; tileX: number; tileY: number }>;
  if (configuration.basemap === 'openstreetmap' && !providerFailed) {
    const count = 2 ** zoom;
    const left = centerWorld.x * worldSize - MAP_WIDTH / 2;
    const top = centerWorld.y * worldSize - MAP_HEIGHT / 2;
    for (
      let tileY = Math.floor(top / TILE_SIZE);
      tileY <= Math.floor((top + MAP_HEIGHT) / TILE_SIZE);
      tileY += 1
    ) {
      if (tileY < 0 || tileY >= count) continue;
      for (
        let tileX = Math.floor(left / TILE_SIZE);
        tileX <= Math.floor((left + MAP_WIDTH) / TILE_SIZE);
        tileX += 1
      ) {
        const wrappedX = ((tileX % count) + count) % count;
        tiles.push({
          key: `${tileX}:${tileY}`,
          x: tileX * TILE_SIZE - left,
          y: tileY * TILE_SIZE - top,
          tileX: wrappedX,
          tileY,
        });
      }
    }
  }

  const resetView = () => {
    setCenter(fittedCenter);
    setZoom(configuration.initialZoom);
  };

  return (
    <section className="space-y-3" aria-label={`${view.name} Map`} data-database-map>
      {providerFailed ? (
        <p
          className="flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs"
          role="alert"
        >
          <AlertTriangle className="size-4" /> External map tiles could not be loaded. The private
          local map remains available.
        </p>
      ) : null}
      <div
        className="relative aspect-video min-h-56 touch-none overflow-hidden rounded-lg border bg-muted outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-h-72"
        aria-label={`Interactive database map. Center ${center.lat.toFixed(3)}, ${center.lon.toFixed(3)}. Zoom ${zoom}.`}
        aria-describedby={mapDescriptionId}
        role="application"
        aria-roledescription="map"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the map canvas is a documented composite keyboard interaction surface.
        tabIndex={0}
        onKeyDown={(event) => {
          const step = 20 / 2 ** zoom;
          if (event.key === 'ArrowLeft')
            setCenter((value) => ({ ...value, lon: value.lon - step }));
          else if (event.key === 'ArrowRight')
            setCenter((value) => ({ ...value, lon: value.lon + step }));
          else if (event.key === 'ArrowUp')
            setCenter((value) => ({ ...value, lat: Math.min(85, value.lat + step) }));
          else if (event.key === 'ArrowDown')
            setCenter((value) => ({ ...value, lat: Math.max(-85, value.lat - step) }));
          else if (event.key === '+' || event.key === '=')
            setZoom((value) => Math.min(18, value + 1));
          else if (event.key === '-') setZoom((value) => Math.max(0, value - 1));
          else if (event.key === 'Home') resetView();
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            centerX: centerWorld.x,
            centerY: centerWorld.y,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const nextX = drag.current.centerX - (event.clientX - drag.current.x) / worldSize;
          const nextY = Math.max(
            0,
            Math.min(1, drag.current.centerY - (event.clientY - drag.current.y) / worldSize),
          );
          setCenter({ lat: latitudeForWorldY(nextY), lon: longitudeForWorldX(nextX) });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:48px_48px] opacity-40" />
        {tiles.map((tile) => (
          <img
            key={tile.key}
            src={`https://tile.openstreetmap.org/${zoom}/${tile.tileX}/${tile.tileY}.png`}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute size-64 max-w-none"
            style={{
              left: `${(tile.x / MAP_WIDTH) * 100}%`,
              top: `${(tile.y / MAP_HEIGHT) * 100}%`,
              width: `${(TILE_SIZE / MAP_WIDTH) * 100}%`,
              height: `${(TILE_SIZE / MAP_HEIGHT) * 100}%`,
            }}
            onError={() => setProviderFailed(true)}
          />
        ))}
        {clusters.map((cluster) => {
          if (
            cluster.x < -40 ||
            cluster.x > MAP_WIDTH + 40 ||
            cluster.y < -40 ||
            cluster.y > MAP_HEIGHT + 40
          )
            return null;
          const multiple = cluster.markers.length > 1;
          const firstMarker = cluster.markers[0];
          if (!firstMarker) return null;
          return (
            <div
              key={cluster.id}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(cluster.x / MAP_WIDTH) * 100}%`,
                top: `${(cluster.y / MAP_HEIGHT) * 100}%`,
              }}
            >
              <Button
                type="button"
                size="icon"
                className="rounded-full shadow-md"
                aria-label={
                  multiple
                    ? `Open cluster of ${cluster.markers.length} locations`
                    : `Open ${titleForRecord(source, firstMarker.record)}`
                }
                aria-expanded={multiple ? expandedCluster === cluster.id : undefined}
                data-record-title-link={!multiple ? firstMarker.record.id : undefined}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() =>
                  multiple
                    ? setExpandedCluster(expandedCluster === cluster.id ? null : cluster.id)
                    : onOpen?.(firstMarker.record)
                }
              >
                {multiple ? cluster.markers.length : '•'}
              </Button>
              {!multiple && onOpenContextInspector ? (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="secondary"
                  aria-label={`Inspect context for record ${titleForRecord(source, firstMarker.record)}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onOpenContextInspector(firstMarker.record)}
                >
                  <Braces aria-hidden="true" />
                </Button>
              ) : null}
              {configuration.showLabels && !multiple ? (
                <span className="pointer-events-none absolute top-10 left-1/2 w-max max-w-40 -translate-x-1/2 truncate rounded bg-background/90 px-2 py-1 text-xs shadow">
                  {titleForRecord(source, firstMarker.record)}
                </span>
              ) : null}
              {expandedCluster === cluster.id ? (
                <div className="absolute top-11 left-1/2 z-20 max-h-48 w-56 -translate-x-1/2 overflow-auto rounded border bg-popover p-1 shadow-lg">
                  {cluster.markers.map((marker) => (
                    <div key={marker.record.id} className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-w-0 flex-1 justify-start"
                        aria-label={`Open ${titleForRecord(source, marker.record)}`}
                        data-record-title-link={marker.record.id}
                        onClick={() => onOpen?.(marker.record)}
                      >
                        {titleForRecord(source, marker.record)}
                      </Button>
                      {onOpenContextInspector ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Inspect context for record ${titleForRecord(source, marker.record)}`}
                          onClick={() => onOpenContextInspector(marker.record)}
                        >
                          <Braces aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <div className="absolute top-2 left-2 z-20 flex flex-col gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            aria-label="Zoom in"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setZoom((value) => Math.min(18, value + 1))}
          >
            <Plus />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            aria-label="Zoom out"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setZoom((value) => Math.max(0, value - 1))}
          >
            <Minus />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            aria-label="Reset map view"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={resetView}
          >
            <LocateFixed />
          </Button>
        </div>
        {configuration.basemap === 'openstreetmap' && !providerFailed ? (
          <a
            className="absolute right-1 bottom-1 z-20 rounded bg-background/80 px-1 text-[10px] underline"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            onPointerDown={(event) => event.stopPropagation()}
          >
            © OpenStreetMap contributors
          </a>
        ) : (
          <span className="absolute right-2 bottom-2 rounded bg-background/80 px-2 py-1 text-[10px]">
            Local map · no network requests
          </span>
        )}
      </div>
      <p id={mapDescriptionId} className="sr-only">
        Use arrow keys to pan, plus and minus to zoom, and Home to reset. Mapped locations:{' '}
        {located.length === 0
          ? 'none'
          : located
              .map(
                ({ record, place }) =>
                  `${titleForRecord(source, record)} at ${place.label || place.address || `${place.lat}, ${place.lon}`}`,
              )
              .join('; ')}
        . Missing locations: {formatDatabaseNumber(missing.length)}.
      </p>
      <p className="text-muted-foreground text-xs">
        {formatDatabaseNumber(located.length)} mapped · {formatDatabaseNumber(missing.length)}{' '}
        missing location{!result.isComplete ? ' · result limited by saved Map settings' : ''}
      </p>
      {configuration.showMissingLocations && missing.length > 0 ? (
        <details className="rounded border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Missing locations ({missing.length})
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((record) => (
              <div key={record.id} className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-record-title-link={record.id}
                  onClick={() => onOpen?.(record)}
                >
                  {titleForRecord(source, record)}
                </Button>
                {onOpenContextInspector ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    aria-label={`Inspect context for record ${titleForRecord(source, record)}`}
                    onClick={() => onOpenContextInspector(record)}
                  >
                    <Braces aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {located.length === 0 ? (
        <p className="rounded border border-dashed p-8 text-center text-muted-foreground text-sm">
          <Trans>No records in this Map view have a location.</Trans>
        </p>
      ) : null}
    </section>
  );
}
