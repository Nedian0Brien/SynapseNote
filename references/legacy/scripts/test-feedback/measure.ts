import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { repositoryRoot } from './command.ts';

export interface Measurement {
  command: string[];
  durationMs: number;
  label: string;
  status: number;
}

export function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

export interface RuntimeInfo {
  arch: string;
  bun: string;
  cpus: number;
  node: string;
  platform: string;
}

export function runtimeInfo(): RuntimeInfo {
  return {
    bun: typeof Bun === 'undefined' ? 'unknown' : Bun.version,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    cpus: typeof Bun === 'undefined' ? 0 : (globalThis.navigator?.hardwareConcurrency ?? 0),
  };
}

export function measureCommand(
  command: string,
  args: string[],
  label: string,
  options: { cwd?: string; env?: Record<string, string | undefined>; logPath?: string } = {},
): Measurement {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });
  const measurement = {
    label,
    command: [command, ...args],
    durationMs: Math.round((performance.now() - started) * 1000) / 1000,
    status: result.status ?? 1,
  } satisfies Measurement;
  if (options.logPath) {
    const logPath = resolve(repositoryRoot, options.logPath);
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, `${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  return measurement;
}

export interface JUnitCase {
  classname: string;
  durationMs: number;
  name: string;
  file?: string;
  failure?: string;
  skipped?: boolean;
}

function xmlAttribute(value: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(value)?.[1];
}

export function parseJUnit(xml: string): JUnitCase[] {
  const cases: JUnitCase[] = [];
  for (const match of xml.matchAll(
    /<testcase\b([^>]*\/)>|<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/g,
  )) {
    const attributes = match[1] ?? match[2] ?? '';
    const body = match[3] ?? '';
    const durationSeconds = Number(xmlAttribute(attributes, 'time') ?? 0);
    const file = xmlAttribute(attributes, 'file');
    cases.push({
      classname: xmlAttribute(attributes, 'classname') ?? '',
      name: xmlAttribute(attributes, 'name') ?? '',
      durationMs: Number.isFinite(durationSeconds) ? durationSeconds * 1000 : 0,
      ...(file ? { file } : {}),
      ...(body.includes('<failure') ? { failure: body.trim() } : {}),
      ...(body.includes('<skipped') ? { skipped: true } : {}),
    });
  }
  return cases;
}
