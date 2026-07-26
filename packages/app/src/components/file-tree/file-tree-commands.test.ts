import { describe, expect, test } from 'bun:test';
import {
  alternateMarkdownTreePath,
  collectTabsToCloseForDelete,
  hasSameStemMarkdownSiblingTreePath,
  selectedTreePathsToDeleteTargets,
} from './file-tree-commands';

describe('file-tree command boundary', () => {
  test('normalizes the alternate markdown extension without owning render state', () => {
    expect(alternateMarkdownTreePath('notes.md')).toBe('notes.mdx');
    expect(alternateMarkdownTreePath('notes.mdx')).toBe('notes.md');
    expect(alternateMarkdownTreePath('LICENSE')).toBeNull();
    expect(hasSameStemMarkdownSiblingTreePath('notes.md', ['notes.mdx'])).toBe(true);
  });

  test('collapses nested selections and excludes managed .ok rows', () => {
    const documents = [
      { kind: 'document', docName: 'notes/one.md', size: 1, modified: '' },
      { kind: 'document', docName: 'notes/two.md', size: 1, modified: '' },
    ] as const;
    const targets = selectedTreePathsToDeleteTargets(
      ['notes/', 'notes/one.md', '.ok/agents.md'],
      documents,
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ kind: 'folder', path: 'notes' });
  });

  test('returns the exact document, folder, and asset sets for tab cleanup', () => {
    const documents = [
      { kind: 'document', docName: 'notes/one.md', size: 1, modified: '' },
      {
        kind: 'asset',
        path: 'notes/image.png',
        assetExt: '.png',
        mediaKind: null,
        size: 1,
        modified: '',
      },
    ] as const;
    const targets = selectedTreePathsToDeleteTargets(['notes/'], documents);
    const closed = collectTabsToCloseForDelete(targets, documents, ['notes/']);
    expect([...closed.docNames]).toEqual(['notes/one.md']);
    expect([...closed.assetPaths]).toEqual(['notes/image.png']);
    expect([...closed.folderPaths]).toEqual(['notes']);
  });
});
