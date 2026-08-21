import { createDatabaseCreationId } from './database-creation';

const CREATION_INTENT_PREFIX = 'synapsenote-database-creation-intent-v1';

export interface DatabaseCreationIntentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DatabaseCreationIntent {
  version: 1;
  id: string;
  createdAt: number;
}

function workspaceIdentity(): string {
  if (typeof window === 'undefined') return 'server';
  return window.okDesktop?.config.projectPath || window.location.origin || 'web';
}

function storageKey(kind: string, workspace = workspaceIdentity()): string {
  return `${CREATION_INTENT_PREFIX}:${encodeURIComponent(workspace)}:${encodeURIComponent(kind)}`;
}

function validIntent(value: unknown): value is DatabaseCreationIntent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DatabaseCreationIntent>;
  return (
    candidate.version === 1 &&
    typeof candidate.id === 'string' &&
    /^creation_[a-z0-9]+$/.test(candidate.id) &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    candidate.createdAt >= 0
  );
}

function browserStorage(): DatabaseCreationIntentStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getOrCreateDatabaseCreationIntent(
  kind: string,
  options: {
    storage?: DatabaseCreationIntentStorage | null;
    workspace?: string;
    now?: number;
  } = {},
): DatabaseCreationIntent {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const key = storageKey(kind, options.workspace);
  if (storage) {
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (validIntent(parsed)) return parsed;
      }
    } catch {
      // A corrupt or unavailable storage entry must not block creation.
    }
  }
  const intent: DatabaseCreationIntent = {
    version: 1,
    id: createDatabaseCreationId(),
    createdAt: options.now ?? Date.now(),
  };
  try {
    storage?.setItem(key, JSON.stringify(intent));
  } catch {
    // The caller still gets a stable intent for this component lifetime.
  }
  return intent;
}

export function completeDatabaseCreationIntent(
  kind: string,
  intentId: string,
  options: { storage?: DatabaseCreationIntentStorage | null; workspace?: string } = {},
): void {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  if (!storage) return;
  const key = storageKey(kind, options.workspace);
  try {
    const raw = storage.getItem(key);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (validIntent(parsed) && parsed.id === intentId) storage.removeItem(key);
  } catch {
    // Completion is best effort; a later successful recovery can clear it.
  }
}
