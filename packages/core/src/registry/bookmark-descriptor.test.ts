/**
 * `<Bookmark>` — the descriptor's markdown contract.
 *
 * A bookmark carries page metadata captured at creation time, which means
 * its props are the only place that text lives. Two things must hold or
 * the card silently loses what it captured: authored bytes round-trip
 * unchanged, and a programmatic insert (dirty node, props only) serializes
 * every prop it holds and nothing it doesn't.
 */

import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from '../markdown/index.ts';
import { builtInComponents } from './built-ins.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

/** Serialize a freshly-built (dirty) Bookmark node with the given props. */
function serializeFresh(props: Record<string, unknown>): string {
  return mdManager.serialize({
    type: 'doc',
    content: [
      {
        type: 'jsxComponent',
        attrs: {
          componentName: 'Bookmark',
          kind: 'element',
          attributes: [],
          sourceRaw: '',
          sourceDirty: true,
          props,
        },
      },
    ],
  });
}

describe('Bookmark descriptor', () => {
  test('is a registered self-closing canonical', () => {
    const descriptor = builtInComponents.find((meta) => meta.name === 'Bookmark');
    if (!descriptor) throw new Error('Bookmark descriptor is not registered');
    expect(descriptor.surface).toBe('canonical');
    expect(descriptor.isSelfClosing).toBe(true);
    expect(descriptor.hasChildren).toBe(false);
    expect(descriptor.props.map((p) => p.name)).toEqual([
      'src',
      'title',
      'description',
      'image',
      'favicon',
    ]);
    expect(descriptor.props.find((p) => p.name === 'src')?.required).toBe(true);
  });

  test('authored bytes round-trip unchanged', () => {
    const md =
      '<Bookmark src="https://example.com/docs" title="Example Domain" description="Reserved for documentation." image="https://cdn.example.com/og.png" favicon="https://example.com/favicon.ico" />\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('a URL-only bookmark round-trips without gaining empty props', () => {
    const md = '<Bookmark src="https://example.com" />\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('a freshly inserted card serializes every captured field', () => {
    const out = serializeFresh({
      src: 'https://example.com/docs',
      title: 'Example Domain',
      description: 'Reserved for documentation.',
      image: 'https://cdn.example.com/og.png',
      favicon: 'https://example.com/favicon.ico',
    });
    expect(out).toContain('src="https://example.com/docs"');
    expect(out).toContain('title="Example Domain"');
    expect(out).toContain('description="Reserved for documentation."');
    expect(out).toContain('image="https://cdn.example.com/og.png"');
    expect(out).toContain('favicon="https://example.com/favicon.ico"');
  });

  test('props the fetch never produced are omitted, not emitted empty', () => {
    const out = serializeFresh({ src: 'https://example.com' });
    expect(out.trim()).toBe('<Bookmark src="https://example.com" />');
  });
});
