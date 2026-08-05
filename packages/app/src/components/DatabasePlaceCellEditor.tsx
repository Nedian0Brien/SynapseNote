import type { DatabasePlaceValue, DatabaseProperty } from '@nedian0brien/synapsenote-core';
import { DatabasePlaceValueSchema } from '@nedian0brien/synapsenote-core';
import { MapPin, Search, Shield } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { searchDatabasePlaces } from '@/lib/database-place-client';

function initialPlace(draft: string): DatabasePlaceValue {
  try {
    const parsed = DatabasePlaceValueSchema.safeParse(JSON.parse(draft));
    if (parsed.success) return parsed.data;
  } catch {
    // Invalid external values stay editable through the fallback fields below.
  }
  return {
    label: '',
    address: '',
    lat: 0,
    lon: 0,
    precision: 'exact',
    source: 'manual',
  };
}

export function DatabasePlaceCellEditor({
  draft,
  property,
  onDraftChange,
}: {
  draft: string;
  property: Extract<DatabaseProperty, { type: 'place' }>;
  onDraftChange: (draft: string) => void;
}) {
  'use no memo';
  const propertyName = property.name;
  const initial = initialPlace(draft);
  const [label, setLabel] = useState(initial.label);
  const [address, setAddress] = useState(initial.address);
  const [lat, setLat] = useState(String(initial.lat));
  const [lon, setLon] = useState(String(initial.lon));
  const [precision, setPrecision] = useState<DatabasePlaceValue['precision']>(initial.precision);
  const [searchConsent, setSearchConsent] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<Awaited<
    ReturnType<typeof searchDatabasePlaces>
  > | null>(null);

  const emit = (next: {
    label?: string;
    address?: string;
    lat?: string;
    lon?: string;
    precision?: DatabasePlaceValue['precision'];
  }) => {
    const nextLat = next.lat ?? lat;
    const nextLon = next.lon ?? lon;
    onDraftChange(
      JSON.stringify({
        label: next.label ?? label,
        address: next.address ?? address,
        lat: nextLat.trim() === '' ? null : Number(nextLat),
        lon: nextLon.trim() === '' ? null : Number(nextLon),
        precision: next.precision ?? precision,
        source: 'manual',
      }),
    );
  };

  const numericLat = Number(lat);
  const numericLon = Number(lon);
  const pinLeft = Number.isFinite(numericLon) ? ((numericLon + 180) / 360) * 100 : 50;
  const pinTop = Number.isFinite(numericLat) ? ((90 - numericLat) / 180) * 100 : 50;

  const chooseCandidate = (value: DatabasePlaceValue) => {
    setLabel(value.label);
    setAddress(value.address);
    setLat(String(value.lat));
    setLon(String(value.lon));
    setPrecision(value.precision);
    onDraftChange(JSON.stringify(value));
  };

  return (
    <fieldset className="grid min-w-80 gap-2 border-0 p-1">
      <legend className="sr-only">Edit {propertyName}</legend>
      <Input
        autoFocus
        value={label}
        placeholder="Place name"
        aria-label={`${propertyName} name`}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setLabel(value);
          emit({ label: value });
        }}
      />
      <Input
        value={address}
        placeholder="Address (stored for offline use)"
        aria-label={`${propertyName} address`}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setAddress(value);
          emit({ address: value });
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={lat}
          type="number"
          min={-90}
          max={90}
          step="any"
          inputMode="decimal"
          aria-label={`${propertyName} latitude`}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setLat(value);
            emit({ lat: value });
          }}
        />
        <Input
          value={lon}
          type="number"
          min={-180}
          max={180}
          step="any"
          inputMode="decimal"
          aria-label={`${propertyName} longitude`}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setLon(value);
            emit({ lon: value });
          }}
        />
      </div>
      <Select
        value={precision}
        onValueChange={(value: DatabasePlaceValue['precision']) => {
          setPrecision(value);
          emit({ precision: value });
        }}
      >
        <SelectTrigger size="sm" aria-label={`${propertyName} coordinate privacy`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent data-database-cell-editor-surface="">
          <SelectItem value="exact">Exact coordinates</SelectItem>
          <SelectItem value="approximate">Approximate area (rounded before storage)</SelectItem>
        </SelectContent>
      </Select>
      <div
        className="relative h-20 overflow-hidden rounded-md border bg-muted/40"
        role="img"
        aria-label="Offline coordinate preview"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:25%_25%] opacity-50" />
        <MapPin
          className="absolute size-5 -translate-x-1/2 -translate-y-full text-azure-blue"
          style={{ left: `${pinLeft}%`, top: `${pinTop}%` }}
          aria-hidden="true"
        />
        <span className="absolute bottom-1 left-2 text-muted-foreground text-xs">
          Offline coordinate preview
        </span>
      </div>
      <p className="flex items-center gap-1 text-muted-foreground text-xs">
        <Shield className="size-3" aria-hidden="true" />
        No address or coordinate leaves this device while editing manually.
      </p>
      {property.externalSearch === 'explicit' ? (
        <div className="grid gap-2 rounded-md border p-2">
          <label
            htmlFor={`database-place-search-consent-${property.id}`}
            className="flex items-start gap-2 text-xs"
          >
            <Checkbox
              id={`database-place-search-consent-${property.id}`}
              checked={searchConsent}
              onCheckedChange={(checked) => setSearchConsent(checked === true)}
              aria-label="Allow this address query to leave the device"
            />
            Send the current name/address to the configured geocoder for this search only.
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!searchConsent || searching || (address.trim() === '' && label.trim() === '')}
            onClick={async () => {
              setSearching(true);
              setSearchError(null);
              try {
                const result = await searchDatabasePlaces({
                  query: address.trim() || label.trim(),
                  consent: true,
                  locale: typeof navigator === 'undefined' ? 'en' : navigator.language,
                  limit: 5,
                });
                setSearchResult(result);
              } catch (cause) {
                setSearchError(cause instanceof Error ? cause.message : 'Place search failed');
              } finally {
                setSearching(false);
                setSearchConsent(false);
              }
            }}
          >
            <Search className="size-3.5" aria-hidden="true" />
            {searching ? 'Searching…' : 'Search address'}
          </Button>
          {searchResult?.status === 'unavailable' ? (
            <p className="text-muted-foreground text-xs">
              No geocoder is configured. Enter coordinates manually; stored places remain offline.
            </p>
          ) : null}
          {searchResult?.candidates.map((candidate) => (
            <Button
              key={`${candidate.value.provider?.placeId ?? candidate.displayName}:${candidate.value.lat}:${candidate.value.lon}`}
              type="button"
              size="sm"
              variant="ghost"
              className="h-auto justify-start whitespace-normal text-left"
              onClick={() => chooseCandidate(candidate.value)}
            >
              {candidate.displayName}
            </Button>
          ))}
          {searchResult?.attribution ? (
            <p className="text-muted-foreground text-xs">{searchResult.attribution}</p>
          ) : null}
          {searchError ? <p className="text-destructive text-xs">{searchError}</p> : null}
        </div>
      ) : null}
    </fieldset>
  );
}
