import { afterEach, describe, expect, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createLiveExtension } from './live-extension';
import { LivePortalHost, LivePortalRegistry } from './live-portals';

if (typeof Window === 'undefined') {
  Object.defineProperty(globalThis, 'Window', { value: window.Window, configurable: true });
}

const views: EditorView[] = [];
const roots: Root[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

function mount(source: string): EditorView {
  const registry = new LivePortalRegistry();
  const parent = document.createElement('div');
  const portalHost = document.createElement('div');
  document.body.append(parent, portalHost);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [createLiveExtension({ portalRegistry: registry })],
    }),
  });
  views.push(view);
  const root = createRoot(portalHost);
  roots.push(root);
  act(() => root.render(<LivePortalHost registry={registry} />));
  return view;
}

function setInput(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('live MDX properties', () => {
  test('edits boolean, number, JSON and new string attributes', () => {
    const view = mount('<Custom title="Keep" enabled count={1} config={{"n":1}} />');
    const widget = view.dom.querySelector('.cm-live-mdx-widget');
    if (!widget) throw new Error('MDX widget missing');
    const enabled = widget.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="Custom enabled"]',
    );
    if (!enabled) throw new Error('Boolean switch missing');
    act(() => enabled.click());
    expect(view.state.doc.toString()).toContain('enabled={false}');

    const number = widget.querySelector<HTMLInputElement>('input[aria-label="Custom count"]');
    if (!number) throw new Error('Number input missing');
    act(() => setInput(number, '2'));
    expect(view.state.doc.toString()).toContain('count={2}');

    const json = widget.querySelector<HTMLTextAreaElement>('textarea[aria-label="Custom config"]');
    if (!json) throw new Error('JSON input missing');
    act(() => {
      json.focus();
      json.value = '{bad';
      json.blur();
    });
    expect(view.state.doc.toString()).toContain('config={{"n":1}}');
    expect(widget.querySelector('[role="alert"]')?.textContent).toContain('Invalid JSON');
    act(() => {
      json.focus();
      json.value = '{"n":3}';
      json.blur();
    });
    expect(view.state.doc.toString()).toContain('config={{"n":3}}');

    const name = widget.querySelector<HTMLInputElement>('input[aria-label="Property name"]');
    if (!name) throw new Error('New property name missing');
    act(() => setInput(name, 'extra'));
    const add = [...widget.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Add property'),
    );
    if (!add) throw new Error('Add property button missing');
    act(() => add.click());
    expect(view.state.doc.toString()).toContain('extra=""');
  });

  test('Mirror offers a source document deep link', () => {
    const view = mount('<Mirror src="notes/source" anchor="section" />');
    const link = view.dom.querySelector<HTMLAnchorElement>('.cm-live-mdx-source-link');
    expect(link?.getAttribute('href')).toBe('#/notes/source#section');
    expect(view.dom.querySelector('input[aria-label="Mirror src"]')).not.toBeNull();
    expect(view.dom.querySelector('input[aria-label="Mirror anchor"]')).not.toBeNull();
  });

  test('a registered component can add an optional property without showing hidden fields', () => {
    const view = mount('<DatabaseView databaseId="db" sourceId="ds" viewId="view" />');
    const widget = view.dom.querySelector('.cm-live-mdx-widget[data-mdx-name="DatabaseView"]');
    if (!widget) throw new Error('Database view widget missing');
    const add = widget.querySelector<HTMLSelectElement>('.cm-live-mdx-add-property');
    if (!add) throw new Error('Add property selector missing');
    expect([...add.options].map((option) => option.value)).toContain('mode');
    expect([...add.options].map((option) => option.value)).not.toContain('create');
    act(() => {
      add.value = 'mode';
      add.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(view.state.doc.toString()).toContain('mode="inline"');
  });
});
