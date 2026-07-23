/**
 * Warm-local interaction budgets for the document-native database surface.
 *
 * These are product UX budgets, not server benchmark substitutes. Browser and
 * Electron journey measurements should record the same labels and compare
 * p95 values against this contract. Network cold starts, process startup, and
 * database materialisation are measured by their respective server/desktop
 * gates and are intentionally not folded into these interaction budgets.
 */
export const DATABASE_UX_LATENCY_BUDGETS_MS = {
  /** Existing editor chrome should reveal the database shell quickly. */
  shell: 250,
  /** A warm local catalog/describe/query should reveal the first rows. */
  firstData: 1_000,
  /** Switching an already-loaded saved view should feel immediate. */
  viewSwitch: 500,
  /** Direct-safe cell edits should acknowledge without a review interruption. */
  cellSave: 750,
  /** Opening a record peek should preserve the current view context. */
  recordPeek: 400,
} as const;

export type DatabaseUxLatencyBudget = keyof typeof DATABASE_UX_LATENCY_BUDGETS_MS;

export function databaseUxLatencyWithinBudget(
  budget: DatabaseUxLatencyBudget,
  elapsedMs: number,
): boolean {
  return (
    Number.isFinite(elapsedMs) &&
    elapsedMs >= 0 &&
    elapsedMs <= DATABASE_UX_LATENCY_BUDGETS_MS[budget]
  );
}
