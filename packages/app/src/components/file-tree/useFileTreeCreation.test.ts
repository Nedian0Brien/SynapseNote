import { describe, expect, test } from 'bun:test';
import { createOptimisticFileTreeEntry } from './useFileTreeCreation';

describe('createOptimisticFileTreeEntry', () => {
  test('preserves the server-created document path and extension for the optimistic row', () => {
    expect(
      createOptimisticFileTreeEntry(
        'file',
        'notes/guide',
        'notes/guide.mdx',
        '2026-08-01T00:00:00.000Z',
      ),
    ).toEqual({
      kind: 'document',
      docName: 'notes/guide',
      docExt: '.mdx',
      modified: '2026-08-01T00:00:00.000Z',
      size: 0,
    });
  });

  test('uses the server-created folder path for a folder row', () => {
    expect(
      createOptimisticFileTreeEntry(
        'folder',
        'notes/archive',
        'notes/archive/',
        '2026-08-01T00:00:00.000Z',
      ),
    ).toEqual({
      kind: 'folder',
      path: 'notes/archive',
      modified: '2026-08-01T00:00:00.000Z',
      size: 0,
    });
  });
});
