import { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { GraphView } from './GraphView';
import { EditorView } from '../editor/EditorView';

export function Shell({ onUnauthorized }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobSidebarOpen, setMobSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState('graph');
  const [activeNodeId, setActiveNodeId] = useState(null);

  const handleSelectNode = useCallback((path) => {
    setActiveNodeId(path);
    setActiveView('editor');
    setMobSidebarOpen(false);
  }, []);

  const handleBackToGraph = useCallback(() => {
    setActiveView('graph');
    setActiveNodeId(null);
  }, []);

  const handleWikilinkNavigate = useCallback(async (target) => {
    try {
      const normalizedTarget = target.trim().replace(/\.md$/, '').toLowerCase();
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
      const nodes = json.data ?? [];
      const match = nodes.find((node) => {
        if (node.type !== 'Document') return false;
        const nodeId = String(node.id || '').toLowerCase();
        const title = String(node.title || '').toLowerCase();
        const stem = nodeId.split('/').pop()?.replace(/\.md$/, '') ?? '';
        return nodeId === target.toLowerCase()
          || title === normalizedTarget
          || stem === normalizedTarget;
      });
      if (match?.id) handleSelectNode(match.id);
    } catch {
      // ignore
    }
  }, [handleSelectNode, onUnauthorized]);

  const breadcrumb = activeView === 'graph'
    ? ['SynapseNote', 'Graph View']
    : ['SynapseNote', activeNodeId?.split('/').pop()?.replace(/\.md$/, '') ?? 'Editor'];

  return (
    <>
      <div className="app">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(c => !c)}
          onSelectNode={handleSelectNode}
          activeNodeId={activeNodeId}
          onUnauthorized={onUnauthorized}
        />

        <div className="workspace">
          <Topbar
            breadcrumb={breadcrumb}
            onMobileMenu={() => setMobSidebarOpen(o => !o)}
            onGraphView={handleBackToGraph}
            activeView={activeView}
          />

          <div className="stage">
            {activeView === 'graph' && (
              <GraphView
                onUnauthorized={onUnauthorized}
                onOpenNode={handleSelectNode}
              />
            )}
            {activeView === 'editor' && activeNodeId && (
              <EditorView
                path={activeNodeId}
                onUnauthorized={onUnauthorized}
                onNavigate={handleWikilinkNavigate}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      <div
        className={`mob-overlay${mobSidebarOpen ? ' active' : ''}`}
        onClick={() => setMobSidebarOpen(false)}
      />
    </>
  );
}
