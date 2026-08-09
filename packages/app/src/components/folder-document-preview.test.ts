import { describe, expect, test } from 'bun:test';
import { buildFolderDocumentPreview, folderDocumentCardHeight } from './folder-document-preview';

describe('buildFolderDocumentPreview', () => {
  test('removes frontmatter and the duplicate page title while preserving document structure', () => {
    const blocks = buildFolderDocumentPreview(
      [
        '---',
        'title: Project Plan',
        'tags: [work]',
        '---',
        '# Project Plan',
        '',
        'A **short** intro with [a link](https://example.com).',
        '',
        '## Goals',
        '- Ship the gallery',
        '1. Verify the result',
        '',
        '```ts',
        'const ready = true;',
        '```',
      ].join('\n'),
      'Project Plan',
    );

    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'A short intro with a link.' },
      { kind: 'heading', level: 2, text: 'Goals' },
      { kind: 'list', ordered: false, text: 'Ship the gallery' },
      { kind: 'list', ordered: true, text: 'Verify the result' },
      { kind: 'code', text: 'const ready = true;' },
    ]);
  });

  test('reduces wiki links, images, blockquotes, and MDX wrappers to readable text', () => {
    const blocks = buildFolderDocumentPreview(
      [
        'import { Callout } from "x";',
        '<Callout>',
        '> Read [[Research|the source]] before ![diagram](diagram.png).',
        '</Callout>',
      ].join('\n'),
      'Notes',
    );

    expect(blocks).toEqual([{ kind: 'paragraph', text: 'Read the source before diagram.' }]);
  });

  test('honors block and character bounds for large notes', () => {
    const markdown = Array.from({ length: 40 }, (_, index) => `Paragraph ${index}.\n`).join('\n');
    const blocks = buildFolderDocumentPreview(markdown, 'Large', {
      maxBlocks: 3,
      maxCharacters: 30,
    });

    expect(blocks).toHaveLength(3);
    expect(blocks.reduce((total, block) => total + block.text.length, 0)).toBeLessThanOrEqual(30);
  });
});

describe('folderDocumentCardHeight', () => {
  test('is deterministic, bounded, and gives longer documents more paper space', () => {
    expect(folderDocumentCardHeight(100, 'notes/a')).toBe(folderDocumentCardHeight(100, 'notes/a'));
    expect(folderDocumentCardHeight(6_000, 'notes/a')).toBeGreaterThan(
      folderDocumentCardHeight(100, 'notes/a'),
    );
    expect(folderDocumentCardHeight(0, 'notes/a')).toBeGreaterThanOrEqual(188);
    expect(folderDocumentCardHeight(100_000, 'notes/a')).toBeLessThanOrEqual(260);
  });
});
