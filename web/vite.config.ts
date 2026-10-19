/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAMPLE_RENAMES } from './sampleRenames.ts';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const morrowApp = path.join(here, 'vendor/morrow/src/app');
const hostDir = path.join(here, 'src/host');

// morrow app modules tied to electron or to morrow's own workspace, swapped for the native host
const HOST_MODULES: Record<string, string> = {
  'actions.ts': 'actions.ts',
  'router.ts': 'router.ts',
  'platform/desktop.ts': 'desktop.ts',
  'components/Sidebar.tsx': 'sidebar.tsx',
  'platform/files.ts': 'files.ts',
};

// modules that must never reach the editor bundle: electron code, and the copy of pages kept in
// the browser by earlier morrow builds
const FORBIDDEN = [path.join(here, 'vendor/morrow/electron') + path.sep, path.join(morrowApp, 'legacy.ts')];

// visible morrow strings in modules the editor uses, renamed at build time so the morrow files stay unmodified
const morrowSrc = path.join(here, 'vendor/morrow/src');
const RENAMED: Record<string, Array<[string, string]>> = {
  [path.join(morrowApp, 'editor/EditorMenus.tsx')]: [["'Morrow page'", "'SynapseNote page'"]],
  [path.join(morrowApp, 'components/HistoryDialog.tsx')]: [
    ['No versions yet. Morrow keeps a version', 'No versions yet. SynapseNote keeps a version'],
  ],
  [path.join(morrowApp, 'operations.ts')]: [
    ['`morrow-backup-${stamp()}.json`', '`synapsenote-backup-${stamp()}.json`'],
    ['entries[`Morrow/${file.path}`]', 'entries[`SynapseNote/${file.path}`]'],
    ["await zipAttachments(attachments, entries, 'Morrow/');", "await zipAttachments(attachments, entries, 'SynapseNote/');"],
    ['`morrow-markdown-${stamp()}.zip`', '`synapsenote-markdown-${stamp()}.zip`'],
    [".pop() ?? 'Morrow')", ".pop() ?? 'SynapseNote')"],
    [": 'Morrow';", ": 'SynapseNote';"],
  ],
  [path.join(morrowSrc, 'core/site.ts')]: [['<meta name="generator" content="Morrow">', '<meta name="generator" content="SynapseNote">']],
  [path.join(morrowSrc, 'core/portability.ts')]: [["'This file is not a Morrow backup.'", "'This file is not a SynapseNote backup.'"]],
  [path.join(morrowSrc, 'core/migrations.ts')]: [
    ['newer version of Morrow (format ${version}). Please update Morrow.', 'newer version of SynapseNote (format ${version}). Please update SynapseNote.'],
  ],
  [path.join(morrowSrc, 'core/vault/load.ts')]: [['is too large to edit in Morrow,', 'is too large to edit in SynapseNote,']],
  [path.join(morrowSrc, 'core/sample.ts')]: SAMPLE_RENAMES,
  [path.join(morrowSrc, 'storage/vaultRepository.ts')]: [
    ['while Morrow tried to save it.', 'while SynapseNote tried to save it.'],
  ],
};

// text morrow writes into files rather than shows, kept as it is so files stay readable by morrow
const FILE_FORMAT_TEXT = ['This page is encrypted with a password in Morrow.'];

function hostModules(): Plugin {
  return {
    name: 'synapsenote-host-modules',
    enforce: 'pre',
    transform(code, id) {
      const renames = RENAMED[id.split('?')[0]!];
      if (!renames) return null;
      let next = code;
      for (const [from, to] of renames) {
        // a rename that no longer matches means morrow changed the string, so the build stops
        if (!next.includes(from)) this.error(`${path.relative(here, id)} no longer contains ${from}`);
        next = next.replaceAll(from, to);
      }
      return { code: next, map: null };
    },
    generateBundle(_options, bundle) {
      // the app shows the SynapseNote name only, internal names such as morrow:edit-link are lower case
      const found: string[] = [];
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        let code = file.code;
        for (const text of FILE_FORMAT_TEXT) code = code.replaceAll(text, '');
        for (const match of code.matchAll(/Morrow/g))
          found.push(`${file.fileName}: …${code.slice(Math.max(0, match.index - 50), match.index + 40)}…`);
      }
      if (found.length) this.error(`the bundle still contains the name Morrow:\n${found.join('\n')}`);
    },
    async resolveId(source, importer, options) {
      if (!importer || importer.startsWith(hostDir) || !source.startsWith('.')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const relative = path.relative(morrowApp, resolved.id);
      const replacement = HOST_MODULES[relative];
      if (replacement) return path.join(hostDir, replacement);
      if (FORBIDDEN.some((prefix) => resolved.id.startsWith(prefix)))
        this.error(`${path.relative(here, importer)} imports ${path.relative(here, resolved.id)}, which the editor bundle must not include`);
      return null;
    },
  };
}

