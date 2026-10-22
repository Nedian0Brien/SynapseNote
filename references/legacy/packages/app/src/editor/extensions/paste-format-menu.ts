/**
 * PasteFormatMenu extension — the rendered half of the paste-format menu.
 *
 * The plugin (state, dismissal rules, keyboard grammar) lives in
 * `../paste-format/paste-format-plugin.ts` so it can be exercised without a
 * React renderer. What is left here is what genuinely needs the editor and
 * the DOM: mounting the floating popup, keeping it pointed at the linkified
 * range, and turning a chosen row into a document edit.
 *
 * ── Why an extension and not the paste handler ───────────────────────────
 *
 * The clipboard dispatcher is an `editorProps` handler — it gets an
 * `EditorView` and nothing else, which is enough to dispatch a plugin meta
 * but not enough to drive TipTap commands or mount a `ReactRenderer`. So
 * the dispatcher only *requests* the menu (`requestPasteFormatMenu`), and
 * this extension — which has the `Editor` — is what answers.
 */

import { Extension } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import { ReactRenderer } from '@tiptap/react';
import { applyPasteFormat } from '../paste-format/apply-paste-format.ts';
import { PasteFormatMenu as PasteFormatMenuView } from '../paste-format/PasteFormatMenu.tsx';
import type { PasteFormat } from '../paste-format/paste-format-options.ts';
import {
  closePasteFormatMenu,
  createPasteFormatMenuPlugin,
  movePasteFormatHighlight,
  type PasteFormatMenuState,
  pasteFormatMenuKey,
} from '../paste-format/paste-format-plugin.ts';
import {
  createSuggestionPopup,
  destroySuggestionPopup,
  type SuggestionPositionState,
} from './suggestion-floating-ui.ts';

/**
 * Screen rect of the linkified range, for the popup to hang under. A link
 * that wrapped across lines reports a start left of its end's right, which
 * would compute a negative width — clamped so the menu lands under the
 * link's beginning rather than off-screen.
 */
function rangeRect(view: EditorView, state: PasteFormatMenuState): DOMRect | null {
  try {
    const start = view.coordsAtPos(state.from);
    const end = view.coordsAtPos(state.to);
    return new DOMRect(
      start.left,
      start.top,
      Math.max(0, end.right - start.left),
      Math.max(0, end.bottom - start.top),
    );
  } catch {
    // `coordsAtPos` throws for a position no longer rendered. The state is
    // about to be cleared by the same transaction that invalidated it.
    return null;
  }
}

export const PasteFormatMenu = Extension.create({
  name: 'pasteFormatMenu',

  addProseMirrorPlugins() {
    const editor = this.editor;

    const commit = (state: PasteFormatMenuState, format: PasteFormat) => {
      applyPasteFormat({
        editor,
        range: { from: state.from, to: state.to },
        url: state.url,
        format,
        internalDoc: state.internalDoc,
      });
    };

    return [
      createPasteFormatMenuPlugin({
        onCommit: (_view, state, format) => commit(state, format),

        view(editorView) {
          let renderer: ReactRenderer<typeof PasteFormatMenuView> | null = null;
          let anchorRect: DOMRect | null = null;
          const posState: SuggestionPositionState = { popup: null, stopAutoUpdate: null };
          const anchor = {
            clientRect: () => anchorRect,
            editor: { view: editorView },
          };

          const rendererProps = (state: PasteFormatMenuState) => ({
            options: state.options,
            selectedIndex: state.selectedIndex,
            onSelect: (format: PasteFormat) => {
              closePasteFormatMenu(editorView);
              commit(state, format);
            },
            onHoverIndex: (index: number) => {
              const current = pasteFormatMenuKey.getState(editorView.state);
              if (!current || current.selectedIndex === index) return;
              movePasteFormatHighlight(editorView, index - current.selectedIndex);
            },
          });

          const unmount = () => {
            destroySuggestionPopup(posState);
            renderer?.destroy();
            renderer = null;
            anchorRect = null;
          };

          const mount = (state: PasteFormatMenuState) => {
            anchorRect = rangeRect(editorView, state);
            if (!anchorRect) return;
            const popup = createSuggestionPopup(() => anchor, 'paste-format-menu');
            posState.popup = popup.popup;
            renderer = new ReactRenderer(PasteFormatMenuView, {
              props: rendererProps(state),
              editor,
            });
            popup.popup.appendChild(renderer.element);
            // Content first, then autoUpdate — `flip` needs the populated
            // element's real dimensions on its first pass.
            posState.stopAutoUpdate = popup.startAutoUpdate();
            popup.reveal();
          };

          return {
            update(view) {
              const next = pasteFormatMenuKey.getState(view.state);
              if (!next) {
                if (renderer) unmount();
                return;
              }
              if (!renderer) {
                mount(next);
                return;
              }
              anchorRect = rangeRect(view, next) ?? anchorRect;
              renderer.updateProps(rendererProps(next));
            },
            destroy: unmount,
          };
        },
      }),
    ];
  },
});
