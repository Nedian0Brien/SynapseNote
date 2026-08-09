/**
 * `ParagraphIndentShortcuts` behavior — Tab indents a plain paragraph's first
 * line, Shift-Tab takes the indent back, and the indent survives the markdown
 * round-trip (the serializer escapes the line-leading tab as `&#x9;`, which
 * would otherwise re-parse as an indented code block).
 *
 * Mirrors the harness in `list-editing-shortcuts.dom.test.tsx`: a real Editor
 * on the full app `sharedExtensions` list, so the keymap-chain precedence
 * against `ListEditingShortcuts` / `CodeBlockFidelity` / `TabFocusTrap` is
 * exercised rather than assumed.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import {
  sharedExtensions as coreExtensions,
  MarkdownManager,
} from '@nedian0brien/synapsenote-core';
import { Editor, type JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { installDomGlobals } from '../walk-currency-test-harness';
import {
  indentLevelOf,
  OK_PROSE_INDENT_CLASS,
  OK_PROSE_INDENT_CONTAINER_CLASS,
  OK_PROSE_INDENT_RUN_CLASS,
} from './paragraph-indent-shortcuts';
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

/** Put a collapsed caret `offset` characters into the paragraph at `index`. */
function caretInParagraph(editor: Editor, index: number, offset = 0): void {
  let seen = 0;
  let start: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (start !== null) return false;
    if (node.type.name !== 'paragraph') return true;
    if (seen === index) start = pos + 1;
    seen += 1;
    return false;
  });
  if (start === null) throw new Error(`paragraph ${index} not found`);
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, start + offset)),
  );
}

