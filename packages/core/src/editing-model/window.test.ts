import { describe, expect, test } from 'bun:test';
import { applyActions, initialState } from './edit.ts';
import { type EditAction, editFixtures, parseCursor } from './fixtures.ts';
import { IncrementalLayout } from './incremental-layout.ts';
import { applyActionsInWindow } from './window.ts';

const BLOCKS = [
  '# Heading',
  'A paragraph with **bold**, *italic*, `code` and a [link](https://a.b).',
  '- item one\n- item two',
  '- [ ] task',
  '> quoted **text**',
  '1. first\n2. second',
  '```js\nx\n```',
  'Escapes \\* and &amp;',
  '[[Wiki|alias]] #tag',
];
const ACTIONS: EditAction[] = [
  { type: 'text', text: 'a' },
  { type: 'text', text: '*' },
  { type: 'text', text: ' ' },
  { type: 'text', text: '`' },
  { type: 'text', text: '# ' },
  { type: 'key', key: 'Backspace' },
  { type: 'key', key: 'Delete' },
  { type: 'key', key: 'Enter' },
  { type: 'key', key: 'Shift-Enter' },
  { type: 'key', key: 'ArrowRight' },
  { type: 'toggle', mark: 'bold' },
  { type: 'paste', text: '*x*' },
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

describe('applyActionsInWindow', () => {
  test('edit fixtures inside a longer document give the same result as the whole document', () => {
    const pre = 'Intro paragraph one.\n\nIntro paragraph two.\n\n';
    const post = '\n\nOutro paragraph one.\n\nOutro paragraph two.';
    for (const fixture of editFixtures) {
      const before = parseCursor(fixture.before);
      const source = pre + before.source + post;
      const state = initialState(source, before.anchor + pre.length, before.head + pre.length);
      const whole = applyActions(state, fixture.actions);
      const windowed = applyActionsInWindow(new IncrementalLayout(source), state, fixture.actions);
      expect([fixture.id, windowed.source, windowed.anchor, windowed.head]).toEqual([
        fixture.id,
        whole.source,
        whole.anchor,
        whole.head,
      ]);
    }
  });

  test('random documents and actions give the same result as the whole document', () => {
    const random = prng(11);
    for (let round = 0; round < 400; round++) {
      const parts: string[] = [];
      for (let i = 0; i < 10; i++) parts.push(BLOCKS[Math.floor(random() * BLOCKS.length)]);
      const source = parts.join('\n\n');
      const at = Math.floor(random() * (source.length + 1));
      const action = ACTIONS[Math.floor(random() * ACTIONS.length)];
      const state = initialState(source, at);
      const whole = applyActions(state, [action]);
      const windowed = applyActionsInWindow(new IncrementalLayout(source), state, [action]);
      expect([round, windowed.source, windowed.head]).toEqual([round, whole.source, whole.head]);
    }
  });

  test('typing into a 5,000-line document stays within the frame budget', () => {
    const lines: string[] = [];
    for (let s = 0; s < 313; s++) {
      lines.push(`## Section ${s}`, '');
      for (let p = 0; p < 8; p++)
        lines.push(
          `Paragraph ${s}.${p} with **bold**, *italic*, \`code\`, and a [link](https://e.com/${s}/${p}).`,
        );
      lines.push('', '- [ ] a task', '- a bullet', '', '> a quote', '');
    }
    let source = lines.join('\n');
    const layout = new IncrementalLayout(source);
    let head = source.indexOf('Paragraph 156.3') + 12;
    const samples: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t = performance.now();
      const result = applyActionsInWindow(layout, initialState(source, head), [
        { type: 'text', text: 'x' },
      ]);
      layout.update(result.source);
      samples.push(performance.now() - t);
      source = result.source;
      head = result.head;
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    console.log(
      `[window] 5,000-line keystroke: p50 ${samples[30].toFixed(2)}ms p95 ${p95.toFixed(2)}ms; lines ${source.split('\n').length}`,
    );
    expect(p95).toBeLessThan(8);
  });
});
