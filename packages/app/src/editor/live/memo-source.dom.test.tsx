import { afterEach, describe, expect, test } from 'bun:test';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  type DocumentMemoAnchor,
  EMPTY_DOCUMENT_MEMO_STATE,
  writeDocumentMemoState,
} from '@/lib/document-memo-store';
import { requestMemoNavigation } from '../memo-navigation';
import { createSourceMemos, resolveSourceMemoAnchor } from './memo-source';

if (typeof Window === 'undefined')
  Object.defineProperty(globalThis, 'Window', { value: window.Window, configurable: true });
const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});
const anchor: DocumentMemoAnchor = {
  surface: 'source',
  exact: 'word',
  prefix: 'before ',
  suffix: ' after',
  from: 7,
  to: 11,
};
describe('source memos', () => {
  test('resolves the stored range, relocated text and repeated passages by context', () => {
    expect(resolveSourceMemoAnchor('before word after', anchor)).toEqual({ from: 7, to: 11 });
    expect(resolveSourceMemoAnchor('word other\nremote before word after', anchor)).toEqual({
      from: 25,
      to: 29,
    });
    expect(resolveSourceMemoAnchor('deleted text', anchor)).toBeNull();
  });
  test('stored source memos draw, map through remote edits and navigate to their current range', () => {
    const docName = 'memo-source-review';
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: 'before word after',
        extensions: [createSourceMemos(docName)],
      }),
    });
    views.push(view);
    writeDocumentMemoState(docName, {
      ...EMPTY_DOCUMENT_MEMO_STATE,
      items: [
        {
          id: 'memo',
          body: 'Note',
          quote: { markdown: 'word', anchor },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    expect(view.dom.querySelector('[data-memo-highlight-id="memo"]')?.textContent).toBe('word');
    view.dispatch({ changes: { from: 0, insert: 'remote ' } });
    requestMemoNavigation({ docName, memoId: 'memo' });
    expect([view.state.selection.main.from, view.state.selection.main.to]).toEqual([14, 18]);
    writeDocumentMemoState(docName, EMPTY_DOCUMENT_MEMO_STATE);
    expect(view.dom.querySelector('[data-memo-highlight-id]')).toBeNull();
  });
});
