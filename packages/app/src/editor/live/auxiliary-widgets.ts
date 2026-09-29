import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import {
  commentWidgetSource,
  footnoteWidgetSource,
  sourceChanges,
} from '@nedian0brien/synapsenote-core';
import { syncInput, writeWidget } from './block-widgets';

export class ThematicBreakWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const rule = document.createElement('hr');
    rule.className = 'cm-live-thematic-break';
    rule.setAttribute('aria-label', t`Horizontal rule`);
    return rule;
  }
}

export class FootnoteReferenceWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: FootnoteReferenceWidget): boolean {
    return this.source === other.source;
  }

  toDOM(): HTMLElement {
    const identifier = this.source.slice(2, -1).replace(/\s+/g, ' ').toLowerCase();
    const sup = document.createElement('sup');
    sup.className = 'cm-live-footnote-reference footnote-ref';
    sup.dataset.footnoteRefId = identifier;
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'footnote-ref-link';
    link.textContent = `[${identifier}]`;
    link.setAttribute('aria-label', t`Footnote ${identifier}`);
    link.addEventListener('click', () =>
      document.getElementById(`fn-${identifier}`)?.scrollIntoView({ block: 'center' }),
    );
    sup.append(link);
    return sup;
  }
}

interface FootnoteDOM {
  position: { from: number; to: number };
  identifier: string;
  bodyView: EditorView | null;
  syncing: boolean;
}
const footnoteDOM = new WeakMap<HTMLElement, FootnoteDOM>();

export class FootnoteDefinitionWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly nestedExtension: () => Extension,
  ) {
    super();
  }

  eq(other: FootnoteDefinitionWidget): boolean {
    return this.source === other.source && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('aside');
    wrapper.className = 'cm-live-footnote-definition';
    const model = footnoteWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    wrapper.id = `fn-${model.identifier}`;
    const label = document.createElement('span');
    label.className = 'cm-live-footnote-label';
    label.textContent = `[${model.identifier}]`;
    const body = document.createElement('div');
    body.className = 'cm-live-footnote-body';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'cm-live-footnote-back';
    back.textContent = '↩';
    back.setAttribute('aria-label', t`Back to footnote reference`);
    back.addEventListener('click', () => {
      const reference = [...document.querySelectorAll<HTMLElement>('[data-footnote-ref-id]')].find(
        (element) => element.dataset.footnoteRefId === model.identifier,
      );
      reference?.scrollIntoView({ block: 'center' });
    });
    wrapper.append(label, body, back);
    const position = { from: this.from, to: this.to };
    const state: FootnoteDOM = {
      position,
      identifier: model.identifier,
      bodyView: null,
      syncing: false,
    };
    state.bodyView = new EditorView({
      parent: body,
      state: EditorState.create({
        doc: model.body,
        extensions: [
          this.nestedExtension(),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || state.syncing) return;
            writeWidget(view, state.position, {
              type: 'footnote-body',
              text: update.state.doc.toString(),
            });
          }),
        ],
      }),
    });
    footnoteDOM.set(wrapper, state);
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = footnoteDOM.get(dom);
    const model = footnoteWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model || state.identifier !== model.identifier) return false;
    state.position = { from: this.from, to: this.to };
    if (!state.bodyView) return false;
    const previous = state.bodyView.state.doc.toString();
    if (previous !== model.body) {
      state.syncing = true;
      try {
        state.bodyView.dispatch({ changes: sourceChanges(previous, model.body) });
      } finally {
        state.syncing = false;
      }
    }
    return true;
  }

  destroy(dom: HTMLElement): void {
    footnoteDOM.get(dom)?.bodyView?.destroy();
    footnoteDOM.delete(dom);
  }
}

interface CommentDOM {
  position: { from: number; to: number };
  input: HTMLInputElement;
}
const commentDOM = new WeakMap<HTMLElement, CommentDOM>();

export class InlineCommentWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: InlineCommentWidget): boolean {
    return this.source === other.source && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-live-inline-comment';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = t`Comment`;
    button.setAttribute('aria-label', t`Edit comment`);
    const input = document.createElement('input');
    input.type = 'text';
    input.hidden = true;
    input.setAttribute('aria-label', t`Comment text`);
    wrapper.append(button, input);
    const model = commentWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    input.value = model.body;
    const state: CommentDOM = { position: { from: this.from, to: this.to }, input };
    commentDOM.set(wrapper, state);
    button.addEventListener('click', () => {
      input.hidden = !input.hidden;
      if (!input.hidden) input.focus();
      view.requestMeasure();
    });
    input.addEventListener('input', () =>
      writeWidget(view, state.position, { type: 'comment-body', text: input.value }),
    );
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = commentDOM.get(dom);
    const model = commentWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model) return false;
    state.position = { from: this.from, to: this.to };
    syncInput(state.input, model.body);
    return true;
  }
}

interface BlockCommentDOM {
  position: { from: number; to: number };
  bodyView: EditorView | null;
  syncing: boolean;
}
const blockCommentDOM = new WeakMap<HTMLElement, BlockCommentDOM>();

export class BlockCommentWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly nestedExtension: () => Extension,
  ) {
    super();
  }

  eq(other: BlockCommentWidget): boolean {
    return this.source === other.source && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-live-block-comment';
    const label = document.createElement('span');
    label.textContent = t`Comment`;
    label.className = 'cm-live-block-comment-label';
    const body = document.createElement('div');
    body.className = 'cm-live-block-comment-body';
    wrapper.append(label, body);
    const model = commentWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    const state: BlockCommentDOM = {
      position: { from: this.from, to: this.to },
      bodyView: null,
      syncing: false,
    };
    state.bodyView = new EditorView({
      parent: body,
      state: EditorState.create({
        doc: model.body,
        extensions: [
          this.nestedExtension(),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || state.syncing) return;
            writeWidget(view, state.position, {
              type: 'comment-body',
              text: update.state.doc.toString(),
            });
          }),
        ],
      }),
    });
    blockCommentDOM.set(wrapper, state);
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = blockCommentDOM.get(dom);
    const model = commentWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model) return false;
    state.position = { from: this.from, to: this.to };
    if (!state.bodyView) return false;
    const previous = state.bodyView.state.doc.toString();
    if (previous !== model.body) {
      state.syncing = true;
      try {
        state.bodyView.dispatch({ changes: sourceChanges(previous, model.body) });
      } finally {
        state.syncing = false;
      }
    }
    return true;
  }

  destroy(dom: HTMLElement): void {
    blockCommentDOM.get(dom)?.bodyView?.destroy();
    blockCommentDOM.delete(dom);
  }
}
