import {
  type DatabaseViewProps,
  databaseViewTabActionToInitialAction,
  InlineDatabaseSurface,
} from './InlineDatabaseSurface';

export type { DatabaseViewProps };
export { databaseViewTabActionToInitialAction };

/**
 * Stable editor/JSX compatibility entry point. All database read, mutation,
 * overlay, and renderer behavior lives in the inline surface modules so the
 * editor extension only needs to preserve the public component contract.
 */
export function DatabaseView(props: DatabaseViewProps) {
  return <InlineDatabaseSurface {...props} />;
}
