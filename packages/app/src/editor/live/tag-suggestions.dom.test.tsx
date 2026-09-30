import { afterEach, describe, expect, test } from 'bun:test';
import { CompletionContext, completionStatus, startCompletion } from '@codemirror/autocomplete';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { createWikiLinkCompletionSource } from '../plugins/wiki-link-source';
import { createLiveExtension } from './live-extension';
import { createLiveTagSource } from './tag-suggestions';

if (typeof Window === 'undefined')
  Object.defineProperty(globalThis, 'Window', { value: window.Window, configurable: true });
const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

function mount(source: string): EditorView {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      selection: { anchor: source.length },
      extensions: [history(), createLiveExtension()],
    }),
  });
  views.push(view);
  return view;
}

describe('live tag and nested suggestions', () => {
  test('shared tag ranking inserts a case-sensitive tag and undoes as one edit', async () => {
    const view = mount('before #pro');
    let fetched = 0;
    const source = createLiveTagSource(
      () => true,
      async () => {
        fetched++;
        return [
          { name: 'project', count: 5, isLeaf: true },
          { name: 'Profile', count: 9, isLeaf: true },
        ];
      },
    );
    const context = new CompletionContext(view.state, view.state.doc.length, true);
    const result = await source(context);
    expect(result?.options.map((option) => option.label)).toEqual(['Profile', 'project', 'pro']);
    const option = result?.options[1];
    if (!result || !option || typeof option.apply !== 'function')
      throw new Error('Tag completion missing');
    option.apply(view, option, result.from, context.pos);
    expect(view.state.doc.toString()).toBe('before #project ');
    expect(view.dom.querySelector('.cm-live-tag')?.textContent).toBe('#project');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('before #pro');
    await source(new CompletionContext(view.state, view.state.doc.length, true));
    expect(fetched).toBe(1);
  });

  test('heading, mid-word, and wiki anchor text do not trigger tags', async () => {
    const source = createLiveTagSource(
      () => true,
      async () => [],
    );
    for (const text of ['# ', 'word#tag', '[[page #tag']) {
      const state = EditorState.create({ doc: text });
      expect(await source(new CompletionContext(state, text.length, true))).toBeNull();
    }
  });

  test('the live inline-code guard also gates the shared wiki picker', async () => {
    const view = mount('`[[page`');
    const position = view.state.doc.length - 1;
    const source = createWikiLinkCompletionSource();
    expect(await source(new CompletionContext(view.state, position, true))).toBeNull();
  });

  test('a nested callout editor owns an active slash completion menu', async () => {
    const view = mount('> [!NOTE]\n> /h2');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const element = view.dom.querySelector<HTMLElement>('.cm-live-container-body .cm-editor');
    if (!element) throw new Error('Nested callout editor missing');
    const nested = EditorView.findFromDOM(element);
    if (!nested) throw new Error('Nested view missing');
    nested.dispatch({ selection: { anchor: nested.state.doc.length } });
    nested.focus();
    expect(startCompletion(nested)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 220));
    expect(completionStatus(nested.state)).toBe('active');
    runScopeHandlers(nested, new KeyboardEvent('keydown', { key: 'Enter' }), 'editor');
    expect(view.state.doc.toString()).toBe('> [!NOTE]\n> ## ');
  });
});
