import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { aggregateJUnitResults } from './aggregate-results.ts';
import { repositoryRoot } from './command.ts';
import { feedbackTier, testFeedbackPolicy } from './policy.ts';

export interface OperationsMetrics {
  cache: {
    hit: boolean | null;
  };
  generatedAt: string;
  github: {
    event: string | null;
    job: string | null;
    runId: string | null;
    sha: string | null;
    workflow: string | null;
  };
  queueTimeMs: number | null;
  retry: {
    flakyCount: number;
    flakyRate: number;
    policyRetries: number;
    repeatEach: number;
    retryCount: number;
  };
  schemaVersion: 1;
  source: string;
  test: {
    failedCount: number;
    failureRate: number;
    junitFiles: number;
    skippedCount: number;
    totalCases: number;
    totalDurationMs: number;
    testFiles: number;
  };
  tier: ReturnType<typeof feedbackTier>;
  wallClockMs: number | null;
}

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function optionalNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalBoolean(value: string | undefined): boolean | null {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return null;
}

export function collectOperationsMetrics(inputDirectory: string): OperationsMetrics {
  const report = aggregateJUnitResults(inputDirectory);
  const policy = testFeedbackPolicy();
  const totalCases = report.summary.totalCases;
  const failedCount = report.summary.failedCases;
  const flakyCount = Number(process.env.TEST_FEEDBACK_FLAKY_COUNT ?? 0);
  const retryCount = Number(process.env.TEST_FEEDBACK_RETRY_COUNT ?? 0);
  const safeFlakyCount = Number.isFinite(flakyCount) && flakyCount >= 0 ? flakyCount : 0;
  const safeRetryCount = Number.isFinite(retryCount) && retryCount >= 0 ? retryCount : 0;

  return {
    cache: { hit: optionalBoolean(process.env.TEST_FEEDBACK_TURBO_CACHE_HIT) },
    generatedAt: new Date().toISOString(),
    github: {
      event: process.env.GITHUB_EVENT_NAME ?? null,
      job: process.env.GITHUB_JOB ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      sha: process.env.GITHUB_SHA ?? null,
      workflow: process.env.GITHUB_WORKFLOW ?? null,
    },
    queueTimeMs: optionalNumber(process.env.TEST_FEEDBACK_QUEUE_TIME_MS),
    retry: {
      flakyCount: safeFlakyCount,
      flakyRate: totalCases === 0 ? 0 : safeFlakyCount / totalCases,
      policyRetries: policy.retries,
      repeatEach: policy.repeatEach,
      retryCount: safeRetryCount,
    },
    schemaVersion: 1,
    source: basename(inputDirectory),
    test: {
      failedCount,
      failureRate: totalCases === 0 ? 0 : failedCount / totalCases,
      junitFiles: report.summary.junitFiles,
      skippedCount: report.summary.skippedCases,
      totalCases,
      totalDurationMs: report.summary.totalDurationMs,
      testFiles: report.summary.testFiles,
    },
    tier: feedbackTier(),
    wallClockMs: optionalNumber(process.env.TEST_FEEDBACK_WALL_CLOCK_MS),
  };
}

if (import.meta.main) {
  const input = argumentValue('input');
  const output = argumentValue('output');
  if (!input || !output) {
    console.error(
      '[metrics] usage: bun scripts/test-feedback/operations-metrics.ts --input=DIR --output=FILE',
    );
    process.exit(2);
  }
  const report = collectOperationsMetrics(resolve(repositoryRoot, input));
  const outputPath = resolve(repositoryRoot, output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[metrics] wrote ${outputPath}`);
}
