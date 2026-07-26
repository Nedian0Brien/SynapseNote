import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { repositoryRoot } from './command.ts';
import { measureCommand, percentile, runtimeInfo } from './measure.ts';

const repeatCount = Number(process.env.FIRST_FAILURE_REPEATS ?? 3);
if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 10) {
  console.error('[first-failure] FIRST_FAILURE_REPEATS must be an integer from 1 to 10');
  process.exit(2);
}

const fixture = 'packages/server/src/__feedback_missing_fixture__.test.ts';
const logDirectory = process.env.FIRST_FAILURE_LOG_DIR ?? '/tmp/synapsenote-first-failure';
const reportPath = resolve(
  repositoryRoot,
  process.env.FIRST_FAILURE_REPORT ?? '/tmp/synapsenote-first-failure/report.json',
);
mkdirSync(logDirectory, { recursive: true });

const measurements = Array.from({ length: repeatCount }, (_, index) => {
  const logPath = join(logDirectory, `run-${index + 1}.log`);
  const measurement = measureCommand(
    process.execPath,
    ['run', 'test:file', '--', fixture],
    'missing test fixture',
    { logPath },
  );
  const output = readFileSync(logPath, 'utf8');
  return {
    ...measurement,
    command: ['bun', ...measurement.command.slice(1)],
    reportsFixture: output.includes(fixture),
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  fixture,
  repeatCount,
  runtime: runtimeInfo(),
  measurements,
  p95Ms: percentile(
    measurements.map((measurement) => measurement.durationMs),
    0.95,
  ),
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[first-failure] p95=${report.p95Ms}ms report=${reportPath}`);

const valid = measurements.every(
  (measurement) => measurement.status !== 0 && measurement.reportsFixture,
);
process.exit(valid ? 0 : 1);
