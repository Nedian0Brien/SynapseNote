import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runBun } from '../../../scripts/test-feedback/command.ts';
import {
  buildServerTestManifest,
  createBalancedShards,
  manifestSummary,
  readTimingData,
  SERVER_PACKAGE_ROOT,
  SERVER_TEST_CATEGORIES,
  type ServerTestCategory,
  validateServerTestManifest,
} from './server-test-manifest.ts';

function fail(message: string): never {
  console.error(`[server-tests] error: ${message}`);
  process.exit(2);
}

function parseShard(value: string | undefined): { index: number; count: number } | undefined {
  if (!value) return undefined;
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) fail(`--shard must use INDEX/COUNT (received ${value})`);
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (index < 1 || count < 1 || index > count) fail(`invalid shard ${value}`);
  return { index, count };
}

function runCategory(
  category: ServerTestCategory,
  manifest: ReturnType<typeof buildServerTestManifest>,
  shard: { index: number; count: number } | undefined,
  timingsPath: string | undefined,
  testFlags: string[],
): number {
  const timings = timingsPath ? readTimingData(timingsPath) : {};
  const categoryFiles = manifest[category];
  const files = shard
    ? createBalancedShards(categoryFiles, shard.count, category, timings)[shard.index - 1]
    : categoryFiles;
  if (!files || files.length === 0) {
    console.log(`[server-tests] ${category} shard has no files; nothing to run`);
    return 0;
  }

  console.log(
    `[server-tests] ${category}: ${files.length} file(s)${shard ? ` shard=${shard.index}/${shard.count}` : ''}`,
  );
  const reporterArgs: string[] = [];
  const resultDirectory = process.env.TEST_RESULTS_DIR;
  if (resultDirectory) {
    const absoluteResultDirectory = resolve(SERVER_PACKAGE_ROOT, resultDirectory);
    mkdirSync(absoluteResultDirectory, { recursive: true });
    const suffix = shard ? `-${shard.index}-of-${shard.count}` : '';
    reporterArgs.push(
      '--reporter=junit',
      `--reporter-outfile=${resolve(absoluteResultDirectory, `${category}${suffix}.xml`)}`,
    );
  }
  // Git-backed fixtures intentionally exercise real subprocesses (clone,
  // fetch, push, and rename history). Under a repository-wide turbo run those
  // processes can be queued behind the other packages for longer than Bun's
  // 30s default, even though the operation itself is healthy. Keep the
  // category runner bounded, but give legitimate Git/clone tests enough room
  // to finish under CI and local full-gate contention. Callers can lower the
  // ceiling for focused diagnostics without changing the production code.
  const timeoutMs = Number(process.env.SYNAPSENOTE_SERVER_TEST_TIMEOUT_MS ?? 120_000);
  const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs >= 1_000 ? timeoutMs : 120_000;
  // Git/process fixtures own repositories, ports, child processes, and shutdown
  // state. Keep those categories serial by default; pure/database/contract
  // suites can use the wider worker pool without sharing those resources.
  const defaultMaxConcurrency = category === 'git' || category === 'process' ? 1 : 20;
  const configuredMaxConcurrency = Number(
    process.env.SYNAPSENOTE_SERVER_TEST_MAX_CONCURRENCY ?? defaultMaxConcurrency,
  );
  const maxConcurrency =
    Number.isInteger(configuredMaxConcurrency) && configuredMaxConcurrency >= 1
      ? configuredMaxConcurrency
      : defaultMaxConcurrency;
  const leakPreload =
    process.env.TEST_FEEDBACK_LEAK_CHECK === '1'
      ? ['--preload', '../../scripts/test-feedback/leak-preload.ts']
      : [];
  return runBun({
    cwd: SERVER_PACKAGE_ROOT,
    args: [
      'test',
      '--timeout',
      String(Math.round(boundedTimeoutMs)),
      '--max-concurrency',
      String(maxConcurrency),
      ...leakPreload,
      ...testFlags,
      ...reporterArgs,
      ...files,
    ],
    label: `server ${category}${shard ? ` shard ${shard.index}/${shard.count}` : ''}`,
  });
}

const args = process.argv.slice(2);
const list = args.includes('--list');
const shardValue = args.find((arg) => arg.startsWith('--shard='))?.slice('--shard='.length);
const timingsValue = args.find((arg) => arg.startsWith('--timings='))?.slice('--timings='.length);
const seedValue = args.find((arg) => arg.startsWith('--seed='))?.slice('--seed='.length);
const rerunEachValue = args
  .find((arg) => arg.startsWith('--rerun-each='))
  ?.slice('--rerun-each='.length);
const randomize = args.includes('--randomize');
const task = args.find((arg) => !arg.startsWith('--')) ?? 'all';
if (args.some((arg) => arg.startsWith('--shard') && !arg.startsWith('--shard=')))
  fail('--shard requires INDEX/COUNT');
if (args.some((arg) => arg.startsWith('--timings') && !arg.startsWith('--timings=')))
  fail('--timings requires a file path');
if (args.some((arg) => arg.startsWith('--seed') && !arg.startsWith('--seed=')))
  fail('--seed requires an integer');
if (args.some((arg) => arg.startsWith('--rerun-each') && !arg.startsWith('--rerun-each=')))
  fail('--rerun-each requires an integer');

const testFlags: string[] = [];
if (randomize) testFlags.push('--randomize');
if (seedValue !== undefined) {
  const seed = Number(seedValue);
  if (!Number.isInteger(seed) || seed < 0) fail(`invalid seed: ${seedValue}`);
  testFlags.push(`--seed=${seed}`);
}
if (rerunEachValue !== undefined) {
  const rerunEach = Number(rerunEachValue);
  if (!Number.isInteger(rerunEach) || rerunEach < 1) fail(`invalid rerun count: ${rerunEachValue}`);
  testFlags.push(`--rerun-each=${rerunEach}`);
}

const manifest = buildServerTestManifest();
validateServerTestManifest(manifest);

if (list) {
  console.log(`[server-tests] ${manifestSummary(manifest)}`);
  for (const category of SERVER_TEST_CATEGORIES) {
    console.log(`\n[${category}]`);
    for (const file of manifest[category]) console.log(file);
  }
  process.exit(0);
}

if (task !== 'all' && !SERVER_TEST_CATEGORIES.includes(task as ServerTestCategory)) {
  fail(`unknown task '${task}'; expected all or ${SERVER_TEST_CATEGORIES.join(', ')}`);
}
if (timingsValue && !existsSync(resolve(SERVER_PACKAGE_ROOT, timingsValue))) {
  fail(`timing file does not exist: ${timingsValue}`);
}

const shard = parseShard(shardValue);
const categories = task === 'all' ? SERVER_TEST_CATEGORIES : [task as ServerTestCategory];
for (const category of categories) {
  const status = runCategory(
    category,
    manifest,
    shard,
    timingsValue && resolve(SERVER_PACKAGE_ROOT, timingsValue),
    testFlags,
  );
  if (status !== 0) process.exit(status);
}
