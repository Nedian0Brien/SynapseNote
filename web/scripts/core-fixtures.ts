// writes the values the swift data core is checked against: what morrow's typescript core makes of the same
// inputs. run: npm run core-fixtures, which writes ../App/Tests/Fixtures/core/expected/*.json
//
// inputs: the markdown files in ../App/Tests/Fixtures/core/input, the inputs of morrow's own markdown and vault
// tests, and the first-run guide vault that morrow's sampleCommands make. the clock, the ids and the time zone
// (TZ=UTC in the npm script) are fixed so the output is the same on every run.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stringify } from 'yaml';
import path from 'node:path';

const FIXED_NOW = Date.UTC(2026, 9, 19, 9, 30, 0);
// new Date() as well as Date.now(), the vault repository dates its activity count with new Date()
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(FIXED_NOW);
    else super(...(args as [string | number]));
  }
  static override now(): number {
    return FIXED_NOW;
  }
}
globalThis.Date = FixedDate as DateConstructor;
// page history snapshots take random ids
let snapshotIds = 0;
globalThis.crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++snapshotIds).padStart(12, '0')}` as ReturnType<Crypto['randomUUID']>;

import { markdownToDoc } from '../vendor/morrow/src/core/markdown/parse';
import { docToMarkdown } from '../vendor/morrow/src/core/markdown/serialize';
import { joinFrontmatter, splitFrontmatter } from '../vendor/morrow/src/core/vault/frontmatter';
import { composeFrontmatter, managedFrontmatter, readPageText, renderPageText } from '../vendor/morrow/src/core/vault/pageFile';
import { loadVault } from '../vendor/morrow/src/core/vault/load';
import type { VaultScan } from '../vendor/morrow/src/core/vault/load';
import { linkTargets } from '../vendor/morrow/src/core/vault/layout';
import { basename, dirname, isHiddenPath, isPageFile, relativePath } from '../vendor/morrow/src/core/vault/paths';
import { canvasFromDoc, writeCanvas } from '../vendor/morrow/src/core/canvas';
import { displayTitle } from '../vendor/morrow/src/core/model';
import { sampleCommands } from '../vendor/morrow/src/core/sample';
import { applyTemplate, fillTemplate, formatDate } from '../vendor/morrow/src/core/templates';
import * as queries from '../src/queries';
import { applyCommand } from '../vendor/morrow/src/core/commands';
import { emptyWorkspace } from '../vendor/morrow/src/core/model';
import type { WorkspaceState } from '../vendor/morrow/src/core/model';
import { schedule } from '../vendor/morrow/src/core/flashcards';
import type { ReviewLog } from '../vendor/morrow/src/core/flashcards';
import { MemoryVault } from '../vendor/morrow/src/storage/memoryVault';
import { WorkspaceSession } from '../vendor/morrow/src/storage/session';
import { VaultRepository } from '../vendor/morrow/src/storage/vaultRepository';
import type { Command } from '../vendor/morrow/src/core/commands';
import type { VaultOp } from '../vendor/morrow/src/core/vault/plan';

// the fixtures folder is given on the command line, the script runs from a bundle elsewhere
const fixtures = process.argv[2] ?? '';
if (!fixtures) throw new Error('Give the fixtures folder.');
const out = path.join(fixtures, 'expected');

// maps and sets as morrow keeps them, written in insertion order so swift can compare them
function plain(value: unknown): unknown {
  if (value instanceof Map) return [...value.entries()].map(([key, item]) => [key, plain(item)]);
  if (value instanceof Set) return [...value].map(plain);
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    const object: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) object[key] = plain(item);
    return object;
  }
  return value;
}

function write(name: string, value: unknown, indent = 1): void {
  writeFileSync(path.join(out, name), `${JSON.stringify(plain(value), null, indent)}\n`);
}

// mulberry32, a small seeded generator so the fuzz inputs are the same on every run
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LINE_STARTS = [
  '', '', '', '', '# ', '## ', '###### ', '####### ', '> ', '>> ', '> [!note] ', '> [!WARNING]- Title ', '> [!tip]+',
  '- ', '* ', '+ ', '1. ', '2) ', '10. ', '- [ ] ', '- [x] ', '* [X] ', '  - ', '    ', '\t', '```', '```ts', '~~~',
  '$$', '| ', '---', '***', '___', '===', '<div>', '<details><summary>Sum &amp; <b>mary</b></summary>', '</details>',
  '<aside>', '</aside>', '<!-- toc -->', '<div data-columns>', '<div data-column>', '</div>', '[ref]: /url "title"',
  '[Ref Two]: <https://example.org/a b> \'t\'', '<script>', '<!--', '-->', '<pre>', '</pre>', '<?php ', '<![CDATA[',
  '<!DOCTYPE html>', '<custom-tag attr="1">',
];
const PIECES = [
  'word', 'word', 'two words', 'text', 'Ünïcödé', '다람쥐 헌 쳇바퀴', '😀', '🧪x', ' ', ' ', '  ', '   ', '\t',
  '\n', '\n', '\n\n', '\r\n', '*', '**', '***', '_', '__', '~', '~~', '=', '==', '`', '``', '```', '$', '$$', '$5', '\\',
  '\\*', '\\|', '\\[', '\\\n', '[', ']', '(', ')', '](', '](/path)', '](https://example.org "t")', '][ref]', '[ref]',
  '[[', ']]', '[[Page]]', '[[Folder/Page#Head|Alias]]', '[[2026-10-17]]', '![[pic.png]]', '![', '![alt](img.png)',
  '<', '>', '<u>', '</u>', '<span style="color: #d44c47">', '<span style="background-color:#fbecdd;">', '</span>',
  '<mark>', '<mark style="background: #e7f3f8">', '</mark>', '<br>', '<br/>', '<b>', '</b>', '<a href="x">', '</a>',
  '&amp;', '&#x41;', '&#65;', '&#0;', '&#x110000;', '&nbsp;', '&bogus;', '&copy', '&Agrave;', 'https://example.org/a b',
  '<https://x.y/z?q=1>', '<a@b.co>', '<javascript:alert(1)>', 'http://例え.jp', '|', '!', '#', '[x]', '[ ]', '|alias',
  '#anchor', '-', '+', '1.', ':', '"', "'", '{', '}', '^', '@', '%', '&',
];

const YAML_KEYS = [
  'title', 'title', 'tags', 'tags', 'tag', 'aliases', 'icon', 'cover', 'kind', 'cssclasses', 'date', 'created', 'rating',
  'done', 'status', '"quoted key"', "'single key'", '한글 키', '1', '01', 'true', '~', 'null', '<<', 'a b', 'x:y', '"a: b"',
  // a collection as a key ('? a: b', '[a, b]: c') is written back by yaml from its source text and comments,
  // which the swift reader does not keep; frontmatter never has one
  'key with trailing space ', 'émoji 😀',
];
const YAML_SCALARS = [
  'word', 'two words', 'Hello, world', '한글 값', 'café', '😀', '1', '-0', '017', '0o17', '0x1F', '0xG', '1.0', '1.50', '1e3',
  '.5', '+.5', '1_000', '12345678901234567890', '.inf', '-.Inf', '.nan', 'NaN', 'true', 'True', 'TRUE', 'tRue', 'yes', 'no',
  'on', 'off', 'y', '~', 'null', 'Null', 'NULL', "''", '""', '2026-10-19', '2026-10-19T09:30:00Z', '09:30', '"a \\"b\\""',
  '"\\u00e9\\t\\n"', '"\\x41\\N\\_\\L"', "'it''s'", "'a\"b'", '"[[Link]]"', '[[Link]]', '#tag', 'a #comment', 'a# not', 'a: b',
  'a:b', '-', '- x', '? x', '&anchor value', '*anchor', '!!str 12', '!!int "12"', '!!float 1', '!!bool yes', '!!null ""',
  '!custom x', '! 12', '%percent', '@at', '`tick`', 'gradient-3', 'images/cover.png', 'https://example.org/a?b=c#d', '{a: 1}',
  '{a: 1, b: [x, y]}', '[a, b]', '[]', '{}', '[1, "2", true]', '[a, [b, c]]', '| broken', '"unclosed', "'unclosed", ':',
  'trailing  ', 'a b', 'a\u0085b', 'tab\tinside', '\u0007bell',
];
const YAML_BLOCKS = [
  '|\n  line one\n  line two', '|-\n  kept\n\n  gap', '>\n  folded\n  text\n', '>+\n  keep\n\n', '|2\n    indented', '|\n',
  '\n  - a\n  - b', '\n  - a\n  -\n  - c', '\n- a\n- b', '\n  - [x, y]\n  - {k: v}', '\n  sub: 1\n  other: two',
  '\n  nested:\n    deep: true', '\n\t- tab', '\n  - a\n - b', '\n  multi\n  line plain',
];

function frontmatterInputs(count: number): string[] {
  const next = random(20261020);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const inputs: string[] = [];
  for (let i = 0; i < count; i++) {
    const lines: string[] = [];
    const lineCount = Math.floor(next() * 6);
    for (let l = 0; l < lineCount; l++) {
      const roll = next();
      if (roll < 0.06) lines.push(`# comment ${l}`);
      else if (roll < 0.08) lines.push('');
      else if (roll < 0.1) lines.push(`  ${pick(YAML_KEYS)}: ${pick(YAML_SCALARS)}`);
      else if (roll < 0.12) lines.push(`- ${pick(YAML_SCALARS)}`);
      else if (roll < 0.3) lines.push(`${pick(YAML_KEYS)}:${pick(YAML_BLOCKS)}`);
      else lines.push(`${pick(YAML_KEYS)}: ${pick(YAML_SCALARS)}`);
    }
    const yaml = lines.join('\n');
    const shape = next();
    const close = next() < 0.1 ? '...' : '---';
    let text = shape < 0.05 ? `${yaml}\nBody` : `---\n${yaml}${yaml ? '\n' : ''}${close}\nBody line\n\n## Heading\n`;
    if (next() < 0.08) text = text.replace(/\n/g, '\r\n');
    if (next() < 0.04) text = `﻿${text}`;
    if (next() < 0.03) text = text.replace('---\n', '---  \n');
    inputs.push(text);
  }
  return inputs;
}

