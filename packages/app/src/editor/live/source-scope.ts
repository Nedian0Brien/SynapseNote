import { EditorSelection, type Extension, StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

interface Binding {
  parent: EditorView;
  toParent: (position: number) => number | null;
}
interface Range {
  from: number;
  to: number;
}
const revisions = new WeakMap<EditorView, number>();
function changed(root: EditorView) {
  revisions.set(root, (revisions.get(root) ?? 0) + 1);
}
const bindings = new WeakMap<EditorView, Binding>();
const children = new WeakMap<EditorView, Set<EditorView>>();
const lastFocused = new WeakMap<EditorView, EditorView>();
const revealers = new WeakMap<EditorView, Set<(range: Range) => boolean>>();
export const sourceActorChanged = StateEffect.define<boolean>();
export const sourceScopeChanged = StateEffect.define<null>();
export function hasSourceBinding(view: EditorView): boolean {
  return bindings.has(view);
}
export function sourceRoot(view: EditorView): EditorView {
  let current = view;
  while (bindings.has(current)) current = bindings.get(current)?.parent ?? current;
  return current;
}
export function bindSourceScope(
  child: EditorView,
  parent: EditorView,
  toParent: Binding['toParent'],
): void {
  const existing = bindings.get(child);
  if (existing) children.get(existing.parent)?.delete(child);
  bindings.set(child, { parent, toParent });
  const family = children.get(parent) ?? new Set<EditorView>();
  family.add(child);
  children.set(parent, family);
  changed(sourceRoot(parent));
  child.dispatch({ effects: sourceScopeChanged.of(null) });
}
function unbind(view: EditorView) {
  const binding = bindings.get(view);
  if (binding) children.get(binding.parent)?.delete(view);
  const root = sourceRoot(view);
  if (lastFocused.get(root) === view) lastFocused.delete(root);
  changed(root);
  bindings.delete(view);
  children.delete(view);
  revealers.delete(view);
}
export function positionInSourceRoot(view: EditorView, position: number): number | null {
  let current = view;
  let at: number | null = position;
  while (bindings.has(current) && at !== null) {
    const binding = bindings.get(current);
    if (!binding) break;
    at = binding.toParent(at);
    current = binding.parent;
  }
  return at;
}
export function sourceSelection(
  view: EditorView,
): { view: EditorView; selection: EditorSelection } | null {
  const root = sourceRoot(view);
  if (root === view) return { view, selection: view.state.selection };
  const ranges = view.state.selection.ranges.map((range) => {
    const anchor = positionInSourceRoot(view, range.anchor);
    const head = positionInSourceRoot(view, range.head);
    return anchor === null || head === null ? null : EditorSelection.range(anchor, head);
  });
  if (ranges.some((range) => range === null)) return null;
  return {
    view: root,
    selection: EditorSelection.create(
      ranges.filter((range) => range !== null),
      view.state.selection.mainIndex,
    ),
  };
}
function family(root: EditorView): EditorView[] {
  const result: EditorView[] = [root];
  for (const child of children.get(root) ?? []) result.push(...family(child));
  return result;
}
export function activeSourceSelection(view: EditorView): {
  view: EditorView;
  selection: EditorSelection;
} {
  const root = sourceRoot(view);
  if (root !== view)
    return sourceSelection(view) ?? { view: root, selection: root.state.selection };
  const active = root.dom?.ownerDocument.activeElement;
  const actor = active?.classList.contains('cm-content')
    ? EditorView.findFromDOM(active as HTMLElement)
    : null;
  const focused = actor && sourceRoot(actor) === root ? actor : undefined;
  if (focused) lastFocused.set(root, focused);
  const previous = lastFocused.get(root);
  const target =
    focused ??
    (previous && sourceRoot(previous) === root && previous.dom.isConnected ? previous : view);
  return sourceSelection(target) ?? { view: root, selection: root.state.selection };
}
function localPosition(view: EditorView, rootPosition: number, association: 1 | -1): number | null {
  let low = 0;
  let high = view.state.doc.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const mapped = positionInSourceRoot(view, mid);
    if (mapped === null) return null;
    if (mapped < rootPosition) low = mid + 1;
    else high = mid;
  }
  const at = positionInSourceRoot(view, low);
  if (at === null) return null;
  return at > rootPosition && association === -1 ? Math.max(0, low - 1) : low;
}
export function sourceRangeInView(view: EditorView, range: Range, clip = false): Range | null {
  const first = positionInSourceRoot(view, 0);
  const last = positionInSourceRoot(view, view.state.doc.length);
  if (first === null || last === null || range.to < first || range.from > last) return null;
  if (!clip && (range.from < first || range.to > last)) return null;
  const from = localPosition(view, Math.max(first, range.from), 1);
  const to = localPosition(view, Math.min(last, range.to), -1);
  return from === null || to === null || from > to ? null : { from, to };
}
export function registerSourceReveal(
  view: EditorView,
  reveal: (range: Range) => boolean,
): () => void {
  const list = revealers.get(view) ?? new Set();
  list.add(reveal);
  revealers.set(view, list);
  return () => list.delete(reveal);
}
export function focusSourceRange(
  view: EditorView,
  getRange: () => Range | undefined,
  previousRevision = -1,
  stalled = 0,
): void {
  const root = sourceRoot(view);
  const range = getRange();
  if (!range || !root.dom.isConnected) return;
  let revealed = false;
  for (const candidate of family(root)) {
    const local = sourceRangeInView(candidate, range, true);
    if (!local) continue;
    for (const reveal of revealers.get(candidate) ?? []) revealed = reveal(local) || revealed;
  }
  if (revealed) {
    const revision = revisions.get(root) ?? 0;
    const waiting = revision === previousRevision ? stalled + 1 : 0;
    // Stop if a paused/absent host cannot render; nesting depth is unrestricted.
    if (waiting < 4)
      requestAnimationFrame(() => focusSourceRange(root, getRange, revision, waiting));
    return;
  }
  const target =
    family(root)
      .filter((candidate) => candidate.dom.isConnected && sourceRangeInView(candidate, range))
      .at(-1) ?? root;
  const local = sourceRangeInView(target, range);
  if (!local) return;
  target.dispatch({ selection: { anchor: local.from, head: local.to }, scrollIntoView: true });
  target.focus();
}
export function createSourceScopeLifecycle(onSelection: (view: EditorView) => void): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      disposed = false;
      queued = false;
      constructor(readonly view: EditorView) {}
      update(update: ViewUpdate) {
        if (
          !update.docChanged &&
          !update.selectionSet &&
          !update.transactions.some((tr) =>
            tr.effects.some((effect) => effect.is(sourceScopeChanged)),
          )
        )
          return;
        if (this.queued) return;
        this.queued = true;
        queueMicrotask(() => {
          this.queued = false;
          if (this.disposed) return;
          const root = sourceRoot(this.view);
          if (root === this.view || this.view.hasFocus || lastFocused.get(root) === this.view)
            onSelection(this.view);
        });
      }
      destroy() {
        this.disposed = true;
        unbind(this.view);
      }
    },
  );
  return [
    plugin,
    EditorView.domEventHandlers({
      focus(event, view) {
        if (event.target !== view.contentDOM) return false;
        const root = sourceRoot(view);
        const previous = lastFocused.get(root);
        lastFocused.set(root, view);
        queueMicrotask(() => {
          if (!view.dom.isConnected || lastFocused.get(root) !== view) return;
          if (previous && previous !== view && previous.dom.isConnected)
            previous.dispatch({ effects: sourceActorChanged.of(false) });
          view.dispatch({ effects: sourceActorChanged.of(true) });
          onSelection(view);
        });
        return false;
      },
    }),
  ];
}
