/**
 * Plugin state for the paste-format menu — where the menu is anchored,
 * what it offers, and which row is highlighted.
 *
 * Kept apart from the extension that renders it so the dismissal rules
 * (the part that decides whether the menu is still relevant) are unit
 * testable without a React renderer or a live editor view.
 *
 * ── Dismissal ────────────────────────────────────────────────────────────
 *
 * The menu is transient by design: it opens uninvited after a paste, so
 * anything that looks like "the author moved on" closes it. That is every
 * document change and every explicit selection change — typing, clicking
 * elsewhere, arrow keys that PM handled, a collaborator's edit. The two
 * exceptions are the transactions this feature dispatches itself (open,
 * and highlight moves), which carry the plugin's own meta.
 *
 * The result is that the menu can never outlive the range it points at:
 * by the time a stored `{from, to}` could have been invalidated, the state
 * holding it is already gone.
 */

import type { PluginSpec, Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  defaultPasteFormatIndex,
  type InternalDocTarget,
  internalDocTarget,
  type PasteFormat,
  pasteFormatOptions,
} from './paste-format-options.ts';

export interface PasteFormatMenuState {
  /** Inline range the paste linkified — the range every format replaces. */
  readonly from: number;
  readonly to: number;
  readonly url: string;
  readonly options: readonly PasteFormat[];
  readonly internalDoc: InternalDocTarget | null;
  readonly selectedIndex: number;
}

export type PasteFormatMenuMeta =
  | { readonly type: 'open'; readonly state: PasteFormatMenuState }
  | { readonly type: 'close' }
  | { readonly type: 'move'; readonly delta: number };

export const pasteFormatMenuKey = new PluginKey<PasteFormatMenuState | null>('pasteFormatMenu');

/** Build the initial open state for a linkified range. */
export function openState(args: {
  from: number;
  to: number;
  url: string;
  options: readonly PasteFormat[];
  internalDoc: InternalDocTarget | null;
}): PasteFormatMenuState {
  return {
    from: args.from,
    to: args.to,
    url: args.url,
    options: args.options,
    internalDoc: args.internalDoc,
    selectedIndex: defaultPasteFormatIndex(args.options),
  };
}

/** Wrap-around highlight movement, so ArrowUp on the first row lands on the last. */
export function movedSelection(state: PasteFormatMenuState, delta: number): PasteFormatMenuState {
  const count = state.options.length;
  if (count === 0) return state;
  const next = (((state.selectedIndex + delta) % count) + count) % count;
  return { ...state, selectedIndex: next };
}

/** The format the author would commit right now, or null when the menu is closed. */
export function highlightedFormat(state: PasteFormatMenuState | null): PasteFormat | null {
  if (!state) return null;
  return state.options[state.selectedIndex] ?? null;
}

/**
 * Plugin `apply` — see the dismissal note in the file header. Pure over
 * `(tr, value)` so the rules can be exercised directly.
 */
export function applyPasteFormatMenuTransaction(
  tr: Transaction,
  value: PasteFormatMenuState | null,
): PasteFormatMenuState | null {
  const meta = tr.getMeta(pasteFormatMenuKey) as PasteFormatMenuMeta | undefined;
  if (meta?.type === 'open') return meta.state;
  if (meta?.type === 'close') return null;
  if (!value) return null;
  if (meta?.type === 'move') return movedSelection(value, meta.delta);
  if (tr.docChanged || tr.selectionSet) return null;
  return value;
}

/**
 * Ask the menu to open over a range the paste dispatcher just linkified.
 *
 * Called from the dispatcher's lone-URL branch, which knows the paste
 * happened but not what the resulting link looks like — so the href and
 * the exact range come from the freshly-inserted link mark rather than
 * from the clipboard bytes. That matters for GFM autolinks, where the
 * parser can leave trailing punctuation outside the mark: the menu
 * replaces what is actually linked, never a character more.
 *
 * Returns false (and dispatches nothing) when there is no link in the
 * range or when the URL has only one sensible form — a one-row menu over
 * a paste that already did the right thing is noise.
 */
