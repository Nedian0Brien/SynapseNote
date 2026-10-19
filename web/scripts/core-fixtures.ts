// writes the values the swift data core is checked against: what morrow's typescript core makes of the same
// inputs. run: npm run core-fixtures, which writes ../App/Tests/Fixtures/core/expected/*.json
//
// inputs: the markdown files in ../App/Tests/Fixtures/core/input, the inputs of morrow's own markdown and vault
// tests, and the first-run guide vault that morrow's sampleCommands make. the clock, the ids and the time zone
// (TZ=UTC in the npm script) are fixed so the output is the same on every run.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

function write(name: string, value: unknown): void {
  writeFileSync(path.join(out, name), `${JSON.stringify(plain(value), null, 1)}\n`);
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
