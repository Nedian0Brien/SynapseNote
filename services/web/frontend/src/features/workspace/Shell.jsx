import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { GraphView } from './GraphView';
import { EditorView } from '../editor/EditorView';
import { TabBar } from './TabBar';
import { SplitPane } from './SplitPane';
import {
  closeTabState,
  deleteTabState,
  normalizeLayout,
  openTabState,
  renameTabState,
  replaceActiveTabState,
} from './shellState';

function findNodeMatch(nodes, target) {
  const normalizedTarget = target.trim().replace(/\.md$/, '').toLowerCase();
  return nodes.find((node) => {
    if (node.type !== 'Document') return false;
    const nodeId = String(node.id || '').toLowerCase();
    const title = String(node.title || '').toLowerCase();
    const stem = nodeId.split('/').pop()?.replace(/\.md$/, '') ?? '';
    return nodeId === target.toLowerCase()
      || title === normalizedTarget
      || stem === normalizedTarget;
  });
}

function getInitialRouteState() {
  if (typeof window === 'undefined') {
    return { layout: 'graph', docPath: null };
  }

  const params = new URLSearchParams(window.location.search);
  const docPath = params.get('doc');
  const view = params.get('view');
  const layout = view === 'split' || view === 'editor' || view === 'graph'
    ? view
    : docPath
      ? 'editor'
      : 'graph';

  return { layout, docPath };
}

function syncRouteState(layout, activePath) {
  if (typeof window === 'undefined') return;

  const nextUrl = new URL(window.location.href);
  const hasDoc = Boolean(activePath);

  if (hasDoc) {
    nextUrl.searchParams.set('view', layout);
    nextUrl.searchParams.set('doc', activePath);
  } else {
    nextUrl.searchParams.delete('doc');
    if (layout === 'graph') {
      nextUrl.searchParams.delete('view');
    } else {
      nextUrl.searchParams.set('view', layout);
    }
  }

  const nextHref = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextHref !== currentHref) {
    window.history.replaceState(null, '', nextHref);
  }
}

