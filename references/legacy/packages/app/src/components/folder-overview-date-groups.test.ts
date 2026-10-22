import { describe, expect, test } from 'bun:test';
import { groupFolderDocumentsByModified } from './folder-overview-date-groups';

describe('groupFolderDocumentsByModified', () => {
  test('groups recent documents before month buckets while preserving entry order', () => {
    const entries = [
      {
        kind: 'file' as const,
        path: 'a',
        name: 'a',
        title: 'A',
        size: 1,
        modified: '2026-08-09T00:00:00Z',
      },
      {
        kind: 'file' as const,
        path: 'b',
        name: 'b',
        title: 'B',
        size: 1,
        modified: '2026-07-20T00:00:00Z',
      },
      {
        kind: 'file' as const,
        path: 'c',
        name: 'c',
        title: 'C',
        size: 1,
        modified: '2026-05-20T00:00:00Z',
      },
      { kind: 'file' as const, path: 'd', name: 'd', title: 'D', size: 1, modified: '' },
    ];

    const groups = groupFolderDocumentsByModified(entries, new Date('2026-08-10T00:00:00Z'));

    expect(groups.map((group) => group.key)).toEqual([
      'past-7-days',
      'past-30-days',
      'month:2026-05',
      'undated',
    ]);
    expect(groups[0]?.entries.map((entry) => entry.path)).toEqual(['a']);
  });
});
