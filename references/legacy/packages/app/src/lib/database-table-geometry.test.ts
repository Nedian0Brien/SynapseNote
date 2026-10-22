import { describe, expect, test } from 'bun:test';
import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import {
  createDatabaseTableGeometry,
  DATABASE_TABLE_ACTIONS_WIDTH,
  DATABASE_TABLE_COLUMN_MAX_WIDTH,
  DATABASE_TABLE_COLUMN_MIN_WIDTH,
  DATABASE_TABLE_SELECTOR_WIDTH,
  DATABASE_TABLE_TITLE_MIN_WIDTH,
  databaseTablePropertyWidth,
} from './database-table-geometry';
import type { DatabaseTableLayoutState } from './database-table-layout';
import { databaseTableSurfacePolicy } from './database-table-surface-policy';

const properties: DatabaseProperty[] = [
  { id: 'title', key: 'title', name: 'Title', type: 'title' },
  { id: 'status', key: 'status', name: 'Status', type: 'text' },
  { id: 'owner', key: 'owner', name: 'Owner', type: 'text' },
];

const layout: DatabaseTableLayoutState = {
  propertyIds: ['title', 'status', 'owner'],
  hiddenPropertyIds: [],
  widths: { title: 120, status: 999, owner: 240 },
  wrap: false,
  rowHeight: 'standard',
};

describe('database table geometry', () => {
  test('keeps interaction controls outside structural table tracks', () => {
    const inline = databaseTableSurfacePolicy('inline');
    const canonical = databaseTableSurfacePolicy('canonical');
    expect(inline.selectorTrackWidth).toBe(0);
    expect(inline.interactionRailWidth).toBe(44);
    expect(inline.rowHandleGap).toBe(8);
    expect(canonical.selectorTrackWidth).toBe(40);
    expect(canonical.interactionRailWidth).toBe(0);
    expect(canonical.rowHandleGap).toBe(8);
  });

  test('uses one ordered track model and reserves the filler outside fixed content', () => {
    const geometry = createDatabaseTableGeometry({
      notionSurface: true,
      properties: properties.slice(0, 2),
      layout,
    });

    expect(geometry.selectorWidth).toBe(DATABASE_TABLE_SELECTOR_WIDTH.notion);
    expect(geometry.actionsWidth).toBe(DATABASE_TABLE_ACTIONS_WIDTH.notion);
    expect(geometry.propertyTracks).toEqual([
      { propertyId: 'title', width: DATABASE_TABLE_TITLE_MIN_WIDTH },
      { propertyId: 'status', width: DATABASE_TABLE_COLUMN_MAX_WIDTH },
    ]);
    expect(geometry.fixedContentWidth).toBe(
      geometry.selectorWidth +
        geometry.actionsWidth +
        DATABASE_TABLE_TITLE_MIN_WIDTH +
        DATABASE_TABLE_COLUMN_MAX_WIDTH,
    );
    expect(geometry.titleStickyInset).toBe(0);
  });

  test('clamps persisted widths and keeps the title minimum independent of surface', () => {
    const geometry = createDatabaseTableGeometry({
      notionSurface: false,
      properties,
      layout,
    });

    expect(databaseTablePropertyWidth(geometry, 'title')).toBe(DATABASE_TABLE_TITLE_MIN_WIDTH);
    expect(databaseTablePropertyWidth(geometry, 'status')).toBe(DATABASE_TABLE_COLUMN_MAX_WIDTH);
    expect(databaseTablePropertyWidth(geometry, 'owner')).toBe(240);
    expect(geometry.selectorWidth).toBe(DATABASE_TABLE_SELECTOR_WIDTH.canonical);
    expect(geometry.actionsWidth).toBe(DATABASE_TABLE_ACTIONS_WIDTH.canonical);
    expect(geometry.titleStickyInset).toBe(DATABASE_TABLE_SELECTOR_WIDTH.canonical);
    expect(DATABASE_TABLE_COLUMN_MIN_WIDTH).toBe(120);
  });

  test('follows visible property order without inventing widths for hidden properties', () => {
    const geometry = createDatabaseTableGeometry({
      notionSurface: true,
      properties: [properties[2], properties[0]],
      layout,
    });

    expect(geometry.propertyTracks.map((track) => track.propertyId)).toEqual(['owner', 'title']);
    expect(databaseTablePropertyWidth(geometry, 'status')).toBeUndefined();
  });
});
