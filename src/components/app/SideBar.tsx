import { Drawer } from '@mui/material';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Role, View, ViewIconType, ViewLayout } from '@/application/types';
import Resizer from '@/components/_shared/outline/Resizer';
import { getOutlineExpands, setOutlineExpands } from '@/components/_shared/outline/utils';
import { notify } from '@/components/_shared/notify';
import {
  useAIEnabled,
  useAppFavorites,
  useAppOperations,
  useAppOutline,
  useAppTrash,
  useCurrentWorkspaceId,
  useLoadedViewIds,
  useLoadViewChildren,
  useOpenPageModal,
  useSidebarSelectedViewId,
  useToView,
  useUserWorkspaceInfo,
} from '@/components/app/app.hooks';
import { getAppSectionPath, type AppSection } from '@/components/app/navigation/appSections';
import { SettingsDialog } from '@/components/app/settings';
import ViewActionsPopover from '@/components/app/view-actions/ViewActionsPopover';
import NotificationPanel from '@/components/notifications/NotificationPanel';
import { useNotifications } from '@/components/notifications/useNotifications';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import { Search } from 'src/components/app/search';

const appNavigationItems: Array<{
  section: AppSection;
  label: string;
  icon: string;
}> = [
  { section: 'home', label: 'Home', icon: 'home' },
  { section: 'library', label: 'Library', icon: 'folder_open' },
  { section: 'graph', label: 'Graph', icon: 'hub' },
  { section: 'agent', label: 'Agent', icon: 'auto_awesome' },
];
const LAST_SIDEBAR_VIEW_KEY = 'synapse_last_sidebar_view_id';

interface SideBarProps {
  drawerWidth: number;
  drawerOpened: boolean;
  temporary?: boolean;
  toggleOpenDrawer: (status: boolean) => void;
  onResizeDrawerWidth: (width: number) => void;
}

type SidebarActionState = {
  viewId: string;
  category: 'space' | 'page';
  type: 'more' | 'add';
} | null;

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return <span className={cn('icon', className)}>{name}</span>;
}

function viewName(view: View) {
  return view.name.trim() || 'Untitled';
}

function workspaceInitial(name: string | undefined) {
  return (name?.trim()?.[0] || 'S').toUpperCase();
}

function viewIcon(view: View, isSpace: boolean) {
  if (view.icon?.ty === ViewIconType.Emoji && view.icon.value) return view.icon.value;
  if (isSpace && view.extra?.space_icon) return view.extra.space_icon;
  if (view.layout === ViewLayout.Grid) return <MaterialIcon name='table' />;
  if (view.layout === ViewLayout.Board) return <MaterialIcon name='view_kanban' />;
  if (view.layout === ViewLayout.AIChat) return <MaterialIcon name='auto_awesome' />;
  return <MaterialIcon name={isSpace ? 'folder_open' : 'description'} />;
}

function visibleChildrenFor(view: View, aiEnabled: boolean) {
  const children = view.children ?? [];

  return children.filter((child) => isVisibleSidebarView(child, aiEnabled));
}

function rememberSidebarView(viewId: string) {
  localStorage.setItem(LAST_SIDEBAR_VIEW_KEY, viewId);
}

function useRememberedSidebarSelectedViewId() {
  const selectedViewId = useSidebarSelectedViewId();
  const [rememberedViewId, setRememberedViewId] = useState(() => localStorage.getItem(LAST_SIDEBAR_VIEW_KEY) || undefined);

  useEffect(() => {
    if (!selectedViewId) return;
    rememberSidebarView(selectedViewId);
    setRememberedViewId(selectedViewId);
  }, [selectedViewId]);

  return selectedViewId || rememberedViewId;
}

function isVisibleSidebarView(view: View, aiEnabled: boolean) {
  if (view.extra?.is_hidden_space) return false;
  if (!aiEnabled && view.layout === ViewLayout.AIChat) return false;
  return true;
}