const STRING_PIECES = [
  'a', 'word', ' ', '  ', '\n', '\n\n', '\t', ':', ': ', '#', ' #', '-', '- ', '?', '? ', ',', '[', ']', '{', '}', '&', '*', '!',
  '|', '>', "'", '"', '%', '@', '`', '\\', '---', '...', '1', '0x1', '1.5', 'true', 'null', '~', '한글', '😀', '\u0007', '\u0000',
  '\u001b', '\u0085', ' ', ' ', '\x7f', '\x9f', 'é',
];

function yamlValues(count: number): Record<string, unknown>[] {
  const next = random(20261021);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const text = (): string => {
    let out = '';
    const pieces = Math.floor(next() * 6);
    for (let p = 0; p < pieces; p++) out += pick(STRING_PIECES);
    return out;
  };
  const value = (depth: number): unknown => {
    const roll = next();
    if (roll < 0.45 || depth > 2) return text();
    // -0, NaN and the infinities do not survive the JSON this file is, the frontmatter fixture covers them
    if (roll < 0.55) return pick([0, 1, -1, 1.5, 1e21, 1e-7, 123456789012, 0.1]);
    if (roll < 0.6) return next() < 0.5;
    if (roll < 0.65) return null;
    if (roll < 0.82) return Array.from({ length: Math.floor(next() * 4) }, () => value(depth + 1));
    return object(depth + 1);
  };
  const object = (depth: number): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    const keys = Math.floor(next() * 4);
    for (let k = 0; k < keys; k++) out[next() < 0.6 ? pick(['title', 'tags', 'a', 'b', '2', '10', '']) : text()] = value(depth);
    return out;
  };
  return Array.from({ length: count }, () => object(0));
}

