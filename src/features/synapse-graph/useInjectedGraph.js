import { useCallback, useEffect, useState } from 'react';

export function useInjectedGraph({ graphData, refreshKey } = {}) {
  const [snapshot, setSnapshot] = useState(() => normalizeGraph(graphData));

  const refetch = useCallback(() => {
    setSnapshot(normalizeGraph(graphData));
  }, [graphData]);

  useEffect(() => {
    refetch();
  }, [refetch, refreshKey]);

  return {
    ...snapshot,
    loading: false,
    error: null,
    refetch,
  };
}

function normalizeGraph(graphData) {
  const nodes = (graphData?.nodes ?? []).map(normalizeGraphNode);
  const edges = graphData?.edges ?? [];

  return {
    nodes,
    edges,
    stats: graphData?.stats ?? {
      nodes: nodes.length,
      edges: edges.length,
    },
  };
}

function normalizeGraphNode(node) {
  const id = String(node.id ?? '');
  const fallbackName = node.title
    ?? node.name
    ?? id.split('/').pop()
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
