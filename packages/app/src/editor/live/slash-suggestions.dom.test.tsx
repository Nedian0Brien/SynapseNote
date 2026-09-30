import { afterEach, describe, expect, test } from 'bun:test';
import {
  autocompletion,
  CompletionContext,
  type CompletionResult,
  completionStatus,
  startCompletion,
} from '@codemirror/autocomplete';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { createLiveExtension } from './live-extension';

if (typeof Window === 'undefined') {
  Object.defineProperty(globalThis, 'Window', { value: window.Window, configurable: true });
}

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
      extensions: [history(), autocompletion(), createLiveExtension()],
    }),
  });
  views.push(view);
  return view;
}

async function complete(view: EditorView, name: string): Promise<void> {
  const context = new CompletionContext(view.state, view.state.selection.main.head, true);
  const results = await Promise.all(
    view.state.languageDataAt('autocomplete', context.pos).map((source) => source(context)),
  );
  const result = results.find((item: CompletionResult | null) =>
    item?.options.some((option) => option.label === name),
  ) as CompletionResult | undefined;
  if (!result) throw new Error(`Missing result ${name}`);
  const option = result.options.find((item) => item.label === name);
  if (!option || typeof option.apply !== 'function') throw new Error(`Missing command ${name}`);
  option.apply(view, option, result.from, context.pos);
}

describe('live slash commands', () => {
  test('the completion menu settles and Enter selects before the live Enter command', async () => {
    const view = mount('/h2');
    view.focus();
    expect(startCompletion(view)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(completionStatus(view.state)).toBe('active');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(runScopeHandlers(view, new KeyboardEvent('keydown', { key: 'Enter' }), 'editor')).toBe(
      true,
    );
    expect(view.state.doc.toString()).toBe('## ');
  });
  test('heading selection removes the trigger and is undone in one step', async () => {
    const view = mount('/h2');
    await complete(view, 'Heading 2');
    expect(view.state.doc.toString()).toBe('## ');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('/h2');
  });

  test('table selection inserts a rendered table block', async () => {
    const view = mount('/table');
    await complete(view, 'Table');
    expect(view.state.doc.toString()).toContain('| --- | --- |');
    expect(view.dom.querySelector('.cm-live-table')).not.toBeNull();
  });

  test('a code block does not offer slash commands', async () => {
    const view = mount('```\n/table\n```');
    const position = view.state.doc.toString().indexOf('/table') + 6;
    const context = new CompletionContext(view.state, position, true);
    const results = await Promise.all(
      view.state.languageDataAt('autocomplete', position).map((source) => source(context)),
    );
    expect(results.every((result) => result === null)).toBe(true);
  });
});
