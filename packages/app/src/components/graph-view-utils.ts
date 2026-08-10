import { hashFromDocName } from '@/lib/doc-hash';

interface DocGraphNode {
  kind: 'doc';
  id: string;
  label: string;
  docName: string;
  anchor: string | null;
  cluster?: string | null;
  category?: string | null;
  tags?: string[] | null;
}

interface ExternalGraphNode {
  kind: 'external';
  id: string;
  label: string;
  url: string;
}

/**
 * Synthesized client-side from frontmatter tags — the server's link graph has
 * no notion of one. It carries no navigation target: a tag is a facet of pages,
 * not a page, so clicking one selects it but never routes anywhere.
 */
interface TagGraphNode {
  kind: 'tag';
  id: string;
  label: string;
  tag: string;
}

export type GraphNode = DocGraphNode | ExternalGraphNode | TagGraphNode;

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Intentionally a separate type from `TargetDisplayState` in target-navigation-intent.ts,
// which is not exported. The two types are identical in shape but belong to different
// layers — keep them decoupled so graph-view-utils has no dependency on the navigation layer.
export type GraphDocDisplayState = 'doc' | 'folder' | 'missing';

type GraphNodePhysicsKey =
  | 'x'
  | 'y'
  | 'z'
  | 'vx'
  | 'vy'
  | 'vz'
  | 'fx'
  | 'fy'
  | 'fz'
  | 'index'
  | '__indexColor';

type MutableGraphNode = GraphNode & Partial<Record<GraphNodePhysicsKey, number | string | null>>;
type MutableGraphLink = GraphLink & {
  source: unknown;
  target: unknown;
  __indexColor?: string;
};

type GraphDocSelection = Pick<DocGraphNode, 'docName' | 'label' | 'anchor'>;
export type GraphNodeSelection =
  | ({
      kind: 'doc';
    } & Pick<DocGraphNode, 'id' | 'docName' | 'label' | 'anchor'>)
  | ({
      kind: 'external';
    } & Pick<ExternalGraphNode, 'id' | 'label' | 'url'>)
  | ({
      kind: 'tag';
    } & Pick<TagGraphNode, 'id' | 'label' | 'tag'>);

export type GraphDocClickBehavior = 'navigate' | 'select';
/**
 * Which graph a view is showing. `local` is the 2-hop neighborhood around the
 * active document (the right rail); `global` is the whole project (the content
 * surface). The two differ in what they fetch and how far out they read, not
 * just in size, so callers name the intent rather than a pixel state.
 */
export type GraphScope = 'local' | 'global';
export type GraphNodeVisualState =
  | 'default'
  | 'active'
  | 'selected'
  | 'active-selected'
  | 'external-selected'
  | 'external'
  | 'tag'
  | 'tag-selected';

const DEFAULT_GRAPH_NODE_RADIUS = 5;
const SELECTED_GRAPH_NODE_RADIUS = 7;
const ACTIVE_GRAPH_NODE_RADIUS = 8;
const GRAPH_NODE_PHYSICS_KEYS = [
  'x',
  'y',
  'z',
  'vx',
  'vy',
  'vz',
  'fx',
  'fy',
  'fz',
  'index',
  '__indexColor',
] as const satisfies readonly GraphNodePhysicsKey[];

type GraphNodeClickAction =
  | { kind: 'external'; url: string }
  | { kind: 'navigate'; hash: string }
  | { kind: 'select'; selection: GraphNodeSelection }
  // A tag node clicked in `navigate` mode: there is nothing to navigate to.
  | { kind: 'none' };

function copyGraphNodePhysics(nextNode: MutableGraphNode, prevNode: MutableGraphNode): void {
  for (const key of GRAPH_NODE_PHYSICS_KEYS) {
    const value = prevNode[key];
    if (value !== undefined) {
      nextNode[key] = value;
    }
  }
}

export function getGraphLinkEndpointId(endpoint: unknown): string {
  if (typeof endpoint === 'string') return endpoint;
  if (endpoint !== null && typeof endpoint === 'object' && 'id' in endpoint) {
    return String((endpoint as { id: unknown }).id);
  }
  return '';
}

/**
 * Endpoint id as `string | null`, for callers that must distinguish "no id" from
 * an id that happens to stringify. `getGraphLinkEndpointId` collapses both to
 * `''` because its callers build signature keys, where the distinction is moot.
 */
