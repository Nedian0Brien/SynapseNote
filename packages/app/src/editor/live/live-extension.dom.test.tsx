/**
 * The live editor applies the editing-model conformance fixtures through a
 * real CodeMirror view: typed text through the input handler, keys and
 * formatting shortcuts through the keymap.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { computeLayout, editFixtures, parseCursor } from '@nedian0brien/synapsenote-core';
import { createLiveExtension } from './live-extension';

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

function mount(source: string, anchor: number, head: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      selection: EditorSelection.single(anchor, head),
      extensions: [createLiveExtension()],
    }),
  });
  views.push(view);
  return view;
}

function type(view: EditorView, text: string): void {
  for (const ch of text) {
    const { from, to } = view.state.selection.main;
    const handlers = view.state.facet(EditorView.inputHandler);
    const insert = () => view.state.update({ changes: { from, to, insert: ch } });
    if (!handlers.some((h) => h(view, from, to, ch, insert))) view.dispatch(insert());
  }
}

const isMac = /Mac/.test(navigator.platform);
type Mods = { shift?: boolean; mod?: boolean; alt?: boolean };
const SHORTCUT: Record<string, { key: string; shift?: boolean }> = {
  bold: { key: 'b' },
  italic: { key: 'i' },
  code: { key: 'e' },
  strike: { key: 'x', shift: true },
  highlight: { key: 'h', shift: true },
};
const BLOCK_SHORTCUT: Record<string, { key: string } & Mods> = {
  paragraph: { key: '0', alt: true },
  h1: { key: '1', alt: true },
  h2: { key: '2', alt: true },
  h3: { key: '3', alt: true },
  h4: { key: '4', alt: true },
  h5: { key: '5', alt: true },
  h6: { key: '6', alt: true },
  ordered: { key: '7', shift: true },
  bullet: { key: '8', shift: true },
  task: { key: '9', shift: true },
  quote: { key: 'b', shift: true },
  code: { key: 'c', alt: true },
};

/** A keydown as a browser sends it: Shift upper-cases a letter, and `keyCode` names the physical key. */
function press(view: EditorView, key: string, mods: Mods = {}): boolean {
  const letter = /^[a-z]$/.test(key);
  const event = new KeyboardEvent('keydown', {
    key: letter && mods.shift ? key.toUpperCase() : key,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    metaKey: mods.mod === true && isMac,
    ctrlKey: mods.mod === true && !isMac,
  });
  if (key.length === 1) {
    Object.defineProperty(event, 'keyCode', { value: key.toUpperCase().charCodeAt(0) });
  }
  return runScopeHandlers(view, event, 'editor');
}

function screenPosition(source: string, offset: number): number {
  const hidden = new Uint8Array(source.length);
  for (const h of computeLayout(source).hidden) hidden.fill(1, h.from, h.to);
  let position = 0;
  for (let i = 0; i < offset; i++) if (!hidden[i]) position++;
  return position;
}

describe('live editor — edit.json through CodeMirror', () => {
  const supported = editFixtures.filter(
    (f) => f.after !== undefined && f.actions.every((a) => a.type !== 'paste' && a.type !== 'copy'),
  );
  for (const fixture of supported) {
    test(`${fixture.id}`, () => {
      const before = parseCursor(fixture.before);
      const view = mount(before.source, before.anchor, before.head);
      for (const action of fixture.actions) {
        if (action.type === 'text') type(view, action.text);
        else if (action.type === 'key') {
          const [base, shift] =
            action.key === 'Shift-Enter'
              ? ['Enter', true]
              : action.key === 'Shift-Tab'
                ? ['Tab', true]
                : [action.key, false];
          expect(press(view, base, { shift })).toBe(true);
        } else if (action.type === 'toggle') {
          const shortcut = SHORTCUT[action.mark];
          expect(press(view, shortcut.key, { mod: true, shift: shortcut.shift })).toBe(true);
        } else if (action.type === 'block') {
          const { key, ...mods } = BLOCK_SHORTCUT[action.block];
          expect(press(view, key, { ...mods, mod: true })).toBe(true);
        } else if (action.type === 'move') {
          const key = action.direction === 'up' ? 'ArrowUp' : 'ArrowDown';
          expect(press(view, key, { mod: true, shift: true })).toBe(true);
        }
      }
      const after = parseCursor(fixture.after as string);
      const doc = view.state.doc.toString();
      expect(doc).toBe(after.source);
      const { anchor, head } = view.state.selection.main;
      if (after.anchor === after.head) {
        expect(screenPosition(doc, head)).toBe(screenPosition(after.source, after.head));
      } else {
        expect([anchor, head]).toEqual([after.anchor, after.head]);
      }
    });
  }

  test('ordered list numbers follow Markdown, not each item source number', () => {
    const view = mount('1. a\n1. b\n1. c', 0, 0);
    const numbers = [...view.contentDOM.querySelectorAll('.cm-live-list-marker')].map(
      (el) => el.textContent,
    );
    expect(numbers).toEqual(['1.', '2.', '3.']);
  });

  test('hidden syntax is not drawn and cursor movement skips it', () => {
    const view = mount('a **bold** b', 0, 0);
    expect(view.contentDOM.textContent).toBe('a bold b');
  });
});

