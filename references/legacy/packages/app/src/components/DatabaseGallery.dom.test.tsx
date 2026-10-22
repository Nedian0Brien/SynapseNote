import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseValue,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseGallery } from './DatabaseGallery';

const hash = `sha256:${'a'.repeat(64)}`;
const source: DatabaseSource = {
  id: 'ds_assets',
  key: 'assets',
  name: 'Assets',
  recordMeaning: 'One asset',
  folder: 'assets',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_media', key: 'media', name: 'Media', type: 'files' },
    { id: 'prop_note', key: 'note', name: 'Note', type: 'text' },
  ],
};
const view: DatabaseView = {
  id: 'view_gallery',
  key: 'gallery',
  name: 'Asset gallery',
  sourceId: source.id,
  layout: {
    type: 'gallery',
    configuration: {
      cardSize: 'large',
      cardPreview: { type: 'files', propertyId: 'prop_media' },
      fitImage: true,
      showTitle: true,
      fallbackStyle: 'color',
      loadLimit: 100,
    },
  },
  sort: [],
  groups: [],
  projection: { propertyIds: ['prop_title', 'prop_note'], body: 'hidden' },
};

function record(id: string, media: DatabaseValue, note: string) {
  return {
    id,
    path: `assets/${id}.md`,
    revision: hash,
    values: { prop_title: id, prop_media: media, prop_note: note },
  };
}

const result: DatabaseQueryResult = {
  sourceId: source.id,
  snapshotRevision: hash,
  matched: 4,
  returned: 4,
  isComplete: true,
  nextCursor: null,
  truncatedBy: null,
  indexFreshness: 'snapshot',
  records: [
    record(
      'rec_image',
      [{ kind: 'local', path: 'media/cover.png', caption: 'Cover caption' }],
      'Visible detail',
    ),
    record('rec_missing', [{ kind: 'local', path: 'media/missing.jpg' }], 'Missing detail'),
    record(
      'rec_external',
      [{ kind: 'external', url: 'https://example.com/private.png' }],
      'External detail',
    ),
    record('rec_pdf', [{ kind: 'local', path: 'media/brief.pdf' }], 'PDF detail'),
  ],
  aggregation: null,
  fileStates: {
    'media/cover.png': 'available',
    'media/missing.jpg': 'missing',
    'media/brief.pdf': 'available',
  },
  conditionalColors: {
    rules: [
      {
        id: 'ccr_note',
        key: 'note',
        name: 'Note',
        color: 'blue',
        applyTo: { type: 'property', propertyId: 'prop_note' },
      },
    ],
    records: { rec_image: { propertyRuleIds: { prop_note: 'ccr_note' } } },
  },
};

afterEach(cleanup);

describe('DatabaseGallery', () => {
  test('loads only available local images and renders explicit safe fallbacks', () => {
    const onOpen = mock(() => {});
    render(<DatabaseGallery source={source} view={view} result={result} onOpen={onOpen} />);
    const image = screen.getByRole('img', { name: 'Cover caption' });
    expect(image.getAttribute('src')).toContain('/api/asset?path=media%2Fcover.png');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.className).toContain('object-contain');
    expect(document.querySelector('[data-gallery-fallback="missing"]')).toBeTruthy();
    expect(document.querySelector('[data-gallery-fallback="external"]')).toBeTruthy();
    expect(document.querySelector('[data-gallery-fallback="unsupported"]')).toBeTruthy();
    expect(document.querySelector('img[src*="example.com"]')).toBeNull();
    expect(
      document
        .querySelector('[data-gallery-card="rec_image"] [data-gallery-property="prop_note"]')
        ?.getAttribute('data-conditional-color'),
    ).toBe('blue');
    expect(screen.getByText('Visible detail')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'rec_image' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_image' }));
  });

  test('replaces an image load failure with explicit fallback art', () => {
    render(<DatabaseGallery source={source} view={view} result={result} />);
    fireEvent.error(screen.getByRole('img', { name: 'Cover caption' }));
    expect(document.querySelector('[data-gallery-fallback="error"]')).toBeTruthy();
  });

  test('offers record context inspection from a gallery card', () => {
    const onOpenContextInspector = mock(() => {});
    render(
      <DatabaseGallery
        source={source}
        view={view}
        result={result}
        onOpenContextInspector={onOpenContextInspector}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Inspect context for record rec_image' }));
    expect(onOpenContextInspector).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rec_image' }),
    );
  });
});
