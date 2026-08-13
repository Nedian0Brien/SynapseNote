import { describe, expect, test } from 'bun:test';

import {
  buildGraphLinkSignature,
  capGraphNodeRadius,
  type GraphDocDisplayState,
  getGraphNodeCanvasRadius,
  getGraphNodePointerRadius,
  getGraphNodeTooltipLabel,
  getGraphNodeVisualState,
  getHashForGraphDocSelection,
  MAX_GRAPH_NODE_SCREEN_RADIUS_PX,
  reconcileGraphData,
  resolveGraphNodeClickAction,
} from './graph-view-utils';

type GraphPhysicsFixture = {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  __indexColor?: string;
};

type GraphNodeFixture = {
  id: string;
  label: string;
  cluster?: string | null;
} & GraphPhysicsFixture;

type GraphLinkFixture = {
  source: string | { id: string };
  target: string | { id: string };
  __indexColor?: string;
};

describe('getGraphNodeTooltipLabel', () => {
  test('returns plain label for doc nodes without metadata', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'doc',
        id: 'notes/alpha',
        label: 'Alpha',
        docName: 'notes/alpha',
        anchor: null,
      }),
    ).toBe('Alpha');
  });

  test('falls back to node id when a document label is missing', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'doc',
        id: 'notes/alpha',
        label: undefined as unknown as string,
        docName: 'notes/alpha',
        anchor: null,
      }),
    ).toBe('notes/alpha');
  });

  test('returns full URL for external nodes', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'external',
        id: 'external:https://example.com/path',
        label: 'example.com',
        url: 'https://example.com/path',
      }),
    ).toBe('https://example.com/path');
  });

  test('returns HTML with all metadata fields', () => {
    const html = getGraphNodeTooltipLabel({
      kind: 'doc',
      id: 'notes/rag',
      label: 'RAG Patterns',
      docName: 'notes/rag',
      anchor: null,
      cluster: 'retrieval',
      category: 'method',
      tags: ['rag', 'embeddings', 'search'],
    });
    expect(html).toContain('RAG Patterns');
    expect(html).toContain('retrieval');
    expect(html).toContain('method');
    expect(html).toContain('rag, embeddings, search');
    expect(html).toContain('<div');
  });

  test('returns HTML with only cluster field', () => {
    const html = getGraphNodeTooltipLabel({
      kind: 'doc',
      id: 'notes/x',
      label: 'X Doc',
      docName: 'notes/x',
      anchor: null,
      cluster: 'planning',
    });
    expect(html).toContain('X Doc');
    expect(html).toContain('planning');
    expect(html).not.toContain('category:');
    expect(html).not.toContain('tags:');
  });

  test('returns HTML with only tags field', () => {
    const html = getGraphNodeTooltipLabel({
      kind: 'doc',
      id: 'notes/y',
      label: 'Y Doc',
      docName: 'notes/y',
      anchor: null,
      tags: ['alpha', 'beta'],
    });
    expect(html).toContain('Y Doc');
    expect(html).toContain('alpha, beta');
    expect(html).not.toContain('cluster:');
  });

  test('returns plain label when metadata fields are null', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'doc',
        id: 'notes/z',
        label: 'Z Doc',
        docName: 'notes/z',
        anchor: null,
        cluster: null,
        category: null,
        tags: null,
      }),
    ).toBe('Z Doc');
  });

  test('returns plain label when tags is empty array', () => {
    expect(
      getGraphNodeTooltipLabel({
        kind: 'doc',
        id: 'notes/w',
        label: 'W Doc',
        docName: 'notes/w',
        anchor: null,
        tags: [],
      }),
    ).toBe('W Doc');
  });

  test('escapes HTML characters in metadata values', () => {
    const html = getGraphNodeTooltipLabel({
      kind: 'doc',
      id: 'notes/xss',
      label: '<script>alert("xss")</script>',
      docName: 'notes/xss',
      anchor: null,
      cluster: 'a<b',
      tags: ['x&y'],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('a&lt;b');
    expect(html).toContain('x&amp;y');
  });

  test.each([
    {
      displayState: 'missing' as GraphDocDisplayState,
      heading: 'Broken / uncreated link',
      detail: 'This page does not exist yet. Open it to create it.',
    },
    {
      displayState: 'folder' as GraphDocDisplayState,
      heading: 'Folder target',
      detail: 'This link resolves to a folder view rather than a standalone page.',
    },
  ])('returns status-rich HTML for $displayState doc targets', ({
    displayState,
    heading,
    detail,
  }) => {
    const html = getGraphNodeTooltipLabel(
      {
        kind: 'doc',
        id: 'notes/alpha',
        label: 'Alpha',
        docName: 'notes/alpha',
        anchor: null,
      },
      { displayState },
    );

    expect(html).toContain('<div');
    expect(html).toContain(heading);
    expect(html).toContain(detail);
    expect(html).toContain('Alpha');
  });
});

