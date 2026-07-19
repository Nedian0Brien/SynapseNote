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
