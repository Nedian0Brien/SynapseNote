import { type Extension, StateEffect } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import {
  type DocumentMemoAnchor,
  type DocumentMemoState,
  readDocumentMemoState,
  subscribeDocumentMemoState,
  writeDocumentMemoState,
} from '@/lib/document-memo-store';
import { requestMemoReveal, subscribeMemoNavigation } from '../memo-navigation';
import { migrateMemoAnchors } from './memo-anchor-migration';
import {
  focusSourceRange,
  hasSourceBinding,
  sourceRangeInView,
  sourceRoot,
  sourceScopeChanged,
} from './source-scope';

export function resolveSourceMemoAnchor(
  source: string,
  anchor: DocumentMemoAnchor,
): { from: number; to: number } | null {
  if (anchor.surface !== 'source' || !anchor.exact) return null;
  if (anchor.from >= 0 && source.slice(anchor.from, anchor.to) === anchor.exact)
    return { from: anchor.from, to: anchor.to };
  let at = source.indexOf(anchor.exact);
  let best = -1;
  let bestScore = -1;
  while (at !== -1) {
    const before = source.slice(Math.max(0, at - anchor.prefix.length), at);
    const after = source.slice(
      at + anchor.exact.length,
      at + anchor.exact.length + anchor.suffix.length,
    );
    let score = 0;
    for (let n = 1; n <= anchor.prefix.length; n++)
      if (before.endsWith(anchor.prefix.slice(-n))) score = n;
    for (let n = 1; n <= anchor.suffix.length; n++)
      if (after.startsWith(anchor.suffix.slice(0, n))) score += n;
    if (
      score > bestScore ||
      (score === bestScore && Math.abs(at - anchor.from) < Math.abs(best - anchor.from))
    ) {
      best = at;
      bestScore = score;
    }
    at = source.indexOf(anchor.exact, at + 1);
  }
  return best < 0 ? null : { from: best, to: best + anchor.exact.length };
}
const rootRanges = new WeakMap<EditorView, Map<string, { from: number; to: number }>>();
const refreshMemos = StateEffect.define<null>();
export function createSourceMemos(docName: string, nested = false): Extension {
  return ViewPlugin.fromClass(
    class {
      disposed = false;
      state: DocumentMemoState = readDocumentMemoState(docName);
      ranges = new Map<string, { from: number; to: number }>();
      decorations: DecorationSet = Decoration.none;
      stopStore: () => void;
      stopNavigation: () => void;
      constructor(readonly view: EditorView) {
        if (!nested) rootRanges.set(view, this.ranges);
        this.rebuild();
        this.stopStore = subscribeDocumentMemoState(docName, (state) => {
          this.state = state;
          this.view.dispatch({ effects: refreshMemos.of(null) });
        });
        this.stopNavigation = nested
          ? () => {}
          : subscribeMemoNavigation((request) => {
              if (request.docName !== docName || !view.dom.isConnected) return;
              const range = this.ranges.get(request.memoId);
              if (!range || range.from >= range.to) return;
              focusSourceRange(view, () => this.ranges.get(request.memoId));
            });
      }
      rebuild() {
        this.ranges.clear();
        if (nested) {
          if (hasSourceBinding(this.view)) {
            for (const [id, range] of rootRanges.get(sourceRoot(this.view)) ?? []) {
              const local = sourceRangeInView(this.view, range, true);
              if (local && local.from < local.to) this.ranges.set(id, local);
            }
          }
          this.draw();
          return;
        }
        const source = this.view.state.doc.toString();
        const migration = migrateMemoAnchors(source, this.state);
        if (migration.changed) {
          this.state = migration.state;
          const snapshot = this.state;
          // Store listeners may dispatch; defer beyond the view's construction/update.
          queueMicrotask(() => {
            if (!this.disposed && this.state === snapshot)
              writeDocumentMemoState(docName, snapshot);
          });
        }
        for (const memo of this.state.items) {
          const anchor = memo.quote?.anchor;
          const range = anchor ? resolveSourceMemoAnchor(source, anchor) : null;
          if (range) this.ranges.set(memo.id, range);
        }
        this.draw();
      }
      draw() {
        this.decorations = Decoration.set(
          [...this.ranges]
            .filter(([, range]) => range.from < range.to)
            .map(([id, range]) =>
              Decoration.mark({
                class: 'ok-memo-highlight ok-memo-highlight-memo',
                attributes: { 'data-memo-highlight-id': id },
              }).range(range.from, range.to),
            ),
          true,
        );
      }
      update(update: ViewUpdate) {
        if (
          update.transactions.some((tr) =>
            tr.effects.some((effect) => effect.is(refreshMemos) || effect.is(sourceScopeChanged)),
          )
        )
          this.rebuild();
        else if (update.docChanged) {
          for (const range of this.ranges.values()) {
            range.from = update.changes.mapPos(range.from, 1);
            range.to = update.changes.mapPos(range.to, -1);
          }
          this.draw();
        }
      }
      destroy() {
        this.disposed = true;
        if (!nested) rootRanges.delete(this.view);
        this.stopStore();
        this.stopNavigation();
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      eventHandlers: {
        click(event) {
          const marker =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>('[data-memo-highlight-id]')
              : null;
          const id = marker?.dataset.memoHighlightId;
          if (!id) return false;
          requestMemoReveal({ docName, memoId: id });
          return false;
        },
      },
    },
  );
}
