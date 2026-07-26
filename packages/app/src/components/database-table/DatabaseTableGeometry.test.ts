import { describe, expect, test } from 'bun:test';
import {
  createDatabaseTableGeometry,
  DATABASE_TABLE_INTERACTION_GUTTER_PX,
  DATABASE_TABLE_PROPERTY_MIN_WIDTH_PX,
  DATABASE_TABLE_TITLE_MIN_WIDTH_PX,
  databaseRowIdentity,
} from './DatabaseTableGeometry';

describe('database table geometry contract', () => {
  test('keeps the interaction gutter outside the table grid', () => {
    const geometry = createDatabaseTableGeometry({
      viewportWidth: 320,
      titleWidth: 120,
      propertyWidths: [100, 100],
    });
    expect(geometry.interactionGutterWidth).toBe(DATABASE_TABLE_INTERACTION_GUTTER_PX);
    expect(geometry.columnWidths[0]).toBe(DATABASE_TABLE_TITLE_MIN_WIDTH_PX);
    expect(geometry.gridTemplateColumns).not.toContain(`${DATABASE_TABLE_INTERACTION_GUTTER_PX}px`);
    expect(geometry.needsHorizontalScroll).toBe(true);
  });

  test('clamps property tracks and keeps header/body tracks identical', () => {
    const geometry = createDatabaseTableGeometry({
      viewportWidth: 1200,
      titleWidth: 360,
      propertyWidths: [10, 240],
    });
    expect(geometry.columnWidths).toEqual([360, DATABASE_TABLE_PROPERTY_MIN_WIDTH_PX, 240, 44]);
    expect(geometry.gridTemplateColumns.split(' ').length).toBe(geometry.columnWidths.length);
    expect(geometry.titleStart).toBe(0);
  });

  test('row identity is stable across overlay and mutation state', () => {
    expect(databaseRowIdentity('db', 'table', 'row')).toBe(
      databaseRowIdentity('db', 'table', 'row'),
    );
    expect(databaseRowIdentity('db', 'table', 'row')).not.toBe(
      databaseRowIdentity('db', 'board', 'row'),
    );
  });
});
