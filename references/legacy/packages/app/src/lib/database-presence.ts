import type {
  AwarenessState,
  DatabasePresenceEntry,
  DatabasePresenceOperation,
  DatabasePresenceScope,
} from '@nedian0brien/synapsenote-core';
import { useEffect, useId, useSyncExternalStore } from 'react';

export const DATABASE_PRESENCE_STALE_MS = 15_000;
export const DATABASE_PRESENCE_HEARTBEAT_MS = 5_000;

export interface DatabasePresenceTarget {
  databaseId: string;
  sourceId: string | null;
  recordId: string | null;
  propertyId: string | null;
  viewId: string | null;
  scope: DatabasePresenceScope;
  operation: DatabasePresenceOperation;
}

type TargetListener = (target: DatabasePresenceTarget | null) => void;
const targetSources = new Map<string, DatabasePresenceTarget>();
const targetListeners = new Set<TargetListener>();
let remoteSnapshot: readonly DatabasePresenceEntry[] = [];
const remoteListeners = new Set<() => void>();

function resolvedTarget(): DatabasePresenceTarget | null {
  return Array.from(targetSources.values()).at(-1) ?? null;
}

function emitTarget(): void {
  const target = resolvedTarget();
  for (const listener of targetListeners) listener(target);
}

/** Register a UI focus source. The most recently updated mounted source wins. */
export function setDatabasePresenceSource(
  sourceKey: string,
  target: DatabasePresenceTarget | null,
): void {
  targetSources.delete(sourceKey);
  if (target) targetSources.set(sourceKey, target);
  emitTarget();
}

export function subscribeDatabasePresenceTarget(listener: TargetListener): () => void {
  targetListeners.add(listener);
  listener(resolvedTarget());
  return () => targetListeners.delete(listener);
}

export function useDatabasePresenceTarget(target: DatabasePresenceTarget | null): void {
  const sourceKey = useId();
  const serialized = target ? JSON.stringify(target) : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: serialized is the stable semantic target and avoids churn from caller object literals.
  useEffect(() => {
    setDatabasePresenceSource(sourceKey, target);
    return () => setDatabasePresenceSource(sourceKey, null);
  }, [sourceKey, serialized]);
}

function isPresenceEntry(value: unknown): value is DatabasePresenceEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<DatabasePresenceEntry>;
  const actor = entry.actor as Partial<DatabasePresenceEntry['actor']> | undefined;
  return (
    !!actor &&
    (actor.kind === 'human' || actor.kind === 'agent') &&
    typeof actor.name === 'string' &&
    typeof actor.color === 'string' &&
    typeof entry.databaseId === 'string' &&
    (entry.sourceId === null || typeof entry.sourceId === 'string') &&
    (entry.recordId === null || typeof entry.recordId === 'string') &&
    (entry.propertyId === null || typeof entry.propertyId === 'string') &&
    (entry.viewId === null || typeof entry.viewId === 'string') &&
    (entry.scope === 'cell' || entry.scope === 'record' || entry.scope === 'schema') &&
    (entry.operation === 'viewing' ||
      entry.operation === 'editing' ||
      entry.operation === 'planning' ||
      entry.operation === 'committing') &&
    typeof entry.updatedAt === 'number' &&
    Number.isFinite(entry.updatedAt)
  );
}

export function collectDatabasePresence(
  states: ReadonlyMap<number, unknown>,
  localClientId: number,
  now = Date.now(),
): readonly DatabasePresenceEntry[] {
  const entries: DatabasePresenceEntry[] = [];
  for (const [clientId, rawState] of states) {
    if (clientId === localClientId || !rawState || typeof rawState !== 'object') continue;
    const entry = (rawState as Partial<AwarenessState>).databasePresence;
    if (!isPresenceEntry(entry)) continue;
    if (now - entry.updatedAt >= DATABASE_PRESENCE_STALE_MS || entry.updatedAt > now + 5_000)
      continue;
    entries.push(entry);
  }
  return entries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function publishRemoteDatabasePresence(entries: readonly DatabasePresenceEntry[]): void {
  remoteSnapshot = entries;
  for (const listener of remoteListeners) listener();
}

export function useRemoteDatabasePresence(): readonly DatabasePresenceEntry[] {
  return useSyncExternalStore(
    (listener) => {
      remoteListeners.add(listener);
      return () => remoteListeners.delete(listener);
    },
    () => remoteSnapshot,
    () => [],
  );
}

export function publishLocalDatabasePresence(
  awareness:
    | {
        getLocalState: () => Record<string, unknown> | null;
        setLocalState: (state: Record<string, unknown> | null) => void;
      }
    | null
    | undefined,
  entry: DatabasePresenceEntry | null,
): void {
  if (!awareness) return;
  const existing = awareness.getLocalState() ?? {};
  if (entry) awareness.setLocalState({ ...existing, databasePresence: entry });
  else {
    const { databasePresence: _removed, ...rest } = existing;
    awareness.setLocalState(rest);
  }
}

export function resetDatabasePresenceForTests(): void {
  targetSources.clear();
  targetListeners.clear();
  remoteSnapshot = [];
  remoteListeners.clear();
}
