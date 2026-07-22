/**
 * PageHeader — the document title, cover banner, and page-icon surface above
 * the editor body.
 *
 * Reads `icon` + `cover` from the document's frontmatter (Y.Text('source')
 * YAML region) via the same `bindFrontmatterDoc` binding `PropertyPanel`
 * uses. Renders four states (driven by which frontmatter keys resolve to
 * supported values per `page-header-utils.ts`):
 *
 *   1. **cover + icon**: full-width cover banner; icon overlays the bottom-
 *      left of the cover (Notion-style — half the icon sits on top of the
 *      cover, half hangs below into the property panel's gutter).
 *   2. **cover only**: just the banner.
 *   3. **icon only**: a small icon row above the property panel (no
 *      banner).
 *   4. **neither**: render the document title on its own.
 *
 * Mount site: `EditorActivityPool`'s per-document column, BETWEEN
 * `DocumentBoundary` and `PropertyPanel`, so the cover/icon shares the
 * Y.Doc lifecycle of the open document AND scrolls with the editor
 * body (precedent #18(b) — keep all per-doc UI inside the boundary).
 *
 * The cover and icon are decorative. The visible H1 is not: it gives every
 * document a stable title above its properties even when the markdown body
 * does not begin with a heading.
 */

import type { HocuspocusProvider } from '@hocuspocus/provider';
import {
  bindFrontmatterDoc,
  type FrontmatterSnapshot,
  readFmKeys,
  readFmRegionWithError,
} from '@nedian0brien/synapsenote-core';
import { useEffect, useRef, useState } from 'react';
import {
  type ResolvedPageCover,
  type ResolvedPageIcon,
  resolvePageCover,
  resolvePageIcon,
} from '@/components/page-header-utils';
import { requestPageHeaderRename } from '@/lib/page-header-rename-events';

