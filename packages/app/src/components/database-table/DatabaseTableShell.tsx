/**
 * Public table-shell boundary.
 *
 * The runtime implementation remains compatible with existing callers while
 * the table surface is composed from the viewport, header, body and
 * interaction-layer modules in this directory's parent. Keeping this entry
 * point small prevents new consumers from reaching into the runtime wiring.
 */
export { DatabaseTable as DatabaseTableShell } from '../DatabaseTableGrid';
export type { DatabaseTableProps } from '../database-table-types';
