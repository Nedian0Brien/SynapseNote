import type { GraphLink, GraphNode } from './graph-view-utils';
import { resolveGraphLinkEndpointId } from './graph-view-utils';

/**
 * Directories, promoted to nodes of the graph itself.
 *
 * The graph used to draw folders as translucent regions behind the nodes, which
 * was backwards: a region only means something if its members are already
 * sitting together, and nothing in a force layout puts them there. A directory
 * node fixes the cause instead — every page it holds is tied to it by a short,
 * stiff spring, so the layout gathers the folder for us and the separation you
 * see is the one the simulation actually found.
 *
 * Nothing here needs the server. A doc name IS its path, so membership is a
 * string operation on data the client already has.
 */

export const GRAPH_FOLDER_NODE_PREFIX = 'folder:';

export function graphFolderNodeId(path: string): string {
  return `${GRAPH_FOLDER_NODE_PREFIX}${path}`;
}

/** The directory a doc sits in, or `null` when it sits at the project root. */
export function graphFolderPathOf(docName: string): string | null {
  const index = docName.lastIndexOf('/');
  return index > 0 ? docName.slice(0, index) : null;
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

/**
 * Containment is marked on the link rather than inferred from its endpoints: a
 * folder that has a page of the same name hangs its members off THAT page (see
 * below), so neither end carries the `folder:` prefix.
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
): { nodes: GraphNode[]; links: GraphLink[] } {
  const existingIds = new Set(nodes.map((node) => node.id));
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

  // A page whose name IS the folder path (`notes.md` beside `notes/`) already
  // holds that id. Hang the members off that page instead of drawing a second
  // node for the same place — which is exactly what a folder note is.
  const nodeIdForPath = (path: string): string =>
    existingIds.has(path) ? path : graphFolderNodeId(path);

  // Keys are newline-separated because a doc name may contain spaces, and
  // `a b` + `c` must not collide with `a` + `b c`.
  const authoredPairs = new Set<string>();
  for (const link of links) {
    const source = resolveGraphLinkEndpointId(link.source);
    const target = resolveGraphLinkEndpointId(link.target);
    if (source === null || target === null) continue;
    authoredPairs.add(`${source}\n${target}`);
    authoredPairs.add(`${target}\n${source}`);
  }

  const pending: Array<{ parentPath: string; parentId: string; childId: string }> = [];
  const memberCounts = new Map<string, number>();
  const connected = new Set<string>();

  const connect = (parentPath: string, childId: string): void => {
    const parentId = nodeIdForPath(parentPath);
    if (parentId === childId) return;
    const key = `${parentId}\n${childId}`;
    // A folder note reaches its parent by both routes at once — as a page of
    // that folder and as the folder below it. It is one membership either way.
    if (connected.has(key)) return;
    connected.add(key);
    // Counted whether or not the edge is drawn: it is still a member, and the
    // count is what sizes the folder.
    memberCounts.set(parentPath, (memberCounts.get(parentPath) ?? 0) + 1);
    // An authored link already joins these two. Drawing containment on top of it
    // would double the edge and double the spring.
    if (authoredPairs.has(key)) return;
    pending.push({ parentPath, parentId, childId });
  };

  for (const path of keptPaths) {
    for (const docId of folders.get(path)?.directDocIds ?? []) {
      connect(path, docId);
    }
  }
  for (const path of keptPaths) {
    const parent = nearestKeptAncestor(path);
    if (parent !== null) connect(parent, nodeIdForPath(path));
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
    memberCount: memberCounts.get(parentPath) ?? 1,
  }));

  const folderNodes: GraphNode[] = [];
  for (const path of [...keptPaths].sort()) {
    if (existingIds.has(path)) continue;
    const parent = nearestKeptAncestor(path);
    folderNodes.push({
      kind: 'folder',
      id: graphFolderNodeId(path),
      // Relative to the folder drawn above it, so a compressed chain reads as
      // `docs/archive` while a plain child reads as just `archive`.
      label: parent === null ? path : path.slice(parent.length + 1),
      path,
      memberCount: memberCounts.get(path) ?? 0,
    });
  }

  return { nodes: folderNodes, links: folderLinks };
}
