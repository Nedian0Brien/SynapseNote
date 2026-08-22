import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test } from 'vitest';
import * as Y from 'yjs';
import { createAgentFlashSourceExtension } from './agent-flash-source';

const mountedViews: EditorView[] = [];

afterEach(() => {
  for (const view of mountedViews.splice(0)) view.destroy();
  document.body.replaceChildren();
});

async function flushAnimationDispatch(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('source Writing Tools animation', () => {
  test('decorates only the characters inserted by the agent effect delta', async () => {
    const document = new Y.Doc();
    document.getText('source').insert(0, 'Hello AI');
    const host = window.document.createElement('div');
    window.document.body.appendChild(host);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: 'Hello AI',
        extensions: [createAgentFlashSourceExtension(document)],
      }),
    });
    mountedViews.push(view);

    document.getMap('agent-effects').set('agent-codex:1', {
      sessionId: 'agent-codex',
      timestamp: Date.now() + 1,
      delta: [{ retain: 5 }, { insert: ' AI' }],
      agent_type: 'codex',
      color_seed: 'agent-codex',
    });
    await flushAnimationDispatch();

    expect(view.dom.querySelector('.agent-writing-tools-text')?.textContent).toBe(' AI');
  });
});
