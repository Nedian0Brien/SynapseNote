import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { clusterDatabaseMapMarkers, DatabaseMap } from './DatabaseMap';

const hash = `sha256:${'a'.repeat(64)}`;
const source: DatabaseSource = {
  id: 'ds_places',
  key: 'places',
  name: 'Places',
  recordMeaning: 'One place',
  folder: 'places',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    {
      id: 'prop_place',
      key: 'place',
      name: 'Place',
      type: 'place',
      externalSearch: 'disabled',
      externalMap: 'explicit',
    },
  ],
};
const view: DatabaseView = {
  id: 'view_map',
  key: 'map',
  name: 'Place map',
  sourceId: source.id,
  layout: {
    type: 'map',
    configuration: {
      placePropertyId: 'prop_place',
      basemap: 'local',
      clustering: true,
      clusterRadius: 48,
      showLabels: true,
      showMissingLocations: true,
      initialZoom: 2,
      loadLimit: 100,
    },
  },
  sort: [],
  groups: [],
  projection: { propertyIds: ['prop_title'], body: 'hidden' },
};
const records = [
  {
    id: 'rec_seoul',
    path: 'places/seoul.md',
    revision: hash,
    values: {
      prop_title: 'Seoul',
      prop_place: {
        label: 'Seoul',
        address: 'Seoul',
        lat: 37.5665,
        lon: 126.978,
        precision: 'approximate' as const,
        source: 'manual' as const,
      },
    },
  },
  {
    id: 'rec_missing',
    path: 'places/missing.md',
    revision: hash,
    values: { prop_title: 'Unknown' },
  },
];
const result: DatabaseQueryResult = {
  sourceId: source.id,
  snapshotRevision: hash,
  matched: 2,
  returned: 2,
  isComplete: true,
  nextCursor: null,
  truncatedBy: null,
  indexFreshness: 'snapshot',
  records,
  aggregation: null,
};

afterEach(cleanup);

describe('DatabaseMap', () => {
  test('clusters deterministically regardless of input order', () => {
    const locatedRecord = records[0];
    if (!locatedRecord) throw new Error('missing located record fixture');
    const place = locatedRecord.values.prop_place;
    if (!place) throw new Error('missing Place fixture');
    const markers = [
      { record: locatedRecord, place, x: 20, y: 20 },
      {
        record: { ...locatedRecord, id: 'rec_buson', path: 'places/buson.md' },
        place,
        x: 30,
        y: 28,
      },
    ];
    const clustered = clusterDatabaseMapMarkers(markers, 48);
    expect(clustered).toEqual(clusterDatabaseMapMarkers([...markers].reverse(), 48));
    expect(clustered).toHaveLength(1);
    expect(clustered[0]?.markers.map((marker) => marker.record.id)).toEqual([
      'rec_buson',
      'rec_seoul',
    ]);
  });

  test('renders a network-free map, opens pins, and exposes missing locations', () => {
    const onOpen = mock(() => {});
    render(<DatabaseMap source={source} view={view} result={result} onOpen={onOpen} />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Local map · no network requests')).toBeTruthy();
    expect(screen.getByText(/1 mapped · 1 missing location/)).toBeTruthy();
    const map = screen.getByRole('application', { name: /Interactive database map/ });
    const descriptionId = map.getAttribute('aria-describedby');
    expect(document.getElementById(descriptionId ?? '')?.textContent).toContain('Seoul at Seoul');
    const initialLabel = map.getAttribute('aria-label');
    fireEvent.keyDown(map, { key: 'ArrowRight' });
    expect(map.getAttribute('aria-label')).not.toBe(initialLabel);
    fireEvent.keyDown(map, { key: 'Home' });
    expect(map.getAttribute('aria-label')).toBe(initialLabel);
    fireEvent.click(screen.getByRole('button', { name: 'Open Seoul' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_seoul' }));
    fireEvent.click(screen.getByText('Missing locations (1)'));
    fireEvent.click(screen.getByRole('button', { name: 'Unknown' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_missing' }));
  });

  test('falls back visibly when the explicitly enabled provider fails', () => {
    const externalView: DatabaseView = {
      ...view,
      layout: {
        type: 'map',
        configuration: { ...view.layout.configuration, basemap: 'openstreetmap' },
      },
    };
    render(<DatabaseMap source={source} view={externalView} result={result} />);
    const tile = document.querySelector('img[src*="tile.openstreetmap.org"]');
    expect(tile).toBeTruthy();
    fireEvent.error(tile as HTMLImageElement);
    expect(screen.getByRole('alert').textContent).toContain('private local map remains available');
    expect(document.querySelector('img[src*="tile.openstreetmap.org"]')).toBeNull();
  });
});
