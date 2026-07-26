import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { repositoryRoot } from './command.ts';
import {
  type Measurement,
  measureCommand,
  parseJUnit,
  percentile,
  runtimeInfo,
} from './measure.ts';

const repeatCount = Number(process.env.BASELINE_REPEATS ?? 3);
if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 10) {
  console.error('[baseline] BASELINE_REPEATS must be an integer from 1 to 10');
  process.exit(2);
}

const outputDirectory = join(repositoryRoot, 'docs/rfcs/0007-test-feedback-baseline');
mkdirSync(outputDirectory, { recursive: true });

const commands = [
  {
    label: 'L0 server version file',
    args: ['run', 'test:file', '--', 'packages/server/src/version-constants.test.ts'],
  },
  {
    label: 'L1 server startup domain',
    args: ['run', 'check:domain', '--', 'server-startup'],
  },
  {
    label: 'L2 server unit package task',
    args: ['run', '--cwd', 'packages/server', 'test:unit'],
  },
  {
    label: 'database focused domain',
    args: ['run', 'check:domain', '--', 'database'],
  },
  {
    label: 'repository gate',
    args: ['run', 'check:repository'],
  },
];

type BaselineMeasurement = Measurement & {
  fileTimings: Record<string, number>;
  junitFiles: number;
};

function junitFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...junitFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.xml')) files.push(path);
  }
  return files;
}

function fileTimings(directory: string): {
  fileTimings: Record<string, number>;
  junitFiles: number;
} {
  const timings: Record<string, number> = {};
  const files = junitFiles(directory);
  for (const path of files) {
    for (const testCase of parseJUnit(readFileSync(path, 'utf8'))) {
      const file = testCase.file ?? testCase.classname ?? testCase.name;
      timings[file] = (timings[file] ?? 0) + testCase.durationMs;
    }
  }
  return { fileTimings: timings, junitFiles: files.length };
}

const measurements: BaselineMeasurement[] = [];
const phases = ['cold', 'warm'] as const;
const logDirectory = process.env.BASELINE_LOG_DIR ?? '/tmp/synapsenote-test-feedback-baseline';
const junitDirectory = process.env.BASELINE_JUNIT_DIR ?? '/tmp/synapsenote-test-feedback-junit';
for (const phase of phases) {
  for (const command of commands) {
    for (let iteration = 1; iteration <= repeatCount; iteration += 1) {
      const label = `${phase} ${command.label}`;
      const resultDirectory = join(
        junitDirectory,
        phase,
        command.label.replaceAll(' ', '-'),
        String(iteration),
      );
      console.log(`[baseline] ${label} ${iteration}/${repeatCount}`);
      const measurement = measureCommand(process.execPath, command.args, label, {
        env: {
          TEST_FEEDBACK_BASELINE_PHASE: phase,
          TEST_RESULTS_DIR: resultDirectory,
        },
        logPath: join(
          logDirectory,
          `${phase}-${command.label.replaceAll(' ', '-')}-${iteration}.log`,
        ),
      });
      measurements.push({ ...measurement, ...fileTimings(resultDirectory) });
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  logDirectory: 'external-temp',
  repeatCount,
  runtime: runtimeInfo(),
  measurements: measurements.map((measurement) => ({
    ...measurement,
    command: [
      measurement.command[0] === process.execPath ? 'bun' : measurement.command[0],
      ...measurement.command.slice(1),
    ],
  })),
  summary: [
    ...new Set(measurements.map((measurement) => measurement.label.split(' ').slice(1).join(' '))),
  ].map((label) => {
    const forLabel = measurements.filter((measurement) => measurement.label.endsWith(label));
    return {
      label,
      count: forLabel.length,
      p50Ms: percentile(
        forLabel.map((measurement) => measurement.durationMs),
        0.5,
      ),
      p95Ms: percentile(
        forLabel.map((measurement) => measurement.durationMs),
        0.95,
      ),
      failedCount: forLabel.filter((measurement) => measurement.status !== 0).length,
    };
  }),
  notes: [
    'A failed command remains a failed measurement; no retry is applied by this collector.',
    'JUnit file-level timings are collected when the runner emits JUnit; server shard aggregation is the authoritative CI result.',
  ],
};
writeFileSync(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`[baseline] wrote ${join(outputDirectory, 'report.json')}`);
process.exit(measurements.every((measurement) => measurement.status === 0) ? 0 : 1);
