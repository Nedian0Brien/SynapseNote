/**
 * Paste-format menu, end to end over a real editor: opening the menu on a
 * linkified range, the rules that dismiss it, and what each format leaves
 * in the document.
 *
 * The React popup is deliberately out of scope here — the extension that
 * mounts it is not in the rig. What is under test is everything that
 * decides *what the document becomes*, which is where a regression would
 * actually cost an author their content.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { JsxComponent, WikiLink } from '@nedian0brien/synapsenote-core';
import { Extension, type Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { OkWebPreviewMetadata } from '@/lib/desktop-bridge-types';
import { mountLightEditor } from '../editor-rig.test-helper.ts';
import { installDomGlobals } from '../walk-currency-test-harness.ts';
import { applyPasteFormat, bookmarkPropsFromMetadata } from './apply-paste-format.ts';
import {
  applyPasteFormatMenuTransaction,
  createPasteFormatMenuPlugin,
  highlightedFormat,
  movedSelection,
  openState,
  type PasteFormatMenuState,
  pasteFormatMenuKey,
  requestPasteFormatMenu,
} from './paste-format-plugin.ts';
import type { PasteFormat } from './paste-format-options.ts';

const APP_ORIGIN = 'http://localhost:5173';

let restoreDomGlobals: (() => void) | null = null;

beforeAll(() => {
  restoreDomGlobals = installDomGlobals();
});

afterAll(() => {
  restoreDomGlobals?.();
  restoreDomGlobals = null;
});

/** Commits the keyboard grammar routes to, recorded per editor. */
const commits: Array<{ state: PasteFormatMenuState; format: PasteFormat }> = [];

/**
 * The real plugin, minus the popup the extension supplies — state,
 * dismissal rules, and the keyboard grammar are all the production code.
 */
const PasteFormatMenuHeadless = Extension.create({
  name: 'pasteFormatMenuHeadless',
  addProseMirrorPlugins() {
    return [
      createPasteFormatMenuPlugin({
        onCommit: (_view, state, format) => {
          commits.push({ state, format });
        },
      }),
    ];
  },
});

function makeEditor(content: string): Editor {
  return mountLightEditor({
    content,
    extensions: [JsxComponent, WikiLink, PasteFormatMenuHeadless],
  });
}

/** Feed one key through the editor's `handleKeyDown` props, as the DOM would. */
function pressKey(editor: Editor, key: string): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  return (
    editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event)) ?? false
  );
}

/** The single jsxComponent node in the doc, or null. */
function soleComponent(editor: Editor): ProseMirrorNode | null {
  let found: ProseMirrorNode | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'jsxComponent') found = node;
    return true;
  });
  return found;
}

/** Range covering the whole link in `<p><a>…</a></p>` — pos 1 to end of text. */
function linkRange(editor: Editor): { from: number; to: number } {
  const paragraph = editor.state.doc.firstChild;
  if (!paragraph) throw new Error('no paragraph');
  return { from: 1, to: 1 + paragraph.content.size };
}

describe('requestPasteFormatMenu', () => {
  test('opens over the link with its href and the web-page options', () => {
    const editor = makeEditor('<p><a href="https://example.com/docs">https://example.com/docs</a></p>');
    const { from, to } = linkRange(editor);

    expect(requestPasteFormatMenu(editor.view, from, to, APP_ORIGIN)).toBe(true);
    const state = pasteFormatMenuKey.getState(editor.state);
    expect(state?.url).toBe('https://example.com/docs');
    expect(state?.options).toEqual(['url', 'bookmark', 'embed']);
    expect(highlightedFormat(state ?? null)).toBe('url');
    editor.destroy();
  });

  test('narrows to the link mark, not the range handed in', () => {
    // GFM leaves the trailing paren outside the autolink; the menu must
    // offer to replace the link, not the punctuation after it.
    const editor = makeEditor('<p><a href="https://example.com">https://example.com</a>)</p>');
    const { to } = linkRange(editor);

    expect(requestPasteFormatMenu(editor.view, 1, to, APP_ORIGIN)).toBe(true);
    const state = pasteFormatMenuKey.getState(editor.state);
    expect(state?.to).toBe(to - 1);
    editor.destroy();
  });

  test('declines when the range holds no link', () => {
    const editor = makeEditor('<p>just prose</p>');
    const { from, to } = linkRange(editor);
    expect(requestPasteFormatMenu(editor.view, from, to, APP_ORIGIN)).toBe(false);
    expect(pasteFormatMenuKey.getState(editor.state)).toBeNull();
    editor.destroy();
  });

  test('declines when the URL has only one sensible form', () => {
    const editor = makeEditor('<p><a href="mailto:a@example.com">a@example.com</a></p>');
    const { from, to } = linkRange(editor);
    expect(requestPasteFormatMenu(editor.view, from, to, APP_ORIGIN)).toBe(false);
    editor.destroy();
  });

  test('an app-origin document link offers the mention row', () => {
    const editor = makeEditor(
      `<p><a href="${APP_ORIGIN}/#/Design%20Notes">${APP_ORIGIN}/#/Design%20Notes</a></p>`,
    );
    const { from, to } = linkRange(editor);
    expect(requestPasteFormatMenu(editor.view, from, to, APP_ORIGIN)).toBe(true);
    const state = pasteFormatMenuKey.getState(editor.state);
    expect(state?.options).toEqual(['mention', 'url']);
    expect(state?.internalDoc?.docName).toBe('Design Notes');
    editor.destroy();
  });
});

