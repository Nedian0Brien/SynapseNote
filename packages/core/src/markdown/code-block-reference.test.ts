import { describe, expect, test } from 'bun:test';
import { enumerateCanonicalCodeBlocks, hashCodeBlockMarkdown } from './code-block-reference.ts';

describe('code-block references', () => {
  test('enumerates raw MDX and non-default fences with exact locations', () => {
    const source = 'before\n\n<Callout>hi</Callout>\n\n~~~python\nprint("target")\n~~~\n\nafter\n';
    const [block] = enumerateCanonicalCodeBlocks(source);
    if (block === undefined) throw new Error('Expected one code block');
    expect(block).toMatchObject({ index: 1, language: 'python', lineStart: 5, lineEnd: 7 });
    expect(block.markdown).toBe('~~~python\nprint("target")\n~~~');
    expect(source.slice(source.indexOf('~~~'), source.indexOf('~~~') + block.markdown.length)).toBe(
      block.markdown,
    );
    expect(block.markdown).not.toContain('before');
    expect(block.markdown).not.toContain('after');
  });

  test('hash normalization removes only one final newline', () => {
    expect(hashCodeBlockMarkdown('```js\nvalue\n```\n')).toBe(
      hashCodeBlockMarkdown('```js\nvalue\n```'),
    );
  });
});
