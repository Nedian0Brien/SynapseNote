import type { ProjectedDatabaseRecord } from '@nedian0brien/synapsenote-core';

export interface DatabaseTableVirtualRowEntry {
  record: ProjectedDatabaseRecord;
  ghostCreated: boolean;
}

export interface DatabaseTableVirtualRows {
  virtualized: boolean;
  virtualStart: number;
  virtualEnd: number;
  renderedRecords: readonly (DatabaseTableVirtualRowEntry & { rowIndex: number })[];
}

/** Derives the visible row slice without reading layout or mutating runtime state. */
export function createDatabaseTableVirtualRows(input: {
  tableRecords: readonly DatabaseTableVirtualRowEntry[];
  rowHeightPixels: number;
  scrollTop: number;
  viewportHeight: number;
  virtualizationThreshold?: number;
  overscan?: number;
}): DatabaseTableVirtualRows {
  const threshold = input.virtualizationThreshold ?? 40;
  const overscan = input.overscan ?? 6;
  const virtualized = input.tableRecords.length > threshold;
  const virtualStart = virtualized
    ? Math.max(0, Math.floor(input.scrollTop / input.rowHeightPixels) - overscan)
    : 0;
  const virtualEnd = virtualized
    ? Math.min(
        input.tableRecords.length,
        Math.ceil((input.scrollTop + input.viewportHeight) / input.rowHeightPixels) + overscan,
      )
    : input.tableRecords.length;
  return {
    virtualized,
    virtualStart,
    virtualEnd,
    renderedRecords: input.tableRecords
      .slice(virtualStart, virtualEnd)
      .map((entry, offset) => ({ ...entry, rowIndex: virtualStart + offset })),
  };
}
