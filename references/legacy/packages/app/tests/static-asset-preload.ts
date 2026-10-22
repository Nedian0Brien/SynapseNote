/**
 * Bun-test preload: load static image assets as their path string.
 *
 * `component-items.tsx` does `import imagePreview from './preview-assets/image-preview.png'`
 * and passes the result straight through as an `<img src>` / `<video poster>`.
 * Vite resolves that to a URL at build time; Bun has a native `file` loader that
 * returns the absolute path, so most test entrypoints already work.
 *
 * They do not all work. Reached through some module graphs the loader is not
 * applied and Bun parses the PNG bytes as JavaScript, which surfaces as
 * `error: Unexpected �` — an "unhandled error between tests" that fails the
 * whole file rather than one test. `DatabaseView.dom.test.tsx` hits this while
 * `JsxComponentView.production.dom.test.tsx`, which imports the same module,
 * does not. Registering the load explicitly makes the behaviour identical on
 * every path instead of depending on how the asset was reached.
 *
 * The emitted value is the absolute path — byte-for-byte what Bun's native
 * loader already returns — so entrypoints that worked before are unaffected.
 *
 * Registered via `[test] preload` in `packages/app/bunfig.toml` so both the
 * unit tier and the DOM tier resolve assets the same way.
 */

import { plugin } from 'bun';

const STATIC_ASSET_RE = /\.(?:png|jpe?g|gif|webp|avif|ico)$/;

plugin({
  name: 'static-asset-test-loader',
  setup(build) {
    build.onLoad({ filter: STATIC_ASSET_RE }, (args) => ({
      contents: `export default ${JSON.stringify(args.path)};`,
      loader: 'js',
    }));
  },
});
