import { describe, expect, test } from 'bun:test';
import { IncrementalLayout } from './incremental-layout.ts';
import { computeLayout } from './layout.ts';

const BLOCKS = [
  '# Heading',
  'A paragraph with **bold**, *italic*, `code` and a [link](https://a.b).',
  '- item one\n- item two\n  - nested',
  '- [ ] task\n- [x] done',
  '> quoted **text**\n> more',
  '1. first\n2. second',
  '```js\nconst x = 1;\n```',
  '| a | b |\n| --- | --- |\n| 1 | 2 |',
  'Line with a hard break\\\nnext line',
  'Escapes \\* and &amp; entities',
  '---',
  '[[Wiki link|alias]] and #tag',
];
const INSERTS = [
  'a',
  ' ',
  '*',
  '**',
  '`',
  '[',
  ']',
  '(',
  ')',
  '\n',
  '\n\n',
  '# ',
  '- ',
  '> ',
  '|',
  '\\',
  '~~',
  '==',
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

describe('IncrementalLayout', () => {
  test('matches a full layout after random edits', () => {
    const random = prng(7);
    let incremental = 0;
    let full = 0;
    for (let doc = 0; doc < 40; doc++) {
      const parts: string[] = [];
      for (let i = 0; i < 12; i++) parts.push(BLOCKS[Math.floor(random() * BLOCKS.length)]);
      let source = (random() < 0.3 ? '---\ntitle: t\n---\n\n' : '') + parts.join('\n\n');
      const cache = new IncrementalLayout(source);
      for (let edit = 0; edit < 25; edit++) {
        const at = Math.floor(random() * (source.length + 1));
        if (random() < 0.3 && at < source.length) {
          const length = 1 + Math.floor(random() * 3);
          source = source.slice(0, at) + source.slice(at + length);
        } else {
          source =
            source.slice(0, at) + INSERTS[Math.floor(random() * INSERTS.length)] + source.slice(at);
        }
        const path = cache.update(source);
        if (path === 'incremental') incremental++;
        if (path === 'full') full++;
        expect(cache.layout).toEqual(computeLayout(source));
      }
    }
    console.log(`[incremental layout] incremental ${incremental}, full ${full}`);
    expect(incremental).toBeGreaterThan(full);
  });

  test('a paragraph edit in a long document re-parses only nearby blocks', () => {
    const paragraphs = Array.from(
      { length: 600 },
      (_, i) => `Paragraph ${i} with **bold** and \`code\`.`,
    );
    const source = paragraphs.join('\n\n');
    const cache = new IncrementalLayout(source);
    const at = source.indexOf('Paragraph 300') + 5;
    expect(cache.update(`${source.slice(0, at)}x${source.slice(at)}`)).toBe('incremental');
  });
});
