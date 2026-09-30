import { t } from '@lingui/core/macro';
import {
  DEFAULT_DEDUP_UI,
  formatFileSize,
  ProblemDetailsSchema,
  type UploadAssetSuccess,
  UploadAssetSuccessSchema,
} from '@nedian0brien/synapsenote-core';
import type { Editor } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { toast } from 'sonner';
import { getEditorDocName } from '../extensions/doc-context.ts';
import { buildUnresolvedWikiLinkAttrs } from '../extensions/wiki-link-helpers.ts';
import { HttpResponseParseError } from '../http-client.ts';

import { parentDir, pickInsertShape, shortestImageRef } from './source-shape.ts';

export { pickInsertShape, shortestImageRef } from './source-shape.ts';

const uploadPluginKey = new PluginKey<UploadPluginState>('imageUpload');

interface UploadPluginState {
  decorations: DecorationSet;
  uploads: Map<string, number>;
}

function createSkeletonWidget(file?: File): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'image-upload-skeleton w-full h-40 rounded-md bg-muted animate-pulse motion-reduce:animate-none my-2';
  el.setAttribute('data-upload-widget', 'loading');
  el.setAttribute('role', 'status');
  // WCAG 4.1.2: the announced label must reflect what is actually
  // uploading. The widget is used for every file type (PDF / ZIP /
  // MP4 / CSV / etc.), so a generic "Uploading image..." would
  // misdescribe every non-image upload.
  const fileName = file?.name;
  el.setAttribute('aria-label', fileName ? t`Uploading ${fileName}` : t`Uploading file`);
  return el;
}

type UploadMeta =
  | { type: 'add'; id: string; pos: number; widget: HTMLElement }
  | { type: 'remove'; id: string };

export const uploadDecorationPlugin = new Plugin<UploadPluginState>({
  key: uploadPluginKey,

  state: {
    init() {
      return { decorations: DecorationSet.empty, uploads: new Map() };
    },

    apply(tr, prev) {
      const mappedDecorations = prev.decorations.map(tr.mapping, tr.doc);
      const mappedUploads = new Map<string, number>();
      for (const [id, pos] of prev.uploads) {
        mappedUploads.set(id, tr.mapping.map(pos));
      }

      const meta = tr.getMeta(uploadPluginKey) as UploadMeta | undefined;
      if (!meta) {
        return { decorations: mappedDecorations, uploads: mappedUploads };
      }

      if (meta.type === 'add') {
        const deco = Decoration.widget(meta.pos, meta.widget, {
          id: meta.id,
          stopEvent: () => true,
        });
        const newDecorations = mappedDecorations.add(tr.doc, [deco]);
        const newUploads = new Map(mappedUploads);
        newUploads.set(meta.id, tr.mapping.map(meta.pos));
        return { decorations: newDecorations, uploads: newUploads };
      }

      if (meta.type === 'remove') {
        const toRemove = mappedDecorations.find(
          undefined,
          undefined,
          (spec) => spec.id === meta.id,
        );
        const newDecorations = mappedDecorations.remove(toRemove);
        const newUploads = new Map(mappedUploads);
        newUploads.delete(meta.id);
        return { decorations: newDecorations, uploads: newUploads };
      }

      return { decorations: mappedDecorations, uploads: mappedUploads };
    },
  },

  props: {
    decorations(state) {
      return uploadPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
    },
  },
});

/**
 * Resolve the doc name for an in-progress upload from the WeakMap the
 * TiptapEditor mount effect populates. Reading from a per-editor
 * registry — not a module-level singleton — is the race-safe choice
 * for `EditorActivityPool`: up to `ACTIVITY_MOUNT_LIMIT` editors mount
 * concurrently, and Activity-hidden editors do not unmount. A module-
 * level `currentDocName` would reflect whichever mount effect ran most
 * recently, not the user-active editor.
 */
function docNameFromEditor(editor: Editor): string | null {
  return getEditorDocName(editor);
}

