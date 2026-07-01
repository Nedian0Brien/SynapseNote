import { Fragment, type HTMLAttributes, type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { View, ViewLayout } from '@/application/types';
import { VaultService } from '@/application/services/domains';
import type { VaultDocument, VaultGraph, VaultNode } from '@/application/services/domains/vault';
import LoadingDots from '@/components/_shared/LoadingDots';
import { notify } from '@/components/_shared/notify';
import {
  useAIEnabled,
  useAppFavorites,
  useAppOutline,
  useAppRecent,
  useCurrentWorkspaceId,
  useToView,
  useUserWorkspaceInfo,
} from '@/components/app/app.hooks';
import { getAppSectionPath, type AppSection } from '@/components/app/navigation/appSections';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { GraphView } from '@/features/synapse-graph/GraphView.jsx';
import { outlineToGraph } from '@/features/synapse-graph/outlineToGraph';
import { cn } from '@/lib/utils';
import { copyTextToClipboard } from '@/utils/copy';
import { getConfigValue } from '@/utils/runtime-config';
import { useCurrentUserOptional } from '@/components/main/app.hooks';

type AppSectionPageProps = {
  section: AppSection;
};

function flattenViews(views: View[] | undefined): View[] {
  if (!views?.length) return [];
  return views.flatMap((view) => [view, ...flattenViews(view.children)]);
}

function isVisibleView(view: View) {
  return !view.extra?.is_hidden_space;
}

function viewName(view: View) {
  return view.name.trim() || 'Untitled';
}

function displayViewName(view: View) {
  return view.extra?.synapse?.displayName || viewName(view);
}

function countDocumentsInSpace(space: View) {
  return flattenViews(space.children).filter(
    (view) => isVisibleView(view) && !view.extra?.is_space && view.layout !== ViewLayout.AIChat
  ).length;
}

function formatShortDate(value?: string) {
  if (!value) return '최근 기록 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '최근 기록 없음';
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(date);
}

function formatRelative(value?: string) {
  if (!value) return '최근 활동 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '최근 활동 없음';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays <= 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffWeeks < 5) return `${diffWeeks}주 전`;
  return formatShortDate(value);
}

function vaultNodeTitle(node: VaultNode) {
  return node.title.trim() || node.id.split('/').pop()?.replace(/\.md$/, '') || 'Untitled';
}

function vaultDocumentIcon(node: VaultNode) {
  return node.id.includes('/') ? 'article' : 'description';
}

function vaultDocumentPathForNewDocument(title = '새 문서') {
  const stamp = new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date())
    .replace(/[^\d]/g, '')
    .slice(0, 8);

  return `${title}-${stamp}.md`;
}

function normalizeVaultPath(path: string) {
  const parts: string[] = [];

  path
    .replace(/^\/+/, '')
    .split('/')
    .forEach((part) => {
      if (!part || part === '.') return;
      if (part === '..') {
        parts.pop();
        return;
      }
      parts.push(part);
    });

  return parts.join('/');
}

function resolveVaultFilePath(target: string, documentPath: string) {
  const cleanTarget = target.trim().replace(/^<|>$/g, '');

  if (!cleanTarget || /^https?:\/\//i.test(cleanTarget)) return null;

  const decodedTarget = cleanTarget.replace(/%20/g, ' ');
  if (decodedTarget.startsWith('Papers/')) return normalizeVaultPath(decodedTarget);
  if (decodedTarget.startsWith('raw/')) return normalizeVaultPath(`Papers/${decodedTarget}`);

  const parentPath = documentPath.split('/').slice(0, -1).join('/');
  return normalizeVaultPath(parentPath ? `${parentPath}/${decodedTarget}` : decodedTarget);
}

function firstPdfPathForDocument(document: VaultDocument) {
  const patterns = [
    /\[\[([^\]|#]+\.pdf)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/gi,
    /\[[^\]]+\]\(([^)]+\.pdf)\)/gi,
    /(?:^|\s)([^\s()[\]]+\.pdf)(?=\s|$)/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(document.content))) {
      const target = match[1];
      if (!target) continue;
      const resolved = resolveVaultFilePath(target, document.id);

      if (resolved) return resolved;
    }
  }

  return null;
}

function spaceMaterialIcon(space: View) {
  return space.extra?.synapse?.materialIcon || 'folder_open';
}

function documentMaterialIcon(view: View, index = 0) {
  if (view.extra?.synapse?.materialIcon) return view.extra.synapse.materialIcon;
  if (view.layout === ViewLayout.Grid) return 'table';
  return index === 0 ? 'hub' : 'description';
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '좋은 아침이에요';
  if (hour < 18) return '좋은 오후예요';
  return '좋은 저녁이에요';
}

function MaterialIcon({ name, className, ...props }: { name: string } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('icon', className)} {...props}>
      {name}
    </span>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '작업을 완료하지 못했습니다.';
}

type AgentToolState = {
  graph: boolean;
  web: boolean;
  mentions: boolean;
};

type AgentSource = {
  view: View;
  excerpt?: string;
  relevance?: number;
};

type AgentTurn = {
  id: string;
  prompt: string;
  status: 'ready' | 'unavailable';
  answerFocus: string;
  answerTitle: string;
  answerLead: string;
  answerBullets: string[];
  answerSummary: string;
  sources: AgentSource[];
};

