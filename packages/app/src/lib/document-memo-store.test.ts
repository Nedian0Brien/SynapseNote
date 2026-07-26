import { describe, expect, test } from 'bun:test';
import {
  type DocumentMemoState,
  type DocumentMemoStorage,
  documentMemoStorageKey,
  EMPTY_DOCUMENT_MEMO_STATE,
  readDocumentMemoState,
  subscribeDocumentMemoState,
  writeDocumentMemoState,
} from './document-memo-store';

function memoryStorage(): DocumentMemoStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const STATE: DocumentMemoState = {
  draft: '',
  draftQuote: null,
  items: [
    {
      id: 'memo-1',
      body: 'First memo',
      quote: { markdown: 'Selected passage', sourceLineStart: 4, sourceLineEnd: 5 },
      createdAt: 10,
      updatedAt: 10,
    },
  ],
};

describe('document memo store', () => {
  test('keeps structured memo lists separate by project and document', () => {
    const storage = memoryStorage();
    expect(writeDocumentMemoState('notes/today', STATE, storage, '/project-a')).toBe(true);
    expect(
      writeDocumentMemoState(
        'notes/today',
        { ...STATE, draft: 'Project B draft' },
        storage,
        '/project-b',
      ),
    ).toBe(true);

    expect(readDocumentMemoState('notes/today', storage, '/project-a')).toEqual(STATE);
    expect(readDocumentMemoState('notes/today', storage, '/project-b').draft).toBe(
      'Project B draft',
    );
    expect(readDocumentMemoState('notes/tomorrow', storage, '/project-a')).toEqual(
      EMPTY_DOCUMENT_MEMO_STATE,
    );
  });

  test('migrates the previous raw memo string into the new draft', () => {
    const storage = memoryStorage();
    storage.setItem(documentMemoStorageKey('notes', '/project'), 'Legacy memo');

    expect(readDocumentMemoState('notes', storage, '/project')).toEqual({
      draft: 'Legacy memo',
      draftQuote: null,
      items: [],
    });
  });

  test('removes storage when the complete state is empty', () => {
    const storage = memoryStorage();
    const key = documentMemoStorageKey('notes/today', '/project');
    writeDocumentMemoState('notes/today', STATE, storage, '/project');
    expect(storage.getItem(key)).not.toBeNull();

    expect(
      writeDocumentMemoState('notes/today', EMPTY_DOCUMENT_MEMO_STATE, storage, '/project'),
    ).toBe(true);
    expect(storage.getItem(key)).toBeNull();
  });

  test('rejects corrupt structured state and fails soft when storage is unavailable', () => {
    const storage = memoryStorage();
    storage.setItem(documentMemoStorageKey('notes', '/project'), '{"version":2,"items":42}');
    expect(readDocumentMemoState('notes', storage, '/project')).toEqual(EMPTY_DOCUMENT_MEMO_STATE);

    const throwingStorage: DocumentMemoStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(readDocumentMemoState('notes', throwingStorage, '/project')).toEqual(
      EMPTY_DOCUMENT_MEMO_STATE,
    );
    expect(writeDocumentMemoState('notes', STATE, throwingStorage, '/project')).toBe(false);
  });

  test('notifies the live editor layer even when durable storage fails', () => {
    const seen: DocumentMemoState[] = [];
    const unsubscribe = subscribeDocumentMemoState('notes/live', (state) => seen.push(state));
    try {
      expect(writeDocumentMemoState('notes/live', STATE, null, '/project')).toBe(false);
      expect(seen).toEqual([STATE]);
    } finally {
      unsubscribe();
    }
  });
});
