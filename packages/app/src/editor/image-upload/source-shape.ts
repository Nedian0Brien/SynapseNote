import {
  AUDIO_EXTENSIONS,
  DEFAULT_EMIT_FORMAT,
  extensionOf,
  FILE_ATTACHMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  WIKI_EMBED_EXTENSIONS,
} from '@nedian0brien/synapsenote-core';

export function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function splitSegments(p: string): string[] {
  return p.split('/').filter((s) => s !== '');
}

/**
 * 4-case relative-path emit.
 *   1. same-dir → bare basename
 *   2. asset is in an ancestor of doc dir → `../<asset>`
 *   3. asset is in a subtree of doc dir → `./<sub>/<asset>`
 *   4. cross-tree → `../...../<asset>`
 *
 * Both inputs are contentDir-relative posix paths. Output is the minimal
 * relative reference from `mdPath`'s dirname to `assetPath`.
 */
export function shortestImageRef(assetPath: string, mdPath: string): string {
  const assetDir = parentDir(assetPath);
  const mdDir = parentDir(mdPath);
  const assetName = basename(assetPath);
  if (assetDir === mdDir) return assetName;

  const fromParts = splitSegments(mdDir);
  const toParts = splitSegments(assetDir);
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }
  const ups = fromParts.length - common;
  const downs = toParts.slice(common);
  if (ups === 0) {
    // mdDir is an ancestor of assetDir — pure descent, prefix `./`.
    return `./${[...downs, assetName].join('/')}`;
  }
  return [...new Array(ups).fill('..'), ...downs, assetName].join('/');
}

export interface InsertShape {
  kind:
    | 'wikiembed'
    | 'jsx-img'
    | 'jsx-video'
    | 'jsx-audio'
    | 'jsx-file'
    | 'markdown-link'
    | 'wiki-link';
  ext: string;
}

/**
 * Choose the PM insert shape for a freshly uploaded file. Dispatches by
 * extension against the fixed media-extension constants — zero user-facing
 * upload config. Markdown files are OK docs (wiki-link semantic), not assets.
 *
 * Image / video / audio extensions emit the canonical lowercase JSX shapes
 * (`<img>` / `<video>` / `<audio>`) so drag/drop/paste converges with the
 * slash-menu insert path on the canonical render components.
 *
 * File-attachment extensions (`FILE_ATTACHMENT_EXTENSIONS` — `.pdf` /
 * `.zip` / `.docx` / `.xlsx` / `.csv` / …) emit `'jsx-file'` which inserts
 * a `jsxComponent('WikiEmbedFile')` block directly. The serialize path
 * (`built-ins.ts` `WikiEmbedFile.serialize`) emits the `![[file.ext]]`
 * source bytes so the wikilink form persists; the in-session render goes
 * straight through `componentMap['File']`'s row chrome rather than the
 * inline `wikiLinkEmbed` atom (which renders as a bare `<a>` link via
 * `WikiLinkEmbed.renderHTML` and would visually disagree with the
 * post-reload File-row chrome).
 */
export function pickInsertShape(filename: string): InsertShape {
  const ext = extensionOf(filename);
  // Markdown files are first-class OK docs, not opaque assets. Emit [[foo]]
  // (link semantic) — `![[foo.md]]` would imply transclusion, which OK
  // doesn't support.
  if (ext === 'md' || ext === 'mdx') {
    return { kind: 'wiki-link', ext };
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { kind: 'jsx-img', ext };
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return { kind: 'jsx-video', ext };
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return { kind: 'jsx-audio', ext };
  }
  if (FILE_ATTACHMENT_EXTENSIONS.has(ext)) {
    return { kind: 'jsx-file', ext };
  }
  if (WIKI_EMBED_EXTENSIONS.has(ext)) {
    if (DEFAULT_EMIT_FORMAT === 'wikiembed') return { kind: 'wikiembed', ext };
    return { kind: 'markdown-link', ext };
  }
  return { kind: 'markdown-link', ext };
}
