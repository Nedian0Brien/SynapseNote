/**
 * GFM callout body shape across the round-trip.
 *
 * The `GFMCallout` serializer in `registry/built-ins.ts` emits the marker as
 * its own block, so any edit inside a callout rewrites it in the
 * `> [!TYPE]\n>\n> body` shape — mdast separates block children with a blank
 * line. That blank `>` line leaves a residual paragraph on the opener line
 * when it parses back, and the transformer has to drop it: keeping it put an
 * empty first line inside every callout the author had ever typed in, and the
 * cycle repeated on each reload.
 */

import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const md = new MarkdownManager({ extensions: sharedExtensions });

interface Shape {
  type: string;
  text: string;
}

function calloutBody(source: string): Shape[] {
  const parsed = md.parse(source) as {
    content?: Array<{ type: string; content?: Array<Record<string, unknown>> }>;
  };
  const callout = (parsed.content ?? []).find((node) => node.type === 'jsxComponent');
  if (!callout) throw new Error(`no callout parsed from ${JSON.stringify(source)}`);
  return (callout.content ?? []).map((child) => ({
    type: String(child.type),
    text: ((child.content ?? []) as Array<{ text?: string }>)
      .map((leaf) => leaf.text ?? '')
      .join(''),
  }));
}

function reserialize(source: string): string {
  // biome-ignore lint/suspicious/noExplicitAny: MarkdownManager takes JSONContent
  return md.serialize(md.parse(source) as any);
}

describe('GFM callout body', () => {
  test.each([
    ['tight, untitled', '> [!NOTE]\n> callout body'],
    ['blank marker line, untitled', '> [!NOTE]\n>\n> callout body'],
    ['tight, titled', '> [!NOTE] My title\n> callout body'],
    ['blank marker line, titled', '> [!NOTE] My title\n>\n> callout body'],
  ])('%s carries the body alone, with no residual opener paragraph', (_label, source) => {
    expect(calloutBody(source)).toEqual([{ type: 'paragraph', text: 'callout body' }]);
  });

  test('a multi-paragraph body keeps every paragraph', () => {
    expect(calloutBody('> [!WARNING]\n>\n> first\n>\n> second')).toEqual([
      { type: 'paragraph', text: 'first' },
      { type: 'paragraph', text: 'second' },
    ]);
  });

  test.each([
    ['tight, untitled', '> [!NOTE]\n> callout body'],
    ['blank marker line, untitled', '> [!NOTE]\n>\n> callout body'],
    ['blank marker line, titled', '> [!NOTE] My title\n>\n> callout body'],
    ['multi-paragraph', '> [!WARNING]\n>\n> first\n>\n> second'],
  ])('%s re-serializes to a fixed point', (_label, source) => {
    const once = reserialize(source);
    expect(reserialize(once)).toBe(once);
  });

  test('the callout survives an edit as a callout, not as a plain quote', () => {
    // What an in-editor edit produces: the marker split onto its own line.
    const edited = '> [!NOTE]\n>\n> edited body';
    const parsed = md.parse(edited) as { content?: Array<{ type: string }> };
    expect(parsed.content?.[0]?.type).toBe('jsxComponent');
    expect(calloutBody(edited)).toEqual([{ type: 'paragraph', text: 'edited body' }]);
  });
});
