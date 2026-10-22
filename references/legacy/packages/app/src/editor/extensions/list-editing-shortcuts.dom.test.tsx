import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import {
  sharedExtensions as coreExtensions,
  MarkdownManager,
} from '@nedian0brien/synapsenote-core';
import { Editor, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { installDomGlobals } from '../walk-currency-test-harness';
import { sharedExtensions } from './shared';

const markdown = new MarkdownManager({ extensions: coreExtensions });
const editors: Editor[] = [];
let restoreDomGlobals: (() => void) | null = null;

beforeAll(() => {
  restoreDomGlobals = installDomGlobals();
});

afterAll(() => {
  restoreDomGlobals?.();
  restoreDomGlobals = null;
});

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
  document.body.replaceChildren();
});

function mountEditor(source: string): Editor {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = new Editor({
    element: host,
    content: markdown.parse(source) as JSONContent,
    extensions: sharedExtensions,
  });
  editors.push(editor);
  return editor;
}

function itemTextRange(editor: Editor, itemIndex: number): { from: number; to: number } {
  let seen = 0;
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range !== null) return false;
    if (node.type.name !== 'listItem') return true;
    if (seen === itemIndex) {
      const paragraph = node.firstChild;
      const from = pos + 2;
      range = { from, to: from + (paragraph?.content.size ?? 0) };
      return false;
    }
    seen += 1;
    return true;
  });
  if (range === null) throw new Error(`listItem ${itemIndex} not found`);
  return range;
}

function press(editor: Editor, key: string, shiftKey = false): unknown {
  const event = new KeyboardEvent('keydown', {
    key,
    code: key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event));
}

function serialize(editor: Editor): string {
  return markdown.serialize(editor.getJSON() as JSONContent);
}

