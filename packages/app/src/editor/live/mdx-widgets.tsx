import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import {
  type MdxWidgetSource,
  mdxWidgetSource,
  sourceChanges,
} from '@nedian0brien/synapsenote-core';
import type { ComponentType, ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Input } from '@/components/ui/input';
import { normalizeDocRelativeMediaRenderProps } from '../extensions/media-render-props';
import { sanitizeComponentProps } from '../utils/sanitize-url';
import { writeWidget } from './block-widgets';
import { type LivePortalRegistry, livePortalRegistryFor } from './live-portals';
import type { MediaContext } from './media-widgets';

interface MdxDOM {
  position: { from: number; to: number };
  model: MdxWidgetSource;
  registry: LivePortalRegistry;
  portalId: number;
  component: ComponentType<Record<string, unknown>> | null;
  bodyHost: HTMLElement | null;
  bodyView: EditorView | null;
  syncing: boolean;
  disposed: boolean;
  cancelLoad: (() => void) | null;
  loadError: boolean;
}
const mdxDOM = new WeakMap<HTMLElement, MdxDOM>();

function surface(
  state: MdxDOM,
  outer: EditorView,
  context: MediaContext,
  nestedExtension: () => Extension,
): ReactNode {
  const model = state.model;
  const bodyRef = (element: HTMLDivElement | null) => {
    if (!element || state.disposed || state.bodyHost === element) return;
    state.bodyView?.destroy();
    state.bodyHost = element;
    state.bodyView = new EditorView({
      parent: element,
      state: EditorState.create({
        doc: state.model.body,
        extensions: [
          nestedExtension(),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || state.syncing) return;
            writeWidget(outer, state.position, {
              type: 'mdx-body',
              text: update.state.doc.toString(),
            });
          }),
        ],
      }),
    });
  };
  const props = normalizeDocRelativeMediaRenderProps(
    model.name,
    sanitizeComponentProps({ ...model.props }),
    context.docName,
  );
  const Component = state.component;
  const body = model.bodyRange ? <div className="cm-live-mdx-body" ref={bodyRef} /> : null;
  return (
    <div className="cm-live-mdx-widget" data-mdx-name={model.name}>
      <div className="cm-live-mdx-toolbar" contentEditable={false}>
        <span className="cm-live-mdx-name">{model.name}</span>
        {model.attributes
          .filter((attribute) => typeof attribute.value === 'string' && attribute.name !== 'key')
          .map((attribute) => (
            <div className="cm-live-mdx-property" key={attribute.name}>
              <span>{attribute.name}</span>
              <Input
                value={String(attribute.value)}
                aria-label={`${model.name} ${attribute.name}`}
                onChange={(event) =>
                  writeWidget(outer, state.position, {
                    type: 'mdx-prop',
                    key: attribute.name,
                    text: event.target.value,
                  })
                }
              />
            </div>
          ))}
      </div>
      <div className="cm-live-mdx-preview">
        {Component ? (
          <ErrorBoundary
            resetKeys={[model.name, JSON.stringify(props)]}
            fallbackRender={() => (
              <div className="cm-live-mdx-fallback">
                {t`Preview unavailable`}
                {body}
              </div>
            )}
          >
            <Component {...props}>{body}</Component>
          </ErrorBoundary>
        ) : (
          <div className={state.loadError ? 'cm-live-mdx-fallback' : 'cm-live-mdx-loading'}>
            {state.loadError ? t`Preview unavailable` : t`Loading component`}
            {body}
          </div>
        )}
      </div>
    </div>
  );
}

/** MDX components render through SourceEditor's React tree and keep its providers. */
export class MdxBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly context: MediaContext,
    readonly nestedExtension: () => Extension,
  ) {
    super();
  }

  eq(other: MdxBlockWidget): boolean {
    return (
      this.source === other.source &&
      this.from === other.from &&
      this.to === other.to &&
      this.context === other.context
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    const target = document.createElement('div');
    wrapper.append(target);
    const model = mdxWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    const registry = this.context.portalRegistry ?? livePortalRegistryFor(view);
    const state: MdxDOM = {
      position: { from: this.from, to: this.to },
      model,
      registry,
      portalId: 0,
      component: null,
      bodyHost: null,
      bodyView: null,
      syncing: false,
      disposed: false,
      cancelLoad: null,
      loadError: false,
    };
    state.portalId = registry.register(
      target,
      surface(state, view, this.context, this.nestedExtension),
    );
    mdxDOM.set(wrapper, state);
    state.cancelLoad = registry.whenObserved(() => {
      if (state.disposed) return;
      void import('../components/componentMap')
        .then(({ componentMap }) => {
          if (state.disposed) return;
          state.component = componentMap[model.name] ?? componentMap['*'] ?? null;
          registry.update(state.portalId, surface(state, view, this.context, this.nestedExtension));
        })
        .catch(() => {
          if (state.disposed) return;
          state.loadError = true;
          registry.update(state.portalId, surface(state, view, this.context, this.nestedExtension));
        });
    });
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = mdxDOM.get(dom);
    const model = mdxWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model || state.model.name !== model.name) return false;
    state.position = { from: this.from, to: this.to };
    state.model = model;
    const inner = state.bodyView;
    if (inner && inner.state.doc.toString() !== model.body) {
      state.syncing = true;
      try {
        inner.dispatch({ changes: sourceChanges(inner.state.doc.toString(), model.body) });
      } finally {
        state.syncing = false;
      }
    }
    state.registry.update(state.portalId, surface(state, view, this.context, this.nestedExtension));
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = mdxDOM.get(dom);
    if (!state) return;
    state.disposed = true;
    state.cancelLoad?.();
    state.bodyView?.destroy();
    state.registry.unregister(state.portalId);
    mdxDOM.delete(dom);
  }
}
