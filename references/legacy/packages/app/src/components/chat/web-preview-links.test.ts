import { describe, expect, test } from 'bun:test';
import { extractWebPreviewLinks } from './web-preview-links';

describe('web preview links', () => {
  test('uses Markdown link text as the card title', () => {
    expect(extractWebPreviewLinks('[OpenAI Research](https://openai.com/research/)')).toEqual([
      {
        url: 'https://openai.com/research/',
        title: 'OpenAI Research',
        hostname: 'openai.com',
        location: 'openai.com/research/',
      },
    ]);
  });

  test('deduplicates bare URLs already present in Markdown links', () => {
    const links = extractWebPreviewLinks(
      '[OpenAI](https://openai.com/) and again https://openai.com/.',
    );
    expect(links).toHaveLength(1);
    expect(links[0]?.title).toBe('OpenAI');
  });

  test('limits a response to four cards and ignores unsafe schemes', () => {
    const links = extractWebPreviewLinks(
      'javascript:alert(1) https://a.test https://b.test https://c.test https://d.test https://e.test',
    );
    expect(links.map((link) => link.hostname)).toEqual(['a.test', 'b.test', 'c.test', 'd.test']);
  });
});
