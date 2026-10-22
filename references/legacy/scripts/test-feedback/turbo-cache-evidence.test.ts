import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { turboCacheHit } from './turbo-cache-evidence.ts';

function writeSummary(directory: string, name: string, attempted: number, cached: number): void {
  writeFileSync(join(directory, name), JSON.stringify({ execution: { attempted, cached } }));
}

describe('Turbo cache evidence', () => {
  test('classifies an all-hit summary and an all-miss summary', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'synapsenote-turbo-cache-'));
    writeSummary(directory, 'hit.json', 2, 2);
    expect(turboCacheHit(directory)).toBe(true);
    await Bun.sleep(2);
    writeSummary(directory, 'miss.json', 2, 0);
    expect(turboCacheHit(directory)).toBe(false);
  });

  test('returns null when no task was attempted or the summary is absent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'synapsenote-turbo-cache-'));
    expect(turboCacheHit(directory)).toBe(null);
    mkdirSync(join(directory, 'nested'));
    writeSummary(join(directory, 'nested'), 'empty.json', 0, 0);
    expect(turboCacheHit(directory)).toBe(null);
  });
});
