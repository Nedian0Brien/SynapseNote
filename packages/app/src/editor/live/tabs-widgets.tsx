import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import {
  sourceChanges,
  type TabsWidgetSource,
  tabsWidgetSource,
} from '@nedian0brien/synapsenote-core';
import type { ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { writeWidget } from './block-widgets';
import { type LivePortalRegistry, livePortalRegistryFor } from './live-portals';
import type { MediaContext } from './media-widgets';

interface TabsDOM {
  position: { from: number; to: number };
  model: TabsWidgetSource;
  registry: LivePortalRegistry;
  portalId: number;
  ariaId: string;
  target: HTMLElement;
  activeIndex: number;
  bodyHost: HTMLElement | null;
  bodyIndex: number;
  bodyView: EditorView | null;
  syncing: boolean;
  disposed: boolean;
}

let nextAriaId = 1;
const tabsDOM = new WeakMap<HTMLElement, TabsDOM>();

function surface(state: TabsDOM, outer: EditorView, nestedExtension: () => Extension): ReactNode {
  const panels = state.model.panels;
  const active = Math.min(state.activeIndex, Math.max(0, panels.length - 1));
  const panel = panels[active];
  const activate = (index: number, focus = false) => {
    state.activeIndex = index;
    state.registry.update(state.portalId, surface(state, outer, nestedExtension));
    if (focus) {
      queueMicrotask(() => {
        state.target.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
      });
    }
  };
  const bodyRef = (element: HTMLDivElement | null) => {
    if (!element || !panel || state.disposed) return;
    if (state.bodyHost === element && state.bodyIndex === active) return;
    state.bodyView?.destroy();
    state.bodyHost = element;
    state.bodyIndex = active;
    state.bodyView = new EditorView({
      parent: element,
      state: EditorState.create({
        doc: panel.body,
        extensions: [
          nestedExtension(),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || state.syncing) return;
            writeWidget(outer, state.position, {
              type: 'tabs-body',
              index: state.bodyIndex,
              text: update.state.doc.toString(),
            });
          }),
        ],
      }),
    });
  };
  return (
    <div className="cm-live-tabs-widget tabs" id={state.model.id ?? undefined}>
      <div className="tabs-strip" contentEditable={false}>
        <div
          className="tabs-tablist"
          role="tablist"
          aria-label={state.model.id ? `Tabs: ${state.model.id}` : 'Tabs'}
          onKeyDown={(event) => {
            if (!panels.length) return;
            const next =
              event.key === 'ArrowRight'
                ? (active + 1) % panels.length
                : event.key === 'ArrowLeft'
                  ? (active - 1 + panels.length) % panels.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? panels.length - 1
                      : null;
            if (next === null) return;
            event.preventDefault();
            activate(next, true);
          }}
        >
          {panels.map((item, index) => (
            <button
              key={`${item.from}:${item.to}`}
              id={`${state.ariaId}-tab-${index}`}
              className="tabs-strip-pill"
              type="button"
              role="tab"
              data-active={index === active}
              aria-selected={index === active}
              aria-controls={`${state.ariaId}-panel-${index}`}
              tabIndex={index === active ? 0 : -1}
              onClick={() => activate(index)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="tabs-strip-add"
          aria-label={t`Add tab`}
          onClick={() => {
            state.activeIndex = panels.length;
            writeWidget(outer, state.position, {
              type: 'tabs-add',
              label: `${t`Tab`} ${panels.length + 1}`,
            });
          }}
        >
          +
        </button>
      </div>
      {panel ? (
        <div
          className="cm-live-tabs-panel tabs-content"
          id={`${state.ariaId}-panel-${active}`}
          role="tabpanel"
          aria-labelledby={`${state.ariaId}-tab-${active}`}
        >
          <div className="cm-live-tabs-toolbar" contentEditable={false}>
            {panel.kind === 'tab' ? (
              <Input
                className="cm-live-tabs-label"
                aria-label={t`Tab label`}
                value={panel.label}
                onChange={(event) =>
                  writeWidget(outer, state.position, {
                    type: 'tabs-label',
                    index: active,
                    text: event.target.value,
                  })
                }
              />
            ) : null}
            <button
              className="cm-live-tabs-remove"
              type="button"
              aria-label={t`Remove tab`}
              onClick={() => {
                state.activeIndex = Math.max(0, active - 1);
                writeWidget(outer, state.position, { type: 'tabs-remove', index: active });
              }}
            >
              ×
            </button>
          </div>
          <div className="cm-live-tabs-body" ref={bodyRef} />
        </div>
      ) : null}
    </div>
  );
}

/** Tabs uses source-positioned direct children instead of Tiptap NodeView DOM. */
export class TabsBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly context: MediaContext,
    readonly nestedExtension: () => Extension,
  ) {
    super();
  }

  eq(other: TabsBlockWidget): boolean {
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
    const model = tabsWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    const registry = this.context.portalRegistry ?? livePortalRegistryFor(view);
    const state: TabsDOM = {
      position: { from: this.from, to: this.to },
      model,
      registry,
      portalId: 0,
      ariaId: `cm-live-tabs-${nextAriaId++}`,
      target,
      activeIndex: 0,
      bodyHost: null,
      bodyIndex: -1,
      bodyView: null,
      syncing: false,
      disposed: false,
    };
    state.portalId = registry.register(target, surface(state, view, this.nestedExtension));
    tabsDOM.set(wrapper, state);
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = tabsDOM.get(dom);
    const model = tabsWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model) return false;
    state.position = { from: this.from, to: this.to };
    state.model = model;
    const body = model.panels[state.bodyIndex]?.body;
    if (state.bodyView && body !== undefined && state.bodyView.state.doc.toString() !== body) {
      state.syncing = true;
      try {
        state.bodyView.dispatch({
          changes: sourceChanges(state.bodyView.state.doc.toString(), body),
        });
      } finally {
        state.syncing = false;
      }
    }
    state.registry.update(state.portalId, surface(state, view, this.nestedExtension));
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = tabsDOM.get(dom);
    if (!state) return;
    state.disposed = true;
    state.bodyView?.destroy();
    state.registry.unregister(state.portalId);
    tabsDOM.delete(dom);
  }
}
