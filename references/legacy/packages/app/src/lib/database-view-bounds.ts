import type { DatabaseView } from '@nedian0brien/synapsenote-core';

export const DATABASE_TABLE_LOADED_RECORD_LIMIT = 5_000;
export const DATABASE_CARD_VIEW_LOADED_RECORD_LIMIT = 500;
const DATABASE_BROWSER_PAGE_SIZE = 100;

export function databaseBrowserLoadedRecordLimit(
  layoutType: DatabaseView['layout']['type'] | undefined,
): number {
  return layoutType === undefined || layoutType === 'table'
    ? DATABASE_TABLE_LOADED_RECORD_LIMIT
    : DATABASE_CARD_VIEW_LOADED_RECORD_LIMIT;
}

export function databaseBrowserNextPageLimit(
  layoutType: DatabaseView['layout']['type'] | undefined,
  loadedRecords: number,
): number {
  return Math.max(
    0,
    Math.min(
      DATABASE_BROWSER_PAGE_SIZE,
      databaseBrowserLoadedRecordLimit(layoutType) - loadedRecords,
    ),
  );
}
