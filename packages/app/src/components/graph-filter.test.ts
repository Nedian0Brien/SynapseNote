import { describe, expect, test } from 'bun:test';
import { type GraphFilterSettings, getDefaultGraphSettings } from '@/lib/graph-settings-store';
import { applyGraphFilters, graphTagNodeId, matchesGraphQuery } from './graph-filter';
import type { GraphData, GraphDocDisplayState, GraphNode } from './graph-view-utils';

function doc(
  docName: string,
  extra: { label?: string; tags?: string[] | null; cluster?: string | null } = {},
): GraphNode {
  return {
    kind: 'doc',
    id: docName,
    docName,
    anchor: null,
    label: extra.label ?? docName,
    cluster: extra.cluster ?? null,
    category: null,
    tags: extra.tags ?? null,
  };
}

function external(url: string): GraphNode {
  return { kind: 'external', id: `external:${url}`, url, label: url };
}

function filters(overrides: Partial<GraphFilterSettings> = {}): GraphFilterSettings {
  return { ...getDefaultGraphSettings('docked').filters, ...overrides };
}

const allDocs = (): GraphDocDisplayState => 'doc';

describe('matchesGraphQuery', () => {
  const node = doc('notes/Kayak Trips', { label: 'Kayak Trips', tags: ['outdoors', 'draft'] });

  test('an empty or whitespace-only query matches everything', () => {
    expect(matchesGraphQuery(node, '')).toBe(true);
    expect(matchesGraphQuery(node, '   ')).toBe(true);
  });

  test('matches case-insensitively against the label and the docName', () => {
    expect(matchesGraphQuery(node, 'kayak')).toBe(true);
    expect(matchesGraphQuery(node, 'NOTES/')).toBe(true);
    expect(matchesGraphQuery(node, 'canoe')).toBe(false);
  });

  test('requires every term to match', () => {
    expect(matchesGraphQuery(node, 'kayak trips')).toBe(true);
    expect(matchesGraphQuery(node, 'kayak canoe')).toBe(false);
  });

  test('negates a term with a leading dash', () => {
    expect(matchesGraphQuery(node, '-canoe')).toBe(true);
    expect(matchesGraphQuery(node, '-kayak')).toBe(false);
    expect(matchesGraphQuery(node, 'kayak -draftless')).toBe(true);
  });

  test('a bare dash is ignored rather than negating the empty string', () => {
    // `''.includes('')` is true, so a naive implementation would treat `-` as
    // "exclude everything" and blank the graph on a mid-typing keystroke.
    expect(matchesGraphQuery(node, '-')).toBe(true);
    expect(matchesGraphQuery(node, 'kayak -')).toBe(true);
  });

  test('restricts a term to frontmatter tags with the tag: prefix', () => {
    expect(matchesGraphQuery(node, 'tag:draft')).toBe(true);
    expect(matchesGraphQuery(node, 'tag:published')).toBe(false);
    // "kayak" is in the label but not in any tag.
    expect(matchesGraphQuery(node, 'tag:kayak')).toBe(false);
    expect(matchesGraphQuery(node, '-tag:published')).toBe(true);
  });

  test('matches an external node on its url', () => {
    const link = external('https://example.com/boats');
    expect(matchesGraphQuery(link, 'boats')).toBe(true);
    expect(matchesGraphQuery(link, 'tag:boats')).toBe(false);
  });

  test('matches a tag node on its own tag, including via tag:', () => {
    const tagNode: GraphNode = { kind: 'tag', id: 'tag:draft', label: '#draft', tag: 'draft' };
    expect(matchesGraphQuery(tagNode, 'draft')).toBe(true);
    expect(matchesGraphQuery(tagNode, 'tag:draft')).toBe(true);
  });

  test('a node with no tags is not matched by any tag: term', () => {
    expect(matchesGraphQuery(doc('notes/Plain'), 'tag:anything')).toBe(false);
  });
});

