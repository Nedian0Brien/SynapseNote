import { describe, expect, mock, test } from 'bun:test';
import { createFileTreeRenameHandlers } from './useFileTreeRename';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createFileTreeRenameHandlers', () => {
  test('posts a document rename and hands canonical extension metadata to reconciliation', async () => {
    const fetchMock = mock(async () =>
      jsonResponse({
        renamed: [{ fromDocName: 'notes/old', toDocName: 'notes/new' }],
        renamedAssets: [],
      }),
    );
    const reconcile = mock(async () => {});
    const setBusyPath = mock(() => {});
    const clearPendingCreate = mock(() => {});
    const handlers = createFileTreeRenameHandlers({
      documents: [
        { kind: 'document', docName: 'notes/old', docExt: '.mdx', size: 1, modified: 'now' },
      ],
      activeBeforeRename: () => ({ docName: 'notes/old', folderPath: null, assetPath: null }),
      isAssetTreePath: () => false,
      fetch: fetchMock as unknown as typeof fetch,
      setBusyPath,
      setError: mock(() => {}),
      resetModelToDocuments: mock(() => {}),
      pendingCreate: () => null,
      cleanupPendingCreate: mock(async () => {}),
      clearPendingCreate,
      applyRenamedDocuments: reconcile,
      toastError: mock(() => {}),
      messages: {
        failedRename: 'Failed to rename path',
        failedMove: 'Failed to move',
        renameResync: 'Rename resync',
        moveResync: 'Move resync',
        networkError: 'Network error',
      },
    });

    await expect(
      handlers.handleTreeRename({
        sourcePath: 'notes/old.mdx',
        destinationPath: 'notes/new',
        isFolder: false,
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith('/api/rename-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'file', fromPath: 'notes/old', toPath: 'notes/new.mdx' }),
    });
    expect(reconcile).toHaveBeenCalledWith(
      [{ fromDocName: 'notes/old', toDocName: 'notes/new' }],
      [],
      [],
      { docName: 'notes/old', folderPath: null, assetPath: null },
      [{ toDocName: 'notes/new', docExt: '.mdx' }],
    );
    expect(clearPendingCreate).toHaveBeenCalledTimes(1);
    expect(setBusyPath).toHaveBeenCalledWith('notes/old.mdx');
    expect(setBusyPath).toHaveBeenLastCalledWith(null);
  });

  test('does not issue a request when every drop resolves to its original path', async () => {
    const fetchMock = mock(async () => jsonResponse({}));
    const handlers = createFileTreeRenameHandlers({
      documents: [],
      activeBeforeRename: () => ({ docName: null, folderPath: null, assetPath: null }),
      isAssetTreePath: () => false,
      fetch: fetchMock as unknown as typeof fetch,
      setBusyPath: mock(() => {}),
      setError: mock(() => {}),
      resetModelToDocuments: mock(() => {}),
      pendingCreate: () => null,
      cleanupPendingCreate: mock(async () => {}),
      clearPendingCreate: mock(() => {}),
      applyRenamedDocuments: mock(async () => {}),
      toastError: mock(() => {}),
      messages: {
        failedRename: 'Failed to rename path',
        failedMove: 'Failed to move',
        renameResync: 'Rename resync',
        moveResync: 'Move resync',
        networkError: 'Network error',
      },
    });

    await handlers.handleDropComplete({
      draggedPaths: ['notes/'],
      target: { kind: 'root' },
    } as never);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
