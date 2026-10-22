/**
 * Database telemetry — in-memory, content-free counters for observability.
 *
 * Mirrors the `metrics.ts` convention: a flat counters object, exported
 * increment/record functions, and a `getDatabaseTelemetry()` snapshot getter.
 * Every field here is a count, duration, or bounded-cardinality label —
 * never a property value, record title, path, or Markdown body. Callers
 * must not pass content through this module.
 */

/** Bounded-cardinality outcome class for a database commit attempt. */
export type DatabaseCommitOutcomeClass = 'success' | 'conflict' | 'rollback' | 'failure';

/** Bounded-cardinality outcome for an index rebuild. */
export type DatabaseIndexRebuildOutcome = 'success' | 'failure';

export interface DatabaseTelemetryMetrics {
  commitCount: number;
  commitSuccessCount: number;
  commitConflictCount: number;
  commitRollbackCount: number;
  commitFailureCount: number;
  commitLatencyMsSum: number;
  commitLatencyMsCount: number;
  commitLatencyMsMax: number;
  indexRebuildCount: number;
  indexRebuildFailureCount: number;
  indexRebuildDurationMsSum: number;
  indexRebuildDurationMsCount: number;
  indexRebuildDurationMsMax: number;
  /** Count of Context Pack captures (agent retrieval reads). */
  contextPackCaptureCount: number;
  /** Sum of `budget.estimatedTokens` across captured packs — divide by
   *  `contextPackCaptureCount` for the mean; never the token content itself. */
  contextPackTokensEstimatedSum: number;
  /** Count of captured packs that were truncated (`!pack.isComplete`). */
  contextPackTruncatedCount: number;
  /** Count of automation runs that finalized as `state: 'failed'` (retries
   *  exhausted), not every failed attempt. */
  automationRunFailureCount: number;
  /** Count of task rollback journal applications that actually restored
   *  files (`status: 'applied'`), not idempotent replays. */
  taskRollbackAppliedCount: number;
}

const counters: DatabaseTelemetryMetrics = {
  commitCount: 0,
  commitSuccessCount: 0,
  commitConflictCount: 0,
  commitRollbackCount: 0,
  commitFailureCount: 0,
  commitLatencyMsSum: 0,
  commitLatencyMsCount: 0,
  commitLatencyMsMax: 0,
  indexRebuildCount: 0,
  indexRebuildFailureCount: 0,
  indexRebuildDurationMsSum: 0,
  indexRebuildDurationMsCount: 0,
  indexRebuildDurationMsMax: 0,
  contextPackCaptureCount: 0,
  contextPackTokensEstimatedSum: 0,
  contextPackTruncatedCount: 0,
  automationRunFailureCount: 0,
  taskRollbackAppliedCount: 0,
};

export function recordDatabaseCommit(
  outcomeClass: DatabaseCommitOutcomeClass,
  latencyMs: number,
): void {
  counters.commitCount++;
  if (outcomeClass === 'success') counters.commitSuccessCount++;
  else if (outcomeClass === 'conflict') counters.commitConflictCount++;
  else if (outcomeClass === 'rollback') counters.commitRollbackCount++;
  else counters.commitFailureCount++;
  const bounded = Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : 0;
  counters.commitLatencyMsSum += bounded;
  counters.commitLatencyMsCount++;
  if (bounded > counters.commitLatencyMsMax) counters.commitLatencyMsMax = bounded;
}

export function recordDatabaseIndexRebuild(
  outcome: DatabaseIndexRebuildOutcome,
  durationMs: number,
): void {
  counters.indexRebuildCount++;
  if (outcome === 'failure') counters.indexRebuildFailureCount++;
  const bounded = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  counters.indexRebuildDurationMsSum += bounded;
  counters.indexRebuildDurationMsCount++;
  if (bounded > counters.indexRebuildDurationMsMax) counters.indexRebuildDurationMsMax = bounded;
}

export function recordDatabaseContextPackCapture(input: {
  estimatedTokens: number;
  truncated: boolean;
}): void {
  counters.contextPackCaptureCount++;
  const bounded =
    Number.isFinite(input.estimatedTokens) && input.estimatedTokens >= 0
      ? input.estimatedTokens
      : 0;
  counters.contextPackTokensEstimatedSum += bounded;
  if (input.truncated) counters.contextPackTruncatedCount++;
}

export function incrementDatabaseAutomationRunFailure(): void {
  counters.automationRunFailureCount++;
}

export function incrementDatabaseTaskRollbackApplied(): void {
  counters.taskRollbackAppliedCount++;
}

export function getDatabaseTelemetry(): DatabaseTelemetryMetrics {
  return { ...counters };
}

export function resetDatabaseTelemetry(): void {
  counters.commitCount = 0;
  counters.commitSuccessCount = 0;
  counters.commitConflictCount = 0;
  counters.commitRollbackCount = 0;
  counters.commitFailureCount = 0;
  counters.commitLatencyMsSum = 0;
  counters.commitLatencyMsCount = 0;
  counters.commitLatencyMsMax = 0;
  counters.indexRebuildCount = 0;
  counters.indexRebuildFailureCount = 0;
  counters.indexRebuildDurationMsSum = 0;
  counters.indexRebuildDurationMsCount = 0;
  counters.indexRebuildDurationMsMax = 0;
  counters.contextPackCaptureCount = 0;
  counters.contextPackTokensEstimatedSum = 0;
  counters.contextPackTruncatedCount = 0;
  counters.automationRunFailureCount = 0;
  counters.taskRollbackAppliedCount = 0;
}