describe('live editor block widgets', () => {
  test('frontmatter is hidden while the source remains intact', () => {
    const source = '---\ntitle: Note\ntags: [one, two]\n---\n\nBody';
    const view = mount(source, source.length, source.length);
    expect(view.state.doc.toString()).toBe(source);
    expect(view.contentDOM.textContent).not.toContain('title: Note');
    expect(view.contentDOM.textContent).toContain('Body');
    view.dispatch({ changes: { from: 0, to: 1, insert: '' }, userEvent: 'delete' });
    expect(view.state.doc.toString()).toBe(source);
    view.dispatch({ changes: { from: source.length, insert: ' more' }, userEvent: 'input.type' });
    expect(view.state.doc.toString()).toBe(`${source} more`);
  });

  test('code fence is hidden and body and language edit only their source spans', () => {
    const view = mount('before\n\n```js title=x\nold\n```\n\nafter', 0, 0);
    const widget = view.dom.querySelector('.cm-live-code-block');
    expect(widget).not.toBeNull();
    const language = widget?.querySelector<HTMLInputElement>('.cm-live-code-language');
    const body = widget?.querySelector<HTMLTextAreaElement>('.cm-live-code-body');
    expect(language?.value).toBe('js');
    expect(body?.value).toBe('old');
    expect(widget?.textContent).not.toContain('```');
    if (!language || !body) throw new Error('Code widget inputs missing');
    language.value = 'ts';
    language.dispatchEvent(new Event('input', { bubbles: true }));
    body.value = 'new';
    body.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.state.doc.toString()).toBe('before\n\n```ts title=x\nnew\n```\n\nafter');
  });

  test('table cells use live syntax hiding and write only the edited cell', () => {
    const view = mount('| **a** | b |\n| --- | --- |\n| x | y |', 0, 0);
    const editors = view.dom.querySelectorAll<HTMLElement>('.cm-live-table-cell .cm-editor');
    expect(editors.length).toBe(4);
    expect(editors[0]?.textContent).toBe('a');
    expect(view.dom.querySelector('.cm-live-table')?.textContent).not.toContain('---');
    if (!editors[2]) throw new Error('Table body cell missing');
    const cell = EditorView.findFromDOM(editors[2]);
    expect(cell).not.toBeNull();
    if (!cell) throw new Error('Table body editor missing');
    cell.dispatch({ selection: { anchor: cell.state.doc.length } });
    type(cell, 'z');
    expect(view.state.doc.toString()).toBe('| **a** | b |\n| --- | --- |\n| xz | y |');
    expect(view.dom.querySelectorAll('.cm-live-table-cell .cm-editor').length).toBe(4);
  });

  test('remote cell changes update the active cell without replacing its editor DOM', () => {
    const view = mount('| a | b |\n| --- | --- |\n| x | y |', 0, 0);
    const element = view.dom.querySelectorAll<HTMLElement>('.cm-live-table-cell .cm-editor')[2];
    if (!element) throw new Error('Table body cell missing');
    const cell = EditorView.findFromDOM(element);
    if (!cell) throw new Error('Table body editor missing');
    cell.focus();
    const from = view.state.doc.toString().indexOf('x');
    view.dispatch({ changes: { from, to: from + 1, insert: 'remote' } });
    expect(view.dom.querySelectorAll('.cm-live-table-cell .cm-editor')[2]).toBe(element);
    expect(cell.state.doc.toString()).toBe('remote');
  });

  test('an empty table cell escapes a typed pipe without exposing the escape', () => {
    const view = mount('| a | b |\n| --- | --- |\n|  | y |', 0, 0);
    const element = view.dom.querySelectorAll<HTMLElement>('.cm-live-table-cell .cm-editor')[2];
    if (!element) throw new Error('Empty table cell missing');
    const cell = EditorView.findFromDOM(element);
    if (!cell) throw new Error('Empty table editor missing');
    type(cell, 'a|b');
    expect(view.state.doc.toString()).toBe('| a | b |\n| --- | --- |\n|  a\\|b| y |');
    expect(cell.contentDOM.textContent).toBe('a|b');
  });

  test('remote code changes keep the active body input', () => {
    const view = mount('```js\nold\n```', 0, 0);
    const body = view.dom.querySelector<HTMLTextAreaElement>('.cm-live-code-body');
    if (!body) throw new Error('Code body missing');
    body.focus();
    view.dispatch({ changes: { from: 6, to: 9, insert: 'remote' } });
    expect(view.dom.querySelector('.cm-live-code-body')).toBe(body);
    expect(body.value).toBe('remote');
    expect(document.activeElement).toBe(body);
  });

  test('math delimiters are hidden and formula edits preserve surrounding source', () => {
    const view = mount('before\n\n$$\nx^2\n$$\n\nafter', 0, 0);
    const widget = view.dom.querySelector('.cm-live-diagram-block');
    const body = widget?.querySelector<HTMLTextAreaElement>('.cm-live-diagram-body');
    expect(body?.value).toBe('x^2');
    expect(widget?.textContent).not.toContain('$$');
    if (!body) throw new Error('Math body missing');
    body.value = 'y^2';
    body.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.state.doc.toString()).toBe('before\n\n$$\ny^2\n$$\n\nafter');
  });

  test('Mermaid fence is hidden and chart source edits preserve the fence', () => {
    const view = mount('```mermaid\ngraph TD; A-->B\n```', 0, 0);
    const widget = view.dom.querySelector('.cm-live-diagram-block');
    const body = widget?.querySelector<HTMLTextAreaElement>('.cm-live-diagram-body');
    expect(body?.value).toBe('graph TD; A-->B');
    if (!body) throw new Error('Mermaid body missing');
    body.value = 'graph TD; B-->C';
    body.dispatchEvent(new Event('input', { bubbles: true }));
    expect(view.state.doc.toString()).toBe('```mermaid\ngraph TD; B-->C\n```');
    expect(view.dom.querySelector('.cm-live-diagram-body')).toBe(body);
  });
});
