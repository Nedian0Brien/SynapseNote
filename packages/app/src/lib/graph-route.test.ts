/**
 * The graph route and its ⌘G binding. The interesting part is the overlap with
 * `find-next`, which owns the same chord while the find bar is open.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
  markFindBarOpen,
  resetFindBarOpenStateForTests,
} from '@/editor/find-replace/find-bar-open-state';
import { docNameFromHash, GRAPH_HASH, isGraphHash } from '@/lib/doc-hash';
import { isGraphShortcut } from '@/lib/use-graph-route';

function keyEvent(overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: 'g',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...overrides,
  } as unknown as KeyboardEvent;
}

afterEach(resetFindBarOpenStateForTests);

describe('isGraphHash', () => {
  test('matches the canonical route', () => {
    expect(isGraphHash(GRAPH_HASH)).toBe(true);
  });

  test('tolerates a trailing slash', () => {
    expect(isGraphHash(`${GRAPH_HASH}/`)).toBe(true);
  });

  test('rejects anything else, including a page that merely looks like it', () => {
    expect(isGraphHash('')).toBe(false);
    expect(isGraphHash('#/')).toBe(false);
    expect(isGraphHash('#/graph')).toBe(false);
    expect(isGraphHash('#/__graph__/extra')).toBe(false);
    expect(isGraphHash('#settings')).toBe(false);
  });
});

describe('docNameFromHash', () => {
  test('does not read the graph route as a document', () => {
    // Otherwise the navigation handler opens a phantom page named `__graph__`.
    expect(docNameFromHash(GRAPH_HASH)).toBeNull();
    expect(docNameFromHash(`${GRAPH_HASH}/`)).toBeNull();
  });
});

describe('isGraphShortcut', () => {
  test('matches the platform chord', () => {
    // `mod` resolves per platform, so only the host's own modifier matches
    // here; the registry test covers the mac/windows split itself.
    expect(isGraphShortcut(keyEvent())).toBe(true);
  });

  test('ignores the bare key and the shifted chord', () => {
    // ⇧⌘G is find-previous, not a second graph gesture.
    expect(isGraphShortcut(keyEvent({ metaKey: false }))).toBe(false);
    expect(isGraphShortcut(keyEvent({ shiftKey: true }))).toBe(false);
  });

  test('fires while typing — the editor surface is contenteditable', () => {
    // Unlike Cmd-comma, ⌘G is not a text-editing chord, and suppressing it on
    // editable targets would mean it never works while writing a note.
    const editable = { isContentEditable: true, tagName: 'DIV' };
    expect(isGraphShortcut(keyEvent({ target: editable as unknown as EventTarget }))).toBe(true);
  });

  test('stands down while the find bar is open, and resumes when it closes', () => {
    const release = markFindBarOpen();
    expect(isGraphShortcut(keyEvent())).toBe(false);
    release();
    expect(isGraphShortcut(keyEvent())).toBe(true);
  });

  test('stays stood down until the LAST open find bar releases', () => {
    // The editor Activity pool can keep more than one controller alive.
    const first = markFindBarOpen();
    const second = markFindBarOpen();
    first();
    expect(isGraphShortcut(keyEvent())).toBe(false);
    second();
    expect(isGraphShortcut(keyEvent())).toBe(true);
  });

  test('a double release cannot drive the count negative', () => {
    // StrictMode double-invokes effect cleanups; without the guard this would
    // wedge the graph shortcut on while a later find bar is genuinely open.
    const release = markFindBarOpen();
    release();
    release();
    markFindBarOpen();
    expect(isGraphShortcut(keyEvent())).toBe(false);
  });
});
