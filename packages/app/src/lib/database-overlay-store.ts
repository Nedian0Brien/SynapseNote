import type {
  DatabaseDefinition,
  DatabaseSource,
  ProjectedDatabaseRecord,
} from '@nedian0brien/synapsenote-core';
import { createContext, use, useSyncExternalStore } from 'react';
import { recordDatabaseInteractionTrace } from './database-interaction-trace';

export type DatabaseRecordPeekMode = 'side_peek' | 'center_peek';
export type DatabaseOverlayDismissReason = 'explicit' | 'escape' | 'outside' | 'navigation';

export interface DatabaseRecordPeekOverlay {
  database: DatabaseDefinition;
  source: DatabaseSource;
  record: ProjectedDatabaseRecord;
  mode: DatabaseRecordPeekMode;
  notionSurface: boolean;
  /** Called by the peek when the user explicitly opens the canonical page. */
  onOpenFull: () => void;
  /** Optional callback for previous/next record navigation inside the view. */
  onNavigateRecord?: (path: string) => void;
  /** The control that initiated the overlay, used for focus restoration. */
  trigger: HTMLElement | null;
  interactionId?: string;
}

export interface DatabaseOverlayState {
  recordPeek: DatabaseRecordPeekOverlay | null;
}

const EMPTY_STATE: DatabaseOverlayState = { recordPeek: null };
let state: DatabaseOverlayState = EMPTY_STATE;
const listeners = new Set<() => void>();

const DatabaseOverlayProviderContext = createContext(false);

export const DatabaseOverlayProvider = DatabaseOverlayProviderContext.Provider;

export function useDatabaseOverlayProvider(): boolean {
  return use(DatabaseOverlayProviderContext);
}

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeDatabaseOverlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDatabaseOverlaySnapshot(): DatabaseOverlayState {
  return state;
}

export function openDatabaseRecordPeek(input: DatabaseRecordPeekOverlay): void {
  state = { recordPeek: input };
  recordDatabaseInteractionTrace(input.interactionId ?? 'untracked', 'overlay_updated', {
    mode: input.mode,
    recordId: input.record.id,
  });
  notify();
}

export function updateDatabaseRecordPeek(
  update: Partial<Pick<DatabaseRecordPeekOverlay, 'record' | 'mode'>>,
): void {
  if (!state.recordPeek) return;
  state = { recordPeek: { ...state.recordPeek, ...update } };
  notify();
}

export function closeDatabaseRecordPeek(reason: DatabaseOverlayDismissReason = 'explicit'): void {
  if (!state.recordPeek) return;
  const interactionId = state.recordPeek.interactionId;
  const trigger = state.recordPeek.trigger;
  state = EMPTY_STATE;
  recordDatabaseInteractionTrace(interactionId ?? 'untracked', 'overlay_closed', { reason });
  notify();
  if (!trigger) return;
  requestAnimationFrame(() => {
    if (trigger.isConnected) trigger.focus();
  });
}

export function useDatabaseOverlayState(): DatabaseOverlayState {
  return useSyncExternalStore(
    subscribeDatabaseOverlay,
    getDatabaseOverlaySnapshot,
    getDatabaseOverlaySnapshot,
  );
}

/** Test-only reset that also protects isolated DOM tests from leaked overlays. */
export function resetDatabaseOverlayState(): void {
  state = EMPTY_STATE;
  notify();
}
