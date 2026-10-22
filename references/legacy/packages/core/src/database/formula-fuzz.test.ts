import { describe, expect, test } from 'bun:test';
import { FormulaSyntaxError, parseFormulaSource } from './formula-language.ts';

/**
 * Bounded, seeded fuzz corpus for Formula syntax parsing (R-007).
 *
 * Regression coverage: a source like `(((((...)))))` used to recurse through
 * the parser's prefix rule once per nesting level and crash with an untyped
 * `RangeError: Maximum call stack size exceeded` around ~20,000 levels —
 * well inside the 100,000-character source limit — instead of the
 * documented typed `FormulaSyntaxError`. Fixed with an explicit nesting
 * ceiling in `formula-language.ts`; the tests below are reproducible
 * evidence that both the general contract and this specific regression
 * stay closed.
 */

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

const TOKENS = [
  '(',
  ')',
  '[',
  ']',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
  '!',
  '?',
  ':',
  '=>',
  ',',
  '.',
  '"unterminated',
  "'quoted'",
  '"with \\"escape\\""',
  '1',
  '1.5',
  '-1',
  '1e400',
  'true',
  'false',
  'null',
  'not',
  'prop',
  'prop()',
  'sum([1,2,3])',
  'x',
  '행😀',
  ' ',
  '\t',
  '\n',
];

function generatedFormulaSource(seed: number): string {
  const tokenCount = 1 + integer(seed, 1, 12);
  const parts: string[] = [];
  for (let index = 0; index < tokenCount; index += 1) {
    const salt = 10 + index * 3;
    parts.push(TOKENS[integer(seed, salt, TOKENS.length)] ?? '');
  }
  return parts.join(integer(seed, 5, 2) === 0 ? ' ' : '');
}

describe('Formula syntax fuzz corpus', () => {
  test('never throws anything other than FormulaSyntaxError for generated adversarial source', () => {
    for (let seed = 1; seed <= ITERATIONS; seed += 1) {
      const source = generatedFormulaSource(seed);
      try {
        parseFormulaSource(source);
      } catch (cause) {
        if (cause instanceof FormulaSyntaxError) continue;
        throw new Error(
          `seed ${seed} (source ${JSON.stringify(source)}) threw an untyped error instead of FormulaSyntaxError: ${String(cause)}`,
          { cause },
        );
      }
    }
  });

  test('rejects deeply nested parenthesized groups as a typed syntax error, not a stack overflow', () => {
    for (const depth of [300, 1_000, 20_000, 45_000]) {
      const source = `${'('.repeat(depth)}1${')'.repeat(depth)}`;
      expect(() => parseFormulaSource(source), `depth ${depth}`).toThrow(FormulaSyntaxError);
    }
  });

  test('rejects deeply nested unary and lambda chains as a typed syntax error, not a stack overflow', () => {
    expect(() => parseFormulaSource(`${'!'.repeat(20_000)}true`)).toThrow(FormulaSyntaxError);
    expect(() => parseFormulaSource(`${'x=>'.repeat(20_000)}x`)).toThrow(FormulaSyntaxError);
  });

  test('rejects a source past the character-length ceiling as a typed syntax error', () => {
    expect(() => parseFormulaSource(`${'1+'.repeat(60_000)}1`)).toThrow(FormulaSyntaxError);
  });

  test('accepts a moderately nested expression well under the ceiling', () => {
    const depth = 50;
    const source = `${'('.repeat(depth)}1${')'.repeat(depth)}`;
    expect(parseFormulaSource(source)).toBeDefined();
  });
});
