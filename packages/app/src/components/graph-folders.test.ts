import { describe, expect, test } from 'bun:test';
import {
  buildGraphFolderNodes,
  GRAPH_FOLDER_NODE_PREFIX,
  getGraphFolderChargeMultiplier,
  getGraphFolderMemberCount,
  graphFolderNodeId,
  graphFolderPathOf,
  isGraphFolderLink,
} from './graph-folders';
import type { GraphLink, GraphNode } from './graph-view-utils';

function doc(docName: string): GraphNode {
  return {
    kind: 'doc',
    id: docName,
    docName,
    anchor: null,
    label: docName,
    cluster: null,
    category: null,
    tags: null,
  };
}

function build(docNames: string[], links: GraphLink[] = []) {
  return buildGraphFolderNodes(docNames.map(doc), links);
}

/** Every containment edge as `parent>child`, for readable assertions. */
function edges(result: { links: GraphLink[] }): string[] {
  return result.links.map((link) => `${link.source}>${link.target}`).sort();
}

function paths(result: { nodes: GraphNode[] }): string[] {
  return result.nodes.map((node) => (node.kind === 'folder' ? node.path : node.id));
}

describe('graphFolderPathOf', () => {
  test('is the directory a page sits in', () => {
    expect(graphFolderPathOf('notes/projects/A')).toBe('notes/projects');
  });

  test('is null for a page at the project root — there is no folder to draw', () => {
    expect(graphFolderPathOf('README')).toBeNull();
  });

  test('is null for a degenerate leading slash rather than an empty-path folder', () => {
    expect(graphFolderPathOf('/A')).toBeNull();
  });
});

describe('buildGraphFolderNodes', () => {
  test('gives each directory a node and ties its pages to it', () => {
    const result = build(['notes/A', 'notes/B']);
    expect(paths(result)).toEqual(['notes']);
    expect(edges(result)).toEqual(['folder:notes>notes/A', 'folder:notes>notes/B']);
  });

  test('marks every synthesized edge as containment, never as an authored link', () => {
    const result = build(['notes/A']);
    expect(result.links.every(isGraphFolderLink)).toBe(true);
  });

  test('counts direct members, which is what sizes the node', () => {
    const [folder] = build(['notes/A', 'notes/B', 'notes/C']).nodes;
    expect(folder.kind === 'folder' && folder.memberCount).toBe(3);
  });

  test('root-level pages get no folder — a single root hub would just re-merge the graph', () => {
    expect(build(['README', 'CHANGELOG'])).toEqual({ nodes: [], links: [] });
  });

  test('nests folders, so the tree shows as a tree', () => {
    const result = build(['notes/A', 'notes/deep/B']);
    expect(paths(result)).toEqual(['notes', 'notes/deep']);
    expect(edges(result)).toEqual([
      'folder:notes/deep>notes/deep/B',
      'folder:notes>folder:notes/deep',
      'folder:notes>notes/A',
    ]);
  });

  test('labels a child folder by its own segment, not its whole path', () => {
    const child = build(['notes/A', 'notes/deep/B']).nodes.find(
      (node) => node.kind === 'folder' && node.path === 'notes/deep',
    );
    expect(child?.label).toBe('deep');
  });

  test('ignores nodes that are not pages — a tag has no place in the tree', () => {
    const nodes: GraphNode[] = [
      doc('notes/A'),
      { kind: 'tag', id: 'tag:idea', label: '#idea', tag: 'idea' },
      { kind: 'external', id: 'external:https://x.test', url: 'https://x.test', label: 'x' },
    ];
    expect(edges(buildGraphFolderNodes(nodes, []))).toEqual(['folder:notes>notes/A']);
  });
});

describe('buildGraphFolderNodes — path compression', () => {
  test('collapses a chain of single-child folders into one node', () => {
    // `docs/ → archive/ → cleanup/` with pages only at the bottom: the two
    // upper rings hold nothing and separate nothing.
    const result = build(['docs/archive/cleanup/A', 'docs/archive/cleanup/B']);
    expect(paths(result)).toEqual(['docs/archive/cleanup']);
    expect(edges(result)).toEqual([
      'folder:docs/archive/cleanup>docs/archive/cleanup/A',
      'folder:docs/archive/cleanup>docs/archive/cleanup/B',
    ]);
  });

  test('labels a compressed folder with the whole joined path, like a file tree row', () => {
    const [folder] = build(['docs/archive/cleanup/A']).nodes;
    expect(folder.label).toBe('docs/archive/cleanup');
  });

  test('keeps a folder that holds pages of its own, however few', () => {
    const result = build(['docs/Intro', 'docs/archive/cleanup/A']);
    expect(paths(result)).toEqual(['docs', 'docs/archive/cleanup']);
    expect(edges(result)).toContain('folder:docs>folder:docs/archive/cleanup');
  });

  test('keeps a folder that forks, because a fork is what it separates', () => {
    const result = build(['docs/a/A', 'docs/b/B']);
    expect(paths(result)).toEqual(['docs', 'docs/a', 'docs/b']);
  });

  test('re-parents a compressed folder onto its nearest surviving ancestor', () => {
    // `top` forks, so it survives; `top/x` holds only `top/x/y`, so it does not.
    const result = build(['top/a/A', 'top/x/y/B']);
    expect(paths(result)).toEqual(['top', 'top/a', 'top/x/y']);
    expect(edges(result)).toContain('folder:top>folder:top/x/y');
    expect(result.nodes.find((node) => node.id === 'folder:top/x/y')?.label).toBe('x/y');
  });
});

