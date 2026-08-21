/**
 * Turning a menu choice into a document edit.
 *
 * Every format replaces the *same* range — the inline range the paste
 * dispatcher just linkified — so switching format is one transaction and
 * one undo step, and the link never coexists with its replacement.
 *
 * `url` is the exception with no edit at all: it is the state the document
 * is already in.
 *
 * ── Bookmark metadata ────────────────────────────────────────────────────
 *
 * The card is inserted immediately with only its `src`, then patched with
 * whatever the metadata fetch returns. That ordering is deliberate: the
 * fetch crosses the network and can take seconds, and blocking the editor
 * on it would turn a menu click into a freeze. The intermediate card is
 * not a placeholder — it is a complete, correct bookmark to that URL,
 * rendering the hostname as its title; the patch only ever adds detail.
 *
 * The patch finds its target by NODE IDENTITY, not by a remembered
 * position. ProseMirror preserves a node's object identity across
 * transactions that don't touch it, so the walk finds the card wherever
 * the author's subsequent typing pushed it — and finds nothing at all if
 * they undid the insert, which is exactly the right outcome (a late
 * response can't resurrect a card the author removed).
 *
 * Metadata is available on the desktop build only: the fetch runs in the
 * main process behind an SSRF guard (`packages/desktop/src/main/
 * web-preview-metadata.ts`). On web/CLI there is no bridge, so bookmarks
 * stay URL-only cards rather than the renderer making a cross-origin
 * request the browser would refuse anyway.
 */

import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { OkWebPreviewMetadata } from '@/lib/desktop-bridge-types';
import type { InternalDocTarget, PasteFormat } from './paste-format-options.ts';

export interface PasteFormatRange {
  readonly from: number;
  readonly to: number;
}

/** Build the PM JSON for a self-closing descriptor node with given props. */
function descriptorNode(componentName: string, props: Record<string, unknown>) {
  return {
    type: 'jsxComponent' as const,
    attrs: {
      componentName,
      kind: 'element' as const,
      attributes: [],
      sourceRaw: '',
      // Dirty so the serializer emits the props above rather than the
      // (empty) `sourceRaw` — same contract every programmatic insert
      // uses (`createChildNode`, the drop pipeline).
      sourceDirty: true,
      props,
    },
  };
}

/** Locate a node by object identity. Returns -1 when it is no longer in the doc. */
function findNodePos(editor: Editor, target: ProseMirrorNode): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node === target) found = pos;
    return found < 0;
  });
  return found;
}

/**
 * The metadata fetcher, or null off-desktop. Injectable for tests.
 */
export type BookmarkMetadataFetcher = (url: string) => Promise<OkWebPreviewMetadata | null>;

export function defaultBookmarkMetadataFetcher(): BookmarkMetadataFetcher | null {
  const fetchWebPreview =
    typeof window === 'undefined' ? undefined : window.okDesktop?.shell?.fetchWebPreview;
  return fetchWebPreview ? (url: string) => fetchWebPreview(url) : null;
}

/**
 * Props the card should carry once metadata is in hand. Empty fields are
 * omitted entirely so the descriptor's empty-string strip rule keeps the
 * serialized `<Bookmark>` free of `title=""`-style noise.
 */
export function bookmarkPropsFromMetadata(
  url: string,
  metadata: OkWebPreviewMetadata | null,
): Record<string, unknown> {
  if (!metadata) return { src: url };
  return {
    // The fetcher reports the post-redirect URL; storing that is what the
    // author actually bookmarked, and it keeps the card's link honest
    // when a shortener was pasted.
    src: metadata.url || url,
    ...(metadata.title ? { title: metadata.title } : {}),
    ...(metadata.description ? { description: metadata.description } : {}),
    // Remote URLs, never the base64 payloads the chat cards use — see the
    // `bookmarkProps` note in `packages/core/src/registry/built-ins.ts`.
    ...(metadata.imageUrl ? { image: metadata.imageUrl } : {}),
    ...(metadata.faviconUrl ? { favicon: metadata.faviconUrl } : {}),
  };
}

function insertBookmark(
  editor: Editor,
  range: PasteFormatRange,
  url: string,
  fetchMetadata: BookmarkMetadataFetcher | null,
): void {
  const before = new Set<ProseMirrorNode>();
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'jsxComponent' && node.attrs.componentName === 'Bookmark') {
      before.add(node);
    }
  });

  editor
    .chain()
    .focus()
    .insertContentAt(range, descriptorNode('Bookmark', { src: url }))
    .run();

  if (!fetchMetadata) return;

  let inserted: ProseMirrorNode | null = null;
  editor.state.doc.descendants((node) => {
    if (inserted) return false;
    if (
      node.type.name === 'jsxComponent' &&
      node.attrs.componentName === 'Bookmark' &&
      !before.has(node)
    ) {
      inserted = node;
    }
    return !inserted;
  });
  const target = inserted as ProseMirrorNode | null;
  if (!target) return;

  void fetchMetadata(url)
    .then((metadata) => {
      if (!metadata || editor.isDestroyed) return;
      const pos = findNodePos(editor, target);
      if (pos < 0) return;
      const live = editor.state.doc.nodeAt(pos);
      if (!live) return;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(pos, null, {
          ...live.attrs,
          attributes: [],
          props: bookmarkPropsFromMetadata(url, metadata),
          sourceDirty: true,
        }),
      );
    })
    .catch((err: unknown) => {
      // A failed unfurl is not a failed bookmark — the card stands as a
      // URL-only card, which is what it already renders.
      console.warn('[paste-format] bookmark metadata fetch failed', url, err);
    });
}

export interface ApplyPasteFormatArgs {
  readonly editor: Editor;
  readonly range: PasteFormatRange;
  readonly url: string;
  readonly format: PasteFormat;
  readonly internalDoc: InternalDocTarget | null;
  /** Defaults to the desktop bridge; tests inject their own. */
  readonly fetchMetadata?: BookmarkMetadataFetcher | null;
}

/**
 * Apply one menu choice. Returns true when the document changed — `url`
 * (and any format whose precondition is missing) returns false, and the
 * caller just closes the menu.
 */
export function applyPasteFormat(args: ApplyPasteFormatArgs): boolean {
  const { editor, range, url, format, internalDoc } = args;

  if (format === 'url') return false;

  if (format === 'mention') {
    if (!internalDoc) return false;
    editor
      .chain()
      .focus()
      .insertContentAt(range, {
        type: 'wikiLink',
        attrs: { target: internalDoc.docName, alias: null, anchor: internalDoc.anchor },
      })
      .run();
    return true;
  }

  if (format === 'embed') {
    editor
      .chain()
      .focus()
      .insertContentAt(range, descriptorNode('Embed', { src: url }))
      .run();
    return true;
  }

  const fetchMetadata =
    args.fetchMetadata === undefined ? defaultBookmarkMetadataFetcher() : args.fetchMetadata;
  insertBookmark(editor, range, url, fetchMetadata);
  return true;
}
