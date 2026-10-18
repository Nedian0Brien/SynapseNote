// writes the pages the editor is checked against as one workspace json: morrow's first run guide,
// renamed for SynapseNote, and a page with the blocks the guide lacks plus korean text for ime checks
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, '..');
const out = path.join(web, '../App/Resources/Editor/sample-guide.json');

// ids are fixed so the file is the same on every build
let counter = 0;
const newId = () => `guide-${String(++counter).padStart(4, '0')}`;
// 2026-01-05 09:00 utc, a fixed time for the same reason
const NOW = Date.UTC(2026, 0, 5, 9);

const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const para = (...content) => ({ type: 'paragraph', ...(content.length ? { content } : {}) });
const heading = (level, value) => ({ type: 'heading', attrs: { level }, content: [text(value)] });
const cell = (type, value) => ({ type, content: [para(text(value))] });
// a small inline image, data urls are the only images the editor page may load without a vault
const IMAGE =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" rx="12" fill="#337ea9"/><text x="120" y="68" font-size="20" text-anchor="middle" fill="#fff">image</text></svg>',
  ).toString('base64');

function editorTestCommands() {
  const doc = {
    type: 'doc',
    content: [
      para(text('이 페이지는 에디터 검증용이다. 아래 각 블록 안에서 한글을 입력해 조합이 깨지지 않는지 본다.')),
      heading(2, '제목 안에서 한글 입력'),
      { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('목록 항목 하나'))] }] },
      {
        type: 'taskList',
        content: [{ type: 'taskItem', attrs: { checked: false }, content: [para(text('체크리스트 항목'))] }],
      },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('tableHeader', '이름'), cell('tableHeader', '값')] },
          { type: 'tableRow', content: [cell('tableCell', '첫째 칸'), cell('tableCell', '둘째 칸')] },
        ],
      },
      { type: 'callout', attrs: { tone: 'note', kind: 'note', title: '콜아웃 제목', fold: null }, content: [para(text('콜아웃 본문'))] },
      heading(2, 'Blocks the guide does not show'),
      para(text('A line'), { type: 'hardBreak' }, text('and a line after a hard break, with '), text('a link', [{ type: 'link', attrs: { href: 'https://example.com' } }]), text('.')),
      { type: 'blockMath', attrs: { latex: '\\int_0^1 x^2\\,dx = \\tfrac{1}{3}' } },
      { type: 'image', attrs: { src: IMAGE, alt: 'A blue test image', fileId: null } },
      { type: 'fileAttachment', attrs: { fileId: 'missing-file', name: 'report.pdf', size: 245760, type: 'application/pdf' } },
      { type: 'rawBlock', attrs: { text: '<div align="center">HTML kept as written</div>' } },
      para(),
    ],
  };
  return [{ type: 'page.create', id: 'editor-test', parentId: null, now: NOW, title: '에디터 검증', icon: '🧪', doc }];
}

const server = await createServer({
  root: web,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  optimizeDeps: { entries: [] },
});
try {
  const { sampleCommands } = await server.ssrLoadModule('/vendor/morrow/src/core/sample.ts');
  const { applyCommand } = await server.ssrLoadModule('/vendor/morrow/src/core/commands.ts');
  let state = { pages: {}, docs: {} };
  for (const command of sampleCommands(newId, NOW)) {
    const result = applyCommand(state, command);
    if (!result.ok) throw new Error(`guide command ${command.type} failed: ${result.error}`);
    state = result.value.state;
  }
  for (const command of editorTestCommands()) {
    const result = applyCommand(state, command);
    if (!result.ok) throw new Error(`editor test command ${command.type} failed: ${result.error}`);
    state = result.value.state;
  }
  state = JSON.parse(JSON.stringify(state).replaceAll('Morrow', 'SynapseNote'));
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`sample guide: ${Object.keys(state.pages).length} pages -> ${path.relative(web, out)}`);
} finally {
  await server.close();
}
