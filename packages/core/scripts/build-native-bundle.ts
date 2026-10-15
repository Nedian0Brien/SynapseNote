/**
 * Build the editing-model bundle the native apps run in JavaScriptCore.
 *
 *   bun run --filter @nedian0brien/synapsenote-core build:native-bundle [-- --out <file>]
 *
 * JavaScriptCore has no DOM, no `import.meta` and no module loader, so the
 * bundle is a browser-target IIFE with one substitution:
 * `decode-named-character-reference` resolves its browser build to
 * `index.dom.js`, which decodes entities through `document.createElement`;
 * the plugin points it at the table-based `index.js` instead.
 */
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const coreDir = resolve(import.meta.dir, '..');
const repoRoot = resolve(coreDir, '../..');
const defaultOut = join(
  repoRoot,
  'native/SynapseKit/Sources/EditingCore/Resources/synapsenote-editing.js',
);

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const out = resolve(values.out ?? defaultOut);

const entityDecoder = join(
  dirname(Bun.resolveSync('decode-named-character-reference/package.json', coreDir)),
  'index.js',
);

const result = await Bun.build({
  entrypoints: [join(coreDir, 'src/editing-model/native-entry.ts')],
  target: 'browser',
  format: 'iife',
  minify: true,
  plugins: [
    {
      name: 'entity-decoder-without-dom',
      setup(build) {
        build.onResolve({ filter: /^decode-named-character-reference$/ }, () => ({
          path: entityDecoder,
        }));
      },
    },
  ],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const [bundle] = result.outputs;
const text = await bundle.text();
if (text.includes('import.meta')) {
  console.error('native bundle contains import.meta, which JavaScriptCore cannot load');
  process.exit(1);
}
await Bun.write(out, text);
console.log(`wrote ${out} (${(text.length / 1024).toFixed(0)} KiB)`);
