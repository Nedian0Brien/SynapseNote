import { type EditorView, WidgetType } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import { referenceDefinitionSource } from '@nedian0brien/synapsenote-core';
import { syncInput, writeWidget } from './block-widgets';

interface ReferenceDOM {
  position: { from: number; to: number };
  label: HTMLElement;
  target: HTMLInputElement;
}

const referenceDOM = new WeakMap<HTMLElement, ReferenceDOM>();

/** A compact control replaces the raw Markdown definition line. */
export class ReferenceDefinitionWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: ReferenceDefinitionWidget): boolean {
    return this.source === other.source && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-live-reference-definition';
    const label = document.createElement('span');
    label.className = 'cm-live-reference-label';
    const target = document.createElement('input');
    target.type = 'text';
    target.className = 'cm-live-reference-target';
    target.setAttribute('aria-label', t`Reference target`);
    wrapper.append(label, target);
    const model = referenceDefinitionSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    label.textContent = model.label;
    target.value = model.url;
    const state: ReferenceDOM = { position: { from: this.from, to: this.to }, label, target };
    referenceDOM.set(wrapper, state);
    target.addEventListener('input', () =>
      writeWidget(view, state.position, { type: 'reference-target', text: target.value }),
    );
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = referenceDOM.get(dom);
    const model = referenceDefinitionSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model) return false;
    state.position = { from: this.from, to: this.to };
    state.label.textContent = model.label;
    syncInput(state.target, model.url);
    return true;
  }
}
