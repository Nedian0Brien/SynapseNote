export interface EditorTabModelInput {
  activeContextTabId: string | null;
  activeDocName: string | null;
  activeNewTabId: string | null;
  activeTargetTabId: string | null;
  isNewTabActive: boolean;
  newTabIds: readonly string[];
  openTabs: readonly string[];
}

export interface EditorTabModel {
  activeTabId: string | null;
  activeTabScrollKey: string;
  newTabIdSet: ReadonlySet<string>;
}

export function tabDomIdPart(docName: string): string {
  return docName.replace(/[^A-Za-z0-9_-]/g, '-');
}

/**
 * Owns the derived state shared by the tab strip's render and event paths.
 * Context values stay at the facade; this module deliberately receives only
 * immutable inputs so transition code cannot mutate document-tab state.
 */
export function createEditorTabModel({
  activeContextTabId,
  activeDocName,
  activeNewTabId,
  activeTargetTabId,
  isNewTabActive,
  newTabIds,
  openTabs,
}: EditorTabModelInput): EditorTabModel {
  const activeTabId = activeContextTabId ?? activeTargetTabId ?? activeDocName;
  const activeTabScrollKey = isNewTabActive
    ? `${activeNewTabId ?? '__new-tab__'}\u0000${openTabs.join('\u0000')}\u0000${newTabIds.join('\u0000')}`
    : activeTabId
      ? `${activeTabId}\u0000${openTabs.join('\u0000')}`
      : '';

  return { activeTabId, activeTabScrollKey, newTabIdSet: new Set(newTabIds) };
}

export interface TabReorderTransitionInput {
  activeTabId: string;
  overTabId: string | null;
}

export interface TabReorderTransition {
  activeTabId: string;
  orderedTabIds: string[];
}

/** Returns no transition for an incomplete or no-op drag. */
export function transitionTabReorder(
  visibleTabIds: readonly string[],
  { activeTabId, overTabId }: TabReorderTransitionInput,
): TabReorderTransition | null {
  if (!overTabId || activeTabId === overTabId) return null;
  const fromIndex = visibleTabIds.indexOf(activeTabId);
  const toIndex = visibleTabIds.indexOf(overTabId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;

  const orderedTabIds = [...visibleTabIds];
  const [movedTabId] = orderedTabIds.splice(fromIndex, 1);
  orderedTabIds.splice(toIndex, 0, movedTabId);
  return { activeTabId, orderedTabIds };
}

export function getOffsetTabId({
  activeTabId,
  offset,
  visibleTabIds,
}: {
  activeTabId: string | null;
  offset: number;
  visibleTabIds: readonly string[];
}): string | null {
  if (visibleTabIds.length === 0) return null;
  const activeIndex = activeTabId ? visibleTabIds.indexOf(activeTabId) : -1;
  const baseIndex = activeIndex >= 0 ? activeIndex : 0;
  return visibleTabIds[(baseIndex + offset + visibleTabIds.length) % visibleTabIds.length];
}

function shortcutDigitForIndex(index: number, tabCount: number): string | null {
  if (index < 0 || index >= tabCount) return null;
  if (index < 8) return String(index + 1);
  return index === tabCount - 1 ? '9' : null;
}

export function getTabShortcutHint(index: number, tabCount: number): string | null {
  return shortcutDigitForIndex(index, tabCount);
}

export function getTabAriaKeyShortcuts(index: number, tabCount: number): string | undefined {
  const shortcutDigit = shortcutDigitForIndex(index, tabCount);
  return shortcutDigit
    ? [`Meta+${shortcutDigit}`, `Control+${shortcutDigit}`].join(' ')
    : undefined;
}

export function getTabJumpIndex(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  tabCount: number,
): number | null {
  if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return null;
  if (!/^[1-9]$/.test(event.key)) return null;
  const digit = Number(event.key);
  if (digit === 9) return tabCount > 0 ? tabCount - 1 : null;
  const index = digit - 1;
  return index < Math.min(8, tabCount) ? index : null;
}