describe('Markdown list editing shortcuts', () => {
  test.each([
    ['bullet', '- one\n- two', /^ {2}- two$/m],
    ['ordered', '1. one\n2. two', /^ {3}2\. two$/m],
    ['task', '- [ ] one\n- [x] two', /^ {2}- \[x\] two$/m],
  ])('Tab indents the selected %s list sentence', (_kind, source, nestedPattern) => {
    const editor = mountEditor(source);
    const range = itemTextRange(editor, 1);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from, range.to)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    expect(serialize(editor)).toMatch(nestedPattern);
  });

  test.each([
    ['bullet', '1. parent\n\n- child', /^ {3}- child$/m],
    ['ordered', '- parent\n\n1. child', /^ {2}1\. child$/m],
    ['task', '1. parent\n\n- [ ] child', /^ {3}- \[ \] child$/m],
  ])('Tab indents an adjacent %s list beneath a differently marked list', (_kind, source, nestedPattern) => {
    const editor = mountEditor(source);
    const range = itemTextRange(editor, 1);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from, range.to)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    expect(serialize(editor)).toMatch(nestedPattern);
    expect(editor.state.selection.from).toBeLessThan(editor.state.selection.to);
  });

  test('Tab moves only the first item across an adjacent list boundary', () => {
    const editor = mountEditor('1. parent\n\n- child\n- sibling');
    const range = itemTextRange(editor, 1);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    const output = serialize(editor);
    expect(output).toMatch(/^ {3}- child$/m);
    expect(output).toMatch(/^- sibling$/m);
  });

  test('Tab indents every selected list item and preserves their child lists', () => {
    const source =
      '1. parent\n   - existing\n\n- first\n  - first detail\n- second\n  - second detail\n- third';
    const editor = mountEditor(source);
    const first = itemTextRange(editor, 2);
    const third = itemTextRange(editor, 6);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, first.from, third.to)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    const parent = editor.state.doc.firstChild?.firstChild;
    const nested = parent?.lastChild;
    expect(nested?.type.name).toBe('list');
    expect(nested?.childCount).toBe(4);
    expect(nested?.child(1).lastChild?.firstChild?.textContent).toBe('first detail');
    expect(nested?.child(2).lastChild?.firstChild?.textContent).toBe('second detail');
    expect(
      editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '\n'),
    ).toBe('first\nfirst detail\nsecond\nsecond detail\nthird');

    expect(press(editor, 'Tab', true)).toBe(true);
    expect(serialize(editor).trimEnd()).toBe(source);
  });

  test('Tab leaves unselected trailing list items at their original level', () => {
    const editor = mountEditor('1. parent\n\n- first\n  - detail\n- second\n- third');
    const first = itemTextRange(editor, 1);
    const second = itemTextRange(editor, 3);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, first.from, second.to)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    const parent = editor.state.doc.firstChild?.firstChild;
    expect(parent?.lastChild?.childCount).toBe(2);
    expect(serialize(editor)).toMatch(/^- third$/m);
  });

  test('Tab nests the empty bullet item used to start a child list', () => {
    const editor = mountEditor('1. parent\n\n- ');
    const range = itemTextRange(editor, 1);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    // TipTap keeps a trailing paragraph after a final empty block so the caret
    // can leave the list. The two list nodes themselves must still collapse
    // into one nested structure.
    expect(editor.state.doc.childCount).toBe(2);
    const parentItem = editor.state.doc.firstChild?.lastChild;
    expect(parentItem?.lastChild?.type.name).toBe('list');
    expect(parentItem?.lastChild?.attrs.ordered).toBe(false);
    expect(parentItem?.lastChild?.firstChild?.textContent).toBe('');
  });

  test('Shift-Tab restores a mixed-marker item after crossing the boundary', () => {
    const editor = mountEditor('1. parent\n\n- child');
    const range = itemTextRange(editor, 1);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    expect(press(editor, 'Tab', true)).toBe(true);
    expect(serialize(editor).trimEnd()).toBe('1. parent\n\n- child');
  });

  test('Tab preserves an existing differently marked nested list', () => {
    const editor = mountEditor('1. parent\n   1. existing\n\n- child');
    const range = itemTextRange(editor, 2);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    const parent = editor.state.doc.firstChild?.firstChild;
    expect(parent?.childCount).toBe(3);
    expect(parent?.child(1).attrs.ordered).toBe(true);
    expect(parent?.child(2).attrs.ordered).toBe(false);
    expect(serialize(editor)).toMatch(/^ {3}- child$/m);
  });

  test('Tab appends to a matching child list and Shift-Tab restores the boundary', () => {
    const source = '1. parent\n   - existing\n\n- child';
    const editor = mountEditor(source);
    const range = itemTextRange(editor, 2);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    const parent = editor.state.doc.firstChild?.firstChild;
    expect(parent?.childCount).toBe(2);
    expect(parent?.lastChild?.childCount).toBe(2);

    expect(press(editor, 'Tab', true)).toBe(true);
    expect(serialize(editor).trimEnd()).toBe(source);
  });

  test('Shift-Tab reverses one list indentation level', () => {
    const editor = mountEditor('- one\n  - two');
    const range = itemTextRange(editor, 1);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from)),
    );

    expect(press(editor, 'Tab', true)).toBe(true);
    expect(serialize(editor)).toMatch(/^- two$/m);
  });

  test.each([
    ['bullet', '- one\n- two\n- three'],
    ['ordered', '1. one\n2. two\n3. three'],
    ['task', '- [ ] one\n- [x] two\n- [ ] three'],
  ])('Backspace at the start converts a %s item to a plain paragraph', (_kind, source) => {
    const editor = mountEditor(source);
    const range = itemTextRange(editor, 1);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from)),
    );

    expect(press(editor, 'Backspace')).toBe(true);
    const output = serialize(editor);
    expect(output).toMatch(/^two$/m);
    expect(output).not.toMatch(/^\s*(?:[-+*]|\d+[.)])(?:\s+\[[ xX]\])?\s+two$/m);
  });

  test('Backspace fully removes a nested item from list structure', () => {
    const editor = mountEditor('- one\n  - two');
    const range = itemTextRange(editor, 1);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from)),
    );

    expect(press(editor, 'Backspace')).toBe(true);
    expect(serialize(editor)).toMatch(/^two$/m);
  });
});
