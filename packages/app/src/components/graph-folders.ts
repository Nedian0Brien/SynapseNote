import type { GraphLink, GraphNode } from './graph-view-utils';
import { resolveGraphLinkEndpointId } from './graph-view-utils';

/**
 * Directories, promoted to nodes of the graph itself.
 *
 * The graph used to draw folders as translucent regions behind the nodes, which
 * was backwards: a region only means something if its members are already
 * sitting together, and nothing in a force layout puts them there. A directory
 * node fixes the cause instead — every page it holds is tied to it by a graph
 * spring, so the layout gathers the folder for us and the separation you see
 * is the one the simulation actually found.
 *
 * Nothing here needs the server. A doc name IS its path, so membership is a
 * string operation on data the client already has.
 */

// Folders to Graph uses the vault-relative folder path with a leading slash.
// Keeping the same id scheme also keeps deterministic force initialization in
// the same node order as the reference graph.
export const GRAPH_FOLDER_NODE_PREFIX = '/';

export function graphFolderNodeId(path: string): string {
  return `${GRAPH_FOLDER_NODE_PREFIX}${path}`;
}

/** The directory a doc sits in, or `null` when it sits at the project root. */
export function graphFolderPathOf(docName: string): string | null {
  // Folders to Graph drops the absolute-path marker before deriving its folder
  // hierarchy. Without this normalization the ancestor chain is `/home/...`
  // but the leaf is inserted again as a distinct `//home/...` node.
  const comparable = docName.startsWith('/') ? docName.slice(1) : docName;
  const index = comparable.lastIndexOf('/');
  return index > 0 ? comparable.slice(0, index) : null;
}

/**
 * How many folders a page sits under: `README` is 0, `docs/Intro` is 1,
 * `packages/app/src/Foo` is 3.
 *
 * This is the page's OWN place in the tree, which is not the same as the depth
 * of the territory it belongs to — territories stop at depth 2, so everything
 * below that shares one region and would otherwise reveal all at once. Keying
 * the label reveal on this instead lets the descent keep going: shallow pages
 * name themselves first and each level of nesting waits its turn.
 */
export function graphFolderDepthOf(docName: string): number {
  const path = graphFolderPathOf(docName);
  if (path === null) return 0;
  return path.split('/').filter((segment) => segment !== '').length;
}

/** `'a/b/c'` → `['a', 'a/b', 'a/b/c']`. */
function ancestorPaths(path: string): string[] {
  const paths: string[] = [];
  let prefix = '';
  for (const segment of path.split('/')) {
    if (segment === '') continue;
    prefix = prefix === '' ? segment : `${prefix}/${segment}`;
    paths.push(prefix);
  }
  return paths;
}

interface FolderTreeEntry {
  path: string;
  directDocIds: string[];
  childPaths: Set<string>;
}

export interface GraphFolderOptions {
  /**
   * Vault-relative folder paths whose folder nodes and containment edges are
   * omitted. Files below them remain in the graph, matching Folders to Graph's
   * exclude mode with “hide files” disabled.
   */
  excludedPaths?: readonly string[];
}

function normalizeFolderPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function isPathCovered(path: string, exclusions: readonly string[]): boolean {
  return exclusions.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

/**
 * Containment is marked on the link rather than inferred from its endpoints.
 * The leading slash identifies folder nodes today, but the semantic mark keeps
 * rendering and degree logic independent from an id convention.
 */
export function isGraphFolderLink(link: { kind?: unknown }): boolean {
  return link.kind === 'containment';
}

/**
 * Folder nodes and containment edges for a set of graph nodes.
 *
 * Run this AFTER filtering. Containment edges would otherwise defeat the orphan
 * filter (nothing is an orphan once it has a parent) and the folders would be
 * those of the unfiltered graph rather than of what is on screen.
 */
export function buildGraphFolderNodes(
  nodes: readonly GraphNode[],
  links: readonly GraphLink[],
  options: GraphFolderOptions = {},
): { nodes: GraphNode[]; links: GraphLink[] } {
  const excludedPaths = [...new Set((options.excludedPaths ?? []).map(normalizeFolderPath))].filter(
    Boolean,
  );
  const folders = new Map<string, FolderTreeEntry>();

  const ensure = (path: string): FolderTreeEntry => {
    const existing = folders.get(path);
    if (existing) return existing;
    const created: FolderTreeEntry = { path, directDocIds: [], childPaths: new Set() };
    folders.set(path, created);
    return created;
  };

  for (const node of nodes) {
    if (node.kind !== 'doc') continue;
    const folderPath = graphFolderPathOf(node.docName);
    if (folderPath === null) continue;
    if (isPathCovered(folderPath, excludedPaths)) continue;
    const chain = ancestorPaths(folderPath);
    for (const [index, path] of chain.entries()) {
      ensure(path);
      if (index > 0) ensure(chain[index - 1]).childPaths.add(path);
    }
    ensure(folderPath).directDocIds.push(node.id);
  }

  // Keep the complete folder hierarchy. Folders to Graph injects every
  // directory into Obsidian's ordinary graph simulation; compressing
  // single-child chains changes both the topology and the forces acting on
  // their descendants.
  const keptPaths = new Set(folders.keys());

  const nearestKeptAncestor = (path: string): string | null => {
    const chain = ancestorPaths(path);
    // `chain` ends with `path` itself, which is never its own ancestor.
    for (let index = chain.length - 2; index >= 0; index -= 1) {
      if (keptPaths.has(chain[index])) return chain[index];
    }
    return null;
  };

  // Folder nodes always remain distinct from notes. Obsidian identifies a
  // folder as `/notes` and a note as `notes`, even when `notes.md` sits beside
  // `notes/`; merging them changes both the topology and the force order.
  const nodeIdForPath = graphFolderNodeId;

  // Folders to Graph stores links as keys on the source node. An exact
  // source→target match is overwritten by containment, while the reverse edge
  // remains a separate authored link.
  const authoredPairs = new Set<string>();
  for (const link of links) {
    const source = resolveGraphLinkEndpointId(link.source);
    const target = resolveGraphLinkEndpointId(link.target);
    if (source === null || target === null) continue;
    authoredPairs.add(`${source}\n${target}`);
  }

  const pending: Array<{ parentPath: string; parentId: string; childId: string }> = [];
  const connected = new Set<string>();

  const connect = (parentPath: string, childId: string): void => {
    const parentId = nodeIdForPath(parentPath);
    if (parentId === childId) return;
    const key = `${parentId}\n${childId}`;
    // Multiple synthesis routes must still emit one membership edge.
    if (connected.has(key)) return;
    connected.add(key);
    // An authored link with the exact same direction already occupies this key
    // in Obsidian's node-link object, so containment overwrites rather than
    // doubles it.
    if (authoredPairs.has(key)) return;
    pending.push({ parentPath, parentId, childId });
  };

  // With subtree weighting enabled, Folders to Graph adds every indirect
  // visible descendant to the folder's ordinary direct-link weight. The result
  // is the full visible subtree size, not merely the number of direct members.
  const subtreeCounts = new Map<string, number>();
  const countSubtree = (path: string): number => {
    const cached = subtreeCounts.get(path);
    if (cached !== undefined) return cached;
    const entry = folders.get(path);
    if (!entry) return 0;
    let count = entry.directDocIds.length;
    for (const childPath of entry.childPaths) {
      if (!keptPaths.has(childPath)) continue;
      count += 1 + countSubtree(childPath);
    }
    subtreeCounts.set(path, count);
    return count;
  };
  for (const path of keptPaths) countSubtree(path);

  // The plugin walks folder nodes in insertion order and writes child-folder
  // edges before direct file memberships. The edge sequence feeds the link
  // force, so preserving it is part of deterministic layout parity.
  for (const path of keptPaths) {
    const entry = folders.get(path);
    for (const childPath of entry?.childPaths ?? []) {
      if (keptPaths.has(childPath)) connect(path, nodeIdForPath(childPath));
    }
    for (const docId of entry?.directDocIds ?? []) {
      connect(path, docId);
    }
  }

  // Deliberately no synthetic project-root node. The reference Folders to
  // Graph setup hides `/`, leaving top-level folders and root-level pages free
  // to form islands through authored links instead of forcing the entire vault
  // into one radial tree.

  // Emitted last, once every membership is counted: the layout reads the count
  // off the link, for anything that wants to know how big a folder is.
  const folderLinks: GraphLink[] = pending.map(({ parentPath, parentId, childId }) => ({
    source: parentId,
    target: childId,
    kind: 'containment',
    memberCount: subtreeCounts.get(parentPath) ?? 1,
  }));

  const folderNodes: GraphNode[] = [];
  for (const path of keptPaths) {
    const parent = nearestKeptAncestor(path);
    folderNodes.push({
      kind: 'folder',
      id: graphFolderNodeId(path),
      // Relative to the folder drawn above it, so a compressed chain reads as
      // `docs/archive` while a plain child reads as just `archive`.
      label: parent === null ? path : path.slice(parent.length + 1),
      path,
      memberCount: subtreeCounts.get(path) ?? 0,
      // Obsidian initializes injected folder nodes at the origin too. Leaving
      // these undefined makes d3 place only folders on its fallback spiral.
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    } as GraphNode);
  }

  return { nodes: folderNodes, links: folderLinks };
}
