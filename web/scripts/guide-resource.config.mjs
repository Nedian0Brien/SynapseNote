// the welcome guide's sentences rewritten for this app (sampleRenames.ts), applied to morrow's core/sample.ts as
// vite.config.ts applies them for the editor tests; a rename that no longer matches stops the build
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = path.join(here, '../vendor/morrow/src/core/sample.ts');

export default {
  input: 'scripts/guide-resource.ts',
  platform: 'node',
  output: { dir: 'node_modules/.cache/guide-resource', format: 'esm' },
  plugins: [
    {
      name: 'synapsenote-sample-renames',
      async transform(code, id) {
        if (id.split('?')[0] !== sample) return null;
        const { SAMPLE_RENAMES } = await import(path.join(here, '../sampleRenames.ts'));
        let next = code;
        for (const [from, to] of SAMPLE_RENAMES) {
          if (!next.includes(from)) this.error(`core/sample.ts no longer contains ${from}`);
          next = next.replaceAll(from, to);
        }
        return { code: next, map: null };
      },
    },
  ],
};
