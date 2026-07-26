import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const SERVER_PACKAGE_ROOT = resolve(import.meta.dir, '..');

export const SERVER_TEST_CATEGORIES = [
  'unit',
  'database',
  'filesystem',
  'git',
  'process',
  'contract',
] as const;

export type ServerTestCategory = (typeof SERVER_TEST_CATEGORIES)[number];

export interface ServerTestManifest {
  [category: string]: string[];
}

export interface TimingData {
  files?: Record<string, number>;
}

const CATEGORY_DEFAULT_WEIGHTS: Record<ServerTestCategory, number> = {
  unit: 1_000,
  database: 3_000,
  filesystem: 4_000,
  git: 8_000,
  process: 12_000,
  contract: 2_000,
};

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/');
}

function walk(directory: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...walk(path));
    } else if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      paths.push(path);
    }
  }
  return paths;
}

export function discoverServerTestFiles(root = SERVER_PACKAGE_ROOT): string[] {
  return walk(root)
    .map((path) => normalizePath(relative(root, path)))
    .sort();
}

function matchesProcess(path: string, source: string): boolean {
  return (
    /(?:\.integration|\.e2e)\.test\./i.test(path) ||
    /(^|\/)(?:server-factory|server-observer|server-lock|boot(?:-|\.)|spawn|subprocess|process|port|loopback-bind|idle-shutdown|keepalive|ensure-single-file-session|single-file|mcp-http|mcp-mount|handoff-api|rig-loopback)/i.test(
      path,
    ) ||
    /(?:child_process|Bun\.spawn|spawnSync|execFile|process\.execPath|createServer\(|\.listen\(|new Hocuspocus|fetch\()/i.test(
      source,
    )
  );
}

function matchesGit(path: string, source: string): boolean {
  return (
    /(^|\/)(?:git|shadow|worktree|branch|reconcil(?:e|iation)|lock|sync-engine|save-version|maintenance-coordinator|content-filter|upstream|project-git)(?:[-/.]|$)/i.test(
      path,
    ) ||
    /(?:simple-git|shadowGit|initShadowRepo|resolveGitDir|gitHandle|createGitTriangle|git-fixture)/i.test(
      source,
    )
  );
}

function matchesFilesystem(path: string, source: string): boolean {
  return (
    /(^|\/)(?:file-watcher|config-file-watcher|asset-walk|fs\/|upload|rename|path|directory|file-ops|content\/|frontmatter)/i.test(
      path,
    ) || /(?:mkdtemp|mkdirSync|writeFileSync|readFileSync|watchFile|chokidar)/i.test(source)
  );
}

function matchesContract(path: string, source: string): boolean {
  return (
    /(^|\/)(?:api|mcp|contract|schema|export)(?:[-/.]|$)/i.test(path) ||
    /contract\.test\./i.test(path) ||
    /(?:Schema|Contract)\.parse\(/i.test(source)
  );
}

function matchesDatabase(path: string, _source: string): boolean {
  return /(^|\/)(?:database|query|formula)(?:[-/.]|$)/i.test(path);
}

/**
 * Classify by execution risk rather than by product ownership. The first
 * matching rule wins, which makes the manifest a total, non-overlapping
 * partition even for names such as database-api-mcp-contract.test.ts.
 */
export function classifyServerTestFile(
  path: string,
  root = SERVER_PACKAGE_ROOT,
): ServerTestCategory {
  const normalized = normalizePath(path);
  if (normalized === 'scripts/server-test-manifest.test.ts') return 'unit';
  let source = '';
  try {
    source = readFileSync(join(root, normalized), 'utf8');
  } catch {
    // Synthetic paths used by shard tests do not have source to inspect.
  }
  if (matchesProcess(normalized, source)) return 'process';
  if (matchesGit(normalized, source)) return 'git';
  if (matchesFilesystem(normalized, source)) return 'filesystem';
  if (matchesContract(normalized, source)) return 'contract';
  if (matchesDatabase(normalized, source)) return 'database';
  return 'unit';
}

export function buildServerTestManifest(root = SERVER_PACKAGE_ROOT): ServerTestManifest {
  const manifest = Object.fromEntries(
    SERVER_TEST_CATEGORIES.map((category) => [category, [] as string[]]),
  ) as ServerTestManifest;
  for (const file of discoverServerTestFiles(root)) {
    const category = classifyServerTestFile(file, root);
    manifest[category].push(file);
  }
  return manifest;
}

export function validateServerTestManifest(
  manifest: ServerTestManifest,
  root = SERVER_PACKAGE_ROOT,
): void {
  const discovered = discoverServerTestFiles(root);
  const assigned = SERVER_TEST_CATEGORIES.flatMap((category) => manifest[category] ?? []);
  const discoveredSet = new Set(discovered);
  const assignedSet = new Set(assigned);

  if (assigned.length !== assignedSet.size) {
    const duplicates = assigned.filter((file, index) => assigned.indexOf(file) !== index);
    throw new Error(
      `server test manifest contains duplicate files: ${[...new Set(duplicates)].join(', ')}`,
    );
  }
  const missing = discovered.filter((file) => !assignedSet.has(file));
  const unexpected = assigned.filter((file) => !discoveredSet.has(file));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `server test manifest coverage mismatch; missing=${missing.join(', ') || '(none)'}; unexpected=${unexpected.join(', ') || '(none)'}`,
    );
  }
  for (const category of SERVER_TEST_CATEGORIES) {
    if ((manifest[category] ?? []).length === 0)
      throw new Error(`server test manifest category is empty: ${category}`);
  }
}

function timingFor(file: string, category: ServerTestCategory, timings: TimingData): number {
  const candidates = [file, `packages/server/${file}`];
  for (const candidate of candidates) {
    const value = timings.files?.[candidate];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return CATEGORY_DEFAULT_WEIGHTS[category];
}

/** Longest-processing-time-first assignment with deterministic tie breakers. */
export function createBalancedShards(
  files: string[],
  shardCount: number,
  category: ServerTestCategory,
  timings: TimingData = {},
): string[][] {
  if (!Number.isInteger(shardCount) || shardCount < 1)
    throw new Error(`invalid shard count: ${shardCount}`);
  if (files.length === 0) return Array.from({ length: shardCount }, () => []);

  const shards = Array.from({ length: shardCount }, () => ({ files: [] as string[], load: 0 }));
  const ordered = [...new Set(files)].sort((left, right) => {
    const weightDifference =
      timingFor(right, category, timings) - timingFor(left, category, timings);
    return weightDifference || left.localeCompare(right);
  });

  for (const file of ordered) {
    const target = shards.reduce(
      (best, shard, index) => {
        if (shard.load < best.shard.load) return { shard, index };
        if (shard.load === best.shard.load && index < best.index) return { shard, index };
        return best;
      },
      { shard: shards[0], index: 0 },
    );
    const weight = timingFor(file, category, timings);
    target.shard.files.push(file);
    target.shard.load += weight;
  }

  return shards.map((shard) => shard.files.sort());
}

export function readTimingData(path: string): TimingData {
  const value = JSON.parse(readFileSync(path, 'utf8')) as TimingData;
  if (value.files && typeof value.files !== 'object')
    throw new Error(`timing file has invalid files field: ${path}`);
  return value;
}

export function manifestSummary(manifest: ServerTestManifest): string {
  return SERVER_TEST_CATEGORIES.map(
    (category) => `${category}=${manifest[category]?.length ?? 0}`,
  ).join(' ');
}