/**
 * Build the PM `jsxComponent` node data for a freshly uploaded media asset
 * (`<img>` / `<video>` / `<audio>`). Pure factory — no editor, no schema
 * dependency — so the drop-time shape can be pinned by unit test against
 * the parser's shape for the same source markdown.
 *
 * Invariant: this shape MUST be structurally compatible with what
 * `mdManager.parse('<img src="/x.png" />')` etc. produces — i.e. drop omits
 * `alt` so the parser of the drop's own serialized output produces the same
 * `{src}`-only prop bag. Drift here fragments the editor between drop-time
 * and reload-time PM trees — a prop-edit on a freshly dropped node would
 * round-trip differently than a prop-edit on the same node after reload.
 * The test in `media-drop-shape-invariant.test.ts` (co-located here in
 * `packages/app/src/editor/image-upload/`) pins both directions.
 *
 * `props` carries only the user-visible inputs that distinguish a fresh
 * drop — `src` for everything, `controls: true` for `<video>` / `<audio>`
 * (mirrors the user-stated success criterion `<video src controls />`).
 * `<img>` carries `src` only; `alt` is intentionally absent so the tri-state
 * `needsConfig` predicate fires the chrome-bar gear nudge prompting the
 * author for an explicit alt decision (descriptive text OR `alt=""`
 * decorative opt-in per WCAG 1.1.1). Stamping `alt: ""` automatically would
 * silently pick "decorative" on the author's behalf, defeating the schema.
 * Leaving the rest unset prevents `emitMdxJsx` from emitting a wall of
 * `attr=""` defaults; the PropPanel still surfaces every canonical-prop
 * field because it iterates `descriptor.props`, not `node.attrs.props`.
 */
export function buildMediaJsxNodeData(
  kind: 'jsx-img' | 'jsx-video' | 'jsx-audio',
  resolvedSrc: string,
): {
  type: 'jsxComponent';
  attrs: {
    componentName: 'img' | 'video' | 'audio';
    kind: 'element';
    attributes: never[];
    sourceRaw: '';
    sourceDirty: true;
    props: Record<string, unknown>;
  };
} {
  const componentName = kind === 'jsx-img' ? 'img' : kind === 'jsx-video' ? 'video' : 'audio';
  const props: Record<string, unknown> =
    kind === 'jsx-img' ? { src: resolvedSrc } : { src: resolvedSrc, controls: true };
  return {
    type: 'jsxComponent',
    attrs: {
      componentName,
      kind: 'element',
      attributes: [],
      sourceRaw: '',
      sourceDirty: true,
      props,
    },
  };
}

