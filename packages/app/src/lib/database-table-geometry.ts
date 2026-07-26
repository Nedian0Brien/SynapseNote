import type { DatabaseProperty } from '@nedian0brien/synapsenote-core';
import type { DatabaseTableLayoutState } from './database-table-layout';
import {
  DATABASE_TABLE_INTERACTION_RAIL_WIDTH,
  type DatabaseTableSurfaceMode,
  type DatabaseTableSurfacePolicy,
  databaseTableSurfacePolicy,
} from './database-table-surface-policy';

/** Numeric policy for the database table's structural columns. */
export const DATABASE_TABLE_COLUMN_MIN_WIDTH = 120;
export const DATABASE_TABLE_COLUMN_MAX_WIDTH = 480;
export const DATABASE_TABLE_DEFAULT_TITLE_WIDTH = 280;
export const DATABASE_TABLE_DEFAULT_PROPERTY_WIDTH = 180;
export const DATABASE_TABLE_TITLE_MIN_WIDTH = 224;
export const DATABASE_TABLE_SELECTOR_WIDTH = {
  canonical: databaseTableSurfacePolicy('canonical').selectorTrackWidth,
  notion: databaseTableSurfacePolicy('inline').selectorTrackWidth,
} as const;
/**
 * Interaction controls on the inline surface are a sibling overlay, not a
 * table track or scroll-owner inset. The property grid therefore starts at
 * Title while the add/grip controls float in the document-side gutter.
 */
export const DATABASE_TABLE_INTERACTION_GUTTER_WIDTH = DATABASE_TABLE_INTERACTION_RAIL_WIDTH;
export const DATABASE_TABLE_ACTIONS_WIDTH = {
  canonical: databaseTableSurfacePolicy('canonical').actionsTrackWidth,
  notion: databaseTableSurfacePolicy('inline').actionsTrackWidth,
} as const;

export interface DatabaseTablePropertyTrack {
  propertyId: string;
  width: number;
}

export interface DatabaseTableGeometry {
  surfaceMode: DatabaseTableSurfaceMode;
  surfacePolicy: DatabaseTableSurfacePolicy;
  /** Width of a real selector track. The inline surface intentionally uses 0. */
  selectorTrackWidth: number;
  /** Width of the real actions track at the right edge. */
  actionsTrackWidth: number;
  /** Width of the non-structural interaction rail outside the table. */
  interactionRailWidth: number;
  /** Numeric sticky inset for the first property track. */
  titleStickyInset: number;
  selectorWidth: number;
  propertyTracks: readonly DatabaseTablePropertyTrack[];
  fixedContentWidth: number;
  actionsWidth: number;
}

export function clampDatabaseTableColumnWidth(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(
    DATABASE_TABLE_COLUMN_MAX_WIDTH,
    Math.max(DATABASE_TABLE_COLUMN_MIN_WIDTH, value),
  );
}

function defaultPropertyWidth(property: DatabaseProperty): number {
  return property.type === 'title'
    ? DATABASE_TABLE_DEFAULT_TITLE_WIDTH
    : DATABASE_TABLE_DEFAULT_PROPERTY_WIDTH;
}

function propertyTrackWidth(property: DatabaseProperty, layout: DatabaseTableLayoutState): number {
  const persisted = clampDatabaseTableColumnWidth(layout.widths[property.id]);
  const width = persisted ?? defaultPropertyWidth(property);
  return property.type === 'title' ? Math.max(width, DATABASE_TABLE_TITLE_MIN_WIDTH) : width;
}

/**
 * Derives the complete table geometry from one layout snapshot.
 *
 * This module deliberately has no React or DOM dependency. The canvas owns
 * the resulting structural columns; header/body/footer only consume them.
 */
export function createDatabaseTableGeometry(input: {
  surfaceMode?: DatabaseTableSurfaceMode;
  /** Compatibility alias; callers should prefer surfaceMode. */
  notionSurface?: boolean;
  properties: readonly DatabaseProperty[];
  layout: DatabaseTableLayoutState;
}): DatabaseTableGeometry {
  const surfaceMode = input.surfaceMode ?? (input.notionSurface ? 'inline' : 'canonical');
  const surfacePolicy = databaseTableSurfacePolicy(surfaceMode);
  const selectorWidth = surfacePolicy.selectorTrackWidth;
  const actionsWidth = surfacePolicy.actionsTrackWidth;
  const propertyTracks = input.properties.map((property) => ({
    propertyId: property.id,
    width: propertyTrackWidth(property, input.layout),
  }));
  const fixedContentWidth =
    selectorWidth + actionsWidth + propertyTracks.reduce((total, track) => total + track.width, 0);
  return {
    surfaceMode,
    surfacePolicy,
    selectorTrackWidth: selectorWidth,
    actionsTrackWidth: actionsWidth,
    interactionRailWidth: surfacePolicy.interactionRailWidth,
    titleStickyInset: selectorWidth,
    // Keep the old names as read-only compatibility aliases while consumers
    // migrate to the semantic names above. They are derived from one value.
    selectorWidth,
    propertyTracks,
    fixedContentWidth,
    actionsWidth,
  };
}

export function databaseTablePropertyWidth(
  geometry: DatabaseTableGeometry,
  propertyId: string,
): number | undefined {
  return geometry.propertyTracks.find((track) => track.propertyId === propertyId)?.width;
}
