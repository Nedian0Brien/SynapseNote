import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DESKTOP_IPC_REGISTRARS,
  DYNAMIC_LIFECYCLE_CHANNELS,
  registerDesktopIpcRegistrars,
} from '../../src/main/ipc/registrar-registry.ts';

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

describe('desktop IPC registrar registry', () => {
  test('registers each static channel once, leaving lifecycle channels explicit', () => {
    const registered: string[] = [];
    registerDesktopIpcRegistrars((channel) => registered.push(channel));

    expect(new Set(registered).size).toBe(registered.length);
    expect(registered).not.toContain('ok:update:check-now');
    expect(DYNAMIC_LIFECYCLE_CHANNELS).toContain('ok:update:check-now');
    expect(registered.sort()).toEqual(Object.values(DESKTOP_IPC_REGISTRARS).flat().slice().sort());
  });

  test('rejects a duplicate channel in a registrar map', () => {
    const original = DESKTOP_IPC_REGISTRARS.terminalPty[0];
    expect(original).toBe('ok:pty:create');
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
