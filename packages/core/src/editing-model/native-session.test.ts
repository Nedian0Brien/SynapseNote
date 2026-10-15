import { describe, expect, test } from 'bun:test';
import { computeLayout } from './layout.ts';
import { NativeEditorSession, type NativeEditResult, type NativeRemoteResult } from './native-session.ts';

function apply(source: string, result: NativeEditResult): string {
  let next = source;
  for (const c of result.changes) next = next.slice(0, c.from) + c.insert + next.slice(c.to);
  return next;
}

describe('NativeEditorSession', () => {
  test('typing returns the source changes and the new cursor', () => {
    const session = new NativeEditorSession('hello\n');
    session.select(5, 5);
    const result = JSON.parse(session.edit(JSON.stringify([{ type: 'text', text: '!' }]))) as NativeEditResult;
    expect(apply('hello\n', result)).toBe('hello!\n');
    expect(session.source).toBe('hello!\n');
    expect(result.anchor).toBe(6);
    expect(result.head).toBe(6);
  });

  test('the dirty layout covers the edited block and matches a full layout there', () => {
    const source = 'first **bold**\n\nsecond\n\nthird *it*\n';
    const session = new NativeEditorSession(source);
    session.select(source.indexOf('second') + 6, source.indexOf('second') + 6);
    const result = JSON.parse(session.edit(JSON.stringify([{ type: 'text', text: 'x' }]))) as NativeEditResult;
    const full = computeLayout(session.source);
    const inDirty = (r: { from: number; to: number }) => r.to >= result.dirty.from && r.from <= result.dirty.to;
    expect(result.layout.hidden).toEqual(full.hidden.filter(inDirty));
  });

  test('remote changes map the selection', () => {
    const session = new NativeEditorSession('abc def\n');
    session.select(5, 5);
    const result = JSON.parse(
      session.applyRemote(JSON.stringify([{ from: 0, to: 0, insert: 'XY' }])),
    ) as NativeRemoteResult;
    expect(session.source).toBe('XYabc def\n');
    expect(result.anchor).toBe(7);
  });

  test('a snapshot equals computeLayout', () => {
    const source = '---\ntitle: a\n---\n# Head\n\n- [ ] task\n';
    const session = new NativeEditorSession(source);
    expect(JSON.parse(session.snapshot())).toEqual(computeLayout(source));
  });
});
