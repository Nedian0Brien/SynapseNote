import { useSyncExternalStore } from 'react';

export interface DatabaseRecordHeader {
  databaseName: string;
  sourceName: string;
  recordTitle: string;
}

type DatabaseRecordHeaderSnapshot = ReadonlyMap<string, DatabaseRecordHeader>;

let snapshot: DatabaseRecordHeaderSnapshot = new Map();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function publishDatabaseRecordHeader(docName: string, header: DatabaseRecordHeader) {
  const next = new Map(snapshot);
  next.set(docName, header);
  snapshot = next;
  emit();

  return () => {
    if (snapshot.get(docName) !== header) return;
    const next = new Map(snapshot);
    next.delete(docName);
    snapshot = next;
    emit();
  };
}

export function useDatabaseRecordHeader(docName: string | null) {
  const headers = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
  return docName ? (headers.get(docName) ?? null) : null;
}