describe('buildGraphFolderNodes — collisions with real pages', () => {
  test('a page named after the folder becomes the folder node — that is a folder note', () => {
    const result = buildGraphFolderNodes([doc('notes'), doc('notes/A')], []);
    // No second node for the same place.
    expect(result.nodes).toEqual([]);
    expect(edges(result)).toEqual(['notes>notes/A']);
  });

  test('the folder-note page is still tied to ITS own parent folder', () => {
    const result = buildGraphFolderNodes([doc('a/b'), doc('a/b/C'), doc('a/D')], []);
    expect(edges(result)).toEqual(['a/b>a/b/C', 'folder:a>a/D', 'folder:a>a/b']);
  });

  test('never links a node to itself', () => {
    const result = buildGraphFolderNodes([doc('notes'), doc('notes/A')], []);
    expect(result.links.every((link) => link.source !== link.target)).toBe(true);
  });
});

describe('buildGraphFolderNodes — authored links win', () => {
  test('skips containment where a real link already joins the pair', () => {
    // Otherwise the pair gets two edges and two springs, and reads as twice as
    // connected as it is.
    const result = buildGraphFolderNodes(
      [doc('notes'), doc('notes/A')],
      [{ source: 'notes', target: 'notes/A' }],
    );
    expect(result.links).toEqual([]);
  });

  test('skips it in either direction', () => {
    const result = buildGraphFolderNodes(
      [doc('notes'), doc('notes/A')],
      [{ source: 'notes/A', target: 'notes' }],
    );
    expect(result.links).toEqual([]);
  });

  test('still counts the member, so the folder keeps its true size', () => {
    const result = buildGraphFolderNodes(
      [doc('a/b'), doc('a/b/C')],
      [{ source: 'a/b', target: 'a/b/C' }],
    );
    // `a/b` is a page node, so no folder node is emitted for it; `a` is.
    expect(result.nodes.find((node) => node.id === 'folder:a')?.kind).toBe('folder');
    expect(
      result.nodes.find((node) => node.kind === 'folder' && node.path === 'a')?.memberCount,
    ).toBe(1);
  });
});

describe('isGraphFolderLink', () => {
  test('reads the mark on the link, not the endpoint ids', () => {
    // A folder note hangs its members off a PAGE node, so neither endpoint
    // carries the `folder:` prefix — the mark is the only reliable signal.
    expect(isGraphFolderLink({ kind: 'containment' })).toBe(true);
    expect(isGraphFolderLink({ source: 'notes', target: 'notes/A' })).toBe(false);
  });
});

describe('getGraphFolderMemberCount', () => {
  test('is the count for a folder node and null for everything else', () => {
    expect(getGraphFolderMemberCount({ kind: 'folder', memberCount: 7 })).toBe(7);
    expect(getGraphFolderMemberCount(doc('notes/A'))).toBeNull();
    expect(getGraphFolderMemberCount(null)).toBeNull();
    expect(getGraphFolderMemberCount({ kind: 'folder' })).toBeNull();
  });
});

describe('getGraphFolderChargeMultiplier', () => {
  test('an empty folder pushes exactly as hard as a page', () => {
    expect(getGraphFolderChargeMultiplier(0)).toBe(1);
  });

  test('grows with membership, so a big folder claims more room', () => {
    expect(getGraphFolderChargeMultiplier(20)).toBeGreaterThan(getGraphFolderChargeMultiplier(4));
  });

  test('is capped, so one huge folder cannot blow the rest off screen', () => {
    expect(getGraphFolderChargeMultiplier(100_000)).toBeLessThanOrEqual(6);
  });
});

describe('graphFolderNodeId', () => {
  test('namespaces folder ids the way the server namespaces external ones', () => {
    expect(graphFolderNodeId('notes')).toBe(`${GRAPH_FOLDER_NODE_PREFIX}notes`);
  });
});