async function sendAgentMessage({
  prompt,
  sources,
  model,
  tools,
  workspaceId,
}: {
  prompt: string;
  sources: View[];
  model: string;
  tools: AgentToolState;
  workspaceId: string;
}): Promise<Omit<AgentTurn, 'id' | 'prompt'>> {
  const baseUrl = getConfigValue('SYNAPSENOTE_BASE_URL', '').replace(/\/$/, '');
  const token = getAccessTokenFromStorage();
  const ragIds = sources.map((view) => view.view_id).filter(Boolean);

  if (!baseUrl || !token) {
    return buildUnavailableAgentTurn('AI 응답 서버 설정이나 로그인 토큰을 확인하지 못했습니다.');
  }

  try {
    const response = await fetch(`${baseUrl}/api/ai/${workspaceId}/v2/complete/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'ai-model': model,
        'x-platform': 'web-app',
      },
      body: JSON.stringify({
        text: prompt,
        completion_type: tools.web ? 'with_web_context' : 'chat',
        format: {
          output_content: 'text',
          output_layout: 'paragraph',
        },
        metadata: {
          workspace_id: workspaceId,
          rag_ids: ragIds,
          use_graph_context: tools.graph,
          use_web_context: tools.web,
          use_mentions: tools.mentions,
        },
      }),
    });

    if (!response.ok) {
      return buildUnavailableAgentTurn(`AI 응답 서버가 ${response.status} 상태를 반환했습니다.`);
    }

    const answer = extractAgentText(await response.text());

    if (!answer) {
      return buildUnavailableAgentTurn('AI 응답 서버가 읽을 수 있는 답변을 반환하지 않았습니다.');
    }

    return {
      status: 'ready',
      answerFocus: '응답',
      answerTitle: 'Agent 응답',
      answerLead: answer,
      answerBullets: [],
      answerSummary: answer,
      sources: [],
    };
  } catch (error) {
    return buildUnavailableAgentTurn(getErrorMessage(error));
  }
}

function getAccessTokenFromStorage() {
  const token = localStorage.getItem('token');

  if (!token) return undefined;

  try {
    const parsed = JSON.parse(token) as { access_token?: unknown };
    return typeof parsed.access_token === 'string' ? parsed.access_token : undefined;
  } catch {
    return undefined;
  }
}

function buildUnavailableAgentTurn(message: string): Omit<AgentTurn, 'id' | 'prompt'> {
  return {
    status: 'unavailable',
    answerFocus: '연결 실패',
    answerTitle: 'Agent 응답을 가져오지 못했습니다',
    answerLead: 'AI 응답 서버에 연결하지 못했습니다.',
    answerBullets: [message, '질문은 저장됐지만 답변은 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.'],
    answerSummary: 'AI 응답 서버 연결이 필요합니다.',
    sources: [],
  };
}

function extractAgentText(raw: string) {
  const text = raw.trim();

  if (!text) return '';

  const parts = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^data:\s*/, '').trim())
    .filter((line) => line && line !== '[DONE]')
    .map((line) => {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        const value = parsed.text ?? parsed.content ?? parsed.delta ?? parsed.answer ?? parsed.message;

        if (typeof value === 'string') return value;
        if (value && typeof value === 'object' && 'content' in value) {
          const content = (value as { content?: unknown }).content;
          return typeof content === 'string' ? content : '';
        }
      } catch {
        return line;
      }

      return '';
    })
    .filter(Boolean);

  return (parts.length > 0 ? parts.join('') : text).trim();
}

function AppSectionPage({ section }: AppSectionPageProps) {
  const outline = useAppOutline();
  const toView = useToView();
  const navigate = useNavigate();
  const workspaceId = useCurrentWorkspaceId();
  const userWorkspaceInfo = useUserWorkspaceInfo();
  const currentUser = useCurrentUserOptional();
  const aiEnabled = useAIEnabled();
  const { recentViews, loadRecentViews } = useAppRecent();
  const { favoriteViews, loadFavoriteViews } = useAppFavorites();
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentMode, setAgentMode] = useState<'empty' | 'conversation'>('empty');
  const [agentModel, setAgentModel] = useState('Claude Opus 4.8');
  const [agentVote, setAgentVote] = useState<'up' | 'down' | null>(null);
  const [agentDraft, setAgentDraft] = useState(0);
  const [agentTurns, setAgentTurns] = useState<AgentTurn[]>([]);
  const [agentSending, setAgentSending] = useState(false);
  const [graphContextEnabled, setGraphContextEnabled] = useState(true);
  const [webContextEnabled, setWebContextEnabled] = useState(false);
  const [mentionContextEnabled, setMentionContextEnabled] = useState(false);
  const [libraryMode, setLibraryMode] = useState<'list' | 'table' | 'board' | 'gallery'>('list');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [librarySort, setLibrarySort] = useState<'recent' | 'name'>('recent');
  const [libraryFilterActive, setLibraryFilterActive] = useState(false);
  const [libraryGrouped, setLibraryGrouped] = useState(true);
  const [collapsedLibrarySpaceIds, setCollapsedLibrarySpaceIds] = useState<string[]>([]);
  const [vaultNodes, setVaultNodes] = useState<VaultNode[]>([]);
  const [vaultGraph, setVaultGraph] = useState<VaultGraph | null>(null);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultLoadError, setVaultLoadError] = useState<string | null>(null);
  const [selectedVaultPath, setSelectedVaultPath] = useState<string | null>(null);
  const [selectedVaultDocument, setSelectedVaultDocument] = useState<VaultDocument | null>(null);
  const [vaultDraft, setVaultDraft] = useState('');
  const [vaultSaving, setVaultSaving] = useState(false);
  const workspaceName = userWorkspaceInfo?.selectedWorkspace.name || 'SynapseNote';
  const userDisplayName = currentUser?.name || currentUser?.email?.split('@')[0] || workspaceName;
  const visibleSpaces = useMemo(
    () => outline?.filter((view) => view.extra?.is_space && !view.extra?.is_hidden_space) ?? [],
    [outline]
  );
  const allViews = useMemo(() => flattenViews(outline), [outline]);
  const workspaceSpaces = useMemo(() => allViews.filter((view) => view.extra?.is_space), [allViews]);
  const documentViews = useMemo(
    () => allViews.filter((view) => isVisibleView(view) && !view.extra?.is_space && view.layout !== ViewLayout.AIChat),
    [allViews]
  );
  const graphData = useMemo(() => outlineToGraph(outline), [outline]);
  const vaultDocuments = useMemo(() => vaultNodes.filter((node) => node.nodeType === 'Document'), [vaultNodes]);
  const vaultDirectories = useMemo(
    () => vaultNodes.filter((node) => node.nodeType === 'Directory' && node.id !== '.'),
    [vaultNodes]
  );
  const vaultGraphData = useMemo(() => {
    if (!vaultGraph) {
      return {
        nodes: [],
        edges: [],
        stats: { nodes: 0, edges: 0 },
      };
    }

    return {
      nodes: vaultGraph.nodes.map((node) => ({
        id: node.id,
        name: vaultNodeTitle(node),
        title: vaultNodeTitle(node),
        path: node.id,
        type: node.nodeType === 'Directory' ? ('Directory' as const) : ('Document' as const),
        directory: node.id.includes('/') ? node.id.split('/').slice(0, -1).join('/') : null,
        searchTitle: vaultNodeTitle(node).toLowerCase(),
      })),
      edges: vaultGraph.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        edge_type:
          edge.edgeType === 'directory'
            ? ('directory' as const)
            : edge.edgeType === 'wikilink'
            ? ('wikilink' as const)
            : ('reference' as const),
      })),
      stats: {
        nodes: vaultGraph.nodes.length,
        edges: vaultGraph.edges.length,
      },
    };
  }, [vaultGraph]);
  const connectionCountByVaultId = useMemo(() => {
    const countById = new Map<string, number>();

    vaultGraph?.edges.forEach((edge) => {
      countById.set(edge.source, (countById.get(edge.source) ?? 0) + 1);
      countById.set(edge.target, (countById.get(edge.target) ?? 0) + 1);
    });

    return countById;
  }, [vaultGraph]);
  const recent = recentViews?.slice(0, 6) ?? [];
  const agentDocumentViews = useMemo(() => {
    const seen = new Set<string>();

    return [...documentViews, ...(favoriteViews ?? [])].filter((view) => {
      if (!isVisibleView(view) || view.extra?.is_space || view.layout === ViewLayout.AIChat) return false;
      if (seen.has(view.view_id)) return false;
      seen.add(view.view_id);
      return true;
    });
  }, [documentViews, favoriteViews]);
  const agentSources = useMemo(() => {
    const preferred = recent.length > 0 ? [...recent, ...agentDocumentViews] : agentDocumentViews;
    const seen = new Set<string>();

    return preferred
      .filter((view) => {
        if (seen.has(view.view_id)) return false;
        seen.add(view.view_id);
        return true;
      })
      .slice(0, 4);
  }, [agentDocumentViews, recent]);
  const filteredVaultDocuments = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    const matches = vaultDocuments.filter((node) => {
      if (query && !`${vaultNodeTitle(node)} ${node.id}`.toLowerCase().includes(query)) return false;
      if (!libraryFilterActive) return true;
      const edited = new Date(node.updatedAt);
      const now = new Date();

      return (
        edited.getFullYear() === now.getFullYear() &&
        edited.getMonth() === now.getMonth() &&
        edited.getDate() === now.getDate()
      );
    });

    return matches.sort((a, b) => {
      if (librarySort === 'name') return vaultNodeTitle(a).localeCompare(vaultNodeTitle(b));
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [libraryFilterActive, libraryQuery, librarySort, vaultDocuments]);
  const vaultDocumentGroups = useMemo(() => {
    const groups = new Map<string, VaultNode[]>();

    filteredVaultDocuments.forEach((node) => {
      const group = node.id.includes('/') ? node.id.split('/').slice(0, -1).join('/') : 'Vault';

      groups.set(group, [...(groups.get(group) ?? []), node]);
    });

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredVaultDocuments]);
  const selectedVaultPdfPath = useMemo(
    () => (selectedVaultDocument ? firstPdfPathForDocument(selectedVaultDocument) : null),
    [selectedVaultDocument]
  );
  const continueItems = useMemo(() => {
    return [...documentViews]
      .sort((a, b) => {
        const aTime = new Date(a.last_edited_time || a.created_at || 0).getTime();
        const bTime = new Date(b.last_edited_time || b.created_at || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 5);
  }, [documentViews]);
  const graphLinks = graphData.stats.edges;
  const todayEdits = documentViews.filter((view) => {
    if (!view.last_edited_time) return false;
    const edited = new Date(view.last_edited_time);
    const now = new Date();
    return (
      edited.getFullYear() === now.getFullYear() &&
      edited.getMonth() === now.getMonth() &&
      edited.getDate() === now.getDate()
    );
  }).length;

  useEffect(() => {
    if (section !== 'home' && section !== 'agent') return;
    let cancelled = false;

    void (async () => {
      setLoadingRecent(true);
      await loadRecentViews?.();
      if (section === 'agent') {
        await loadFavoriteViews?.();
      }
      if (!cancelled) {
        setLoadingRecent(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadFavoriteViews, loadRecentViews, section]);

  const loadVaultWorkspace = useCallback(async () => {
    if (!workspaceId) return;

    setVaultLoading(true);
    try {
      const [nodes, graph] = await Promise.all([
        VaultService.listNodes(workspaceId),
        VaultService.getGraph(workspaceId),
      ]);

      setVaultNodes(nodes);
      setVaultGraph(graph);
      setVaultLoadError(null);
    } catch (error) {
      setVaultLoadError(getErrorMessage(error));
      notify.error(getErrorMessage(error));
    } finally {
      setVaultLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (section !== 'library' && section !== 'graph') return;
    void loadVaultWorkspace();
  }, [loadVaultWorkspace, section]);

  const openVaultDocument = useCallback(
    async (path: string) => {
      if (!workspaceId) return;

      setSelectedVaultPath(path);
      setVaultLoading(true);
      try {
        const document = await VaultService.getDocument(workspaceId, path);

        setSelectedVaultDocument(document);
        setVaultDraft(document.content);
      } catch (error) {
        setSelectedVaultDocument(null);
        setVaultDraft('');
        notify.error(getErrorMessage(error));
      } finally {
        setVaultLoading(false);
      }
    },
    [workspaceId]
  );

  const saveVaultDocument = useCallback(async () => {
    if (!workspaceId || !selectedVaultPath || !selectedVaultDocument) return;

    setVaultSaving(true);
    try {
      const meta = await VaultService.writeDocument(
        workspaceId,
        selectedVaultPath,
        vaultDraft,
        selectedVaultDocument.hash
      );

      setSelectedVaultDocument({
        ...selectedVaultDocument,
        title: meta.title,
        updatedAt: meta.updatedAt,
        hash: meta.hash,
        content: vaultDraft,
      });
      await loadVaultWorkspace();
      notify.success('저장했습니다.');
    } catch (error) {
      notify.error(getErrorMessage(error));
    } finally {
      setVaultSaving(false);
    }
  }, [loadVaultWorkspace, selectedVaultDocument, selectedVaultPath, vaultDraft, workspaceId]);

  const openVaultFile = useCallback(
    async (path: string) => {
      if (!workspaceId) return;

      try {
        const blob = await VaultService.getFile(workspaceId, path);
        const url = URL.createObjectURL(blob);

        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (error) {
        notify.error(getErrorMessage(error));
      }
    },
    [workspaceId]
  );

  const openView = useCallback(
    (viewId: string) => {
      void toView(viewId);
    },
    [toView]
  );
  const openViewOnCardKeyDown = useCallback(
    (viewId: string, event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openView(viewId);
    },
    [openView]
  );
  const openLibrary = useCallback(() => {
    if (!workspaceId) return;
    navigate(getAppSectionPath(workspaceId, 'library'));
  }, [navigate, workspaceId]);

  const createDocument = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const path = vaultDocumentPathForNewDocument();
      const created = await VaultService.createDocument(workspaceId, path, '# 새 문서\n');

      await loadVaultWorkspace();
      if (section !== 'library') {
        navigate(getAppSectionPath(workspaceId, 'library'));
      }
      await openVaultDocument(created.id);
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  }, [loadVaultWorkspace, navigate, openVaultDocument, section, workspaceId]);

  const submitAgentPrompt = useCallback(
    async (prompt: string) => {
      const query = prompt.trim();

      if (!aiEnabled || !workspaceId || !query || agentSending) return;

      setAgentMode('conversation');
      setAgentPrompt('');
      setAgentVote(null);
      setAgentSending(true);

      try {
        const response = await sendAgentMessage({
          prompt: query,
          sources: agentSources.length > 0 ? agentSources : documentViews.slice(0, 4),
          model: agentModel,
          tools: {
            graph: graphContextEnabled,
            web: webContextEnabled,
            mentions: mentionContextEnabled,
          },
          workspaceId,
        });

        setAgentTurns((turns) => [
          ...turns,
          {
            id: `${Date.now()}-${turns.length}`,
            prompt: query,
            ...response,
          },
        ]);
      } catch (error) {
        notify.error(getErrorMessage(error));
      } finally {
        setAgentSending(false);
      }
    },
    [
      agentDraft,
      agentModel,
      agentSending,
      agentSources,
      aiEnabled,
      documentViews,
      graphContextEnabled,
      mentionContextEnabled,
      webContextEnabled,
      workspaceId,
    ]
  );

  const copyAgentAnswer = useCallback(async () => {
    const latestTurn = agentTurns[agentTurns.length - 1];
    const summary = latestTurn
      ? `질문: ${latestTurn.prompt}\n\n답변: ${latestTurn.answerSummary}\n\n관련 문서: ${latestTurn.sources
          .map((source) => displayViewName(source.view))
          .join(', ')}`
      : `질문: ${agentPrompt}`;

    try {
      await copyTextToClipboard(summary);
      notify.success('답변을 복사했습니다.');
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  }, [agentPrompt, agentTurns]);

  const shareAgentAnswer = useCallback(async () => {
    const latestTurn = agentTurns[agentTurns.length - 1];
    const text = latestTurn
      ? `SynapseNote Agent\n\n질문: ${latestTurn.prompt}\n답변: ${latestTurn.answerSummary}\n출처: ${latestTurn.sources
          .map((source) => displayViewName(source.view))
          .join(', ')}`
      : `SynapseNote Agent\n\n질문: ${agentPrompt}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'SynapseNote Agent', text });
        return;
      }

      await copyTextToClipboard(text);
      notify.success('공유할 내용을 복사했습니다.');
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  }, [agentPrompt, agentTurns]);

  if (section === 'graph') {
    if (vaultLoading && !vaultGraph && !vaultLoadError) {
      return (
        <section className='view' id='view-graph'>
          <div className='graphview'>
            <LoadingDots />
          </div>
        </section>
      );
    }

    if (vaultLoadError) {
      return (
        <section className='view' id='view-graph'>
          <div className='graphview'>
            <MaterialIcon name='warning' />
            <span>그래프를 불러오지 못했습니다.</span>
            <button type='button' className='btn' onClick={() => void loadVaultWorkspace()}>
              <MaterialIcon name='refresh' />
              다시 시도
            </button>
          </div>
        </section>
      );
    }

    if (vaultGraphData.nodes.length > 0) {
      return (
        <section className='view' id='view-graph'>
          <div className='synapse-graph-route' role='region' aria-label='SynapseNote Graph'>
            <GraphView
              graphData={vaultGraphData}
              refreshKey={`${workspaceId ?? 'vault'}-${vaultGraphData.stats.nodes}-${vaultGraphData.stats.edges}`}
              onOpenNode={(nodeId: string) => {
                if (!nodeId.endsWith('.md')) return;
                navigate(getAppSectionPath(workspaceId, 'library'));
                void openVaultDocument(nodeId);
              }}
            />
          </div>
        </section>
      );
    }

    return (
      <section className='view' id='view-graph'>
        <div className='graphview'>
          <MaterialIcon name='hub' />
          <span>그래프에 표시할 문서가 없습니다.</span>
        </div>
      </section>
    );
  }

  if (section === 'library') {
    return (
      <section className='view' id='view-library'>
        <div className='page' style={{ maxWidth: 1040 }}>
          <div className='lib-head'>
            <div>
              <div className='lib-title'>Library</div>
              <div className='lib-sub'>Markdown vault · {vaultDocuments.length}개</div>
            </div>
            <button type='button' className='btn btn-primary' onClick={createDocument}>
              <MaterialIcon name='add' />새 문서
            </button>
          </div>

          <div className='lib-toolbar'>
            <div className='seg'>
              {(
                [
                  ['list', 'view_list', '목록'],
                  ['table', 'table_rows', '테이블'],
                  ['board', 'view_kanban', '보드'],
                  ['gallery', 'grid_view', '갤러리'],
                ] as const
              ).map(([mode, icon, label]) => (
                <button
                  key={mode}
                  type='button'
                  aria-pressed={libraryMode === mode}
                  onClick={() => setLibraryMode(mode)}
                >
                  <MaterialIcon name={icon} />
                  {label}
                </button>
              ))}
            </div>
            <div className='spacer' />
            <label className='field'>
              <MaterialIcon name='search' />
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                placeholder='라이브러리 검색'
              />
            </label>
            <button
              type='button'
              className={cn('chip', libraryFilterActive && 'dim')}
              onClick={() => setLibraryFilterActive((active) => !active)}
            >
              <MaterialIcon name='filter_list' />
              필터
            </button>
            <button
              type='button'
              className='chip'
              onClick={() => setLibrarySort((sort) => (sort === 'recent' ? 'name' : 'recent'))}
            >
              <MaterialIcon name='swap_vert' />
              {librarySort === 'recent' ? '최근 수정순' : '이름순'}
            </button>
            {libraryMode === 'table' ? (
              <button
                type='button'
                className={cn('chip', libraryGrouped && 'dim')}
                onClick={() => setLibraryGrouped((grouped) => !grouped)}
              >
                <MaterialIcon name='workspaces' />
                {libraryGrouped ? '스페이스별' : '전체'}
              </button>
            ) : null}
          </div>

          <div className='vault-library-shell'>
            <div className='vault-library-list'>
              {vaultLoading && filteredVaultDocuments.length === 0 ? (
                <div className='list'>
                  <div className='lrow'>
                    <LoadingDots />
                  </div>
                </div>
              ) : libraryMode === 'gallery' ? (
                <div className='hcards'>
                  {filteredVaultDocuments.map((node, index) => (
                    <div
                      key={node.id}
                      role='button'
                      tabIndex={0}
                      className={cn('hcard', selectedVaultPath === node.id && 'active')}
                      onClick={() => void openVaultDocument(node.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        void openVaultDocument(node.id);
                      }}
                    >
                      <div className={`tile ${['a', 'b', 'c', 'd'][index % 4]}`}>
                        <MaterialIcon name={vaultDocumentIcon(node)} />
                      </div>
                      <div className='ht'>{vaultNodeTitle(node)}</div>
                      <div className='hm'>{formatRelative(node.updatedAt)}</div>
                    </div>
                  ))}
                </div>
              ) : libraryMode === 'list' ? (
                <div className='list'>
                  {filteredVaultDocuments.length > 0 ? (
                    filteredVaultDocuments.map((node) => (
                      <button
                        key={node.id}
                        type='button'
                        className={cn('lrow', selectedVaultPath === node.id && 'active')}
                        onClick={() => void openVaultDocument(node.id)}
                      >
                        <span className='lic'>
                          <MaterialIcon name={vaultDocumentIcon(node)} />
                        </span>
                        <div className='lmain'>
                          <div className='ltitle'>{vaultNodeTitle(node)}</div>
                          <div className='lmeta'>
                            {node.id} · 수정 {formatRelative(node.updatedAt)}
                          </div>
                        </div>
                        <span className='tconn'>
                          <MaterialIcon name='hub' />
                          {connectionCountByVaultId.get(node.id) ?? 0}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className='lrow'>문서가 없습니다.</div>
                  )}
                </div>
              ) : libraryMode === 'board' ? (
                <div className='spaces'>
                  {vaultDirectories.length > 0
                    ? vaultDirectories.map((directory, index) => (
                        <button
                          key={directory.id}
                          type='button'
                          className='hcard'
                          onClick={() => setLibraryQuery(directory.id)}
                        >
                          <div className={`tile ${['a', 'b', 'c', 'd'][index % 4]}`}>
                            <MaterialIcon name='folder_open' />
                          </div>
                          <div className='ht'>{vaultNodeTitle(directory)}</div>
                          <div className='hm'>{directory.id}</div>
                        </button>
                      ))
                    : vaultDocumentGroups.map(([group, rows], index) => (
                        <button
                          key={group}
                          type='button'
                          className='hcard'
                          onClick={() => setLibraryQuery(group === 'Vault' ? '' : group)}
                        >
                          <div className={`tile ${['a', 'b', 'c', 'd'][index % 4]}`}>
                            <MaterialIcon name='folder_open' />
                          </div>
                          <div className='ht'>{group}</div>
                          <div className='hm'>{rows.length}개 문서</div>
                        </button>
                      ))}
                </div>
              ) : (
                <div className='tbl'>
                  <div className='thead'>
                    <div>이름</div>
                    <div className='h-tags'>태그</div>
                    <div>연결</div>
                    <div className='h-date'>수정일</div>
                  </div>
                  {libraryGrouped ? (
                    vaultDocumentGroups.map(([group, rows]) => {
                      const collapsed = collapsedLibrarySpaceIds.includes(group);

                      return (
                        <Fragment key={group}>
                          <button
                            type='button'
                            className='tgrouph'
                            aria-expanded={!collapsed}
                            onClick={() =>
                              setCollapsedLibrarySpaceIds((ids) =>
                                ids.includes(group) ? ids.filter((id) => id !== group) : [...ids, group]
                              )
                            }
                          >
                            <MaterialIcon name='folder_open' />
                            {group}
                            <span className='cnt'>· {rows.length}</span>
                          </button>
                          {!collapsed &&
                            rows.map((node) => (
                              <button
                                key={node.id}
                                type='button'
                                className={cn('trow', selectedVaultPath === node.id && 'active')}
                                onClick={() => void openVaultDocument(node.id)}
                              >
                                <div className='tname'>
                                  <MaterialIcon name={vaultDocumentIcon(node)} />
                                  <span>{vaultNodeTitle(node)}</span>
                                </div>
                                <div className='tcell tags c-tags'>
                                  {node.tags.map((tag) => (
                                    <span key={tag} className='chip tag'>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                                <div className='tconn'>
                                  <MaterialIcon name='hub' />
                                  {connectionCountByVaultId.get(node.id) ?? 0}
                                </div>
                                <div className='tcell c-date'>{formatRelative(node.updatedAt)}</div>
                              </button>
                            ))}
                        </Fragment>
                      );
                    })
                  ) : (
                    <>
                      <div className='tgrouph'>
                        <MaterialIcon name='article' />
                        전체
                        <span className='cnt'>· {filteredVaultDocuments.length}</span>
                      </div>
                      {filteredVaultDocuments.map((node) => (
                        <button
                          key={node.id}
                          type='button'
                          className={cn('trow', selectedVaultPath === node.id && 'active')}
                          onClick={() => void openVaultDocument(node.id)}
                        >
                          <div className='tname'>
                            <MaterialIcon name={vaultDocumentIcon(node)} />
                            <span>{vaultNodeTitle(node)}</span>
                          </div>
                          <div className='tcell tags c-tags'>
                            {node.tags.map((tag) => (
                              <span key={tag} className='chip tag'>
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className='tconn'>
                            <MaterialIcon name='hub' />
                            {connectionCountByVaultId.get(node.id) ?? 0}
                          </div>
                          <div className='tcell c-date'>{formatRelative(node.updatedAt)}</div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <aside className='vault-editor' aria-live='polite'>
              {selectedVaultDocument ? (
                <>
                  <div className='vault-editor-head'>
                    <div className='vault-editor-meta'>
                      <div className='vault-editor-title'>{selectedVaultDocument.title}</div>
                      <div className='vault-editor-path'>{selectedVaultDocument.id}</div>
                    </div>
                    <div className='vault-editor-actions'>
                      {selectedVaultPdfPath ? (
                        <button
                          type='button'
                          className='btn btn-secondary'
                          aria-label='PDF 열기'
                          onClick={() => void openVaultFile(selectedVaultPdfPath)}
                        >
                          <MaterialIcon name='picture_as_pdf' />
                          PDF 열기
                        </button>
                      ) : null}
                      <button
                        type='button'
                        className='btn btn-primary'
                        onClick={saveVaultDocument}
                        disabled={vaultSaving || vaultDraft === selectedVaultDocument.content}
                      >
                        <MaterialIcon name='save' />
                        {vaultSaving ? '저장 중' : '저장'}
                      </button>
                    </div>
                  </div>
                  <textarea
                    className='vault-markdown-editor'
                    value={vaultDraft}
                    onChange={(event) => setVaultDraft(event.target.value)}
                    spellCheck={false}
                    aria-label='Markdown 문서'
                  />
                </>
              ) : (
                <div className='vault-empty-editor'>
                  <MaterialIcon name='description' />
                  <span>문서를 선택하세요.</span>
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>
    );
  }

  if (section === 'agent') {
    const suggestions = [
      { icon: 'summarize', label: '요약', prompt: '최근 회의록 3개를 요약해줘' },
      { icon: 'hub', label: '연결 탐색', prompt: 'Roadmap 2026과 연결된 문서는?' },
      { icon: 'search', label: '검색', prompt: 'RAG 관련 실험 로그 찾아줘' },
      { icon: 'draft', label: '초안', prompt: 'Q2 회고 문서 초안 잡아줘' },
    ];
    const aiChatViews = allViews.filter((view) => view.layout === ViewLayout.AIChat);
    const showConversation = agentMode === 'conversation' || agentTurns.length > 0 || agentSending;
    const modelOptions = ['Claude Opus 4.8', 'GPT-5.5', 'Synapse Local'];

    return (
      <section className='view' id='view-agent'>
        <div className='agent'>
          <div className='agent-head'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type='button' className='model-sel' aria-label='AI 모델'>
                  <span className='icon icon--fill' style={{ color: 'var(--sn-primary)' }}>
                    auto_awesome
                  </span>
                  {agentModel}
                  <span className='icon dd'>expand_more</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                {modelOptions.map((model) => (
                  <DropdownMenuItem key={model} onSelect={() => setAgentModel(model)}>
                    <span className='min-w-0 flex-1 truncate'>{model}</span>
                    {agentModel === model ? <MaterialIcon name='check' /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className='spacer' />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type='button' className='iconbtn' aria-label='대화 기록' title='대화 기록'>
                  <MaterialIcon name='history' />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-[260px]'>
                {aiChatViews.length > 0 ? (
                  aiChatViews.slice(0, 8).map((view) => (
                    <DropdownMenuItem key={view.view_id} onSelect={() => openView(view.view_id)}>
                      <MaterialIcon name='auto_awesome' />
                      <span className='min-w-0 flex-1 truncate'>{viewName(view)}</span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>저장된 대화가 없습니다.</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type='button'
              className='iconbtn bordered'
              aria-label='새 대화'
              title='새 대화'
              onClick={() => {
                setAgentPrompt('');
                setAgentVote(null);
                setAgentTurns([]);
                setAgentMode('empty');
              }}
            >
              <MaterialIcon name='edit_square' />
            </button>
          </div>

          <div className='agent-scroll'>
            {!showConversation ? (
              <section className='empty'>
                <span className='logo'>
                  <span className='icon icon--fill'>auto_awesome</span>
                </span>
                <h2>무엇을 도와드릴까요?</h2>
                <p>워크스페이스 문서를 검색하거나, 연결된 지식을 바탕으로 답을 받아보세요.</p>
                <div className='suggest'>
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.prompt}
                      type='button'
                      className='scard'
                      onClick={() => {
                        void submitAgentPrompt(suggestion.prompt);
                      }}
                    >
                      <div className='si'>
                        <span className='icon'>{suggestion.icon}</span>
                        {suggestion.label}
                      </div>
                      <div className='sq'>{suggestion.prompt}</div>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <section className='thread'>
                {agentTurns.map((turn, turnIndex) => (
                  <Fragment key={turn.id}>
                    <article className='turn'>
                      <div className='turn-head'>
                        <span className='av user'>나</span>
                        <span className='turn-name'>나</span>
                      </div>
                      <div className='q-bubble'>{turn.prompt}</div>
                    </article>

                    <article className='turn'>
                      <div className='turn-head'>
                        <span className='av ai'>
                          <span className='icon icon--fill'>auto_awesome</span>
                        </span>
                        <span className='turn-name'>Agent</span>
                        <span className='chip dim' style={{ marginLeft: 4 }}>
                          <MaterialIcon name={turn.status === 'ready' ? 'hub' : 'sync_problem'} />
                          {turn.status === 'ready' ? '응답 완료' : '연결 필요'}
                        </span>
                      </div>
                      <div className='turn-body'>
                        <p>
                          {turn.answerLead}
                          {turn.status === 'ready' && turn.sources.length > 0 ? <span className='sup'>1</span> : null}
                        </p>
                        <h4>{turn.answerTitle}</h4>
                        {turn.answerBullets.length > 0 ? (
                          <ul>
                            {turn.answerBullets.map((bullet, index) => (
                              <li key={`${turn.id}-bullet-${index}`}>
                                <strong>{index === 0 ? turn.answerFocus : '문맥'}</strong> — {bullet}
                                {turn.status === 'ready' && turn.sources[index] ? (
                                  <span className='sup'>{index + 1}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {turn.answerSummary !== turn.answerLead ? (
                          <p>
                            <strong>{turn.answerSummary}</strong>
                          </p>
                        ) : null}

                        <div className='sources'>
                          <div className='sources-h'>
                            <MaterialIcon name='menu_book' />
                            출처 {turn.sources.length}개
                          </div>
                          {turn.sources.length > 0 ? (
                            turn.sources.map((source, index) => (
                              <button
                                key={source.view.view_id}
                                type='button'
                                className='src'
                                onClick={() => openView(source.view.view_id)}
                              >
                                <span className='num'>{index + 1}</span>
                                <span className='icon f'>description</span>
                                <span className='st'>
                                  <div className='stt'>{viewName(source.view)}</div>
                                  {source.excerpt ? <div className='ss'>{source.excerpt}</div> : null}
                                </span>
                                {typeof source.relevance === 'number' ? (
                                  <span className='pct'>{source.relevance}%</span>
                                ) : null}
                              </button>
                            ))
                          ) : (
                            <div className='src'>
                              {turn.status === 'ready'
                                ? '서버 응답에 인용 정보가 포함되지 않았습니다.'
                                : 'AI 응답이 완료되지 않아 출처를 표시하지 않습니다.'}
                            </div>
                          )}
                        </div>

                        {turnIndex === agentTurns.length - 1 ? (
                          <div className='msg-acts'>
                            <button
                              type='button'
                              className='iconbtn'
                              aria-label='복사'
                              title='복사'
                              onClick={copyAgentAnswer}
                            >
                              <MaterialIcon name='content_copy' />
                            </button>
                            <button
                              type='button'
                              className='iconbtn'
                              aria-label='좋아요'
                              title='좋아요'
                              aria-pressed={agentVote === 'up'}
                              onClick={() => setAgentVote((vote) => (vote === 'up' ? null : 'up'))}
                            >
                              <MaterialIcon name='thumb_up' />
                            </button>
                            <button
                              type='button'
                              className='iconbtn'
                              aria-label='싫어요'
                              title='싫어요'
                              aria-pressed={agentVote === 'down'}
                              onClick={() => setAgentVote((vote) => (vote === 'down' ? null : 'down'))}
                            >
                              <MaterialIcon name='thumb_down' />
                            </button>
                            <button
                              type='button'
                              className='iconbtn'
                              aria-label='다시 생성'
                              title='다시 생성'
                              onClick={() => {
                                setAgentDraft((value) => value + 1);
                                setAgentVote(null);
                                void submitAgentPrompt(turn.prompt);
                              }}
                            >
                              <MaterialIcon name='refresh' />
                            </button>
                            <button
                              type='button'
                              className='iconbtn'
                              aria-label='공유'
                              title='공유'
                              onClick={shareAgentAnswer}
                            >
                              <MaterialIcon name='ios_share' />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  </Fragment>
                ))}
                {agentSending ? (
                  <article className='turn'>
                    <div className='turn-head'>
                      <span className='av ai'>
                        <span className='icon icon--fill'>auto_awesome</span>
                      </span>
                      <span className='turn-name'>Agent</span>
                    </div>
                    <div className='turn-body'>
                      <LoadingDots />
                    </div>
                  </article>
                ) : null}
              </section>
            )}
          </div>

          <div className='composer-wrap'>
            <div className='composer'>
              <textarea
                rows={1}
                value={agentPrompt}
                onChange={(event) => setAgentPrompt(event.target.value)}
                placeholder='무엇이든 물어보세요. 워크스페이스 문서를 검색해 답합니다…'
              />
              <div className='composer-bar'>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type='button' className='tool' aria-label='추가'>
                      <MaterialIcon name='add' />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='start'>
                    <DropdownMenuItem onSelect={createDocument}>
                      <MaterialIcon name='note_add' />새 문서
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={openLibrary}>
                      <MaterialIcon name='folder_open' />
                      라이브러리 열기
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setMentionContextEnabled(true);
                        notify.success('문서 멘션을 켰습니다.');
                      }}
                    >
                      <MaterialIcon name='alternate_email' />
                      문서 멘션 켜기
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  type='button'
                  className={cn('tool', graphContextEnabled && 'on')}
                  aria-pressed={graphContextEnabled}
                  onClick={() => setGraphContextEnabled((enabled) => !enabled)}
                >
                  <MaterialIcon name='hub' />
                  그래프 컨텍스트
                </button>
                <button
                  type='button'
                  className={cn('tool', webContextEnabled && 'on')}
                  aria-pressed={webContextEnabled}
                  onClick={() => setWebContextEnabled((enabled) => !enabled)}
                >
                  <MaterialIcon name='language' />웹
                </button>
                <button
                  type='button'
                  className={cn('tool', mentionContextEnabled && 'on')}
                  aria-pressed={mentionContextEnabled}
                  onClick={() => setMentionContextEnabled((enabled) => !enabled)}
                >
                  <MaterialIcon name='alternate_email' />
                  문서 멘션
                </button>
                <button
                  type='button'
                  className='send'
                  aria-label='보내기'
                  title='보내기'
                  disabled={!aiEnabled || !agentPrompt.trim() || agentSending}
                  onClick={() => {
                    void submitAgentPrompt(agentPrompt);
                  }}
                >
                  {agentSending ? <LoadingDots /> : <MaterialIcon name='arrow_upward' />}
                </button>
              </div>
            </div>
            <div className='composer-hint'>
              Agent는 실수할 수 있습니다. 중요한 정보는 출처를 확인하세요.
              {!aiEnabled ? ' 이 워크스페이스에서는 AI 기능을 사용할 수 없습니다.' : ''}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className='view' id='view-home'>
      <div className='page'>
        <div className='greeting'>
          {greeting()}, {userDisplayName} 👋
        </div>
        <div className='greeting-sub'>
          {new Intl.DateTimeFormat('ko-KR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).format(new Date())}{' '}
          · 오늘도 생각을 연결해 볼까요
        </div>

        <div className='stat-row'>
          {[
            ['description', documentViews.length, '문서'],
            ['hub', graphLinks, '연결'],
            ['workspaces', workspaceSpaces.length, '스페이스'],
            ['bolt', todayEdits, '오늘 편집'],
          ].map(([icon, value, label]) => (
            <div key={label} className='stat-card'>
              <div className='si'>
                <MaterialIcon name={String(icon)} />
              </div>
              <div>
                <div className='stat-num'>{value}</div>
                <div className='stat-lbl'>{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className='sec-title'>
          <h3>최근 방문</h3>
          <a
            href={getAppSectionPath(workspaceId, 'library')}
            className='more'
            onClick={(event) => {
              event.preventDefault();
              openLibrary();
            }}
          >
            전체 보기 <MaterialIcon name='chevron_right' />
          </a>
        </div>
        {loadingRecent && !recentViews ? (
          <div className='list' style={{ marginBottom: 32 }}>
            <div className='lrow'>
              <LoadingDots />
            </div>
          </div>
        ) : recent.length > 0 ? (
          <div className='hcards'>
            {recent.slice(0, 4).map((view, index) => (
              <div
                key={view.view_id}
                role='button'
                tabIndex={0}
                className='hcard'
                onClick={() => openView(view.view_id)}
                onKeyDown={(event) => openViewOnCardKeyDown(view.view_id, event)}
              >
                <div className={`tile ${['a', 'b', 'c', 'd'][index % 4]}`}>
                  <MaterialIcon name={documentMaterialIcon(view, index)} />
                </div>
                <div className='ht'>{viewName(view)}</div>
                <div className='hm'>
                  <span className='icon' style={{ fontSize: 13 }}>
                    schedule
                  </span>
                  {formatRelative(view.last_viewed_at)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className='list' style={{ marginBottom: 32 }}>
            <div className='lrow'>최근 방문한 문서가 없습니다.</div>
          </div>
        )}

        <div className='sec-title'>
          <h3>이어서 작업</h3>
          <a
            href={getAppSectionPath(workspaceId, 'library')}
            className='more'
            onClick={(event) => {
              event.preventDefault();
              openLibrary();
            }}
          >
            전체 보기 <MaterialIcon name='chevron_right' />
          </a>
        </div>
        <div className='list' style={{ marginBottom: 32 }}>
          {continueItems.length > 0 ? (
            continueItems.slice(0, 2).map((view) => (
              <button key={view.view_id} type='button' className='lrow' onClick={() => openView(view.view_id)}>
                <span className='lic'>
                  <MaterialIcon name={documentMaterialIcon(view, 1) || 'edit_note'} />
                </span>
                <div className='lmain'>
                  <div className='ltitle'>{displayViewName(view)}</div>
                  <div className='lmeta'>수정 {formatRelative(view.last_edited_time)}</div>
                </div>
                <span className='icon chev'>chevron_right</span>
              </button>
            ))
          ) : (
            <div className='lrow'>이어갈 문서가 없습니다.</div>
          )}
        </div>

        <div className='sec-title'>
          <h3>스페이스</h3>
          <a
            href={getAppSectionPath(workspaceId, 'library')}
            className='more'
            onClick={(event) => {
              event.preventDefault();
              openLibrary();
            }}
          >
            관리 <MaterialIcon name='chevron_right' />
          </a>
        </div>
        <div className='spaces'>
          {visibleSpaces.length > 0 ? (
            visibleSpaces.slice(0, 3).map((view, index) => (
              <div
                key={view.view_id}
                role='button'
                tabIndex={0}
                className='hcard'
                onClick={() => openView(view.view_id)}
                onKeyDown={(event) => openViewOnCardKeyDown(view.view_id, event)}
              >
                <div className={`tile ${view.extra?.synapse?.tileVariant || ['a', 'c', 'd'][index % 3]}`}>
                  <MaterialIcon name={spaceMaterialIcon(view)} />
                </div>
                <div className='ht'>{viewName(view)}</div>
                <div className='hm'>{countDocumentsInSpace(view)}개 문서</div>
              </div>
            ))
          ) : (
            <div className='hcard'>
              <div className='ht'>아직 스페이스가 없습니다.</div>
              <div className='hm'>새 문서를 만들면 여기에 표시됩니다.</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default AppSectionPage;
