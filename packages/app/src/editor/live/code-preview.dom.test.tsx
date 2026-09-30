import { afterEach, describe, expect, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createLiveExtension } from './live-extension';
import { LivePortalHost, LivePortalRegistry } from './live-portals';

if (typeof Window === 'undefined')
  Object.defineProperty(globalThis, 'Window', { value: window.Window, configurable: true });
const views: EditorView[] = [];
const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const view of views.splice(0)) view.destroy();
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});
function mount(source: string) {
  const registry = new LivePortalRegistry();
  const parent = document.createElement('div');
  const host = document.createElement('div');
  document.body.append(parent, host);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [createLiveExtension({ portalRegistry: registry })],
    }),
  });
  views.push(view);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<LivePortalHost registry={registry} />));
  return view;
}
function button(view: EditorView, text: string) {
  const result = [...view.dom.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === text,
  );
  if (!result) throw new Error(`Missing ${text}`);
  return result;
}

describe('live HTML preview', () => {
  test('preview uses the shared header and tracks source positions without replacing its iframe', () => {
    const source = 'before\n\n~~~html preview h=240px title="Keep"\n<p>hello</p>\n~~~';
    const view = mount(source);
    const frame = view.dom.querySelector<HTMLIFrameElement>('iframe');
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame?.srcdoc).toContain('Content-Security-Policy');
    expect(frame?.srcdoc).toContain('<p>hello</p>');
    expect(view.dom.querySelector<HTMLTextAreaElement>('textarea')?.hidden).toBe(true);
    act(() => view.dispatch({ changes: { from: 0, insert: 'remote ' } }));
    expect(view.dom.querySelector('iframe')).toBe(frame);
    act(() => button(view, 'Hide preview').click());
    expect(view.state.doc.toString()).toBe(
      'remote before\n\n~~~html h=240px title="Keep"\n<p>hello</p>\n~~~',
    );
    expect(view.dom.querySelector<HTMLTextAreaElement>('textarea')?.hidden).toBe(false);
  });

  test('changing the title updates only metadata and normal code registers no preview portal', () => {
    const view = mount('```html preview\n<p>keep</p>\n```');
    const title = view.dom.querySelector<HTMLInputElement>('[aria-label="Preview title"]');
    if (!title) throw new Error('Title control missing');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        title,
        'Review',
      );
      title.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(view.state.doc.toString()).toBe('```html title="Review" preview\n<p>keep</p>\n```');
    const code = mount('```js\nconst n = 1;\n```');
    expect(code.dom.querySelector('iframe')).toBeNull();
    expect(code.dom.querySelector('textarea')?.value).toBe('const n = 1;');
  });
});
