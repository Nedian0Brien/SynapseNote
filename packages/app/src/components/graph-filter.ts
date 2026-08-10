import type { GraphFilterSettings } from '@/lib/graph-settings-store';
import {
  buildGraphDegreeMap,
  type GraphData,
  type GraphDocDisplayState,
  type GraphLink,
  type GraphNode,
  resolveGraphLinkEndpointId,
} from './graph-view-utils';

/**
 * Node id namespace for synthesized tag nodes, mirroring the server's
 * `external:` prefix for URL nodes. Synthesis skips a tag whose id would
 * collide with a real node rather than shadowing it.
 */
export const GRAPH_TAG_NODE_PREFIX = 'tag:';

export function graphTagNodeId(tag: string): string {
  return `${GRAPH_TAG_NODE_PREFIX}${tag}`;
}

/**
 * The query language is deliberately a small subset of Obsidian's: whitespace
 * splits terms, every term must match (AND), matching is case-insensitive
 * substring, `-term` negates, and `tag:term` restricts a term to the node's
 * frontmatter tags. There is no OR, no grouping, no path:/file: scoping, and no
 * quoting — a term containing a space cannot be expressed.
 */
export function matchesGraphQuery(node: GraphNode, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const tags = (
    node.kind === 'doc' ? (node.tags ?? []) : node.kind === 'tag' ? [node.tag] : []
  ).map((tag) => tag.toLowerCase());
  const haystack = [
    node.label,
    node.kind === 'doc'
      ? node.docName
      : node.kind === 'external'
        ? node.url
        : node.kind === 'folder'
          ? node.path
          : node.tag,
    ...tags,
  ]
    .join('\n')
    .toLowerCase();

  for (const term of terms) {
    const negated = term.startsWith('-');
    const bare = negated ? term.slice(1) : term;
    // A lone `-` carries no term to test; treat it as noise rather than as a
    // negation of the empty string (which would match everything and hide all).
    if (bare === '') continue;

    const matched = bare.startsWith('tag:')
      ? tags.some((tag) => tag.includes(bare.slice('tag:'.length)))
      : haystack.includes(bare);

    if (matched === negated) return false;
  }

  return true;
}

function buildTagNodes(nodes: GraphNode[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const existingIds = new Set(nodes.map((node) => node.id));
  const tagNodesByTag = new Map<string, GraphNode>();
  const links: GraphLink[] = [];

  for (const node of nodes) {
    if (node.kind !== 'doc' || !node.tags) continue;
    for (const tag of node.tags) {
      if (tag === '') continue;
      const id = graphTagNodeId(tag);
      // A real page whose id already occupies this slot wins; shadowing it
      // would make the doc unreachable in the graph.
      if (existingIds.has(id)) continue;
      if (!tagNodesByTag.has(tag)) {
        tagNodesByTag.set(tag, { kind: 'tag', id, label: `#${tag}`, tag });
      }
      links.push({ source: node.id, target: id });
    }
  }

  return { nodes: [...tagNodesByTag.values()], links };
}

export interface GraphFilterInput {
  data: GraphData;
  filters: GraphFilterSettings;
  activeDocName: string;
  /** Injected so this module stays independent of the navigation-resolution layer. */
  getDisplayState: (node: GraphNode) => GraphDocDisplayState;
}

/**
 * Reduces the fetched graph to what the user asked to see.
 *
 * Order matters: tag nodes are synthesized first so they can be searched and
 * counted like any other node, kind/state filters run before the query so a
 * query never resurrects a node the user switched off, and the orphan pass runs
 * last because earlier passes are what strand nodes in the first place.
 *
 * The active document is always kept, whatever the filters say. Obsidian will
 * happily filter the current note out of its own local graph; here that reads
 * as a broken panel, since the docked view exists to show where *this* page
 * sits. Its links are still subject to the same pruning, so it can end up alone.
 */
export function applyGraphFilters({
  data,
  filters,
  activeDocName,
  getDisplayState,
}: GraphFilterInput): GraphData {
  const tagAdditions = filters.showTagNodes
    ? buildTagNodes(data.nodes)
    : { nodes: [], links: [] as GraphLink[] };

  const nodes = [...data.nodes, ...tagAdditions.nodes];
  const links = [...data.links, ...tagAdditions.links];

  const isActive = (node: GraphNode) => node.kind === 'doc' && node.docName === activeDocName;

  const kept = nodes.filter((node) => {
    if (isActive(node)) return true;
    if (node.kind === 'external' && !filters.showExternalNodes) return false;
    if (node.kind === 'doc' && !filters.showMissingNodes && getDisplayState(node) === 'missing') {
      return false;
    }
    return matchesGraphQuery(node, filters.query);
  });

  const keptIds = new Set(kept.map((node) => node.id));
  const keptLinks = links.filter((link) => {
    const source = resolveGraphLinkEndpointId(link.source);
    const target = resolveGraphLinkEndpointId(link.target);
    return source !== null && target !== null && keptIds.has(source) && keptIds.has(target);
  });

  if (filters.showOrphans) {
    return { nodes: kept, links: keptLinks };
  }

  // Degree is computed over the SURVIVING links, so a node whose only partner
  // was filtered out counts as an orphan here even though the unfiltered graph
  // gave it an edge. Dropping the orphans cannot strand a link — they have none
  // by definition — so `keptLinks` carries through unchanged.
  const degrees = buildGraphDegreeMap(keptLinks);
  return {
    nodes: kept.filter((node) => isActive(node) || (degrees.get(node.id) ?? 0) > 0),
    links: keptLinks,
  };
}
