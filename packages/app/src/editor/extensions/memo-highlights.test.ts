import { describe, expect, test } from 'bun:test';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import type { DocumentMemoAnchor } from '@/lib/document-memo-store';
import {
  collectNativeHighlights,
  legacyMemoQuoteText,
  memoHighlightPlugin,
  memoHighlightPluginKey,
  resolveMemoAnchor,
} from './memo-highlights';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    text: { group: 'inline' },
  },
  marks: {
    highlight: {
      parseDOM: [{ tag: 'mark' }],
      toDOM: () => ['mark', 0],
    },
  },
});

function documentWith(...paragraphs: string[]) {
  return schema.node(
    'doc',
    null,
    paragraphs.map((text) => schema.node('paragraph', null, text ? schema.text(text) : undefined)),
  );
}

function anchor(overrides: Partial<DocumentMemoAnchor> = {}): DocumentMemoAnchor {
  return {
    surface: 'wysiwyg',
    exact: 'Repeated evidence',
    prefix: '',
    suffix: '',
    from: 1,
    to: 18,
    ...overrides,
  };
}

describe('memo highlight anchoring', () => {
  test('uses the stored PM range when the passage is unchanged', () => {
    const doc = documentWith('Repeated evidence remains useful.');
    expect(resolveMemoAnchor(doc, anchor())).toEqual({ from: 1, to: 18 });
  });

  test('re-finds a moved passage using surrounding context', () => {
    const doc = documentWith(
      'First section',
      'Repeated evidence in the wrong section.',
      'Decisive context',
      'Repeated evidence in the right section.',
      'Expected conclusion',
    );
    const range = resolveMemoAnchor(
      doc,
      anchor({
        from: 999,
        to: 1_016,
        prefix: 'Decisive context\n',
        suffix: ' in the right section.\nExpected conclusion',
      }),
    );
    expect(range).not.toBeNull();
    expect(doc.textBetween(range?.from ?? 0, range?.to ?? 0, '\n', '\uFFFC')).toBe(
      'Repeated evidence',
    );
    expect(range?.from).toBeGreaterThan(40);
  });

  test('does not create a rendered highlight for source-only anchors', () => {
    const doc = documentWith('Repeated evidence');
    expect(resolveMemoAnchor(doc, anchor({ surface: 'source' }))).toBeNull();
  });

  test('builds lower-half highlight decorations from a live memo-state update', () => {
    const doc = documentWith('Repeated evidence remains useful.');
    const state = EditorState.create({ doc, plugins: [memoHighlightPlugin('notes/today')] });
    const next = state.apply(
      state.tr.setMeta(memoHighlightPluginKey, {
        memoState: {
          draft: '',
          draftQuote: null,
          items: [
            {
              id: 'memo-1',
              body: 'Review this',
              quote: { markdown: 'Repeated evidence', anchor: anchor() },
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      }),
    );
    const decorations = memoHighlightPluginKey.getState(next)?.decorations.find();
    expect(decorations).toHaveLength(1);
    expect(decorations?.[0]?.from).toBe(1);
    expect(decorations?.[0]?.to).toBe(18);
    expect(decorations?.[0]?.type.attrs.class).toBe('ok-memo-highlight ok-memo-highlight-memo');
  });

  test('derives sidebar annotations directly from native highlight marks', () => {
    const highlightMark = schema.marks.highlight.create();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('Repeated evidence', [highlightMark]),
        schema.text(' remains useful.'),
      ]),
    ]);
    const highlights = collectNativeHighlights(doc);
    expect(highlights).toHaveLength(1);
    expect(highlights[0]?.quote.markdown).toBe('Repeated evidence');
    expect(highlights[0]?.quote.anchor).toMatchObject({ from: 1, to: 18 });

    const state = EditorState.create({ doc, plugins: [memoHighlightPlugin('notes/native')] });
    expect(memoHighlightPluginKey.getState(state)?.nativeHighlights).toEqual(highlights);
    expect(memoHighlightPluginKey.getState(state)?.decorations.find()).toHaveLength(0);
  });

  test('recovers a pre-anchor bold Markdown quote from rendered text', () => {
    const exact = '지식 집약적 NLP 과제에서 검색기가 반드시 필요한가';
    expect(legacyMemoQuoteText(`**${exact}**`)).toBe(exact);

    const doc = documentWith(`이 연구의 목적은 ${exact}라는 질문을 검증하는 것입니다.`);
    const state = EditorState.create({ doc, plugins: [memoHighlightPlugin('notes/legacy')] });
    const next = state.apply(
      state.tr.setMeta(memoHighlightPluginKey, {
        memoState: {
          draft: '',
          draftQuote: null,
          items: [
            {
              id: 'legacy-memo',
              body: '기존 메모',
              quote: { markdown: `**${exact}**` },
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
      }),
    );
    const decoration = memoHighlightPluginKey.getState(next)?.decorations.find()[0];
    expect(decoration).toBeDefined();
    expect(doc.textBetween(decoration?.from ?? 0, decoration?.to ?? 0)).toBe(exact);
  });
});