export function resolveGraphLinkEndpointId(endpoint: unknown): string | null {
  if (typeof endpoint === 'string') return endpoint;
  if (endpoint === null || typeof endpoint !== 'object' || !('id' in endpoint)) return null;
  const { id } = endpoint as { id: unknown };
  if (typeof id === 'string') return id;
  if (typeof id === 'number') return String(id);
  return null;
}

/**
 * Undirected degree per node id. Both endpoints of every link count, so a
 * node's degree is its total edge count regardless of direction — which is
 * what both the label-placement ranking and the orphan filter want.
 */
export function buildGraphDegreeMap(
  links: ReadonlyArray<{ source: unknown; target: unknown }>,
): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const link of links) {
    for (const endpoint of [link.source, link.target]) {
      const id = resolveGraphLinkEndpointId(endpoint);
      if (id === null) continue;
      degrees.set(id, (degrees.get(id) ?? 0) + 1);
    }
  }
  return degrees;
}

export function buildGraphNodeSignature(nodes: GraphNode[]): string {
  return nodes.map((node) => `${node.id}:${node.label}`).join(',');
}

export function buildGraphLinkSignature(links: GraphLink[]): string {
  return links
    .map((link) => `${getGraphLinkEndpointId(link.source)}>${getGraphLinkEndpointId(link.target)}`)
    .join(',');
}

export function reconcileGraphData(previous: GraphData, next: GraphData): GraphData {
  const previousNodesById = new Map(
    (previous.nodes as MutableGraphNode[]).map((node) => [node.id, node] as const),
  );
  const nextNodes = next.nodes.map((node) => {
    const mergedNode = { ...node } as MutableGraphNode;
    const previousNode = previousNodesById.get(node.id);
    if (previousNode) {
      copyGraphNodePhysics(mergedNode, previousNode);
    }
    return mergedNode as GraphNode;
  });

  const previousLinksByKey = new Map(
    (previous.links as MutableGraphLink[]).map((link) => [
      `${getGraphLinkEndpointId(link.source)}>${getGraphLinkEndpointId(link.target)}`,
      link,
    ]),
  );
  const nextLinks = next.links.map((link) => {
    const mergedLink = { ...link } as MutableGraphLink;
    const previousLink = previousLinksByKey.get(
      `${getGraphLinkEndpointId(link.source)}>${getGraphLinkEndpointId(link.target)}`,
    );
    // __indexColor is force-graph's internal canvas hit-test identifier.
    // The map is keyed by source>target, so this only copies the color when
    // the exact same endpoint pair reappears — never leaks across different links.
    if (previousLink?.__indexColor) {
      mergedLink.__indexColor = previousLink.__indexColor;
    }
    return mergedLink as GraphLink;
  });

  return {
    nodes: nextNodes,
    links: nextLinks,
  };
}

export function getGraphNodeTooltipLabel(
  node: GraphNode,
  options: {
    displayState?: GraphDocDisplayState;
  } = {},
): string {
  if (node.kind === 'external') return node.url;
  if (node.kind === 'tag') return `#${node.tag}`;

  const title = node.label ?? node.id;
  const displayState = options.displayState ?? 'doc';
  const hasMetadata = node.cluster || node.category || (node.tags && node.tags.length > 0);
  if (displayState === 'doc' && !hasMetadata) return title;

  const lines: string[] = [
    ...getGraphNodeTooltipStatusLines(displayState),
    `<div style="font-weight:600;font-size:14px;color:#f1f5f9;margin-bottom:${hasMetadata ? 8 : 0}px;padding-bottom:${hasMetadata ? 6 : 0}px;border-bottom:${hasMetadata ? '1px solid rgba(148,163,184,0.3)' : 'none'}">${escapeHtml(title)}</div>`,
  ];

  if (node.cluster) {
    lines.push(
      `<div style="font-size:12.5px;color:#f1f5f9;margin-bottom:2px"><span style="color:#cbd5e1">cluster:</span> ${escapeHtml(node.cluster)}</div>`,
    );
  }
  if (node.category) {
    lines.push(
      `<div style="font-size:12.5px;color:#f1f5f9;margin-bottom:2px"><span style="color:#cbd5e1">category:</span> ${escapeHtml(node.category)}</div>`,
    );
  }
  if (node.tags && node.tags.length > 0) {
    lines.push(
      `<div style="font-size:12.5px;color:#f1f5f9"><span style="color:#cbd5e1">tags:</span> ${node.tags.map(escapeHtml).join(', ')}</div>`,
    );
  }

  return lines.join('');
}

