import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const markdown = new MarkdownManager({ extensions: sharedExtensions });

function inlineContent(source: string) {
  const paragraph = markdown.parse(source).content?.[0];
  expect(paragraph?.type).toBe('paragraph');
  return paragraph?.content ?? [];
}

describe('CJK-adjacent strong compatibility', () => {
  test('renders parenthesized English terms before Korean particles as strong', () => {
    const source =
      '**nDCG(normalized Discounted Cumulative Gain)**는 각 결과의 **관련도(relevance)**와 **순위(position)**를 함께 반영한다.\n';

    const content = inlineContent(source);
    expect(content).toEqual([
      {
        type: 'text',
        marks: [{ type: 'strong', attrs: { sourceDelimiter: '**' } }],
        text: 'nDCG(normalized Discounted Cumulative Gain)',
      },
      { type: 'text', text: '는 각 결과의 ' },
      {
        type: 'text',
        marks: [{ type: 'strong', attrs: { sourceDelimiter: '**' } }],
        text: '관련도(relevance)',
      },
      { type: 'text', text: '와 ' },
      {
        type: 'text',
        marks: [{ type: 'strong', attrs: { sourceDelimiter: '**' } }],
        text: '순위(position)',
      },
      { type: 'text', text: '를 함께 반영한다.' },
    ]);
    expect(markdown.serialize(markdown.parse(source))).toBe(source);
  });

  test('preserves underscore delimiter fidelity', () => {
    const source = '__DCG(Discounted Cumulative Gain)__는 지표다.\n';
    const content = inlineContent(source);
    expect(content[0]).toEqual({
      type: 'text',
      marks: [{ type: 'strong', attrs: { sourceDelimiter: '__' } }],
      text: 'DCG(Discounted Cumulative Gain)',
    });
    expect(markdown.serialize(markdown.parse(source))).toBe(source);
  });

  test('leaves non-CJK CommonMark ambiguity literal', () => {
    expect(inlineContent('**term(value)**next')).toEqual([
      { type: 'text', text: '**term(value)**next' },
    ]);
  });

  test('leaves escaped markers literal', () => {
    expect(inlineContent('\\**term(value)**는')).toEqual([
      {
        type: 'text',
        marks: [{ type: 'escapeMark' }],
        text: '*',
      },
      { type: 'text', text: '*term(value)**는' },
    ]);
  });

  test('keeps intraword underscore delimiters literal', () => {
    expect(inlineContent('prefix__term(value)__는')).toEqual([
      { type: 'text', text: 'prefix__term(value)__는' },
    ]);
  });
});
