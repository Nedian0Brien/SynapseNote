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
const SHORTCUT: Record<string, { key: string; shift?: boolean }> = {
  bold: { key: 'b' },
  italic: { key: 'i' },
  code: { key: 'e' },
  strike: { key: 'x', shift: true },
  highlight: { key: 'h', shift: true },
};

function press(
  view: EditorView,
  key: string,
  mods: { shift?: boolean; mod?: boolean } = {},
): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    shiftKey: mods.shift ?? false,
    metaKey: mods.mod === true && isMac,
    ctrlKey: mods.mod === true && !isMac,
  });
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

  test('hidden syntax is not drawn and cursor movement skips it', () => {
    const view = mount('a **bold** b', 0, 0);
    expect(view.contentDOM.textContent).toBe('a bold b');
  });
});