describe('resolveGraphNodeClickAction — folder nodes', () => {
  const folder = {
    kind: 'folder',
    id: 'folder:notes/projects',
    label: 'projects',
    path: 'notes/projects',
    memberCount: 4,
  } as const;

  test('navigates to the folder overview, which is a plain hash route', () => {
    expect(resolveGraphNodeClickAction(folder, 'navigate')).toEqual({
      kind: 'navigate',
      hash: getHashForGraphDocSelection({
        docName: 'notes/projects',
        label: 'projects',
        anchor: null,
      }),
    });
  });

  test('selects with the path, which is what the card needs to open it', () => {
    expect(resolveGraphNodeClickAction(folder, 'select')).toEqual({
      kind: 'select',
      selection: {
        kind: 'folder',
        id: 'folder:notes/projects',
        label: 'projects',
        path: 'notes/projects',
        memberCount: 4,
      },
    });
  });
});

describe('resolveGraphNodeClickAction', () => {
  test('selects fullscreen document nodes without losing anchor metadata', () => {
    expect(
      resolveGraphNodeClickAction(
        {
          kind: 'doc',
          id: 'notes/alpha',
          label: 'Alpha',
          docName: 'notes/alpha',
          anchor: 'deep-link',
        },
        'select',
      ),
    ).toEqual({
      kind: 'select',
      selection: {
        kind: 'doc',
        id: 'notes/alpha',
        docName: 'notes/alpha',
        label: 'Alpha',
        anchor: 'deep-link',
      },
    });
  });

  test('selects fullscreen document nodes without anchors', () => {
    expect(
      resolveGraphNodeClickAction(
        {
          kind: 'doc',
          id: 'notes/alpha',
          label: 'Alpha',
          docName: 'notes/alpha',
          anchor: null,
        },
        'select',
      ),
    ).toEqual({
      kind: 'select',
      selection: {
        kind: 'doc',
        id: 'notes/alpha',
        docName: 'notes/alpha',
        label: 'Alpha',
        anchor: null,
      },
    });
  });

  test('navigates docked document nodes through fragment anchor hashes', () => {
    expect(
      resolveGraphNodeClickAction(
        {
          kind: 'doc',
          id: 'notes/alpha',
          label: 'Alpha',
          docName: 'notes/alpha',
          anchor: 'deep-link',
        },
        'navigate',
      ),
    ).toEqual({
      kind: 'navigate',
      hash: '#/notes/alpha#deep-link',
    });
  });

  test('keeps external nodes on the new-tab path in both modes', () => {
    const externalNode = {
      kind: 'external' as const,
      id: 'external:https://example.com/docs',
      label: 'example.com',
      url: 'https://example.com/docs',
    };

    expect(resolveGraphNodeClickAction(externalNode, 'navigate')).toEqual({
      kind: 'external',
      url: 'https://example.com/docs',
    });
    expect(resolveGraphNodeClickAction(externalNode, 'select')).toEqual({
      kind: 'select',
      selection: {
        kind: 'external',
        id: 'external:https://example.com/docs',
        label: 'example.com',
        url: 'https://example.com/docs',
      },
    });
  });
});

