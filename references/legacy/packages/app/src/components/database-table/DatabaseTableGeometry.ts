/**
 * One coordinate system for database table layout.
 *
 * The database feature is not present in this checkout yet, so this module is
 * deliberately framework-free. The eventual table shell, header and
 * interaction layer can all consume this contract without reintroducing the
 * historical "selection column + independent padding" drift.
 */

export const DATABASE_TABLE_INTERACTION_GUTTER_PX = 40;
export const DATABASE_TABLE_TITLE_MIN_WIDTH_PX = 280;
export const DATABASE_TABLE_PROPERTY_MIN_WIDTH_PX = 180;
export const DATABASE_TABLE_ADD_PROPERTY_WIDTH_PX = 44;

export interface DatabaseTableGeometryInput {
  viewportWidth: number;
  titleWidth?: number;
  propertyWidths?: readonly number[];
  addPropertyWidth?: number;
  interactionGutterWidth?: number;
}

export interface DatabaseTableGeometry {
  /** Width reserved for the hover/drag overlay outside the table grid. */
  interactionGutterWidth: number;
  /** Grid tracks for title, properties and the add-property affordance. */
  columnWidths: readonly number[];
  gridTemplateColumns: string;
  contentWidth: number;
  viewportWidth: number;
  needsHorizontalScroll: boolean;
  /** Sticky header offset in the table's scroll coordinate system. */
  stickyHeaderOffset: number;
  /** Title starts at the same coordinate in header and body. */
  titleStart: number;
}

function finitePositive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : fallback;
}

function px(value: number): string {
  return `${Math.round(value)}px`;
}

export function createDatabaseTableGeometry(
  input: DatabaseTableGeometryInput,
): DatabaseTableGeometry {
  const viewportWidth = Math.max(0, Math.round(input.viewportWidth));
  const interactionGutterWidth = finitePositive(
    input.interactionGutterWidth,
    DATABASE_TABLE_INTERACTION_GUTTER_PX,
  );
  const titleWidth = Math.max(
    DATABASE_TABLE_TITLE_MIN_WIDTH_PX,
    finitePositive(input.titleWidth, DATABASE_TABLE_TITLE_MIN_WIDTH_PX),
  );
  const propertyWidths = (input.propertyWidths ?? []).map((width) =>
    Math.max(
      DATABASE_TABLE_PROPERTY_MIN_WIDTH_PX,
      finitePositive(width, DATABASE_TABLE_PROPERTY_MIN_WIDTH_PX),
    ),
  );
  const addPropertyWidth = Math.max(
    DATABASE_TABLE_ADD_PROPERTY_WIDTH_PX,
    finitePositive(input.addPropertyWidth, DATABASE_TABLE_ADD_PROPERTY_WIDTH_PX),
  );
  const columnWidths = [titleWidth, ...propertyWidths, addPropertyWidth];
  const contentWidth = columnWidths.reduce((sum, width) => sum + width, 0);

  return {
    interactionGutterWidth,
    columnWidths,
    gridTemplateColumns: columnWidths.map(px).join(' '),
    contentWidth,
    viewportWidth,
    needsHorizontalScroll: contentWidth > viewportWidth,
    stickyHeaderOffset: 0,
    titleStart: 0,
  };
}

/** Stable row identity must not include view overlays, loading tokens or hover state. */
export function databaseRowIdentity(sourceId: string, viewId: string, recordId: string): string {
  return `${sourceId}\u0000${viewId}\u0000${recordId}`;
}
