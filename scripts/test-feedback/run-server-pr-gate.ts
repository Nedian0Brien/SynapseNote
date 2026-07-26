import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { repositoryRoot } from './command.ts';

const SERVER_PACKAGE = '@nedian0brien/synapsenote-server';
const SERVER_SHARDS = ['1/4', '2/4', '3/4', '4/4'] as const;

interface ServerGateCommand {
  args: string[];
  label: string;
}

interface ServerGateResult {
  label: string;
  status: number;
}

function commands(): ServerGateCommand[] {
  return [
    {
      args: [
        'x',
        'biome',
        'check',
        'packages/server',
        'package.json',
        'biome.jsonc',
        '--error-on-warnings',
      ],
      label: 'server biome lint',
    },
    {
      args: ['x', 'oxlint', '--max-warnings', '0', 'packages/server'],
      label: 'server oxlint',
    },
    {
      args: [
        'x',
        'turbo',
        'run',
        'typecheck',
        `--filter=${SERVER_PACKAGE}`,
        '--output-logs=errors-only',
      ],
      label: 'server typecheck',
    },
    ...SERVER_SHARDS.map((shard) => ({
      args: ['packages/server/scripts/run-server-test-task.ts', 'all', `--shard=${shard}`],
      label: `server test shard ${shard}`,
    })),
  ];
}

function run(command: ServerGateCommand, logDirectory: string): Promise<ServerGateResult> {
  const safeLabel = command.label.replaceAll(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const logPath = join(logDirectory, `${safeLabel}.log`);
  const resultRoot = resolve(
    repositoryRoot,
    process.env.SERVER_PR_GATE_RESULTS_DIR ?? '/tmp/synapsenote-server-pr-gate-results',
  );
  const resultDirectory = join(resultRoot, safeLabel);
  const environment = { ...process.env, TEST_RESULTS_DIR: resultDirectory };
  delete environment.SYNAPSENOTE_SERVER_TEST_MAX_CONCURRENCY;

  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, command.args, {
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
    child.on('error', (error) => {
      output += `\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`;
    });
    child.on('close', (status) => {
      writeFileSync(logPath, output);
      resolveResult({ label: command.label, status: status ?? 1 });
    });
  });
}

if (import.meta.main) {
  const logDirectory = resolve(
    repositoryRoot,
    process.env.SERVER_PR_GATE_LOG_DIR ?? '/tmp/synapsenote-server-pr-gate',
  );
  mkdirSync(logDirectory, { recursive: true });
  const results = await Promise.all(commands().map((command) => run(command, logDirectory)));
  const failed = results.filter((result) => result.status !== 0);
  for (const result of results) {
    console.log(
      `[server-pr-gate] ${result.label}: ${result.status === 0 ? 'passed' : `failed (${result.status})`}`,
    );
  }
  process.exit(failed.length === 0 ? 0 : 1);
}
