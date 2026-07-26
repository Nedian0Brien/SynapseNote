import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  type DocumentMemoAnchor,
  type DocumentMemoEntry,
  type DocumentMemoState,
  isDocumentHighlight,
  readDocumentMemoState,
  subscribeDocumentMemoState,
  writeDocumentMemoState,
} from '@/lib/document-memo-store';
import { requestMemoReveal, subscribeMemoNavigation } from '../memo-navigation';
import {
  type NativeDocumentHighlight,
  publishNativeDocumentHighlights,
  subscribeNativeHighlightMutations,
} from '../native-document-highlights';

export interface MemoRange {
  readonly from: number;
  readonly to: number;
}

export function findNativeHighlightElement(
  root: HTMLElement,
  range: MemoRange,
  posAtDOM: (node: Node, offset: number) => number,
): HTMLElement | null {
  for (const mark of root.querySelectorAll<HTMLElement>('mark')) {
    const from = posAtDOM(mark, 0);
    const to = posAtDOM(mark, mark.childNodes.length);
    if (from < range.to && to > range.from) return mark;
  }
  return null;
}

interface MemoHighlightPluginState {
  readonly memoState: DocumentMemoState;
  readonly nativeHighlights: readonly NativeDocumentHighlight[];
  readonly annotationBodies: ReadonlyMap<string, string>;
  readonly activeMemoId: string | null;
  readonly decorations: DecorationSet;
  readonly ranges: ReadonlyMap<string, MemoRange>;
}

interface MemoHighlightMeta {
  readonly memoState?: DocumentMemoState;
  readonly activeMemoId?: string | null;
}

export const memoHighlightPluginKey = new PluginKey<MemoHighlightPluginState>('memoHighlights');

interface FlatDocument {
  readonly text: string;
  readonly from: readonly number[];
  readonly to: readonly number[];
}

/**
 * Best-effort renderer for memo quotes saved before text anchors existed.
 * These records contain serialized Markdown (for example `**important**`),
 * while ProseMirror exposes the rendered text (`important`). Keep this
 * deliberately conservative: a candidate is only used when it exactly occurs
 * in the current document, so unsupported syntax simply produces no mark.
 */
export function legacyMemoQuoteText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]+?)`+/g, '$1')
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '$1')
    .replace(/___(?=\S)([\s\S]*?\S)___/g, '$1')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '$1')
    .replace(/__(?=\S)([\s\S]*?\S)__/g, '$1')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '$1')
    .replace(/_(?=\S)([\s\S]*?\S)_/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\\([\\`*{}[\]()#+\-.!_>])/g, '$1')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Flatten rendered textblocks while retaining a PM position for every glyph. */
function flattenDocument(doc: ProseMirrorNode): FlatDocument {
  const chunks: Array<{ text: string; from: number[]; to: number[] }> = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text: string[] = [];
    const from: number[] = [];
    const to: number[] = [];
    node.descendants((child, childPos) => {
      const absolute = pos + 1 + childPos;
      if (child.isText && child.text) {
        for (let index = 0; index < child.text.length; index += 1) {
          text.push(child.text[index] ?? '');
          from.push(absolute + index);
          to.push(absolute + index + 1);
        }
      } else if (child.isInline && child.isLeaf) {
        text.push('\uFFFC');
        from.push(absolute);
        to.push(absolute + child.nodeSize);
      }
      return !child.isText;
    });
    chunks.push({ text: text.join(''), from, to });
    return false;
  });

  const text: string[] = [];
  const from: number[] = [];
  const to: number[] = [];
  for (const chunk of chunks) {
    if (text.length > 0) {
      text.push('\n');
      from.push(to.at(-1) ?? 0);
      to.push(chunk.from[0] ?? to.at(-1) ?? 0);
    }
    text.push(chunk.text);
    from.push(...chunk.from);
    to.push(...chunk.to);
  }
  return { text: text.join(''), from, to };
}

function contextScore(flat: FlatDocument, index: number, anchor: DocumentMemoAnchor): number {
  const before = flat.text.slice(Math.max(0, index - anchor.prefix.length), index);
  const after = flat.text.slice(
    index + anchor.exact.length,
    index + anchor.exact.length + anchor.suffix.length,
  );
  let score = 0;
  for (let length = 1; length <= anchor.prefix.length; length += 1) {
    if (before.endsWith(anchor.prefix.slice(-length))) score = length;
  }
  for (let length = 1; length <= anchor.suffix.length; length += 1) {
    if (after.startsWith(anchor.suffix.slice(0, length))) score += length;
  }
  return score;
}

