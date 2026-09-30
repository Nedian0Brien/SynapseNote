/**
 * Live editing mode: CodeMirror over the Markdown source with the syntax
 * hidden (packages/core/src/editing-model/SPEC.md).
 *
 * The source (Y.Text through yCollab) stays the only thing edited. Layout
 * comes from the core parser through `IncrementalLayout`; typing, keys,
 * formatting shortcuts, paste and copy go through the core editing model
 * (`applyActionsInWindow`), whose result is sent back as minimal changes.
 * Code fences, tables, math and Mermaid use editable block widgets. Remaining block types
 * keep their source until their P3 widgets land.
 */

import {
  acceptCompletion,
  autocompletion,
  type CompletionContext,
  closeCompletion,
  completionStatus,
  moveCompletionSelection,
} from '@codemirror/autocomplete';
import {
  EditorSelection,
  EditorState,
  type Extension,
  Facet,
  Prec,
  RangeSet,
  StateEffect,
  StateField,
  Transaction,
} from '@codemirror/state';
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
  type BlockKind,
  containerWidgetSource,
  diagramWidgetSource,
  type EditAction,
  type EditState,
  IncrementalLayout,
  type MarkType,
  mdxWidgetSource,
  mediaWidgetSource,
  referenceDefinitionSource,
  sourceChanges,
  type ToggleMark,
  tabsWidgetSource,
} from '@nedian0brien/synapsenote-core';
import { isMarkdown } from '../clipboard/is-markdown';
import { pasteShiftHeld } from '../clipboard/shift-tracker';
import { createWikiLinkCompletionSource } from '../plugins/wiki-link-source';
import {
  BlockCommentWidget,
  FootnoteDefinitionWidget,
  FootnoteReferenceWidget,
  InlineCommentWidget,
  ThematicBreakWidget,
} from './auxiliary-widgets';
import { CodeBlockWidget, TableBlockWidget } from './block-widgets';
import { ContainerBlockWidget } from './container-widgets';
import { DiagramBlockWidget } from './diagram-widgets';
import { createLiveFormatToolbar } from './format-toolbar';
import { createLiveLinkEditor } from './link-editor';
import { MdxBlockWidget } from './mdx-widgets';
import { MediaBlockWidget, type MediaContext, MediaInlineWidget } from './media-widgets';
import { ReferenceDefinitionWidget } from './reference-widgets';
import { createLiveSlashSuggestions } from './slash-suggestions';
import { TabsBlockWidget } from './tabs-widgets';
import { createLiveTagSuggestions } from './tag-suggestions';
import { createLiveUploads } from './uploads';

const mediaContext = Facet.define<MediaContext, MediaContext>({
  combine: (values) => values.at(-1) ?? {},
});

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
  /** Backspace right after an input rule puts back the typed text (SPEC.md §5). */
  undo?: EditState['undo'];
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

/** Block replacements must be a direct decoration source so they can span lines. */
const blockWidgetField = StateField.define<DecorationSet>({
  create: (state) =>
    blockDecorations(state.field(layoutField), state.doc.toString(), state.facet(mediaContext)),
  update(value, tr) {
    return tr.docChanged || tr.reconfigured
      ? blockDecorations(
          tr.state.field(layoutField),
          tr.newDoc.toString(),
          tr.state.facet(mediaContext),
        )
      : value;
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((view) => view.state.field(field)),
  ],
});

/** Properties are edited through PropertyPanel; user typing cannot rewrite hidden YAML. */
const protectFrontmatter = EditorState.transactionFilter.of((transaction) => {
  if (!transaction.docChanged || !transaction.annotation(Transaction.userEvent)) return transaction;
  const frontmatter = transaction.startState.field(layoutField).frontmatter;
  if (!frontmatter) return transaction;
  let touches = false;
  transaction.changes.iterChangedRanges((from, _to) => {
    if (from < frontmatter[1]) touches = true;
  });
  return touches ? [] : transaction;
});

