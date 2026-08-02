import { relative, resolve, sep } from 'node:path';
import type { CC1DatabaseChangeReason } from '@nedian0brien/synapsenote-core';
import {
  applyDatabaseRecordDiskEvent,
  type DatabaseRecordIndex,
  type DatabaseRecordIndexRebuildResult,
} from './database-record-index.ts';
import { recordDatabaseIndexRebuild } from './database-telemetry.ts';
import { assertNeverDiskEvent, type DiskEvent } from './file-watcher.ts';

export type DatabaseIndexRefreshReason =
  | 'startup'
  | 'schema-change'
  | 'git-sync'
  | 'branch-switch'
  | 'transaction'
  | 'watcher-overflow';

const DATABASE_INDEX_MAX_QUEUED_EVENTS = 1_000;
const DATABASE_INDEX_MAX_CHANGE_LISTENERS = 256;

export interface CreateDatabaseIndexCoordinatorOptions {
  contentDir: string;
  databaseRecordIndex: DatabaseRecordIndex;
  /** Test seam; production uses DATABASE_INDEX_MAX_QUEUED_EVENTS. */
  maxQueuedEvents?: number;
  /** Test seam; production uses DATABASE_INDEX_MAX_CHANGE_LISTENERS. */
  maxChangeListeners?: number;
}

export type DatabaseIndexChangeEvent =
  | {
      kind: 'records';
      reasons: readonly CC1DatabaseChangeReason[];
      databaseIds: readonly string[];
      sourceIds: readonly string[];
      recordIds: readonly string[];
    }
  | {
      kind: 'index';
      phase: 'rebuilding' | 'ready' | 'error';
      reasons: readonly DatabaseIndexRefreshReason[];
    };

export type DatabaseIndexChangeListener = (event: DatabaseIndexChangeEvent) => void;

/**
 * Serializes canonical index rebuilds and preserves file events that arrive
 * while a rebuild is reading disk. Repeated refresh requests are coalesced into
 * the minimum number of ordered rebuilds without letting a later schema or Git
 * transition reuse a scan that began against older canonical state.
 */
export class DatabaseIndexCoordinator {
  readonly #contentDir: string;
  readonly #databaseRecordIndex: DatabaseRecordIndex;
  readonly #queuedEvents: DiskEvent[] = [];
  readonly #pendingReasons = new Set<DatabaseIndexRefreshReason>();
  readonly #changeListeners = new Set<DatabaseIndexChangeListener>();
  readonly #maxQueuedEvents: number;
  readonly #maxChangeListeners: number;
  #queueOverflowed = false;
  #refreshRequested = false;
  #activeRefresh: Promise<DatabaseRecordIndexRebuildResult> | null = null;

  constructor(options: CreateDatabaseIndexCoordinatorOptions) {
    if (
      !Number.isSafeInteger(options.maxQueuedEvents ?? DATABASE_INDEX_MAX_QUEUED_EVENTS) ||
      (options.maxQueuedEvents ?? DATABASE_INDEX_MAX_QUEUED_EVENTS) < 1 ||
      !Number.isSafeInteger(options.maxChangeListeners ?? DATABASE_INDEX_MAX_CHANGE_LISTENERS) ||
      (options.maxChangeListeners ?? DATABASE_INDEX_MAX_CHANGE_LISTENERS) < 1
    ) {
      throw new RangeError('Database index coordinator limits must be positive safe integers');
    }
    this.#contentDir = options.contentDir;
    this.#databaseRecordIndex = options.databaseRecordIndex;
    this.#maxQueuedEvents = options.maxQueuedEvents ?? DATABASE_INDEX_MAX_QUEUED_EVENTS;
    this.#maxChangeListeners = options.maxChangeListeners ?? DATABASE_INDEX_MAX_CHANGE_LISTENERS;
  }

