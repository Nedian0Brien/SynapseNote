import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { t } from '@lingui/core/macro';
import {
  builtInComponents,
  type MdxWidgetSource,
  mdxWidgetSource,
  type PropDef,
  sourceChanges,
} from '@nedian0brien/synapsenote-core';
import { ExternalLink } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { hashFromDocName } from '@/lib/doc-hash';
import { normalizeDocRelativeMediaRenderProps } from '../extensions/media-render-props';
import { sanitizeComponentProps } from '../utils/sanitize-url';
import { writeWidget } from './block-widgets';
import { type LivePortalRegistry, livePortalRegistryFor } from './live-portals';
import type { MediaContext } from './media-widgets';
import { bindSourceScope } from './source-scope';

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
  context: MediaContext;
  nestedExtension: () => Extension;
  newPropertyKey: string;
  invalidJsonKey: string | null;
}
const mdxDOM = new WeakMap<HTMLElement, MdxDOM>();

const propDefsByName = new Map(builtInComponents.map((meta) => [meta.name, meta.props]));

function propertyControl(
  state: MdxDOM,
  outer: EditorView,
  name: string,
  value: unknown,
  definition?: PropDef,
): ReactNode {
  const label = `${state.model.name} ${name}`;
  const writeText = (text: string) =>
    writeWidget(outer, state.position, { type: 'mdx-prop', key: name, text });
  const writeLiteral = (literal: unknown) =>
    writeWidget(outer, state.position, { type: 'mdx-prop-literal', key: name, value: literal });
  if (definition?.type === 'boolean' || typeof value === 'boolean') {
    return <Switch checked={value === true} aria-label={label} onCheckedChange={writeLiteral} />;
  }
  if (definition?.type === 'number' || typeof value === 'number') {
    return (
      <Input
        type="number"
        value={typeof value === 'number' ? value : ''}
        aria-label={label}
        onChange={(event) => {
          if (!event.target.value) return;
          const number = Number(event.target.value);
          if (Number.isFinite(number)) writeLiteral(number);
        }}
      />
    );
  }
  if (definition?.type === 'enum') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        aria-label={label}
        onChange={(event) => writeText(event.target.value)}
      >
        {!value ? <option value="">{t`Select value`}</option> : null}
        {definition.enumValues.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (value === null || typeof value === 'object') {
    return (
      <div className="cm-live-mdx-json">
        <Textarea
          key={`${name}:${JSON.stringify(value)}`}
          defaultValue={JSON.stringify(value, null, 2)}
          aria-label={label}
          onBlur={(event) => {
            try {
              const next = JSON.parse(event.target.value);
              state.invalidJsonKey = null;
              writeLiteral(next);
            } catch {
              state.invalidJsonKey = name;
              state.registry.update(
                state.portalId,
                surface(state, outer, state.context, state.nestedExtension),
              );
            }
          }}
        />
        {state.invalidJsonKey === name ? <span role="alert">{t`Invalid JSON`}</span> : null}
      </div>
    );
  }
  return (
    <Input
      value={typeof value === 'string' ? value : ''}
      aria-label={label}
      onChange={(event) => writeText(event.target.value)}
    />
  );
}

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
    bindSourceScope(state.bodyView, outer, (position) => {
      const from = state.model.bodyRange?.[0];
      return from === undefined ? null : from + position;
    });
  };
  const props = normalizeDocRelativeMediaRenderProps(
    model.name,
    sanitizeComponentProps({ ...model.props }),
    context.docName,
  );
  const Component = state.component;
  const body = model.bodyRange ? <div className="cm-live-mdx-body" ref={bodyRef} /> : null;
  const definitions = propDefsByName.get(model.name) ?? [];
  // The database component owns these through its source/view picker.
  const pickerOwned = (name: string) =>
    model.name === 'DatabaseView' && ['databaseId', 'sourceId', 'viewId'].includes(name);
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));
  const existing = new Set(model.attributes.map((attribute) => attribute.name));
  const visible = model.attributes
    .filter((attribute) => {
      const definition = byName.get(attribute.name);
      return (
        attribute.name !== 'key' &&
        !pickerOwned(attribute.name) &&
        attribute.value !== undefined &&
        definition?.type !== 'reactnode' &&
        !definition?.hidden &&
        !definition?.hideWhen?.({ ...model.props })
      );
    })
    .map((attribute) => ({
      name: attribute.name,
      value: attribute.value,
      definition: byName.get(attribute.name),
    }));
  for (const definition of definitions) {
    if (
      definition.required &&
      !existing.has(definition.name) &&
      !pickerOwned(definition.name) &&
      !definition.hidden &&
      definition.type !== 'reactnode' &&
      !definition.hideWhen?.({ ...model.props })
    ) {
      visible.push({ name: definition.name, value: definition.defaultValue, definition });
    }
  }
  const addable = definitions.filter(
    (definition) =>
      !existing.has(definition.name) &&
      !pickerOwned(definition.name) &&
      !definition.required &&
      !definition.hidden &&
      definition.type !== 'reactnode' &&
      !definition.hideWhen?.({ ...model.props }),
  );
  const sourceDoc = model.name === 'Mirror' && typeof props.src === 'string' ? props.src : '';
  return (
    <div className="cm-live-mdx-widget" data-mdx-name={model.name}>
      <div className="cm-live-mdx-toolbar" contentEditable={false}>
        <span className="cm-live-mdx-name">{model.name}</span>
        {sourceDoc ? (
          <a
            className="cm-live-mdx-source-link"
            href={hashFromDocName(
              sourceDoc,
              typeof props.anchor === 'string' && props.anchor ? props.anchor : null,
            )}
            aria-label={t`Open source doc: ${sourceDoc}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ExternalLink size={14} aria-hidden="true" />
            {t`Open source`}
          </a>
        ) : null}
        {visible.map(({ name, value, definition }) => (
          <div className="cm-live-mdx-property" key={name}>
            <span>{name}</span>
            {propertyControl(state, outer, name, value, definition)}
          </div>
        ))}
        {addable.length ? (
          <select
            className="cm-live-mdx-add-property"
            aria-label={t`Add property`}
            value=""
            onChange={(event) => {
              const definition = addable.find((item) => item.name === event.target.value);
              if (!definition) return;
              if (definition.type === 'boolean' || definition.type === 'number') {
                writeWidget(outer, state.position, {
                  type: 'mdx-prop-literal',
                  key: definition.name,
                  value: definition.defaultValue ?? (definition.type === 'boolean' ? false : 0),
                });
              } else if (definition.type === 'string' || definition.type === 'enum') {
                writeWidget(outer, state.position, {
                  type: 'mdx-prop',
                  key: definition.name,
                  text: definition.defaultValue ?? '',
                });
              }
            }}
          >
            <option value="">{t`Add property`}</option>
            {addable.map((definition) => (
              <option key={definition.name} value={definition.name}>
                {definition.name}
              </option>
            ))}
          </select>
        ) : null}
        {!definitions.length ? (
          <div className="cm-live-mdx-property cm-live-mdx-new-property">
            <Input
              value={state.newPropertyKey}
              aria-label={t`Property name`}
              onChange={(event) => {
                state.newPropertyKey = event.target.value;
                state.registry.update(
                  state.portalId,
                  surface(state, outer, context, nestedExtension),
                );
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!/^[A-Za-z][A-Za-z0-9_-]*$/.test(state.newPropertyKey)}
              onClick={() => {
                writeWidget(outer, state.position, {
                  type: 'mdx-prop',
                  key: state.newPropertyKey,
                  text: '',
                });
                state.newPropertyKey = '';
              }}
            >
              {t`Add property`}
            </Button>
          </div>
        ) : null}
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
      context: this.context,
      nestedExtension: this.nestedExtension,
      newPropertyKey: '',
      invalidJsonKey: null,
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
    state.context = this.context;
    state.nestedExtension = this.nestedExtension;
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