function blockDecorations(
  layout: IncrementalLayout,
  source: string,
  context: MediaContext,
): DecorationSet {
  const ranges: { from: number; to: number; deco: Decoration }[] = [];
  const nestedExtension = () => createLiveExtension({ ...context, nested: true });
  if (layout.frontmatter) {
    ranges.push({
      from: layout.frontmatter[0],
      to: layout.frontmatter[1],
      deco: Decoration.replace({ block: true }),
    });
  }
  for (const block of layout.blocks) {
    for (const widget of block.layout.widgets) {
      if (widget.kind !== 'block') continue;
      const raw = source.slice(widget.from, widget.to);
      const inner =
        widget.node === 'thematicBreak'
          ? new ThematicBreakWidget()
          : widget.node === 'footnoteDefinition'
            ? new FootnoteDefinitionWidget(raw, widget.from, widget.to, nestedExtension)
            : widget.node === 'commentBlock'
              ? new BlockCommentWidget(raw, widget.from, widget.to, nestedExtension)
              : widget.node === 'table'
                ? new TableBlockWidget(raw, widget.from, widget.to, nestedExtension)
                : widget.node === 'mdxJsxFlowElement' &&
                    mediaWidgetSource(source, widget.from, widget.to)
                  ? new MediaBlockWidget(raw, widget.from, widget.to, context)
                  : widget.node === 'mdxJsxFlowElement' &&
                      containerWidgetSource(source, widget.from, widget.to)
                    ? new ContainerBlockWidget(raw, widget.from, widget.to, nestedExtension)
                    : widget.node === 'mdxJsxFlowElement' &&
                        diagramWidgetSource(source, widget.from, widget.to)
                      ? new DiagramBlockWidget(raw, widget.from, widget.to)
                      : widget.node === 'definition' &&
                          referenceDefinitionSource(source, widget.from, widget.to)
                        ? new ReferenceDefinitionWidget(raw, widget.from, widget.to)
                        : widget.node === 'code'
                          ? new CodeBlockWidget(raw, widget.from, widget.to, context.portalRegistry)
                          : widget.node === 'mdxJsxFlowElement' &&
                              tabsWidgetSource(source, widget.from, widget.to)
                            ? new TabsBlockWidget(
                                raw,
                                widget.from,
                                widget.to,
                                context,
                                nestedExtension,
                              )
                            : widget.node === 'mdxJsxFlowElement' &&
                                mdxWidgetSource(source, widget.from, widget.to)
                              ? new MdxBlockWidget(
                                  raw,
                                  widget.from,
                                  widget.to,
                                  context,
                                  nestedExtension,
                                )
                              : null;
      if (inner) {
        ranges.push({
          from: widget.from,
          to: widget.to,
          deco: Decoration.replace({ block: true, widget: inner }),
        });
      }
    }
  }
  return Decoration.set(
    ranges.map((range) => range.deco.range(range.from, range.to)),
    true,
  );
}

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
      undo: intent.undo,
    },
    actions,
  );
  view.dispatch({
    changes: sourceChanges(source, result.source),
    selection: { anchor: result.anchor, head: result.head },
    effects: setCursorIntent.of({ side: result.side, pending: result.pending, undo: result.undo }),
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
const block = (kind: BlockKind) => (view: EditorView) =>
  run(view, [{ type: 'block', block: kind }], undefined, 'input.format');
const move = (direction: 'up' | 'down') => (view: EditorView) =>
  run(view, [{ type: 'move', direction }], undefined, 'move');

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
  { key: 'Mod-Shift-s', run: toggle('strike') },
  { key: 'Mod-Shift-h', run: toggle('highlight') },
  // Block shortcuts, the same keys as the visual editor (SPEC.md §7).
  { key: 'Mod-Alt-0', run: block('paragraph') },
  { key: 'Mod-Alt-1', run: block('h1') },
  { key: 'Mod-Alt-2', run: block('h2') },
  { key: 'Mod-Alt-3', run: block('h3') },
  { key: 'Mod-Alt-4', run: block('h4') },
  { key: 'Mod-Alt-5', run: block('h5') },
  { key: 'Mod-Alt-6', run: block('h6') },
  { key: 'Mod-Shift-7', run: block('ordered') },
  { key: 'Mod-Shift-8', run: block('bullet') },
  { key: 'Mod-Shift-9', run: block('task') },
  { key: 'Mod-Shift-b', run: block('quote') },
  { key: 'Mod-Alt-c', run: block('code') },
  { key: 'Mod-Shift-ArrowUp', run: move('up') },
  { key: 'Mod-Shift-ArrowDown', run: move('down') },
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
    // The visual editor's order (clipboard/handle-paste.ts): Cmd-Shift-V is
    // plain text, Markdown-shaped text is Markdown, then HTML, then plain text.
    const action: EditAction = pasteShiftHeld(event)
      ? { type: 'paste', text }
      : text && isMarkdown(text)
        ? { type: 'paste', text, as: 'markdown' }
        : html
          ? { type: 'paste', html }
          : { type: 'paste', text };
    return run(view, [action], undefined, 'input.paste');
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
    /** An ordered item's number as Markdown reads it. */
    readonly label: string | undefined,
  ) {
    super();
  }

  eq(other: ListMarkerWidget): boolean {
    return other.marker === this.marker && other.from === this.from && other.label === this.label;
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
    span.textContent = this.label ?? '•';
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
  const context = view.state.facet(mediaContext);
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
            widget: new ListMarkerWidget(doc.sliceString(w.from, w.to), w.from, w.label),
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
      } else if (w.kind === 'inline' && w.node === 'footnoteReference') {
        replaced.push({
          from: w.from,
          to: w.to,
          deco: Decoration.replace({
            widget: new FootnoteReferenceWidget(doc.sliceString(w.from, w.to)),
          }),
        });
      } else if (w.kind === 'inline' && w.node === 'comment') {
        replaced.push({
          from: w.from,
          to: w.to,
          deco: Decoration.replace({
            widget: new InlineCommentWidget(doc.sliceString(w.from, w.to), w.from, w.to),
          }),
        });
      } else if (
        w.kind === 'inline' &&
        (w.node === 'image' || w.node === 'wikiLinkEmbed' || w.node === 'imageReference')
      ) {
        const raw = doc.sliceString(w.from, w.to);
        const model =
          w.node === 'imageReference'
            ? mediaWidgetSource(doc.toString(), w.from, w.to, layout.references)
            : mediaWidgetSource(raw, 0, raw.length);
        if (model) {
          replaced.push({
            from: w.from,
            to: w.to,
            deco: Decoration.replace({
              widget: new MediaInlineWidget(
                raw,
                w.from,
                w.to,
                context,
                w.node === 'imageReference' ? model : undefined,
              ),
            }),
          });
        }
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
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.transactions.some((tr) => tr.reconfigured) ||
        this.composing
      ) {
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

export function createLiveExtension(context: MediaContext = {}): Extension {
  const allowed = (state: EditorState, position: number) => {
    const block = state
      .field(layoutField)
      .blocks.find((item) => item.from <= position && item.to >= position);
    return (
      block?.type !== 'code' &&
      !block?.layout.marks.some(
        (mark) =>
          mark.type === 'inlineCode' && mark.open[0] < position && mark.close[1] >= position,
      )
    );
  };
  const wikiSource = createWikiLinkCompletionSource(context.docName ?? null);
  const guardedWikiSource = (completion: CompletionContext) =>
    allowed(completion.state, completion.pos) ? wikiSource(completion) : null;
  const acceptMenu = (view: EditorView) => {
    if (completionStatus(view.state) !== 'active') return false;
    acceptCompletion(view);
    return true;
  };
  return [
    mediaContext.of(context),
    layoutField,
    blockWidgetField,
    protectFrontmatter,
    cursorIntentField,
    livePlugin,
    EditorState.languageData.of(() => [{ liveSuggestionAllowed: allowed }]),
    ...(context.nested
      ? [autocompletion(), EditorState.languageData.of(() => [{ autocomplete: guardedWikiSource }])]
      : []),
    createLiveUploads(context),
    createLiveFormatToolbar(
      context,
      (view, action) => {
        run(view, [action], undefined, 'input.format');
      },
      allowed,
    ),
    createLiveTagSuggestions(allowed),
    createLiveLinkEditor(
      context,
      (view, from, to, href, label) => {
        run(
          view,
          [{ type: 'link', href, ...(label === undefined ? {} : { label }) }],
          EditorSelection.range(from, to),
          'input.link',
        );
      },
      allowed,
    ),
    createLiveSlashSuggestions(
      (view, from, to, block) => {
        run(
          view,
          [
            { type: 'key', key: 'Backspace' },
            { type: 'block', block },
          ],
          EditorSelection.range(from, to),
          'input.complete',
        );
      },
      allowed,
      context.nested
        ? undefined
        : (view, from, to) => {
            run(
              view,
              [{ type: 'key', key: 'Backspace' }, { type: 'footnote' }],
              EditorSelection.range(from, to),
              'input.complete',
            );
          },
    ),
    Prec.highest(
      keymap.of([
        {
          key: 'Enter',
          run: acceptMenu,
        },
        {
          key: 'Tab',
          run: acceptMenu,
        },
        { key: 'ArrowDown', run: moveCompletionSelection(true) },
        { key: 'ArrowUp', run: moveCompletionSelection(false) },
        { key: 'Escape', run: closeCompletion },
      ]),
    ),
    Prec.highest([liveKeymap, liveInput, liveClipboard]),
    EditorView.editorAttributes.of({ 'data-editor-variant': 'live' }),
  ];
}

/** Exposed for tests: the fields a live view carries. */
export const liveFields = { layoutField, cursorIntentField };