// microsoft's fluent 3d emoji copied into the build as images, adapted from morrow's vite.config.ts
function emojiImages(): Plugin {
  const dir = path.join(path.dirname(require.resolve('@lobehub/fluent-emoji-3d/package.json')), 'assets');
  const names = readdirSync(dir).filter((name) => name.endsWith('.webp'));
  const virtual = 'virtual:morrow-emoji';
  return {
    name: 'synapsenote-emoji-images',
    resolveId: (id) => (id === virtual ? `\0${virtual}` : null),
    load: (id) =>
      id === `\0${virtual}`
        ? `export const EMOJI_FILES = new Set(${JSON.stringify(names.map((name) => name.slice(0, -5)))});`
        : null,
    generateBundle() {
      for (const name of names)
        this.emitFile({ type: 'asset', fileName: `emoji/${name}`, source: readFileSync(path.join(dir, name)) });
    },
  };
}

// the emoji list the native icon picker shows, the same data morrow's EmojiPicker reads, without skin tones
function emojiIndex(): Plugin {
  return {
    name: 'synapsenote-emoji-index',
    apply: 'build',
    generateBundle() {
      const data = JSON.parse(readFileSync(require.resolve('emojibase-data/en/compact.json'), 'utf8')) as Array<{
        unicode: string;
        label: string;
        group?: number;
        order?: number;
        tags?: string[];
      }>;
      const list = data
        .filter((emoji) => emoji.group !== undefined && emoji.group !== 2)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((emoji) => ({ e: emoji.unicode, l: emoji.label, g: emoji.group, t: emoji.tags ?? [] }));
      this.emitFile({ type: 'asset', fileName: 'emoji-index.json', source: JSON.stringify(list) });
    },
  };
}

// the licence of every bundled package, as their licences require, adapted from morrow's vite.config.ts
function thirdPartyLicenses(): Plugin {
  return {
    name: 'synapsenote-third-party-licenses',
    apply: 'build',
    generateBundle() {
      const packages = new Map<string, string>();
      for (const id of this.getModuleIds()) {
        const match = /[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/.exec(id);
        if (match)
          packages.set(match[1]!.replace(/\\/g, '/'), path.join(id.slice(0, match.index), 'node_modules', match[1]!));
      }
      packages.set(
        '@lobehub/fluent-emoji-3d',
        path.dirname(require.resolve('@lobehub/fluent-emoji-3d/package.json')),
      );
      const sections = [...packages.entries()].sort().map(([name, dir]) => {
        const info = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
          version: string;
          license?: string;
        };
        const file = existsSync(dir) ? readdirSync(dir).find((entry) => /^(licen[cs]e|copying)/i.test(entry)) : undefined;
        const text = file ? readFileSync(path.join(dir, file), 'utf8').trim() : `Licence: ${info.license ?? 'unknown'}`;
        return `${name} ${info.version}\n\n${text}`;
      });
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD_PARTY_LICENSES.txt',
        source: `The SynapseNote editor bundles the following open source software.\n\n${sections.join(`\n\n${'-'.repeat(72)}\n\n`)}\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [hostModules(), react(), emojiImages(), emojiIndex(), thirdPartyLicenses()],
  define: { __APP_VERSION__: JSON.stringify('0.1.0') },
  // relative paths, the app serves the bundle from its own url scheme
  base: './',
  build: {
    outDir: path.join(here, '../App/Resources/Editor'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    // one local bundle read from the app, chunk size costs nothing over a network
    chunkSizeWarningLimit: 4000,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
