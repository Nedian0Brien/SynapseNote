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
import { PREVIEW_EMBED_STARTERS } from '@nedian0brien/synapsenote-core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DATABASE_SLASH_COMMAND_EVENT } from '@/lib/database-events';
import { BLANK_HTML_BODY } from '../slash-command/embed-source';
import { createLiveExtension } from './live-extension';
import { LivePortalHost, livePortalRegistryFor } from './live-portals';

if (typeof Window === 'undefined') {
  Object.defineProperty(globalThis, 'Window', { value: window.Window, configurable: true });
}

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
  await act(async () => {
    if (typeof option.apply === 'function') option.apply(view, option, result.from, context.pos);
  });
}

describe('live slash commands', () => {
  test('Footnote inserts its reference and stub in one undo step', async () => {
    const view = mount('a /footnote');
    await complete(view, 'Footnote');
    expect(view.state.doc.toString()).toBe('a [^1]\n\n[^1]: \n');
    expect(view.dom.querySelector('.cm-live-footnote-reference')).not.toBeNull();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('a /footnote');
  });

  test('HTML and all shared preview starters insert their exact source bodies', async () => {
    const blank = mount('/html');
    await complete(blank, 'HTML');
    expect(blank.state.doc.toString()).toBe(`\`\`\`html preview\n${BLANK_HTML_BODY}\n\`\`\`\n\n`);
    for (const starter of PREVIEW_EMBED_STARTERS) {
      const view = mount(`/${starter.id}`);
      await complete(view, starter.title);
      expect(view.state.doc.toString()).toBe(`\`\`\`html preview\n${starter.html}\n\`\`\`\n\n`);
    }
  });

  test('Callout uses explicit defaults, renders a widget, and is undone in one step', async () => {
    const view = mount('/callout');
    await complete(view, 'Callout');
    expect(view.state.doc.toString()).toContain('<Callout type="note"');
    expect(view.state.doc.toString()).not.toContain('title=');
    expect(view.dom.querySelector('.cm-live-container-widget .callout')).not.toBeNull();
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('/callout');
  });

  test('Tabs seeds two labeled panels and image attributes do not invent dimensions', async () => {
    const tabs = mount('/tabs');
    await complete(tabs, 'Tabs');
    expect(tabs.state.doc.toString()).toContain('<Tab label="Tab 1">');
    expect(tabs.state.doc.toString()).toContain('<Tab label="Tab 2">');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(<LivePortalHost registry={livePortalRegistryFor(tabs)} />));
    expect(tabs.dom.querySelector('.cm-live-tabs-widget')).not.toBeNull();
    const image = mount('/image');
    await complete(image, 'Image');
    expect(image.state.doc.toString()).toContain('<img src=""');
    expect(image.state.doc.toString()).not.toMatch(/width=|height=/);
  });

  test('new database opens the existing app flow and removes only the slash trigger', async () => {
    const commands: string[] = [];
    const listener = (event: Event) => commands.push((event as CustomEvent<string>).detail);
    window.addEventListener(DATABASE_SLASH_COMMAND_EVENT, listener);
    try {
      const view = mount('before /database');
      await complete(view, 'New database');
      expect(view.state.doc.toString()).toBe('before ');
      expect(commands).toEqual(['new']);
    } finally {
      window.removeEventListener(DATABASE_SLASH_COMMAND_EVENT, listener);
    }
  });

  test('linked database inserts its picker and inline creation receives a fresh ID', async () => {
    const linked = mount('/linked');
    await complete(linked, 'Linked database');
    expect(linked.state.doc.toString()).toContain('<DatabaseView mode="inline" />');
    const first = mount('/inline');
    const second = mount('/inline');
    await complete(first, 'Inline database');
    await complete(second, 'Inline database');
    expect(first.state.doc.toString()).toContain('create="blank"');
    const creationId = /creationId="([^"]+)"/.exec(first.state.doc.toString())?.[1];
    expect(creationId).toBeTruthy();
    expect(second.state.doc.toString()).not.toContain(`creationId="${creationId}"`);
  });

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