function SideBar({ drawerWidth, drawerOpened, temporary = false, toggleOpenDrawer, onResizeDrawerWidth }: SideBarProps) {
  const userWorkspaceInfo = useUserWorkspaceInfo();
  const outline = useAppOutline();
  const workspaceId = useCurrentWorkspaceId();
  const { addPage } = useAppOperations();
  const openPageModal = useOpenPageModal();
  const role = userWorkspaceInfo?.selectedWorkspace.role;
  const aiEnabled = useAIEnabled();
  const visibleSpaces = useMemo(
    () => (outline ?? []).filter((view) => isVisibleSidebarView(view, aiEnabled)),
    [aiEnabled, outline]
  );

  const createPage = useCallback(
    async (parent?: View) => {
      const target = parent || visibleSpaces[0];

      if (!target || !addPage) {
        notify.error('새 페이지를 만들 스페이스가 없습니다.');
        return;
      }

      try {
        const created = await addPage(target.view_id, {
          layout: ViewLayout.Document,
          name: '새 페이지',
          prev_view_id: target.children?.[target.children.length - 1]?.view_id,
        });

        openPageModal?.(created.view_id);
      } catch (error) {
        notify.error(error instanceof Error ? error.message : '새 페이지를 만들지 못했습니다.');
      }
    },
    [addPage, openPageModal, visibleSpaces]
  );

  return (
    <Drawer
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          background: 'var(--surface-low)',
          border: 0,
          borderRight: '1px solid var(--outline-var)',
          boxShadow: 'none',
          overflow: 'hidden',
          zIndex: 50,
        },
      }}
      variant={temporary ? 'temporary' : 'persistent'}
      anchor='left'
      open={drawerOpened}
      onClose={() => toggleOpenDrawer(false)}
      ModalProps={{ keepMounted: true }}
      PaperProps={{
        className: 'sb',
      }}
    >
      <div className='sb-top'>
        <SynapseWorkspaceSwitcher />
        <button type='button' className='sb-ico' aria-label='패널 접기' onClick={() => toggleOpenDrawer(false)}>
          <MaterialIcon name='dock_to_right' />
        </button>
      </div>

      <div className='sb-scroll'>
        <div className='sb-actions'>
          <Search mode='button' />
          <AppNavigationTabs />
          <SynapseNotificationRow />
        </div>

        <SynapseFavoritesSection createPage={createPage} />
        <SynapseWorkspaceTree spaces={visibleSpaces} createPage={createPage} />
      </div>

      {role === Role.Guest ? null : <SynapseBottomActions createPage={createPage} />}
      {temporary ? null : <Resizer drawerWidth={drawerWidth} onResize={onResizeDrawerWidth} />}
    </Drawer>
  );
}

export default SideBar;