describe('Paragraph indent shortcuts', () => {
  test('Tab at the start of a plain sentence indents it', () => {
    const editor = mountEditor('첫 문장입니다.');
    caretInParagraph(editor, 0);

    expect(press(editor, 'Tab')).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('\t첫 문장입니다.');
    // Caret rides after the inserted tab so typing continues in place.
    expect(editor.state.selection.from).toBe(2);
  });

  test('repeated Tab deepens the indent one level per press', () => {
    const editor = mountEditor('body text');
    caretInParagraph(editor, 0);

    expect(press(editor, 'Tab')).toBe(true);
    expect(press(editor, 'Tab')).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('\t\tbody text');
  });

  test('Shift-Tab removes one indent level and stops at column zero', () => {
    const editor = mountEditor('body text');
    caretInParagraph(editor, 0);
    press(editor, 'Tab');
    press(editor, 'Tab');

    expect(press(editor, 'Tab', true)).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('\tbody text');
    expect(press(editor, 'Tab', true)).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('body text');
    // Nothing left to outdent — falls through to TabFocusTrap, which consumes
    // the key so focus never escapes the editor.
    expect(press(editor, 'Tab', true)).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('body text');
  });

  test('Tab mid-sentence indents the line and leaves the caret where it was', () => {
    const editor = mountEditor('body text');
    caretInParagraph(editor, 0, 4);

    expect(press(editor, 'Tab')).toBe(true);
    // The tab joins the head of the line, not the caret's own position — a tab
    // between "body" and " text" would be neither an indent nor round-trippable.
    expect(editor.state.doc.firstChild?.textContent).toBe('\tbody text');
    // Caret still sits between "body" and " text": offset 4 of the old text is
    // offset 5 of the new one.
    expect(editor.state.selection.from).toBe(6);
  });

  test('Shift-Tab mid-sentence outdents the line', () => {
    // Built by keystroke rather than from source text: a raw leading tab in
    // markdown is an indented code block, not an indented paragraph.
    const editor = mountEditor('body text');
    caretInParagraph(editor, 0);
    press(editor, 'Tab');
    press(editor, 'Tab');
    expect(editor.state.doc.firstChild?.textContent).toBe('\t\tbody text');

    caretInParagraph(editor, 0, 7);
    expect(press(editor, 'Tab', true)).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('\tbody text');
  });

  test('Tab with text selected inside one paragraph indents it', () => {
    const editor = mountEditor('body text');
    const start = 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, start + 5, start + 9)),
    );

    expect(press(editor, 'Tab')).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('\tbody text');
    // The selection rides along instead of being replaced by the tab.
    expect(
      editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to),
    ).toBe('text');
  });

  test('Tab across a multi-block selection is left alone', () => {
    const editor = mountEditor('first para\n\nsecond para');
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2, 15)),
    );

    // Spanning blocks is a different gesture; TabFocusTrap consumes the key and
    // the document is untouched.
    expect(press(editor, 'Tab')).toBe(true);
    expect(editor.state.doc.textContent).toBe('first parasecond para');
  });

  test('the indent round-trips through markdown as an escaped leading tab', () => {
    const editor = mountEditor('body text');
    caretInParagraph(editor, 0);
    press(editor, 'Tab');

    const output = serialize(editor);
    // A raw leading tab would re-parse as an indented code block; the
    // byte-fidelity serializer emits the numeric char-ref instead.
    expect(output).toMatch(/^&#x9;body text$/m);

    const reparsed = mountEditor(output);
    expect(reparsed.state.doc.firstChild?.type.name).toBe('paragraph');
    expect(reparsed.state.doc.firstChild?.textContent).toBe('\tbody text');
    expect(serialize(reparsed)).toBe(output);
  });

  test('a second Tab on a re-parsed indent adds a level instead of folding into the char-ref', () => {
    const editor = mountEditor('&#x9;body text');
    caretInParagraph(editor, 0, 1);

    expect(press(editor, 'Tab')).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('\t\tbody text');
    const reparsed = mountEditor(serialize(editor));
    expect(reparsed.state.doc.firstChild?.textContent).toBe('\t\tbody text');
  });

  test('Shift-Tab pulls back a space indent as one 4-column step', () => {
    const editor = mountEditor('&#x20;   body text');
    expect(editor.state.doc.firstChild?.textContent).toBe('    body text');
    caretInParagraph(editor, 0, 4);

    expect(press(editor, 'Tab', true)).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('body text');
  });

  test('Tab inside a list item still nests the item rather than indenting its text', () => {
    const editor = mountEditor('- one\n- two');
    caretInParagraph(editor, 1);

    expect(press(editor, 'Tab')).toBe(true);
    expect(serialize(editor)).toMatch(/^ {2}- two$/m);
    expect(editor.state.doc.textContent).not.toContain('\t');
  });

  test('Tab on a top-level list item the list commands cannot sink leaves the text alone', () => {
    // ListEditingShortcuts returns false here (no previous sibling to nest
    // under). The paragraph handler must decline too, or the marker line would
    // become `- \tone`.
    const editor = mountEditor('- one\n- two');
    caretInParagraph(editor, 0);

    expect(press(editor, 'Tab')).toBe(true);
    expect(serialize(editor).trimEnd()).toBe('- one\n- two');
  });

  test('the indent reaches the DOM as a transitionable level, not as glyph width', () => {
    const editor = mountEditor('body text');
    caretInParagraph(editor, 0);
    press(editor, 'Tab');
    press(editor, 'Tab');

    // The stored run is collapsed to nothing and the same distance is redrawn
    // as `text-indent`, which CSS can transition; a tab glyph's width cannot.
    const paragraph = editor.view.dom.querySelector(`p.${OK_PROSE_INDENT_CLASS}`);
    expect(paragraph?.getAttribute('style')).toMatch(/--ok-prose-indent-level:\s*2/);
    expect(paragraph?.querySelector(`.${OK_PROSE_INDENT_RUN_CLASS}`)?.textContent).toBe('\t\t');
  });

  test('an unindented paragraph carries no indent decoration at all', () => {
    const editor = mountEditor('body text');
    expect(editor.view.dom.querySelector(`.${OK_PROSE_INDENT_CLASS}`)).toBe(null);
  });

  test.each([
    ['\t', 1],
    ['\t\t', 2],
    ['    ', 1],
    ['  ', 0.5],
    ['\t  ', 1.5],
  ])('a %j run renders as %d level(s)', (run, expected) => {
    expect(indentLevelOf(run as string)).toBe(expected as number);
  });

  test('Tab at the start of a quote moves the whole quote, rule included', () => {
    const editor = mountEditor('> quote text');
    caretInParagraph(editor, 0);

    expect(press(editor, 'Tab')).toBe(true);
    // The level lands on the blockquote, not the paragraph — indenting only the
    // text would slide the words out from under the quote's left rule.
    const quote = editor.view.dom.querySelector('blockquote');
    expect(quote?.classList.contains(OK_PROSE_INDENT_CONTAINER_CLASS)).toBe(true);
    expect(quote?.getAttribute('style')).toMatch(/--ok-prose-indent-level:\s*1/);
    expect(quote?.querySelector(`p.${OK_PROSE_INDENT_CLASS}`)).toBe(null);
    // Storage is unchanged: still a leading tab in the quote's paragraph.
    expect(serialize(editor)).toMatch(/^> &#x9;quote text$/m);
  });

  test('a later paragraph inside a quote keeps the first-line treatment', () => {
    const editor = mountEditor('> first line\n>\n> second line');
    caretInParagraph(editor, 1);

    expect(press(editor, 'Tab')).toBe(true);
    // One quote holding both paragraphs — otherwise the assertions below would
    // pass by looking at an unrelated first quote.
    expect(editor.view.dom.querySelectorAll('blockquote').length).toBe(1);
    const quote = editor.view.dom.querySelector('blockquote');
    expect(quote?.querySelectorAll('p').length).toBe(2);
    // The quote itself must not move — only the paragraph that was indented.
    expect(quote?.classList.contains(OK_PROSE_INDENT_CONTAINER_CLASS)).toBe(false);
    expect(quote?.querySelectorAll(`p.${OK_PROSE_INDENT_CLASS}`).length).toBe(1);
  });

  test('Shift-Tab brings the quote back', () => {
    const editor = mountEditor('> quote text');
    caretInParagraph(editor, 0);
    press(editor, 'Tab');

    expect(press(editor, 'Tab', true)).toBe(true);
    expect(editor.view.dom.querySelector(`.${OK_PROSE_INDENT_CONTAINER_CLASS}`)).toBe(null);
    expect(serialize(editor).trimEnd()).toBe('> quote text');
  });

  test('Tab inside a code block still inserts the code-block indent', () => {
    const editor = mountEditor('```ts\nconst a = 1;\n```');
    const code = editor.state.doc.firstChild;
    expect(code?.type.name).toBe('codeBlock');
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1)));

    expect(press(editor, 'Tab')).toBe(true);
    expect(editor.state.doc.firstChild?.textContent).toBe('  const a = 1;');
  });
});
