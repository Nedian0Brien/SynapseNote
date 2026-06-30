import { Fragment, type HTMLAttributes, type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { View, ViewLayout } from '@/application/types';
import LoadingDots from '@/components/_shared/LoadingDots';
import { notify } from '@/components/_shared/notify';
import {
  useAIEnabled,
  useAppFavorites,
  useAppOperations,
  useAppOutline,
  useAppRecent,
  useCurrentWorkspaceId,
  useToView,
  useUserWorkspaceInfo,
} from '@/components/app/app.hooks';
import { getAppSectionPath, type AppSection } from '@/components/app/navigation/appSections';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SynapseGraphWorkspace } from '@/features/synapse-graph/SynapseGraphWorkspace';
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

function viewTags(view: View) {
  if (view.extra?.synapse?.tags?.length) return view.extra.synapse.tags;
  return [view.layout === ViewLayout.Grid ? 'DB' : '문서'];
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

function spaceMaterialIcon(space: View) {
  return space.extra?.synapse?.materialIcon || 'folder_open';
}

function documentMaterialIcon(view: View, index = 0) {
  if (view.extra?.synapse?.materialIcon) return view.extra.synapse.materialIcon;
  if (view.layout === ViewLayout.Grid) return 'table';
  return index === 0 ? 'hub' : 'description';
}

function LibraryDocumentIcon({ view }: { view: View }) {
  const showFavoriteStar = Boolean(view.favorited_at);

  if (showFavoriteStar) {
    return <MaterialIcon name='star' className='icon--fill' style={{ color: 'var(--sn-favorite)' }} />;
  }

  return <MaterialIcon name={documentMaterialIcon(view, 1)} />;
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
  const { addPage } = useAppOperations();
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
  const workspaceName = userWorkspaceInfo?.selectedWorkspace.name || 'SynapseNote';
  const userDisplayName = currentUser?.name || currentUser?.email?.split('@')[0] || workspaceName;
  const visibleSpaces = useMemo(
    () => outline?.filter((view) => view.extra?.is_space && !view.extra?.is_hidden_space) ?? [],
    [outline]
  );
  const allViews = useMemo(() => flattenViews(outline), [outline]);
  const workspaceSpaces = useMemo(() => allViews.filter((view) => view.extra?.is_space), [allViews]);
  const documentViews = useMemo(
    () =>
      allViews.filter(
        (view) =>
          isVisibleView(view) &&
          !view.extra?.is_space &&
          view.layout !== ViewLayout.AIChat
      ),
    [allViews]
  );
  const libraryRows = documentViews;
  const graphData = useMemo(() => outlineToGraph(outline), [outline]);
  const connectionCountByViewId = useMemo(() => {
    const countById = new Map<string, number>();

    graphData.edges.forEach((edge) => {
      countById.set(edge.source, (countById.get(edge.source) ?? 0) + 1);
      countById.set(edge.target, (countById.get(edge.target) ?? 0) + 1);
    });

    return countById;
  }, [graphData]);
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

    return preferred.filter((view) => {
      if (seen.has(view.view_id)) return false;
      seen.add(view.view_id);
      return true;
    }).slice(0, 4);
  }, [agentDocumentViews, recent]);
  const filteredLibraryViews = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    const matches = libraryRows.filter((view) => {
      if (query && !displayViewName(view).toLowerCase().includes(query)) return false;
      if (!libraryFilterActive) return true;
      if (!view.last_edited_time) return false;
      const edited = new Date(view.last_edited_time);
      const now = new Date();

      return (
        edited.getFullYear() === now.getFullYear() &&
        edited.getMonth() === now.getMonth() &&
        edited.getDate() === now.getDate()
      );
    });

    return matches.sort((a, b) => {
      if (librarySort === 'name') return displayViewName(a).localeCompare(displayViewName(b));
      const aTime = new Date(a.last_edited_time || a.created_at || 0).getTime();
      const bTime = new Date(b.last_edited_time || b.created_at || 0).getTime();

      return bTime - aTime;
    });
  }, [libraryFilterActive, libraryQuery, libraryRows, librarySort]);
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
    const parent = visibleSpaces[0] || outline?.[0];

    if (!parent || !addPage) return;

    try {
      const created = await addPage(parent.view_id, {
        layout: ViewLayout.Document,
        name: '새 문서',
        prev_view_id: parent.children?.[parent.children.length - 1]?.view_id,
      });

      await toView(created.view_id);
    } catch (error) {
      notify.error(getErrorMessage(error));
    }
  }, [addPage, outline, toView, visibleSpaces]);

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
    return (
      <SynapseGraphWorkspace
        presentation='inline'
        outline={outline}
        currentViewId={workspaceId}
        open
        refreshKey={workspaceId}
        onClose={() => undefined}
        onOpenView={openView}
      />
    );
  }

  if (section === 'library') {
    return (
      <section className='view' id='view-library'>
        <div className='page' style={{ maxWidth: 1040 }}>
          <div className='lib-head'>
            <div>
              <div className='lib-title'>Library</div>
              <div className='lib-sub'>모든 문서 · {documentViews.length}개</div>
            </div>
            <button type='button' className='btn btn-primary' onClick={createDocument}>
              <MaterialIcon name='add' />
              새 문서
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
            <button
              type='button'
              className={cn('chip', libraryGrouped && 'dim')}
              onClick={() => setLibraryGrouped((grouped) => !grouped)}
            >
              <MaterialIcon name='workspaces' />
              {libraryGrouped ? '스페이스별' : '전체'}
            </button>
          </div>

          {libraryMode === 'gallery' ? (
            <div className='hcards'>
              {filteredLibraryViews.map((view, index) => (
                <div
                  key={view.view_id}
                  role='button'
                  tabIndex={0}
                  className='hcard'
                  onClick={() => openView(view.view_id)}
                  onKeyDown={(event) => openViewOnCardKeyDown(view.view_id, event)}
                >
                  <div className={`tile ${['a', 'b', 'c', 'd'][index % 4]}`}>
                    <MaterialIcon name='description' />
                  </div>
                  <div className='ht'>{displayViewName(view)}</div>
                  <div className='hm'>{formatRelative(view.last_edited_time || view.last_viewed_at)}</div>
                </div>
              ))}
            </div>
          ) : libraryMode === 'board' ? (
            <div className='spaces'>
              {visibleSpaces.map((space, index) => (
                <div
                  key={space.view_id}
                  role='button'
                  tabIndex={0}
                  className='hcard'
                  onClick={() => openView(space.view_id)}
                  onKeyDown={(event) => openViewOnCardKeyDown(space.view_id, event)}
                >
                  <div className={`tile ${space.extra?.synapse?.tileVariant || ['a', 'b', 'c', 'd'][index % 4]}`}>
                    <MaterialIcon name={spaceMaterialIcon(space)} />
                  </div>
                  <div className='ht'>{viewName(space)}</div>
                  <div className='hm'>{countDocumentsInSpace(space)}개 문서</div>
                </div>
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
                visibleSpaces.map((space) => {
                  const allowed = new Set(filteredLibraryViews.map((view) => view.view_id));
                  const rows = (space.children ?? []).filter((view) => allowed.has(view.view_id));
                  const collapsed = collapsedLibrarySpaceIds.includes(space.view_id);

                  if (rows.length === 0) return null;

                  return (
                    <Fragment key={space.view_id}>
                      <button
                        type='button'
                        className='tgrouph'
                        aria-expanded={!collapsed}
                        onClick={() =>
                          setCollapsedLibrarySpaceIds((ids) =>
                            ids.includes(space.view_id) ? ids.filter((id) => id !== space.view_id) : [...ids, space.view_id]
                          )
                        }
                      >
                        <MaterialIcon name={spaceMaterialIcon(space)} />
                        {viewName(space)}
                        <span className='cnt'>· {countDocumentsInSpace(space)}</span>
                      </button>
                      {!collapsed &&
                        rows.map((view) => (
                          <button key={view.view_id} type='button' className='trow' onClick={() => openView(view.view_id)}>
                            <div className='tname'>
                              <LibraryDocumentIcon view={view} />
                              <span>{displayViewName(view)}</span>
                            </div>
                            <div className='tcell tags c-tags'>
                              {viewTags(view).map((tag) => (
                                <span key={tag} className='chip tag'>
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <div className='tconn'>
                              <MaterialIcon name='hub' />
                              {connectionCountByViewId.get(view.view_id) ?? 0}
                            </div>
                            <div className='tcell c-date'>{formatRelative(view.last_edited_time || view.last_viewed_at)}</div>
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
                    <span className='cnt'>· {filteredLibraryViews.length}</span>
                  </div>
                  {filteredLibraryViews.map((view) => (
                    <button key={view.view_id} type='button' className='trow' onClick={() => openView(view.view_id)}>
                      <div className='tname'>
                        <LibraryDocumentIcon view={view} />
	                      <span>{displayViewName(view)}</span>
	                    </div>
	                    <div className='tcell tags c-tags'>
	                        {viewTags(view).map((tag) => (
	                          <span key={tag} className='chip tag'>
	                            {tag}
	                          </span>
	                        ))}
	                    </div>
		                    <div className='tconn'>
		                      <MaterialIcon name='hub' />
		                      {connectionCountByViewId.get(view.view_id) ?? 0}
                      </div>
                      <div className='tcell c-date'>{formatRelative(view.last_edited_time || view.last_viewed_at)}</div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
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
	                                {turn.status === 'ready' && turn.sources[index] ? <span className='sup'>{index + 1}</span> : null}
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
	                              {typeof source.relevance === 'number' ? <span className='pct'>{source.relevance}%</span> : null}
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
                          <button type='button' className='iconbtn' aria-label='복사' title='복사' onClick={copyAgentAnswer}>
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
                          <button type='button' className='iconbtn' aria-label='공유' title='공유' onClick={shareAgentAnswer}>
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
                    <MaterialIcon name='note_add' />
                    새 문서
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
                <MaterialIcon name='language' />
                웹
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