function getGraphNodeTooltipStatusLines(displayState: GraphDocDisplayState): string[] {
  if (displayState === 'missing') {
    return [
      '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#fca5a5;margin-bottom:6px">Broken / uncreated link</div>',
      '<div style="font-size:12px;color:#fecaca;margin-bottom:8px">This page does not exist yet. Open it to create it.</div>',
    ];
  }
  if (displayState === 'folder') {
    return [
      '<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#c4b5fd;margin-bottom:6px">Folder target</div>',
      '<div style="font-size:12px;color:#ddd6fe;margin-bottom:8px">This link resolves to a folder view rather than a standalone page.</div>',
    ];
  }
  return [];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getGraphNodeVisualState(
  node: GraphNode,
  {
    activeDocName,
    selectedNodeId,
  }: {
    activeDocName: string;
    selectedNodeId: string | null;
  },
): GraphNodeVisualState {
  const isSelected = selectedNodeId !== null && node.id === selectedNodeId;

  if (node.kind === 'external') {
    return isSelected ? 'external-selected' : 'external';
  }

  if (node.kind === 'tag') {
    return isSelected ? 'tag-selected' : 'tag';
  }

  const isActive = node.docName === activeDocName;

  if (isActive && isSelected) {
    return 'active-selected';
  }
  if (isActive) {
    return 'active';
  }
  if (isSelected) {
    return 'selected';
  }
  return 'default';
}

export function getGraphNodeCanvasRadius(state: GraphNodeVisualState): number {
  if (state === 'active' || state === 'active-selected') {
    return ACTIVE_GRAPH_NODE_RADIUS;
  }
  if (state === 'selected' || state === 'external-selected' || state === 'tag-selected') {
    return SELECTED_GRAPH_NODE_RADIUS;
  }
  return DEFAULT_GRAPH_NODE_RADIUS;
}

/**
 * A screen-space offset converted to graph units, capped.
 *
 * `px / globalScale` is the right conversion, but it is unbounded: zoomed out
 * to 0.05 a 2px ring becomes 40 graph units, and a radius-5 node paints as a
 * radius-45 blob. The cap keeps the ring hugging the node at every zoom, at the
 * cost of it thinning below a couple of pixels when very far out — which is
 * where it should be invisible anyway.
 */
export function screenOffsetInGraphUnits(
  pixels: number,
  globalScale: number,
  baseRadius: number,
): number {
  return Math.min(pixels / Math.max(globalScale, 0.01), baseRadius * 0.6);
}

export function getGraphNodePointerRadius(
  state: GraphNodeVisualState,
  globalScale: number,
): number {
  const baseRadius = getGraphNodeCanvasRadius(state);
  if (
    state === 'active' ||
    state === 'selected' ||
    state === 'active-selected' ||
    state === 'external-selected' ||
    state === 'tag-selected'
  ) {
    return baseRadius + screenOffsetInGraphUnits(2, globalScale, baseRadius);
  }
  return baseRadius;
}

export function getHashForGraphDocSelection(selection: GraphDocSelection): string {
  return hashFromDocName(selection.docName, selection.anchor);
}

export function resolveGraphNodeClickAction(
  node: GraphNode,
  docClickBehavior: GraphDocClickBehavior,
): GraphNodeClickAction {
  if (node.kind === 'external') {
    if (docClickBehavior === 'select') {
      return {
        kind: 'select',
        selection: {
          kind: 'external',
          id: node.id,
          label: node.label,
          url: node.url,
        },
      };
    }
    return { kind: 'external', url: node.url };
  }

  if (node.kind === 'tag') {
    if (docClickBehavior === 'select') {
      return {
        kind: 'select',
        selection: { kind: 'tag', id: node.id, label: node.label, tag: node.tag },
      };
    }
    return { kind: 'none' };
  }

  if (docClickBehavior === 'select') {
    return {
      kind: 'select',
      selection: {
        kind: 'doc',
        id: node.id,
        docName: node.docName,
        label: node.label,
        anchor: node.anchor ?? null,
      },
    };
  }

  return {
    kind: 'navigate',
    hash: getHashForGraphDocSelection({
      docName: node.docName,
      label: node.label,
      anchor: node.anchor ?? null,
    }),
  };
}
