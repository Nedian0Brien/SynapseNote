import { type EditorView, WidgetType } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import { I18nProvider } from '@lingui/react';
import { type DiagramWidgetSource, diagramWidgetSource } from '@nedian0brien/synapsenote-core';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { i18n } from '@/lib/i18n';
import { syncInput, writeWidget } from './block-widgets';

interface DiagramDOM {
  position: { from: number; to: number };
  model: DiagramWidgetSource;
  body: HTMLTextAreaElement;
  root: Root;
  disposed: boolean;
}
const diagramDOM = new WeakMap<HTMLElement, DiagramDOM>();

async function renderPreview(state: DiagramDOM): Promise<void> {
  if (state.model.kind === 'math') {
    const { MathView } = await import('../components/Math');
    if (state.disposed) return;
    state.root.render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(MathView, { formula: state.model.preview }),
      ),
    );
  } else {
    const { MermaidView } = await import('../components/Mermaid');
    if (state.disposed) return;
    state.root.render(
      createElement(
        I18nProvider,
        { i18n },
        createElement(MermaidView, { chart: state.model.preview }),
      ),
    );
  }
}

/** Preview and edit the source body of a parsed math or Mermaid block. */
export class DiagramBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: DiagramBlockWidget): boolean {
    return this.source === other.source && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-live-diagram-block';
    const preview = document.createElement('div');
    preview.className = 'cm-live-diagram-preview';
    const body = document.createElement('textarea');
    body.className = 'cm-live-diagram-body';
    body.spellcheck = false;
    wrapper.append(preview, body);
    const model = diagramWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    body.setAttribute('aria-label', model.kind === 'math' ? t`Formula` : t`Mermaid chart`);
    body.value = view.state.sliceDoc(...model.body);
    const state: DiagramDOM = {
      position: { from: this.from, to: this.to },
      model,
      body,
      root: createRoot(preview),
      disposed: false,
    };
    diagramDOM.set(wrapper, state);
    body.addEventListener('input', () =>
      writeWidget(view, state.position, { type: 'diagram-body', text: body.value }),
    );
    void renderPreview(state);
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = diagramDOM.get(dom);
    const model = diagramWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model || state.model.kind !== model.kind) return false;
    state.position = { from: this.from, to: this.to };
    const changed = state.model.preview !== model.preview;
    state.model = model;
    syncInput(state.body, view.state.sliceDoc(...model.body));
    if (changed) void renderPreview(state);
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = diagramDOM.get(dom);
    if (!state) return;
    state.disposed = true;
    state.root.unmount();
    diagramDOM.delete(dom);
  }
}
