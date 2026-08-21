import { describe, expect, test } from 'bun:test';
import { canonicalizeObsidianGraphData } from './graph-obsidian-data';
import type { GraphData, GraphNode } from './graph-view-utils';

function doc(id: string): GraphNode {
  return { kind: 'doc', id, docName: id, label: id, anchor: null };
}

describe('canonicalizeObsidianGraphData', () => {
  test('merges bare and path-suffix targets into their real vault pages', () => {
    const data: GraphData = {
      nodes: [
        doc('index'),
        doc('summary/Page'),
        doc('papers/wiki/summary/Page'),
        doc('papers/wiki/concepts/tables/Insight'),
        doc('concepts/tables/Insight'),
      ],
      links: [
        { source: 'index', target: 'summary/Page\\' },
        { source: 'index', target: 'concepts/tables/Insight' },
      ],
    };
    const result = canonicalizeObsidianGraphData(
      data,
      new Set(['index', 'papers/wiki/summary/Page', 'papers/wiki/concepts/tables/Insight']),
    );
    expect(result.links).toEqual([
      { source: 'index', target: 'papers/wiki/summary/Page' },
      { source: 'index', target: 'papers/wiki/concepts/tables/Insight' },
    ]);
    expect(result.nodes.map((node) => node.id)).toEqual([
      'index',
      'papers/wiki/concepts/tables/Insight',
      'papers/wiki/summary/Page',
    ]);
  });

  test('uses the source-nearest page when a basename is duplicated', () => {
    const data: GraphData = {
      nodes: [doc('a/source'), doc('b/source'), doc('Target')],
      links: [
        { source: 'a/source', target: 'Target' },
        { source: 'b/source', target: 'Target' },
      ],
    };
    const result = canonicalizeObsidianGraphData(
      data,
      new Set(['a/source', 'b/source', 'a/Target', 'b/Target']),
    );
    expect(result.links).toEqual([
      { source: 'a/source', target: 'a/Target' },
      { source: 'b/source', target: 'b/Target' },
    ]);
  });

  test('preserves unresolved absolute and parent-walking ids', () => {
    const data: GraphData = {
      nodes: [doc('source'), doc('/missing/tool.sh'), doc('../../missing/tool.py')],
      links: [
        { source: 'source', target: '/missing/tool.sh' },
        { source: 'source', target: '../../missing/tool.py' },
      ],
    };
    expect(canonicalizeObsidianGraphData(data, new Set(['source'])).links).toEqual(data.links);
  });

  test('deduplicates links after two authored targets resolve to one page', () => {
    const data: GraphData = {
      nodes: [doc('source'), doc('Page'), doc('notes/Page')],
      links: [
        { source: 'source', target: 'Page' },
        { source: 'source', target: 'notes/Page' },
      ],
    };
    const result = canonicalizeObsidianGraphData(data, new Set(['source', 'notes/Page']));
    expect(result.links).toEqual([{ source: 'source', target: 'notes/Page' }]);
  });

  test('hides existing attachments but keeps missing file targets as unresolved nodes', () => {
    const data: GraphData = {
      nodes: [doc('source'), doc('paper.pdf'), doc('missing/tool.py')],
      links: [
        { source: 'source', target: 'paper.pdf' },
        { source: 'source', target: 'missing/tool.py' },
      ],
    };
    const result = canonicalizeObsidianGraphData(data, new Set(['source']), {
      existingAssetPaths: new Set(['papers/raw/paper.pdf']),
    });
    expect(result.links).toEqual([{ source: 'source', target: 'missing/tool.py' }]);
    expect(result.nodes.map((node) => node.id)).toEqual(['source', 'missing/tool.py']);
  });

  test('resolves existing markdown pages relative to the source but preserves unresolved hrefs', () => {
    const data: GraphData = {
      nodes: [doc('notes/source'), doc('../Target.md'), doc('../missing/')],
      links: [
        {
          source: 'notes/source',
          target: '../Target.md',
          authoredSyntax: 'markdown',
        },
        {
          source: 'notes/source',
          target: '../missing/',
          authoredSyntax: 'markdown',
        },
      ],
    };
    const result = canonicalizeObsidianGraphData(data, new Set(['notes/source', 'Target']));
    expect(result.links).toEqual([
      { source: 'notes/source', target: 'Target', authoredSyntax: 'markdown' },
      { source: 'notes/source', target: '../missing/', authoredSyntax: 'markdown' },
    ]);
  });

  test('resolves markdown attachments relative to the source before hiding them', () => {
    const data: GraphData = {
      nodes: [doc('notes/source'), doc('../assets/paper.pdf')],
      links: [
        {
          source: 'notes/source',
          target: '../assets/paper.pdf',
          authoredSyntax: 'markdown',
        },
      ],
    };
    const result = canonicalizeObsidianGraphData(data, new Set(['notes/source']), {
      existingAssetPaths: new Set(['assets/paper.pdf']),
    });
    expect(result.links).toEqual([]);
  });
});
