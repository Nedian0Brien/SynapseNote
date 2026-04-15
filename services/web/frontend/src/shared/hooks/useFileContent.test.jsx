import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileContent } from './useFileContent';

function HookHarness() {
  const { content, debouncedSave, flush } = useFileContent('note.md');

  return (
    <div>
      <div data-testid="content">{content}</div>
      <button onClick={() => debouncedSave('# Changed\n')}>save-later</button>
      <button onClick={() => flush()}>flush</button>
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
});
