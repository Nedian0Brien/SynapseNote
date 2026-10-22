import { describe, expect, test } from 'bun:test';
import {
  buildGraphFolderNodes,
  GRAPH_FOLDER_NODE_PREFIX,
  graphFolderDepthOf,
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
    expect(graphFolderPathOf('/home/user/scripts/train.sh')).toBe('home/user/scripts');
  });
});

describe('buildGraphFolderNodes', () => {
  test('gives each directory a node and ties its pages to it', () => {
    const result = build(['notes/A', 'notes/B']);
    expect(paths(result)).toEqual(['notes']);
    expect(edges(result)).toEqual(['/notes>notes/A', '/notes>notes/B']);
  });

  test('marks every synthesized edge as containment, never as an authored link', () => {
    const result = build(['notes/A']);
    expect(result.links.every(isGraphFolderLink)).toBe(true);
  });

  test('stamps each containment edge with the folder’s FINAL member count', () => {
    // Counted before the edges are emitted, or the first page of a folder would
    // carry a count of one and be reeled in tighter than its siblings.
    const result = build(['notes/A', 'notes/B', 'notes/C']);
    expect(result.links.map((link) => link.memberCount)).toEqual([3, 3, 3]);
  });

  test('counts visible descendants, which is what subtree weighting sizes by', () => {
    const [folder] = build(['notes/A', 'notes/B', 'notes/C']).nodes;
    expect(folder.kind === 'folder' && folder.memberCount).toBe(3);
  });

  test('includes nested folders and their pages in the parent subtree weight', () => {
    const result = build(['notes/A', 'notes/deep/B', 'notes/deep/C']);
    expect(
      result.nodes.find((node) => node.kind === 'folder' && node.path === 'notes')?.memberCount,
    ).toBe(4);
  });

  test('leaves root-level pages outside the folder hierarchy', () => {
    const result = build(['README', 'CHANGELOG']);
    expect(paths(result)).toEqual([]);
    expect(edges(result)).toEqual([]);
  });

  test('nests folders, so the tree shows as a tree', () => {
    const result = build(['notes/A', 'notes/deep/B']);
    expect(paths(result)).toEqual(['notes', 'notes/deep']);
    expect(edges(result)).toEqual([
      '/notes/deep>notes/deep/B',
      '/notes>/notes/deep',
      '/notes>notes/A',
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
    expect(edges(buildGraphFolderNodes(nodes, []))).toEqual(['/notes>notes/A']);
  });
});

describe('buildGraphFolderNodes — hidden project root', () => {
  test('leaves unrelated top-level folders as separate components', () => {
    const result = build(['docs/A', 'notes/B', 'src/C']);
    expect(paths(result)).toEqual(['docs', 'notes', 'src']);
    expect(edges(result)).toEqual(['/docs>docs/A', '/notes>notes/B', '/src>src/C']);
  });

  test('never synthesizes a root for a single top-level item', () => {
    expect(paths(build(['notes/A', 'notes/B']))).toEqual(['notes']);
  });

  test('keeps a folder note distinct from any missing project root', () => {
    const result = buildGraphFolderNodes([doc('notes'), doc('notes/A')], []);
    expect(paths(result)).toEqual(['notes']);
    expect(edges(result)).toEqual(['/notes>notes/A']);
  });
});

describe('buildGraphFolderNodes — complete folder paths', () => {
  test('keeps every folder in a single-child chain', () => {
    const result = build(['docs/archive/cleanup/A', 'docs/archive/cleanup/B']);
    expect(paths(result)).toEqual(['docs', 'docs/archive', 'docs/archive/cleanup']);
    expect(edges(result)).toEqual([
      '/docs/archive/cleanup>docs/archive/cleanup/A',
      '/docs/archive/cleanup>docs/archive/cleanup/B',
      '/docs/archive>/docs/archive/cleanup',
      '/docs>/docs/archive',
    ]);
  });

  test('labels every nested folder by its own segment', () => {
    const result = build(['docs/archive/cleanup/A']);
    expect(result.nodes.map((node) => node.label)).toEqual(['docs', 'archive', 'cleanup']);
  });

  test('keeps a folder that holds pages of its own, however few', () => {
    const result = build(['docs/Intro', 'docs/archive/cleanup/A']);
    expect(paths(result)).toEqual(['docs', 'docs/archive', 'docs/archive/cleanup']);
    expect(edges(result)).toContain('/docs>/docs/archive');
    expect(edges(result)).toContain('/docs/archive>/docs/archive/cleanup');
  });

  test('keeps a folder that forks, because a fork is what it separates', () => {
    const result = build(['docs/a/A', 'docs/b/B']);
    expect(paths(result)).toEqual(['docs', 'docs/a', 'docs/b']);
  });

  test('keeps the direct parent of a deeply nested folder', () => {
    const result = build(['top/a/A', 'top/x/y/B']);
    expect(paths(result)).toEqual(['top', 'top/a', 'top/x', 'top/x/y']);
    expect(edges(result)).toContain('/top>/top/x');
    expect(edges(result)).toContain('/top/x>/top/x/y');
    expect(result.nodes.find((node) => node.id === '/top/x/y')?.label).toBe('y');
  });
});

describe('buildGraphFolderNodes — folders remain distinct from real pages', () => {
  test('a page named after a folder does not replace that folder node', () => {
    const result = buildGraphFolderNodes([doc('notes'), doc('notes/A')], []);
    expect(paths(result)).toEqual(['notes']);
    expect(edges(result)).toEqual(['/notes>notes/A']);
  });

  test('a same-named note and folder are both tied to their own parents', () => {
    const result = buildGraphFolderNodes([doc('a/b'), doc('a/b/C'), doc('a/D')], []);
    expect(edges(result)).toEqual(['/a/b>a/b/C', '/a>/a/b', '/a>a/D', '/a>a/b']);
  });

  test('never links a node to itself', () => {
    const result = buildGraphFolderNodes([doc('notes'), doc('notes/A')], []);
    expect(result.links.every((link) => link.source !== link.target)).toBe(true);
  });
});

describe('buildGraphFolderNodes — authored links coexist with containment', () => {
  test('skips only an exact authored source-target duplicate', () => {
    const result = buildGraphFolderNodes(
      [doc('notes/A')],
      [{ source: '/notes', target: 'notes/A' }],
    );
    expect(result.links).toEqual([]);
  });

  test('keeps containment when an authored edge points in the reverse direction', () => {
    const result = buildGraphFolderNodes(
      [doc('notes/A')],
      [{ source: 'notes/A', target: '/notes' }],
    );
    expect(edges(result)).toEqual(['/notes>notes/A']);
  });

  test('still counts an exact duplicate member, so the folder keeps its true size', () => {
    const result = buildGraphFolderNodes([doc('a/b/C')], [{ source: '/a/b', target: 'a/b/C' }]);
    expect(result.nodes.find((node) => node.id === '/a')?.kind).toBe('folder');
    expect(
      result.nodes.find((node) => node.kind === 'folder' && node.path === 'a')?.memberCount,
    ).toBe(2);
  });
});

describe('buildGraphFolderNodes — folder exclusions', () => {
  test('omits excluded folder nodes and containment while keeping their pages outside synthesis', () => {
    const result = buildGraphFolderNodes(
      [doc('Archive/A'), doc('Archive/deep/B'), doc('notes/C')],
      [],
      { excludedPaths: ['Archive'] },
    );
    expect(paths(result)).toEqual(['notes']);
    expect(edges(result)).toEqual(['/notes>notes/C']);
  });

  test('normalizes slashes and excludes descendants only on a path boundary', () => {
    const result = buildGraphFolderNodes(
      [doc('Archive/A'), doc('Archive/deep/B'), doc('Archive-old/C')],
      [],
      { excludedPaths: [' /Archive/ '] },
    );
    expect(paths(result)).toEqual(['Archive-old']);
  });
});

describe('isGraphFolderLink', () => {
  test('reads the mark on the link, not the endpoint ids', () => {
    // Semantic behavior should not depend on the current leading-slash id
    // convention.
    expect(isGraphFolderLink({ kind: 'containment' })).toBe(true);
    expect(isGraphFolderLink({ source: 'notes', target: 'notes/A' })).toBe(false);
  });
});

describe('graphFolderNodeId', () => {
  test('uses the leading-slash id scheme from Folders to Graph', () => {
    expect(graphFolderNodeId('notes')).toBe(`${GRAPH_FOLDER_NODE_PREFIX}notes`);
  });
});

describe('graphFolderDepthOf', () => {
  test('counts the folders a page sits under', () => {
    expect(graphFolderDepthOf('README')).toBe(0);
    expect(graphFolderDepthOf('docs/Intro')).toBe(1);
    expect(graphFolderDepthOf('packages/app/src/Foo')).toBe(3);
  });

  test('paces the label reveal past where territories stop', () => {
    // Territories cap at depth 2, so keying the reveal on the region holding a
    // page made everything below that arrive in one step — a wall of names.
    // The page's own depth keeps giving the descent steps to take.
    expect(graphFolderDepthOf('packages/app/src/components/Foo')).toBeGreaterThan(2);
  });

  test('is not confused by a leading slash or a doubled separator', () => {
    expect(graphFolderDepthOf('/docs/Intro')).toBe(1);
    expect(graphFolderDepthOf('docs//api/Intro')).toBe(2);
  });
});
