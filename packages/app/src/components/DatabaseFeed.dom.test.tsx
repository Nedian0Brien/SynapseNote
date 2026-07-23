import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseFeed } from './DatabaseFeed';

const hash = `sha256:${'a'.repeat(64)}`;
const source: DatabaseSource = {
  id: 'ds_updates',
  key: 'updates',
  name: 'Team updates',
  recordMeaning: 'One update',
  folder: 'updates',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_edited', key: 'edited', name: 'Edited', type: 'last_edited_time' },
    { id: 'prop_editor', key: 'editor', name: 'Editor', type: 'last_edited_by' },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
  ],
};
const view: DatabaseView = {
  id: 'view_feed',
  key: 'feed',
  name: 'Updates',
  sourceId: source.id,
  layout: {
    type: 'feed',
    configuration: {
      chronologyPropertyId: 'prop_edited',
      authorPropertyId: 'prop_editor',
      density: 'comfortable',
      showProperties: true,
      readTracking: 'session',
      loadLimit: 50,
    },
  },
  sort: [{ propertyId: 'prop_edited', direction: 'desc' }],
  groups: [],
  projection: {
    propertyIds: ['prop_title', 'prop_edited', 'prop_editor', 'prop_status'],
    body: 'preview',
  },
};
const result: DatabaseQueryResult = {
  sourceId: source.id,
  snapshotRevision: hash,
  matched: 2,
  returned: 1,
  isComplete: false,
  nextCursor: 'v2:abcdef12:1',
  truncatedBy: 'page_limit',
  indexFreshness: 'snapshot',
  aggregation: null,
  records: [
    {
      id: 'rec_update',
      path: 'updates/launch.md',
      revision: hash,
      values: {
        prop_title: 'Launch complete',
        prop_edited: '2026-07-21T03:00:00.000Z',
        prop_editor: 'person_ada',
        prop_status: 'Published',
      },
    },
  ],
  people: [{ id: 'person_ada', name: 'Ada', kind: 'human', active: true }],
};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('DatabaseFeed', () => {
  test('renders chronology, source identity, projected properties, paging state, and session read state', () => {
    const onOpen = mock(() => {});
    render(<DatabaseFeed source={source} view={view} result={result} onOpen={onOpen} />);
    const card = document.querySelector('[data-feed-card="rec_update"]');
    expect(card?.getAttribute('data-read')).toBe('false');
    expect(card?.textContent).toContain('Ada');
    expect(card?.textContent).toContain('Team updates · updates/launch.md');
    expect(card?.textContent).toContain('Published');
    expect(screen.getByText(/Showing 1 of 2 items/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open record Launch complete' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(card?.getAttribute('data-read')).toBe('true');
    expect(
      JSON.parse(sessionStorage.getItem('synapsenote:database-feed-read:view_feed') ?? '[]'),
    ).toEqual(['rec_update']);
  });

  test('opens the canonical record from the feed title', () => {
    const onOpen = mock(() => {});
    render(<DatabaseFeed source={source} view={view} result={result} onOpen={onOpen} />);
    const title = document.querySelector<HTMLButtonElement>(
      '[data-record-title-link="rec_update"]',
    );
    expect(title?.textContent).toBe('Launch complete');
    if (!title) throw new Error('Feed title link is missing');
    fireEvent.click(title);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_update' }));
  });

  test('offers record context inspection from a feed item', () => {
    const onOpenContextInspector = mock(() => {});
    render(
      <DatabaseFeed
        source={source}
        view={view}
        result={result}
        onOpenContextInspector={onOpenContextInspector}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect context for record Launch complete' }),
    );
    expect(onOpenContextInspector).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rec_update' }),
    );
  });
});
