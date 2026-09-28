import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IncrementalBlockParser } from './incremental-block-parse.ts';
import { mdManager, schema } from './md-manager.ts';

const FIXTURES = join(import.meta.dir, '..', '..', 'core', 'src', 'markdown', 'fixtures');
const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(join(FIXTURES, path), 'utf8')) as T;

const SPIKE_DOC = `# Native editor spike

This document exercises the **live preview**, *emphasis*, \`inline code\`, and a [link](https://example.com).

## Lists

- First item
- Second item with **bold**
  - Nested item

1. Ordered one
2. Ordered two

- [ ] Open the document on iPad
- [x] Sync with the server

> A quote that spans
> two lines.

\`\`\`swift
let greeting = "hello"
\`\`\`

<Accordion title="Folded section">

Paragraph inside the accordion.

</Accordion>

The end.
`;

const CORPUS: Record<string, string> = {
  spike: SPIKE_DOC,
  gfm: readJson<{ markdown: string }[]>('gfm/examples.json')
    .map((e) => e.markdown)
    .join('\n\n'),
  'mdx built-ins': readJson<{ blockForm: string }[]>('mdx/built-ins.json')
    .map((e) => e.blockForm)
    .join('\n\n'),
  'indented jsx': readJson<{ source: string }[]>('mdx/indented-jsx.json')
    .map((e) => e.source)
    .join('\n\n'),
  'perf 100': readFileSync(join(FIXTURES, 'perf', '100.md'), 'utf8'),
  regression: readFileSync(join(FIXTURES, 'regression', 'prd-6955-before.md'), 'utf8'),
};

/** Snippets that change block structure as well as text. */
const PIECES = [
  'x',
  ' word',
  '\n',
  '\n\n',
  '# ',
  '## ',
  '- ',
  '1. ',
  '> ',
  '- [ ] ',
  '**',
  '*',
  '`',
  '```',
  '```\n',
  '~~~',
  '|',
  '| a | b |\n|---|---|\n',
  '<',
  '/>',
  '<details>',
  '</details>',
  '{',
  '}',
  '[',
  ']',
  '[x]',
  '[ref]: https://example.com\n',
  '$$',
  '---\n',
  '    ',
  '\t',
  '<!-- c -->',
  '한글',
  '😀',
  '\\',
  '\\*',
];

function makeRng(seed: number) {
  let state = seed;
  return (n: number) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state % n;
  };
}

/** Parse with the observer's settings: B uses parseWithFallback. */
const parse = (md: string) => mdManager.parseWithFallback(md);
const parseMdast = (md: string) => mdManager.parseToMdast(md);

describe('IncrementalBlockParser', () => {
  test.each(
    Object.entries(CORPUS),
  )('%s: every incremental result equals a full parse', (_name, doc) => {
    const rng = makeRng(doc.length);
    const reasons: Record<string, number> = {};
    const parser = new IncrementalBlockParser({
      parse,
      parseMdast,
      schema,
      onFallback: (reason) => {
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      },
    });
    let body = doc;
    parser.parseFull(body);
    const edits = body.length > 40_000 ? 40 : 120;
    let mismatch: string | null = null;
    for (let i = 0; i < edits && mismatch === null; i++) {
      const at = rng(body.length + 1);
      const del = rng(3) === 0 ? Math.min(rng(12), body.length - at) : 0;
      const ins = rng(4) === 0 ? '' : PIECES[rng(PIECES.length)];
      const next = body.slice(0, at) + ins + body.slice(at + del);
      const incremental = parser.update(next);
      if (incremental) {
        const full = parse(next);
        if (
          JSON.stringify(incremental.toJSON()) !==
          JSON.stringify(schema.nodeFromJSON(full).toJSON())
        ) {
          mismatch = `edit ${i}: replaced ${del} at ${at} with ${JSON.stringify(ins)}`;
        }
      } else {
        parser.parseFull(next);
      }
      body = next;
    }
    expect(mismatch).toBeNull();
    // Recorded for tuning, not asserted: how often the fast path held.
    console.log(
      `[incremental] ${_name}: ${parser.stats.incremental} incremental, ${parser.stats.full - 1} full ${JSON.stringify(reasons)}`,
    );
  });

  // Edits here avoid most MDX-breaking input, but one landing inside a JSX tag
  // still breaks the component and sends the parser down the full path until
  // the document parses cleanly again; the point is that the incremental
  // results that do occur — with component positions moved — match a full parse.
  test.each([
    'mdx built-ins',
  ])('%s: component positions move with edits like a full parse', (name) => {
    const rng = makeRng(7);
    const parser = new IncrementalBlockParser({ parse, parseMdast, schema });
    let body = CORPUS[name];
    parser.parseFull(body);
    let mismatch: string | null = null;
    for (let i = 0; i < 60 && mismatch === null; i++) {
      // Insert plain words or newlines at line starts/ends only, so the MDX stays valid.
      const lineBreaks = [...body.matchAll(/\n/g)].map((m) => m.index ?? 0);
      const at = lineBreaks[rng(lineBreaks.length)];
      const next = body.slice(0, at) + (rng(2) === 0 ? ' word' : '\n') + body.slice(at);
      const incremental = parser.update(next);
      if (incremental) {
        if (
          JSON.stringify(incremental.toJSON()) !==
          JSON.stringify(schema.nodeFromJSON(parse(next)).toJSON())
        ) {
          mismatch = `edit ${i} at ${at}`;
        }
      } else {
        parser.parseFull(next);
      }
      body = next;
    }
    expect(mismatch).toBeNull();
    expect(parser.stats.incremental).toBeGreaterThan(5);
  });

  test('an unchanged body returns the cached document', () => {
    const parser = new IncrementalBlockParser({ parse, parseMdast, schema });
    const first = parser.parseFull(SPIKE_DOC);
    const again = parser.update(SPIKE_DOC);
    expect(again?.childCount).toBe(first.childCount);
    expect(again?.child(0)).toBe(first.child(0));
  });

  test('untouched blocks keep their node objects', () => {
    const parser = new IncrementalBlockParser({ parse, parseMdast, schema });
    const before = parser.parseFull(SPIKE_DOC);
    const edited = SPIKE_DOC.replace('The end.', 'The very end.');
    const after = parser.update(edited);
    expect(after).not.toBeNull();
    expect(after?.child(0)).toBe(before.child(0));
    expect(after?.lastChild?.textContent).toBe('The very end.');
  });

  test('a new link reference definition forces a full parse', () => {
    const parser = new IncrementalBlockParser({ parse, parseMdast, schema });
    parser.parseFull('See [x].\n\nEnd.\n');
    expect(parser.update('See [x].\n\n[x]: https://example.com\n\nEnd.\n')).toBeNull();
  });
});