describe('applyGraphFilters', () => {
  const data: GraphData = {
    nodes: [
      doc('notes/Active', { tags: ['idea'] }),
      doc('notes/Linked'),
      doc('notes/Lonely'),
      doc('notes/Ghost'),
      external('https://example.com'),
    ],
    links: [
      { source: 'notes/Active', target: 'notes/Linked' },
      { source: 'notes/Linked', target: 'notes/Ghost' },
      { source: 'notes/Active', target: 'external:https://example.com' },
    ],
  };

  function run(overrides: Partial<GraphFilterSettings>, activeDocName = 'notes/Active') {
    return applyGraphFilters({
      data,
      filters: filters(overrides),
      activeDocName,
      getDisplayState: (node) =>
        node.kind === 'doc' && node.docName === 'notes/Ghost' ? 'missing' : 'doc',
    });
  }

  function ids(result: GraphData): string[] {
    return result.nodes.map((node) => node.id).sort();
  }

  test('hides external nodes and the links that reach them by default', () => {
    const result = run({});
    expect(ids(result)).toEqual(['notes/Active', 'notes/Ghost', 'notes/Linked', 'notes/Lonely']);
    expect(result.links).toEqual([
      { source: 'notes/Active', target: 'notes/Linked' },
      { source: 'notes/Linked', target: 'notes/Ghost' },
    ]);
  });

  test('keeps external nodes when the filter is on', () => {
    expect(ids(run({ showExternalNodes: true }))).toContain('external:https://example.com');
  });

  test('drops missing-target nodes when showMissingNodes is off', () => {
    const result = run({ showMissingNodes: false });
    expect(ids(result)).not.toContain('notes/Ghost');
    // The edge that reached the dropped node goes with it.
    expect(result.links).toEqual([{ source: 'notes/Active', target: 'notes/Linked' }]);
  });

  test('drops orphans when showOrphans is off', () => {
    expect(ids(run({ showOrphans: false }))).toEqual([
      'notes/Active',
      'notes/Ghost',
      'notes/Linked',
    ]);
  });

  test('counts orphans against the surviving links, not the original graph', () => {
    // Ghost's only edge is to Linked; hiding Ghost strands nothing, but hiding
    // *Linked* via a query would strand Ghost. Here the missing filter removes
    // Ghost, which leaves Linked still attached to Active.
    const result = run({ showMissingNodes: false, showOrphans: false });
    expect(ids(result)).toEqual(['notes/Active', 'notes/Linked']);
  });

  test('applies the query and prunes links to the survivors', () => {
    const result = run({ query: 'link' });
    expect(ids(result)).toEqual(['notes/Active', 'notes/Linked']);
    expect(result.links).toEqual([{ source: 'notes/Active', target: 'notes/Linked' }]);
  });

  test('keeps the active document even when it fails every filter', () => {
    // The active doc matches neither the query nor (were it applicable) the
    // kind filters — the docked view must still show where the page sits.
    const result = run({ query: 'zzz-nothing-matches' });
    expect(ids(result)).toEqual(['notes/Active']);
    expect(result.links).toEqual([]);
  });

  test('keeps the active document even when it is an orphan', () => {
    expect(ids(run({ showOrphans: false }, 'notes/Lonely'))).toContain('notes/Lonely');
  });

  test('leaves the input graph untouched', () => {
    const nodeCount = data.nodes.length;
    const linkCount = data.links.length;
    run({ showTagNodes: true, showExternalNodes: true });
    expect(data.nodes).toHaveLength(nodeCount);
    expect(data.links).toHaveLength(linkCount);
  });
});

describe('applyGraphFilters — tag nodes', () => {
  const data: GraphData = {
    nodes: [
      doc('notes/A', { tags: ['idea', 'draft'] }),
      doc('notes/B', { tags: ['idea'] }),
      doc('notes/C'),
    ],
    links: [{ source: 'notes/A', target: 'notes/B' }],
  };

  function run(overrides: Partial<GraphFilterSettings> = {}) {
    return applyGraphFilters({
      data,
      filters: filters({ showTagNodes: true, ...overrides }),
      activeDocName: 'notes/A',
      getDisplayState: allDocs,
    });
  }

  test('synthesizes one node per distinct tag, shared across pages', () => {
    const result = run();
    const tagNodes = result.nodes.filter((node) => node.kind === 'tag');
    expect(tagNodes.map((node) => node.id).sort()).toEqual(['tag:draft', 'tag:idea']);
    expect(tagNodes.every((node) => node.kind === 'tag' && node.label === `#${node.tag}`)).toBe(
      true,
    );
  });

  test('links every tagged page to its tags', () => {
    expect(run().links).toEqual([
      { source: 'notes/A', target: 'notes/B' },
      { source: 'notes/A', target: graphTagNodeId('idea') },
      { source: 'notes/A', target: graphTagNodeId('draft') },
      { source: 'notes/B', target: graphTagNodeId('idea') },
    ]);
  });

  test('adds nothing when the filter is off', () => {
    expect(
      applyGraphFilters({
        data,
        filters: filters({ showTagNodes: false }),
        activeDocName: 'notes/A',
        getDisplayState: allDocs,
      }).nodes.some((node) => node.kind === 'tag'),
    ).toBe(false);
  });

  test('never shadows a real node that already owns the synthesized id', () => {
    const collided: GraphData = {
      nodes: [doc('tag:idea'), doc('notes/A', { tags: ['idea'] })],
      links: [],
    };
    const result = applyGraphFilters({
      data: collided,
      filters: filters({ showTagNodes: true }),
      activeDocName: 'notes/A',
      getDisplayState: allDocs,
    });
    expect(result.nodes.filter((node) => node.id === 'tag:idea')).toHaveLength(1);
    expect(result.nodes.find((node) => node.id === 'tag:idea')?.kind).toBe('doc');
  });

  test('tag nodes are subject to the query like any other node', () => {
    const result = run({ query: 'draft' });
    expect(result.nodes.map((node) => node.id).sort()).toEqual(['notes/A', 'tag:draft']);
  });
});