export function Shell({ onUnauthorized }) {
  const initialRoute = useMemo(() => getInitialRouteState(), []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobSidebarOpen, setMobSidebarOpen] = useState(false);
  const [layout, setLayout] = useState(initialRoute.layout);
  const [lastSingleView, setLastSingleView] = useState(initialRoute.layout === 'split'
    ? 'graph'
    : initialRoute.layout);
  const [openTabs, setOpenTabs] = useState(() => (
    initialRoute.docPath ? [{ id: initialRoute.docPath, path: initialRoute.docPath }] : []
  ));
  const [activeTabId, setActiveTabId] = useState(initialRoute.docPath);
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 640px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)');
    const handleChange = (event) => setIsMobile(event.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const activeTab = useMemo(
    () => openTabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, openTabs],
  );
  const activePath = activeTab?.path ?? null;
  const effectiveLayout = normalizeLayout(layout, isMobile, lastSingleView);

  useEffect(() => {
    syncRouteState(layout, activePath);
  }, [activePath, layout]);

  const commitTabs = useCallback((nextState) => {
    setOpenTabs(nextState.tabs);
    setActiveTabId(nextState.activeTabId);
  }, []);

  const bumpGraph = useCallback(() => {
    setGraphRefreshKey((value) => value + 1);
  }, []);

  const enterEditor = useCallback((nextPath, mode = 'open') => {
    const nextState = mode === 'replace'
      ? replaceActiveTabState(openTabs, activeTabId, nextPath)
      : openTabState(openTabs, activeTabId, nextPath);
    commitTabs(nextState);
    setLastSingleView('editor');
    if (layout !== 'split') {
      setLayout('editor');
    }
    setMobSidebarOpen(false);
  }, [activeTabId, commitTabs, layout, openTabs]);

  const handleOpenNode = useCallback((path) => {
    enterEditor(path, 'open');
  }, [enterEditor]);

  const handleGraphView = useCallback(() => {
    setLastSingleView('graph');
    setLayout('graph');
  }, []);

  const handleSplitToggle = useCallback(() => {
    if (isMobile) {
      const nextSingle = effectiveLayout === 'graph' ? 'editor' : 'graph';
      setLastSingleView(nextSingle);
      setLayout(nextSingle);
      return;
    }

    setLayout((current) => {
      if (current === 'split') {
        return lastSingleView;
      }
      return 'split';
    });
  }, [effectiveLayout, isMobile, lastSingleView]);

  const handleSelectTab = useCallback((tabId) => {
    setActiveTabId(tabId);
    setLastSingleView('editor');
    if (layout !== 'split') {
      setLayout('editor');
    }
  }, [layout]);

  const handleCloseTab = useCallback((tabId) => {
    const nextState = closeTabState(openTabs, activeTabId, tabId);
    commitTabs(nextState);
    if (!nextState.tabs.length) {
      setLastSingleView('graph');
      if (layout !== 'split') {
        setLayout('graph');
      }
    }
  }, [activeTabId, commitTabs, layout, openTabs]);

  const handleCreated = useCallback((path) => {
    bumpGraph();
    enterEditor(path, 'open');
  }, [bumpGraph, enterEditor]);

  const handleRenamed = useCallback((oldPath, newPath) => {
    bumpGraph();
    commitTabs(renameTabState(openTabs, oldPath, newPath, activeTabId));
  }, [activeTabId, bumpGraph, commitTabs, openTabs]);

  const handleDeleted = useCallback((path) => {
    bumpGraph();
    const nextState = deleteTabState(openTabs, path, activeTabId);
    commitTabs(nextState);
    if (!nextState.tabs.length && layout !== 'split') {
      setLastSingleView('graph');
      setLayout('graph');
    }
  }, [activeTabId, bumpGraph, commitTabs, layout, openTabs]);

  const handleWikilinkNavigate = useCallback(async (target, options = {}) => {
    try {
      const res = await fetch(
        `/api/nodes?q=${encodeURIComponent(target)}`,
        { credentials: 'include' },
      );
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (!res.ok) return;
      const json = await res.json();
      const match = findNodeMatch(json.data ?? [], target);
      if (!match?.id) return;

      if (options.newTab) {
        enterEditor(match.id, 'open');
      } else {
        enterEditor(match.id, 'replace');
      }
    } catch {
      // ignore
    }
  }, [enterEditor, onUnauthorized]);

  const breadcrumb = effectiveLayout === 'graph' && !activePath
    ? ['SynapseNote', 'Graph View']
    : ['SynapseNote', activePath?.split('/').pop()?.replace(/\.md$/, '') ?? 'Editor'];

  const editorPane = (
    <div className="editor-pane">
      <TabBar
        tabs={openTabs}
        activeTabId={activeTabId}
        onSelect={handleSelectTab}
        onClose={handleCloseTab}
      />
      {activePath ? (
        <EditorView
          key={activePath}
          path={activePath}
          onUnauthorized={onUnauthorized}
          onNavigate={handleWikilinkNavigate}
          onClose={() => handleCloseTab(activeTabId)}
        />
      ) : (
        <div className="editor-placeholder">
          <span className="icon">edit_note</span>
          <strong>노트를 선택해 편집을 시작하세요</strong>
          <p>그래프나 사이드바에서 문서를 열면 여기에서 바로 편집할 수 있습니다.</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="app">
        <Sidebar
          collapsed={sidebarCollapsed}
          mobOpen={mobSidebarOpen}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          onSelectNode={handleOpenNode}
          activeNodeId={activePath}
          onUnauthorized={onUnauthorized}
          onCreated={handleCreated}
          onRenamed={handleRenamed}
          onDeleted={handleDeleted}
        />

        <div className="workspace">
          <Topbar
            breadcrumb={breadcrumb}
            onMobileMenu={() => setMobSidebarOpen((value) => !value)}
            onGraphView={handleGraphView}
            onSplitToggle={handleSplitToggle}
            activeView={effectiveLayout}
            splitDisabled={isMobile}
          />

          <div className="stage">
            {effectiveLayout === 'graph' && (
              <GraphView
                onUnauthorized={onUnauthorized}
                onOpenNode={handleOpenNode}
                refreshKey={graphRefreshKey}
              />
            )}
            {effectiveLayout === 'editor' && editorPane}
            {effectiveLayout === 'split' && (
              <SplitPane
                storageKey="sn-split-ratio"
                left={(
                  <GraphView
                    onUnauthorized={onUnauthorized}
                    onOpenNode={handleOpenNode}
                    refreshKey={graphRefreshKey}
                  />
                )}
                right={editorPane}
              />
            )}
          </div>
        </div>
      </div>

      <div
        className={`mob-overlay${mobSidebarOpen ? ' active' : ''}`}
        onClick={() => setMobSidebarOpen(false)}
      />
    </>
  );
}