describe('dismissal rules', () => {
  const state = openState({
    from: 1,
    to: 20,
    url: 'https://example.com',
    options: ['url', 'bookmark', 'embed'],
    internalDoc: null,
  });

  test('typing dismisses', () => {
    const editor = makeEditor('<p>hello</p>');
    const tr = editor.state.tr.insertText('x', 1, 1);
    expect(applyPasteFormatMenuTransaction(tr, state)).toBeNull();
    editor.destroy();
  });

  test('moving the cursor dismisses', () => {
    const editor = makeEditor('<p>hello</p>');
    const tr = editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3));
    expect(applyPasteFormatMenuTransaction(tr, state)).toBeNull();
    editor.destroy();
  });

  test('an inert transaction leaves the menu alone', () => {
    const editor = makeEditor('<p>hello</p>');
    expect(applyPasteFormatMenuTransaction(editor.state.tr, state)).toBe(state);
    editor.destroy();
  });

  test('the highlight wraps in both directions', () => {
    expect(movedSelection(state, -1).selectedIndex).toBe(2);
    expect(movedSelection(movedSelection(state, 1), 1).selectedIndex).toBe(2);
    expect(movedSelection(movedSelection(state, 2), 1).selectedIndex).toBe(0);
  });
});

describe('keyboard grammar', () => {
  function openMenu(): Editor {
    commits.length = 0;
    const editor = makeEditor('<p><a href="https://example.com">https://example.com</a></p>');
    const { from, to } = linkRange(editor);
    requestPasteFormatMenu(editor.view, from, to, APP_ORIGIN);
    return editor;
  }

  test('Enter on the URL row is NOT swallowed — it still makes a new line', () => {
    const editor = openMenu();
    expect(highlightedFormat(pasteFormatMenuKey.getState(editor.state) ?? null)).toBe('url');
    expect(editor.state.doc.childCount).toBe(1);

    // The menu declines the key, so ProseMirror's own Enter binding gets
    // it and splits the block — the pre-menu behavior, unchanged.
    pressKey(editor, 'Enter');
    expect(editor.state.doc.childCount).toBe(2);
    expect(pasteFormatMenuKey.getState(editor.state)).toBeNull();
    expect(commits).toHaveLength(0);
    editor.destroy();
  });

  test('ArrowDown then Enter commits the row the author moved to', () => {
    const editor = openMenu();
    expect(pressKey(editor, 'ArrowDown')).toBe(true);
    expect(pressKey(editor, 'Enter')).toBe(true);
    expect(commits.map((c) => c.format)).toEqual(['bookmark']);
    expect(pasteFormatMenuKey.getState(editor.state)).toBeNull();
    editor.destroy();
  });

  test('ArrowUp wraps to the last row', () => {
    const editor = openMenu();
    pressKey(editor, 'ArrowUp');
    expect(highlightedFormat(pasteFormatMenuKey.getState(editor.state) ?? null)).toBe('embed');
    editor.destroy();
  });

  test('Escape dismisses and commits nothing', () => {
    const editor = openMenu();
    expect(pressKey(editor, 'Escape')).toBe(true);
    expect(pasteFormatMenuKey.getState(editor.state)).toBeNull();
    expect(commits).toHaveLength(0);
    editor.destroy();
  });

  test('keys the menu does not own fall through', () => {
    const editor = openMenu();
    expect(pressKey(editor, 'a')).toBe(false);
    editor.destroy();
  });
});

