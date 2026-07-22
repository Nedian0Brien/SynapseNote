import { afterEach, describe, expect, test } from 'bun:test';
import {
  getDatabaseTelemetry,
  incrementDatabaseAutomationRunFailure,
  incrementDatabaseTaskRollbackApplied,
  recordDatabaseCommit,
  recordDatabaseContextPackCapture,
  recordDatabaseIndexRebuild,
  resetDatabaseTelemetry,
} from './database-telemetry.ts';

afterEach(() => {
  resetDatabaseTelemetry();
});

describe('database telemetry', () => {
  test('starts at zero and every field is a number', () => {
    const metrics = getDatabaseTelemetry();
    for (const [key, value] of Object.entries(metrics)) {
      expect(typeof value).toBe('number');
      expect(value).toBe(0);
      void key;
    }
  });

  test('classifies commit outcomes into bounded-cardinality buckets and tracks latency', () => {
    recordDatabaseCommit('success', 10);
    recordDatabaseCommit('success', 30);
    recordDatabaseCommit('conflict', 5);
    recordDatabaseCommit('rollback', 40);
    recordDatabaseCommit('failure', 1);

    const metrics = getDatabaseTelemetry();
    expect(metrics.commitCount).toBe(5);
    expect(metrics.commitSuccessCount).toBe(2);
    expect(metrics.commitConflictCount).toBe(1);
    expect(metrics.commitRollbackCount).toBe(1);
    expect(metrics.commitFailureCount).toBe(1);
    expect(metrics.commitLatencyMsCount).toBe(5);
    expect(metrics.commitLatencyMsSum).toBe(86);
    expect(metrics.commitLatencyMsMax).toBe(40);
  });

  test('clamps negative or non-finite latency to zero rather than corrupting aggregates', () => {
    recordDatabaseCommit('success', Number.NaN);
    recordDatabaseCommit('success', -50);
    recordDatabaseCommit('success', Number.POSITIVE_INFINITY);

    const metrics = getDatabaseTelemetry();
    expect(metrics.commitLatencyMsCount).toBe(3);
    expect(metrics.commitLatencyMsSum).toBe(0);
    expect(metrics.commitLatencyMsMax).toBe(0);
  });

  test('tracks index rebuild duration and failure counts independently of success counts', () => {
    recordDatabaseIndexRebuild('success', 100);
    recordDatabaseIndexRebuild('failure', 250);

    const metrics = getDatabaseTelemetry();
    expect(metrics.indexRebuildCount).toBe(2);
    expect(metrics.indexRebuildFailureCount).toBe(1);
    expect(metrics.indexRebuildDurationMsSum).toBe(350);
    expect(metrics.indexRebuildDurationMsMax).toBe(250);
  });

  test('aggregates context pack captures as counts and token sums, never content', () => {
    recordDatabaseContextPackCapture({ estimatedTokens: 120, truncated: false });
    recordDatabaseContextPackCapture({ estimatedTokens: 400, truncated: true });

    const metrics = getDatabaseTelemetry();
    expect(metrics.contextPackCaptureCount).toBe(2);
    expect(metrics.contextPackTokensEstimatedSum).toBe(520);
    expect(metrics.contextPackTruncatedCount).toBe(1);
  });

  test('increments automation-failure and task-rollback-applied counters', () => {
    incrementDatabaseAutomationRunFailure();
    incrementDatabaseAutomationRunFailure();
    incrementDatabaseTaskRollbackApplied();

    const metrics = getDatabaseTelemetry();
    expect(metrics.automationRunFailureCount).toBe(2);
    expect(metrics.taskRollbackAppliedCount).toBe(1);
  });

  test('getDatabaseTelemetry returns an independent snapshot, not a live reference', () => {
    const before = getDatabaseTelemetry();
    recordDatabaseCommit('success', 1);
    expect(before.commitCount).toBe(0);
  });

  test('resetDatabaseTelemetry zeroes every counter', () => {
    recordDatabaseCommit('success', 10);
    recordDatabaseIndexRebuild('failure', 20);
    recordDatabaseContextPackCapture({ estimatedTokens: 5, truncated: true });
    incrementDatabaseAutomationRunFailure();
    incrementDatabaseTaskRollbackApplied();

    resetDatabaseTelemetry();

    const metrics = getDatabaseTelemetry();
    for (const value of Object.values(metrics)) {
      expect(value).toBe(0);
    }
  });
});