  applyDiskEvent(event: DiskEvent): void {
    if (this.#activeRefresh !== null) {
      if (this.#queueOverflowed) return;
      if (this.#queuedEvents.length >= this.#maxQueuedEvents) {
        this.#queuedEvents.splice(0, this.#queuedEvents.length);
        this.#queueOverflowed = true;
        this.#pendingReasons.add('watcher-overflow');
        this.#refreshRequested = true;
        return;
      }
      this.#queuedEvents.push(structuredClone(event));
      return;
    }
    this.#applyAndPublishDiskEvent(event);
  }

  setChangeListener(listener: DatabaseIndexChangeListener | null): void {
    this.#changeListeners.clear();
    if (listener) this.#changeListeners.add(listener);
  }

  subscribeChanges(listener: DatabaseIndexChangeListener): () => void {
    if (
      !this.#changeListeners.has(listener) &&
      this.#changeListeners.size >= this.#maxChangeListeners
    ) {
      throw new RangeError(
        `Database index subscriptions exceed the ${this.#maxChangeListeners}-listener limit`,
      );
    }
    this.#changeListeners.add(listener);
    return () => this.#changeListeners.delete(listener);
  }

  refresh(reason: DatabaseIndexRefreshReason): Promise<DatabaseRecordIndexRebuildResult> {
    this.#pendingReasons.add(reason);
    this.#refreshRequested = true;
    if (this.#activeRefresh !== null) return this.#activeRefresh;

    const refresh = this.#drainRefreshes();
    this.#activeRefresh = refresh;
    void refresh.then(
      () => {
        if (this.#activeRefresh === refresh) this.#activeRefresh = null;
      },
      () => {
        if (this.#activeRefresh === refresh) this.#activeRefresh = null;
      },
    );
    return refresh;
  }

  pendingReasons(): readonly DatabaseIndexRefreshReason[] {
    return [...this.#pendingReasons].sort((left, right) => left.localeCompare(right));
  }

  async #drainRefreshes(): Promise<DatabaseRecordIndexRebuildResult> {
    let result: DatabaseRecordIndexRebuildResult | null = null;
    try {
      do {
        this.#refreshRequested = false;
        const reasons = [...this.#pendingReasons].sort((left, right) => left.localeCompare(right));
        this.#pendingReasons.clear();
        const rebuildStartedAt = performance.now();
        const rebuilding = this.#databaseRecordIndex.rebuild();
        this.#publish({ kind: 'index', phase: 'rebuilding', reasons });
        try {
          result = await rebuilding;
          recordDatabaseIndexRebuild('success', performance.now() - rebuildStartedAt);
        } catch (error) {
          recordDatabaseIndexRebuild('failure', performance.now() - rebuildStartedAt);
          this.#publish({ kind: 'index', phase: 'error', reasons });
          throw error;
        }

        const events = this.#queueOverflowed
          ? []
          : this.#queuedEvents.splice(0, this.#queuedEvents.length);
        this.#queuedEvents.splice(0, this.#queuedEvents.length);
        this.#queueOverflowed = false;
        for (const event of events) {
          this.#applyAndPublishDiskEvent(event);
        }
        this.#publish({ kind: 'index', phase: 'ready', reasons });
      } while (this.#refreshRequested);
    } catch (error) {
      // A future successful canonical rebuild subsumes all queued incremental
      // events. Applying them against a failed/stale schema would be unsafe.
      this.#queuedEvents.splice(0, this.#queuedEvents.length);
      this.#pendingReasons.clear();
      this.#refreshRequested = false;
      this.#queueOverflowed = false;
      throw error;
    }

    if (result === null) throw new Error('Database index refresh completed without a rebuild');
    return result;
  }

  #applyAndPublishDiskEvent(event: DiskEvent): void {
    const paths = this.#recordPaths(event);
    const before = paths.map((path) => this.#databaseRecordIndex.inspectPath(path));
    applyDatabaseRecordDiskEvent(this.#databaseRecordIndex, this.#contentDir, event);
    const after = paths.map((path) => this.#databaseRecordIndex.inspectPath(path));
    const affected = [...before, ...after].filter((state) => state.managed);
    if (affected.length === 0) return;
    const reason = (() => {
      switch (event.kind) {
        case 'create':
          return 'record-create' as const;
        case 'update':
          return 'record-update' as const;
        case 'delete':
          return 'record-delete' as const;
        case 'rename':
          return 'record-rename' as const;
        case 'conflict':
          return 'record-conflict' as const;
        case 'asset-create':
        case 'asset-delete':
        case 'folder-create':
        case 'folder-delete':
        case 'file-create':
        case 'file-update':
        case 'file-delete':
          return null;
        default:
          return assertNeverDiskEvent(event);
      }
    })();
    if (reason === null) return;
    const ids = (key: 'databaseId' | 'sourceId' | 'recordId') =>
      [
        ...new Set(affected.map((state) => state[key]).filter((id): id is string => id !== null)),
      ].sort((left, right) => left.localeCompare(right));
    this.#publish({
      kind: 'records',
      reasons: [reason],
      databaseIds: ids('databaseId'),
      sourceIds: ids('sourceId'),
      recordIds: ids('recordId'),
    });
  }

  #recordPaths(event: DiskEvent): string[] {
    const toRecordPath = (path: string): string | null => {
      const resolved = resolve(path);
      const rel = relative(this.#contentDir, resolved);
      if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`)) return null;
      return rel.split(sep).join('/');
    };
    const absolutePaths =
      event.kind === 'rename'
        ? [event.oldPath, event.newPath]
        : ['path' in event ? event.path : ''];
    return [
      ...new Set(absolutePaths.map(toRecordPath).filter((path): path is string => path !== null)),
    ];
  }

  #publish(event: DatabaseIndexChangeEvent): void {
    for (const listener of this.#changeListeners) {
      try {
        listener(event);
      } catch {
        // Realtime invalidation must never make canonical indexing fail.
      }
    }
  }
}

export function createDatabaseIndexCoordinator(
  options: CreateDatabaseIndexCoordinatorOptions,
): DatabaseIndexCoordinator {
  return new DatabaseIndexCoordinator(options);
}
