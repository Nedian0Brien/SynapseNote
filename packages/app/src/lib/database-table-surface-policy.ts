import { INTERACTION_HANDLE_TABLE_GAP } from './interaction-handle-geometry';

/**
 * The two table surfaces share one structural grid.  The inline surface only
 * differs in the controls that float beside that grid; those controls are not
 * a table column and must never be included in the track math.
 */
export type DatabaseTableSurfaceMode = 'inline' | 'canonical';

export interface DatabaseTableSurfacePolicy {
  mode: DatabaseTableSurfaceMode;
  selectorTrackWidth: number;
  actionsTrackWidth: number;
  interactionRailWidth: number;
  rowHandleGap: number;
}

export const DATABASE_TABLE_INTERACTION_RAIL_WIDTH = 44;
export const DATABASE_TABLE_ROW_HANDLE_GAP = INTERACTION_HANDLE_TABLE_GAP;

export function databaseTableSurfacePolicy(
  mode: DatabaseTableSurfaceMode,
): DatabaseTableSurfacePolicy {
  const inline = mode === 'inline';
  return {
    mode,
    selectorTrackWidth: inline ? 0 : 40,
    actionsTrackWidth: inline ? 144 : 128,
    interactionRailWidth: inline ? DATABASE_TABLE_INTERACTION_RAIL_WIDTH : 0,
    rowHandleGap: DATABASE_TABLE_ROW_HANDLE_GAP,
  };
}
