import DiffMatchPatch from 'diff-match-patch';
import type * as Y from 'yjs';
import { alignOpsToCodePoints, applyTextOps, type TextOp } from '../utils/utf16.ts';
import { diffLinesFast } from './diff-lines.ts';

const dmpDiff = new DiffMatchPatch();
dmpDiff.Diff_Timeout = 0.25;

const APPLY_FAST_DIFF_MAX_BYTES = 256 * 1024;

export function applyIncrementalDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;

  const changes = diffLinesFast(currentText, newText);
  let offset = 0;
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];
    if (change.removed && next?.added) {
      const targetSlice = currentText.substring(offset, offset + next.value.length);
      if (targetSlice === next.value) {
        offset += next.value.length;
        i++; // consume the paired ADDED
        continue;
      }
      ytext.delete(offset, change.value.length);
      ytext.insert(offset, next.value);
      offset += next.value.length;
      i++; // consume the paired ADDED
    } else if (change.removed) {
      ytext.delete(offset, change.value.length);
    } else if (change.added) {
      ytext.insert(offset, change.value);
      offset += change.value.length;
    } else {
      offset += change.value.length;
    }
  }
}

export function applyFastDiff(ytext: Y.Text, currentText: string, newText: string): void {
  if (currentText === newText) return;
  if (
    currentText.length > APPLY_FAST_DIFF_MAX_BYTES ||
    newText.length > APPLY_FAST_DIFF_MAX_BYTES
  ) {
    applyByPrefixSuffixMiddleReplace(ytext, currentText, newText);
    return;
  }
  const diffs = dmpDiff.diff_main(currentText, newText);
  dmpDiff.diff_cleanupSemantic(diffs);
  // diff-match-patch compares UTF-16 code units, so a change to one half of a
  // surrogate pair (😀→😁 share the high half) comes out as a split. Move the
  // boundaries onto code points before the ops reach the wire.
  const ops: TextOp[] = diffs.map(([type, text]) => ({
    type: type === 0 ? 'retain' : type === -1 ? 'delete' : 'insert',
    text,
  }));
  applyTextOps(ytext, alignOpsToCodePoints(ops));
}

function applyByPrefixSuffixMiddleReplace(
  ytext: Y.Text,
  currentText: string,
  newText: string,
): void {
  let prefixLen = 0;
  const minLen = Math.min(currentText.length, newText.length);
  while (
    prefixLen < minLen &&
    currentText.charCodeAt(prefixLen) === newText.charCodeAt(prefixLen)
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    currentText.charCodeAt(currentText.length - 1 - suffixLen) ===
      newText.charCodeAt(newText.length - 1 - suffixLen)
  ) {
    suffixLen++;
  }

  applyTextOps(
    ytext,
    alignOpsToCodePoints([
      { type: 'retain', text: currentText.slice(0, prefixLen) },
      { type: 'delete', text: currentText.slice(prefixLen, currentText.length - suffixLen) },
      { type: 'insert', text: newText.slice(prefixLen, newText.length - suffixLen) },
      { type: 'retain', text: currentText.slice(currentText.length - suffixLen) },
    ]),
  );
}
