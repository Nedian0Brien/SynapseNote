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
Date.now = () => FIXED_NOW;

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
import { MemoryVault } from '../vendor/morrow/src/storage/memoryVault';
import { WorkspaceSession } from '../vendor/morrow/src/storage/session';
import { VaultRepository } from '../vendor/morrow/src/storage/vaultRepository';

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
