/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const morrowApp = path.join(here, 'vendor/morrow/src/app');
const hostDir = path.join(here, 'src/host');

// morrow app modules tied to electron or to morrow's own workspace, swapped for the native host
const HOST_MODULES: Record<string, string> = {
  'actions.ts': 'actions.ts',
  'router.ts': 'router.ts',
  'platform/desktop.ts': 'desktop.ts',
  'platform/attachments.ts': 'attachments.ts',
  'platform/files.ts': 'files.ts',
};

// modules that must never reach the editor bundle, they would pull in storage or electron code
const FORBIDDEN = [
  path.join(here, 'vendor/morrow/src/storage') + path.sep,
  path.join(here, 'vendor/morrow/electron') + path.sep,
  path.join(morrowApp, 'workspace.ts'),
  path.join(morrowApp, 'operations.ts'),
];

// visible morrow strings in modules the editor uses, renamed at build time so the morrow files stay unmodified
const RENAMED: Record<string, Array<[string, string]>> = {
  [path.join(morrowApp, 'editor/EditorMenus.tsx')]: [["'Morrow page'", "'SynapseNote page'"]],
};

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
      for (const file of Object.values(bundle))
        if (file.type === 'chunk' && file.code.includes('Morrow'))
          this.error(`${file.fileName} still contains the name Morrow`);
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
  plugins: [hostModules(), react(), emojiImages(), thirdPartyLicenses()],
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
