import { afterEach, describe, expect, test } from 'bun:test';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { renderToString } from 'react-dom/server';
import { markdownTitleToPlainText, PageHeader } from './PageHeader';

const DUMMY_WS = 'ws://localhost:1/collab';
const providers: HocuspocusProvider[] = [];

function makeProvider(docName: string, source = ''): HocuspocusProvider {
  const provider = new HocuspocusProvider({ url: DUMMY_WS, name: docName });
  providers.push(provider);
  if (source) provider.document.getText('source').insert(0, source);
  return provider;
}

afterEach(() => {
  for (const provider of providers.splice(0)) provider.destroy();
});

describe('PageHeader', () => {
  test('renders the fallback document title without optional page decoration', () => {
    const html = renderToString(
      <PageHeader
        provider={makeProvider('notes')}
        docName="notes"
        docExt=".md"
        fallbackTitle="Notes"
      />,
    );

    expect(html).toContain('data-testid="page-header"');
    expect(html).toContain('data-testid="page-header-title"');
    expect(html).toContain('contentEditable="plaintext-only"');
    expect(html).toContain('>Notes</h1>');
    expect(html).not.toContain('data-testid="page-header-cover"');
    expect(html).not.toContain('data-testid="page-header-icon"');
  });

  test('uses the filename-derived title even when frontmatter has a title', () => {
    const provider = makeProvider(
      'notes',
      '---\ntitle: Frontmatter title\ntags: [docs]\n---\nBody',
    );
    const html = renderToString(
      <PageHeader provider={provider} docName="notes" docExt=".md" fallbackTitle="Notes" />,
    );

    expect(html).toContain('>Notes</h1>');
    expect(html).not.toContain('>Frontmatter title</h1>');
  });

  test('renders Markdown-emphasized titles without visible authoring markers', () => {
    const provider = makeProvider('notes');
    const html = renderToString(
      <PageHeader
        provider={provider}
        docName="notes"
        docExt=".md"
        fallbackTitle="**Important notes**"
      />,
    );

    expect(html).toContain('>Important notes</h1>');
    expect(html).not.toContain('**Important notes**');
  });

  test('hides generated file-citation metadata and its encoded spacer', () => {
    const citation = '\uE200filecite\uE202turn0file0\uE201';
    const provider = makeProvider('notes');
    const html = renderToString(
      <PageHeader
        provider={provider}
        docName="notes"
        docExt=".md"
        fallbackTitle={`Report&#x20;${citation}`}
      />,
    );

    expect(html).toContain('>Report</h1>');
    expect(html).not.toContain('filecite');
    expect(html).not.toContain('&amp;#x20;');
  });

  test('renders cover and icon as decorative header elements alongside the title', () => {
    const provider = makeProvider(
      'notes',
      '---\nicon: "📚"\ncover: https://example.com/cover.jpg\n---\nBody',
    );
    const html = renderToString(
      <PageHeader provider={provider} docName="notes" docExt=".md" fallbackTitle="Notes" />,
    );

    expect(html).toContain('data-testid="page-header-cover"');
    expect(html).toContain('data-testid="page-header-icon"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('>Notes</h1>');
  });
});

describe('markdownTitleToPlainText', () => {
  test('unwraps common inline Markdown while preserving its visible text', () => {
    expect(markdownTitleToPlainText('**Bold** and _italic_')).toBe('Bold and italic');
    expect(markdownTitleToPlainText('[Guide](https://example.com) and `code`')).toBe(
      'Guide and code',
    );
    expect(markdownTitleToPlainText('~~Old~~ **new**')).toBe('Old new');
  });

  test('preserves unmatched literal marker characters', () => {
    expect(markdownTitleToPlainText('Budget * draft')).toBe('Budget * draft');
  });

  test('removes only complete file-citation tokens and decodes whitespace entities', () => {
    const citation = '\uE200filecite\uE202turn0file0\uE202L1-L3\uE201';

    expect(markdownTitleToPlainText(`Report&#x20;${citation}`)).toBe('Report');
    expect(markdownTitleToPlainText('A&#32;B&nbsp;C')).toBe('A B C');
    expect(markdownTitleToPlainText('Keep \uE200filecite without a closing frame')).toBe(
      'Keep \uE200filecite without a closing frame',
    );
  });
});