export async function uploadAndInsert(
  file: File,
  editor: Editor,
  insertPos: number,
): Promise<void> {
  const docName = docNameFromEditor(editor);
  const parentDocName = docName ? `${docName}.md` : '';
  if (!parentDocName) {
    toast.error(t`Cannot upload: no document is open`);
    return;
  }
  const uploadId = crypto.randomUUID();

  const skeletonWidget = createSkeletonWidget(file);
  editor.view.dispatch(
    editor.state.tr.setMeta(uploadPluginKey, {
      type: 'add',
      id: uploadId,
      pos: insertPos,
      widget: skeletonWidget,
    }),
  );

  const formData = new FormData();
  formData.append('file', file);
  formData.append('parentDocName', parentDocName);

  let res: Response;
  try {
    res = await fetch('/api/upload', { method: 'POST', body: formData });
  } catch (networkError) {
    console.error('[uploadAndInsert] Network error:', networkError);
    showError(editor, uploadId);
    return;
  }

  let rawBody: unknown;
  try {
    rawBody = await res.json();
  } catch (parseError) {
    // Non-JSON response (proxy 502 HTML, network failure body, etc.).
    // Distinct from a contract-shape parse failure handled below.
    console.error('[uploadAndInsert] Response is not JSON:', parseError);
    showError(editor, uploadId);
    return;
  }

  // RFC 9457 two-step parse: HTTP-status discrimination + per-handler schema.
  if (!res.ok) {
    const problem = ProblemDetailsSchema.safeParse(rawBody);
    if (!problem.success) {
      const cause = new HttpResponseParseError('Upload response did not match ProblemDetails.', {
        cause: problem.error,
        status: res.status,
      });
      console.error('[uploadAndInsert] Server error (unparseable):', cause);
      showError(editor, uploadId);
      return;
    }
    console.error('[uploadAndInsert] Server error:', problem.data);
    showError(editor, uploadId, problem.data.title);
    return;
  }

  const success = UploadAssetSuccessSchema.safeParse(rawBody);
  if (!success.success) {
    const cause = new HttpResponseParseError(
      'Upload success response did not match UploadAssetSuccess.',
      {
        cause: success.error,
        status: res.status,
      },
    );
    console.error('[uploadAndInsert] Response missing src:', cause);
    showError(editor, uploadId);
    return;
  }
  const body: UploadAssetSuccess = success.data;
  const src = body.src;
  const deduped = body.deduped === true;
  // prefer the server-returned `path` (contentDir-relative)
  // so non-default `content.attachmentFolderPath` values — Obsidian-style
  // global paths like `attachments`, bare-name, or parent-relative — are
  // honored. Pre-fix the client assumed the asset was co-located with
  // the parent doc (`${parentDir(parentDocName)}/${src}`), which breaks
  // whenever content.attachmentFolderPath isn't `./`. Fall back to the co-located
  // assumption only when a legacy server without `path` responds.
  const parentDocDir = parentDir(parentDocName);
  const assetContentPath =
    typeof body.path === 'string' && body.path.length > 0
      ? body.path
      : parentDocDir
        ? `${parentDocDir}/${src}`
        : src;

  // Dedup toast. Fixed default is `DEFAULT_DEDUP_UI === 'toast'` — no
  // user config surface. The check is kept so future work that reintroduces
  // the knob with concrete user evidence does not have to re-derive the
  // call site.
  if (deduped && DEFAULT_DEDUP_UI !== 'silent') {
    toast.info(t`Already at ${assetContentPath} — reusing.`);
  }

  const shape = pickInsertShape(file.name);

  const { state } = editor;
  const pluginState = uploadPluginKey.getState(state);
  const mappedPos = pluginState?.uploads.get(uploadId) ?? insertPos;

  const tr = state.tr.setMeta(uploadPluginKey, { type: 'remove', id: uploadId });

  // `shortestImageRef` wants contentDir-relative paths for BOTH inputs.
  // `assetContentPath` is already contentDir-relative from the server;
  // `parentDocName` already is too (the client built it from the docName
  // at the top of this function). The doc-relative `relPath` is the
  // ON-DISK markdown shape (e.g. `photo.png` / `../photo.png`) —
  // preserved as the href for the markdown-link fallback kind where the
  // browser resolves against the current page URL under hash routing
  // (root = `/`, so same-dir drops at content root resolve correctly).
  const relPath = shortestImageRef(assetContentPath, parentDocName);

  // `resolvedSrc` is the in-editor render hint for `<img src>` /
  // `<a href>` — it must be server-absolute
  // (`/<contentDir-relative>`) so the browser resolves it against origin
  // regardless of the current doc's hash-routed URL. Under hash routing,
  // `location.pathname === '/'` always, so a doc-relative path (bare
  // basename for same-dir) resolves to `http://origin/<basename>` — which
  // only exists at content root. For any subdirectory doc the path would
  // 404 (masked by Vite SPA fallback as text/html, producing broken
  // images + blank PDF tabs). `assetContentPath` is contentDir-relative
  // from the server — prefixing `/` roots it at origin, which sirv serves
  // from contentDir. Post-roundtrip, `handlers.wikiLinkEmbed` in core
  // applies the same `/` prefix so PM image/link nodes carry the same
  // absolute URL shape.
  const resolvedSrc = `/${assetContentPath}`;

  if (shape.kind === 'jsx-file') {
    // File-attachment drops emit `jsxComponent('WikiEmbedFile')` block
    // directly — the in-session shape matches what the parser produces
    // post-reload, so the rendered chrome (File row in `File.tsx`) is
    // visually identical at every lifecycle stage. Source bytes are
    // `![[file.ext]]` (via `WikiEmbedFile.serialize`).
    //
    // Unlike img/video/audio (which insert their canonical JSX shape
    // and would round-trip to a DIFFERENT mdast shape than the parser
    // produces from `![[]]` source), File uses the COMPAT descriptor's
    // shape directly so drop-time and reload-time PM trees converge on
    // the same `componentName`. This keeps the `WikiEmbedFile` compat
    // as the single render dispatch site.
    //
    // `size` is stamped here from `file.size` (drop-time metadata that
    // the markdown source `![[]]` syntax can't encode). It survives the
    // current session in PM attrs. On reload, the server-side
    // `resolveSize` callback in `server-factory.ts` re-derives size
    // from disk via `statSync` so the File row's size span persists
    // for files inside the content directory. Remote URLs and
    // client-only parses lack a resolver and render without size,
    // which is the intended behavior.
    const jsxNode = state.schema.nodes.jsxComponent;
    if (!jsxNode) {
      console.error('[uploadAndInsert] jsxComponent node missing from schema');
      showError(editor, uploadId);
      return;
    }
    // Target stays the bare basename (Obsidian wikilink convention) —
    // matches what the `'wikiembed'` branch does for the
    // PDF drop path. The serializer's `serializeWikiEmbed`
    // emits `![[<target>]]` source bytes, and the basename-index
    // resolves it back to the right disk path on next parse. Using
    // `assetContentPath` here would emit `![[docs/sub/file.pdf]]`
    // (full path) which still parses correctly but doesn't round-trip
    // byte-stable against authored content + breaks tests that pin
    // the canonical Obsidian shape.
    const fileNodeData = {
      type: 'jsxComponent' as const,
      attrs: {
        componentName: 'WikiEmbedFile',
        kind: 'element' as const,
        attributes: [],
        sourceRaw: '',
        sourceDirty: true,
        props: {
          src: resolvedSrc,
          target: src,
          alias: null,
          anchor: null,
          size: formatFileSize(file.size),
        },
      },
    };
    editor
      .chain()
      .command(({ tr: chainTr }) => {
        chainTr.setMeta(uploadPluginKey, { type: 'remove', id: uploadId });
        return true;
      })
      .focus()
      .insertContentAt(mappedPos, fileNodeData)
      .command(({ tr: chainTr, dispatch }) => {
        if (!dispatch) return true;
        const realPos = chainTr.mapping.map(mappedPos);
        const inserted = chainTr.doc.nodeAt(realPos);
        if (inserted?.type.name === 'jsxComponent') {
          chainTr.setSelection(NodeSelection.create(chainTr.doc, realPos));
        }
        return true;
      })
      .run();
    return;
  }

  if (shape.kind === 'jsx-img' || shape.kind === 'jsx-video' || shape.kind === 'jsx-audio') {
    // Image / video / audio drops all emit the OK-canonical lowercase JSX
    // shape (`<img>` / `<video>` / `<audio>`) so drag/drop/paste converges
    // with the slash-menu insert on `Image.tsx` / `Video.tsx` / `Audio.tsx`
    // (zoom + PropPanel + full canonical-prop surface). The shape construction
    // is delegated to `buildMediaJsxNodeData` so the drop-time PM tree can be
    // pinned against the parser's tree by unit test (precedent for clean
    // shape-equivalence between drop-time and reload-time editor state).
    const jsxNode = state.schema.nodes.jsxComponent;
    if (!jsxNode) {
      console.error('[uploadAndInsert] jsxComponent node missing from schema');
      showError(editor, uploadId);
      return;
    }
    const childData = buildMediaJsxNodeData(shape.kind, resolvedSrc);

    // One-tx insert: `command()` clears the upload skeleton and
    // `insertContentAt` handles block-vs-inline positioning (drop pos may
    // sit mid-paragraph; ProseMirror's `tr.insert` of a block at an inline
    // pos throws). Mirrors `drag-handle.ts`. The trailing `command()`
    // selects the just-inserted node atomically inside the same transaction.
    // Drop is a passive event — the user already supplied the asset, so
    // select the dropped node (chrome bar visible via data-selected) but
    // skip auto-opening the property panel. Slash-command insertions still
    // auto-open via focusInsertedComponent at their own call sites because
    // that path is a deliberate insert-then-configure request.
    //
    // Position-shift discipline: when the drop point sits inside a
    // paragraph, `insertContentAt` splits the paragraph and adds open/close
    // tokens, so `mappedPos` does NOT necessarily resolve to the inserted
    // node afterwards. Map through the transaction's mapping to find the
    // actual post-insert position, then verify the resolved node matches
    // before constructing the NodeSelection. Without the verification,
    // `NodeSelection.create` throws on null `nodeAfter` and silently drops
    // the chrome-bar UX.
    editor
      .chain()
      .command(({ tr: chainTr }) => {
        chainTr.setMeta(uploadPluginKey, { type: 'remove', id: uploadId });
        return true;
      })
      .focus()
      .insertContentAt(mappedPos, childData)
      .command(({ tr: chainTr, dispatch }) => {
        // Always succeed — the insert is the load-bearing operation; the
        // selection is best-effort (chrome bar wants it but the drop is
        // already complete). Returning false would abort the chain and
        // discard the insert.
        if (!dispatch) return true;
        const realPos = chainTr.mapping.map(mappedPos);
        const inserted = chainTr.doc.nodeAt(realPos);
        if (inserted?.type.name === 'jsxComponent') {
          chainTr.setSelection(NodeSelection.create(chainTr.doc, realPos));
        }
        return true;
      })
      .run();
    return;
  }

  if (shape.kind === 'wikiembed') {
    const node = state.schema.nodes.wikiLinkEmbed;
    if (!node) {
      console.error('[uploadAndInsert] wikiLinkEmbed node missing from schema');
      showError(editor, uploadId);
      return;
    }
    // Target stays the bare basename (Obsidian shape). The NodeView
    // (`WikiLinkEmbed.renderHTML`) applies `data-resolved-src` for image
    // rendering so the in-page `<img>` / `<a>` resolves correctly
    // regardless of content.attachmentFolderPath or doc subdirectory.
    tr.insert(mappedPos, node.create({ target: src, alias: null, anchor: null, resolvedSrc }));
  } else if (shape.kind === 'wiki-link') {
    const wikiLinkNode = state.schema.nodes.wikiLink;
    if (!wikiLinkNode) {
      console.error('[uploadAndInsert] wikiLink node missing from schema');
      showError(editor, uploadId);
      return;
    }
    const basename = file.name.replace(/\.(md|mdx)$/i, '');
    const attrs = buildUnresolvedWikiLinkAttrs(basename);
    if (!attrs) {
      tr.insert(mappedPos, state.schema.text(file.name));
    } else {
      tr.insert(mappedPos, wikiLinkNode.create(attrs));
    }
  } else {
    // Markdown-link fallback: insert text + link mark.
    const linkMark = state.schema.marks.link;
    if (linkMark) {
      const text = state.schema.text(file.name, [linkMark.create({ href: relPath })]);
      tr.insert(mappedPos, text);
    } else {
      tr.insert(mappedPos, state.schema.text(file.name));
    }
  }

  editor.view.dispatch(tr);
}

function showError(editor: Editor, uploadId: string, message?: string): void {
  editor.view.dispatch(editor.state.tr.setMeta(uploadPluginKey, { type: 'remove', id: uploadId }));
  toast.error(message ?? t`Upload failed`);
}