export function requestPasteFormatMenu(
  view: EditorView,
  from: number,
  to: number,
  appOrigin: string | null,
): boolean {
  if (!(to > from) || from < 0 || to > view.state.doc.content.size) return false;

  let markFrom = -1;
  let markTo = -1;
  let href: string | null = null;
  view.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;
    const link = node.marks.find((mark) => mark.type.name === 'link');
    if (!link) return true;
    const rawHref = link.attrs.href;
    if (typeof rawHref !== 'string' || !rawHref) return true;
    if (markFrom < 0) {
      markFrom = Math.max(pos, from);
      href = rawHref;
    }
    markTo = Math.min(pos + node.nodeSize, to);
    return true;
  });
  if (href === null || markFrom < 0 || markTo <= markFrom) return false;

  const options = pasteFormatOptions({ url: href, appOrigin });
  if (options.length < 2) return false;

  view.dispatch(
    view.state.tr.setMeta(pasteFormatMenuKey, {
      type: 'open',
      state: openState({
        from: markFrom,
        to: markTo,
        url: href,
        options,
        internalDoc: internalDocTarget({ url: href, appOrigin }),
      }),
    } satisfies PasteFormatMenuMeta),
  );
  return true;
}

/** Dismiss the menu. Exported so pointer paths (a click on a row) can reuse it. */
export function closePasteFormatMenu(view: EditorView): void {
  view.dispatch(
    view.state.tr.setMeta(pasteFormatMenuKey, { type: 'close' } satisfies PasteFormatMenuMeta),
  );
}

/** Move the highlight by `delta` rows (wrapping). */
export function movePasteFormatHighlight(view: EditorView, delta: number): void {
  view.dispatch(
    view.state.tr.setMeta(pasteFormatMenuKey, {
      type: 'move',
      delta,
    } satisfies PasteFormatMenuMeta),
  );
}

export interface PasteFormatMenuPluginOptions {
  /**
   * Commit the highlighted format. The plugin has already closed the menu
   * by the time this runs, so the handler only has to apply the edit.
   */
  readonly onCommit: (
    view: EditorView,
    state: PasteFormatMenuState,
    format: PasteFormat,
  ) => void;
  /** Popup renderer, supplied by the extension. Omitted in headless tests. */
  readonly view?: PluginSpec<PasteFormatMenuState | null>['view'];
}

/**
 * The plugin itself: dismissal rules, the keyboard grammar, and (when the
 * caller supplies one) the popup view.
 *
 * Keyboard grammar while the menu is open:
 *
 *   ↑ / ↓        move the highlight, wrapping
 *   Enter / Tab  commit the highlighted format — EXCEPT on the `URL` row
 *   Escape       dismiss
 *   anything else falls through, and the fall-through dismisses (any doc
 *                change or selection move clears the state)
 *
 * The `URL` carve-out is the load-bearing one. `URL` is where the highlight
 * starts and it names the state the document is already in, so committing
 * it would change nothing while swallowing the Enter that someone who just
 * pasted a URL at the end of a line is about to press. On that row the menu
 * closes and the keystroke goes to ProseMirror untouched.
 */
export function createPasteFormatMenuPlugin(
  options: PasteFormatMenuPluginOptions,
): Plugin<PasteFormatMenuState | null> {
  return new Plugin<PasteFormatMenuState | null>({
    key: pasteFormatMenuKey,
    state: {
      init: () => null,
      apply: applyPasteFormatMenuTransaction,
    },
    ...(options.view ? { view: options.view } : {}),
    props: {
      handleKeyDown(view, event) {
        const state = pasteFormatMenuKey.getState(view.state);
        if (!state) return false;

        if (event.key === 'ArrowDown') {
          movePasteFormatHighlight(view, 1);
          return true;
        }
        if (event.key === 'ArrowUp') {
          movePasteFormatHighlight(view, -1);
          return true;
        }
        if (event.key === 'Escape') {
          closePasteFormatMenu(view);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const format = highlightedFormat(state);
          if (!format || format === 'url') {
            closePasteFormatMenu(view);
            return false;
          }
          closePasteFormatMenu(view);
          options.onCommit(view, state, format);
          return true;
        }
        return false;
      },
    },
  });
}
