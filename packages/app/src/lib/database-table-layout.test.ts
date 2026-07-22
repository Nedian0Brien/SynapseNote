import { describe, expect, test } from 'bun:test';
import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import {
  applyDatabaseSavedTableViewLayout,
  moveDatabaseTableProperty,
  reconcileDatabaseTableLayout,
} from './database-table-layout.ts';

const properties = [
  { id: 'prop_status', key: 'status', name: 'Status', type: 'text' },
  { id: 'prop_title', key: 'title', name: 'Title', type: 'title' },
  { id: 'prop_score', key: 'score', name: 'Score', type: 'number' },
] as DatabaseProperty[];

describe('database table layout', () => {
  test('reconciles saved stable IDs while forcing Title visible and first', () => {
    const layout = reconcileDatabaseTableLayout(properties, {
      propertyIds: ['prop_score', 'removed', 'prop_title'],
      hiddenPropertyIds: ['prop_title', 'prop_status', 'removed'],
      widths: { prop_title: 999, prop_score: 20 },
      rowHeight: 'tall',
      wrap: true,
    });
    expect(layout.propertyIds).toEqual(['prop_title', 'prop_score', 'prop_status']);
    expect(layout.hiddenPropertyIds).toEqual(['prop_status']);
    expect(layout.widths).toMatchObject({ prop_title: 480, prop_score: 120 });
    expect(layout).toMatchObject({ rowHeight: 'tall', wrap: true });
  });

  test('reorders non-title properties without moving across the frozen title', () => {
    const layout = reconcileDatabaseTableLayout(properties);
    expect(moveDatabaseTableProperty(layout, 'prop_score', -1).propertyIds).toEqual([
      'prop_title',
      'prop_score',
      'prop_status',
    ]);
    expect(moveDatabaseTableProperty(layout, 'prop_status', -1)).toEqual(layout);
    expect(moveDatabaseTableProperty(layout, 'prop_title', 1)).toEqual(layout);
  });

  test('applies canonical view projection, order, and display without discarding local defaults', () => {
    const local = reconcileDatabaseTableLayout(properties, {
      propertyIds: ['prop_title', 'prop_status', 'prop_score'],
      hiddenPropertyIds: ['prop_score'],
      widths: { prop_title: 300, prop_status: 200, prop_score: 160 },
      rowHeight: 'tall',
    });
    const savedView = applyDatabaseSavedTableViewLayout(
      properties,
      local,
      ['prop_score', 'prop_title'],
      {
        wrap: true,
        rowHeight: 'compact',
        propertyWidths: { prop_title: 320, prop_score: 240 },
      },
    );
    expect(savedView).toEqual({
      propertyIds: ['prop_title', 'prop_score', 'prop_status'],
      hiddenPropertyIds: ['prop_status'],
      widths: { prop_title: 320, prop_status: 200, prop_score: 240 },
      wrap: true,
      rowHeight: 'compact',
    });
    expect(local).toMatchObject({
      propertyIds: ['prop_title', 'prop_status', 'prop_score'],
      hiddenPropertyIds: ['prop_score'],
      rowHeight: 'tall',
    });
  });
});
