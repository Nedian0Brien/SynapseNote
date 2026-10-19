// the parts of screen-fixtures.ts for diff, site, backups, markdown export and archive import
import { applyCommand } from '../vendor/morrow/src/core/commands';
import type { Command } from '../vendor/morrow/src/core/commands';
import { diffLines } from '../vendor/morrow/src/core/diff';
import { mimeType, parseCsv, planArchiveImport } from '../vendor/morrow/src/core/importer';
import { markdownToDoc } from '../vendor/morrow/src/core/markdown/parse';
import { emptyWorkspace, newPageMeta } from '../vendor/morrow/src/core/model';
import type { FileMeta, PageMeta, WorkspaceState } from '../vendor/morrow/src/core/model';
import {
  attachmentNames,
  createBackup,
  pageMarkdown,
  parseBackup,
  planMarkdownImport,
  planRestore,
  safeFileName,
  workspaceMarkdownFiles,
} from '../vendor/morrow/src/core/portability';
import { sampleCommands } from '../vendor/morrow/src/core/sample';
import { buildSite } from '../vendor/morrow/src/core/site';

function counter(prefix: string): () => string {
  let next = 0;
  return () => `${prefix}${++next}`;
}

export function diffCases(): unknown {
  const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
  const pairs: Array<[string, string]> = [
    ['', ''],
    ['same\ntext', 'same\ntext'],
    ['a\nb\nc', 'a\nB\nc'],
    ['a\nb\nc', 'a\nc'],
    ['a\nc', 'a\nb\nc'],
    ['one\ntwo\nthree', 'zero\none\nthree\nfour'],
    ['x\ny\nx\ny', 'y\nx\ny\nx'],
    [long, `${long.replace('line 7', 'line seven').replace('line 30', '')}\nend`],
    ['한글\n줄', '한글\n바뀐 줄\n😀'],
    ['trailing\n', 'trailing'],
  ];
  return pairs.map(([before, after]) => ({ before, after, lines: diffLines(before, after) }));
}

