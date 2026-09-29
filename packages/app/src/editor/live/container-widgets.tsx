import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import { I18nProvider } from '@lingui/react';
import {
  type ContainerWidgetSource,
  containerWidgetSource,
  sourceChanges,
} from '@nedian0brien/synapsenote-core';
import { createRoot, type Root } from 'react-dom/client';
import { Input } from '@/components/ui/input';
import { i18n } from '@/lib/i18n';
import { Accordion } from '../components/Accordion';
import { Callout } from '../components/Callout';
import { writeWidget } from './block-widgets';

const CALLOUT_TYPES = [
  'note',
  'tip',
  'important',
  'warning',
  'caution',
  'abstract',
  'info',
  'todo',
  'success',
  'question',
  'failure',
  'danger',
  'bug',
  'example',
  'quote',
] as const;

interface ContainerDOM {
  position: { from: number; to: number };
  model: ContainerWidgetSource;
  root: Root;
  bodyHost: HTMLElement | null;
  bodyView: EditorView | null;
  syncing: boolean;
  disposed: boolean;
}
const containerDOM = new WeakMap<HTMLElement, ContainerDOM>();

function renderContainer(
  state: ContainerDOM,
  outer: EditorView,
  cellExtension: () => Extension,
): void {
  const bodyRef = (element: HTMLDivElement | null) => {
    if (!element || state.disposed || state.bodyHost === element) return;
    state.bodyView?.destroy();
    state.bodyHost = element;
    state.bodyView = new EditorView({
      parent: element,
      state: EditorState.create({
        doc: state.model.body,
        extensions: [
          cellExtension(),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || state.syncing) return;
            writeWidget(outer, state.position, {
              type: 'container-body',
              text: update.state.doc.toString(),
            });
          }),
        ],
      }),
    });
  };
  const model = state.model;
  const isCallout = model.kind === 'callout';
  const body = <div className="cm-live-container-body" ref={bodyRef} />;
  const title = (
    <Input
      className="cm-live-container-title"
      value={model.title}
      aria-label={isCallout ? t`Callout title` : t`Accordion title`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onChange={(event) =>
        writeWidget(outer, state.position, { type: 'container-title', text: event.target.value })
      }
    />
  );
  const toolbar = (
    <div className="cm-live-container-toolbar" contentEditable={false}>
      {isCallout ? (
        <select
          className="cm-live-container-type"
          value={model.calloutType ?? 'note'}
          aria-label={t`Callout type`}
          onChange={(event) =>
            writeWidget(outer, state.position, { type: 'container-type', text: event.target.value })
          }
        >
          {CALLOUT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
  const content = isCallout ? (
    <Callout
      type={model.calloutType}
      title={model.title}
      titleSlot={title}
      icon={typeof model.props.icon === 'string' ? model.props.icon : undefined}
      color={
        typeof model.props.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(model.props.color)
          ? model.props.color
          : undefined
      }
      collapsible={model.props.collapsible === true}
      defaultOpen={model.props.defaultOpen === true}
    >
      {body}
    </Callout>
  ) : (
    <Accordion
      title={model.title}
      titleSlot={title}
      description={
        typeof model.props.description === 'string' ? model.props.description : undefined
      }
      icon={typeof model.props.icon === 'string' ? model.props.icon : undefined}
      id={typeof model.props.id === 'string' ? model.props.id : undefined}
      name={typeof model.props.name === 'string' ? model.props.name : undefined}
      defaultOpen={model.props.defaultOpen === true}
    >
      {body}
    </Accordion>
  );
  state.root.render(
    <I18nProvider i18n={i18n}>
      <div className="cm-live-container-widget">
        {isCallout ? toolbar : null}
        {content}
      </div>
    </I18nProvider>,
  );
}

/** Reuse product renderers while editing the source ranges owned by a container. */
export class ContainerBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly cellExtension: () => Extension,
  ) {
    super();
  }

  eq(other: ContainerBlockWidget): boolean {
    return this.source === other.source && this.from === other.from && this.to === other.to;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    const model = containerWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!model) return wrapper;
    const state: ContainerDOM = {
      position: { from: this.from, to: this.to },
      model,
      root: createRoot(wrapper),
      bodyHost: null,
      bodyView: null,
      syncing: false,
      disposed: false,
    };
    containerDOM.set(wrapper, state);
    renderContainer(state, view, this.cellExtension);
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const state = containerDOM.get(dom);
    const model = containerWidgetSource(view.state.doc.toString(), this.from, this.to);
    if (!state || !model || state.model.kind !== model.kind) return false;
    state.position = { from: this.from, to: this.to };
    const chromeChanged =
      state.model.title !== model.title ||
      state.model.calloutType !== model.calloutType ||
      JSON.stringify(state.model.props) !== JSON.stringify(model.props);
    state.model = model;
    const bodyView = state.bodyView;
    if (bodyView && bodyView.state.doc.toString() !== model.body) {
      state.syncing = true;
      try {
        bodyView.dispatch({ changes: sourceChanges(bodyView.state.doc.toString(), model.body) });
      } finally {
        state.syncing = false;
      }
    }
    if (chromeChanged) renderContainer(state, view, this.cellExtension);
    return true;
  }

  destroy(dom: HTMLElement): void {
    const state = containerDOM.get(dom);
    if (!state) return;
    state.disposed = true;
    state.bodyView?.destroy();
    state.root.unmount();
    containerDOM.delete(dom);
  }
}
