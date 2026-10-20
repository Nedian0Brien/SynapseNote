// writes what morrow's editor makes of a document when it opens it: the tiptap schema its extensions build, and
// every document of the markdown fixtures as prosemirror reads and writes it back (nodeFromJSON, then toJSON),
// which is what the editor saves after an edit; and how its code blocks are highlighted, the decorations
// code-block-lowlight's plugin gives each block. run: npm run editor-fixtures, which writes
// ../App/Tests/Fixtures/core/expected/editor.json and highlight.json
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getExtensionField, getSchema } from '@tiptap/core';
import type { Plugin } from '@tiptap/pm/state';
import { EditorState } from '@tiptap/pm/state';
import { CODE_LANGUAGES, CodeBlock } from '../vendor/morrow/src/app/editor/Extras';
import { createExtensions } from '../vendor/morrow/src/app/editor/extensions';
import type { ExtensionOptions } from '../vendor/morrow/src/app/editor/extensions';

const out = process.argv[2];
if (!out) throw new Error('usage: editor-fixtures <fixtures dir>');

// the schema does not call any of these, it only needs them to exist
const none = () => null;
const options = {
  getTitle: none,
  subscribe: () => () => {},
  open: () => {},
  findPages: () => [],
  createPage: none,
  resolveTarget: none,
  createFromTarget: none,
  renderEmbed: none,
  onBlockMenu: () => {},
  resolvePage: none,
  openTag: () => {},
  createChild: none,
  openDate: () => {},
} as unknown as ExtensionOptions;
const schema = getSchema(createExtensions(options));

const attrsOf = (spec: { attrs?: Record<string, { default?: unknown }> }) =>
  Object.entries(spec.attrs ?? {}).map(([name, attr]) => [name, attr.default === undefined ? null : attr.default]);
const nodes: Record<string, unknown> = {};
schema.spec.nodes.forEach((name, spec) => {
  nodes[name] = { content: spec.content ?? null, group: spec.group ?? null, inline: !!spec.inline, atom: !!spec.atom, attrs: attrsOf(spec) };
});
const marks: Array<[string, unknown]> = [];
schema.spec.marks.forEach((name, spec) => marks.push([name, { attrs: attrsOf(spec), excludes: spec.excludes ?? null }]));

const opened = (doc: unknown) => {
  try {
    return schema.nodeFromJSON(doc).toJSON();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};
const docs = (name: string) =>
  (JSON.parse(readFileSync(path.join(out, 'expected', name), 'utf8')) as Array<{ doc: unknown }>).map((entry) => opened(entry.doc));

writeFileSync(
  path.join(out, 'expected', 'editor.json'),
  `${JSON.stringify({ nodes, marks, markdown: docs('markdown.json'), fuzz: docs('markdown-fuzz.json') }, null, 1)}\n`,
);

// the block's plugins as the editor would install them; building them needs no editor
const context = { name: CodeBlock.name, options: CodeBlock.options, storage: {}, editor: null, type: schema.nodes.codeBlock, parent: undefined };
const plugins = (getExtensionField(CodeBlock, 'addProseMirrorPlugins', context) as () => Plugin[])();
const lowlightPlugin = plugins.find((plugin) => (plugin as unknown as { key: string }).key.startsWith('lowlight'));
if (!lowlightPlugin) throw new Error('no lowlight plugin');
const highlighted = (language: string | null, code: string) => {
  const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'codeBlock', attrs: { language }, content: code ? [{ type: 'text', text: code }] : [] }] });
  const state = EditorState.create({ doc, plugins: [lowlightPlugin] });
  const set = lowlightPlugin.props.decorations!.call(lowlightPlugin, state) as unknown as { find: () => Array<{ from: number; to: number; type: { attrs: { class: string } } }> };
  // offsets in the block's text, which starts one past the block
  return set.find().map((decoration) => [decoration.from - 1, decoration.to - 1, decoration.type.attrs.class]);
};
const blocks: Array<{ language: string | null; code: string }> = [];
const collect = (node: { type?: string; attrs?: { language?: string | null }; content?: Array<{ text?: string }> }) => {
  if (node.type === 'codeBlock') blocks.push({ language: node.attrs?.language ?? null, code: (node.content ?? []).map((child) => child.text ?? '').join('') });
  for (const child of (node.content ?? []) as unknown[]) collect(child as typeof node);
};
for (const name of ['markdown.json', 'markdown-fuzz.json']) {
  for (const entry of JSON.parse(readFileSync(path.join(out, 'expected', name), 'utf8')) as Array<{ doc: typeof blocks[0] }>) collect(entry.doc as never);
}
blocks.push(
  { language: 'js', code: 'const a = 1 // hi\nfunction f(x) { return "s" }' },
  { language: 'ts', code: 'interface A { b: number }\nlet c: A = { b: 2 }' },
  { language: 'python', code: 'def f(x):\n    """doc"""\n    return x * 2  # 한글 주석 🙂' },
  { language: 'swift', code: 'struct S { let a = "😀"; func g() -> Int { 1 } }' },
  { language: null, code: 'SELECT * FROM t WHERE id = 3' },
  { language: 'mermaid', code: 'graph TD\n  A-->B' },
  { language: 'nosuch', code: '<div class="x">y</div>' },
  { language: 'css', code: '.a { color: red; }' },
  { language: null, code: '' },
);
writeFileSync(
  path.join(out, 'expected', 'highlight.json'),
  `${JSON.stringify({ languages: CODE_LANGUAGES, blocks: blocks.map((block) => ({ ...block, runs: highlighted(block.language, block.code) })) }, null, 1)}\n`,
);
