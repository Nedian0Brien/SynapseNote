import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileContent } from './useFileContent';

function HookHarness() {
  const {
    content,
    error,
    syncStatus,
    debouncedSave,
    flush,
    keepLocalVersion,
    loadRemoteVersion,
  } = useFileContent('note.md');

  return (
    <div>
      <div data-testid="content">{content}</div>
      <div data-testid="sync-status">{syncStatus}</div>
      <div data-testid="error">{error}</div>
      <button onClick={() => debouncedSave('# Changed\n')}>save-later</button>
      <button onClick={() => flush()}>flush</button>
      <button onClick={() => keepLocalVersion()}>keep-local</button>
      <button onClick={() => loadRemoteVersion()}>load-remote</button>
    </div>
  );
}

describe('useFileContent', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { content: '# Initial\n' } }),
      });
  });

  afterEach(() => {
    delete globalThis.EventSource;
    vi.restoreAllMocks();
  });

  it('flush가 대기 중인 저장을 즉시 실행한다', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: 'note.md' } }),
    });

    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('content')).toHaveTextContent('# Initial');
    });

    fireEvent.click(screen.getByText('save-later'));
    fireEvent.click(screen.getByText('flush'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenNthCalledWith(2, '/api/documents/note.md', expect.objectContaining({
        method: 'PUT',
      }));
    });
  });

  it('저장 기준 hash가 오래되면 충돌 상태로 전환한다', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { content: '# Initial\n', hash: 'hash-1' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'document_revision_conflict' }),
      });

    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('content')).toHaveTextContent('# Initial');
    });

    fireEvent.click(screen.getByText('save-later'));
    fireEvent.click(screen.getByText('flush'));

    await waitFor(() => {
      expect(screen.getByTestId('sync-status')).toHaveTextContent('conflict');
    });

    const putCall = globalThis.fetch.mock.calls[1];
    expect(JSON.parse(putCall[1].body)).toEqual({
      content: '# Changed\n',
      baseHash: 'hash-1',
    });
  });

  it('충돌 후 내 변경 유지 선택은 baseHash 없이 저장한다', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { content: '# Initial\n', hash: 'hash-1' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'document_revision_conflict' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'note.md', hash: 'hash-2' } }),
      });

    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('content')).toHaveTextContent('# Initial');
    });

    fireEvent.click(screen.getByText('save-later'));
    fireEvent.click(screen.getByText('flush'));

    await waitFor(() => {
      expect(screen.getByTestId('sync-status')).toHaveTextContent('conflict');
    });

    fireEvent.click(screen.getByText('keep-local'));

    await waitFor(() => {
      expect(screen.getByTestId('sync-status')).toHaveTextContent('current');
    });

    const forcePutCall = globalThis.fetch.mock.calls[2];
    expect(JSON.parse(forcePutCall[1].body)).toEqual({ content: '# Changed\n' });
  });

  it('충돌 후 서버 버전 불러오기는 대기 중인 변경을 버리고 다시 읽는다', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { content: '# Initial\n', hash: 'hash-1' } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'document_revision_conflict' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { content: '# Remote\n', hash: 'hash-2' } }),
      });

    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('content')).toHaveTextContent('# Initial');
    });

    fireEvent.click(screen.getByText('save-later'));
    fireEvent.click(screen.getByText('flush'));

    await waitFor(() => {
      expect(screen.getByTestId('sync-status')).toHaveTextContent('conflict');
    });

    fireEvent.click(screen.getByText('load-remote'));

    await waitFor(() => {
      expect(screen.getByTestId('content')).toHaveTextContent('# Remote');
      expect(screen.getByTestId('sync-status')).toHaveTextContent('current');
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, '/api/documents/note.md', { credentials: 'include' });
  });
});
