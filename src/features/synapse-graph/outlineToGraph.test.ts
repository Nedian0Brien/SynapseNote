import { View, ViewLayout } from '@/application/types';

import { outlineToGraph } from './outlineToGraph';

function view(view_id: string, name: string, children: View[] = []): View {
  return {
    view_id,
    name,
    children,
    layout: ViewLayout.Document,
  } as View;
}

describe('outlineToGraph', () => {
  it('keeps outline directory edges and merges current document wikilinks', () => {
    const graph = outlineToGraph(
      [
        view('root', 'Root', [
          view('source', 'Source'),
          view('target', 'Target'),
        ]),
      ],
      [
        {
          source: 'source',
          target: 'target',
          edge_type: 'wikilink',
        },
      ]
    );

    expect(graph.nodes.map((node) => node.id)).toEqual(['root', 'source', 'target']);
    expect(graph.edges).toEqual([
      {
        source: 'root',
        target: 'source',
        edge_type: 'directory',
      },
      {
        source: 'root',
        target: 'target',
        edge_type: 'directory',
      },
      {
        source: 'source',
        target: 'target',
        edge_type: 'wikilink',
      },
    ]);
    expect(graph.stats).toEqual({ nodes: 3, edges: 3 });
  });

  it('drops duplicate or unknown extra edges', () => {
    const graph = outlineToGraph(
      [view('source', 'Source'), view('target', 'Target')],
      [
        {
          source: 'source',
          target: 'target',
          edge_type: 'wikilink',
        },
        {
          source: 'source',
          target: 'target',
          edge_type: 'wikilink',
        },
        {
          source: 'source',
          target: 'missing',
          edge_type: 'wikilink',
        },
      ]
    );

    expect(graph.edges).toEqual([
      {
        source: 'source',
        target: 'target',
        edge_type: 'wikilink',
      },
    ]);
    expect(graph.stats).toEqual({ nodes: 2, edges: 1 });
  });
});
