import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertDesktopIpcRegistrarOwnership,
  DESKTOP_IPC_REGISTRARS,
  DYNAMIC_LIFECYCLE_CHANNELS,
  registerDesktopIpcRegistrars,
} from '../../src/main/ipc/registrar-registry.ts';

const CHANNELS_SOURCE = readFileSync(
  join(__dirname, '..', '..', 'src', 'shared', 'ipc-channels.ts'),
  'utf-8',
);

const MAIN_INDEX_SOURCE = readFileSync(
  join(__dirname, '..', '..', 'src', 'main', 'index.ts'),
  'utf-8',
);
const IPC_COMPOSITION_SOURCE = readFileSync(
  join(__dirname, '..', '..', 'src', 'main', 'desktop-ipc-composition.ts'),
  'utf-8',
);

function sourceLineCount(source: string): number {
  return source.split('\n').length;
}

function functionLineCount(source: string, name: string): number {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] !== '}') continue;
    depth -= 1;
    if (depth === 0) return source.slice(start, cursor + 1).split('\n').length;
  }
  throw new Error(`${name} has unbalanced braces`);
}

function canonicalRequestChannels(): string[] {
  const marker = 'export interface RequestChannels {';
  const start = CHANNELS_SOURCE.indexOf(marker);
  if (start === -1) throw new Error('RequestChannels not found');
  const body = CHANNELS_SOURCE.slice(start);
  return [...body.matchAll(/^  '([^']+)': \{/gm)].map((match) => match[1] ?? '');
}

describe('desktop IPC registrar registry', () => {
  test('owns every canonical RequestChannels key exactly once or explicitly as lifecycle', () => {
    const registered: string[] = [];
    registerDesktopIpcRegistrars((channel) => registered.push(channel));

    const canonical = canonicalRequestChannels();
    const staticChannels = canonical.filter(
      (channel) => !DYNAMIC_LIFECYCLE_CHANNELS.includes(channel as never),
    );
    expect(new Set(registered).size).toBe(registered.length);
    expect(registered.slice().sort()).toEqual(staticChannels.slice().sort());
    expect([...registered, ...DYNAMIC_LIFECYCLE_CHANNELS].slice().sort()).toEqual(
      canonical.slice().sort(),
    );
  });

  test('rejects an omitted or duplicate canonical channel in a registrar map', () => {
    const canonical = canonicalRequestChannels().filter(
      (channel) => !DYNAMIC_LIFECYCLE_CHANNELS.includes(channel as never),
    );
    const registrars = Object.fromEntries(
      Object.entries(DESKTOP_IPC_REGISTRARS).map(([owner, channels]) => [owner, [...channels]]),
    );
    const omitted = Object.fromEntries(
      Object.entries(registrars).map(([owner, channels]) => [
        owner,
        owner === 'terminalPty' ? channels.slice(1) : channels,
      ]),
    );
    const duplicate = {
      ...registrars,
      seed: [...registrars.seed, registrars.terminalPty[0]],
    };

    expect(() => assertDesktopIpcRegistrarOwnership(omitted, canonical)).toThrow(
      'missing desktop IPC registrar channel: ok:pty:create',
    );
    expect(() => assertDesktopIpcRegistrarOwnership(duplicate, canonical)).toThrow(
      'duplicate desktop IPC registrar channel: ok:pty:create',
    );
  });

  test('keeps main boot orchestration and IPC composition within their budgets', () => {
    expect(sourceLineCount(MAIN_INDEX_SOURCE)).toBeLessThan(4000);
    expect(functionLineCount(MAIN_INDEX_SOURCE, 'registerIpcHandlers')).toBeLessThanOrEqual(150);
  });

  test('makes static-channel ownership a runtime composition invariant', () => {
    expect(MAIN_INDEX_SOURCE).not.toContain("handle('ok:");
    expect(IPC_COMPOSITION_SOURCE).toContain('desktop IPC registrar did not install');
    expect(IPC_COMPOSITION_SOURCE).toContain('desktop IPC handler has no static registrar owner');
  });
});