describe('getGraphNodeVisualState', () => {
  test('gives a folder its own state, so it never reads as the active document', () => {
    const folder = {
      kind: 'folder' as const,
      id: 'folder:notes',
      label: 'notes',
      path: 'notes',
      memberCount: 3,
    };

    expect(getGraphNodeVisualState(folder, { activeDocName: 'notes', selectedNodeId: null })).toBe(
      'folder',
    );
    expect(
      getGraphNodeVisualState(folder, { activeDocName: 'notes', selectedNodeId: 'folder:notes' }),
    ).toBe('folder-selected');
  });

  test('distinguishes active, selected, and active-and-selected document states', () => {
    const node = {
      kind: 'doc' as const,
      id: 'notes/alpha',
      label: 'Alpha',
      docName: 'notes/alpha',
      anchor: null,
    };

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/current',
        selectedNodeId: null,
      }),
    ).toBe('default');

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/alpha',
        selectedNodeId: null,
      }),
    ).toBe('active');

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/current',
        selectedNodeId: 'notes/alpha',
      }),
    ).toBe('selected');

    expect(
      getGraphNodeVisualState(node, {
        activeDocName: 'notes/alpha',
        selectedNodeId: 'notes/alpha',
      }),
    ).toBe('active-selected');
  });

  test('keeps external nodes on their own visual path until selected', () => {
    expect(
      getGraphNodeVisualState(
        {
          kind: 'external',
          id: 'external:https://example.com',
          label: 'example.com',
          url: 'https://example.com',
        },
        {
          activeDocName: 'notes/alpha',
          selectedNodeId: null,
        },
      ),
    ).toBe('external');

    expect(
      getGraphNodeVisualState(
        {
          kind: 'external',
          id: 'external:https://example.com',
          label: 'example.com',
          url: 'https://example.com',
        },
        {
          activeDocName: 'notes/alpha',
          selectedNodeId: 'external:https://example.com',
        },
      ),
    ).toBe('external-selected');
  });
});

describe('graph node radii', () => {
  test('keeps canvas radii in sync with the visual node states', () => {
    expect(getGraphNodeCanvasRadius('default')).toBe(5);
    expect(getGraphNodeCanvasRadius('external')).toBe(5);
    expect(getGraphNodeCanvasRadius('external-selected')).toBe(7);
    expect(getGraphNodeCanvasRadius('selected')).toBe(7);
    expect(getGraphNodeCanvasRadius('active')).toBe(8);
    expect(getGraphNodeCanvasRadius('active-selected')).toBe(8);
  });

  test('expands pointer radii to include the visible selection ring', () => {
    expect(getGraphNodePointerRadius('default', 2)).toBe(5);
    expect(getGraphNodePointerRadius('external-selected', 2)).toBe(8);
    expect(getGraphNodePointerRadius('selected', 2)).toBe(8);
    expect(getGraphNodePointerRadius('active', 2)).toBe(9);
    expect(getGraphNodePointerRadius('active-selected', 2)).toBe(9);
  });
});

describe('getHashForGraphDocSelection', () => {
  test('preserves anchors when opening a fullscreen selection', () => {
    expect(
      getHashForGraphDocSelection({
        docName: 'notes/alpha',
        label: 'Alpha',
        anchor: 'deep-link',
      }),
    ).toBe('#/notes/alpha#deep-link');
  });

  test('generates a hash without fragments when anchor is null', () => {
    expect(
      getHashForGraphDocSelection({
        docName: 'notes/alpha',
        label: 'Alpha',
        anchor: null,
      }),
    ).toBe('#/notes/alpha');
  });
});

