import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderLinguiTemplate } from '@/test-utils/lingui-mock';

mock.module('@lingui/react/macro', () => ({
  Trans: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useLingui: () => ({
    t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
      renderLinguiTemplate(strings, ...values),
  }),
}));

afterEach(cleanup);

describe('FolderMarkdownPreview', () => {
  test('renders Markdown hierarchy instead of flattening the document to text', async () => {
    const { FolderMarkdownPreview } = await import('./FolderDocumentCard');
    const { container } = render(
      <FolderMarkdownPreview
        title="Project Plan"
        markdown={[
          '# Project Plan',
          '',
          'A **rich** paragraph with [a link](https://example.com).',
          '',
          '## Goals',
          '- [ ] Ship the gallery',
          '  - Keep nested structure',
          '',
          '---',
          '',
          '![diagram](https://example.com/diagram.png)',
        ].join('\n')}
      />,
    );

    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('h2')?.textContent).toBe('Goals');
    expect(container.querySelector('strong')?.textContent).toBe('rich');
    expect(container.querySelector('ul ul')?.textContent).toContain('Keep nested structure');
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(container.querySelector('hr')).not.toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/diagram.png',
    );
    expect(container.querySelector('a')).toBeNull();
  });
});
