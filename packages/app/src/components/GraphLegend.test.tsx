import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as actualNextThemes from 'next-themes';
import type { ReactElement, ReactNode } from 'react';

const useThemeMock = mock(() => ({ resolvedTheme: 'light' as const }));

mock.module('next-themes', () => ({
  ...actualNextThemes,
  useTheme: useThemeMock,
}));

type ElementWithChildren = ReactElement<{ children?: ReactNode; className?: string }>;

function childrenArray(node: ReactNode): ReactNode[] {
  return Array.isArray(node) ? node : [node];
}

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (!node || typeof node !== 'object') {
    return '';
  }
  const element = node as ElementWithChildren;
  return childrenArray(element.props.children).map(textContent).join('');
}

describe('GraphLegend', () => {
  beforeEach(() => {
    useThemeMock.mockReset();
    useThemeMock.mockReturnValue({ resolvedTheme: 'light' });
  });

  test('renders nothing when no group colors anything', async () => {
    const { GraphLegend } = await import('./GraphLegend');
    expect(GraphLegend({ variant: 'docked' })).toBeNull();
    expect(GraphLegend({ groups: [], variant: 'docked' })).toBeNull();
  });

  test('ignores a group with no query, which colors nothing', async () => {
    // A half-finished row must not put an entry in the legend.
    const { GraphLegend } = await import('./GraphLegend');
    expect(
      GraphLegend({ groups: [{ id: 'a', query: '   ', color: '#60a5fa' }], variant: 'docked' }),
    ).toBeNull();
  });

  test('lists each active group by its query', async () => {
    const { GraphLegend } = await import('./GraphLegend');
    const legend = GraphLegend({
      groups: [
        { id: 'a', query: 'kayak', color: '#60a5fa' },
        { id: 'b', query: 'draft', color: '#f472b6' },
      ],
      variant: 'fullscreen',
    }) as ElementWithChildren;

    const children = childrenArray(legend.props.children);
    expect(textContent(children[0])).toBe('Groups');
    const rendered = children.flat().map(textContent).join('|');
    expect(rendered).toContain('kayak');
    expect(rendered).toContain('draft');
  });

  test('uses a smaller docked layout and truncates visible entries earlier', async () => {
    const { GraphLegend } = await import('./GraphLegend');
    const legend = GraphLegend({
      groups: ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta'].map((query, index) => ({
        id: String(index),
        query,
        color: '#60a5fa',
      })),
      variant: 'docked',
    }) as ElementWithChildren;

    expect(legend.props.className).toContain('bottom-2');
    expect(legend.props.className).toContain('text-[11px]');

    const children = childrenArray(legend.props.children);
    expect(textContent(children[0])).toBe('Groups');
    expect(textContent(children.at(-1) ?? null)).toBe('+ 1 more');
  });

  test('keeps the fullscreen layout roomier and shows more entries before overflow', async () => {
    const { GraphLegend } = await import('./GraphLegend');
    const legend = GraphLegend({
      groups: ['1', '2', '3', '4', '5', '6', '7'].map((query, index) => ({
        id: String(index),
        query,
        color: '#60a5fa',
      })),
      variant: 'fullscreen',
    }) as ElementWithChildren;

    expect(legend.props.className).toContain('bottom-3');
    expect(legend.props.className).toContain('text-xs');

    const children = childrenArray(legend.props.children);
    expect(textContent(children.at(-1) ?? null)).not.toContain('more');
  });
});
