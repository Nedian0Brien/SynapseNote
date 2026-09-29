import type { EditorView } from '@codemirror/view';
import { type ReactNode, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

interface PortalEntry {
  id: number;
  target: HTMLElement;
  content: ReactNode;
}

/** Portal targets belong to the cached CodeMirror view, not a React mount. */
export class LivePortalRegistry {
  private entries = new Map<number, PortalEntry>();
  private listeners = new Set<() => void>();
  private pendingObserved = new Set<() => void>();
  private snapshot: readonly PortalEntry[] = [];
  private nextId = 1;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.pendingObserved.size > 0) {
      const pending = [...this.pendingObserved];
      this.pendingObserved.clear();
      for (const task of pending) queueMicrotask(task);
    }
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): readonly PortalEntry[] => this.snapshot;

  /** Defer component imports until a React host can display the widget. */
  whenObserved(task: () => void): () => void {
    if (this.listeners.size > 0) queueMicrotask(task);
    else this.pendingObserved.add(task);
    return () => this.pendingObserved.delete(task);
  }

  register(target: HTMLElement, content: ReactNode): number {
    const id = this.nextId++;
    this.entries.set(id, { id, target, content });
    this.publish();
    return id;
  }

  update(id: number, content: ReactNode): void {
    const previous = this.entries.get(id);
    if (!previous) return;
    this.entries.set(id, { ...previous, content });
    this.publish();
  }

  unregister(id: number): void {
    if (!this.entries.delete(id)) return;
    this.publish();
  }

  private publish(): void {
    this.snapshot = [...this.entries.values()];
    for (const listener of this.listeners) listener();
  }
}

const byView = new WeakMap<EditorView, LivePortalRegistry>();

export function setLivePortalRegistry(view: EditorView, registry: LivePortalRegistry): void {
  byView.set(view, registry);
}

export function livePortalRegistryFor(view: EditorView): LivePortalRegistry {
  let registry = byView.get(view);
  if (!registry) {
    registry = new LivePortalRegistry();
    byView.set(view, registry);
  }
  return registry;
}

export function LivePortalHost({ registry }: { registry: LivePortalRegistry | null }) {
  const entries = useSyncExternalStore(
    registry?.subscribe ?? emptySubscribe,
    registry?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  return <>{entries.map((entry) => createPortal(entry.content, entry.target, entry.id))}</>;
}

const EMPTY_ENTRIES: readonly PortalEntry[] = [];
const emptySnapshot = (): readonly PortalEntry[] => EMPTY_ENTRIES;
const emptySubscribe = (): (() => void) => () => {};
