import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVaultTree } from './useVaultTree';

function HookHarness() {
  const { tree, createFile, renameFile, deleteFile } = useVaultTree();

  return (
    <div>
      <div data-testid="tree-size">{tree.length}</div>
      <button onClick={() => createFile('new.md', '# New\n')}>create</button>
      <button onClick={() => renameFile('old.md', 'renamed.md')}>rename</button>
      <button onClick={() => deleteFile('renamed.md')}>delete</button>
    </div>
  );
}

describe('useVaultTree', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createFile이 문서를 생성한 뒤 트리를 다시 불러온다', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ data: { id: 'new.md' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'new.md', type: 'Document', title: 'new' }] }),
      });

    render(<HookHarness />);

    fireEvent.click(screen.getByText('create'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/documents', expect.objectContaining({
        method: 'POST',
      }));
      expect(globalThis.fetch).toHaveBeenNthCalledWith(3, '/api/nodes', { credentials: 'include' });
    });
  });

  it('renameFile이 move API 호출 후 트리를 다시 불러온다', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'renamed.md' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'renamed.md', type: 'Document', title: 'renamed' }] }),
      });

    render(<HookHarness />);

    fireEvent.click(screen.getByText('rename'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/documents/old.md/move', expect.objectContaining({
        method: 'POST',
      }));
      expect(globalThis.fetch).toHaveBeenNthCalledWith(3, '/api/nodes', { credentials: 'include' });
    });
  });

  it('deleteFile이 삭제 후 트리를 다시 불러온다', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'renamed.md' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: [] }),
      });

    render(<HookHarness />);

    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/documents/renamed.md', expect.objectContaining({
        method: 'DELETE',
      }));
      expect(globalThis.fetch).toHaveBeenNthCalledWith(3, '/api/nodes', { credentials: 'include' });
    });
  });
});
