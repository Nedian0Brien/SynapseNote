import { describe, expect, test } from 'bun:test';
import type { ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';
import { createDatabaseTableVirtualRows } from './database-table-virtual-rows';

const record = (id: string): ProjectedDatabaseRecord => ({
  id,
  path: `${id}.md`,
  revision: null,
  values: {},
});

describe('database table virtual rows', () => {
  test('keeps short tables fully rendered', () => {
    const rows = createDatabaseTableVirtualRows({
      tableRecords: Array.from({ length: 3 }, (_, index) => ({
        record: record(String(index)),
        ghostCreated: false,
      })),
      rowHeightPixels: 36,
      scrollTop: 500,
      viewportHeight: 100,
    });
    expect(rows.virtualized).toBe(false);
    expect(rows.virtualStart).toBe(0);
    expect(rows.virtualEnd).toBe(3);
    expect(rows.renderedRecords.map((entry) => entry.rowIndex)).toEqual([0, 1, 2]);
  });

  test('derives an overscanned range with stable source row indices', () => {
    const rows = createDatabaseTableVirtualRows({
      tableRecords: Array.from({ length: 100 }, (_, index) => ({
        record: record(String(index)),
        ghostCreated: false,
      })),
      rowHeightPixels: 40,
      scrollTop: 1_600,
      viewportHeight: 200,
      overscan: 2,
    });
    expect(rows.virtualized).toBe(true);
    expect(rows.virtualStart).toBe(38);
    expect(rows.virtualEnd).toBe(47);
    expect(rows.renderedRecords[0]?.rowIndex).toBe(38);
    expect(rows.renderedRecords.at(-1)?.rowIndex).toBe(46);
  });
});
