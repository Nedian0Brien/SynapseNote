import { useState, useEffect, useCallback } from 'react';

function normalizeGraphNode(node) {
  const id = String(node.id ?? '');
  const fallbackName = node.title
    ?? node.name
    ?? id.split('/').pop()?.replace(/\.md$/, '')
    ?? id;
  const parentPath = id && id.includes('/') ? id.split('/').slice(0, -1).join('/') : '';

  return {
    ...node,
    id,
    title: node.title ?? fallbackName,
    name: node.name ?? fallbackName,
    path: node.path ?? id,
    directory: node.directory ?? (parentPath || null),
  };
}

/**
 * /api/graph 데이터를 가져오는 훅.
 * 서버에서 spring_layout x/y 좌표가 포함된 노드와 edge_type이 포함된 엣지를 반환한다.
 */
export function useGraph({ onUnauthorized, refreshKey } = {}) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/graph', { credentials: 'include' });
      if (res.status === 401) { onUnauthorized?.(); return; }
      if (!res.ok) throw new Error(`graph fetch failed: ${res.status}`);
      const json = await res.json();
      const payload = json.data ?? json;
      setNodes((payload.nodes ?? []).map(normalizeGraphNode));
      setEdges(payload.edges ?? []);
      setStats(payload.stats ?? null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => { fetchGraph(); }, [fetchGraph, refreshKey]);

  return { nodes, edges, stats, loading, error, refetch: fetchGraph };
}
