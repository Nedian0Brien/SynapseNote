import { describe, expect, test } from 'bun:test';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const markdown = new MarkdownManager({ extensions: sharedExtensions });

function firstNode(source: string) {
  return markdown.parse(source).content?.[0];
}

describe('implicit math compatibility promotion', () => {
  test('renders an LLM-style bare bracket display equation as block math', () => {
    const source = '[\n\\hat d=\\arg\\max_d p(d\\mid q,\\theta)\n\n]';
    const node = firstNode(source);

    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs.componentName).toBe('DollarMath');
    expect(node?.attrs.props.formula).toBe('\\hat d=\\arg\\max_d p(d\\mid q,\\theta)');
    expect(markdown.serialize(markdown.parse(source)).trim()).toBe(source);
  });

  test('renders standard LaTeX bracket delimiters and preserves their source', () => {
    const source = '\\[\nE = mc^2\n\\]';
    const node = firstNode(source);

    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs.componentName).toBe('DollarMath');
    expect(node?.attrs.props.formula).toBe('E = mc^2');
    expect(markdown.serialize(markdown.parse(source)).trim()).toBe(source);
  });

  test('renders compact generated notation inside prose as inline math', () => {
    const source = '이에 따라 ({q_i,d_i}) 형태의 질문-문서 쌍이 만들어집니다.';
    const parsed = markdown.parse(source);
    const inline = parsed.content?.[0]?.content?.find((node) => node.type === 'mathInline');

    expect(inline?.attrs.formula).toBe('({q_i,d_i})');
    expect(inline?.attrs.sourceDelimiter).toBe('implicit-parens');
    expect(markdown.serialize(parsed).trim()).toBe(source);
  });

  test('renders compact generated notation inside a list item', () => {
    const source = '- 이에 따라 ({q_i,d_i}) 형태의 질문-문서 쌍이 만들어집니다.';
    const parsed = markdown.parse(source);
    const paragraph = parsed.content?.[0]?.content?.[0]?.content?.[0];
    const inline = paragraph?.content?.find((node) => node.type === 'mathInline');

    expect(inline?.attrs.formula).toBe('({q_i,d_i})');
    expect(markdown.serialize(parsed).trim()).toBe(source);
  });

  test('renders standard LaTeX inline parentheses and preserves their source', () => {
    const source = '합은 \\(x + y\\)로 둡니다.';
    const parsed = markdown.parse(source);
    const inline = parsed.content?.[0]?.content?.find((node) => node.type === 'mathInline');

    expect(inline?.attrs.formula).toBe('x + y');
    expect(inline?.attrs.sourceDelimiter).toBe('\\(');
    expect(markdown.serialize(parsed).trim()).toBe(source);
  });

  test('does not mistake ordinary parentheses or snake_case prose for math', () => {
    for (const source of ['일반 괄호(설명)는 그대로입니다.', 'Use (snake_case) in code.']) {
      const parsed = markdown.parse(source);
      expect(parsed.content?.[0]?.content?.some((node) => node.type === 'mathInline')).toBe(false);
      expect(markdown.serialize(parsed).trim()).toBe(source);
    }
  });

  test('does not promote an ordinary bare bracketed prose block', () => {
    const source = '[\nthis is a note\n]';
    expect(firstNode(source)?.type).toBe('paragraph');
    expect(markdown.serialize(markdown.parse(source)).trim()).toBe(source);
  });
});
