import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_RIGHT_RAIL_WIDTH,
  MAX_RIGHT_RAIL_WIDTH,
  MIN_RIGHT_RAIL_WIDTH,
  RIGHT_RAIL_WIDTH_KEY,
  readRightRailWidth,
  type WidthStorage,
  writeRightRailWidth,
} from './right-rail-width-store';

function memoryStorage(seed: Record<string, string> = {}): WidthStorage & {
  values: Record<string, string>;
} {
  const values = { ...seed };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
}

describe('readRightRailWidth', () => {
  test('returns the default when nothing is stored', () => {
    expect(readRightRailWidth(memoryStorage())).toBe(DEFAULT_RIGHT_RAIL_WIDTH);
  });

  test('reads a stored width', () => {
    expect(readRightRailWidth(memoryStorage({ [RIGHT_RAIL_WIDTH_KEY]: '480' }))).toBe(480);
  });

  test('clamps a stored width into the rail range', () => {
    expect(readRightRailWidth(memoryStorage({ [RIGHT_RAIL_WIDTH_KEY]: '100' }))).toBe(
      MIN_RIGHT_RAIL_WIDTH,
    );
    expect(readRightRailWidth(memoryStorage({ [RIGHT_RAIL_WIDTH_KEY]: '5000' }))).toBe(
      MAX_RIGHT_RAIL_WIDTH,
    );
  });

  test('falls back to the default on a non-numeric value', () => {
    expect(readRightRailWidth(memoryStorage({ [RIGHT_RAIL_WIDTH_KEY]: 'wide' }))).toBe(
      DEFAULT_RIGHT_RAIL_WIDTH,
    );
  });
});

describe('migration from the two-panel stores', () => {
  // Chat and the document tools were separate panels with separate widths, and
  // the last build wrote both in lockstep. An app upgrading from it must keep
  // the width its user set rather than snapping back to the default.
  test('adopts the legacy doc-panel width when the rail key is absent', () => {
    expect(readRightRailWidth(memoryStorage({ 'ok-doc-panel-width-v1': '540' }))).toBe(540);
  });

  test('falls back to the legacy terminal width when only that one exists', () => {
    expect(readRightRailWidth(memoryStorage({ 'ok-terminal-width-v1': '600' }))).toBe(600);
  });

  test('clamps a legacy value that the rail range no longer allows', () => {
    // The terminal column had no ceiling and a 300px doc-panel floor existed;
    // both ends can land outside the rail's own range.
    expect(readRightRailWidth(memoryStorage({ 'ok-terminal-width-v1': '1200' }))).toBe(
      MAX_RIGHT_RAIL_WIDTH,
    );
    expect(readRightRailWidth(memoryStorage({ 'ok-doc-panel-width-v1': '300' }))).toBe(
      MIN_RIGHT_RAIL_WIDTH,
    );
  });

  test('prefers the rail key once it exists', () => {
    const storage = memoryStorage({
      [RIGHT_RAIL_WIDTH_KEY]: '400',
      'ok-doc-panel-width-v1': '540',
    });
    expect(readRightRailWidth(storage)).toBe(400);
  });
});

describe('writeRightRailWidth', () => {
  test('persists a clamped width under the rail key alone', () => {
    const storage = memoryStorage();
    writeRightRailWidth(5000, storage);
    expect(storage.values).toEqual({ [RIGHT_RAIL_WIDTH_KEY]: String(MAX_RIGHT_RAIL_WIDTH) });
  });

  test('survives a storage that throws', () => {
    const throwing: WidthStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => writeRightRailWidth(400, throwing)).not.toThrow();
  });
});
