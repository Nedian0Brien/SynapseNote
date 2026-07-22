import { afterEach, describe, expect, test } from 'bun:test';
import {
  emitDatabaseChanged,
  emitDocumentsChanged,
  subscribeToDatabaseChanged,
  subscribeToDocumentsChanged,
} from './documents-events';

const originalWindow = globalThis.window;

type Listener = (event: Event) => void;

function installFakeWindow() {
  const listeners = new Map<string, Set<Listener>>();
  const fakeWindow = {
    addEventListener(type: string, listener: Listener) {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow,
    writable: true,
  });

  return fakeWindow;
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
    writable: true,
  });
});

describe('documents changed event bridge', () => {
  test('deduplicates emitted channels for subscribers', () => {
    installFakeWindow();
    const received: unknown[] = [];
    const unsubscribe = subscribeToDocumentsChanged((channels) => received.push(channels));

    emitDocumentsChanged(['files', 'files', 'graph']);

    unsubscribe();
    expect(received).toEqual([['files', 'graph']]);
  });

  test('defaults missing channels to files for legacy app-local events', () => {
    const fakeWindow = installFakeWindow();
    const received: unknown[] = [];
    subscribeToDocumentsChanged((channels) => received.push(channels));

    fakeWindow.dispatchEvent(new CustomEvent('synapsenote:documents-changed'));

    expect(received).toEqual([['files']]);
  });

  test('filters malformed channels without throwing', () => {
    const fakeWindow = installFakeWindow();
    const received: unknown[] = [];
    subscribeToDocumentsChanged((channels) => received.push(channels));

    fakeWindow.dispatchEvent(
      new CustomEvent('synapsenote:documents-changed', {
        detail: { channels: ['files', 'bogus', 1, 'backlinks'] },
      }),
    );

    expect(received).toEqual([['files', 'backlinks']]);
  });
});

describe('database changed event bridge', () => {
  test('fans out validated content-free index state and supports unsubscribe', () => {
    installFakeWindow();
    const received: unknown[] = [];
    const unsubscribe = subscribeToDatabaseChanged((payload) => received.push(payload));
    const payload = {
      v: 1 as const,
      ch: 'database-changed' as const,
      seq: 1,
      scope: 'records' as const,
      reasons: ['record-update' as const],
      databaseIds: ['db_tasks'],
      sourceIds: ['ds_tasks'],
      recordIds: ['rec_task'],
      affectedIdsComplete: true,
      index: {
        state: 'idle' as const,
        revision: 'sha256:index',
        manifestRevision: 'sha256:manifest',
        recordCount: 1,
        issueCount: 0,
        progress: null,
      },
    };

    emitDatabaseChanged(payload);
    unsubscribe();
    emitDatabaseChanged({ ...payload, seq: 2 });

    expect(received).toEqual([payload]);
  });
});
