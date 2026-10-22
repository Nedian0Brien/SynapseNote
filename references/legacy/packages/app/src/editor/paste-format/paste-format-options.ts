/**
 * What a pasted URL can become — the pure half of the paste-format menu.
 *
 * Pasting a URL is an ambiguous gesture: the same bytes can reasonably mean
 * "link to this", "show me a card for this", "render this inline", or —
 * when the URL points back into this vault — "mention that document". The
 * dispatcher can't guess, so it commits to the safest reading (a plain
 * link, exactly what it did before this module existed) and offers the
 * alternatives in a menu the author can ignore.
 *
 * This module decides which alternatives are on offer and holds no DOM,
 * no ProseMirror, and no React — the menu, the plugin, and the tests all
 * read the same table from here.
 */

import { anchorFromHash, docNameFromHash } from '@/lib/doc-hash';

/** Insertion shapes a pasted URL can take. Menu order is list order. */
export type PasteFormat = 'mention' | 'url' | 'bookmark' | 'embed';

/** A document this vault owns, named by a pasted URL. */
export interface InternalDocTarget {
  readonly docName: string;
  /** Heading slug from the URL's own fragment, when it carried one. */
  readonly anchor: string | null;
}

export interface PasteFormatContext {
  /** The pasted URL, exactly as the dispatcher linkified it. */
  readonly url: string;
  /** Origin of the app window, for recognizing self-referential URLs. */
  readonly appOrigin: string | null;
}

/**
 * Does this URL name a document in the open vault? Two shapes qualify:
 *
 *   1. `synapsenote://open?project=…&doc=<name>` — the deep link the CLI
 *      and the desktop "Copy link" action produce.
 *   2. A URL on the app's own origin whose hash is a document route
 *      (`#/<docName>`) — what you get by copying the address bar.
 *
 * The `project` half of the deep link is deliberately not checked against
 * the open vault: the resolver already treats an unresolved wiki link as a
 * first-class state (it renders as an unresolved chip offering "Create
 * page"), which is a better answer for a link into someone else's vault
 * than silently withholding the mention option.
 *
 * Returns null for every other URL, including app-origin URLs whose hash
 * is a non-document surface (`#/__graph__`, `#/__chat__`, asset routes) —
 * `docNameFromHash` owns that classification.
 */
export function internalDocTarget(ctx: PasteFormatContext): InternalDocTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(ctx.url);
  } catch {
    return null;
  }

  if (parsed.protocol === 'synapsenote:') {
    // `new URL` puts the deep link's `open` in `hostname`; a `file=` deep
    // link names a path on disk, not a vault document, so it stays out.
    if (parsed.hostname !== 'open') return null;
    const doc = parsed.searchParams.get('doc');
    if (!doc) return null;
    // The `open` deep link has no heading parameter (see the parser in
    // `packages/desktop/src/main/url-scheme.ts`) — only the app-origin
    // hash form below can carry an anchor.
    return { docName: doc, anchor: null };
  }

  if (!ctx.appOrigin || parsed.origin !== ctx.appOrigin) return null;
  const docName = docNameFromHash(parsed.hash);
  if (!docName) return null;
  return { docName, anchor: anchorFromHash(parsed.hash) };
}

function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The formats offered for one pasted URL, in menu order.
 *
 * Three cases:
 *
 *   - **Vault document** → `['mention', 'url']`. Neither a bookmark card
 *     nor an iframe is meaningful for a link back into the same app:
 *     `Embed` refuses same-origin URLs outright (sandbox-escape guard),
 *     and a bookmark card would show this vault's own metadata.
 *   - **Web page** → `['url', 'bookmark', 'embed']`.
 *   - **Anything else** (`mailto:`, `tel:`, a bare `file:` path) → just
 *     `['url']`.
 *
 * A single-entry result means there is nothing to choose, and callers
 * skip the menu entirely rather than opening a one-item popup over a
 * paste that already did the right thing.
 */
export function pasteFormatOptions(ctx: PasteFormatContext): readonly PasteFormat[] {
  if (internalDocTarget(ctx)) return ['mention', 'url'];
  if (isHttpUrl(ctx.url)) return ['url', 'bookmark', 'embed'];
  return ['url'];
}

/**
 * Index the menu opens on. Always `url` — the format the paste already
 * applied, so the menu opens describing the document's actual state.
 *
 * The plugin pairs this with a deliberate carve-out: while `url` is the
 * highlighted row, Enter is NOT captured. Pasting a URL and immediately
 * hitting Enter for a new line is a reflex, and swallowing that keystroke
 * to "confirm" the format the paste already applied would be a regression
 * dressed up as a feature. Enter only commits once the author has moved
 * the highlight onto a format that would actually change something.
 */
export function defaultPasteFormatIndex(options: readonly PasteFormat[]): number {
  const index = options.indexOf('url');
  return index >= 0 ? index : 0;
}
