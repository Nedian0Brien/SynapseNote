/**
 * `HeadingSectionIndent` behavior — Tab at a heading's start indents the
 * heading, the stored form is the ATX leading indent that survives the
 * markdown round-trip, and every block in the heading's section inherits the
 * level for rendering (including the block types that have no indent carrier
 * of their own).
 *
 * Same harness as the sibling indent suites: a real Editor on the full app
 * `sharedExtensions` list, so keymap-chain precedence is exercised.
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
  HEADING_INDENT_MAX,
  OK_SECTION_INDENT_CLASS,
  sectionIndentLevels,
} from './heading-section-indent';
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

/** Collapsed caret at the start of the top-level block at `index`. */
function caretAtBlockStart(editor: Editor, index: number): void {
  let pos: number | null = null;
  let seen = 0;
  editor.state.doc.forEach((_node, offset) => {
    if (seen === index) pos = offset + 1;
    seen += 1;
  });
  if (pos === null) throw new Error(`block ${index} not found`);
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
}

function headingIndent(editor: Editor, index = 0): unknown {
  let attrs: unknown = null;
  let seen = 0;
  editor.state.doc.forEach((node) => {
    if (seen === index) attrs = node.attrs.sourceLeadingIndent;
    seen += 1;
  });
  return attrs;
}