function SynapseWorkspaceSwitcher() {
  const userWorkspaceInfo = useUserWorkspaceInfo();
  const workspaceId = useCurrentWorkspaceId();
  const { onChangeWorkspace } = useAppOperations();
  const selectedWorkspace = userWorkspaceInfo?.selectedWorkspace;
  const [changingWorkspaceId, setChangingWorkspaceId] = useState<string | null>(null);

  const handleChangeWorkspace = useCallback(
    async (nextWorkspaceId: string) => {
      if (nextWorkspaceId === workspaceId || !onChangeWorkspace) return;

      setChangingWorkspaceId(nextWorkspaceId);
      try {
        await onChangeWorkspace(nextWorkspaceId);
      } catch (error) {
        notify.error(error instanceof Error ? error.message : '워크스페이스를 전환하지 못했습니다.');
      } finally {
        setChangingWorkspaceId(null);
      }
    },
    [onChangeWorkspace, workspaceId]
  );

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type='button' className='ws' aria-label='워크스페이스 전환'>
          <span className='ws-av'>{workspaceInitial(selectedWorkspace?.name)}</span>
          <span className='ws-name'>{selectedWorkspace?.name || 'SynapseNote'}</span>
          <MaterialIcon name='unfold_more' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-[260px]'>
        <DropdownMenuLabel>워크스페이스</DropdownMenuLabel>
        {userWorkspaceInfo?.workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            disabled={changingWorkspaceId === workspace.id}
            onSelect={() => {
              void handleChangeWorkspace(workspace.id);
            }}
          >
            <span className='ws-av !h-5 !w-5 !rounded-[6px] !text-[10px]'>{workspaceInitial(workspace.name)}</span>
            <span className='min-w-0 flex-1 truncate'>{workspace.name}</span>
            {workspace.id === workspaceId ? <MaterialIcon name='check' /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppNavigationTabs() {
  const userWorkspaceInfo = useUserWorkspaceInfo();
  const workspaceId = userWorkspaceInfo?.selectedWorkspace.id;
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav aria-label='Primary' className='sb-nav'>
      {appNavigationItems.map(({ section, label, icon }) => {
        const path = getAppSectionPath(workspaceId, section);
        const active = location.pathname === path;

        return (
          <button
            key={section}
            type='button'
            className={cn('sb-item nav', active && 'active')}
            disabled={!workspaceId}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              navigate(path);
            }}
          >
            <MaterialIcon name={icon} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function SynapseNotificationRow() {
  const workspaceId = useCurrentWorkspaceId();
  const hook = useNotifications(workspaceId);
  const { hasLoaded, isLoading, refresh, unreadCount } = hook;
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen && !hasLoaded && !isLoading) {
        void refresh();
      }
    },
    [hasLoaded, isLoading, refresh]
  );

  useEffect(() => {
    if (!workspaceId || hasLoaded || isLoading) return;
    void refresh();
  }, [hasLoaded, isLoading, refresh, workspaceId]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button type='button' className='sb-item' aria-label='받은 알림'>
          <MaterialIcon name='inbox' />
          받은 알림
          {unreadCount > 0 ? <span className='dot-badge' /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align='start' side='right' sideOffset={8} className='p-0'>
        <NotificationPanel hook={hook} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function SynapseFavoritesSection({ createPage }: { createPage: (parent?: View) => Promise<void> }) {
  const { favoriteViews, loadFavoriteViews } = useAppFavorites();
  const selectedViewId = useRememberedSidebarSelectedViewId();
  const toView = useToView();
  const aiEnabled = useAIEnabled();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('favorite_expanded') === 'false');
  const [action, setAction] = useState<SidebarActionState>(null);
  const visibleFavorites = useMemo(
    () => (favoriteViews ?? []).filter((view) => isVisibleSidebarView(view, aiEnabled)),
    [aiEnabled, favoriteViews]
  );

  useEffect(() => {
    void loadFavoriteViews?.();
  }, [loadFavoriteViews]);

  if (!favoriteViews || visibleFavorites.length === 0) return null;

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      localStorage.setItem('favorite_expanded', String(value));
      return !value;
    });
  };

  return (
    <div className={cn('sb-sec', collapsed && 'collapsed')} id='sec-fav'>
      <button
        type='button'
        className='sb-sec-h'
        aria-expanded={!collapsed}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-sec-add]')) {
            void createPage();
            return;
          }

          toggleCollapsed();
        }}
      >
        <MaterialIcon name='expand_more' className='chev' />
        즐겨찾기
        <span data-sec-add className='sec-add'>
          <MaterialIcon name='add' />
        </span>
      </button>
      <div className='sb-tree'>
        {visibleFavorites.map((view) => (
          <SynapseTreeRow
            key={view.view_id}
            view={view}
            level={0}
            category='page'
            selectedViewId={selectedViewId}
            expanded={false}
            hasChildren={false}
            action={action}
            setAction={setAction}
            showCreateAction={false}
            onOpen={() => {
              rememberSidebarView(view.view_id);
              void toView(view.view_id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SynapseWorkspaceTree({ spaces, createPage }: { spaces: View[]; createPage: (parent?: View) => Promise<void> }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>(() => Object.keys(getOutlineExpands()));
  const [action, setAction] = useState<SidebarActionState>(null);

  return (
    <div className={cn('sb-sec', collapsed && 'collapsed')} id='sec-ws'>
      <button
        type='button'
        className='sb-sec-h'
        aria-expanded={!collapsed}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-sec-add]')) {
            void createPage();
            return;
          }

          setCollapsed((value) => !value);
        }}
      >
        <MaterialIcon name='expand_more' className='chev' />
        워크스페이스
        <span data-sec-add className='sec-add'>
          <MaterialIcon name='add' />
        </span>
      </button>
      <div className='sb-tree'>
        {spaces.map((space) => (
          <SynapseTreeBranch
            key={space.view_id}
            view={space}
            level={0}
            expandedIds={expandedIds}
            setExpandedIds={setExpandedIds}
            action={action}
            setAction={setAction}
            createPage={createPage}
          />
        ))}
      </div>
    </div>
  );
}

function SynapseTreeBranch({
  view,
  level,
  expandedIds,
  setExpandedIds,
  action,
  setAction,
  createPage,
}: {
  view: View;
  level: number;
  expandedIds: string[];
  setExpandedIds: React.Dispatch<React.SetStateAction<string[]>>;
  action: SidebarActionState;
  setAction: React.Dispatch<React.SetStateAction<SidebarActionState>>;
  createPage: (parent?: View) => Promise<void>;
}) {
  const selectedViewId = useRememberedSidebarSelectedViewId();
  const toView = useToView();
  const aiEnabled = useAIEnabled();
  const loadedViewIds = useLoadedViewIds();
  const loadViewChildren = useLoadViewChildren();
  const children = visibleChildrenFor(view, aiEnabled);
  const loaded = loadedViewIds?.has(view.view_id) ?? false;
  const hasChildren = children.length > 0 || (!loaded && Boolean(view.has_children) && view.layout === ViewLayout.Document);
  const expanded = expandedIds.includes(view.view_id);
  const isSpace = level === 0 && Boolean(view.extra?.is_space);
  const category: 'space' | 'page' = isSpace ? 'space' : 'page';

  const toggleExpanded = useCallback(async () => {
    if (!hasChildren) return;

    const nextExpanded = !expanded;

    setOutlineExpands(view.view_id, nextExpanded);
    setExpandedIds((ids) => (nextExpanded ? Array.from(new Set([...ids, view.view_id])) : ids.filter((id) => id !== view.view_id)));

    if (nextExpanded && children.length === 0 && !loaded) {
      await loadViewChildren?.(view.view_id);
    }
  }, [children.length, expanded, hasChildren, loadViewChildren, loaded, setExpandedIds, view.view_id]);

  return (
    <>
      <SynapseTreeRow
        view={view}
        level={level}
        category={category}
        selectedViewId={selectedViewId}
        expanded={expanded}
        hasChildren={hasChildren}
        action={action}
        setAction={setAction}
        onToggle={toggleExpanded}
        onCreatePage={() => createPage(view)}
        onOpen={() => {
          rememberSidebarView(view.view_id);
          void toView(view.view_id);
        }}
      />
      {hasChildren ? (
        <div className='tree-children'>
          {children.map((child) => (
            <SynapseTreeBranch
              key={child.view_id}
              view={child}
              level={Math.min(level + 1, 2)}
              expandedIds={expandedIds}
              setExpandedIds={setExpandedIds}
              action={action}
              setAction={setAction}
              createPage={createPage}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

function SynapseTreeRow({
  view,
  level,
  category,
  selectedViewId,
  expanded,
  hasChildren,
  action,
  setAction,
  onToggle,
  onCreatePage,
  showCreateAction = true,
  onOpen,
}: {
  view: View;
  level: number;
  category: 'space' | 'page';
  selectedViewId?: string;
  expanded: boolean;
  hasChildren: boolean;
  action: SidebarActionState;
  setAction: React.Dispatch<React.SetStateAction<SidebarActionState>>;
  onToggle?: () => void | Promise<void>;
  onCreatePage?: () => void | Promise<void>;
  showCreateAction?: boolean;
  onOpen: () => void;
}) {
  const isActive = selectedViewId === view.view_id;
  const levelClass = level === 1 ? 'lvl-1' : level >= 2 ? 'lvl-2' : undefined;
  const showFavoriteStar = Boolean(view.favorited_at && view.icon?.ty !== ViewIconType.Emoji);

  // Spaces are containers, not documents — clicking one should expand it
  // (Notion-style explorer), not navigate. Pages navigate to open.
  const activate = category === 'space' && hasChildren && onToggle ? () => void onToggle() : onOpen;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      activate();
    }

    if (event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

  return (
    <div
      role='button'
      tabIndex={0}
      aria-current={isActive ? 'page' : undefined}
      aria-expanded={hasChildren ? expanded : undefined}
      className={cn('tree-row', levelClass, expanded && 'open', isActive && 'active')}
      onClick={activate}
      onKeyDown={handleKeyDown}
    >
      <span
        className={cn('tw', hasChildren ? 'has-children' : 'leaf')}
        onClick={(event) => {
          event.stopPropagation();
          void onToggle?.();
        }}
      >
        {hasChildren ? <MaterialIcon name='chevron_right' /> : null}
      </span>
      <span className={cn('t-ic', showFavoriteStar && 'fav-star')}>
        {showFavoriteStar ? <MaterialIcon name='star' className='icon--fill' /> : viewIcon(view, category === 'space')}
      </span>
      <span className='t-name'>{viewName(view)}</span>
      {level >= 2 && !hasChildren ? null : (
        <span className='row-acts' onClick={(event) => event.stopPropagation()}>
          <SynapseRowActionButton view={view} category={category} type='more' action={action} setAction={setAction} />
          {showCreateAction ? (
            <SynapseRowActionButton
              view={view}
              category={category}
              type='add'
              action={action}
              setAction={setAction}
              fallbackAction={onCreatePage}
            />
          ) : null}
        </span>
      )}
    </div>
  );
}

function SynapseRowActionButton({
  view,
  category,
  type,
  action,
  setAction,
  fallbackAction,
}: {
  view: View;
  category: 'space' | 'page';
  type: 'more' | 'add';
  action: SidebarActionState;
  setAction: React.Dispatch<React.SetStateAction<SidebarActionState>>;
  fallbackAction?: () => void | Promise<void>;
}) {
  const open = action?.viewId === view.view_id && action.category === category && action.type === type;

  return (
    <ViewActionsPopover
      view={view}
      popoverType={{ category, type }}
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setAction({ viewId: view.view_id, category, type });
          return;
        }

        setAction(null);
      }}
    >
      <button
        type='button'
        aria-label={type === 'more' ? `${viewName(view)} 더보기` : `${viewName(view)} 하위 페이지`}
        onClick={(event) => {
          event.stopPropagation();
          if (type === 'add' && !fallbackAction) return;
        }}
      >
        <MaterialIcon name={type === 'more' ? 'more_horiz' : 'add'} />
      </button>
    </ViewActionsPopover>
  );
}

function SynapseBottomActions({ createPage }: { createPage: (parent?: View) => Promise<void> }) {
  const navigate = useNavigate();
  const workspaceId = useCurrentWorkspaceId();
  const { loadTrash, trashList } = useAppTrash();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openTrash = useCallback(() => {
    if (workspaceId) {
      void loadTrash?.(workspaceId);
    }

    navigate('/app/trash');
  }, [loadTrash, navigate, workspaceId]);

  return (
    <>
      <div className='sb-bottom'>
        <button type='button' className='sb-item' onClick={openTrash}>
          <MaterialIcon name='delete' />
          휴지통
          {trashList?.length ? <span className='sb-trail'>{trashList.length}</span> : null}
        </button>
        <button type='button' className='sb-item' onClick={() => setSettingsOpen(true)}>
          <MaterialIcon name='settings' />
          설정
        </button>
        <button type='button' className='sb-item font-semibold !text-[var(--on-surface)]' onClick={() => void createPage()}>
          <MaterialIcon name='add' className='!text-[var(--sn-primary)]' />
          새 페이지
        </button>
      </div>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onRequestOpen={() => setSettingsOpen(true)} />
    </>
  );
}
