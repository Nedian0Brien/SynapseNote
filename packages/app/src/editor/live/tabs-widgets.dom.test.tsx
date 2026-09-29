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

function host(registry: LivePortalRegistry): Root {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<LivePortalHost registry={registry} />));
  return root;
}

describe('live Tabs widget', () => {
  test('switches panels and edits only the active Tab source', () => {
    const source =
      '<Tabs id="set">\n<Tab label="One">\nalpha\n</Tab>\n<Tab label="Two">\nbeta\n</Tab>\n</Tabs>';
    const registry = new LivePortalRegistry();
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: source,
        extensions: [createLiveExtension({ portalRegistry: registry })],
      }),
    });
    views.push(view);
    host(registry);
    const tabs = view.dom.querySelector('.cm-live-tabs-widget');
    expect(tabs).not.toBeNull();
    if (!tabs) throw new Error('Tabs widget missing');
    expect([...tabs.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
      'One',
      'Two',
    ]);

    act(() => tabs?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.click());
    expect(tabs?.querySelector('[role="tabpanel"]')?.textContent).toContain('beta');
    const nested = tabs?.querySelector<HTMLElement>('.cm-live-tabs-body .cm-editor');
    if (!nested) throw new Error('Active Tab body missing');
    const bodyView = EditorView.findFromDOM(nested);
    if (!bodyView) throw new Error('Active Tab editor missing');
    bodyView.dispatch({ changes: { from: bodyView.state.doc.length, insert: '!' } });
    expect(view.state.doc.toString()).toBe(
      '<Tabs id="set">\n<Tab label="One">\nalpha\n</Tab>\n<Tab label="Two">\nbeta!\n</Tab>\n</Tabs>',
    );
    expect(tabs?.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Two');

    const label = tabs?.querySelector<HTMLInputElement>('.cm-live-tabs-label');
    if (!label) throw new Error('Tab label input missing');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        label,
        'Other',
      );
      label.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.state.doc.toString()).toContain('<Tab label="Other">\nbeta!');

    act(() => tabs?.querySelector<HTMLButtonElement>('.tabs-strip-add')?.click());
    expect(tabs?.querySelectorAll('[role="tab"]').length).toBe(3);
    expect(tabs?.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Tab 3');
    act(() => tabs?.querySelector<HTMLButtonElement>('.cm-live-tabs-remove')?.click());
    expect(tabs?.querySelectorAll('[role="tab"]').length).toBe(2);
    expect(view.state.doc.toString()).not.toContain('<Tab label="Tab 3">');
  });

  test('retains the selected panel when its React host remounts', () => {
    const source = '<Tabs>\n<Tab label="One">\na\n</Tab>\n<Tab label="Two">\nb\n</Tab>\n</Tabs>';
    const registry = new LivePortalRegistry();
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: source,
        extensions: [createLiveExtension({ portalRegistry: registry })],
      }),
    });
    views.push(view);
    const first = host(registry);
    act(() => view.dom.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.click());
    expect(view.dom.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Two');
    act(() => first.unmount());
    roots.splice(roots.indexOf(first), 1);
    host(registry);
    expect(view.dom.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Two');
  });

  test('renders nested Tabs from the active Tab body', () => {
    const source =
      '<Tabs>\n<Tab label="Outer">\n<Tabs>\n<Tab label="Inner">\nbody\n</Tab>\n</Tabs>\n</Tab>\n</Tabs>';
    const registry = new LivePortalRegistry();
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: source,
        extensions: [createLiveExtension({ portalRegistry: registry })],
      }),
    });
    views.push(view);
    host(registry);
    expect(view.dom.querySelectorAll('.cm-live-tabs-widget').length).toBe(2);
    expect([...view.dom.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
      'Outer',
      'Inner',
    ]);
    const editors = view.dom.querySelectorAll<HTMLElement>('.cm-live-tabs-body .cm-editor');
    const innerElement = editors[editors.length - 1];
    if (!innerElement) throw new Error('Nested Tab body missing');
    const inner = EditorView.findFromDOM(innerElement);
    if (!inner) throw new Error('Nested Tab editor missing');
    inner.dispatch({ changes: { from: inner.state.doc.length, insert: '!' } });
    expect(view.state.doc.toString()).toContain('body!\n</Tab>');
  });
});