// names people give notes and folders, with the differences collation weighs: case, accents, digits, spacing,
// punctuation, hangul, other scripts and unicode normalization
function collationWords(): string[] {
  return [
    'a', 'A', 'b', 'B', 'ab', 'Ab', 'aB', 'a b', 'a-b', 'a_b', 'a.b', 'a,b', 'a(b', '_a', '-a', '.a', '(a', '#a', '@a', ' a',
    'à', 'á', 'â', 'ä', 'å', 'æ', 'ç', 'é', 'è', 'ê', 'ë', 'ñ', 'ö', 'ø', 'ß', 'ss', 'œ', 'oe', 'Å', 'É', 'Ö', 'ǅ', 'ﬁ', 'fi',
    'é', 'é', 'Cafe', 'café', 'Café', 'CAFE', 'cafe 2', 'cafe 10', 'cafe 1', 'Cafe 02', 'cafe2', 'cafe10',
    'Note', 'note', 'Notes', 'notes', 'Note 1', 'Note 2', 'Note 10', 'Note 9', 'Note 01', 'Note 1a', 'Note1', 'note-1',
    '1', '2', '10', '01', '001', '1.5', '1,5', '½', '①', '١', '२', '１', '2026-10-19', '2026-10-09', '2026-9-19', 'Ⅳ', 'iv',
    '가', '나', '다', '각', '간', '갈', '감', '가나', '가 나', '한글', '한국어', 'ㄱ', 'ㄴ', 'ㅏ', '가', '꽃', '홍길동',
    'あ', 'ア', 'か', '漢字', '中文', 'Ω', 'ω', 'α', 'Б', 'б', 'ж', 'א', 'ب', 'ก', '😀', '😀a', '🧪', '★', '©', '%', '&', '~',
    '', ' ', '  ', 'z', 'Z', 'zz', 'Zebra', 'zebra', 'Ångström', 'Angstrom', 'Résumé', 'resume', 'Resume', 'naïve', 'naive',
  ];
}

function fuzzInputs(count: number): string[] {
  const next = random(20261019);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const inputs: string[] = [];
  for (let i = 0; i < count; i++) {
    const lines: string[] = [];
    const lineCount = 1 + Math.floor(next() * 8);
    for (let l = 0; l < lineCount; l++) {
      let line = pick(LINE_STARTS);
      const pieces = Math.floor(next() * 12);
      for (let p = 0; p < pieces; p++) line += pick(PIECES);
      lines.push(line);
    }
    inputs.push(lines.join('\n'));
  }
  return inputs;
}

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

