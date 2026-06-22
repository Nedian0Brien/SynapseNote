import { View, ViewLayout } from '@/application/types';

export type SynapseGraphNode = {
  id: string;
  name: string;
  title: string;
  path: string;
  type: 'Directory' | 'Document';
  directory: string | null;
  layout?: ViewLayout;
  searchTitle: string;
};

export type SynapseGraphEdge = {
  source: string;
  target: string;
  edge_type: 'directory' | 'wikilink' | 'reference';
};

export type SynapseGraphData = {
  nodes: SynapseGraphNode[];
  edges: SynapseGraphEdge[];
  stats: {
    nodes: number;
    edges: number;
  };
};

export function outlineToGraph(outline: View[] | undefined, extraEdges: SynapseGraphEdge[] = []): SynapseGraphData {
  const nodes: SynapseGraphNode[] = [];
  const edges: SynapseGraphEdge[] = [];
  const seen = new Set<string>();

  const visit = (view: View, parent?: View, path: string[] = []) => {
    if (!view?.view_id || seen.has(view.view_id)) return;

    seen.add(view.view_id);

    const children = view.children ?? [];
    const title = view.name || 'Untitled';
    const nextPath = [...path, title];

    nodes.push({
      id: view.view_id,
      name: title,
      title,
      path: nextPath.join('/'),
      type: children.length ? 'Directory' : 'Document',
      directory: path.length ? path.join('/') : null,
      layout: view.layout,
      searchTitle: title.toLowerCase(),
    });

    if (parent?.view_id) {
      edges.push({
        source: parent.view_id,
        target: view.view_id,
        edge_type: 'directory',
      });
    }

    children.forEach((child) => visit(child, view, nextPath));
  };

  (outline ?? []).forEach((view) => visit(view));
  edges.push(...dedupeExtraEdges(extraEdges, seen));

  return {
    nodes,
    edges,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
    },
  };
}

function dedupeExtraEdges(edges: SynapseGraphEdge[], nodeIds: Set<string>) {
  const seenEdges = new Set<string>();

  return edges.filter((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false;

    const key = `${edge.source}\u0000${edge.target}\u0000${edge.edge_type}`;
    if (seenEdges.has(key)) return false;

    seenEdges.add(key);
    return true;
  });
}
