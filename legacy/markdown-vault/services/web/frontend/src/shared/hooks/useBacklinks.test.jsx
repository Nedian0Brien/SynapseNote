import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBacklinks } from './useBacklinks';

function HookHarness() {
  const { backlinks, loading } = useBacklinks('note.md');

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="count">{backlinks.length}</div>
      <div>{backlinks[0]?.title ?? ''}</div>
    </div>
  );
}

describe('useBacklinks', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ id: 'source.md', title: 'Source', edge_type: 'wikilink' }],
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('문서 경로로 백링크를 불러온다', async () => {
    render(<HookHarness />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/nodes/note.md/backlinks', { credentials: 'include' });
      expect(screen.getByTestId('count')).toHaveTextContent('1');
      expect(screen.getByText('Source')).toBeInTheDocument();
    });
  });
});
