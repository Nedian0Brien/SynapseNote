/**
 * Whether any find bar is currently open, as a module-level signal.
 *
 * ⌘G is shared: `find-next` owns it while the find bar is open, and the project
 * graph owns it the rest of the time (both bindings are declared in
 * `keyboard-shortcuts.ts`). The two handlers live in different trees — the find
 * controller mounts under the active editor, the graph shortcut is global — and
 * both listen on `window`, so neither can resolve the overlap by relying on
 * listener order or on `defaultPrevented`. This is the one bit of state they
 * share, and it is deliberately the smallest possible surface: no React context
 * to thread, no DOM sniffing for the bar element.
 *
 * A COUNT rather than a boolean: the editor Activity pool keeps unmounted-but-
 * alive editors around, so more than one controller can register at a time. The
 * bar is open as long as at least one of them says so.
 */
let openCount = 0;

/**
 * Register a find bar as open. Returns the matching release, shaped for direct
 * use as a `useEffect` cleanup so a controller can never leak a count.
 */
export function markFindBarOpen(): () => void {
  openCount += 1;
  let released = false;
  return () => {
    // Guard against a double release (StrictMode double-invokes effects)
    // driving the count negative and wedging the bar "closed" forever.
    if (released) return;
    released = true;
    openCount -= 1;
  };
}

export function isFindBarOpen(): boolean {
  return openCount > 0;
}

/** Test-only: drop any counts a previous test left behind. */
export function resetFindBarOpenStateForTests(): void {
  openCount = 0;
}
