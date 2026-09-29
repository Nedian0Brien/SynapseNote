/**
 * Property: typing one character changes nothing on screen except that
 * character (SPEC.md §5), unless it completes a construct (an input rule).
 */
import { describe, expect, test } from 'bun:test';
import { applyActions, initialState } from './edit.ts';
import { computeLayout } from './layout.ts';

const PIECES = [
  'word',
  '한글',
  ' ',
  ' ',
  '**bold**',
  '*it*',
  '_u_',
  '`code`',
  '~~del~~',
  '==hi==',
  '[link](https://a.b)',
  '[[위키]]',
  '\\*',
  '&amp;',
  '1.5',
  '#tag',
];
const CHARS = [
  'a',
  '가',
  ' ',
  '*',
  '_',
  '`',
  '[',
  ']',
  '(',
  ')',
  '~',
  '=',
  '#',
  '>',
  '-',
  '!',
  '\\',
  '<',
  '|',
];

function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Each on-screen unit as `char|mark,mark` (hidden syntax dropped, marks by type). */
function styledScreen(source: string): string[] {
  const layout = computeLayout(source);
  const hidden = new Uint8Array(source.length);
  for (const h of layout.hidden) hidden.fill(1, h.from, h.to);
  const widgets = new Map(layout.widgets.map((w) => [w.from, w]));
  const units: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const widget = widgets.get(i);
    if (widget) {
      // A character reference shows the character it stands for.
      const ref = /^&#x([0-9a-f]+);$/i.exec(source.slice(widget.from, widget.to));
      const shown = ref
        ? String.fromCodePoint(Number.parseInt(ref[1], 16))
        : source.slice(widget.from, widget.to);
      const marks = layout.marks
        .filter((m) => m.open[1] <= i && i < m.close[0])
        .map((m) => m.type)
        .sort()
        .join(',');
      units.push(`${shown}|${marks}`);
      i = widget.to - 1;
      continue;
    }
    if (hidden[i]) continue;
    const marks = layout.marks
      .filter((m) => m.open[1] <= i && i < m.close[0])
      .map((m) => m.type)
      .sort()
      .join(',');
    units.push(`${source[i]}|${marks}`);
  }
  return units;
}

describe('typing changes only the typed character', () => {
  test('random paragraphs and characters', () => {
    const random = prng(20260929);
    let checked = 0;
    let escaped = 0;
    let rules = 0;
    const failures: string[] = [];
    for (let round = 0; round < 3000; round++) {
      const pieces = 3 + Math.floor(random() * 6);
      let source = '';
      for (let p = 0; p < pieces; p++) source += PIECES[Math.floor(random() * PIECES.length)];
      source = `lead ${source} tail`;
      const at = Math.floor(random() * (source.length + 1));
      const ch = CHARS[Math.floor(random() * CHARS.length)];
      // Not representable, by Markdown itself (SPEC.md §5 limits): a wiki link's
      // `|`/`[`/`]` inside its target, and sources already ambiguous before the
      // edit — four or more of one delimiter in a row (`****`, `====`).
      const insideWiki = computeLayout(source).marks.some(
        (m) => m.type === 'wikiLink' && m.open[1] <= at && at <= m.close[0],
      );
      if ((insideWiki && /[|[\]]/.test(ch)) || /\*{4,}|_{4,}|~{4,}|={4,}/.test(source)) continue;
      const result = applyActions(initialState(source, at), [{ type: 'text', text: ch }]);
      if (result.side === 'outside') {
        rules++;
        continue;
      }
      if (result.source.length === source.length + 2) escaped++;
      const before = styledScreen(source);
      const after = styledScreen(result.source);
      // Drop the typed character from `after` wherever it landed.
      let diff = 0;
      while (diff < before.length && before[diff] === after[diff]) diff++;
      const without = [...after.slice(0, diff), ...after.slice(diff + 1)];
      checked++;
      if (JSON.stringify(without) !== JSON.stringify(before) || !after[diff]?.startsWith(ch)) {
        if (failures.length < 5)
          failures.push(
            `${JSON.stringify(source)} @${at} + ${JSON.stringify(ch)} → ${JSON.stringify(result.source)}`,
          );
      }
    }
    console.log(
      `[edit property] checked ${checked}, escaped ${escaped}, input rules ${rules}, failures ${failures.length}`,
    );
    expect(failures).toEqual([]);
  });
});
