import { afterEach, describe, expect, test } from 'bun:test';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  consumePendingMemoComposerRequest,
  type MemoComposerRequest,
  subscribeToMemoComposerRequests,
} from '@/components/memo-composer-events';
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
async function mount(source: string, anchor: number, head: number, docName?: string) {
  const registry = new LivePortalRegistry();
  const parent = document.createElement('div');
  const host = document.createElement('div');
  document.body.append(parent, host);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      selection: { anchor, head },
      extensions: [history(), createLiveExtension({ portalRegistry: registry, docName })],
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
  test('Footnote moves selected source to its definition and undoes both in one step', async () => {
    const view = await mount('a word after', 2, 6);
    act(() => button('Footnote').click());
    expect(view.state.doc.toString()).toBe('a [^1] after\n\n[^1]: word\n');
    act(() => {
      expect(undo(view)).toBe(true);
    });
    expect(view.state.doc.toString()).toBe('a word after');
  });

  test('Memo sends the selected source anchor to the existing composer', async () => {
    const requests: MemoComposerRequest[] = [];
    const stop = subscribeToMemoComposerRequests((request) => requests.push(request));
    try {
      await mount('before word after', 7, 11, 'memo-toolbar-review');
      act(() => button('Memo').click());
      expect(requests[0]?.quote.anchor).toEqual({
        surface: 'source',
        exact: 'word',
        prefix: 'before ',
        suffix: ' after',
        from: 7,
        to: 11,
      });
      expect(requests[0]?.docName).toBe('memo-toolbar-review');
    } finally {
      stop();
      consumePendingMemoComposerRequest('memo-toolbar-review');
    }
  });

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
