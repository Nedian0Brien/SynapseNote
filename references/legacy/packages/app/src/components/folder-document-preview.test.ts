import { describe, expect, test } from 'bun:test';
import {
  FOLDER_DOCUMENT_CARD_MAX_HEIGHT,
  FOLDER_DOCUMENT_CARD_MIN_HEIGHT,
  folderDocumentEstimatedCardHeight,
  folderDocumentMeasuredCardHeight,
  folderDocumentPreviewMarkdown,
} from './folder-document-preview';

describe('folderDocumentPreviewMarkdown', () => {
  test('removes frontmatter and the duplicate page title without flattening Markdown', () => {
    const markdown = folderDocumentPreviewMarkdown(
      [
        '---',
        'title: Project Plan',
        'tags: [work]',
        '---',
        '# Project **Plan**',
        '',
        'A **short** intro with [a link](https://example.com).',
        '',
        '## Goals',
        '- [ ] Ship the gallery',
        '1. Verify the result',
        '',
        '![diagram](diagram.png)',
      ].join('\n'),
      'Project Plan',
    );

    expect(markdown).not.toContain('title: Project Plan');
    expect(markdown).not.toContain('# Project **Plan**');
    expect(markdown).toContain('**short**');
    expect(markdown).toContain('[a link](https://example.com)');
    expect(markdown).toContain('- [ ] Ship the gallery');
    expect(markdown).toContain('![diagram](diagram.png)');
  });
});

describe('folder document card height', () => {
  test('uses content size only as a bounded pre-load estimate', () => {
    expect(folderDocumentEstimatedCardHeight(0)).toBe(FOLDER_DOCUMENT_CARD_MIN_HEIGHT);
    expect(folderDocumentEstimatedCardHeight(6_000)).toBeGreaterThan(
      folderDocumentEstimatedCardHeight(100),
    );
    expect(folderDocumentEstimatedCardHeight(100_000)).toBe(FOLDER_DOCUMENT_CARD_MAX_HEIGHT);
  });

  test('clamps the measured rendered page between the reference bounds', () => {
    expect(folderDocumentMeasuredCardHeight(40, 20)).toBe(FOLDER_DOCUMENT_CARD_MIN_HEIGHT);
    expect(folderDocumentMeasuredCardHeight(40, 680)).toBe(230);
    expect(folderDocumentMeasuredCardHeight(60, 1_000)).toBe(FOLDER_DOCUMENT_CARD_MAX_HEIGHT);
  });
});
