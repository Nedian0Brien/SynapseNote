import { afterEach, describe, expect, test } from 'bun:test';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createLiveExtension } from './live-extension';
import { LivePortalHost, LivePortalRegistry } from './live-portals';

if (typeof Window === 'undefined')
  Object.defineProperty(globalThis, 'Window', { value: window.Window, configurable: true });
if (!window.Range.prototype.getClientRects)
  window.Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
if (!window.Range.prototype.getBoundingClientRect)
  window.Range.prototype.getBoundingClientRect = () => new window.DOMRect();
const views: EditorView[] = [];
const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const view of views.splice(0)) view.destroy();
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});
async function mount(source: string, anchor: number, head: number) {
  const registry = new LivePortalRegistry();
  const parent = document.createElement('div');
  const host = document.createElement('div');
  document.body.append(parent, host);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      selection: { anchor, head },
      extensions: [history(), createLiveExtension({ portalRegistry: registry })],
    }),
  });
  views.push(view);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(<LivePortalHost registry={registry} />);
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return view;
}
function button(label: string) {
  const result = document.querySelector<HTMLButtonElement>(
    `.cm-live-format-toolbar button[aria-label="${label}"]`,
  );
  if (!result) throw new Error(`Missing ${label}`);
  return result;
}

describe('live format toolbar', () => {
  test('formatting uses the mapped selection, updates pressed state, and supports undo', async () => {
    const view = await mount('word after', 0, 4);
    expect(document.querySelector('[role=toolbar]')).not.toBeNull();
    act(() => view.dispatch({ changes: { from: 0, insert: 'remote ' } }));
    act(() => button('Bold').click());
    expect(view.state.doc.toString()).toBe('remote **word** after');
    expect(button('Bold').getAttribute('aria-pressed')).toBe('true');
    act(() => button('Bold').click());
    expect(view.state.doc.toString()).toBe('remote word after');
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe('remote **word** after');
  });
  test('empty selection and selections inside code do not show formatting controls', async () => {
    await mount('plain', 2, 2);
    expect(document.querySelector('[role=toolbar]')).toBeNull();
    await mount('```js\ncode\n```', 6, 10);
    expect(document.querySelector('[role=toolbar]')).toBeNull();
  });
});