describe('reconcileGraphData', () => {
  test('preserves settled node physics for unchanged ids while refreshing metadata', () => {
    const previous: {
      nodes: Array<
        {
          kind: 'doc';
          docName: string;
          anchor: null;
        } & GraphNodeFixture
      >;
      links: GraphLinkFixture[];
    } = {
      nodes: [
        {
          kind: 'doc',
          id: 'notes/alpha',
          label: 'Alpha (old)',
          docName: 'notes/alpha',
          anchor: null,
          x: 120,
          y: -40,
          vx: 0.25,
          vy: -0.5,
          fx: null,
          fy: null,
          __indexColor: '#123456',
        },
      ],
      links: [
        {
          source: { id: 'notes/alpha' },
          target: { id: 'notes/beta' },
          __indexColor: '#abcdef',
        },
      ],
    };

    const next = {
      nodes: [
        {
          kind: 'doc' as const,
          id: 'notes/alpha',
          label: 'Alpha (new)',
          docName: 'notes/alpha',
          anchor: null,
          cluster: 'planning',
        },
        {
          kind: 'doc' as const,
          id: 'notes/beta',
          label: 'Beta',
          docName: 'notes/beta',
          anchor: null,
        },
      ],
      links: [{ source: 'notes/alpha', target: 'notes/beta' }],
    };

    const reconciled = reconcileGraphData(
      previous as unknown as Parameters<typeof reconcileGraphData>[0],
      next,
    );
    const alpha = reconciled.nodes[0] as GraphNodeFixture;
    const beta = reconciled.nodes[1] as GraphNodeFixture;
    const link = reconciled.links[0] as unknown as GraphLinkFixture;

    expect(alpha.label).toBe('Alpha (new)');
    expect(alpha.cluster).toBe('planning');
    expect(alpha.x).toBe(120);
    expect(alpha.y).toBe(-40);
    expect(alpha.vx).toBe(0.25);
    expect(alpha.vy).toBe(-0.5);
    expect(alpha.__indexColor).toBe('#123456');
    expect(beta.x).toBeUndefined();
    expect(beta.y).toBeUndefined();
    expect(link.__indexColor).toBe('#abcdef');
  });

  test('does not carry physics state forward for nodes absent from next', () => {
    const previous = {
      nodes: [
        {
          kind: 'doc' as const,
          id: 'notes/alpha',
          label: 'Alpha',
          docName: 'notes/alpha',
          anchor: null,
          x: 10,
          y: 20,
        },
        {
          kind: 'doc' as const,
          id: 'notes/removed',
          label: 'Removed',
          docName: 'notes/removed',
          anchor: null,
          x: 99,
          y: 99,
        },
      ],
      links: [],
    };

    const next = {
      nodes: [
        {
          kind: 'doc' as const,
          id: 'notes/alpha',
          label: 'Alpha',
          docName: 'notes/alpha',
          anchor: null,
        },
        {
          kind: 'doc' as const,
          id: 'notes/new',
          label: 'New',
          docName: 'notes/new',
          anchor: null,
        },
      ],
      links: [],
    };

    const reconciled = reconcileGraphData(
      previous as unknown as Parameters<typeof reconcileGraphData>[0],
      next,
    );

    expect(reconciled.nodes).toHaveLength(2);
    const ids = reconciled.nodes.map((n) => n.id);
    expect(ids).not.toContain('notes/removed');
    const alpha = reconciled.nodes.find((n) => n.id === 'notes/alpha') as GraphNodeFixture;
    expect(alpha.x).toBe(10);
    expect(alpha.y).toBe(20);
    const newNode = reconciled.nodes.find((n) => n.id === 'notes/new') as GraphNodeFixture;
    expect(newNode.x).toBeUndefined();
    expect(newNode.y).toBeUndefined();
  });
});

describe('buildGraphLinkSignature', () => {
  test('normalizes force-graph object endpoints back to stable id signatures', () => {
    expect(
      buildGraphLinkSignature([
        { source: 'notes/alpha', target: 'notes/beta' },
        {
          source: { id: 'notes/beta' },
          target: { id: 'notes/gamma' },
        },
      ] as unknown as Parameters<typeof buildGraphLinkSignature>[0]),
    ).toBe('notes/alpha>notes/beta,notes/beta>notes/gamma');
  });
});

describe('capGraphNodeRadius', () => {
  test('leaves a node alone while it is comfortably under the cap', () => {
    // Zoomed out, every node is a few pixels across and nothing is clamped.
    expect(capGraphNodeRadius(5, 0.8)).toBe(5);
  });

  test('stops a node growing without bound as you zoom in', () => {
    // 5 graph units at 10x would draw a 50px disc. It also drags the node's
    // name with it, since the label is anchored to the node's edge.
    expect(capGraphNodeRadius(5, 10) * 10).toBeLessThanOrEqual(
      MAX_GRAPH_NODE_SCREEN_RADIUS_PX + 0.001,
    );
  });

  test('holds the drawn size steady once capped, so the label stops sliding', () => {
    expect(capGraphNodeRadius(5, 10) * 10).toBeCloseTo(capGraphNodeRadius(5, 20) * 20, 5);
  });

  test('caps the BASE, so the size encoding survives the cap', () => {
    // Capping after the style multiplier collapsed a page, a hub and a
    // two-hundred-page folder to the same 11px at any zoom past the cap —
    // deleting the one cue that says which dot anchors a territory, exactly
    // when you had zoomed in to look at it.
    const base = capGraphNodeRadius(5, 10);
    const page = base * 1;
    const hub = base * 1.6;
    const folder = base * 2.2;
    expect(hub).toBeGreaterThan(page);
    expect(folder).toBeGreaterThan(hub);
    expect(folder / page).toBeCloseTo(2.2, 5);
  });

  test('survives a zero scale rather than dividing by it', () => {
    expect(capGraphNodeRadius(5, 0)).toBe(5);
  });
});