// inputs of morrow's src/core/markdown/markdown.test.ts and src/storage/vault.test.ts, copied as they are
const MORROW_NOTE = `## Weekly review

Shipped the **sidebar** rewrite, fixed *two* bugs and wrote \`docs\`. See [the plan](https://example.org/plan).

Also <u>underlined</u> and ~~struck~~ text.

- Groceries
  - oat milk
  - bread
- Post office

1. Draft
2. Edit
3. Publish

- [x] Book train tickets
- [ ] Call the landlord

> Simplicity is prerequisite for reliability.

\`\`\`ts
const answer = 42;
\`\`\`

---

| Book | Author |
| --- | --- |
| Middlemarch | George Eliot |
| Piranesi | Susanna Clarke |
`;

const OBSIDIAN: Record<string, string> = {
  'Welcome.md': '---\ntags: [start]\ncssclasses: wide\n---\n# Hello\n\nSee [[Projects/Garden|the garden]].\n',
  'Projects.md': 'All my projects.\n',
  'Projects/Garden.md': 'Back to [[Welcome]].\n\n* loose   formatting  kept\n',
  'Ideas/Loose idea.md': 'Just a thought with ![[pic.png]]\n',
  'attachments/pic.png': 'PNG',
  'Board.canvas': JSON.stringify({
    nodes: [
      { id: 'a', type: 'text', text: 'hello', x: 0, y: 0, width: 200, height: 80 },
      { id: 'b', type: 'file', file: 'Projects/Garden.md', x: 300, y: 0, width: 200, height: 80 },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
  }),
  '.obsidian/app.json': '{}',
};

// names that differ only by unicode normalization are different files to morrow, as on most file systems
const NORMALIZATION: Record<string, string> = {
  ['한글 파일.md']: 'Composed name.\n',
  ['한글 파일.md'.normalize('NFD')]: 'Decomposed name.\n',
  ['Café.md']: 'Links to [[한글 파일]] and [[Cafe]].\n',
};

// the scan a desktop shell makes of a folder of files, every file with the same dates
function scanOf(files: Record<string, string>): VaultScan {
  const scan: VaultScan = { files: [], folders: [], others: [], registry: null, recent: null };
  const folders = new Set<string>();
  for (const [file, text] of Object.entries(files)) {
    for (let dir = dirname(file); dir; dir = dirname(dir)) folders.add(dir);
    if (file === '.morrow/workspace.json') scan.registry = JSON.parse(text) as unknown;
    else if (file === '.morrow/recent.json') scan.recent = JSON.parse(text) as unknown;
    else if (isHiddenPath(file)) continue;
    else if (isPageFile(file)) scan.files.push({ path: file, text, mtime: FIXED_NOW - 1000, birthtime: FIXED_NOW - 2000 });
    else scan.others.push(file);
  }
  for (const folder of [...folders].sort()) if (!isHiddenPath(folder)) scan.folders.push({ path: folder, mtime: FIXED_NOW - 1000, empty: false });
  return scan;
}

// what morrow's vault repository writes for every page as if each had just been edited in the app
function rendered(files: Record<string, string>): Record<string, string | null> {
  const loaded = loadVault(scanOf(files), counter('v'), FIXED_NOW);
  const pages = Object.fromEntries(loaded.pages.map((page) => [page.id, page]));
  const targets = linkTargets(loaded.layout);
  const result: Record<string, string | null> = {};
  for (const page of loaded.pages) {
    const placement = loaded.layout.get(page.id);
    if (!placement?.file) continue;
    const doc = loaded.docs[page.id];
    if (page.kind === 'canvas') {
      result[placement.file] = writeCanvas(canvasFromDoc(doc), (id) => loaded.layout.get(id)?.file ?? null);
      continue;
    }
    if (!doc) {
      result[placement.file] = null;
      continue;
    }
    const dir = dirname(placement.file);
    const body = docToMarkdown(doc, {
      linkTarget: (id) => targets.get(id) ?? null,
      titleOf: (id) => (pages[id] ? displayTitle(pages[id]!) : null),
      filePath: (fileId) => (fileId.includes('/') || fileId.includes('.') ? relativePath(dir, fileId) : null),
    });
    const parent = page.parentId ? pages[page.parentId] : undefined;
    const source = loaded.sources.get(page.id) ?? null;
    const managed = managedFrontmatter(page, basename(placement.folder), parent?.kind === 'database' ? parent.database : null);
    result[placement.file] = renderPageText(composeFrontmatter(managed, source && { ...source, body: null }), source, body);
  }
  return result;
}

// the file operations morrow's session sends to the vault when it saves, page history left out (11c)
function recordOps(vault: MemoryVault): () => VaultOp[] {
  let log: VaultOp[] = [];
  const apply = vault.apply.bind(vault);
  vault.apply = async (ops: VaultOp[]) => {
    log.push(...ops.filter((op) => !('path' in op && op.path.startsWith('.morrow/history/'))));
    return apply(ops);
  };
  return () => {
    const ops = log;
    log = [];
    return ops;
  };
}

function loadedState(files: Record<string, string>): WorkspaceState {
  const loaded = loadVault(scanOf(files), counter('v'), FIXED_NOW);
  return { pages: Object.fromEntries(loaded.pages.map((page) => [page.id, page])), docs: loaded.docs };
}

// a workspace written over weeks: a journal with daily notes in earlier years, tasks, flashcards, #tags
// nested and inline, links between pages, hangul and accents in titles and text
function dailyState(): WorkspaceState {
  let state = emptyWorkspace();
  const day = 86_400_000;
  const run = (command: Command) => {
    const result = applyCommand(state, command);
    if (!result.ok) throw new Error(result.error);
    state = result.value.state;
  };
  const doc = (markdown: string) => markdownToDoc(markdown);
  run({ type: 'page.create', id: 'journal', parentId: null, now: FIXED_NOW - 400 * day, title: 'Journal', kind: 'journal' });
  const days: Array<[string, string, number]> = [
    ['2025-10-19', 'Last year today. - [ ] old task\n\nCapital of France :: Paris', 365],
    ['2024-10-19', 'Two years ago, met [[Café Lumière]].', 730],
    ['2026-09-19', 'A month ago #reading/novels', 30],
    ['2026-10-18', '- [x] done yesterday\n- [ ] carried over #work', 1],
    ['2026-10-19', 'Today with **bold** and #work/meetings.\n\n- [ ] 오늘 할 일', 0],
  ];
  for (const [date, text, ago] of days)
    run({ type: 'page.create', id: `d${date.replaceAll('-', '')}`, parentId: 'journal', now: FIXED_NOW - ago * day, title: date, dailyDate: date, doc: doc(text) });
  run({ type: 'page.create', id: 'cafe', parentId: null, now: FIXED_NOW - 90 * day, title: 'Café Lumière', icon: '☕', tags: ['places', 'reading'], doc: doc('A small café by the river. Mentioned with friends, and the café lumière is quiet in the morning. It serves good coffee and has many books on the shelves for long afternoons of reading.') });
  run({ type: 'page.create', id: 'korean', parentId: null, now: FIXED_NOW - 60 * day, title: '한글 노트', tags: ['언어'], doc: doc('# 소개\n\n한글 노트는 [[Café Lumière]]를 언급하지 않고 café lumière라고만 쓴다.\n\n## 단어\n\n사과 :: apple\n\n배 :: pear\n\n- [ ] 단어 외우기 #언어/어휘') });
  run({ type: 'page.create', id: 'projects', parentId: null, now: FIXED_NOW - 200 * day, title: 'Projects', tags: ['project'], doc: doc('Index of projects. See [[Garden]].') });
  run({ type: 'page.create', id: 'garden', parentId: 'projects', now: FIXED_NOW - 150 * day, title: 'Garden', tags: ['project/garden'], doc: doc('Plant tomatoes #project/garden\n\n```\n#not-a-tag in code\n```\n\nWhat grows in shade :: ferns\n\n- [ ] water the beds\n- [x] buy seeds') });
  run({ type: 'page.create', id: 'empty', parentId: null, now: FIXED_NOW - 10 * day, title: '', doc: doc('') });
  run({ type: 'page.create', id: 'old', parentId: null, now: FIXED_NOW - 120 * day, title: 'Rediscover me', doc: doc('This is an older note with enough words in it to be worth seeing again some day when you open the home page and look around.') });
  run({ type: 'page.create', id: 'trashed', parentId: null, now: FIXED_NOW - 5 * day, title: 'Trashed café', doc: doc('Links [[Garden]] and #trash-tag') });
  run({ type: 'page.trash', id: 'trashed', now: FIXED_NOW - 4 * day });
  run({ type: 'page.create', id: 'templates', parentId: null, now: FIXED_NOW - 300 * day, title: 'Templates', kind: 'templates' });
  run({ type: 'page.create', id: 'dailytpl', parentId: 'templates', now: FIXED_NOW - 300 * day, title: 'Daily note', doc: doc('# {{date}}') });
  run({ type: 'page.markOpened', id: 'garden', now: FIXED_NOW - 2 * day });
  run({ type: 'page.markOpened', id: 'cafe', now: FIXED_NOW - day });
  run({ type: 'page.setFavorite', id: 'cafe', favorite: true });
  return state;
}

// the answers web/src/queries.ts gives on four workspaces, with every argument the native screens pass
async function queryAnswers(): Promise<unknown> {
  const sessionFiles = ((await sessionSteps()) as { files: Record<string, string> }).files;
  const now = new RealDate(FIXED_NOW);
  const activity = { '2026-10-19': 3, '2026-10-18': 1, '2026-10-17': 2, '2026-10-15': 4, '2026-09-01': 5 };
  const states: Array<{ name: string; state: WorkspaceState }> = [
    { name: 'guide', state: loadedState(await guideVault()) },
    { name: 'edited', state: loadedState(sessionFiles) },
    { name: 'obsidian', state: loadedState(OBSIDIAN) },
    { name: 'daily', state: dailyState() },
  ];
  return states.map(({ name, state }) => {
    // a review log with cards seen before, some due and some not
    const cards = queries.review(state, {}, now).cards;
    const log: ReviewLog = {};
    cards.forEach((card, index) => {
      const past = new RealDate(FIXED_NOW - (index + 1) * 3 * 86_400_000);
      if (index % 3 !== 2) log[card.id] = schedule(undefined, index % 2 ? 'good' : 'again', past);
    });
    const answers: Array<{ query: string; params: Record<string, unknown>; answer: unknown }> = [];
    const ask = (query: string, params: Record<string, unknown>, answer: unknown) =>
      answers.push({ query, params, answer: JSON.parse(JSON.stringify(answer)) as unknown });
    for (const text of ['', 'welcome', 'Welcome to', 'markdown', '#getting-started', '#project', '#project garden', 'cafe', 'Café', '한글', '언어', 'tasks templates', 'a', 'e', 'zzz', '#none word', 'link', '  spaced   words  '])
      for (const limit of [30, 3]) ask('search', { query: text, limit }, queries.search(state, text, limit));
    ask('recent', { limit: 30 }, queries.recent(state, 30));
    ask('recent', { limit: 2 }, queries.recent(state, 2));
    ask('home', {}, queries.home(state, activity, now));
    ask('home', { activity: 'none' }, queries.home(state, {}, now));
    for (const id of Object.keys(state.pages)) {
      ask('backlinks', { id }, queries.backlinks(state, id));
      ask('mentions', { id }, queries.mentions(state, id));
      ask('outline', { id }, queries.outline(state.docs[id]));
    }
    ask('tags', {}, queries.tags(state));
    for (const entry of queries.tags(state)) ask('tagPages', { tag: entry.tag }, queries.tagPages(state, entry.tag));
    for (const tag of ['project', 'PROJECT', 'work', 'missing']) ask('tagPages', { tag }, queries.tagPages(state, tag));
    ask('tasks', {}, queries.tasks(state));
    ask('templates', {}, queries.templates(state));
    ask('counts', {}, queries.counts(state, log, now));
    ask('review', {}, queries.review(state, log, now));
    ask('review', { log: 'none' }, queries.review(state, {}, now));
    const ids = Object.keys(state.pages);
    for (const tags of [false, true])
      for (const hierarchy of [false, true])
        for (const orphans of [true, false]) {
          const options = { tags, hierarchy, orphans, focus: null, depth: 1 };
          ask('graph', options, queries.graph(state, options));
        }
    for (const focus of [ids[0], ids[3], ids[ids.length - 1], 'missing'])
      for (const depth of [1, 2]) {
        const options = { tags: true, hierarchy: true, orphans: true, focus: focus ?? null, depth };
        ask('graph', options, queries.graph(state, options));
      }
    return { name, state, activity, log, answers };
  });
}

// the guide vault made the way the app makes it, then edited step by step, each step saved
async function sessionSteps(): Promise<unknown> {
  const vault = new MemoryVault();
  const takeOps = recordOps(vault);
  const opened = await WorkspaceSession.open(new VaultRepository(vault, counter('g')), { delayMs: 0 });
  if (!opened.ok) throw new Error(opened.error);
  const session = opened.value;
  const commands = sampleCommands(counter('s'), FIXED_NOW);
  const seeded = session.executeAll(commands);
  if (!seeded.ok) throw new Error(seeded.error);
  await session.flush();
  const steps: unknown[] = [{ name: 'guide', commands, all: true, results: [{ ok: true }], ops: takeOps() }];

  const state = () => session.getState();
  const byTitle = (title: string) => {
    const page = Object.values(state().pages).find((candidate) => candidate.title === title);
    if (!page) throw new Error(`No page ${title}`);
    return page.id;
  };
  let clock = FIXED_NOW;
  const now = () => (clock += 60_000);
  const welcome = byTitle('Welcome to Morrow');
  const writing = byTitle('Writing and formatting');
  const reading = byTitle('Reading list');
  const props = state().pages[reading]!.database!.properties;
  const plan: Array<{ name: string; commands: () => Command[] }> = [
    { name: 'rename', commands: () => [{ type: 'page.rename', id: welcome, title: 'Welcome, renamed', now: now() }] },
    {
      name: 'create',
      commands: () => [
        {
          type: 'page.create',
          id: 'n1',
          parentId: welcome,
          now: now(),
          title: 'A new page',
          doc: markdownToDoc('Links to [[Middlemarch]] and [[Ideas board]].\n\n- [ ] first\n- [x] second\n\n![[pic.png]]'),
        },
        { type: 'page.setTags', id: 'n1', tags: ['alpha', '#beta', 'alpha', '12'], now: now() },
        { type: 'page.setCover', id: 'n1', cover: 'gradient-3', now: now() },
        { type: 'page.setIcon', id: 'n1', icon: '🧪', now: now() },
      ],
    },
    {
      name: 'move and duplicate',
      commands: () => [
        { type: 'page.move', id: 'n1', parentId: null, index: 0 },
        { type: 'page.duplicate', id: byTitle('Canvas and drawing'), newId: 'n2', now: now() },
      ],
    },
    {
      name: 'edit',
      commands: () => [
        {
          type: 'page.setDoc',
          id: writing,
          doc: markdownToDoc(`${docToMarkdown(state().docs[writing]!)}\nAn appended line with **bold** text.\n`),
          now: now(),
        },
        { type: 'task.setChecked', pageId: 'n1', index: 0, checked: true, now: now() },
      ],
    },
    {
      name: 'database',
      commands: () => [
        {
          type: 'page.setProperties',
          id: byTitle('Middlemarch'),
          values: Object.fromEntries(props.filter((prop) => prop.type === 'text' || prop.type === 'number').map((prop) => [prop.id, prop.type === 'number' ? 3 : 'Edited'])),
          now: now(),
        },
        {
          type: 'database.set',
          id: reading,
          database: { ...state().pages[reading]!.database!, properties: [...props, { id: 'p-notes', name: 'Notes', type: 'text', options: [] }] },
          now: now(),
        },
        { type: 'page.setProperties', id: byTitle('Piranesi'), values: { 'p-notes': 'A house of tides' }, now: now() },
        { type: 'page.setFavorite', id: byTitle('Piranesi'), favorite: true },
        { type: 'page.markOpened', id: byTitle('Piranesi'), now: now() },
      ],
    },
    {
      name: 'trash',
      commands: () => [
        { type: 'page.trash', id: byTitle('Piranesi'), now: now() },
        { type: 'page.trash', id: byTitle('Flashcards and review'), now: now() },
        { type: 'page.restore', id: byTitle('Piranesi') },
      ],
    },
    {
      name: 'delete',
      commands: () => [
        { type: 'page.deleteForever', id: byTitle('Flashcards and review') },
        { type: 'page.trash', id: byTitle('Make it yours'), now: now() },
        { type: 'trash.empty' },
      ],
    },
    {
      name: 'names',
      commands: () => [
        { type: 'page.rename', id: byTitle('Links, tags and the graph'), title: 'Links: 2/3 "quoted" ?', now: now() },
        { type: 'page.setKind', id: byTitle('Privacy, history and encryption'), kind: 'templates', now: now() },
        { type: 'page.rename', id: 'n2', title: 'Canvas and drawing', now: now() },
      ],
    },
    {
      name: 'failures',
      commands: () => [
        { type: 'page.rename', id: 'missing', title: 'x', now: now() },
        { type: 'page.move', id: welcome, parentId: 'n1', index: 0 },
        { type: 'page.setCover', id: 'n1', cover: 'https://example.org/a.png', now: now() },
        { type: 'page.setIcon', id: 'n1', icon: 'far too long for an icon', now: now() },
      ],
    },
  ];
  for (const step of plan) {
    const list = step.commands();
    const results = list.map((command) => {
      const result = session.execute(command);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    });
    await session.flush();
    steps.push({ name: step.name, commands: list, results, ops: takeOps() });
  }
  await session.close();
  const files: Record<string, string> = {};
  for (const [file, data] of vault.files)
    if (typeof data === 'string' && !file.startsWith('.morrow/history/')) files[file] = data;
  return { steps, files };
}

async function guideVault(): Promise<Record<string, string>> {
  const vault = new MemoryVault();
  const opened = await WorkspaceSession.open(new VaultRepository(vault, counter('g')), { delayMs: 0 });
  if (!opened.ok) throw new Error(opened.error);
  const session = opened.value;
  const seeded = session.executeAll(sampleCommands(counter('s'), FIXED_NOW));
  if (!seeded.ok) throw new Error(seeded.error);
  await session.flush();
  await session.close();
  const files: Record<string, string> = {};
  // page history snapshots carry random ids and belong to the history port (11c), not to these fixtures
  for (const [file, data] of vault.files)
    if (typeof data === 'string' && !file.startsWith('.morrow/history/')) files[file] = data;
  return files;
}

// opening a vault and closing it without an edit must leave every byte as it was
async function untouched(files: Record<string, string>): Promise<string[]> {
  const vault = new MemoryVault(files);
  const opened = await WorkspaceSession.open(new VaultRepository(vault, counter('u')), { delayMs: 0 });
  if (!opened.ok) throw new Error(opened.error);
  await opened.value.flush();
  await opened.value.close();
  const changed: string[] = [];
  for (const [file, text] of Object.entries(files)) if (vault.text(file) !== text) changed.push(file);
  for (const file of vault.files.keys()) if (!(file in files)) changed.push(file);
  return changed.sort();
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const inputs = readdirSync(path.join(fixtures, 'input'))
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => ({ name, text: readFileSync(path.join(fixtures, 'input', name), 'utf8') }));
  inputs.push({ name: 'morrow-note.md', text: MORROW_NOTE });
  for (const [name, text] of Object.entries(OBSIDIAN)) if (name.endsWith('.md')) inputs.push({ name: `obsidian/${name}`, text });

  write(
    'markdown.json',
    inputs.map(({ name, text }) => {
      const body = splitFrontmatter(text).body;
      const doc = markdownToDoc(body);
      const markdown = docToMarkdown(doc);
      return { name, body, doc, markdown, reparsed: markdownToDoc(markdown) };
    }),
  );

  write(
    'frontmatter.json',
    inputs.map(({ name, text }) => {
      const split = splitFrontmatter(text);
      const page = readPageText(text);
      return {
        name,
        text,
        split,
        joined: split.data ? joinFrontmatter(split.data, split.body) : null,
        page: { title: page.title, icon: page.icon, cover: page.cover, kind: page.kind, tags: page.tags, database: page.database, error: page.error, keyOrder: page.source.keyOrder, aliases: page.source.aliases },
      };
    }),
  );

  // many short documents made of the pieces markdown rules disagree about, from a fixed seed
  write(
    'markdown-fuzz.json',
    fuzzInputs(1500).map((body) => {
      const doc = markdownToDoc(body);
      return { body, doc, markdown: docToMarkdown(doc) };
    }),
    0,
  );

  // frontmatter of every kind people write, and broken yaml, from a fixed seed. error messages come from the
  // yaml parser and differ in swift (libyaml), so only whether there was one is recorded
  write(
    'frontmatter-fuzz.json',
    frontmatterInputs(1500).map((text) => {
      const split = splitFrontmatter(text);
      return {
        text,
        split: { data: split.data, head: split.head, body: split.body, error: split.error !== null },
        joined: split.data ? joinFrontmatter(split.data, split.body) : null,
      };
    }),
    0,
  );
  write(
    'yaml-stringify.json',
    yamlValues(1500).map((value) => ({ value, yaml: stringify(value, { lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' }) })),
    0,
  );

  // morrow orders files with localeCompare (default options) and titles with { numeric, sensitivity: 'base' },
  // in the locale of the javascript engine: en-US for node, the system language in the app's web view
  const words = collationWords();
  const collation: Record<string, unknown> = { words };
  for (const locale of ['en-US', 'ko-KR']) {
    const plain = new Intl.Collator(locale);
    const titles = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    const base = new Intl.Collator(locale, { sensitivity: 'base' });
    collation[locale] = {
      plain: words.map((a) => words.map((b) => Math.sign(plain.compare(a, b)))),
      titles: words.map((a) => words.map((b) => Math.sign(titles.compare(a, b)))),
      base: words.map((a) => words.map((b) => Math.sign(base.compare(a, b)))),
    };
  }
  write('collation.json', collation, 0);

  write('session.json', await sessionSteps(), 0);
  write('queries.json', await queryAnswers(), 0);

  // template placeholders and the moment.js style dates they take, in node's en-US
  const templateDate = new Date(2026, 9, 9, 7, 5, 3);
  const formats = ['YYYY-MM-DD', 'dddd, D MMMM YYYY', 'ddd D MMM YY', 'HH:mm:ss', 'H [h] mm', '[YYYY] YYYY', 'M/D', 'MMMM [the] D', '[]', '[unclosed'];
  const texts = ['{{title}} on {{date}}', '{{ date:dddd }} at {{time}}', '{{TIME:HH}} {{Date: YYYY }}', '{{date:}} {{unknown}} {{title', 'no placeholders'];
  write('templates.json', {
    formats: formats.map((format) => ({ format, text: formatDate(templateDate, format) })),
    fills: texts.map((text) => ({ text, filled: fillTemplate(text, { title: 'My page', date: templateDate }) })),
    doc: { input: markdownToDoc('# {{title}}\n\nWritten {{date:D MMMM}}.\n\n$$\n{{title}}\n$$'), output: applyTemplate(markdownToDoc('# {{title}}\n\nWritten {{date:D MMMM}}.\n\n$$\n{{title}}\n$$'), { title: 'My page', date: templateDate }) },
  });

  const guide = await guideVault();
  const vaults: Record<string, Record<string, string>> = { guide, obsidian: OBSIDIAN, normalization: NORMALIZATION };
  write(
    'vaults.json',
    await Promise.all(
      Object.entries(vaults).map(async ([name, files]) => ({
        name,
        files,
        loaded: loadVault(scanOf(files), counter('v'), FIXED_NOW),
        rendered: rendered(files),
        untouched: await untouched(files),
      })),
    ),
  );
  console.log(`wrote ${inputs.length} markdown inputs and ${Object.keys(vaults).length} vaults to ${path.relative(process.cwd(), out)}`);
}

await main();
