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

  test('recovers an ASCII-underlined LLM equation from the Setext parser shape', () => {
    const source = [
      '[',
      String.raw`\mathcal L\_{\text{Distillation}}`,
      '================================',
      '',
      String.raw`-\sum \log P(\tilde S_d\mid I,d;\theta)`,
      ']',
    ].join('\n');
    const node = firstNode(source);

    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs.componentName).toBe('DollarMath');
    expect(node?.attrs.props.formula).toBe(
      [
        String.raw`\mathcal L_{\text{Distillation}}`,
        '=',
        '',
        String.raw`-\sum \log P(\tilde S_d\mid I,d;\theta)`,
      ].join('\n'),
    );
    expect(markdown.serialize(markdown.parse(source)).trim()).toBe(source);
  });

  test('normalizes Markdown-escaped operators inside a bare bracket score equation', () => {
    const source = [
      '[',
      String.raw`r\_{\text{final}}(d)`,
      '===================',
      '',
      String.raw`\alpha r_d`,
      String.raw`\+`,
      String.raw`(1-\alpha)`,
      String.raw`\max\_{s\in S_d}r_s`,
      ']',
    ].join('\n');
    const node = firstNode(source);

    expect(node?.type).toBe('jsxComponent');
    expect(node?.attrs.props.formula).toBe(
      [
        String.raw`r_{\text{final}}(d)`,
        '=',
        '',
        String.raw`\alpha r_d`,
        '+',
        String.raw`(1-\alpha)`,
        String.raw`\max_{s\in S_d}r_s`,
      ].join('\n'),
    );
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

  test('preserves prose parentheses around explicit dollar-delimited math', () => {
    const source =
      '점수는 count-normalized log-sum-exp로($r_{leaf}$), scenario는 max로($r_{scenario}$) 집계한다.';
    const parsed = markdown.parse(source);
    const content = parsed.content?.[0]?.content ?? [];
    const formulas = content
      .filter((node) => node.type === 'mathInline')
      .map((node) => node.attrs.formula);

    expect(formulas).toEqual(['r_{leaf}', 'r_{scenario}']);
    expect(content.some((node) => node.type === 'mathInline' && node.text?.includes('$'))).toBe(
      false,
    );
    expect(markdown.serialize(parsed).trim()).toBe(source);
  });

  test('renders a LaTeX command with nested function parentheses', () => {
    const source = '할인 항은 (\\log_2(i+1))로 계산합니다.';
    const parsed = markdown.parse(source);
    const inline = parsed.content?.[0]?.content?.find((node) => node.type === 'mathInline');

    expect(inline?.attrs.formula).toBe('(\\log_2(i+1))');
    expect(inline?.attrs.sourceDelimiter).toBe('implicit-parens');
    expect(markdown.serialize(parsed).trim()).toBe(source);
  });

  test('renders standard LaTeX delimiters around nested parentheses', () => {
    const source = '할인 항은 \\(\\log_2(i+1)\\)로 계산합니다.';
    const parsed = markdown.parse(source);
    const inline = parsed.content?.[0]?.content?.find((node) => node.type === 'mathInline');

    expect(inline?.attrs.formula).toBe('\\log_2(i+1)');
    expect(inline?.attrs.sourceDelimiter).toBe('\\(');
    expect(markdown.serialize(parsed).trim()).toBe(source);
  });

  test('prefers an inner formula over surrounding prose parentheses', () => {
    const source = '설명(예시는 ({q_i,d_i}) 형태입니다)을 이어갑니다.';
    const parsed = markdown.parse(source);
    const content = parsed.content?.[0]?.content ?? [];
    const inline = content.find((node) => node.type === 'mathInline');

    expect(inline?.attrs.formula).toBe('({q_i,d_i})');
    expect(content[0]?.text).toBe('설명(예시는 ');
    expect(content.at(-1)?.text).toBe(' 형태입니다)을 이어갑니다.');
    expect(markdown.serialize(parsed).trim()).toBe(source);
  });

  test('leaves ordinary or unbalanced nested parentheses as prose', () => {
    for (const source of ['설명(바깥(안쪽) 문장)입니다.', '수식 후보 (\\log_2(i+1)']) {
      const parsed = markdown.parse(source);
      expect(parsed.content?.[0]?.content?.some((node) => node.type === 'mathInline')).toBe(false);
      expect(markdown.serialize(parsed).trim()).toBe(source);
    }
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

  test('does not consume bracketed Markdown block constructs', () => {
    for (const source of [
      '[\n- list item with x_y\n]',
      '[\n> quoted \\alpha prose\n]',
      '[\n```txt\nx_y\n```\n]',
    ]) {
      expect(firstNode(source)?.attrs?.componentName).not.toBe('DollarMath');
    }
  });
});
