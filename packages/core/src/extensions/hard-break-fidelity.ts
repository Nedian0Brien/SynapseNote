/**
 * HardBreak extension override for source-text fidelity.
 *
 * Extends @tiptap/extension-hard-break (preserving setHardBreak command
 * and Shift+Enter shortcut) and adds the hardBreakStyle attribute to
 * distinguish backslash from two-space hard breaks.
 *
 * Markdown parsing/serialization is handled by the unified pipeline (packages/core/src/markdown/).
 */

import HardBreak from '@tiptap/extension-hard-break';

/** Style stamped on breaks the user authors, in the editor or in the source. */
const AUTHORED_HARD_BREAK_STYLE = 'backslash';

export const HardBreakFidelity = HardBreak.extend({
  priority: 60,

  addAttributes() {
    return {
      ...this.parent?.(),
      /**
       * `soft` is the default because this node is the schema's
       * `linebreakReplacement`: whenever ProseMirror re-parses a block it just
       * touched, every literal newline inside that paragraph's text comes back
       * as a hardBreak built from bare defaults. Those newlines are soft wraps
       * in the source, not Markdown hard breaks, so a real break style as the
       * default rewrote `covers\nyour change:` into `covers\` on the next save
       * — silently, for any paragraph the editor happened to re-render.
       *
       * Breaks that really are hard breaks never rely on this default: the
       * Markdown parser stamps the style it read, `parseHTML` stamps authored
       * `<br>` markup, and the shortcuts below stamp what the user typed.
       */
      hardBreakStyle: { default: 'soft' },
      // Void-HTML-authored breaks (`<br>` / `<br/>` / `<br />`) carry their
      // exact source spelling so serialization re-emits it byte-identically.
      sourceRaw: { default: null },
    };
  },

  parseHTML() {
    // A `<br>` in the source is authored markup; only ProseMirror's synthetic
    // linebreak replacement is allowed to fall through to the `soft` default.
    return [{ tag: 'br', getAttrs: () => ({ hardBreakStyle: AUTHORED_HARD_BREAK_STYLE }) }];
  },

  addKeyboardShortcuts() {
    // Shift+Enter means "break this line here", so it must serialize as a real
    // Markdown hard break rather than inherit the soft default.
    const insertAuthoredBreak = () =>
      this.editor
        .chain()
        .insertContent({ type: this.name, attrs: { hardBreakStyle: AUTHORED_HARD_BREAK_STYLE } })
        .run();
    return { 'Mod-Enter': insertAuthoredBreak, 'Shift-Enter': insertAuthoredBreak };
  },
});
