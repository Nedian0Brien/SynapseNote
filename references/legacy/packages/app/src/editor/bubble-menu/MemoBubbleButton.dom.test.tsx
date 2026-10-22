import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Schema } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import {
  consumePendingDocPanelTabRequest,
  subscribeToDocPanelTabRequests,
} from '@/components/doc-panel-events';
import {
  consumePendingMemoComposerRequest,
  type MemoComposerRequest,
  subscribeToMemoComposerRequests,
} from '@/components/memo-composer-events';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';
import { setEditorDocName } from '../extensions/doc-context';

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({ t: renderLinguiTemplate }),
}));

const { MemoBubbleButton } = await import('./MemoBubbleButton');

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
});

function makeEditor(docName: string | null, text: string, collapsed = false): Editor {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);
  const from = 1;
  const to = collapsed ? from : from + text.length;
  const editor = {
    state: {
      schema,
      doc,
      selection: {
        empty: collapsed,
        from,
        to,
        content: () => doc.slice(from, to),
      },
    },
  } as unknown as Editor;
  setEditorDocName(editor, docName);
  return editor;
}

let memoRequests: MemoComposerRequest[] = [];
let panelTabs: string[] = [];
let unsubscribeMemo: (() => void) | null = null;
let unsubscribePanel: (() => void) | null = null;

beforeEach(() => {
  window.localStorage.clear();
  memoRequests = [];
  panelTabs = [];
  consumePendingMemoComposerRequest('notes/today');
  consumePendingDocPanelTabRequest();
  unsubscribeMemo = subscribeToMemoComposerRequests((request) => memoRequests.push(request));
  unsubscribePanel = subscribeToDocPanelTabRequests((tab) => panelTabs.push(tab));
});

afterEach(() => {
  window.localStorage.clear();
  unsubscribeMemo?.();
  unsubscribePanel?.();
  unsubscribeMemo = null;
  unsubscribePanel = null;
  consumePendingMemoComposerRequest('notes/today');
  consumePendingDocPanelTabRequest();
  cleanup();
});

describe('MemoBubbleButton', () => {
  test('opens the Memo panel with the selected passage attached', async () => {
    const user = userEvent.setup();
    render(<MemoBubbleButton editor={makeEditor('notes/today', 'A selected passage.')} />);

    const button = screen.getByRole('button', { name: 'Memo' });
    expect(button.textContent).toContain('Memo');
    await user.click(button);

    expect(panelTabs).toEqual(['memo']);
    expect(memoRequests).toHaveLength(1);
    expect(memoRequests[0]).toEqual({
      docName: 'notes/today',
      quote: {
        markdown: 'A selected passage.',
        sourceLineStart: undefined,
        sourceLineEnd: undefined,
        anchor: {
          surface: 'wysiwyg',
          exact: 'A selected passage.',
          prefix: '',
          suffix: '',
          from: 1,
          to: 20,
        },
      },
    });
    expect(consumePendingMemoComposerRequest('notes/today')).toEqual(memoRequests[0]);
  });

  test('does nothing when the editor has no document identity', async () => {
    const user = userEvent.setup();
    render(<MemoBubbleButton editor={makeEditor(null, 'A selected passage.')} />);

    await user.click(screen.getByRole('button', { name: 'Memo' }));

    expect(panelTabs).toEqual([]);
    expect(memoRequests).toEqual([]);
  });

  test('does not add a second Highlight button beside Memo', () => {
    render(<MemoBubbleButton editor={makeEditor('notes/today', 'Highlight this passage.')} />);
    expect(screen.queryByRole('button', { name: 'Highlight' })).toBeNull();
  });
});
