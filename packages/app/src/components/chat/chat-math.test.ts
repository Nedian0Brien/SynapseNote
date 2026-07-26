import { describe, expect, test } from 'bun:test';
import { normalizeChatMath } from './chat-math';

describe('normalizeChatMath', () => {
  test('normalizes standard LaTeX inline and display delimiters', () => {
    expect(normalizeChatMath('값은 \\(x_i+1\\)입니다.')).toBe('값은 $x_i+1$입니다.');
    expect(normalizeChatMath('\\[\\frac{a}{b}\\]')).toBe('\n\n$$\n\\frac{a}{b}\n$$\n\n');
  });

  test('promotes a standalone model-style bracket formula', () => {
    expect(
      normalizeChatMath('[ \\mathrm{nDCG@k}=\\frac{\\mathrm{DCG@k}}{\\mathrm{IDCG@k}} ]'),
    ).toBe('$$\n\\mathrm{nDCG@k}=\\frac{\\mathrm{DCG@k}}{\\mathrm{IDCG@k}}\n$$');
  });

  test('leaves ordinary brackets and code unchanged', () => {
    const source = [
      '일반적인 [설명]은 텍스트입니다.',
      '`\\(inline_code\\)`',
      '```md',
      '\\[not_math\\]',
      '```',
    ].join('\n');
    expect(normalizeChatMath(source)).toBe(source);
  });

  test('leaves incomplete delimiters visible while a response streams', () => {
    expect(normalizeChatMath('계산 중: \\(x+1')).toBe('계산 중: \\(x+1');
    expect(normalizeChatMath('\\[\\frac{a}{b}')).toBe('\\[\\frac{a}{b}');
  });
});