/** Resolve a stored quote against the current rendered document. */
export function resolveMemoAnchor(
  doc: ProseMirrorNode,
  anchor: DocumentMemoAnchor,
): MemoRange | null {
  if (anchor.surface !== 'wysiwyg' || anchor.exact === '') return null;
  if (
    anchor.from >= 0 &&
    anchor.to <= doc.content.size &&
    anchor.from < anchor.to &&
    doc.textBetween(anchor.from, anchor.to, '\n', '\uFFFC') === anchor.exact
  ) {
    return { from: anchor.from, to: anchor.to };
  }

  const flat = flattenDocument(doc);
  let index = flat.text.indexOf(anchor.exact);
  let bestIndex = -1;
  let bestScore = -1;
  while (index !== -1) {
    const score = contextScore(flat, index, anchor);
    const distance = Math.abs((flat.from[index] ?? 0) - anchor.from);
    const bestDistance = Math.abs((flat.from[bestIndex] ?? 0) - anchor.from);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      bestIndex = index;
      bestScore = score;
    }
    index = flat.text.indexOf(anchor.exact, index + 1);
  }
  if (bestIndex < 0) return null;
  const endIndex = bestIndex + anchor.exact.length - 1;
  const from = flat.from[bestIndex];
  const to = flat.to[endIndex];
  return from === undefined || to === undefined || from >= to ? null : { from, to };
}

