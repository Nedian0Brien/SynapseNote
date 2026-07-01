import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { VaultService } from '@/application/services/domains';
import { ViewLayout } from '@/application/types';
import AppSectionPage from '@/pages/AppSectionPage';

const mockToView = jest.fn(async () => undefined);
const mockLoadRecentViews = jest.fn(async () => undefined);
const mockAddPage = jest.fn(async () => ({
  view_id: 'new-ai-chat-id',
}));
const mockUpdateChatSettings = jest.fn(async () => undefined);

function renderSection(section: ComponentProps<typeof AppSectionPage>['section']) {
  return render(
    <MemoryRouter>
      <AppSectionPage section={section} />
    </MemoryRouter>
  );
}

jest.mock('@/components/app/app.hooks', () => ({
  useAIEnabled: () => true,
  useAppFavorites: () => ({
    favoriteViews: [],
    loadFavoriteViews: jest.fn(async () => undefined),
  }),
  useAppOutline: () => [
    {
      view_id: 'space-id',
      name: 'Research Space',
      icon: null,
      layout: ViewLayout.Document,
      extra: { is_space: true },
      children: [
        {
          view_id: 'doc-id',
          name: 'Attention Notes',
          icon: null,
          layout: ViewLayout.Document,
          extra: null,
          children: [],
          is_published: false,
          is_private: false,
          last_edited_time: '2026-06-29T12:00:00Z',
          last_viewed_at: '2026-06-29T12:00:00Z',
        },
      ],
      is_published: false,
      is_private: false,
      last_edited_time: '2026-06-29T10:00:00Z',
    },
  ],
  useAppOperations: () => ({
    addPage: mockAddPage,
  }),
  useAppRecent: () => ({
    recentViews: [
      {
        view_id: 'doc-id',
        name: 'Attention Notes',
        icon: null,
        layout: ViewLayout.Document,
        extra: null,
        children: [],
        is_published: false,
        is_private: false,
        last_viewed_at: '2026-06-29T12:00:00Z',
      },
    ],
    loadRecentViews: mockLoadRecentViews,
  }),
  useCurrentWorkspaceId: () => 'workspace-id',
  useToView: () => mockToView,
  useUserWorkspaceInfo: () => ({
    selectedWorkspace: {
      id: 'workspace-id',
      name: 'Synapse Workspace',
      role: 'Owner',
    },
  }),
}));

jest.mock('@/features/synapse-graph/SynapseGraphWorkspace', () => ({
  SynapseGraphWorkspace: () => <div data-testid='graph-workspace' />,
}));

jest.mock('@/features/synapse-graph/GraphView.jsx', () => ({
  GraphView: () => <div data-testid='graph-view' />,
}));

jest.mock('@/application/services/js-services/http', () => ({
  getAxiosInstance: () => ({}),
}));

jest.mock('@/application/services/domains', () => ({
  VaultService: {
    createDocument: jest.fn(),
    getDocument: jest.fn(async () => ({
      id: 'Papers/summary/MT-RAIG.md',
      title: 'MT-RAIG',
      content: '# MT-RAIG\n\nsource: [[raw/ingested/dli-lab-papers-2026/MT_RAIG_acl2025.pdf|MT_RAIG_acl2025.pdf]]',
      updatedAt: '2026-07-01T12:00:00Z',
      hash: 'hash-1',
    })),
    getFile: jest.fn(async () => new Blob(['pdf'], { type: 'application/pdf' })),
    getGraph: jest.fn(async () => ({
      nodes: [
        {
          id: 'Papers/summary/MT-RAIG.md',
          title: 'MT-RAIG',
          nodeType: 'Document',
          tags: [],
          updatedAt: '2026-07-01T12:00:00Z',
        },
      ],
      edges: [],
    })),
    listNodes: jest.fn(async () => [
      {
        id: 'Papers/summary/MT-RAIG.md',
        title: 'MT-RAIG',
        nodeType: 'Document',
        tags: [],
        updatedAt: '2026-07-01T12:00:00Z',
      },
    ]),
    writeDocument: jest.fn(),
  },
}));

jest.mock('@/components/chat/request', () => ({
  ChatRequest: jest.fn().mockImplementation(() => ({
    updateChatSettings: mockUpdateChatSettings,
  })),
}));

describe('AppSectionPage sections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    URL.createObjectURL = jest.fn(() => 'blob:papers-pdf');
    URL.revokeObjectURL = jest.fn();
    window.open = jest.fn();
  });

  it('renders the Agent workspace and opens prototype empty-state controls from new chat', async () => {
    renderSection('agent' as never);

    expect(await screen.findByRole('button', { name: 'AI 모델' })).toBeTruthy();
    expect(await screen.findByText('무엇을 도와드릴까요?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '새 대화' }));

    expect(screen.getByText('무엇을 도와드릴까요?')).toBeTruthy();
    expect(screen.getByText('최근 회의록 3개를 요약해줘')).toBeTruthy();
    expect(screen.getByPlaceholderText('무엇이든 물어보세요. 워크스페이스 문서를 검색해 답합니다…')).toBeTruthy();
  });

  it('sends Agent prompts in-place with answer sources and message actions', async () => {
    renderSection('agent' as never);

    fireEvent.click(await screen.findByRole('button', { name: '새 대화' }));
    fireEvent.click(await screen.findByText('최근 회의록 3개를 요약해줘'));

    await waitFor(() => {
      expect(screen.getByText('최근 회의록 3개를 요약해줘')).toBeTruthy();
      expect(screen.getByText(/응답 완료|연결 필요/)).toBeTruthy();
      expect(screen.getByText(/출처 \d+개/)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: '복사' })).toBeTruthy();
    expect(mockAddPage).not.toHaveBeenCalled();
    expect(mockUpdateChatSettings).not.toHaveBeenCalled();
  });

  it('renders Home from workspace outline and recent data', async () => {
    renderSection('home');

    expect(await screen.findByText(/좋은 .*요, Synapse Workspace/)).toBeTruthy();
    expect(screen.getByText('Research Space')).toBeTruthy();
    expect(screen.getAllByText('Attention Notes').length).toBeGreaterThan(0);
  });

  it('opens the first Papers PDF linked from a selected vault document', async () => {
    renderSection('library');

    fireEvent.click(await screen.findByText('MT-RAIG'));
    fireEvent.click(await screen.findByRole('button', { name: 'PDF 열기' }));

    await waitFor(() => {
      expect(VaultService.getFile).toHaveBeenCalledWith(
        'workspace-id',
        'Papers/raw/ingested/dli-lab-papers-2026/MT_RAIG_acl2025.pdf'
      );
      expect(window.open).toHaveBeenCalledWith('blob:papers-pdf', '_blank', 'noopener,noreferrer');
    });
  });
});
