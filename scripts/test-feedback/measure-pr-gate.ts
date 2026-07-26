import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { repositoryRoot } from './command.ts';
import { type Measurement, measureCommand, percentile, runtimeInfo } from './measure.ts';

export const PR_GATE_SCENARIOS = ['app-only', 'server-only', 'cross-package'] as const;
export type PrGateScenario = (typeof PR_GATE_SCENARIOS)[number];

export const PR_GATE_COMMANDS: Record<PrGateScenario, string[]> = {
  'app-only': ['run', 'check:package', '--', 'app'],
  'server-only': ['scripts/test-feedback/run-server-pr-gate.ts'],
  'cross-package': ['run', 'check:repository'],
};

export interface PrGateReport {
  generatedAt: string;
  measurements: Measurement[];
  repeatCount: number;
  runtime: ReturnType<typeof runtimeInfo>;
  scenario: PrGateScenario;
  summary: {
    failedCount: number;
    p50Ms: number;
    p95Ms: number;
    withinBudget: boolean;
  };
}

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function parseScenario(): PrGateScenario {
  const value = argumentValue('scenario');
  if (value && PR_GATE_SCENARIOS.includes(value as PrGateScenario)) return value as PrGateScenario;
  throw new Error(
    `[pr-gate] --scenario must be one of ${PR_GATE_SCENARIOS.join(', ')} (received ${value ?? '(missing)'})`,
  );
}

function parseRepeats(): number {
  const value = Number(process.env.PR_GATE_REPEATS ?? 10);
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error('[pr-gate] PR_GATE_REPEATS must be an integer from 1 to 20');
  }
  return value;
}

function reportPath(scenario: PrGateScenario): string {
  return resolve(
    repositoryRoot,
    process.env.PR_GATE_REPORT ?? `docs/rfcs/0007-test-feedback-baseline/pr-gate-${scenario}.json`,
  );
}

function logDirectory(scenario: PrGateScenario): string {
  return resolve(
    repositoryRoot,
    process.env.PR_GATE_LOG_DIR ?? `/tmp/synapsenote-pr-gate/${scenario}`,
  );
}

export function prGateEnvironment(
  scenario: PrGateScenario,
  logs: string,
  iteration: number,
): Record<string, string> {
  return {
    TEST_FEEDBACK_TIER: 'pr',
    ...(scenario === 'server-only'
      ? {
          SERVER_PR_GATE_LOG_DIR: join(logs, 'server', String(iteration)),
          SERVER_PR_GATE_RESULTS_DIR: join(logs, 'server-results', String(iteration)),
        }
      : {}),
  };
}

if (import.meta.main) {
  let scenario: PrGateScenario;
  let repeatCount: number;
  try {
    scenario = parseScenario();
    repeatCount = parseRepeats();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }

  const logs = logDirectory(scenario);
  mkdirSync(logs, { recursive: true });
  const measurements: Measurement[] = [];
  const command = PR_GATE_COMMANDS[scenario];
  for (let iteration = 1; iteration <= repeatCount; iteration += 1) {
    const label = `PR gate ${scenario} ${iteration}/${repeatCount}`;
    console.log(`[pr-gate] ${label}`);
    measurements.push(
      measureCommand(process.execPath, command, label, {
        env: prGateEnvironment(scenario, logs, iteration),
        logPath: join(logs, `${iteration}.log`),
      }),
    );
  }

  const durations = measurements.map((measurement) => measurement.durationMs);
  const reportMeasurements = measurements.map((measurement) => ({
    ...measurement,
    command: [
      measurement.command[0] === process.execPath ? 'bun' : measurement.command[0],
      ...measurement.command.slice(1),
    ],
  }));
  const report: PrGateReport = {
    generatedAt: new Date().toISOString(),
    measurements: reportMeasurements,
    repeatCount,
    runtime: runtimeInfo(),
    scenario,
    summary: {
      failedCount: measurements.filter((measurement) => measurement.status !== 0).length,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      withinBudget:
        measurements.every((measurement) => measurement.status === 0) &&
        percentile(durations, 0.95) <= 480_000,
    },
  };
  const output = reportPath(scenario);
  mkdirSync(resolve(output, '..'), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[pr-gate] wrote ${output}`);
  process.exit(report.summary.withinBudget ? 0 : 1);
}
