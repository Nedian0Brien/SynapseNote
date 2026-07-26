import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { aggregateOperations } from './aggregate-operations.ts';

describe('operations report aggregation', () => {
  test('aggregates duration, cache, retry, failure, and tier samples', () => {
    const directory = mkdtempSync(join(tmpdir(), 'synapsenote-operations-'));
    mkdirSync(join(directory, 'nested'));
    const sample = (durationMs: number, hit: boolean, tier: string, wallClockMs?: number) => ({
      schemaVersion: 1,
      generatedAt: tier === 'pr' ? '2026-07-26T00:00:00.000Z' : '2026-08-23T00:00:00.000Z',
      tier,
      cache: { hit },
      retry: { flakyCount: 0, flakyRate: 0, policyRetries: 0, repeatEach: 1, retryCount: 0 },
      test: {
        failedCount: tier === 'nightly' ? 1 : 0,
        failureRate: tier === 'nightly' ? 0.1 : 0,
        junitFiles: 1,
        skippedCount: 0,
        totalCases: 10,
        totalDurationMs: durationMs,
        testFiles: 1,
      },
      wallClockMs: wallClockMs ?? null,
    });
    writeFileSync(join(directory, 'one.json'), JSON.stringify(sample(100, true, 'pr')));
    writeFileSync(
      join(directory, 'nested', 'two.json'),
      JSON.stringify(sample(300, false, 'nightly', 450)),
    );

    const report = aggregateOperations(directory);

    expect(report).toMatchObject({
      cache: { hitRate: 0.5, observedCount: 2 },
      durationMs: { p50: 100, p95: 450 },
      sampleCount: 2,
      test: { averageFailureRate: 0.05, totalRetries: 0 },
      tiers: { nightly: 1, pr: 1 },
      weekly: [
        { weekStart: '2026-07-20', sampleCount: 1 },
        { weekStart: '2026-08-17', sampleCount: 1 },
      ],
      window: { completeFourWeeks: false, durationDays: 28, observedWeeks: 2 },
    });
  });

  test('requires four weekly buckets in addition to a four-week date span', () => {
    const directory = mkdtempSync(join(tmpdir(), 'synapsenote-operations-window-'));
    const base = {
      schemaVersion: 1,
      tier: 'pr',
      cache: { hit: true },
      retry: { flakyCount: 0, flakyRate: 0, policyRetries: 0, repeatEach: 1, retryCount: 0 },
      test: {
        failedCount: 0,
        failureRate: 0,
        junitFiles: 1,
        skippedCount: 0,
        totalCases: 1,
        totalDurationMs: 100,
        testFiles: 1,
      },
      wallClockMs: 100,
    };
    for (const [index, generatedAt] of [
      '2026-07-26T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z',
      '2026-08-09T00:00:00.000Z',
      '2026-08-23T00:00:00.000Z',
    ].entries()) {
      writeFileSync(join(directory, `${index}.json`), JSON.stringify({ ...base, generatedAt }));
    }

    const report = aggregateOperations(directory);

    expect(report.window).toMatchObject({
      completeFourWeeks: true,
      durationDays: 28,
      observedWeeks: 4,
    });
  });
});
