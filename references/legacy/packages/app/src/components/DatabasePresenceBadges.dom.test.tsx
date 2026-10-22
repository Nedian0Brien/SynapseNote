import { afterEach, describe, expect, test } from 'bun:test';
import type { DatabasePresenceEntry } from '@nedian0brien/synapsenote-core';
import { cleanup, render, screen } from '@testing-library/react';
import { DatabasePresenceBadges } from './DatabasePresenceBadges';

afterEach(cleanup);

const entry: DatabasePresenceEntry = {
  actor: { kind: 'agent', name: 'Research agent', color: '#2563eb' },
  databaseId: 'db_tasks',
  sourceId: 'ds_tasks',
  recordId: 'rec_one',
  propertyId: 'prop_status',
  viewId: null,
  scope: 'cell',
  operation: 'editing',
  updatedAt: 1_000,
};

describe('DatabasePresenceBadges', () => {
  test('renders attributed, accessible collaborator state on the requested surface', () => {
    const { container } = render(<DatabasePresenceBadges entries={[entry]} scope="cell" />);
    expect(screen.getByLabelText('Research agent is editing')).toBeTruthy();
    expect(container.querySelector('[data-database-presence="cell"]')).toBeTruthy();
  });

  test('stays absent when no collaborator is present', () => {
    const { container } = render(<DatabasePresenceBadges entries={[]} scope="record" />);
    expect(container.firstChild).toBeNull();
  });
});
