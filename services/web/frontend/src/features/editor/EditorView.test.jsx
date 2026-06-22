import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorView } from './EditorView';

const mockState = vi.hoisted(() => ({
  debouncedSave: vi.fn(),
}));

vi.mock('../../shared/hooks/useFileContent', () => ({
  useFileContent: () => ({
    content: '# Initial\n\nBody',
    loading: false,
    error: null,
    saving: false,
    syncStatus: 'current',
    debouncedSave: mockState.debouncedSave,
    flush: vi.fn(),
    reload: vi.fn(),
    keepLocalVersion: vi.fn(),
    loadRemoteVersion: vi.fn(),
  }),
}));

vi.mock('./BacklinksPanel', () => ({
  BacklinksPanel: () => <aside data-testid="backlinks-panel" />,
}));

vi.mock('@milkdown/kit/core', () => ({
  rootCtx: Symbol('rootCtx'),
  defaultValueCtx: Symbol('defaultValueCtx'),
  Editor: {
    make: () => ({
      config() { return this; },
      use() { return this; },
      create: async () => ({ destroy: vi.fn() }),
    }),
  },
}));

vi.mock('@milkdown/kit/preset/commonmark', () => ({
  commonmark: {},
}));

vi.mock('@milkdown/kit/plugin/history', () => ({
  history: {},
}));

vi.mock('@milkdown/kit/plugin/listener', () => ({
  listener: {},
  listenerCtx: Symbol('listenerCtx'),
}));

vi.mock('../../shared/plugins/wikilinkPlugin', () => ({
  wikilinkPlugin: () => ({}),
}));

describe('EditorView', () => {
  it('Markdown 원본 모드에서 내용을 수정하고 모드를 왕복한다', () => {
    render(<EditorView path="notes/alpha.md" />);

    fireEvent.click(screen.getByTitle('Markdown 원본'));
    const source = screen.getByLabelText('Markdown 원본');
    expect(source).toHaveValue('# Initial\n\nBody');

    fireEvent.change(source, { target: { value: '# Changed\n\n[[beta]]' } });
    expect(mockState.debouncedSave).toHaveBeenCalledWith('# Changed\n\n[[beta]]');

    fireEvent.click(screen.getByTitle('미리보기 편집'));
    expect(screen.queryByLabelText('Markdown 원본')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Markdown 원본'));
    expect(screen.getByLabelText('Markdown 원본')).toHaveValue('# Changed\n\n[[beta]]');
  });
});
