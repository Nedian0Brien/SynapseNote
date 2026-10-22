/// <reference types="vitest/config" />
// the tests of the tools in this folder, which make the app's comparison data from morrow's own code. morrow's
// welcome guide is read with this app's wording (sampleRenames.ts), as scripts/guide-resource.ts writes it for
// the app; a rename that no longer matches stops the run
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_RENAMES } from './sampleRenames.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = path.join(here, 'vendor/morrow/src/core/sample.ts');

function sampleRenames(): Plugin {
  return {
    name: 'synapsenote-sample-renames',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0] !== sample) return null;
      let next = code;
      for (const [from, to] of SAMPLE_RENAMES) {
        if (!next.includes(from)) this.error(`core/sample.ts no longer contains ${from}`);
        next = next.replaceAll(from, to);
      }
      return { code: next, map: null };
    },
  };
}

export default defineConfig({
  plugins: [sampleRenames()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