function nativeHighlightId(from: number, to: number, text: string): string {
  let hash = 0x811c9dc5;
  const input = `${from}:${to}:${text}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `native-highlight-${(hash >>> 0).toString(36)}`;
}

export function collectNativeHighlights(doc: ProseMirrorNode): readonly NativeDocumentHighlight[] {
  const highlightMark = doc.type.schema.marks.highlight;
  if (!highlightMark) return [];
  const ranges: MemoRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.marks.some((mark) => mark.type === highlightMark)) return true;
    const previous = ranges.at(-1);
    const to = pos + node.nodeSize;
    if (previous?.to === pos) ranges[ranges.length - 1] = { from: previous.from, to };
    else ranges.push({ from: pos, to });
    return true;
  });
  return ranges.map(({ from, to }) => {
    const exact = doc.textBetween(from, to, '\n', '\uFFFC');
    const anchor: DocumentMemoAnchor = {
      surface: 'wysiwyg',
      exact,
      prefix: doc.textBetween(Math.max(0, from - 48), from, '\n', '\uFFFC'),
      suffix: doc.textBetween(to, Math.min(doc.content.size, to + 48), '\n', '\uFFFC'),
      from,
      to,
    };
    return {
      id: nativeHighlightId(from, to, exact),
      quote: { markdown: exact, anchor },
      from,
      to,
    };
  });
}

function buildPluginState(
  doc: ProseMirrorNode,
  memoState: DocumentMemoState,
  activeMemoId: string | null,
): MemoHighlightPluginState {
  const decorations: Decoration[] = [];
  const ranges = new Map<string, MemoRange>();
  const annotationBodies = new Map<string, string>();
  const nativeHighlights = collectNativeHighlights(doc);
  for (const highlight of nativeHighlights) {
    ranges.set(highlight.id, { from: highlight.from, to: highlight.to });
  }
  for (const memo of memoState.items) {
    if (isDocumentHighlight(memo)) continue;
    const range = resolveMemoRange(doc, memo);
    if (!range) continue;
    if (memo.target === 'highlight') {
      const highlight = nativeHighlights.find(
        (entry) => entry.from < range.to && entry.to > range.from,
      );
      if (highlight) annotationBodies.set(highlight.id, memo.body);
      continue;
    }
    ranges.set(memo.id, range);
    annotationBodies.set(memo.id, memo.body);
    decorations.push(
      Decoration.inline(range.from, range.to, {
        class:
          activeMemoId === memo.id
            ? 'ok-memo-highlight ok-memo-highlight-memo ok-memo-highlight-active'
            : 'ok-memo-highlight ok-memo-highlight-memo',
        'data-memo-highlight-id': memo.id,
      }),
    );
  }
  return {
    memoState,
    nativeHighlights,
    annotationBodies,
    activeMemoId,
    decorations: DecorationSet.create(doc, decorations),
    ranges,
  };
}

function resolveMemoRange(doc: ProseMirrorNode, memo: DocumentMemoEntry): MemoRange | null {
  if (!memo.quote) return null;
  // Version-2 memo records created before text anchors shipped still carry
  // the selected Markdown. Plain-prose quotes can therefore be recovered
  // exactly; formatted legacy quotes simply remain unmarked rather than
  // risking a highlight on unrelated rendered text.
  const anchor =
    memo.quote.anchor ??
    (memo.quote.sourceLineStart === undefined
      ? {
          surface: 'wysiwyg' as const,
          exact: legacyMemoQuoteText(memo.quote.markdown),
          prefix: '',
          suffix: '',
          from: -1,
          to: -1,
        }
      : null);
  return anchor ? resolveMemoAnchor(doc, anchor) : null;
}

/** Convert interim local highlight records to canonical native Highlight marks. */
function migrateLegacyHighlightEntries(
  view: EditorView,
  docName: string,
  memoState: DocumentMemoState,
): void {
  const legacy = memoState.items.filter(isDocumentHighlight);
  if (legacy.length === 0) return;
  const highlightMark = view.state.schema.marks.highlight;
  if (!highlightMark) return;
  const transaction = view.state.tr;
  const migratedIds = new Set<string>();
  for (const entry of legacy) {
    const range = resolveMemoRange(transaction.doc, entry);
    if (!range) continue;
    transaction.addMark(range.from, range.to, highlightMark.create());
    migratedIds.add(entry.id);
  }
  if (migratedIds.size === 0) return;
  view.dispatch(transaction);
  writeDocumentMemoState(docName, {
    ...memoState,
    items: memoState.items.filter((entry) => !migratedIds.has(entry.id)),
  });
}

export function memoHighlightPlugin(docName: string): Plugin<MemoHighlightPluginState> {
  return new Plugin<MemoHighlightPluginState>({
    key: memoHighlightPluginKey,
    state: {
      init: (_config, state) => buildPluginState(state.doc, readDocumentMemoState(docName), null),
      apply: (transaction, previous) => {
        const meta = transaction.getMeta(memoHighlightPluginKey) as MemoHighlightMeta | undefined;
        if (!transaction.docChanged && meta === undefined) return previous;
        return buildPluginState(
          transaction.doc,
          meta?.memoState ?? previous.memoState,
          meta?.activeMemoId === undefined ? previous.activeMemoId : meta.activeMemoId,
        );
      },
    },
    props: {
      decorations: (state) => memoHighlightPluginKey.getState(state)?.decorations ?? null,
    },
    view: (view) => {
      let clearActiveTimer: ReturnType<typeof setTimeout> | null = null;
      let activeNativeElement: HTMLElement | null = null;
      let publishedSignature: string | null = null;
      const tooltip = view.dom.ownerDocument.createElement('div');
      tooltip.className = 'ok-memo-tooltip';
      tooltip.hidden = true;
      tooltip.setAttribute('role', 'tooltip');
      view.dom.ownerDocument.body.append(tooltip);

      const annotationFromTarget = (
        target: EventTarget | null,
      ): { id: string; element: HTMLElement } | null => {
        if (!(target instanceof Element)) return null;
        const memoMarker = target.closest<HTMLElement>('[data-memo-highlight-id]');
        if (memoMarker?.dataset.memoHighlightId) {
          return { id: memoMarker.dataset.memoHighlightId, element: memoMarker };
        }
        const mark = target.closest<HTMLElement>('mark');
        if (!mark || !view.dom.contains(mark)) return null;
        const position = view.posAtDOM(mark, 0);
        const highlight = memoHighlightPluginKey
          .getState(view.state)
          ?.nativeHighlights.find((entry) => entry.from <= position && position < entry.to);
        return highlight ? { id: highlight.id, element: mark } : null;
      };
      const hideTooltip = () => {
        tooltip.hidden = true;
        tooltip.textContent = '';
      };
      const showTooltip = (annotation: { id: string; element: HTMLElement }) => {
        const body = memoHighlightPluginKey
          .getState(view.state)
          ?.annotationBodies.get(annotation.id)
          ?.trim();
        if (!body) return hideTooltip();
        tooltip.textContent = body;
        tooltip.hidden = false;
        const rect = annotation.element.getBoundingClientRect();
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - tooltip.offsetWidth - margin);
        tooltip.style.left = `${Math.min(Math.max(margin, rect.left), maxLeft)}px`;
        const above = rect.top - tooltip.offsetHeight - margin;
        tooltip.style.top = `${above >= margin ? above : rect.bottom + margin}px`;
      };
      const onMouseOver = (event: MouseEvent) => {
        const annotation = annotationFromTarget(event.target);
        if (annotation) showTooltip(annotation);
      };
      const onMouseOut = (event: MouseEvent) => {
        const annotation = annotationFromTarget(event.target);
        const related = annotationFromTarget(event.relatedTarget);
        if (annotation && annotation.id !== related?.id) {
          hideTooltip();
        }
      };
      const onMouseDown = (event: MouseEvent) => {
        if (annotationFromTarget(event.target)) event.preventDefault();
      };
      const onClick = (event: MouseEvent) => {
        const annotation = annotationFromTarget(event.target);
        if (!annotation) return;
        event.preventDefault();
        hideTooltip();
        requestMemoReveal({ docName, memoId: annotation.id });
      };
      const publishHighlights = () => {
        const highlights = memoHighlightPluginKey.getState(view.state)?.nativeHighlights ?? [];
        const signature = highlights.map((entry) => entry.id).join('|');
        if (signature === publishedSignature) return;
        publishedSignature = signature;
        publishNativeDocumentHighlights(docName, highlights);
      };
      view.dom.addEventListener('mouseover', onMouseOver);
      view.dom.addEventListener('mouseout', onMouseOut);
      view.dom.addEventListener('mousedown', onMouseDown);
      view.dom.addEventListener('click', onClick);
      const unsubscribeState = subscribeDocumentMemoState(docName, (memoState) => {
        view.dispatch(view.state.tr.setMeta(memoHighlightPluginKey, { memoState }));
      });
      queueMicrotask(() => {
        if (!view.isDestroyed) {
          const memoState =
            memoHighlightPluginKey.getState(view.state)?.memoState ??
            readDocumentMemoState(docName);
          migrateLegacyHighlightEntries(view, docName, memoState);
          publishHighlights();
        }
      });
      const unsubscribeMutations = subscribeNativeHighlightMutations((request) => {
        if (request.docName !== docName) return;
        const range = resolveMemoAnchor(view.state.doc, request.anchor);
        const highlightMark = view.state.schema.marks.highlight;
        if (!range || !highlightMark) return;
        const transaction = view.state.tr;
        if (request.action === 'add') {
          transaction.addMark(range.from, range.to, highlightMark.create());
        } else {
          transaction.removeMark(range.from, range.to, highlightMark);
        }
        view.dispatch(transaction);
      });
      const unsubscribeNavigation = subscribeMemoNavigation((request) => {
        if (request.docName !== docName) return;
        const range = memoHighlightPluginKey.getState(view.state)?.ranges.get(request.memoId);
        if (!range) return;
        view.dispatch(
          view.state.tr.setMeta(memoHighlightPluginKey, {
            activeMemoId: request.memoId,
          }),
        );
        requestAnimationFrame(() => {
          let highlight = view.dom.querySelector<HTMLElement>(
            `[data-memo-highlight-id="${CSS.escape(request.memoId)}"]`,
          );
          if (!highlight) {
            highlight = findNativeHighlightElement(view.dom, range, (node, offset) =>
              view.posAtDOM(node, offset),
            );
            if (highlight) {
              activeNativeElement?.classList.remove('ok-memo-highlight-active');
              activeNativeElement = highlight;
              highlight.classList.add('ok-memo-highlight-active');
            }
          }
          highlight?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest',
          });
        });
        if (clearActiveTimer !== null) clearTimeout(clearActiveTimer);
        clearActiveTimer = setTimeout(() => {
          if (view.isDestroyed) return;
          activeNativeElement?.classList.remove('ok-memo-highlight-active');
          activeNativeElement = null;
          view.dispatch(
            view.state.tr.setMeta(memoHighlightPluginKey, {
              activeMemoId: null,
            }),
          );
        }, 1_600);
      });
      return {
        update: () => publishHighlights(),
        destroy: () => {
          unsubscribeState();
          unsubscribeNavigation();
          unsubscribeMutations();
          activeNativeElement?.classList.remove('ok-memo-highlight-active');
          view.dom.removeEventListener('mouseover', onMouseOver);
          view.dom.removeEventListener('mouseout', onMouseOut);
          view.dom.removeEventListener('mousedown', onMouseDown);
          view.dom.removeEventListener('click', onClick);
          tooltip.remove();
          if (clearActiveTimer !== null) clearTimeout(clearActiveTimer);
        },
      };
    },
  });
}

export const MemoHighlights = Extension.create<{ docName: string }>({
  name: 'memoHighlights',
  addOptions: () => ({ docName: '' }),
  addProseMirrorPlugins() {
    return [memoHighlightPlugin(this.options.docName)];
  },
});
