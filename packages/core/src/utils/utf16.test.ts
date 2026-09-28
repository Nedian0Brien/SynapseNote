import { describe, expect, test } from 'bun:test';
import {
  alignOpsToCodePoints,
  applyTextOps,
  isWellFormedUtf16,
  loneSurrogateOffsets,
  replaceLoneSurrogates,
  splitsSurrogatePair,
  type TextOp,
} from './utf16.ts';

const HIGH = '\uD83D';
const LOW = '\uDE00';

describe('well-formedness', () => {
  test('pairs are well formed, lone halves are not', () => {
    expect(isWellFormedUtf16('a😀b 한글')).toBe(true);
    expect(isWellFormedUtf16(`a${HIGH}b`)).toBe(false);
    expect(isWellFormedUtf16(`a${LOW}b`)).toBe(false);
    expect(isWellFormedUtf16(`${LOW}${HIGH}`)).toBe(false);
  });

  test('lone halves are located and replaced with U+FFFD', () => {
    const text = `x${HIGH}y😀z${LOW}`;
    expect(loneSurrogateOffsets(text)).toEqual([1, 6]);
    expect(replaceLoneSurrogates(text)).toBe('x\uFFFDy😀z\uFFFD');
  });

  test('a boundary between halves splits the pair', () => {
    expect(splitsSurrogatePair('a😀b', 2)).toBe(true);
    expect(splitsSurrogatePair('a😀b', 1)).toBe(false);
    expect(splitsSurrogatePair('a😀b', 3)).toBe(false);
  });
});

/** Apply ops to a plain string and record each edit position. */
function applyToString(text: string, ops: readonly TextOp[]) {
  let value = text;
  const positions: { at: number; before: string }[] = [];
  applyTextOps(
    {
      delete(index, length) {
        positions.push({ at: index, before: value }, { at: index + length, before: value });
        value = value.slice(0, index) + value.slice(index + length);
      },
      insert(index, inserted) {
        positions.push({ at: index, before: value });
        value = value.slice(0, index) + inserted + value.slice(index);
      },
    },
    ops,
  );
  return { value, positions };
}

describe('alignOpsToCodePoints', () => {
  test('😀→😁 as a low-half swap becomes a whole-character swap', () => {
    // What diff-match-patch yields: the shared high half is retained.
    const ops: TextOp[] = [
      { type: 'retain', text: `a${HIGH}` },
      { type: 'delete', text: LOW },
      { type: 'insert', text: '\uDE01' },
      { type: 'retain', text: 'b' },
    ];
    const aligned = alignOpsToCodePoints(ops);
    expect(aligned).toEqual([
      { type: 'retain', text: 'a' },
      { type: 'delete', text: '😀' },
      { type: 'insert', text: '😁' },
      { type: 'retain', text: 'b' },
    ]);
    const { value, positions } = applyToString('a😀b', aligned);
    expect(value).toBe('a😁b');
    expect(positions.some(({ at, before }) => splitsSurrogatePair(before, at))).toBe(false);
  });

  test('a retained low half after an insertion joins the change', () => {
    // "😀b" → "😃😀b" diffed as insert "😃\uD83D" + retain "\uDE00b"… is not possible for
    // well-formed text; the realistic shape is retain high, insert, retain low.
    const ops: TextOp[] = [
      { type: 'retain', text: HIGH },
      { type: 'insert', text: '\uDE03\uD83D' },
      { type: 'retain', text: `${LOW}b` },
    ];
    const aligned = alignOpsToCodePoints(ops);
    const { value, positions } = applyToString('😀b', aligned);
    expect(value).toBe('😃😀b');
    expect(positions.some(({ at, before }) => splitsSurrogatePair(before, at))).toBe(false);
  });

  test('ops that already sit on code points are unchanged', () => {
    const ops: TextOp[] = [
      { type: 'retain', text: 'a😀' },
      { type: 'delete', text: 'b' },
      { type: 'insert', text: 'c' },
    ];
    expect(alignOpsToCodePoints(ops)).toEqual(ops);
  });
});