describe('applyPasteFormat', () => {
  test('url is a no-op — the document already says what it means', () => {
    const editor = makeEditor('<p><a href="https://example.com">https://example.com</a></p>');
    const before = editor.getJSON();
    const changed = applyPasteFormat({
      editor,
      range: linkRange(editor),
      url: 'https://example.com',
      format: 'url',
      internalDoc: null,
      fetchMetadata: null,
    });
    expect(changed).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  test('mention replaces the link with a wikiLink to the document', () => {
    const editor = makeEditor(
      `<p><a href="${APP_ORIGIN}/#/Design%20Notes">${APP_ORIGIN}/#/Design%20Notes</a></p>`,
    );
    applyPasteFormat({
      editor,
      range: linkRange(editor),
      url: `${APP_ORIGIN}/#/Design%20Notes`,
      format: 'mention',
      internalDoc: { docName: 'Design Notes', anchor: 'the-plan' },
      fetchMetadata: null,
    });

    let wikiLink: ProseMirrorNode | null = null;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'wikiLink') wikiLink = node;
      return true;
    });
    const attrs = (wikiLink as ProseMirrorNode | null)?.attrs;
    expect(attrs?.target).toBe('Design Notes');
    expect(attrs?.anchor).toBe('the-plan');
    expect(editor.state.doc.textContent).not.toContain('http');
    editor.destroy();
  });

  test('mention without a resolved document refuses rather than guessing', () => {
    const editor = makeEditor('<p><a href="https://example.com">https://example.com</a></p>');
    const before = editor.getJSON();
    expect(
      applyPasteFormat({
        editor,
        range: linkRange(editor),
        url: 'https://example.com',
        format: 'mention',
        internalDoc: null,
        fetchMetadata: null,
      }),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  test('embed replaces the link with an `<Embed>` descriptor node', () => {
    const editor = makeEditor('<p><a href="https://example.com">https://example.com</a></p>');
    applyPasteFormat({
      editor,
      range: linkRange(editor),
      url: 'https://example.com',
      format: 'embed',
      internalDoc: null,
      fetchMetadata: null,
    });
    const node = soleComponent(editor);
    expect(node?.attrs.componentName).toBe('Embed');
    expect(node?.attrs.props).toEqual({ src: 'https://example.com' });
    expect(node?.attrs.sourceDirty).toBe(true);
    editor.destroy();
  });

  test('bookmark lands immediately as a URL-only card when no fetcher exists', () => {
    const editor = makeEditor('<p><a href="https://example.com">https://example.com</a></p>');
    applyPasteFormat({
      editor,
      range: linkRange(editor),
      url: 'https://example.com',
      format: 'bookmark',
      internalDoc: null,
      fetchMetadata: null,
    });
    const node = soleComponent(editor);
    expect(node?.attrs.componentName).toBe('Bookmark');
    expect(node?.attrs.props).toEqual({ src: 'https://example.com' });
    editor.destroy();
  });

  test('bookmark patches in metadata when it arrives', async () => {
    const editor = makeEditor('<p><a href="https://example.com">https://example.com</a></p>');
    const metadata: OkWebPreviewMetadata = {
      url: 'https://example.com/final',
      title: 'Example Domain',
      description: 'Reserved for documentation.',
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageUrl: 'https://example.com/og.png',
      faviconDataUrl: 'data:image/png;base64,BBBB',
      faviconUrl: 'https://example.com/favicon.ico',
    };
    applyPasteFormat({
      editor,
      range: linkRange(editor),
      url: 'https://example.com',
      format: 'bookmark',
      internalDoc: null,
      fetchMetadata: () => Promise.resolve(metadata),
    });

    await Promise.resolve();
    await Promise.resolve();

    const node = soleComponent(editor);
    expect(node?.attrs.props).toEqual({
      src: 'https://example.com/final',
      title: 'Example Domain',
      description: 'Reserved for documentation.',
      image: 'https://example.com/og.png',
      favicon: 'https://example.com/favicon.ico',
    });
    editor.destroy();
  });

  test('a failed fetch leaves the card standing', async () => {
    const editor = makeEditor('<p><a href="https://example.com">https://example.com</a></p>');
    applyPasteFormat({
      editor,
      range: linkRange(editor),
      url: 'https://example.com',
      format: 'bookmark',
      internalDoc: null,
      fetchMetadata: () => Promise.reject(new Error('offline')),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(soleComponent(editor)?.attrs.props).toEqual({ src: 'https://example.com' });
    editor.destroy();
  });
});

describe('bookmarkPropsFromMetadata', () => {
  test('omits every field the page did not provide', () => {
    expect(bookmarkPropsFromMetadata('https://example.com', { url: 'https://example.com' })).toEqual(
      { src: 'https://example.com' },
    );
  });

  test('stores remote image URLs, never the inlined base64 payloads', () => {
    const props = bookmarkPropsFromMetadata('https://example.com', {
      url: 'https://example.com',
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageUrl: 'https://cdn.example.com/og.png',
    });
    expect(props.image).toBe('https://cdn.example.com/og.png');
    expect(JSON.stringify(props)).not.toContain('base64');
  });

  test('null metadata still yields a valid URL-only card', () => {
    expect(bookmarkPropsFromMetadata('https://example.com', null)).toEqual({
      src: 'https://example.com',
    });
  });
});
