import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { repositoryRoot } from './command.ts';
import { percentile } from './measure.ts';
import type { OperationsMetrics } from './operations-metrics.ts';

interface OperationsRollup {
  cache: {
    hitRate: number | null;
    observedCount: number;
  };
  durationMs: {
    p50: number | null;
    p95: number | null;
  };
  sampleCount: number;
  test: {
    averageFailureRate: number | null;
    averageFlakyRate: number | null;
    totalRetries: number;
  };
  tiers: Record<string, number>;
}

export interface OperationsWeeklySummary extends OperationsRollup {
  weekStart: string;
}

export interface OperationsSummary extends OperationsRollup {
  generatedAt: string;
  weekly: OperationsWeeklySummary[];
  window: {
    completeFourWeeks: boolean;
    durationDays: number | null;
    latest: string | null;
    earliest: string | null;
    observedWeeks: number;
  };
}

function rollup(samples: OperationsMetrics[]): OperationsRollup {
  const durations = samples
    .map((sample) => sample.wallClockMs ?? sample.test.totalDurationMs)
    .filter((duration) => duration > 0);
  const observedCache = samples.filter((sample) => sample.cache.hit !== null);
  const tiers: Record<string, number> = {};
  for (const sample of samples) tiers[sample.tier] = (tiers[sample.tier] ?? 0) + 1;
  return {
    cache: {
      hitRate:
        observedCache.length === 0
          ? null
          : observedCache.filter((sample) => sample.cache.hit).length / observedCache.length,
      observedCount: observedCache.length,
    },
    durationMs: {
      p50: durations.length === 0 ? null : percentile(durations, 0.5),
      p95: durations.length === 0 ? null : percentile(durations, 0.95),
    },
    sampleCount: samples.length,
    test: {
      averageFailureRate:
        samples.length === 0
          ? null
          : samples.reduce((sum, sample) => sum + sample.test.failureRate, 0) / samples.length,
      averageFlakyRate:
        samples.length === 0
          ? null
          : samples.reduce((sum, sample) => sum + sample.retry.flakyRate, 0) / samples.length,
      totalRetries: samples.reduce((sum, sample) => sum + sample.retry.retryCount, 0),
    },
    tiers,
  };
}

function weekStartFor(timestamp: string): string | null {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function findMetricFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...findMetricFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.json')) paths.push(path);
  }
  return paths.sort();
}

export function aggregateOperations(directory: string): OperationsSummary {
  const samples = findMetricFiles(directory)
    .map((path) => {
      try {
        return JSON.parse(readFileSync(path, 'utf8')) as OperationsMetrics;
      } catch {
        return null;
      }
    })
    .filter((sample): sample is OperationsMetrics => sample?.schemaVersion === 1);
  const timestamps = samples.map((sample) => sample.generatedAt).sort();
  const earliestMs = timestamps.length > 0 ? Date.parse(timestamps[0]) : Number.NaN;
  const latestMs = timestamps.length > 0 ? Date.parse(timestamps.at(-1) ?? '') : Number.NaN;
  const durationDays =
    Number.isFinite(earliestMs) && Number.isFinite(latestMs)
      ? Math.max(0, (latestMs - earliestMs) / 86_400_000)
      : null;

  const weeklySamples = new Map<string, OperationsMetrics[]>();
  for (const sample of samples) {
    const weekStart = weekStartFor(sample.generatedAt);
    if (!weekStart) continue;
    const current = weeklySamples.get(weekStart) ?? [];
    current.push(sample);
    weeklySamples.set(weekStart, current);
  }
  const weekly = [...weeklySamples.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, weekSamples]) => ({ weekStart, ...rollup(weekSamples) }));
  return {
    ...rollup(samples),
    generatedAt: new Date().toISOString(),
    weekly,
    window: {
      completeFourWeeks: durationDays !== null && durationDays >= 28 && weekly.length >= 4,
      durationDays,
      latest: timestamps.at(-1) ?? null,
      earliest: timestamps[0] ?? null,
      observedWeeks: weekly.length,
    },
  };
}

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

if (import.meta.main) {
  const input = argumentValue('input');
  const output = argumentValue('output');
  const requiredWeeks = argumentValue('require-weeks');
  if (!input || !output) {
    console.error(
      '[operations] usage: bun scripts/test-feedback/aggregate-operations.ts --input=DIR --output=FILE',
    );
    process.exit(2);
  }
  const report = aggregateOperations(resolve(repositoryRoot, input));
  if (requiredWeeks !== undefined) {
    const weeks = Number(requiredWeeks);
    if (!Number.isInteger(weeks) || weeks < 1) {
      console.error('[operations] --require-weeks must be a positive integer');
      process.exit(2);
    }
    const durationDays = report.window.durationDays ?? 0;
    if (durationDays < weeks * 7 || report.window.observedWeeks < weeks) {
      console.error(
        `[operations] required ${weeks} week(s), observed ${durationDays.toFixed(1)} day(s) across ${report.window.observedWeeks} weekly bucket(s)`,
      );
      process.exit(1);
    }
  }
  const outputPath = resolve(repositoryRoot, output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[operations] aggregated ${report.sampleCount} sample(s) into ${outputPath}`);
}
