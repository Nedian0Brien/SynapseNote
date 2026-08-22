import { afterEach, describe, expect, test } from 'bun:test';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { Editor, type JSONContent } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import { createPortal } from 'react-dom';
import { sharedExtensions } from './shared';

i18n.load('en', {});
i18n.activate('en');

function emptyAccordionDoc(): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'jsxComponent',
        attrs: {
          content: '',
          componentName: 'Accordion',
          kind: 'element',
          attributes: [],
          sourceRaw: '<Accordion title="Details" />',
          sourceDirty: false,
          props: { title: 'Details', defaultOpen: true },
        },
      },
    ],
  };
}

function mountEditor(): { editor: Editor; container: HTMLElement; root: HTMLElement } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = document.createElement('div');
  document.body.appendChild(root);
  const editor = new Editor({
    element: container,
    content: emptyAccordionDoc(),
    extensions: sharedExtensions,
    editable: true,
  });
  render(
    <I18nProvider i18n={i18n}>
      {createPortal(
        // biome-ignore lint/plugin/no-unportaled-editor-content: portal isolates the mounted editor view from the host fixture.
        <EditorContent editor={editor} />,
        root,
      )}
    </I18nProvider>,
  );
  return { editor, container, root };
}

describe('Accordion empty body interaction', () => {
  afterEach(cleanup);

  test('clicking an empty body inserts and focuses exactly one paragraph', async () => {
    const { editor, container, root } = mountEditor();
    try {
      await waitFor(() => expect(root.querySelector('.accordion-body')).not.toBeNull());
      const body = root.querySelector<HTMLElement>('.accordion-body');

      act(() => body?.click());

      const accordion = editor.state.doc.firstChild;
      expect(accordion?.childCount).toBe(1);
      expect(accordion?.firstChild?.type.name).toBe('paragraph');
      expect(editor.state.selection.from).toBe(2);

      act(() => body?.click());
      expect(editor.state.doc.firstChild?.childCount).toBe(1);
    } finally {
      act(() => editor.destroy());
      container.remove();
      root.remove();
    }
  });

  test('uses the Accordion live position after a block is inserted before it', async () => {
    const { editor, container, root } = mountEditor();
    try {
      await waitFor(() => expect(root.querySelector('.accordion-body')).not.toBeNull());

      act(() => {
        editor.commands.insertContentAt(0, { type: 'paragraph' });
      });
      const body = root.querySelector<HTMLElement>('.accordion-body');
      expect(editor.state.doc.firstChild?.type.name).toBe('paragraph');

      act(() => body?.click());

      const accordion = editor.state.doc.child(1);
      expect(accordion.type.name).toBe('jsxComponent');
      expect(accordion.childCount).toBe(1);
      expect(accordion.firstChild?.type.name).toBe('paragraph');
      expect(editor.state.selection.from).toBe(4);
    } finally {
      act(() => editor.destroy());
      container.remove();
      root.remove();
    }
  });
});
