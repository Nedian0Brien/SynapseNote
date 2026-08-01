import { describe, expect, mock, test } from 'bun:test';
import { createFileTreeTrashHandlers } from './useFileTreeTrash';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createFileTreeTrashHandlers', () => {
  test('hard-delete closes the affected tab, clears its cache, and removes its tree document', async () => {
    const fetchMock = mock(async () => jsonResponse({ deletedDocNames: ['notes/old'] }));
    const closeTabs = mock(() => {});
    const closeAndClearForRename = mock(async () => {});
    const setDocuments = mock((updater) => {
      expect(
        updater([
          { kind: 'document', docName: 'notes/old', docExt: '.md', size: 1, modified: 'now' },
        ]),
      ).toEqual([]);
    });
    const handlers = createFileTreeTrashHandlers({
      documents: () => [
        { kind: 'document', docName: 'notes/old', docExt: '.md', size: 1, modified: 'now' },
      ],
      folderTreePaths: () => [],
      activeConflicts: () => [],
      workspace: () => null,
      desktopBridge: () => undefined,
      pendingCreate: () => null,
      setDeleteRequest: mock(() => {}),
      trashFailure: () => null,
      setTrashFailure: mock(() => {}),
      setBusyPath: mock(() => {}),
      resetModelToDocuments: mock(() => {}),
      clearPendingCreate: mock(() => {}),
      closeTabs,
      docTabId: (docName) => `doc:${docName}`,
      folderTabId: (folderPath) => `folder:${folderPath}`,
      assetTabId: (assetPath) => `asset:${assetPath}`,
      coerceTrashFailureReason: (reason) => reason ?? 'unknown',
      closeAndClearForRename,
      model: { getItem: () => null, remove: mock(() => {}) },
      setDocuments,
      markNextDocumentsAsApplied: mock(() => {}),
      emitDocumentsChanged: mock(() => {}),
      fetch: fetchMock as unknown as typeof fetch,
      toastError: mock(() => {}),
      messages: {
        failedDelete: 'Failed to delete path',
        couldNotComplete: 'Could not complete delete',
      },
    });

    await handlers.handleDeleteTargets([
      { kind: 'file', path: 'notes/old', name: 'old', docExt: '.md' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('/api/delete-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'file', path: 'notes/old' }),
    });
    expect(closeTabs).toHaveBeenCalledWith(['doc:notes/old'], { force: true });
    expect(closeAndClearForRename).toHaveBeenCalledWith('notes/old');
  });
});
