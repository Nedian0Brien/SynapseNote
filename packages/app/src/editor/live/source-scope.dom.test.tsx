import { afterEach, describe, expect, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  consumePendingMemoComposerRequest,
  type MemoComposerRequest,
  subscribeToMemoComposerRequests,
} from '@/components/memo-composer-events';
import { EMPTY_DOCUMENT_MEMO_STATE, writeDocumentMemoState } from '@/lib/document-memo-store';
import { requestMemoNavigation } from '../memo-navigation';
import { selectionSnapshotFromSource } from '../selection-context';
import { createLiveExtension } from './live-extension';
import { LivePortalHost, LivePortalRegistry } from './live-portals';
import { createSourceMemos } from './memo-source';
import { hasSourceBinding, positionInSourceRoot, sourceRangeInView } from './source-scope';

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
  consumePendingMemoComposerRequest('scope-review');
  writeDocumentMemoState('scope-review', EMPTY_DOCUMENT_MEMO_STATE);
});
async function mount(source: string) {
  const registry = new LivePortalRegistry();
  const parent = document.createElement('div');
  const host = document.createElement('div');
  document.body.append(parent, host);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        createSourceMemos('scope-review'),
        createLiveExtension({ docName: 'scope-review', portalRegistry: registry }),
      ],
    }),
  });
  views.push(view);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(<LivePortalHost registry={registry} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return view;
}
function child(view: EditorView, selector: string) {
  const dom = view.dom.querySelector<HTMLElement>(selector);
  if (!dom) throw new Error(`Missing ${selector}`);
  const nested = EditorView.findFromDOM(dom);
  if (!nested) throw new Error('Nested view missing');
  return nested;
}
function select(view: EditorView, text: string) {
  const from = view.state.doc.toString().indexOf(text);
  if (from < 0) throw new Error('Text missing');
  act(() => {
    view.dispatch({ selection: { anchor: from, head: from + text.length } });
    view.focus();
  });
}
describe('nested source coordinates', () => {
  test('a table cell Memo uses the document range, paints inside the cell and navigates back', async () => {
    const source = 'before\n\n| A | B |\n| --- | --- |\n| word | after |\n\nend';
    const view = await mount(source);
    const cell = child(view, '.cm-live-table tr:nth-child(2) td:first-child .cm-editor');
    select(cell, 'word');
    const requests: MemoComposerRequest[] = [];
    const stop = subscribeToMemoComposerRequests((request) => requests.push(request));
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      const button = document.querySelector<HTMLButtonElement>(
        '.cm-live-format-toolbar button[aria-label="Memo"]',
      );
      if (!button) throw new Error('Memo button missing');
      act(() => button.click());
      const anchor = requests[0]?.quote.anchor;
      expect(anchor?.from).toBe(source.indexOf('word'));
      expect(anchor?.exact).toBe('word');
      if (!anchor) throw new Error('Anchor missing');
      act(() =>
        writeDocumentMemoState('scope-review', {
          ...EMPTY_DOCUMENT_MEMO_STATE,
          items: [
            {
              id: 'cell-memo',
              body: 'Note',
              quote: { markdown: 'word', anchor },
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        }),
      );
      expect(cell.dom.querySelector('[data-memo-highlight-id="cell-memo"]')?.textContent).toBe(
        'word',
      );
      act(() => {
        cell.dispatch({ selection: { anchor: 0 } });
        requestMemoNavigation({ docName: 'scope-review', memoId: 'cell-memo' });
      });
      expect(
        cell.state.sliceDoc(cell.state.selection.main.from, cell.state.selection.main.to),
      ).toBe('word');
    } finally {
      stop();
    }
  });
  test('moving focus between cells shows only the active selection toolbar', async () => {
    const view = await mount('| A | B |\n| --- | --- |\n| first | second |');
    const first = child(view, '.cm-live-table tr:nth-child(2) td:first-child .cm-editor');
    const second = child(view, '.cm-live-table tr:nth-child(2) td:nth-child(2) .cm-editor');
    select(first, 'first');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    select(second, 'second');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(document.querySelectorAll('.cm-live-format-toolbar [role="toolbar"]').length).toBe(1);
    expect(first.dom.querySelector('[role="toolbar"]')).toBeNull();
    expect(selectionSnapshotFromSource(first, 'scope-review')?.memoAnchor?.exact).toBe('first');
    expect(selectionSnapshotFromSource(view, 'scope-review')?.memoAnchor?.exact).toBe('second');
    expect(second.dom.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  test('MDX, footnote and comment bodies map their selections into the full source', async () => {
    const cases: [string, string][] = [
      [
        'before\n\n<MirrorSource id="source">\n\nword\n\n</MirrorSource>',
        '.cm-live-mdx-body .cm-editor',
      ],
      ['before[^1]\n\n[^1]: first\n    word', '.cm-live-footnote-body .cm-editor'],
      ['before\n\n<!--\nword\n-->', '.cm-live-block-comment-body .cm-editor'],
    ];
    for (const [source, selector] of cases) {
      const view = await mount(source);
      const body = child(view, selector);
      select(body, 'word');
      const snapshot = selectionSnapshotFromSource(body, 'scope-review');
      expect(snapshot?.memoAnchor?.from).toBe(source.indexOf('word'));
      expect(snapshot?.memoAnchor?.exact).toBe('word');
    }
  });

  test('GFM callout boundaries follow a remote prefix edit and inverse mapping', async () => {
    const source = '> [!NOTE]\n> one\n> word';
    const view = await mount(source);
    const body = child(view, '.cm-live-container-body .cm-editor');
    select(body, 'word');
    const local = body.state.selection.main.from;
    expect(positionInSourceRoot(body, local)).toBe(source.indexOf('word'));
    act(() => view.dispatch({ changes: { from: 0, insert: 'remote\n\n' } }));
    expect(positionInSourceRoot(body, local)).toBe(view.state.doc.toString().indexOf('word'));
    const snapshot = selectionSnapshotFromSource(body, 'scope-review');
    expect(snapshot?.memoAnchor?.exact).toBe('word');
    expect(
      sourceRangeInView(body, {
        from: snapshot?.memoAnchor?.from ?? 0,
        to: snapshot?.memoAnchor?.to ?? 0,
      }),
    ).toEqual({ from: local, to: local + 4 });
    act(() => view.destroy());
    views.splice(views.indexOf(view), 1);
    expect(hasSourceBinding(body)).toBe(false);
  });
  test('navigation opens a collapsed accordion without changing its source', async () => {
    const source = '<Accordion title="Closed" defaultOpen={false}>\n\nword\n\n</Accordion>';
    const from = source.indexOf('word');
    writeDocumentMemoState('scope-review', {
      ...EMPTY_DOCUMENT_MEMO_STATE,
      items: [
        {
          id: 'closed-memo',
          body: 'Note',
          quote: {
            markdown: 'word',
            anchor: {
              surface: 'source',
              exact: 'word',
              prefix: source.slice(0, from),
              suffix: source.slice(from + 4),
              from,
              to: from + 4,
            },
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const view = await mount(source);
    await act(async () => {
      requestMemoNavigation({ docName: 'scope-review', memoId: 'closed-memo' });
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const body = child(view, '.cm-live-container-body .cm-editor');
    expect(body.state.sliceDoc(body.state.selection.main.from, body.state.selection.main.to)).toBe(
      'word',
    );
    expect(view.state.doc.toString()).toBe(source);
    expect(view.dom.querySelector('details[open]')).not.toBeNull();
  });

  test('navigation reveals six nested inactive tabs', async () => {
    let source = 'word';
    for (let i = 0; i < 6; i++)
      source = `<Tabs>\n<Tab label="Skip">\nother\n</Tab>\n<Tab label="Deep">\n${source}\n</Tab>\n</Tabs>`;
    const from = source.indexOf('word');
    writeDocumentMemoState('scope-review', {
      ...EMPTY_DOCUMENT_MEMO_STATE,
      items: [
        {
          id: 'deep-memo',
          body: 'Note',
          quote: {
            markdown: 'word',
            anchor: {
              surface: 'source',
              exact: 'word',
              prefix: source.slice(0, from),
              suffix: source.slice(from + 4),
              from,
              to: from + 4,
            },
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const view = await mount(source);
    await act(async () => {
      requestMemoNavigation({ docName: 'scope-review', memoId: 'deep-memo' });
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    const editors = [
      ...view.dom.querySelectorAll<HTMLElement>('.cm-live-tabs-body .cm-editor'),
    ].map((dom) => EditorView.findFromDOM(dom));
    const target = editors.find((editor) => editor?.state.doc.toString() === 'word');
    expect(
      target?.state.sliceDoc(target.state.selection.main.from, target.state.selection.main.to),
    ).toBe('word');
    expect(view.dom.querySelectorAll('.cm-live-tabs-widget').length).toBe(6);
  });

  test('navigation opens a memo in an inactive Tab and composes nested coordinates', async () => {
    const source =
      '<Tabs>\n<Tab label="One">\nfirst\n</Tab>\n<Tab label="Two">\n> [!NOTE]\n> word\n</Tab>\n</Tabs>';
    const from = source.indexOf('word');
    writeDocumentMemoState('scope-review', {
      ...EMPTY_DOCUMENT_MEMO_STATE,
      items: [
        {
          id: 'tab-memo',
          body: 'Note',
          quote: {
            markdown: 'word',
            anchor: {
              surface: 'source',
              exact: 'word',
              prefix: source.slice(0, from),
              suffix: source.slice(from + 4),
              from,
              to: from + 4,
            },
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const view = await mount(source);
    await act(async () => {
      requestMemoNavigation({ docName: 'scope-review', memoId: 'tab-memo' });
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    const body = child(view, '.cm-live-tabs-body .cm-live-container-body .cm-editor');
    expect(body.state.sliceDoc(body.state.selection.main.from, body.state.selection.main.to)).toBe(
      'word',
    );
    expect(positionInSourceRoot(body, body.state.selection.main.from)).toBe(from);
    expect(body.dom.querySelector('[data-memo-highlight-id="tab-memo"]')?.textContent).toBe('word');
  });
});
