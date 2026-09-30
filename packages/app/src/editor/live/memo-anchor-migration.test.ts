import { describe, expect, test } from 'bun:test';
import type { DocumentMemoAnchor, DocumentMemoState } from '@/lib/document-memo-store';
import { EMPTY_DOCUMENT_MEMO_STATE } from '@/lib/document-memo-store';
import { memoTextProjection, migrateMemoAnchors } from './memo-anchor-migration';

function state(anchor: DocumentMemoAnchor, markdown = anchor.exact): DocumentMemoState {
  return {
    ...EMPTY_DOCUMENT_MEMO_STATE,
    items: [
      { id: 'legacy', body: 'Keep note', quote: { markdown, anchor }, createdAt: 1, updatedAt: 2 },
    ],
  };
}
const legacy: DocumentMemoAnchor = {
  surface: 'wysiwyg',
  exact: 'first bold &amp; last',
  prefix: '',
  suffix: '',
  from: 1,
  to: 21,
};
describe('memo anchor migration', () => {
  test('projects inline formats, escapes, links, blocks and code with source offsets', () => {
    const source =
      '---\ntitle: hidden\n---\n\n# Heading\n\nfirst **bold** &amp; last\n\n> quote\n> next\n\none\\*two and [link](page.md)\n\n```js\nconst n = 1;\n```';
    const projection = memoTextProjection(source);
    expect(projection.text).toBe(
      'Heading\nfirst bold &amp; last\nquote\nnext\none*two and link\nconst n = 1;',
    );
    const at = projection.text.indexOf('one*two');
    expect(source.slice(projection.from[at], projection.to[at + 'one*two'.length - 1])).toBe(
      'one\\*two',
    );
  });
  test('stores source bytes while preserving the original anchor and note metadata', () => {
    const source = '# Heading\n\nfirst **bold** &amp; last';
    const input = state(legacy);
    const result = migrateMemoAnchors(source, input);
    const quote = result.state.items[0]?.quote;
    expect(result.changed).toBe(true);
    expect(quote?.anchor?.exact).toBe('first **bold** &amp; last');
    expect(quote?.anchor?.surface).toBe('source');
    expect(quote?.legacyAnchor).toEqual(legacy);
    expect(result.state.items[0]?.updatedAt).toBe(2);
    expect(input.items[0]?.quote?.anchor).toBe(legacy);
    expect(migrateMemoAnchors(source, result.state)).toEqual({
      state: result.state,
      changed: false,
      unmatched: [],
    });
  });
  test('uses rendered context to distinguish repeated passages and preserves unmatched records', () => {
    const anchor = { ...legacy, exact: 'word', prefix: 'second ', suffix: ' end' };
    const source = 'first **word** end\n\nsecond *word* end';
    const result = migrateMemoAnchors(source, state(anchor));
    expect(result.state.items[0]?.quote?.anchor?.from).toBe(source.lastIndexOf('word'));
    const input = state({ ...anchor, exact: 'removed passage' });
    expect(migrateMemoAnchors(source, input)).toEqual({
      state: input,
      changed: false,
      unmatched: ['legacy'],
    });
  });
  test('recovers pre-anchor rich quotes and draft quotes without changing source anchors', () => {
    const source = 'a **bold** z';
    const input: DocumentMemoState = {
      ...state({ ...legacy, exact: 'bold' }),
      draft: 'Draft',
      draftQuote: { markdown: '**bold**' },
    };
    const result = migrateMemoAnchors(source, input);
    expect(result.state.draftQuote?.anchor?.exact).toBe('bold');
    expect(result.state.draftQuote?.legacyAnchor?.exact).toBe('bold');
    expect(result.state.draft).toBe('Draft');
  });
});
