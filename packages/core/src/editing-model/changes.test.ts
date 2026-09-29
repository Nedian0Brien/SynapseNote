import { describe, expect, test } from 'bun:test';
import { type SourceChange, sourceChanges } from './changes.ts';

function apply(source: string, changes: SourceChange[]): string {
  let out = source;
  for (const c of [...changes].sort((a, b) => b.from - a.from))
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  return out;
}

describe('sourceChanges', () => {
  test('wrapping a word inserts only the delimiters', () => {
    expect(sourceChanges('a word here', 'a **word** here')).toEqual([
      { from: 2, to: 2, insert: '**' },
      { from: 6, to: 6, insert: '**' },
    ]);
  });

  test('changes rebuild the target and never split a surrogate pair', () => {
    const cases: [string, string][] = [
      ['Mood: 😀 today', 'Mood: 😁 today'],
      ['abc', 'abc'],
      ['', 'new'],
      ['old', ''],
      ['- item\n- ', '- item\n\n'],
      ['x **a** y', 'x  y'],
    ];
    for (const [before, after] of cases) {
      const changes = sourceChanges(before, after);
      expect(apply(before, changes)).toBe(after);
      for (const c of changes) {
        for (const at of [c.from, c.to]) {
          const code = before.charCodeAt(at);
          expect(code >= 0xdc00 && code <= 0xdfff && at > 0).toBe(false);
        }
      }
    }
  });
});
