import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { applyByPrefixSuffix } from '../utils/apply-by-prefix-suffix.ts';
import { splitsSurrogatePair } from '../utils/utf16.ts';
import { applyFastDiff } from './apply-diff.ts';

/**
 * Record every position the diff writes to Y.Text and whether it fell between
 * the halves of a surrogate pair in the text as it was at that moment. A split
 * op is harmless to JS Yjs peers (they write U+FFFD) but other CRDT
 * implementations apply it to a different character.
 */
function spyOnSplits(ytext: Y.Text): () => string[] {
  const splits: string[] = [];
  const del = ytext.delete.bind(ytext);
  const ins = ytext.insert.bind(ytext);
  ytext.delete = (index: number, length: number) => {
    const before = ytext.toString();
    if (splitsSurrogatePair(before, index)) splits.push(`delete start ${index}`);
    if (splitsSurrogatePair(before, index + length)) splits.push(`delete end ${index + length}`);
    del(index, length);
  };
  ytext.insert = (index: number, text: string) => {
    if (splitsSurrogatePair(ytext.toString(), index)) splits.push(`insert at ${index}`);
    ins(index, text);
  };
  return () => splits;
}

const CASES: [string, string][] = [
  ['a😀b', 'a😁b'], // shared high half
  ['a😀b', 'ab'],
  ['a😀b', 'a😀😃b'],
  ['x👍🏽y', 'x👍🏿y'], // shared base emoji, skin tone differs in the low half
  ['한😀글', '한😃글'],
  ['😀😀😀', '😀😁😀'],
];

describe.each([
  ['applyFastDiff (diff-match-patch)', applyFastDiff],
  ['applyByPrefixSuffix', applyByPrefixSuffix],
])('%s', (_name, apply) => {
  test.each(CASES)('%s → %s writes no op inside a surrogate pair', (from, to) => {
    const doc = new Y.Doc();
    const ytext = doc.getText('source');
    ytext.insert(0, from);
    const splits = spyOnSplits(ytext);
    apply(ytext, from, to);
    expect(ytext.toString()).toBe(to);
    expect(splits()).toEqual([]);
  });
});
