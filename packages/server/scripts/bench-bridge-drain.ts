/**
 * Time one bridge drain (the observers' `afterAllTransactions` work) for a
 * single-character edit, without Hocuspocus or persistence in the way.
 *
 *   bun packages/server/scripts/bench-bridge-drain.ts [--samples 20] [--lines 38,1000,5000]
 *
 * Two edit kinds per document size:
 *   text      — insert into Y.Text('source'), as a source-mode or native client does (Observer B)
 *   fragment  — insert into a paragraph's Y.XmlText, as the web editor does (Observer A)
 *
 * The shared `mdManager` is wrapped so each drain also reports time spent in
 * parse and serialize; the rest is fragment comparison, normalization, splice
 * computation and bookkeeping.
 */
import { updateYFragment } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { mdManager, schema } from '../src/md-manager.ts';
import { setupServerObservers } from '../src/server-observers.ts';

function arg(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index >= 0 ? Bun.argv[index + 1] : undefined;
}

const samples = Number(arg('--samples') ?? 20);
const sizes = (arg('--lines') ?? '38,1000,5000').split(',').map(Number);

/** Same shape as the native spike's large fixture: headings, emphasis, tasks, quotes. */
function makeMarkdown(lineCount: number): string {
  const lines: string[] = [];
  for (let section = 0; lines.length < lineCount; section++) {
    lines.push(`## Section ${section}`, '');
    for (let i = 0; i < 8; i++) {
      lines.push(
        `Paragraph ${section}.${i} with **bold**, *italic*, \`code\`, and a [link](https://example.com/${section}/${i}).`,
      );
    }
    lines.push(
      '',
      '- [ ] a task',
      '- [x] a done task',
      '- a bullet with **emphasis**',
      '',
      '> a quote line',
      '',
    );
  }
  return `${lines.slice(0, lineCount).join('\n')}\n`;
}

type Stage = 'parse' | 'serialize';
const stageMs: Record<Stage, number> = { parse: 0, serialize: 0 };
const stageCalls: Record<Stage, number> = { parse: 0, serialize: 0 };
// Only the outermost call is timed: parseWithFallback calls parse internally.
let depth = 0;
function wrap<K extends 'parse' | 'parseWithFallback' | 'parseToMdast' | 'serialize'>(
  method: K,
  stage: Stage,
): void {
  const original = (mdManager[method] as (...a: unknown[]) => unknown).bind(mdManager);
  (mdManager as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
    const outer = depth === 0;
    depth++;
    const t = performance.now();
    try {
      return original(...args);
    } finally {
      depth--;
      if (outer) {
        stageMs[stage] += performance.now() - t;
        stageCalls[stage] += 1;
      }
    }
  };
}
wrap('parse', 'parse');
wrap('parseWithFallback', 'parse');
wrap('parseToMdast', 'parse');
wrap('serialize', 'serialize');

function resetStages(): void {
  stageMs.parse = stageMs.serialize = 0;
  stageCalls.parse = stageCalls.serialize = 0;
}

function setup(markdown: string) {
  const doc = new Y.Doc();
  const xmlFragment = doc.getXmlFragment('default');
  const ytext = doc.getText('source');
  doc.transact(() => {
    ytext.insert(0, markdown);
    const node = schema.nodeFromJSON(mdManager.parse(markdown));
    updateYFragment(doc, xmlFragment, node, { mapping: new Map(), isOMark: new Map() });
  });
  const cleanup = setupServerObservers({
    doc,
    xmlFragment,
    ytext,
    mdManager,
    schema,
    docName: 'bench',
  });
  return { doc, xmlFragment, ytext, cleanup };
}

function middleParagraphText(fragment: Y.XmlFragment): Y.XmlText {
  const paragraphs = fragment
    .toArray()
    .filter((n): n is Y.XmlElement => n instanceof Y.XmlElement && n.nodeName === 'paragraph');
  const text = paragraphs[Math.floor(paragraphs.length / 2)]
    ?.toArray()
    .find((c): c is Y.XmlText => c instanceof Y.XmlText);
  if (!text) throw new Error('no paragraph text to edit');
  return text;
}

const q = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const fmt = (n: number) => n.toFixed(1).padStart(8);

console.log(`samples per cell: ${samples} (after 3 warmups)`);
console.log('lines   kind      drain p50  drain p95   parse p50  serialize p50  parse/ser calls');
for (const lines of sizes) {
  for (const kind of ['text', 'fragment'] as const) {
    const { doc, xmlFragment, ytext, cleanup } = setup(makeMarkdown(lines));
    const remote = {}; // any non-bridge origin, like a Hocuspocus connection
    const drain: number[] = [];
    const parse: number[] = [];
    const serialize: number[] = [];
    let calls = '';
    for (let i = 0; i < samples + 3; i++) {
      resetStages();
      const t = performance.now();
      doc.transact(() => {
        if (kind === 'text') ytext.insert(Math.floor(ytext.length / 2), 'x');
        else middleParagraphText(xmlFragment).insert(0, 'x');
      }, remote);
      const elapsed = performance.now() - t;
      if (i >= 3) {
        drain.push(elapsed);
        parse.push(stageMs.parse);
        serialize.push(stageMs.serialize);
        calls = `${stageCalls.parse}/${stageCalls.serialize}`;
      }
    }
    cleanup();
    console.log(
      `${String(lines).padStart(5)}   ${kind.padEnd(8)}${fmt(q(drain, 0.5))}ms${fmt(q(drain, 0.95))}ms  ${fmt(q(parse, 0.5))}ms   ${fmt(q(serialize, 0.5))}ms      ${calls}`,
    );
  }
}
