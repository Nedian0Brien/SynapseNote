import type { CurrentViewState } from '@nedian0brien/synapsenote-core';

/** Minimal Awareness surface used by the system-provider current-view signal. */
export interface CurrentViewAwareness {
  getLocalState: () => Record<string, unknown> | null;
  setLocalState: (state: Record<string, unknown> | null) => void;
}

/** Build the window-state payload published on `__system__` awareness. */
export function currentViewSnapshot(
  documentName: string | null,
  options: {
    focused?: boolean;
    visible?: boolean;
    updatedAt?: number;
  } = {},
): CurrentViewState {
  return {
    document: documentName,
    focused: options.focused ?? document.hasFocus(),
    visible: options.visible ?? document.visibilityState === 'visible',
    updatedAt: options.updatedAt ?? Date.now(),
  };
}

/**
 * Publish one window's view without replacing server-owned awareness fields
 * (`agentFocus` / `agentPresence`) or any future system-channel state.
 */
export function publishCurrentView(
  awareness: CurrentViewAwareness | null | undefined,
  view: CurrentViewState,
): void {
  if (!awareness) return;
  const existing = awareness.getLocalState() ?? {};
  awareness.setLocalState({ ...existing, currentView: view });
}
