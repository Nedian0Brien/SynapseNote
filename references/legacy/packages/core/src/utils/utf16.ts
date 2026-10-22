/**
 * UTF-16 helpers for text that crosses the Yjs wire.
 *
 * Yjs addresses `Y.Text` in UTF-16 code units, so an edit can start or end
 * between the two halves of a surrogate pair. JS Yjs peers turn a split pair
 * into U+FFFD, but other implementations do not agree on the result (yrs 0.28
 * applies the same op to a different character), and a lone half inserted by
 * one doc reaches every other peer as U+FFFD after UTF-8 encoding. So text the
 * server writes must never split a pair, and text it stores must never hold a
 * lone half.
 */

const isHigh = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

// A high surrogate not followed by a low one, or a low not preceded by a high.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** True when `text` holds no unpaired surrogate (String#isWellFormed, ES2024). */
export function isWellFormedUtf16(text: string): boolean {
  LONE_SURROGATE.lastIndex = 0;
  return !LONE_SURROGATE.test(text);
}

/** Offsets of every unpaired surrogate in `text`, ascending. */
export function loneSurrogateOffsets(text: string): number[] {
  const offsets: number[] = [];
  for (const match of text.matchAll(LONE_SURROGATE)) offsets.push(match.index ?? 0);
  return offsets;
}

/** Replace every unpaired surrogate with U+FFFD (String#toWellFormed, ES2024). */
export function replaceLoneSurrogates(text: string): string {
  return text.replace(LONE_SURROGATE, '\uFFFD');
}

/** True when a boundary at `offset` falls between the halves of a pair. */
export function splitsSurrogatePair(text: string, offset: number): boolean {
  return (
    offset > 0 &&
    offset < text.length &&
    isHigh(text.charCodeAt(offset - 1)) &&
    isLow(text.charCodeAt(offset))
  );
}

export type TextOp =
  | { type: 'retain'; text: string }
  | { type: 'delete'; text: string }
  | { type: 'insert'; text: string };

/**
 * Move op boundaries off surrogate-pair midpoints.
 *
 * A retained span that ends with a high surrogate right before a change, or
 * starts with a low surrogate right after one, gives that code unit to the
 * change: it is appended/prepended to both the deletion and the insertion.
 * Retained text is identical on both sides, so the resulting text is
 * unchanged; only the op boundaries move. All other ops are left as they are.
 */
export function alignOpsToCodePoints(ops: readonly TextOp[]): TextOp[] {
  const out: TextOp[] = ops.map((op) => ({ ...op }));
  const isChange = (op: TextOp | undefined) => op !== undefined && op.type !== 'retain';

  for (let i = 0; i < out.length; i++) {
    const op = out[i];
    if (op.type !== 'retain' || op.text.length === 0) continue;

    // Leading low surrogate whose high half ended the preceding change.
    if (isChange(out[i - 1]) && isLow(op.text.charCodeAt(0))) {
      const unit = op.text[0];
      op.text = op.text.slice(1);
      const groupEnd = i; // change group is out[start..i)
      let start = groupEnd - 1;
      while (start > 0 && isChange(out[start - 1])) start--;
      appendToGroup(out, start, groupEnd, unit, 'end');
      i = indexOfOp(out, op);
    }

    // Trailing high surrogate whose low half starts the following change.
    if (
      op.text.length > 0 &&
      isChange(out[i + 1]) &&
      isHigh(op.text.charCodeAt(op.text.length - 1))
    ) {
      const unit = op.text[op.text.length - 1];
      op.text = op.text.slice(0, -1);
      let end = i + 2;
      while (end < out.length && isChange(out[end])) end++;
      appendToGroup(out, i + 1, end, unit, 'start');
    }
  }
  return out.filter((op) => op.text.length > 0);
}

function indexOfOp(ops: TextOp[], op: TextOp): number {
  return ops.indexOf(op);
}

/**
 * Add `unit` to the deletion and the insertion of the change group
 * `ops[start..end)`, creating either one when the group lacks it.
 */
function appendToGroup(
  ops: TextOp[],
  start: number,
  end: number,
  unit: string,
  side: 'start' | 'end',
): void {
  const group = ops.slice(start, end);
  let del = group.find((op) => op.type === 'delete');
  let ins = group.find((op) => op.type === 'insert');
  if (!del) {
    del = { type: 'delete', text: '' };
    ops.splice(start, 0, del);
    end++;
  }
  if (!ins) {
    ins = { type: 'insert', text: '' };
    ops.splice(end, 0, ins);
  }
  if (side === 'end') {
    del.text += unit;
    ins.text += unit;
  } else {
    del.text = unit + del.text;
    ins.text = unit + ins.text;
  }
}

/**
 * Apply ops to a Y.Text-like target starting at offset 0. Deletions and
 * insertions are issued in op order at the running offset.
 */
export function applyTextOps(
  target: {
    delete(index: number, length: number): void;
    insert(index: number, text: string): void;
  },
  ops: readonly TextOp[],
): void {
  let offset = 0;
  for (const op of ops) {
    if (op.type === 'retain') {
      offset += op.text.length;
    } else if (op.type === 'delete') {
      target.delete(offset, op.text.length);
    } else {
      target.insert(offset, op.text);
      offset += op.text.length;
    }
  }
}
