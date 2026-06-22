import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGraph } from './useGraph';

function HookHarness() {
  const { nodes, edges, loading } = useGraph();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="nodes">{nodes.length}</div>
      <div data-testid="edges">{edges.length}</div>
    </div>
  );
}

class MockEventSource {
  static instances = [];

  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.listeners = new Map();
    MockEventSource.instances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  emit(type, data) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) });
  }

  close() {}
}

describe('useGraph', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { nodes: [], edges: [], stats: {} } }),
      });
  });

  afterEach(() => {
    delete globalThis.EventSource;
    vi.restoreAllMocks();
  });

  it('vault 이벤트를 받으면 그래프를 다시 불러온다', async () => {
    globalThis.EventSource = MockEventSource;
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            nodes: [{ id: 'changed.md', type: 'Document', title: 'changed' }],
            edges: [{ source: '.', target: 'changed.md', edge_type: 'directory' }],
            stats: { nodes: 1, edges: 1 },
          },
        }),
      });

    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(MockEventSource.instances.length).toBe(1);
    });

    MockEventSource.instances[0].emit('vault', {
      type: 'document_changed',
      action: 'modified',
      path: 'changed.md',
      hash: 'new-hash',
    });

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('nodes')).toHaveTextContent('1');
      expect(screen.getByTestId('edges')).toHaveTextContent('1');
    });
  });
});
