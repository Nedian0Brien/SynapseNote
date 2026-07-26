import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { repositoryRoot } from './command.ts';
import { type Measurement, percentile, runtimeInfo } from './measure.ts';

const SHARD_COUNT = 4;

export interface ServerShardReport {
  generatedAt: string;
  measurements: Measurement[];
  repeatCount: number;
  runtime: ReturnType<typeof runtimeInfo>;
  shardCount: number;
  summary: {
    failedCount: number;
    maxShardP95Ms: number;
    p95ByShardMs: Record<string, number>;
    timingSloMet: boolean;
    withinBudget: boolean;
  };
}

function parseRepeats(): number {
  const value = Number(process.env.SERVER_SHARD_REPEATS ?? 3);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new Error('[server-shards] SERVER_SHARD_REPEATS must be an integer from 1 to 10');
  }
  return value;
}

function outputPath(): string {
  return resolve(
    repositoryRoot,
    process.env.SERVER_SHARD_REPORT ?? 'docs/rfcs/0007-test-feedback-baseline/server-shards.json',
  );
}

function resultRoot(): string {
  return resolve(
    repositoryRoot,
    process.env.SERVER_SHARD_RESULTS ?? '/tmp/synapsenote-server-shard-benchmark',
  );
}

function runShard(iteration: number, shard: number, root: string): Promise<Measurement> {
  const label = `server shard ${shard}/${SHARD_COUNT} ${iteration}`;
  const resultDirectory = join(root, `round-${iteration}`, `shard-${shard}`);
  const logPath = join(root, 'logs', `round-${iteration}-shard-${shard}.log`);
  mkdirSync(resultDirectory, { recursive: true });
  mkdirSync(dirname(logPath), { recursive: true });

  const args = [
    'packages/server/scripts/run-server-test-task.ts',
    'all',
    `--shard=${shard}/${SHARD_COUNT}`,
  ];
  const timingsPath = process.env.SERVER_SHARD_TIMINGS;
  if (timingsPath) args.push(`--timings=${timingsPath}`);

  const environment = { ...process.env, TEST_RESULTS_DIR: resultDirectory };
  delete environment.SYNAPSENOTE_SERVER_TEST_MAX_CONCURRENCY;
  const started = performance.now();
  const child = spawn(process.execPath, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });

  return new Promise((resolveMeasurement) => {
    child.on('close', (status) => {
      const measurement: Measurement = {
        command: [process.execPath, ...args],
        durationMs: Math.round((performance.now() - started) * 1000) / 1000,
        label,
        status: status ?? 1,
      };
      writeFileSync(logPath, output);
      resolveMeasurement(measurement);
    });
    child.on('error', (error) => {
      output += `\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`;
    });
  });
}

if (import.meta.main) {
  let repeatCount: number;
  try {
    repeatCount = parseRepeats();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }

  const root = resultRoot();
  mkdirSync(root, { recursive: true });
  const measurements: Measurement[] = [];
  for (let iteration = 1; iteration <= repeatCount; iteration += 1) {
    console.log(`[server-shards] round ${iteration}/${repeatCount}`);
    measurements.push(
      ...(await Promise.all(
        Array.from({ length: SHARD_COUNT }, (_, index) => runShard(iteration, index + 1, root)),
      )),
    );
  }

  const p95ByShardMs: Record<string, number> = {};
  for (let shard = 1; shard <= SHARD_COUNT; shard += 1) {
    p95ByShardMs[String(shard)] = percentile(
      measurements
        .filter((measurement) => measurement.label.includes(`shard ${shard}/`))
        .map((measurement) => measurement.durationMs),
      0.95,
    );
  }
  const maxByRound = Array.from({ length: repeatCount }, (_, index) =>
    Math.max(
      ...measurements
        .filter((measurement) => measurement.label.endsWith(` ${index + 1}`))
        .map((measurement) => measurement.durationMs),
    ),
  );
  const maxShardP95Ms = percentile(maxByRound, 0.95);
  const reportMeasurements = measurements.map((measurement) => ({
    ...measurement,
    command: [
      measurement.command[0] === process.execPath ? 'bun' : measurement.command[0],
      ...measurement.command.slice(1),
    ],
  }));
  const timingSloMet = maxShardP95Ms <= 240_000;
  const report: ServerShardReport = {
    generatedAt: new Date().toISOString(),
    measurements: reportMeasurements,
    repeatCount,
    runtime: runtimeInfo(),
    shardCount: SHARD_COUNT,
    summary: {
      failedCount: measurements.filter((measurement) => measurement.status !== 0).length,
      maxShardP95Ms,
      p95ByShardMs,
      timingSloMet,
      withinBudget: measurements.every((measurement) => measurement.status === 0) && timingSloMet,
    },
  };
  const output = outputPath();
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[server-shards] wrote ${output}`);
  process.exit(report.summary.withinBudget ? 0 : 1);
}
