import { sha256 } from '@noble/hashes/sha256';
import type { Root } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { mdx } from 'micromark-extension-mdx';

export interface CanonicalCodeBlock {
  readonly index: number;
  readonly markdown: string;
  readonly language?: string;
  readonly lineStart: number;
  readonly lineEnd: number;
}

/** Shared normalization: normalize newlines and remove exactly one final LF. */
export function normalizeCodeBlockMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
}

export function hashCodeBlockMarkdown(markdown: string): string {
  return Array.from(
    sha256(new TextEncoder().encode(normalizeCodeBlockMarkdown(markdown))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** Enumerate raw fenced slices from Markdown/MDX node offsets. */
export function enumerateCanonicalCodeBlocks(source: string): CanonicalCodeBlock[] {
  const tree = fromMarkdown(source, {
    extensions: [mdx()],
    mdastExtensions: [mdxFromMarkdown()],
  }) as Root;
  let index = 0;
  return tree.children.flatMap((node) => {
    if (
      node.type !== 'code' ||
      node.position?.start.offset === undefined ||
      node.position.end.offset === undefined
    )
      return [];
    index += 1;
    const markdown = normalizeCodeBlockMarkdown(
      source.slice(node.position.start.offset, node.position.end.offset),
    );
    return [
      {
        index,
        markdown,
        ...(node.lang ? { language: node.lang } : {}),
        lineStart: node.position.start.line,
        lineEnd: node.position.end.line,
      },
    ];
  });
}
