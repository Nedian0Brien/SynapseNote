// writes what morrow's editor makes of a document when it opens it: the tiptap schema its extensions build, and
// every document of the markdown fixtures as prosemirror reads and writes it back (nodeFromJSON, then toJSON),
// which is what the editor saves after an edit. run: npm run editor-fixtures, which writes
// ../App/Tests/Fixtures/core/expected/editor.json
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getSchema } from '@tiptap/core';
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
