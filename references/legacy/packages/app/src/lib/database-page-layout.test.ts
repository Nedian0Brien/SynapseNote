import { describe, expect, test } from 'bun:test';
import { DatabaseSourceSchema } from '@nedian0brien/synapsenote-core';
import { resolveDatabasePageLayout } from './database-page-layout';

const source = DatabaseSourceSchema.parse({
  id: 'ds_tasks',
  key: 'tasks',
  name: 'Tasks',
  recordMeaning: 'One task',
  folder: 'tasks',
  properties: [
    { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
    { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
    { id: 'prop_owner', key: 'owner', name: 'Owner', type: 'text' },
    { id: 'prop_notes', key: 'notes', name: 'Notes', type: 'text' },
    { id: 'prop_internal', key: 'internal', name: 'Internal', type: 'text' },
    { id: 'prop_new', key: 'new_field', name: 'New field', type: 'text' },
  ],
  pageLayout: {
    pinnedPropertyIds: ['prop_status'],
    panelPropertyIds: ['prop_owner'],
    hiddenPropertyIds: ['prop_internal'],
    sections: [
      {
        id: 'layout_section_details',
        key: 'details',
        name: 'Details',
        groups: [
          {
            id: 'layout_group_notes',
            key: 'notes',
            name: 'Notes group',
            propertyIds: ['prop_notes'],
          },
        ],
      },
    ],
    fullWidthContent: true,
  },
});

describe('resolveDatabasePageLayout', () => {
  test('preserves stable placement order and keeps newly added fields visible', () => {
    const resolved = resolveDatabasePageLayout(source);
    expect(resolved.pinned.map((property) => property.id)).toEqual(['prop_status']);
    expect(resolved.panel.map((property) => property.id)).toEqual(['prop_owner', 'prop_new']);
    expect(resolved.hidden.map((property) => property.id)).toEqual(['prop_internal']);
    expect(resolved.sections[0]?.groups[0]?.properties.map((property) => property.id)).toEqual([
      'prop_notes',
    ]);
    expect(resolved.fullWidthContent).toBe(true);
  });

  test('applies bounded record overrides without changing source section structure', () => {
    const resolved = resolveDatabasePageLayout(source, source.pageLayout, {
      pinnedPropertyIds: ['prop_owner'],
      panelPropertyIds: ['prop_internal'],
      hiddenPropertyIds: ['prop_status'],
      groupOverrides: [{ groupId: 'layout_group_notes', collapsed: true }],
      fullWidthContent: false,
    });
    expect(resolved.pinned.map((property) => property.id)).toEqual(['prop_owner']);
    expect(resolved.hidden.map((property) => property.id)).toEqual(['prop_status']);
    expect(resolved.panel.map((property) => property.id)).toEqual(['prop_internal', 'prop_new']);
    expect(resolved.sections[0]?.groups[0]).toMatchObject({
      id: 'layout_group_notes',
      collapsed: true,
    });
    expect(resolved.fullWidthContent).toBe(false);
  });
});
