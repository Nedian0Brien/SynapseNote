/**
 * Live editing mode: CodeMirror over the Markdown source with the syntax
 * hidden (packages/core/src/editing-model/SPEC.md).
 *
 * The source (Y.Text through yCollab) stays the only thing edited. Layout
 * comes from the core parser through `IncrementalLayout`; typing, keys,
 * formatting shortcuts, paste and copy go through the core editing model
 * (`applyActionsInWindow`), whose result is sent back as minimal changes.
 * Blocks (tables, code, math, components) still show their source until
 * their widgets land.
 */

import { type Extension, Prec, RangeSet, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import {
  applyActionsInWindow,
  type EditAction,
  type EditState,
  IncrementalLayout,
  type MarkType,
  sourceChanges,
  type ToggleMark,
} from '@nedian0brien/synapsenote-core';

// ── state ───────────────────────────────────────────────────────────────────

/** The document's layout, kept current by re-parsing only the edited blocks. */
const layoutField = StateField.define<IncrementalLayout>({
  create: (state) => new IncrementalLayout(state.doc.toString()),
  update(layout, tr) {
    if (tr.docChanged) layout.update(tr.newDoc.toString());
    return layout;
  },
});

interface CursorIntent {
  side: EditState['side'];
  pending: ToggleMark[];
}

const setCursorIntent = StateEffect.define<CursorIntent>();

/** Which side of a mark boundary the next input goes to, and marks toggled on with no selection. */
const cursorIntentField = StateField.define<CursorIntent>({
  create: () => ({ side: 'default', pending: [] }),
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setCursorIntent)) return effect.value;
    if (tr.selection || tr.docChanged) return { side: 'default', pending: [] };
    return value;
  },
});

// ── running the editing model ───────────────────────────────────────────────

function run(
  view: EditorView,
  actions: EditAction[],
  selection = view.state.selection.main,
  userEvent = 'input',
): boolean {
  const { state } = view;
  const layout = state.field(layoutField);
  const source = state.doc.toString();
  if (layout.source !== source) layout.update(source);
  const intent = state.field(cursorIntentField);
  const result = applyActionsInWindow(
    layout,
    {
      source,
      anchor: selection.anchor,
      head: selection.head,
      side: intent.side,
      pending: intent.pending,
    },
    actions,
  );
  view.dispatch({
    changes: sourceChanges(source, result.source),
    selection: { anchor: result.anchor, head: result.head },
    effects: setCursorIntent.of({ side: result.side, pending: result.pending }),
    userEvent,
    scrollIntoView: true,
  });
  return true;
}

const key = (k: Extract<EditAction, { type: 'key' }>['key']) => (view: EditorView) =>
  run(
    view,
    [{ type: 'key', key: k }],
    undefined,
    k === 'Backspace' || k === 'Delete' ? 'delete' : 'input',
  );
const toggle = (mark: ToggleMark) => (view: EditorView) =>
  run(view, [{ type: 'toggle', mark }], undefined, 'input.format');

const liveKeymap = keymap.of([
  { key: 'Backspace', run: key('Backspace') },
  { key: 'Delete', run: key('Delete') },
  { key: 'Enter', run: key('Enter') },
  { key: 'Shift-Enter', run: key('Shift-Enter') },
  { key: 'Tab', run: key('Tab') },
  { key: 'Shift-Tab', run: key('Shift-Tab') },
  { key: 'ArrowLeft', run: (view) => view.state.selection.main.empty && key('ArrowLeft')(view) },
  { key: 'ArrowRight', run: (view) => view.state.selection.main.empty && key('ArrowRight')(view) },
  { key: 'Mod-b', run: toggle('bold') },
  { key: 'Mod-i', run: toggle('italic') },
  { key: 'Mod-e', run: toggle('code') },
  { key: 'Mod-Shift-x', run: toggle('strike') },
  { key: 'Mod-Shift-h', run: toggle('highlight') },
]);

const liveInput = EditorView.inputHandler.of((view, from, to, text) => {
  // IME composition: CodeMirror applies it as typed; the layout catches up
  // when the composition ends (SPEC.md §9).
  if (view.composing) return false;
  return run(view, [{ type: 'text', text }], { anchor: from, head: to } as never, 'input.type');
});

const liveClipboard = EditorView.domEventHandlers({
  paste(event, view) {
    const data = event.clipboardData;
    if (!data) return false;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    event.preventDefault();
    if (html) return run(view, [{ type: 'paste', html }], undefined, 'input.paste');
    return run(view, [{ type: 'paste', text }], undefined, 'input.paste');
  },
  copy(event, view) {
    const { from, to } = view.state.selection.main;
    if (from === to || !event.clipboardData) return false;
    const markdown = view.state.sliceDoc(from, to);
    event.clipboardData.setData('text/plain', markdown);
    event.clipboardData.setData('text/markdown', markdown);
    event.preventDefault();
    return true;
  },
});

// ── drawing ─────────────────────────────────────────────────────────────────

