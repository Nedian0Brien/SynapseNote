/**
 * Device-local, per-project storage for Markdown document memos.
 *
 * Memos stay outside the Markdown source so personal reading notes do not alter
 * the document or its Git history. The project scope prevents two projects with
 * the same relative document path from sharing memo state on the same device.
 */

const DOCUMENT_MEMO_STORAGE_PREFIX = 'synapsenote-document-memo-v1';

export interface DocumentMemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DocumentMemoQuote {
  readonly markdown: string;
  readonly sourceLineStart?: number;
  readonly sourceLineEnd?: number;
}

export interface DocumentMemoEntry {
  readonly id: string;
  readonly body: string;
  readonly quote: DocumentMemoQuote | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface DocumentMemoState {
  readonly draft: string;
  readonly draftQuote: DocumentMemoQuote | null;
  readonly items: readonly DocumentMemoEntry[];
}

export const EMPTY_DOCUMENT_MEMO_STATE: DocumentMemoState = {
  draft: '',
  draftQuote: null,
  items: [],
};

function resolveStorage(): DocumentMemoStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveProjectScope(): string {
  if (typeof window === 'undefined') return 'server';
  const projectPath = window.okDesktop?.config.projectPath;
  if (projectPath) return `desktop:${projectPath}`;
  return `web:${window.location.origin}${window.location.pathname}`;
}

/** Small deterministic hash keeps an absolute desktop path out of the storage key. */
function hashScope(scope: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < scope.length; index += 1) {
    hash ^= scope.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function isQuote(value: unknown): value is DocumentMemoQuote {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<DocumentMemoQuote>;
  return (
    typeof candidate.markdown === 'string' &&
    (candidate.sourceLineStart === undefined || typeof candidate.sourceLineStart === 'number') &&
    (candidate.sourceLineEnd === undefined || typeof candidate.sourceLineEnd === 'number')
  );
}

function isEntry(value: unknown): value is DocumentMemoEntry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<DocumentMemoEntry>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.body === 'string' &&
    (candidate.quote === null || isQuote(candidate.quote)) &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  );
}

function parseStoredState(raw: string): DocumentMemoState {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return EMPTY_DOCUMENT_MEMO_STATE;
    }
    const candidate = parsed as {
      draft?: unknown;
      draftQuote?: unknown;
      items?: unknown;
      version?: unknown;
    };
    if (
      candidate.version !== 2 ||
      typeof candidate.draft !== 'string' ||
      (candidate.draftQuote !== null && !isQuote(candidate.draftQuote)) ||
      !Array.isArray(candidate.items) ||
      !candidate.items.every(isEntry)
    ) {
      return EMPTY_DOCUMENT_MEMO_STATE;
    }
    return {
      draft: candidate.draft,
      draftQuote: candidate.draftQuote,
      items: candidate.items,
    };
  } catch {
    // v1 stored one raw string. Preserve it as a draft so the redesign never
    // drops a memo that was entered before the structured list shipped.
    return { draft: raw, draftQuote: null, items: [] };
  }
}

export function documentMemoStorageKey(docName: string, projectScope: string): string {
  return `${DOCUMENT_MEMO_STORAGE_PREFIX}:${hashScope(projectScope)}:${encodeURIComponent(docName)}`;
}

export function readDocumentMemoState(
  docName: string,
  storage: DocumentMemoStorage | null = resolveStorage(),
  projectScope = resolveProjectScope(),
): DocumentMemoState {
  if (!storage) return EMPTY_DOCUMENT_MEMO_STATE;
  try {
    const raw = storage.getItem(documentMemoStorageKey(docName, projectScope));
    return raw === null ? EMPTY_DOCUMENT_MEMO_STATE : parseStoredState(raw);
  } catch {
    return EMPTY_DOCUMENT_MEMO_STATE;
  }
}

/** Returns whether the complete memo state was durably written on this device. */
export function writeDocumentMemoState(
  docName: string,
  state: DocumentMemoState,
  storage: DocumentMemoStorage | null = resolveStorage(),
  projectScope = resolveProjectScope(),
): boolean {
  if (!storage) return false;
  try {
    const key = documentMemoStorageKey(docName, projectScope);
    if (state.draft === '' && state.draftQuote === null && state.items.length === 0) {
      storage.removeItem(key);
    } else {
      storage.setItem(
        key,
        JSON.stringify({
          version: 2,
          draft: state.draft,
          draftQuote: state.draftQuote,
          items: state.items,
        }),
      );
    }
    return true;
  } catch {
    return false;
  }
}