// the guide plus a page with every block, a locked page, look-alike names and files
export function richState(now: number): WorkspaceState {
  let state = emptyWorkspace();
  const apply = (command: Command) => {
    const result = applyCommand(state, command);
    if (!result.ok) throw new Error(result.error);
    state = result.value.state;
  };
  for (const command of sampleCommands(counter('s'), now)) apply(command);
  const markdown = [
    '# Every block',
    '',
    'Text with **bold**, *italic*, ~~strike~~, `code`, ==highlight==, a [link](https://example.org), an [unsafe link](javascript:alert(1)) and <u>underline</u>.',
    '',
    'A [[Writing and formatting]] link, a [[Missing page]] and [[2026-10-19]] as a date. Math $e^{i\\pi}+1=0$ inline.',
    '',
    '> A quote',
    '',
    '> [!tip] Callout title',
    '> Inside the callout',
    '',
    '- one',
    '  - nested',
    '1. first',
    '2. second',
    '',
    '3. starts at three',
    '',
    '- [ ] open task',
    '- [x] done task',
    '',
    '```js',
    'const a = 1 < 2;',
    '```',
    '',
    '$$',
    '\\int_0^1 x\\,dx',
    '$$',
    '',
    '| Head | Other |',
    '| --- | --- |',
    '| cell <b> | **two** |',
    '',
    '---',
    '',
    '![alt text](https://example.org/a.png) ![bad](ftp://x)',
    '',
    '<details><summary>More</summary>',
    '',
    'Hidden text',
    '',
    '</details>',
    '',
    '[[toc]]',
    '',
    '#### Deep heading',
  ].join('\n');
  const doc = markdownToDoc(markdown);
  doc.content!.push(
    { type: 'image', attrs: { fileId: 'attachments/pic.png', alt: 'Local' } },
    { type: 'fileAttachment', attrs: { fileId: 'attachments/report Q3.pdf', name: 'report Q3.pdf' } },
    {
      type: 'columns',
      content: [
        { type: 'column', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Left' }] }] },
        { type: 'column', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Right' }] }] },
      ],
    },
    { type: 'rawBlock', attrs: { text: '<div>raw</div>' } },
    { type: 'heading', attrs: { level: 'x' }, content: [{ type: 'text', text: 'Odd level' }] },
  );
  apply({ type: 'page.create', id: 'rich', parentId: null, now, title: 'Every block "quoted" <tag>', doc });
  apply({ type: 'page.setTags', id: 'rich', tags: ['alpha', 'b&c'], now });
  apply({ type: 'page.setIcon', id: 'rich', icon: '🧪', now });
  apply({ type: 'page.create', id: 'locked', parentId: 'rich', now, title: 'Locked', doc: markdownToDoc('Secret') });
  apply({ type: 'page.setEncrypted', id: 'locked', encrypted: true, now });
  apply({ type: 'page.create', id: 'child', parentId: 'rich', now, title: 'Child page', doc: markdownToDoc('Links back to [[Every block "quoted" <tag>]]') });
  apply({ type: 'page.create', id: 'same1', parentId: null, now, title: 'Same Name', doc: markdownToDoc('first') });
  apply({ type: 'page.create', id: 'same2', parentId: null, now, title: 'same name', doc: markdownToDoc('second') });
  apply({ type: 'page.create', id: 'odd', parentId: null, now, title: 'con', doc: markdownToDoc('reserved name') });
  return state;
}

export function siteCases(state: WorkspaceState): unknown {
  const renderMath = (latex: string, display: boolean) => `<math display="${display ? 'block' : 'inline'}">${latex.length}</math>`;
  const site = (rootId: string | null, title: string, math: boolean) => {
    const built = buildSite(state, { rootId, title, ...(math ? { renderMath } : {}) });
    return { rootId, title, math, files: built.files, assets: [...built.assets] };
  };
  const welcome = Object.values(state.pages).find((page) => page.title === 'Welcome to Morrow')!.id;
  return { sites: [site(null, 'My <vault>', true), site('rich', 'Rich', false), site(welcome, 'Guide', true)] };
}

export function portabilityCases(state: WorkspaceState, now: number): unknown {
  const files = [{ id: 'f1', name: 'pic.png', type: 'image/png', size: 3, createdAt: 5, data: 'AQID' }];
  const backup = createBackup(state, new Date(now), files);
  const text = JSON.stringify(backup);
  // a backup made earlier with an edited page and a page this workspace lacks
  const older = JSON.parse(text) as { pages: PageMeta[]; docs: Record<string, unknown>; files: unknown[]; schemaVersion: number };
  older.pages = older.pages.slice(0, 6);
  older.pages[1] = { ...older.pages[1]!, updatedAt: 1 };
  older.pages.push({ ...newPageMeta({ id: 'fresh', parentId: older.pages[0]!.id, title: '', createdAt: 9, dailyDate: '2026-10-19' }), kind: 'journal' });
  older.docs.fresh = markdownToDoc('A [[link]] to nothing');
  older.files = [...older.files, { id: 'bad id!', data: 'AQID' }, { id: 'ok', data: '***' }, { id: 'f2', data: '', name: '', type: 5 }];
  const restoreFrom = parseBackup(JSON.stringify(older));
  if (!restoreFrom.ok) throw new Error(restoreFrom.error);
  const parses = [
    text,
    JSON.stringify({ ...older, schemaVersion: 1 }),
    JSON.stringify({ ...older, schemaVersion: 99 }),
    JSON.stringify({ ...older, schemaVersion: 'x' }),
    JSON.stringify({ format: 'other' }),
    JSON.stringify({ format: 'morrow-backup', pages: [], docs: [] }),
    JSON.stringify({ format: 'morrow-backup', schemaVersion: 3, pages: [{ id: 'a' }, { id: 'a' }, { title: 'no id' }, 7], docs: { a: { type: 'paragraph' } } }),
  ].map((input) => {
    const result = parseBackup(input);
    return { input, result: result.ok ? { ok: true, value: result.value } : { ok: false, error: result.error } };
  });
  const markdownFiles = [
    { name: 'Alpha.md', text: '# Alpha title\n\nSee [[Beta]] and [[Writing and formatting]].' },
    { name: 'Beta.markdown', text: '\n\nNo heading, links [[alpha title]].' },
    { name: 'notes.TXT', text: '#Not a heading\nplain' },
    { name: '.md', text: '' },
  ];
  const metas: Record<string, FileMeta> = {
    'attachments/pic.png': { id: 'attachments/pic.png', name: 'pic.png', type: 'image/png', size: 3, createdAt: 1 },
    'attachments/report Q3.pdf': { id: 'attachments/report Q3.pdf', name: 'report: Q3?.PDF', type: 'application/pdf', size: 3, createdAt: 1 },
    x: { id: 'x', name: 'pic.png', type: 'image/png', size: 1, createdAt: 1 },
    y: { id: 'y', name: '.hidden', type: 'text/plain', size: 1, createdAt: 1 },
  };
  const exported = workspaceMarkdownFiles(state, metas);
  return {
    backup,
    backupText: text,
    restoreText: JSON.stringify(older),
    parses,
    restore: planRestore(state, restoreFrom.value, counter('re')),
    markdownFiles,
    markdownImport: planMarkdownImport(state, markdownFiles, 'rich', counter('mi'), now),
    pageMarkdown: Object.keys(state.pages).map((id) => ({ id, text: pageMarkdown(state, id) })),
    metas,
    workspace: { files: exported.files, attachments: [...exported.attachments] },
    attachmentNames: [...attachmentNames(['x', 'attachments/pic.png', 'y', 'missing', 'x', 'attachments/report Q3.pdf'], metas)],
    safeFileNames: ['', '  ..  ', 'con', 'COM1', 'a<b>c:d"e/f\\g|h?i*j', 'tab\there', 'x'.repeat(80), ' Spaces   inside ', '😀 emoji', '.dot.'].map((title) => ({
      title,
      name: safeFileName(title),
    })),
  };
}

export function importerCases(state: WorkspaceState, now: number): unknown {
  const text = (value: string) => new TextEncoder().encode(value);
  const notion = 'Export-0123456789abcdef0123456789abcdef';
  const home = 'Home 0123456789abcdef0123456789abcdef';
  const entries = [
    { path: `${notion}/${home}.md`, data: text(`# Home\n\nSee [Projects](Home%200123456789abcdef0123456789abcdef/Projects%20fedcba9876543210fedcba9876543210.md) and ![chart](Home%200123456789abcdef0123456789abcdef/chart.png).\n`) },
    { path: `${notion}/${home}/Projects fedcba9876543210fedcba9876543210.md`, data: text('# Projects\n\nBack to [[Home]].') },
    { path: `${notion}/${home}/chart.png`, data: new Uint8Array([1, 2, 3]) },
    { path: `${notion}/${home}/Books 11111111111111111111111111111111.csv`, data: text('Name,Status\nOld,Done\n') },
    { path: `${notion}/${home}/Books 11111111111111111111111111111111_all.csv`, data: text('﻿Name,Status,Pages,Tags\nDune,Reading,412,"sci-fi, classic"\n"Quote ""this""",Done,"1,000",classic\nNew row,,,\n') },
    { path: `${notion}/${home}/Books 11111111111111111111111111111111/Dune 22222222222222222222222222222222.md`, data: text('# Dune\n\nStatus: Reading\n\nPages: 412\n\nThe spice must flow.') },
    { path: `${notion}/${home}/Deep/Folder/Leaf.md`, data: text('Leaf body') },
    { path: `${notion}/.DS_Store`, data: new Uint8Array([0]) },
    { path: `__MACOSX/${notion}/x.md`, data: text('junk') },
    { path: `${notion}\\Windows\\Path.md`, data: text('# Win') },
    { path: `./${notion}/Empty.csv`, data: text('\n\n') },
  ];
  const json = (value: ReturnType<typeof planArchiveImport>) => ({
    ...value,
    files: value.files.map((file) => ({ meta: file.meta, data: Buffer.from(file.data).toString('base64') })),
  });
  const flatEntries = [
    { path: 'a.md', data: text('# A') },
    { path: 'b/c.md', data: text('C') },
  ];
  return {
    entries: entries.map((entry) => ({ path: entry.path, data: Buffer.from(entry.data).toString('base64') })),
    plan: json(planArchiveImport(state, entries, null, counter('ai'), now)),
    flatEntries: flatEntries.map((entry) => ({ path: entry.path, data: Buffer.from(entry.data).toString('base64') })),
    flat: json(planArchiveImport(state, flatEntries, 'rich', counter('fl'), now)),
    csv: ['a,b\n1,2', 'a,"b,c"\r\n"x""y",z\r\n', '﻿one', ',\n , \n', '"open,quote', 'trailing,\n', 'x\ry'].map((value) => ({ text: value, rows: parseCsv(value) })),
    mime: ['a.PNG', 'b.docx', 'noext', 'c.tar.gz', '.png'].map((name) => ({ name, type: mimeType(name) })),
  };
}
