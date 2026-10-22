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
import { mergeAgentWritingToolsPreviewRects } from './agent-writing-tools-preview';

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

async function flushPreviewFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

function installPreviewGeometry(editor: Editor): () => void {
  const host = editor.view.dom.parentElement;
  if (!host) throw new Error('expected editor host');
  const originalRangeRects = window.Range.prototype.getClientRects;
  const originalEditorRect = editor.view.dom.getBoundingClientRect;
  const originalHostRect = host.getBoundingClientRect;
  const originalBlockRects = [...editor.view.dom.children].map(
    (child) => (child as HTMLElement).getBoundingClientRect,
  );
  Object.defineProperty(window.Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [rect(120, 140, 180, 22), rect(120, 162, 220, 22), rect(120, 184, 160, 22)],
  });
  editor.view.dom.getBoundingClientRect = () => rect(100, 100, 440, 260);
  host.getBoundingClientRect = () => rect(90, 90, 460, 280);
  for (const child of editor.view.dom.children) {
    (child as HTMLElement).getBoundingClientRect = () => rect(110, 132, 410, 86);
  }
  return () => {
    Object.defineProperty(window.Range.prototype, 'getClientRects', {
      configurable: true,
      value: originalRangeRects,
    });
    editor.view.dom.getBoundingClientRect = originalEditorRect;
    host.getBoundingClientRect = originalHostRect;
    [...editor.view.dom.children].forEach((child, index) => {
      (child as HTMLElement).getBoundingClientRect = originalBlockRects[index];
    });
  };
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
    const restoreGeometry = installPreviewGeometry(editor);

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
    await flushPreviewFrame();

    expect(editor.state.doc.textContent).toBe('Hello AI');
    expect(decorationRanges(editor)).toEqual([{ from: 6, to: 9 }]);
    expect(editor.view.dom.querySelector('.agent-writing-tools-live-text')?.textContent).toBe(
      ' AI',
    );
    const previewLines = editor.view.dom.parentElement?.querySelectorAll(
      '.agent-writing-tools-preview-line',
    );
    expect(previewLines?.length).toBe(3);
    expect(
      (previewLines?.[2] as HTMLElement | undefined)?.style.getPropertyValue(
        '--agent-writing-tools-line-index',
      ),
    ).toBe('2');
    expect(
      previewLines?.[0]?.querySelectorAll('.agent-writing-tools-preview-snapshot').length,
    ).toBe(2);
    restoreGeometry();
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
    expect(editor.view.dom.querySelector('.agent-writing-tools-live-text')?.textContent).toBe(
      'brave ',
    );
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

describe('preview line geometry', () => {
  test('merges adjacent fragments on one visual line without merging separate lines', () => {
    expect(
      mergeAgentWritingToolsPreviewRects([
        rect(100, 20, 40, 18),
        rect(140, 20.4, 35, 18),
        rect(100, 42, 80, 18),
      ]),
    ).toEqual([
      { left: 100, top: 20, right: 175, bottom: 38.4, width: 75, height: 18.4 },
      { left: 100, top: 42, right: 180, bottom: 60, width: 80, height: 18 },
    ]);
  });
});
