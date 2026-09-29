/**
 * The minimal edits that turn one source into another, for sending an
 * editing-model result to a collaborative text (CodeMirror + Y.Text).
 *
 * Replacing the whole changed span would delete and re-insert text the user
 * did not touch — e.g. wrapping a selection in `**` would re-insert the
 * selected word — and a peer typing inside that word would lose the race.
 * Changes stay on code-point boundaries.
 */
import DiffMatchPatch from 'diff-match-patch';
import { alignOpsToCodePoints, type TextOp } from '../utils/utf16.ts';

export interface SourceChange {
  from: number;
  to: number;
  insert: string;
}

const dmp = new DiffMatchPatch();

export function sourceChanges(before: string, after: string): SourceChange[] {
  if (before === after) return [];
  let prefix = 0;
  const max = Math.min(before.length, after.length);
  while (prefix < max && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) {
    suffix++;
  }
  const middle = dmp.diff_main(
    before.slice(prefix, before.length - suffix),
    after.slice(prefix, after.length - suffix),
  );
  dmp.diff_cleanupSemantic(middle);
  const ops: TextOp[] = [
    { type: 'retain', text: before.slice(0, prefix) },
    ...middle.map(
      ([type, text]): TextOp => ({
        type: type === 0 ? 'retain' : type === -1 ? 'delete' : 'insert',
        text,
      }),
    ),
    { type: 'retain', text: before.slice(before.length - suffix) },
  ];
  const changes: SourceChange[] = [];
  let at = 0;
  for (const op of alignOpsToCodePoints(ops)) {
    if (op.type === 'retain') {
      at += op.text.length;
      continue;
    }
    const last = changes[changes.length - 1];
    const extend = last && last.to === at;
    if (op.type === 'delete') {
      if (extend) last.to += op.text.length;
      else changes.push({ from: at, to: at + op.text.length, insert: '' });
      at += op.text.length;
    } else if (extend) {
      last.insert += op.text;
    } else {
      changes.push({ from: at, to: at, insert: op.text });
    }
  }
  return changes;
}
