import { type Editor, Extension } from '@tiptap/core';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { afterEach, describe, expect, test } from 'vitest';
import * as Y from 'yjs';
import { mountCollabEditor, mountLightEditor } from '../editor-rig.test-helper';
import { appendToFirstParagraph, seedFragmentParagraph } from '../walk-currency-test-harness';
import {
  agentWritingToolsPluginKey,
  changedRangesFromRemoteTransaction,
  createAgentWritingToolsPlugin,
} from './agent-writing-tools';

const mountedEditors: Editor[] = [];

afterEach(() => {
  for (const editor of mountedEditors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

function mountAgentWritingToolsEditor(document: Y.Doc): Editor {
  const editor = mountLightEditor({
    content: '<p>Hello world</p>',
    extensions: [
      Extension.create({
        name: 'agentWritingToolsTest',
        addProseMirrorPlugins() {
          return [createAgentWritingToolsPlugin(document)];
        },
      }),
    ],
  });
  mountedEditors.push(editor);
  return editor;
}

function dispatchRemoteInsert(editor: Editor, text: string, at: number): void {
  editor.view.dispatch(
    editor.state.tr
      .insertText(text, at, at)
      .setMeta(ySyncPluginKey, { isChangeOrigin: true, isUndoRedoOperation: false }),
  );
}

async function flushAnimationDispatch(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function decorationRanges(editor: Editor): Array<{ from: number; to: number }> {
  return (
    agentWritingToolsPluginKey
      .getState(editor.state)
      ?.decorations.find()
      .map((decoration) => ({ from: decoration.from, to: decoration.to })) ?? []
  );
}

describe('agent Writing Tools animation correlation', () => {
  test('a real same-update Yjs fragment and activity change animates the inserted text', async () => {
    const localDocument = new Y.Doc();
    seedFragmentParagraph(localDocument, 'Hello');
    const editor = mountCollabEditor(localDocument, [
      Extension.create({
        name: 'agentWritingToolsCollabTest',
        addProseMirrorPlugins() {
          return [createAgentWritingToolsPlugin(localDocument)];
        },
      }),
    ]);
    mountedEditors.push(editor);

    const remoteDocument = new Y.Doc();
    Y.applyUpdate(remoteDocument, Y.encodeStateAsUpdate(localDocument));
    remoteDocument.transact(() => {
      appendToFirstParagraph(remoteDocument.getXmlFragment('default'), ' AI');
      remoteDocument.getMap('agent-flash').set('agent-codex', {
        agentId: 'agent-codex',
        timestamp: Date.now() + 1,
        type: 'insert',
      });
    });
    Y.applyUpdate(
      localDocument,
      Y.encodeStateAsUpdate(remoteDocument, Y.encodeStateVector(localDocument)),
      remoteDocument,
    );
    await flushAnimationDispatch();

    expect(editor.state.doc.textContent).toBe('Hello AI');
    expect(decorationRanges(editor)).toEqual([{ from: 6, to: 9 }]);
    expect(editor.view.dom.querySelector('.agent-writing-tools-text')?.textContent).toBe(' AI');
    remoteDocument.destroy();
  });

  test('activity arriving after the CRDT transaction animates only that changed range', async () => {
    const document = new Y.Doc();
    const editor = mountAgentWritingToolsEditor(document);

    dispatchRemoteInsert(editor, 'brave ', 7);
    expect(decorationRanges(editor)).toEqual([]);

    document.getMap('agent-flash').set('agent-codex', {
      agentId: 'agent-codex',
      timestamp: Date.now() + 1,
      type: 'insert',
    });
    await flushAnimationDispatch();

    expect(editor.state.doc.textContent).toBe('Hello brave world');
    expect(decorationRanges(editor)).toEqual([{ from: 7, to: 13 }]);
    expect(editor.view.dom.querySelector('.agent-writing-tools-text')?.textContent).toBe('brave ');
  });

  test('activity arriving before the CRDT transaction arms the next remote change', () => {
    const document = new Y.Doc();
    const editor = mountAgentWritingToolsEditor(document);

    document.getMap('agent-flash').set('agent-claude', {
      agentId: 'agent-claude',
      timestamp: Date.now() + 1,
      type: 'insert',
    });
    dispatchRemoteInsert(editor, 'AI ', 7);

    expect(editor.state.doc.textContent).toBe('Hello AI world');
    expect(decorationRanges(editor)).toEqual([{ from: 7, to: 10 }]);
  });

  test('ordinary user input is never correlated with an agent signal', () => {
    const document = new Y.Doc();
    const editor = mountAgentWritingToolsEditor(document);

    document.getMap('agent-flash').set('agent-codex', {
      agentId: 'agent-codex',
      timestamp: Date.now() + 1,
      type: 'insert',
    });
    editor.view.dispatch(editor.state.tr.insertText('human ', 7, 7));

    expect(editor.state.doc.textContent).toBe('Hello human world');
    expect(decorationRanges(editor)).toEqual([]);
  });
});

describe('changed range extraction', () => {
  test('maps a multi-step remote transaction into final-document coordinates', () => {
    const document = new Y.Doc();
    const editor = mountAgentWritingToolsEditor(document);
    const transaction = editor.state.tr
      .insertText('new ', 7, 7)
      .insertText('very ', 7, 7)
      .setMeta(ySyncPluginKey, { isChangeOrigin: true });

    expect(changedRangesFromRemoteTransaction(transaction)).toEqual([{ from: 7, to: 16 }]);
  });
});
