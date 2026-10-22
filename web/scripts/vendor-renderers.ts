// writes the renderers the native editor draws with into ../App/Renderers, kept in the repository so the app
// builds without node: katex for formulas and mermaid for diagrams, the same packages the web editor bundles,
// and lowlight with highlight.js's common languages as morrow's code blocks highlight with them, wrapped as
// one script. run: npm run vendor-renderers
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'rolldown';

const out = process.argv[2];
if (!out) throw new Error('usage: vendor-renderers <out dir>');
const modules = path.resolve('node_modules');

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'fonts'), { recursive: true });

const katex = path.join(modules, 'katex/dist');
copyFileSync(path.join(katex, 'katex.min.js'), path.join(out, 'katex.min.js'));
// the stylesheet lists woff2, woff and ttf for each font; webkit takes the first, so only woff2 is kept
copyFileSync(path.join(katex, 'katex.min.css'), path.join(out, 'katex.min.css'));
for (const font of readdirSync(path.join(katex, 'fonts')).filter((name) => name.endsWith('.woff2'))) {
  copyFileSync(path.join(katex, 'fonts', font), path.join(out, 'fonts', font));
}
copyFileSync(path.join(modules, 'mermaid/dist/mermaid.min.js'), path.join(out, 'mermaid.min.js'));

// what tiptap's code-block-lowlight does with a block: lowlight.highlight for a language lowlight knows (by
// name or alias), highlightAuto otherwise, flattened to the classes over each run of text (getDecorations)
const entry = path.resolve('node_modules/.cache/highlight-entry.js');
mkdirSync(path.dirname(entry), { recursive: true });
writeFileSync(
  entry,
  `import { common, createLowlight } from 'lowlight';
const lowlight = createLowlight(common);
const flatten = (nodes, classes, runs) => {
  for (const node of nodes) {
    const inner = [...classes, ...(node.properties ? node.properties.className : [])];
    if (node.children) flatten(node.children, inner, runs);
    else runs.push([node.value.length, inner.join(' ')]);
  }
  return runs;
};
globalThis.morrowHighlight = {
  languages: () => lowlight.listLanguages(),
  highlight: (code, language) => {
    const known = language && (lowlight.listLanguages().includes(language) || lowlight.registered(language));
    const root = known ? lowlight.highlight(language, code) : lowlight.highlightAuto(code);
    return JSON.stringify(flatten(root.children, [], []));
  },
};
`,
);
await build({
  input: entry,
  platform: 'neutral',
  resolve: { mainFields: ['module', 'main'] },
  output: { file: path.join(out, 'highlight.js'), format: 'iife', minify: true },
});

// the licence of every package in these files and of the packages they bundle
const seen = new Set<string>();
const licences: string[] = [];
// a package's own copy in its node_modules first, then the hoisted one, as node finds it
const visit = (name: string, from: string) => {
  const dir = [path.join(from, 'node_modules', name), path.join(modules, name)].find((candidate) => existsSync(path.join(candidate, 'package.json')));
  if (!dir || seen.has(dir)) return;
  seen.add(dir);
  const info = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as { version: string; license?: string; dependencies?: Record<string, string> };
  const file = readdirSync(dir).find((entry) => /^(licen[cs]e|copying)/i.test(entry));
  const text = file ? readFileSync(path.join(dir, file), 'utf8').trim() : `Licence: ${info.license ?? 'unknown'}`;
  licences.push(`${'='.repeat(64)}\n${name} ${info.version}\n${'='.repeat(64)}\n${text}\n`);
  for (const dependency of Object.keys(info.dependencies ?? {}).sort()) visit(dependency, dir);
};
for (const name of ['katex', 'mermaid', 'lowlight', 'highlight.js']) visit(name, modules);
writeFileSync(
  path.join(out, 'THIRD_PARTY_LICENSES.txt'),
  `Licences of the packages in App/Renderers and of the packages they bundle.\n\n${licences.join('\n')}`,
);