interface PageHeaderProps {
  provider: HocuspocusProvider;
  docName: string;
  docExt: string;
  /** Filename-derived title, without the Markdown extension. */
  fallbackTitle: string;
  /** Canonical database Title for record pages; does not rename the file path. */
  databaseTitle?: string;
  onDatabaseTitleCommit?: (
    nextTitle: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

/**
 * Reduce the small inline-Markdown subset commonly used in page titles to
 * visible text. The header is already visually bold, so leaking authoring
 * markers such as `**Title**` is both redundant and distracting. Matching
 * delimiters are removed while unmatched literal marker characters survive.
 */
export function markdownTitleToPlainText(value: string): string {
  let plain = value
    // AI file citations are transport metadata, not user-visible title text.
    // Match the complete framed token only so ordinary private-use glyphs and
    // incomplete text are never removed accidentally.
    .replace(/\uE200filecite\uE202[^\uE201]*\uE201/g, '')
    // These entities commonly sit immediately before a generated citation.
    // Decode only whitespace entities here; this is a title normalizer, not a
    // general HTML parser, and React still escapes every remaining character.
    .replace(/(?:&#x0*20;|&#0*32;|&nbsp;)/gi, ' ')
    .trim();
  let previous = '';

  // Repeat so nested formatting such as `**A _B_**` unwraps fully.
  while (plain !== previous) {
    previous = plain;
    plain = plain
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
      .replace(/__(?=\S)([\s\S]*?\S)__/g, '$1')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
      .replace(/(^|\s)\*(?=\S)([^*\n]*?\S)\*(?=\s|$)/g, '$1$2')
      .replace(/(^|\s)_(?=\S)([^_\n]*?\S)_(?=\s|$)/g, '$1$2');
  }

  return plain
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read the initial frontmatter snapshot synchronously from the provider
 * — same direct-read pattern as `PropertyPanel.readInitialSnapshot`. We
 * read the source bytes once and parse, avoiding the
 * allocate-binding-and-immediately-dispose pattern an earlier draft of
 * this file used.
 */
function readInitialSnapshot(provider: HocuspocusProvider): FrontmatterSnapshot {
  const ytext = provider.document.getText('source').toString();
  const { map, parseError } = readFmRegionWithError(ytext);
  const keys = readFmKeys(ytext);
  return { map, keys, parseError };
}

export function PageHeader({
  provider,
  docName,
  docExt,
  fallbackTitle,
  databaseTitle,
  onDatabaseTitleCommit,
}: PageHeaderProps) {
  const [snapshot, setSnapshot] = useState<FrontmatterSnapshot>(() =>
    readInitialSnapshot(provider),
  );
  const [renameError, setRenameError] = useState<string | null>(null);
  const titleEditorRef = useRef<HTMLHeadingElement>(null);
  const initialEditingValueRef = useRef('');
  const suppressNextBlurRef = useRef(false);
  const renamePendingRef = useRef(false);
  const title = markdownTitleToPlainText(databaseTitle ?? fallbackTitle);

  useEffect(() => {
    // Closure-scoped binding — there is no consumer that reads the
    // binding from React state, so a `useState` slot would just pay
    // for an extra unmount-time render. Lifecycle is bounded by the
    // effect: `subscribe()` runs while mounted, `unsub()` + `dispose()`
    // run on cleanup.
    const next = bindFrontmatterDoc(provider);
    setSnapshot(next.current());
    const unsub = next.subscribe((s) => {
      setSnapshot(s);
    });
    return () => {
      unsub();
      next.dispose();
    };
  }, [provider]);

  useEffect(() => {
    const editor = titleEditorRef.current;
    if (editor && document.activeElement !== editor) editor.textContent = title;
  }, [title]);

  const icon = resolvePageIcon(snapshot.map.icon);
  const cover = resolvePageCover(snapshot.map.cover);
  const hasCover = cover.kind === 'url' || cover.kind === 'path';
  const hasIcon = icon.kind !== 'unsupported';

  function beginRename() {
    initialEditingValueRef.current = titleEditorRef.current?.textContent ?? title;
    setRenameError(null);
  }

  function cancelRename() {
    if (renamePendingRef.current) return;
    const editor = titleEditorRef.current;
    if (editor) editor.textContent = title;
    setRenameError(null);
  }

  async function commitRename() {
    if (renamePendingRef.current) return;
    if (suppressNextBlurRef.current) {
      suppressNextBlurRef.current = false;
      return;
    }

    const editor = titleEditorRef.current;
    const nextTitle = editor?.textContent?.trim() ?? '';
    if (!nextTitle) {
      setRenameError('Filename cannot be empty');
      editor?.focus();
      return;
    }
    if (nextTitle === '.' || nextTitle === '..' || /[/\\\r\n]/.test(nextTitle)) {
      setRenameError('Filename cannot contain path separators');
      editor?.focus();
      return;
    }
    if (nextTitle === initialEditingValueRef.current) {
      cancelRename();
      return;
    }

    renamePendingRef.current = true;
    setRenameError(null);
    if (onDatabaseTitleCommit) {
      const result = await onDatabaseTitleCommit(nextTitle);
      renamePendingRef.current = false;
      if (!result.ok) {
        setRenameError(result.error);
        if (editor) editor.textContent = title;
        editor?.focus();
        return;
      }
      if (editor) editor.textContent = markdownTitleToPlainText(nextTitle);
      return;
    }
    const result = await requestPageHeaderRename({ docName, docExt, nextTitle });
    renamePendingRef.current = false;
    if (!result.ok) {
      setRenameError(result.message ?? 'Could not rename file');
      editor?.focus();
      return;
    }
    if (editor) editor.textContent = markdownTitleToPlainText(nextTitle);
  }

  return (
    <div
      className="page-header editor-content-aligned"
      data-has-cover={hasCover ? 'true' : 'false'}
      data-has-icon={hasIcon ? 'true' : 'false'}
      data-testid="page-header"
    >
      {hasCover ? (
        <div className="page-header-cover" data-testid="page-header-cover" aria-hidden="true">
          <CoverBanner cover={cover} />
        </div>
      ) : null}
      {hasIcon ? <PageIconBlock icon={icon} hasCover={hasCover} /> : null}
      <h1
        ref={titleEditorRef}
        className="page-header-title"
        data-testid="page-header-title"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        aria-label={`Rename ${title}`}
        spellCheck={false}
        onFocus={beginRename}
        onInput={() => setRenameError(null)}
        onBlur={() => void commitRename()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            suppressNextBlurRef.current = true;
            cancelRename();
            event.currentTarget.blur();
          }
        }}
      >
        {title}
      </h1>
      {renameError ? (
        <p className="page-header-title-error" role="alert">
          {renameError}
        </p>
      ) : null}
    </div>
  );
}

function CoverBanner({ cover }: { cover: ResolvedPageCover }) {
  // `<img>` (not CSS `background-image`) so the browser's native loader
  // shows the image, respects `loading="lazy"`, and an `onError` could
  // fall back to a placeholder later. `draggable={false}` so cover-drag
  // doesn't accidentally start a media drag-out gesture from the
  // editor.
  return (
    <img
      src={cover.value}
      alt=""
      draggable={false}
      loading="lazy"
      // `cover.value` can be an attacker-controlled external host
      // (`url` kind). Match `Embed` / `CodeBlockView` / `Image` —
      // never leak the doc path + query params in Referer.
      referrerPolicy="no-referrer"
      className="page-header-cover-img"
    />
  );
}

function PageIconBlock({ icon, hasCover }: { icon: ResolvedPageIcon; hasCover: boolean }) {
  const overlay = hasCover ? 'page-header-icon page-header-icon--with-cover' : 'page-header-icon';
  if (icon.kind === 'emoji') {
    return (
      <span className={overlay} data-testid="page-header-icon" data-kind="emoji" aria-hidden="true">
        {icon.value}
      </span>
    );
  }
  // `url` / `path` — rendered as an `<img>`. `path` is already
  // `toDesktopAssetHref`-wrapped in resolvePageIcon.
  return (
    <span
      className={overlay}
      data-testid="page-header-icon"
      data-kind={icon.kind}
      aria-hidden="true"
    >
      <img
        src={icon.value}
        alt=""
        draggable={false}
        // External-host icons leak Referer without this — same posture
        // as the cover banner above.
        referrerPolicy="no-referrer"
        className="page-header-icon-img"
      />
    </span>
  );
}
