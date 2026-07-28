/**
 * Bun-test preload: resolve static asset imports to their Vite dev URL.
 *
 * `import imagePreview from './preview-assets/image-preview.png'` is a Vite
 * asset import — in the browser it evaluates to the URL Vite serves the file
 * at (`/src/editor/slash-command/preview-assets/image-preview.png`, the bare
 * root-relative path `hocuspocus-plugin.ts` bypasses for the slash-menu hover
 * preview). `bun test` has no Vite, and its own handling of a binary import is
 * only reliable on the module graph's first pass: once a test file re-enters
 * the graph, the same `.png` is re-resolved and parsed as JavaScript, failing
 * with `Unexpected �` on the PNG magic bytes.
 *
 * Pinning an explicit loader makes every load deterministic and gives the
 * import the same string shape the browser sees, so assertions about asset
 * URLs stay meaningful in tests.
 *
 * Registered via `[test] preload` in `packages/app/bunfig.toml`.
 */

import { relative, resolve, sep } from 'node:path';
import { plugin } from 'bun';

const appRoot = resolve(import.meta.dir, '..');
const publicDir = resolve(appRoot, 'public');

/** Mirror Vite's served URL for an asset on disk. */
function assetUrl(absolutePath: string): string {
  // `publicDir` files are served from the root, without the directory name.
  const root = absolutePath.startsWith(`${publicDir}${sep}`) ? publicDir : appRoot;
  return `/${relative(root, absolutePath).split(sep).join('/')}`;
}

plugin({
  name: 'static-asset-test-url',
  setup(build) {
    build.onLoad({ filter: /\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|mp4|webm)$/ }, (args) => ({
      contents: `export default ${JSON.stringify(assetUrl(args.path))};`,
      loader: 'js',
    }));
  },
});
