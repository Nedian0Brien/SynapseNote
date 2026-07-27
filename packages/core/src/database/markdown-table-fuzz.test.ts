import { describe, expect, test } from 'bun:test';
import {
  DATABASE_MARKDOWN_LIMITS,
  parseDatabaseMarkdownOwner,
  type ParseDatabaseMarkdownOwnerResult,
} from './markdown-table.ts';

const ITERATIONS = 256;

function unit(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97) >>> 0;
  return ((value ^ (value >>> 15)) >>> 0) / 0x1_0000_0000;
}

function integer(seed: number, salt: number, maximum: number): number {
  return Math.floor(unit(seed, salt) * maximum);
}

const FRAGMENTS = [
  '<!-- synapsenote:database',
  'version=2',
  'database=db_fuzz',
  'source=ds_fuzz',
  'block=dbb_owner',
  'columns=prop_title,prop_value',
  '-->',
  '| Title | Value |',
  '| --- | --- |',
  '| [[docs/a]] | 1 |',
  '|  |  |',
  '| a\\|b | \\\\ |',
  '```',
  '<!-- malformed',
  'version=x',
  'columns=prop_title,prop_title',
  '| too | many | columns |',
  '행 😀 مرحبا',
  '\0',
];

function generatedSource(seed: number): string {
  const lines = 1 + integer(seed, 1, 24);
  return Array.from({ length: lines }, (_, index) => {
    const fragments = 1 + integer(seed, index + 10, 4);
    return Array.from({ length: fragments }, (_, fragment) =>
      FRAGMENTS[integer(seed, index * 7 + fragment + 30, FRAGMENTS.length)] ?? '',
    ).join(integer(seed, index + 100, 2) === 0 ? ' ' : '\n');
  }).join('\n');
}

function assertTyped(result: ParseDatabaseMarkdownOwnerResult, seed: number): void {
  expect(typeof result, `seed ${seed}`).toBe('object');
  if (result.ok) {
    expect(result.owner.marker.version, `seed ${seed}`).toBe(2);
    expect(result.owner.rows.length, `seed ${seed}`).toBeLessThanOrEqual(DATABASE_MARKDOWN_LIMITS.rows);
    return;
  }
  expect(typeof result.code, `seed ${seed}`).toBe('string');
  expect(typeof result.message, `seed ${seed}`).toBe('string');
}

describe('Markdown owner-table parser fuzz corpus', () => {
  test('never throws for generated malformed marker/table input', () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      let result: ParseDatabaseMarkdownOwnerResult;
      try {
        result = parseDatabaseMarkdownOwner(generatedSource(seed));
      } catch (cause) {
        throw new Error(`seed ${seed} threw an untyped parser error: ${String(cause)}`, { cause });
      }
      assertTyped(result, seed);
    }
  });

  test('rejects oversized owner input before table traversal', () => {
    const result = parseDatabaseMarkdownOwner('x'.repeat(DATABASE_MARKDOWN_LIMITS.ownerDocumentBytes + 1));
    expect(result).toMatchObject({ ok: false, code: 'resource_limit' });
  });

  test('rejects a row with a cell larger than the cell budget', () => {
    const source = `<!-- synapsenote:database\nversion=2\ndatabase=db_fuzz\nsource=ds_fuzz\nblock=dbb_owner\ncolumns=prop_title\n-->\n\n| Title |\n| --- |\n| ${'x'.repeat(DATABASE_MARKDOWN_LIMITS.cellBytes + 1)} |\n`;
    expect(parseDatabaseMarkdownOwner(source)).toMatchObject({ ok: false, code: 'resource_limit' });
  });
});
