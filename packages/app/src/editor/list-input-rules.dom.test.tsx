import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { MarkdownManager, sharedExtensions } from '@nedian0brien/synapsenote-core';
import { Editor, type JSONContent } from '@tiptap/core';
import { installDomGlobals } from './walk-currency-test-harness';

const manager = new MarkdownManager({ extensions: sharedExtensions });
let restore: (() => void) | null = null;
const editors: Editor[] = [];

beforeAll(() => {
  restore = installDomGlobals();
});

afterAll(() => {
  restore?.();
  restore = null;
});

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
  document.body.replaceChildren();
});

function mount(md = ''): Editor {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = new Editor({
    element: host,
    content: manager.parse(md) as JSONContent,
    extensions: sharedExtensions,
  });
  editors.push(editor);
  return editor;
}

function typeText(editor: Editor, text: string): void {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const fallback = () => editor.state.tr.insertText(char, from, to);
    const handled = editor.view.someProp('handleTextInput', (handler) =>
      handler(editor.view, from, to, char, fallback),
    );
    if (!handled) editor.view.dispatch(fallback());
  }
}

function serialize(editor: Editor): string {
  return manager.serialize(editor.getJSON() as JSONContent);
}

function caretAfter(editor: Editor, text: string): number {
  let result = -1;
  editor.state.doc.descendants((node, pos) => {
    if (result < 0 && node.isText && node.text === text) result = pos + text.length;
  });
  if (result < 0) throw new Error(`text not found: ${text}`);
  return result;
}
function caretAtStart(editor: Editor, text: string): number {
  let result = -1;
  editor.state.doc.descendants((node, pos) => {
    if (result < 0 && node.isText && node.text === text) result = pos;
  });
  if (result < 0) throw new Error(`text not found: ${text}`);
  return result;
}

describe('list input rules', () => {
  test('converts only a middle item and preserves nested children', () => {
    const editor = mount('1. one\n1. two\n   - child\n1. three');
    const pos = caretAtStart(editor, 'two');
    editor.commands.setTextSelection({ from: pos, to: pos });

    typeText(editor, '- ');

    const lists = (editor.getJSON().content ?? []).filter((node) => node.type === 'list');
    expect(lists.map((node) => node.attrs?.ordered)).toEqual([true, false, true]);
    expect(lists[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('one');
    expect(lists[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('two');
    expect(lists[1]?.content?.[0]?.content?.[1]?.type).toBe('list');
    expect(
      lists[1]?.content?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    ).toBe('child');
    expect(lists[2]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('three');
    expect(serialize(editor)).toContain('- two');
  });

  test('explicit ordered marker creates an ordered wrapper with its requested start', () => {
    const editor = mount('1. previous\n\n- one');
    const pos = caretAtStart(editor, 'one');
    editor.commands.setTextSelection({ from: pos, to: pos });

    typeText(editor, '3. ');

    const ordered = [...editor.view.dom.querySelectorAll('ol')];
    expect(ordered).toHaveLength(2);
    expect(ordered[1]?.getAttribute('start')).toBe('3');
    expect(editor.getJSON().content?.[1]?.content?.[0]?.attrs?.sourceOrdinal).toBe(3);
  });

  test('normalizes same-level continuity, resets at paragraphs, and isolates nesting', async () => {
    const editor = mount('1. one\n   - nested\n\n- bullet\n1. two\n\nreset\n1. three');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const ordered = [...editor.view.dom.querySelectorAll('ol')];
    expect(ordered[1]?.getAttribute('start')).toBe('2');
    expect(ordered[2]?.getAttribute('start')).toBe('1');
    expect(serialize(editor)).toContain('1. two');
    expect(serialize(editor)).toContain('reset\n\n1. three');
  });

  test('non-leading markers remain literal and paragraph controls still wrap', () => {
    const editor = mount('- item');
    const pos = caretAfter(editor, 'item');
    editor.commands.setTextSelection({ from: pos, to: pos });
    typeText(editor, '- ');
    expect(editor.state.doc.textContent).toContain('item- ');

    const plain = mount();
    typeText(plain, '- ');
    expect(plain.view.dom.querySelector('ul')).toBeTruthy();
  });
});