const MARK_CLASS: Record<MarkType, string> = {
  strong: 'cm-live-strong',
  emphasis: 'cm-live-emphasis',
  delete: 'cm-live-delete',
  mark: 'cm-live-highlight',
  inlineCode: 'cm-live-code',
  link: 'cm-live-link',
  linkReference: 'cm-live-link',
  wikiLink: 'cm-live-link',
};

class ListMarkerWidget extends WidgetType {
  constructor(
    readonly marker: string,
    readonly from: number,
  ) {
    super();
  }

  eq(other: ListMarkerWidget): boolean {
    return other.marker === this.marker && other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const task = /\[([ xX])\]/.exec(this.marker);
    if (task) {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'cm-live-task';
      box.checked = task[1] !== ' ';
      box.setAttribute('aria-label', 'Task');
      box.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const at = this.from + (task.index ?? 0) + 1;
        view.dispatch({
          changes: { from: at, to: at + 1, insert: box.checked ? ' ' : 'x' },
          userEvent: 'input.toggle',
        });
      });
      return box;
    }
    const span = document.createElement('span');
    span.className = 'cm-live-list-marker';
    const ordered = /(\d+[.)])/.exec(this.marker);
    span.textContent = ordered ? ordered[1] : '•';
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class CharacterWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: CharacterWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.textContent = this.text;
    return span;
  }
}

function decodeReference(reference: string): string {
  const el = document.createElement('textarea');
  el.innerHTML = reference;
  return el.value;
}

interface Drawn {
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
}

function draw(view: EditorView): Drawn {
  const layout = view.state.field(layoutField);
  const doc = view.state.doc;
  const replaced: { from: number; to: number; deco: Decoration }[] = [];
  const styled: { from: number; to: number; deco: Decoration }[] = [];
  const lines = new Map<number, string>();
  const margin = 2000;
  const visible = view.visibleRanges.map((r) => [
    Math.max(0, r.from - margin),
    Math.min(doc.length, r.to + margin),
  ]);
  const inView = (from: number, to: number) => visible.some(([a, b]) => from <= b && to >= a);

  for (const block of layout.blocks) {
    if (!inView(block.from, block.to)) continue;
    const { hidden, widgets, marks, spans } = block.layout;
    for (const h of hidden) {
      replaced.push({ from: h.from, to: h.to, deco: Decoration.replace({}) });
      if (h.kind === 'prefix') {
        const text = doc.sliceString(h.from, h.to);
        const heading = /^ {0,3}(#{1,6})/.exec(text);
        const line = doc.lineAt(h.from).from;
        lines.set(line, heading ? `cm-live-h${heading[1].length}` : 'cm-live-quote');
      }
    }
    for (const w of widgets) {
      if (w.kind === 'list-marker') {
        replaced.push({
          from: w.from,
          to: w.to,
          deco: Decoration.replace({
            widget: new ListMarkerWidget(doc.sliceString(w.from, w.to), w.from),
          }),
        });
        lines.set(doc.lineAt(w.from).from, 'cm-live-list-item');
      } else if (w.kind === 'entity') {
        replaced.push({
          from: w.from,
          to: w.to,
          deco: Decoration.replace({
            widget: new CharacterWidget(decodeReference(doc.sliceString(w.from, w.to))),
          }),
        });
      }
    }
    for (const m of marks) {
      if (m.close[0] > m.open[1]) {
        styled.push({
          from: m.open[1],
          to: m.close[0],
          deco: Decoration.mark({ class: MARK_CLASS[m.type] }),
        });
      }
    }
    for (const s of spans) {
      styled.push({ from: s.from, to: s.to, deco: Decoration.mark({ class: 'cm-live-tag' }) });
    }
  }
  const lineDecos = [...lines].map(([from, cls]) => Decoration.line({ class: cls }).range(from));
  const atomic = Decoration.set(
    replaced.map((r) => r.deco.range(r.from, r.to)),
    true,
  );
  const decorations = Decoration.set(
    [
      ...lineDecos,
      ...replaced.map((r) => r.deco.range(r.from, r.to)),
      ...styled.map((s) => s.deco.range(s.from, s.to)),
    ],
    true,
  );
  return { decorations, atomic };
}

const livePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomic: RangeSet<Decoration>;
    composing = false;

    constructor(view: EditorView) {
      ({ decorations: this.decorations, atomic: this.atomic } = draw(view));
    }

    update(update: ViewUpdate): void {
      if (update.view.composing) {
        // Keep the drawing still while an IME composes (SPEC.md §9).
        this.composing = true;
        this.decorations = this.decorations.map(update.changes);
        this.atomic = this.atomic.map(update.changes);
        return;
      }
      if (update.docChanged || update.viewportChanged || this.composing) {
        this.composing = false;
        ({ decorations: this.decorations, atomic: this.atomic } = draw(update.view));
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomic ?? RangeSet.empty),
  },
);

export function createLiveExtension(): Extension {
  return [
    layoutField,
    cursorIntentField,
    livePlugin,
    Prec.highest([liveKeymap, liveInput, liveClipboard]),
    EditorView.editorAttributes.of({ 'data-editor-variant': 'live' }),
  ];
}

/** Exposed for tests: the fields a live view carries. */
export const liveFields = { layoutField, cursorIntentField };
