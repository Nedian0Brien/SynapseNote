// morrow's editor modules reach the emoji images through a vite virtual module, the schema does not need them
export default {
  input: 'scripts/editor-fixtures.ts',
  platform: 'node',
  output: { dir: 'node_modules/.cache/editor-fixtures', format: 'esm' },
  plugins: [
    {
      name: 'morrow-emoji',
      resolveId: (id) => (id === 'virtual:morrow-emoji' ? '\0morrow-emoji' : null),
      load: (id) => (id === '\0morrow-emoji' ? 'export const EMOJI_FILES = new Set();' : null),
    },
  ],
};
