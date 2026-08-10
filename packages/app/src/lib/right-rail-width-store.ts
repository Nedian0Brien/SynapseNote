// The right rail has ONE width. It used to be two: `ok-doc-panel-width-v1` for
// the document tools and `ok-terminal-width-v1` for the chat column, which were
// separate panels. Switching between them made the rail jump, so the two stores
// ended up force-synced to the same value on every write — a workaround for a
// split that no longer exists now that chat and the document tools are tools in
// one panel.
export const RIGHT_RAIL_WIDTH_KEY = 'ok-right-rail-width-v1';

// Legacy keys, read once for migration. The doc-panel key is the one to trust:
// the last build wrote both in lockstep, and its clamp range is the narrower of
// the two, so a value from it is always valid here.
const LEGACY_DOC_PANEL_WIDTH_KEY = 'ok-doc-panel-width-v1';
const LEGACY_TERMINAL_WIDTH_KEY = 'ok-terminal-width-v1';

export const DEFAULT_RIGHT_RAIL_WIDTH = 320;
// The widest tool's minimum wins: the document tools were usable from 300px,
// but a CLI chat reflows badly below ~92 columns.
export const MIN_RIGHT_RAIL_WIDTH = 320;
// A toolbox does not take the window. Chat was previously uncapped (draggable
// to 95%, with the content surface squeezed to a 5% sliver), which made the
// rail read as a second content surface rather than a drawer.
export const MAX_RIGHT_RAIL_WIDTH = 720;

export interface WidthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function clamp(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_RIGHT_RAIL_WIDTH;
  if (px < MIN_RIGHT_RAIL_WIDTH) return MIN_RIGHT_RAIL_WIDTH;
  if (px > MAX_RIGHT_RAIL_WIDTH) return MAX_RIGHT_RAIL_WIDTH;
  return Math.round(px);
}

function parse(raw: string | null): number | null {
  if (raw == null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? clamp(parsed) : null;
}

export function readRightRailWidth(storage?: WidthStorage): number {
  try {
    const s = storage ?? localStorage;
    return (
      parse(s.getItem(RIGHT_RAIL_WIDTH_KEY)) ??
      // One-way migration: an app that has only ever run the two-panel build
      // keeps the width the user set there. Nothing writes the legacy keys any
      // more, so this branch stops firing after the first resize.
      parse(s.getItem(LEGACY_DOC_PANEL_WIDTH_KEY)) ??
      parse(s.getItem(LEGACY_TERMINAL_WIDTH_KEY)) ??
      DEFAULT_RIGHT_RAIL_WIDTH
    );
  } catch {
    return DEFAULT_RIGHT_RAIL_WIDTH;
  }
}

export function writeRightRailWidth(px: number, storage?: WidthStorage): void {
  try {
    const s = storage ?? localStorage;
    s.setItem(RIGHT_RAIL_WIDTH_KEY, String(clamp(px)));
  } catch {
    // quota exceeded — in-memory state holds for the session (mirrors sidebar-pin-store)
  }
}

export function getInitialRightRailWidth(): number {
  // `typeof localStorage` is not safe when localStorage is a property getter
  // that throws on access (file:// protocol, Safari private mode SecurityError,
  // sandboxed iframes). Wrap the entire dispatch in try/catch so the
  // synchronous-init contract survives any storage-restricted host.
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_RIGHT_RAIL_WIDTH;
    return readRightRailWidth();
  } catch {
    return DEFAULT_RIGHT_RAIL_WIDTH;
  }
}