describe('Heading section indent', () => {
  test('Tab at a heading start indents it and writes the ATX leading indent', () => {
    const editor = mountEditor('## 제목\n\n본문.');
    caretAtBlockStart(editor, 0);

    expect(press(editor, 'Tab')).toBe(true);
    expect(headingIndent(editor)).toBe(1);
    expect(serialize(editor)).toMatch(/^ ## 제목$/m);
  });

  test('the heading indent round-trips through markdown', () => {
    const editor = mountEditor('## 제목');
    caretAtBlockStart(editor, 0);
    press(editor, 'Tab');
    press(editor, 'Tab');

    const output = serialize(editor);
    expect(output).toMatch(/^ {2}## 제목$/m);
    const reparsed = mountEditor(output);
    expect(headingIndent(reparsed)).toBe(2);
    expect(serialize(reparsed)).toBe(output);
  });

  test('Tab stops at the 3-space ceiling the file format allows', () => {
    const editor = mountEditor('## 제목');
    caretAtBlockStart(editor, 0);
    for (let n = 0; n < HEADING_INDENT_MAX + 2; n += 1) press(editor, 'Tab');

    expect(headingIndent(editor)).toBe(HEADING_INDENT_MAX);
    // A 4th space would re-parse as an indented code block, so the serializer
    // must still emit a heading.
    const output = serialize(editor);
    expect(output).toMatch(/^ {3}## 제목$/m);
    expect(markdown.parse(output).content?.[0]?.type).toBe('heading');
  });

  test('Shift-Tab walks the indent back and stops at zero', () => {
    const editor = mountEditor('## 제목');
    caretAtBlockStart(editor, 0);
    press(editor, 'Tab');
    press(editor, 'Tab');

    expect(press(editor, 'Tab', true)).toBe(true);
    expect(headingIndent(editor)).toBe(1);
    expect(press(editor, 'Tab', true)).toBe(true);
    expect(headingIndent(editor)).toBe(null);
    // Nothing left to outdent — TabFocusTrap consumes the key, doc unchanged.
    expect(press(editor, 'Tab', true)).toBe(true);
    expect(headingIndent(editor)).toBe(null);
    expect(serialize(editor).trimEnd()).toBe('## 제목');
  });

  test('every block in the section inherits the level, including carrier-less types', () => {
    const editor = mountEditor(
      '## 제목\n\n본문.\n\n- 항목\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n## 다음 제목\n\n다음 본문.',
    );
    caretAtBlockStart(editor, 0);
    press(editor, 'Tab');

    const types: string[] = [];
    editor.state.doc.forEach((node) => {
      types.push(node.type.name);
    });
    expect(types).toEqual(['heading', 'paragraph', 'list', 'table', 'heading', 'paragraph']);
    // Section of the indented heading moves; the next same-rank heading and
    // its own section stay put.
    expect(sectionIndentLevels(editor.state.doc)).toEqual([1, 1, 1, 1, 0, 0]);
  });

  test('a sub-heading stacks its own indent on top of the inherited one', () => {
    const editor = mountEditor('# 상위\n\n본문 A.\n\n## 하위\n\n본문 B.\n\n# 형제\n\n본문 C.');
    caretAtBlockStart(editor, 0);
    press(editor, 'Tab');
    caretAtBlockStart(editor, 2);
    press(editor, 'Tab');

    // 상위=1; 본문 A inherits 1; 하위 = 1 inherited + 1 own; 본문 B follows it;
    // 형제 is a same-rank sibling so it drops back to 0 with its own section.
    expect(sectionIndentLevels(editor.state.doc)).toEqual([1, 1, 2, 2, 0, 0]);
    // Each heading stores only its own level, so both stay inside the 1-3 range
    // the format allows even though the rendered depth is 2.
    expect(headingIndent(editor, 0)).toBe(1);
    expect(headingIndent(editor, 2)).toBe(1);
  });

  test('blocks before the first heading are never indented', () => {
    const editor = mountEditor('머리말.\n\n## 제목\n\n본문.');
    caretAtBlockStart(editor, 1);
    press(editor, 'Tab');

    expect(sectionIndentLevels(editor.state.doc)).toEqual([0, 1, 1]);
  });

  test('the section indent reaches the DOM as a level-carrying class', () => {
    const editor = mountEditor('## 제목\n\n본문.');
    caretAtBlockStart(editor, 0);
    press(editor, 'Tab');

    const indented = editor.view.dom.querySelectorAll(`.${OK_SECTION_INDENT_CLASS}`);
    expect(indented.length).toBe(2);
    expect(indented[0]?.getAttribute('style')).toMatch(/--ok-section-indent-level:\s*1/);
  });

  test('the section glides from its previous offset instead of snapping', () => {
    // A CSS transition cannot carry this: the attr change rebuilds the heading's
    // element (and its siblings'), so there is no previous computed value to
    // animate from. The plugin names the start value explicitly — assert the
    // keyframes it hands to Web Animations.
    const calls: Array<{ tag: string; frames: unknown }> = [];
    const proto = globalThis.HTMLElement.prototype as unknown as Record<string, unknown>;
    const original = proto.animate;
    proto.animate = function animate(this: HTMLElement, frames: unknown) {
      calls.push({ tag: this.tagName.toLowerCase(), frames });
      return { finish() {}, cancel() {} };
    };

    try {
      const editor = mountEditor('## 제목\n\n본문.');
      caretAtBlockStart(editor, 0);
      press(editor, 'Tab');

      expect(calls.map((call) => call.tag)).toEqual(['h2', 'p']);
      // 0 levels → 1 level, at the 24px fallback step (jsdom resolves no vars).
      expect(calls[0]?.frames).toEqual([{ paddingLeft: '0px' }, { paddingLeft: '24px' }]);

      calls.length = 0;
      press(editor, 'Tab', true);
      // Outdent plays the same distance in reverse rather than jumping back.
      expect(calls[0]?.frames).toEqual([{ paddingLeft: '24px' }, { paddingLeft: '0px' }]);
    } finally {
      proto.animate = original;
    }
  });

  test('typing inside a section animates nothing', () => {
    const calls: string[] = [];
    const proto = globalThis.HTMLElement.prototype as unknown as Record<string, unknown>;
    const original = proto.animate;
    proto.animate = function animate(this: HTMLElement) {
      calls.push(this.tagName);
      return { finish() {}, cancel() {} };
    };

    try {
      const editor = mountEditor('## 제목\n\n본문.');
      caretAtBlockStart(editor, 0);
      press(editor, 'Tab');
      calls.length = 0;
      // A plain edit leaves every level untouched — no block should move.
      editor.commands.insertContentAt(editor.state.doc.content.size - 1, '더');
      expect(calls).toEqual([]);
    } finally {
      proto.animate = original;
    }
  });

  test('Tab mid-heading stays inert instead of indenting from the middle of a word', () => {
    const editor = mountEditor('## 제목');
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)));

    expect(press(editor, 'Tab')).toBe(true);
    expect(headingIndent(editor)).toBe(null);
  });

  test('a paragraph Tab still composes on top of the inherited section indent', () => {
    const editor = mountEditor('## 제목\n\n본문.');
    caretAtBlockStart(editor, 0);
    press(editor, 'Tab');
    caretAtBlockStart(editor, 1);
    press(editor, 'Tab');

    expect(sectionIndentLevels(editor.state.doc)).toEqual([1, 1]);
    expect(serialize(editor)).toMatch(/^&#x9;본문\.$/m);
  });
});
