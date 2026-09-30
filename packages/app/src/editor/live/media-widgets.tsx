import { type EditorView, WidgetType } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import { I18nProvider } from '@lingui/react';
import { type MediaWidgetSource, mediaWidgetSource } from '@nedian0brien/synapsenote-core';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { i18n } from '@/lib/i18n';
import { normalizeDocRelativeMediaRenderProps } from '../extensions/media-render-props';
import { resolveWikiLinkAssetTarget } from '../extensions/wiki-link-helpers';
import { sanitizeComponentProps } from '../utils/sanitize-url';
import { syncInput, writeWidget } from './block-widgets';
import type { LivePortalRegistry } from './live-portals';

export interface MediaContext {
  /** Nested live views own their autocomplete state; the page uses basicSetup. */
  nested?: boolean;
  docName?: string;
  assetPaths?: ReadonlySet<string>;
  filePaths?: ReadonlySet<string>;
  portalRegistry?: LivePortalRegistry;
}

interface MediaDOM {
  position: { from: number; to: number };
  model: MediaWidgetSource;
  context: MediaContext;
  root: Root;
  sourceInput: HTMLInputElement;
  labelInput: HTMLInputElement;
  disposed: boolean;
}
const mediaDOM = new WeakMap<HTMLElement, MediaDOM>();

function renderProps(state: MediaDOM): Record<string, unknown> {
  const { model, context } = state;
  let src = model.src;
  if (model.syntax === 'wiki') {
    const resolved = resolveWikiLinkAssetTarget(
      model.src,
      context.assetPaths ?? new Set(),
      context.filePaths,
    );
    if (resolved) src = `/${resolved}`;
  }
  const labelKey = model.kind === 'image' ? 'alt' : model.kind === 'file' ? 'name' : 'title';
  const props = sanitizeComponentProps({ ...model.props, src, [labelKey]: model.label });
  const descriptor = model.kind === 'image' ? 'img' : model.kind === 'file' ? 'File' : 'Embed';
  return normalizeDocRelativeMediaRenderProps(descriptor, props, context.docName);
}

async function renderPreview(state: MediaDOM): Promise<void> {
  const props = renderProps(state);
  if (state.model.kind === 'image') {
    const { Image } = await import('../components/Image');
    if (state.disposed) return;
    state.root.render(createElement(I18nProvider, { i18n }, createElement(Image, props)));
  } else if (state.model.kind === 'file') {
    const { File } = await import('../components/File');
    if (state.disposed) return;
    state.root.render(createElement(I18nProvider, { i18n }, createElement(File, props)));
  } else {
    const { Embed } = await import('../components/Embed');
    if (state.disposed) return;
    state.root.render(createElement(I18nProvider, { i18n }, createElement(Embed, props)));
  }
}

abstract class MediaWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly context: MediaContext,
    readonly inline: boolean,
    readonly resolved?: MediaWidgetSource,
  ) {
    super();
  }

  eq(other: MediaWidget): boolean {
    return (
      this.source === other.source &&
      this.from === other.from &&
      this.to === other.to &&
      this.context === other.context &&
      this.resolved?.src === other.resolved?.src &&
      this.resolved?.srcRange?.[0] === other.resolved?.srcRange?.[0] &&
      this.resolved?.srcRange?.[1] === other.resolved?.srcRange?.[1] &&
      JSON.stringify(this.resolved?.props) === JSON.stringify(other.resolved?.props)
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement(this.inline ? 'span' : 'div');
    wrapper.className = this.inline ? 'cm-live-media-inline' : 'cm-live-media-block';
    const preview = document.createElement(this.inline ? 'span' : 'div');
    preview.className = 'cm-live-media-preview';
    const controls = document.createElement(this.inline ? 'span' : 'div');
    controls.className = 'cm-live-media-controls';
    controls.hidden = this.inline;
    const sourceInput = document.createElement('input');
    sourceInput.type = 'text';
    sourceInput.className = 'cm-live-media-source';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'cm-live-media-label';
    controls.append(sourceInput, labelInput);
    wrapper.append(preview);
    if (this.inline) {
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'cm-live-media-edit';
      editButton.textContent = '⋯';
      editButton.setAttribute('aria-label', t`Edit media`);
      editButton.addEventListener('click', () => {
        controls.hidden = !controls.hidden;
        if (!controls.hidden) sourceInput.focus();
        view.requestMeasure();
      });
      wrapper.append(editButton);
    }
    wrapper.append(controls);
    const model = this.resolved ?? mediaWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    const sourceLabel =
      model.syntax === 'reference'
        ? t`Reference target`
        : model.kind === 'embed'
          ? t`Embed URL`
          : t`File path or URL`;
    const labelLabel =
      model.kind === 'image'
        ? t`Image alt text`
        : model.kind === 'file'
          ? t`File name`
          : t`Embed title`;
    sourceInput.setAttribute('aria-label', sourceLabel);
    labelInput.setAttribute('aria-label', labelLabel);
    sourceInput.value = model.src;
    labelInput.value = model.label;
    const state: MediaDOM = {
      position: { from: this.from, to: this.to },
      model,
      context: this.context,
      root: createRoot(preview),
      sourceInput,
      labelInput,
      disposed: false,
    };
    mediaDOM.set(wrapper, state);
    const commitInput = (input: HTMLInputElement, type: 'media-src' | 'media-label') => {
      const focused = document.activeElement === input;
      writeWidget(view, state.position, { type, text: input.value }, state.model);
      // A distant reference-definition edit can make CodeMirror refocus its content.
      if (focused) {
        queueMicrotask(() => {
          if (!state.disposed && input.isConnected && !controls.hidden) {
            input.focus({ preventScroll: true });
          }
        });
      }
    };
    sourceInput.addEventListener('input', () => commitInput(sourceInput, 'media-src'));
    labelInput.addEventListener('input', () => commitInput(labelInput, 'media-label'));
    void renderPreview(state);
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = mediaDOM.get(dom);
    const model = this.resolved ?? mediaWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model || state.model.kind !== model.kind) return false;
    state.position = { from: this.from, to: this.to };
    const changed =
      state.model.src !== model.src ||
      state.model.label !== model.label ||
      JSON.stringify(state.model.props) !== JSON.stringify(model.props) ||
      state.context !== this.context;
    state.model = model;
    state.context = this.context;
    syncInput(state.sourceInput, model.src);
    syncInput(state.labelInput, model.label);
    if (changed) void renderPreview(state);
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = mediaDOM.get(dom);
    if (!state) return;
    state.disposed = true;
    state.root.unmount();
    mediaDOM.delete(dom);
  }
}

export class MediaBlockWidget extends MediaWidget {
  constructor(source: string, from: number, to: number, context: MediaContext) {
    super(source, from, to, context, false);
  }
}

export class MediaInlineWidget extends MediaWidget {
  constructor(
    source: string,
    from: number,
    to: number,
    context: MediaContext,
    resolved?: MediaWidgetSource,
  ) {
    super(source, from, to, context, true, resolved);
  }
}
