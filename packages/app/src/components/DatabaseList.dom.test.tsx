import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  DatabaseQueryResult,
  DatabaseSource,
  DatabaseView,
} from '@nedian0brien/synapsenote-core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DatabaseList } from './DatabaseList';

const hash = `sha256:${'a'.repeat(64)}`;
const source: DatabaseSource = {
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_note', key: 'note', name: 'Note', type: 'text' },
    {
      id: 'prop_status',
      key: 'status',
      name: 'Status',
      type: 'select',
      options: [{ id: 'opt_active', key: 'active', name: 'Active' }],
    },
    {
      id: 'prop_parent',
      key: 'parent',
      name: 'Parent',
      type: 'relation',
      targetSourceId: 'ds_tasks',
      cardinality: 'one',
    },
  ],
};
const view: DatabaseView = {
  id: 'view_list',
  key: 'list',
  name: 'Task list',
  sourceId: source.id,
  layout: {
    type: 'list',
    configuration: {
      hierarchy: { type: 'parent_relation', propertyId: 'prop_parent' },
      density: 'compact',
      showSections: true,
      collapsibleSections: true,
      showDividers: true,
      loadLimit: 100,
    },
  },
  sort: [],
  groups: [{ propertyId: 'prop_status', direction: 'asc', hideEmpty: false }],
  projection: { propertyIds: ['prop_title', 'prop_note'], body: 'hidden' },
};
const result: DatabaseQueryResult = {
  sourceId: source.id,
  snapshotRevision: hash,
  matched: 2,
  returned: 2,
  isComplete: true,
  nextCursor: null,
  truncatedBy: null,
  indexFreshness: 'snapshot',
  records: [
    {
      id: 'rec_parent',
      path: 'tasks/parent.md',
      revision: hash,
      values: { prop_title: 'Parent', prop_note: 'Visible', prop_status: 'opt_active' },
    },
    {
      id: 'rec_child',
      path: 'tasks/child.md',
      revision: hash,
      values: {
        prop_title: 'Child',
        prop_note: 'Nested',
        prop_status: 'opt_active',
        prop_parent: ['rec_parent'],
      },
    },
  ],
  aggregation: null,
  groupMemberships: {
    rec_parent: [[{ propertyId: 'prop_status', value: 'opt_active' }]],
    rec_child: [[{ propertyId: 'prop_status', value: 'opt_active' }]],
  },
  conditionalColors: {
    rules: [
      {
        id: 'ccr_child_note',
        key: 'child-note',
        name: 'Child note',
        color: 'blue',
        applyTo: { type: 'property', propertyId: 'prop_note' },
      },
    ],
    records: { rec_child: { propertyRuleIds: { prop_note: 'ccr_child_note' } } },
  },
};

afterEach(cleanup);

describe('DatabaseList', () => {
  test('renders compact grouped hierarchy, projected properties, and keyboard navigation', () => {
    const onOpen = mock(() => {});
    render(<DatabaseList source={source} view={view} result={result} onOpen={onOpen} />);
    expect(screen.getByRole('region', { name: 'Active' })).toBeTruthy();
    const parent = document.querySelector<HTMLElement>('[data-list-row="rec_parent"]');
    const child = document.querySelector<HTMLElement>('[data-list-row="rec_child"]');
    expect(parent?.getAttribute('data-list-depth')).toBe('0');
    expect(child?.getAttribute('data-list-depth')).toBe('1');
    expect(child?.textContent).toContain('Nested');
    fireEvent.click(screen.getByRole('button', { name: 'Parent' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_parent' }));
    expect(
      child
        ?.querySelector('[data-list-property="prop_note"]')
        ?.getAttribute('data-conditional-color'),
    ).toBe('blue');
    parent?.focus();
    fireEvent.keyDown(parent as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(child);
    fireEvent.keyDown(child as HTMLElement, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'rec_child' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse rec_parent' }));
    expect(document.querySelector('[data-list-row="rec_child"]')).toBeNull();
  });

  test('offers record context inspection without opening the list row', () => {
    const onOpen = mock(() => {});
    const onOpenContextInspector = mock(() => {});
    render(
      <DatabaseList
        source={source}
        view={view}
        result={result}
        onOpen={onOpen}
        onOpenContextInspector={onOpenContextInspector}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Inspect context for record rec_child' }));
    expect(onOpenContextInspector).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rec_child' }),
    );
    expect(onOpen).not.toHaveBeenCalled();
  });
});
