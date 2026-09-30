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
} from '@/lib/document-memo-store';
import { requestMemoReveal, subscribeMemoNavigation } from '../memo-navigation';

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
const refreshMemos = StateEffect.define<null>();
export function createSourceMemos(docName: string): Extension {
  return ViewPlugin.fromClass(
    class {
      state: DocumentMemoState = readDocumentMemoState(docName);
      ranges = new Map<string, { from: number; to: number }>();
      decorations: DecorationSet = Decoration.none;
      stopStore: () => void;
      stopNavigation: () => void;
      constructor(readonly view: EditorView) {
        this.rebuild();
        this.stopStore = subscribeDocumentMemoState(docName, (state) => {
          this.state = state;
          this.view.dispatch({ effects: refreshMemos.of(null) });
        });
        this.stopNavigation = subscribeMemoNavigation((request) => {
          if (request.docName !== docName || !view.dom.isConnected) return;
          const range = this.ranges.get(request.memoId);
          if (!range) return;
          view.dispatch({
            selection: { anchor: range.from, head: range.to },
            scrollIntoView: true,
          });
          view.focus();
        });
      }
      rebuild() {
        this.ranges.clear();
        const source = this.view.state.doc.toString();
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
        if (update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refreshMemos))))
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
