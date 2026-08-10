/**
 * ⌘G / Ctrl-G — open the whole-project link graph, the gesture Obsidian uses.
 *
 * Hash IS the route state (the `NavigationHandler` / `useSettingsRoute`
 * precedent in App.tsx): this hook only mutates the hash, and the navigation
 * handler resolves `#/__graph__` into the graph target. Every other entry point
 * — the rail's expand button, the command palette — sets the same literal.
 */

import { useEffect } from 'react';
import { isFindBarOpen } from '@/editor/find-replace/find-bar-open-state';
import { GRAPH_HASH, isGraphHash } from '@/lib/doc-hash';
import { matchesKeyboardShortcut, type ShortcutEventLike } from '@/lib/keyboard-shortcuts';

/**
 * Deliberately NOT suppressed on editable targets, unlike the Cmd-, settings
 * gesture. The editor surface is contenteditable, so suppressing there would
 * mean ⌘G never fires while writing — which is exactly when a user reaches for
 * the graph. ⌘G is not a text-editing chord, so there is nothing to protect.
 *
 * The one real conflict is `find-next`, which owns ⌘G while the visual-editor
 * find bar is open. That handler lives in a different tree and also listens on
 * `window`, so the two cannot resolve the overlap by listener order — the find
 * bar publishes its open state instead and this predicate stands down.
 */
export function isGraphShortcut(e: ShortcutEventLike): boolean {
  if (isFindBarOpen()) return false;
  return matchesKeyboardShortcut(e, 'graph-open');
}

export function openGraphSurface(): void {
  if (typeof window === 'undefined') return;
  // Re-navigating to the hash we are already on fires no `hashchange`, so a
  // second ⌘G on the graph would be a no-op either way — return early to keep
  // it from pushing a duplicate history entry.
  if (isGraphHash(window.location.hash)) return;
  window.location.assign(GRAPH_HASH);
}

/** Binds the global ⌘G listener. Mount once, at the app shell. */
export function useGraphShortcut(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isGraphShortcut(event)) return;
      event.preventDefault();
      openGraphSurface();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
