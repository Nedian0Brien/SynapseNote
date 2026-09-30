import { afterEach, describe, expect, mock, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LivePortalHost, LivePortalRegistry } from './live-portals';

mock.module('./link-dialog', () => ({
  LiveLinkDialog: ({
    onSave,
    onClose,
    onRemove,
  }: {
    onSave: (href: string) => void;
    onClose: () => void;
    onRemove?: () => void;
  }) => (
    <div role="dialog">
      <button type="button" onClick={() => onSave('https://new.example')}>
        Save
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      {onRemove ? (
        <button type="button" onClick={onRemove}>
          Remove
        </button>
      ) : null}
    </div>
  ),
}));
const { createLiveExtension } = await import('./live-extension');
const { openLiveLinkEditor } = await import('./link-editor');
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

function mount(source: string, anchor: number, head = anchor) {
  const registry = new LivePortalRegistry();
  const parent = document.createElement('div');
  const target = document.createElement('div');
  document.body.append(parent, target);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      selection: { anchor, head },
      extensions: [createLiveExtension({ portalRegistry: registry })],
    }),
  });
  views.push(view);
  const root = createRoot(target);
  roots.push(root);
  act(() => root.render(<LivePortalHost registry={registry} />));
  return view;
}

async function open(view: EditorView) {
  let claimed = false;
  await act(async () => {
    claimed = runScopeHandlers(
      view,
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
      'editor',
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return claimed;
}

describe('live link editor', () => {
  test('canceling a slash placeholder removes only its mapped unchanged text', async () => {
    const view = mount('link', 0, 4);
    await act(async () => {
      expect(openLiveLinkEditor(view, true)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    act(() => view.dispatch({ changes: { from: 0, insert: 'remote ' } }));
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Cancel',
    );
    if (!cancel) throw new Error('Link dialog missing');
    act(() => cancel.click());
    // A concurrent insertion at the boundary remains outside the placeholder.
    expect(view.state.doc.toString()).toBe('remote ');
  });

  test('saving after a remote deletion does not recreate the removed link', async () => {
    const view = mount('[label](https://old.example)', 3);
    expect(await open(view)).toBe(true);
    act(() =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'remote text' } }),
    );
    const save = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Save',
    );
    if (!save) throw new Error('Link dialog missing');
    act(() => save.click());
    expect(view.state.doc.toString()).toBe('remote text');
  });
  test('maps the source range across a remote prefix edit and preserves rich label and title', async () => {
    const source = 'Before [**label**](https://old.example "Title") after';
    const view = mount(source, source.indexOf('label') + 2);
    expect(await open(view)).toBe(true);
    act(() => view.dispatch({ changes: { from: 0, insert: 'remote ' } }));
    const save = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Save',
    );
    if (!save) throw new Error('Link dialog missing');
    act(() => save.click());
    expect(view.state.doc.toString()).toBe(
      'remote Before [**label**](https://new.example "Title") after',
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  test('adds a link to a selection and leaves Cmd+K with an empty plain caret unclaimed', async () => {
    const view = mount('label after', 0, 5);
    expect(await open(view)).toBe(true);
    const save = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Save',
    );
    if (!save) throw new Error('Link dialog missing');
    act(() => save.click());
    expect(view.state.doc.toString()).toBe('[label](https://new.example) after');
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    expect(await open(view)).toBe(false);
  });
});
